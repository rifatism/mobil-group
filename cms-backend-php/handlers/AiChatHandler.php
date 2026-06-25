<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data    = json_decode(file_get_contents('php://input'), true) ?? [];
$message = trim($data['message'] ?? '');
$history = is_array($data['history'] ?? null) ? $data['history'] : [];
$vacancy = is_array($data['vacancy'] ?? null) ? $data['vacancy'] : [];

if ($message === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Сообщение не может быть пустым'], JSON_UNESCAPED_UNICODE);
    exit;
}

$apiKey = $_ENV['GROQ_API_KEY'] ?? '';
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Groq API ключ не настроен'], JSON_UNESCAPED_UNICODE);
    exit;
}

$vacancyTitle = trim($vacancy['title']        ?? 'не указана');
$vacancyDept  = trim($vacancy['department']   ?? '');
$vacancyDesc  = trim($vacancy['description']  ?? '');
$vacancyReq   = trim($vacancy['requirements'] ?? '');

$systemPrompt = <<<PROMPT
Ты — дружелюбный HR-ассистент компании МобилСервис (Тюмень).
Компания с 1998 года занимается GPS/ГЛОНАСС мониторингом транспорта, тахографией, видеоаналитикой, спутниковой связью Iridium и VSAT. В команде 30 специалистов.

Кандидат откликается на вакансию: {$vacancyTitle}
Отдел: {$vacancyDept}
Описание вакансии: {$vacancyDesc}
Требования: {$vacancyReq}

Твоя задача — провести короткое первичное интервью. Узнай:
1. Имя кандидата
2. Релевантный опыт и ключевые навыки
3. Почему хочет работать именно в МобилСервис
4. Зарплатные ожидания (если сам упомянет)

Правила:
- Задавай по одному вопросу за раз, не перегружай кандидата
- Будь дружелюбным, профессиональным, позитивным
- Пиши только на русском языке
- После 3-5 обменов сообщениями, когда достаточно информации — вынеси решение

Когда примешь решение, добавь строго в САМЫЙ КОНЕЦ своего ответа (ПОСЛЕ обычного текста для кандидата) этот блок:
%%DECISION%%{"suitable":true,"name":"ИМЯ КАНДИДАТА","summary":"КРАТКОЕ РЕЗЮМЕ 1-2 ПРЕДЛОЖЕНИЯ"}%%END%%
или
%%DECISION%%{"suitable":false,"name":"ИМЯ КАНДИДАТА","summary":"КРАТКОЕ ОБЪЯСНЕНИЕ"}%%END%%

Если suitable=true: скажи кандидату что его данные переданы HR-менеджеру и с ним свяжутся в ближайшее время.
Если suitable=false: поблагодари за интерес, вежливо сообщи что кандидатура не совсем подходит, пожелай удачи.
Блок %%DECISION%%...%%END%% НИКОГДА не показывай кандидату — он только для внутренней обработки.
PROMPT;

// Собираем историю: role model → assistant (формат OpenAI)
$messages = [['role' => 'system', 'content' => $systemPrompt]];
foreach ($history as $msg) {
    $role = ($msg['role'] ?? '') === 'model' ? 'assistant' : 'user';
    $text = trim($msg['text'] ?? '');
    if ($text === '') continue;
    $messages[] = ['role' => $role, 'content' => $text];
}
$messages[] = ['role' => 'user', 'content' => $message];

$requestBody = [
    'model'       => 'llama-3.3-70b-versatile',
    'messages'    => $messages,
    'temperature' => 0.7,
    'max_tokens'  => 1024,
];

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($requestBody, JSON_UNESCAPED_UNICODE));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey,
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
$rawResponse = curl_exec($ch);
$httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($rawResponse === false || $httpCode !== 200) {
    $errDetail = '';
    if ($rawResponse) {
        $errData   = json_decode($rawResponse, true);
        $errDetail = $errData['error']['message'] ?? $rawResponse;
    }
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Ошибка Groq API: ' . $errDetail], JSON_UNESCAPED_UNICODE);
    exit;
}

$groqData = json_decode($rawResponse, true);
$aiText   = $groqData['choices'][0]['message']['content'] ?? '';

if ($aiText === '') {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Пустой ответ от Groq'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Ищем маркер решения
$approved = false;
$decision = null;

if (preg_match('/%%DECISION%%(.+?)%%END%%/s', $aiText, $matches)) {
    $decision = json_decode(trim($matches[1]), true);
    $aiText   = trim(str_replace($matches[0], '', $aiText));

    if (is_array($decision) && !empty($decision['suitable'])) {
        $approved = true;
        sendApprovedEmail($vacancy, $decision, $history, $message);
    }
}

echo json_encode([
    'success'  => true,
    'reply'    => $aiText,
    'approved' => $approved,
], JSON_UNESCAPED_UNICODE);

// ─── Отправка письма администратору ────────────────────────────────────────
function sendApprovedEmail(array $vacancy, array $decision, array $history, string $lastMsg): void
{
    $smtpHost  = $_ENV['MAIL_SMTP_HOST']   ?? 'smtp.mail.ru';
    $smtpPort  = (int)($_ENV['MAIL_SMTP_PORT'] ?? 465);
    $smtpUser  = $_ENV['MAIL_SMTP_USER']   ?? '';
    $smtpPass  = $_ENV['MAIL_SMTP_PASS']   ?? '';
    $fromEmail = $_ENV['MAIL_FROM']        ?? $smtpUser;
    $fromName  = $_ENV['MAIL_FROM_NAME']   ?? 'МобилСервис';
    $toEmail   = $_ENV['MAIL_TO_CAREER']   ?? 'ms@r72.ru';

    $candidateName = htmlspecialchars($decision['name']    ?? 'Кандидат');
    $summary       = htmlspecialchars($decision['summary'] ?? '');
    $vacancyTitle  = htmlspecialchars($vacancy['title']    ?? 'не указана');

    $rows = '';
    foreach ($history as $msg) {
        $label = ($msg['role'] ?? '') === 'model' ? '🤖 Ассистент' : '👤 Кандидат';
        $text  = nl2br(htmlspecialchars(trim($msg['text'] ?? '')));
        $bg    = ($msg['role'] ?? '') === 'model' ? '#f9f9f9' : '#ffffff';
        $rows .= "<tr style='background:{$bg}'><td valign='top' style='padding:8px 12px;color:#555;white-space:nowrap;border-bottom:1px solid #eee'><b>{$label}</b></td><td style='padding:8px 12px;border-bottom:1px solid #eee'>{$text}</td></tr>";
    }
    $lastText = nl2br(htmlspecialchars($lastMsg));
    $rows .= "<tr style='background:#fff'><td valign='top' style='padding:8px 12px;color:#555;white-space:nowrap;border-bottom:1px solid #eee'><b>👤 Кандидат</b></td><td style='padding:8px 12px;border-bottom:1px solid #eee'>{$lastText}</td></tr>";

    $htmlBody = "
<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto'>
  <div style='background:#1976d2;color:#fff;padding:24px 28px;border-radius:8px 8px 0 0'>
    <h2 style='margin:0 0 4px'>🤖 Рекомендован нейросетью</h2>
    <p style='margin:0;opacity:.8;font-size:14px'>AI HR-ассистент МобилСервис (Groq / Llama 3.3)</p>
  </div>
  <div style='background:#e8f0fe;padding:20px 28px;border-left:4px solid #1976d2'>
    <table cellpadding='0' cellspacing='0'>
      <tr><td style='padding:3px 12px 3px 0;color:#555;font-size:14px'>Кандидат:</td><td style='font-weight:bold;font-size:14px'>{$candidateName}</td></tr>
      <tr><td style='padding:3px 12px 3px 0;color:#555;font-size:14px'>Вакансия:</td><td style='font-weight:bold;font-size:14px'>{$vacancyTitle}</td></tr>
      <tr><td valign='top' style='padding:3px 12px 3px 0;color:#555;font-size:14px'>Вывод ИИ:</td><td style='font-size:14px'>{$summary}</td></tr>
    </table>
  </div>
  <div style='padding:24px 28px;background:#fff'>
    <h3 style='margin:0 0 16px;color:#333;font-size:15px'>Транскрипт диалога</h3>
    <table cellpadding='0' cellspacing='0' style='width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-size:14px'>
      {$rows}
    </table>
  </div>
  <div style='background:#f4f6f8;padding:14px 28px;border-radius:0 0 8px 8px;font-size:12px;color:#999'>
    Письмо сформировано автоматически AI HR-ассистентом МобилСервис
  </div>
</div>";

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $smtpHost;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtpUser;
        $mail->Password   = $smtpPass;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port       = $smtpPort;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($fromEmail, $fromName);
        $mail->addAddress($toEmail);

        $mail->isHTML(true);
        $mail->Subject = "[Рекомендован ИИ] {$candidateName} → {$vacancyTitle}";
        $mail->Body    = $htmlBody;
        $mail->AltBody = "Кандидат {$candidateName} рекомендован ИИ на вакансию «{$vacancyTitle}».\n\nВывод: {$decision['summary']}";

        $mail->send();
    } catch (Exception $e) {
        error_log('AiChat email error: ' . $e->getMessage());
    }
}
