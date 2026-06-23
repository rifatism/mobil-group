<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true) ?? [];
$fullname = trim($data['fullname'] ?? '');
$email    = trim($data['email']    ?? '');
$phone    = trim($data['phone']    ?? '');
$position = trim($data['position'] ?? '');
$message  = trim($data['message']  ?? '');
$consent  = !empty($data['consent']);

if ($fullname === '' || $email === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'ФИО и электронная почта обязательны'], JSON_UNESCAPED_UNICODE);
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

$smtpHost  = $_ENV['MAIL_SMTP_HOST']   ?? 'smtp.mail.ru';
$smtpPort  = (int)($_ENV['MAIL_SMTP_PORT'] ?? 465);
$smtpUser  = $_ENV['MAIL_SMTP_USER']   ?? '';
$smtpPass  = $_ENV['MAIL_SMTP_PASS']   ?? '';
$fromEmail = $_ENV['MAIL_FROM']        ?? $smtpUser;
$fromName  = $_ENV['MAIL_FROM_NAME']   ?? 'МобилСервис';
$toEmail   = $_ENV['MAIL_TO']          ?? 'ms@r72.ru';

$rows = [
    "<h2>Отклик на вакансию — МобилСервис</h2>",
    "<table cellpadding='6' style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px'>",
    "<tr><td><b>ФИО:</b></td><td>" . htmlspecialchars($fullname) . "</td></tr>",
    "<tr><td><b>E-mail:</b></td><td>" . htmlspecialchars($email) . "</td></tr>",
];
if ($phone !== '')    $rows[] = "<tr><td><b>Телефон:</b></td><td>" . htmlspecialchars($phone)    . "</td></tr>";
if ($position !== '') $rows[] = "<tr><td><b>Вакансия:</b></td><td>" . htmlspecialchars($position) . "</td></tr>";
if ($message !== '')  $rows[] = "<tr><td valign='top'><b>Сопроводительное письмо:</b></td><td>" . nl2br(htmlspecialchars($message)) . "</td></tr>";
$rows[] = "</table>";

$htmlBody = implode("\n", $rows);

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
    $mail->addReplyTo($email, $fullname);

    $mail->isHTML(true);
    $mail->Subject = 'Отклик на вакансию' . ($position ? ': ' . $position : '') . ' — ' . $fullname;
    $mail->Body    = $htmlBody;
    $mail->AltBody = strip_tags(str_replace(['</td>', '<br>'], [' ', "\n"], $htmlBody));

    $mail->send();
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Ошибка отправки письма'], JSON_UNESCAPED_UNICODE);
}