<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data         = json_decode(file_get_contents('php://input'), true) ?? [];
$organization = trim($data['organization'] ?? '');
$contact      = trim($data['contact']      ?? '');
$email        = trim($data['email']        ?? '');
$phone        = trim($data['phone']        ?? '');
$message      = trim($data['message']      ?? '');
$consent      = !empty($data['consent']);

if ($email === '' || $message === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Электронная почта и сообщение обязательны'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Некорректный адрес электронной почты'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$consent) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Необходимо согласие на обработку персональных данных'], JSON_UNESCAPED_UNICODE);
    exit;
}

$smtpHost   = $_ENV['MAIL_SMTP_HOST']   ?? 'smtp.yandex.ru';
$smtpPort   = (int)($_ENV['MAIL_SMTP_PORT'] ?? 465);
$smtpUser   = $_ENV['MAIL_SMTP_USER']   ?? '';
$smtpPass   = $_ENV['MAIL_SMTP_PASS']   ?? '';
$fromEmail  = $_ENV['MAIL_FROM']        ?? $smtpUser;
$fromName   = $_ENV['MAIL_FROM_NAME']   ?? 'МобилСервис';
$toEmail    = $_ENV['MAIL_TO']          ?? 'ms@r72.ru';

$bodyLines = [
    "<h2>Новая заявка с сайта МобилСервис</h2>",
    "<table cellpadding='6' style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px'>",
];

if ($organization !== '') {
    $bodyLines[] = "<tr><td><b>Организация:</b></td><td>" . htmlspecialchars($organization) . "</td></tr>";
}
if ($contact !== '') {
    $bodyLines[] = "<tr><td><b>Контактное лицо:</b></td><td>" . htmlspecialchars($contact) . "</td></tr>";
}
$bodyLines[] = "<tr><td><b>E-mail:</b></td><td>" . htmlspecialchars($email) . "</td></tr>";
if ($phone !== '') {
    $bodyLines[] = "<tr><td><b>Телефон:</b></td><td>" . htmlspecialchars($phone) . "</td></tr>";
}
$bodyLines[] = "<tr><td valign='top'><b>Сообщение:</b></td><td>" . nl2br(htmlspecialchars($message)) . "</td></tr>";
$bodyLines[] = "</table>";

$htmlBody = implode("\n", $bodyLines);

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host        = $smtpHost;
    $mail->SMTPAuth    = true;
    $mail->Username    = $smtpUser;
    $mail->Password    = $smtpPass;
    $mail->SMTPSecure  = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port        = $smtpPort;
    $mail->CharSet     = 'UTF-8';

    $mail->setFrom($fromEmail, $fromName);
    $mail->addAddress($toEmail);
    $mail->addReplyTo($email, $contact ?: $email);

    $mail->isHTML(true);
    $mail->Subject = 'Обратная связь с сайта' . ($organization ? ': ' . $organization : '');
    $mail->Body    = $htmlBody;
    $mail->AltBody = strip_tags(str_replace(['</td>', '<br>'], [' ', "\n"], $htmlBody));

    $mail->send();

    echo json_encode(['success' => true, 'message' => 'Сообщение успешно отправлено'], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Ошибка отправки письма'], JSON_UNESCAPED_UNICODE);
}