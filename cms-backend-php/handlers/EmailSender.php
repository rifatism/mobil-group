<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

class EmailSender {
    private $mailer;

    public function __construct() {
        $this->mailer = new PHPMailer(true);
        
        // SMTP настройки
        $this->mailer->isSMTP();
        $this->mailer->Host = $_ENV['SMTP_HOST'];
        $this->mailer->SMTPAuth = true;
        $this->mailer->Username = $_ENV['SMTP_USER'];
        $this->mailer->Password = $_ENV['SMTP_PASS'];
        $this->mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $this->mailer->Port = (int)$_ENV['SMTP_PORT'];
        $this->mailer->CharSet = 'UTF-8';

        // От кого
        $this->mailer->setFrom(
            $_ENV['SMTP_USER'], 
            $_ENV['SMTP_FROM_NAME']
        );
    }

    public function sendContactForm($data): array {
        try {
            $this->mailer->addAddress($_ENV['ADMIN_EMAIL']);
            $this->mailer->isHTML(true);
            $this->mailer->Subject = '📩 Новая заявка с сайта';
            $this->mailer->Body = $this->buildHtmlMessage($data);
            $this->mailer->AltBody = $this->buildTextMessage($data);

            // Прикрепление файла (если есть)
            if (!empty($data['file_path']) && file_exists($data['file_path'])) {
                $this->mailer->addAttachment(
                    $data['file_path'], 
                    $data['file_name']
                );
            }

            $this->mailer->send();
            return ['success' => true, 'message' => 'Email отправлен'];
        } catch (Exception $e) {
            return [
                'success' => false, 
                'message' => 'Ошибка Email: ' . $this->mailer->ErrorInfo
            ];
        }
    }

    private function buildHtmlMessage($data): string {
        $date = date('d.m.Y H:i');
        return "
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
                <h2 style='color: #4a6fa5;'>📩 Новая заявка с сайта</h2>
                <p style='color: #666; font-size: 12px;'>Дата: $date</p>
                <hr style='border: none; border-top: 1px solid #eee; margin: 20px 0;'>
                
                <table style='width: 100%; border-collapse: collapse;'>
                    <tr>
                        <td style='padding: 8px; font-weight: bold; width: 30%;'>👤 ФИО:</td>
                        <td style='padding: 8px;'>{$data['full_name']}</td>
                    </tr>
                    <tr>
                        <td style='padding: 8px; font-weight: bold;'> Телефон:</td>
                        <td style='padding: 8px;'>{$data['phone']}</td>
                    </tr>
                    <tr>
                        <td style='padding: 8px; font-weight: bold;'>✉️ Email:</td>
                        <td style='padding: 8px;'>{$data['email']}</td>
                    </tr>
                    <tr>
                        <td style='padding: 8px; font-weight: bold;'>📅 Дата связи:</td>
                        <td style='padding: 8px;'>{$data['contact_date']}</td>
                    </tr>
                </table>
                
                <div style='margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;'>
                    <strong>💬 Сообщение:</strong><br>
                    <p style='margin-top: 10px; white-space: pre-wrap;'>{$data['message']}</p>
                </div>
            </div>
        ";
    }

    private function buildTextMessage($data): string {
        return "Новая заявка с сайта\n\n" .
               "ФИО: {$data['full_name']}\n" .
               "Телефон: {$data['phone']}\n" .
               "Email: {$data['email']}\n" .
               "Дата связи: {$data['contact_date']}\n\n" .
               "Сообщение:\n{$data['message']}";
    }
}
?>