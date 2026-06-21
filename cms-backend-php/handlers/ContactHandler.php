<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/EmailSender.php';
require_once __DIR__ . '/TelegramSender.php';

class ContactHandler {
    private $errors = [];
    private $data = [];
    private $uploaded_file = null;

    public function __construct() {
        $this->parseInput();
    }

    public function handle(): void {
        // Проверка метода
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->sendResponse(405, false, 'Метод не разрешён');
            return;
        }

        // Валидация
        if (!$this->validate()) {
            $this->sendResponse(400, false, 'Ошибка валидации', $this->errors);
            return;
        }

        // Rate limiting
        if (!$this->checkRateLimit()) {
            $this->sendResponse(429, false, 'Слишком много запросов. Попробуйте позже.');
            return;
        }

        // Обработка файла
        if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
            $this->uploaded_file = $this->handleFileUpload($_FILES['photo']);
            if (!$this->uploaded_file) {
                $this->sendResponse(400, false, 'Ошибка загрузки файла');
                return;
            }
        }

        // Отправка
        $results = [];
        
        // Email
        $email_sender = new EmailSender();
        $email_data = array_merge($this->data, [
            'file_path' => $this->uploaded_file['path'] ?? null,
            'file_name' => $this->uploaded_file['name'] ?? null
        ]);
        $results['email'] = $email_sender->sendContactForm($email_data);

        // Telegram
        $telegram_sender = new TelegramSender();
        $results['telegram'] = $telegram_sender->sendContactForm($this->data);

        // Отправка файла в Telegram
        if ($this->uploaded_file) {
            $telegram_sender->sendFile(
                $this->uploaded_file['path'],
                $this->uploaded_file['name'],
                " Файл от {$this->data['full_name']}"
            );
        }

        // Логируем
        $this->logSubmission();

        // Успех
        $this->sendResponse(200, true, 'Заявка успешно отправлена! Мы свяжемся с вами в ближайшее время.');
    }

    private function parseInput(): void {
        // JSON или FormData
        $content_type = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (strpos($content_type, 'application/json') !== false) {
            $json = json_decode(file_get_contents('php://input'), true);
            $this->data = $json ?? [];
        } else {
            $this->data = $_POST;
        }
    }

    private function validate(): bool {
        // ФИО
        $full_name = trim($this->data['full_name'] ?? '');
        if (empty($full_name)) {
            $this->errors[] = 'ФИО обязательно';
        } elseif (!preg_match('/^[a-zA-Zа-яА-ЯёЁ\s\-]{2,100}$/u', $full_name)) {
            $this->errors[] = 'ФИО должно содержать только буквы (2-100 символов)';
        }
        $this->data['full_name'] = $full_name;

        // Телефон
        $phone = trim($this->data['phone'] ?? '');
        if (empty($phone)) {
            $this->errors[] = 'Телефон обязателен';
        } elseif (!preg_match('/^\+7\d{10}$/', $phone)) {
            $this->errors[] = 'Телефон должен быть в формате +7XXXXXXXXXX';
        }
        $this->data['phone'] = $phone;

        // Email
        $email = trim($this->data['email'] ?? '');
        if (empty($email)) {
            $this->errors[] = 'Email обязателен';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->errors[] = 'Некорректный email';
        }
        $this->data['email'] = $email;

        // Дата связи
        $contact_date = $this->data['contact_date'] ?? '';
        if (!empty($contact_date)) {
            $date = new DateTime($contact_date);
            $today = new DateTime();
            $today->setTime(0, 0, 0);
            if ($date < $today) {
                $this->errors[] = 'Дата не может быть в прошлом';
            }
        }
        $this->data['contact_date'] = $contact_date ?: 'Не указана';

        // Сообщение
        $message = trim($this->data['message'] ?? '');
        $max_length = (int)($_ENV['MAX_MESSAGE_LENGTH'] ?? 2000);
        if (empty($message)) {
            $this->errors[] = 'Сообщение обязательно';
        } elseif (mb_strlen($message) > $max_length) {
            $this->errors[] = "Сообщение не более $max_length символов";
        }
        $this->data['message'] = $message;

        return empty($this->errors);
    }

    private function handleFileUpload($file): ?array {
        $allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        $max_size = 5 * 1024 * 1024; // 5MB

        if (!in_array($file['type'], $allowed_types)) {
            $this->errors[] = 'Недопустимый тип файла';
            return null;
        }

        if ($file['size'] > $max_size) {
            $this->errors[] = 'Файл слишком большой (макс. 5MB)';
            return null;
        }

        $upload_dir = __DIR__ . '/../uploads/contacts/';
        if (!file_exists($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }

        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = 'contact_' . time() . '_' . uniqid() . '.' . $ext;
        $destination = $upload_dir . $filename;

        if (move_uploaded_file($file['tmp_name'], $destination)) {
            return [
                'path' => $destination,
                'name' => $file['name']
            ];
        }

        return null;
    }

    private function checkRateLimit(): bool {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $limit_file = sys_get_temp_dir() . '/contact_rate_' . md5($ip);
        $minutes = (int)($_ENV['RATE_LIMIT_MINUTES'] ?? 5);
        $max_requests = (int)($_ENV['RATE_LIMIT_MAX_REQUESTS'] ?? 3);

        $requests = file_exists($limit_file) 
            ? json_decode(file_get_contents($limit_file), true) 
            : [];

        // Удаляем старые записи
        $cutoff = time() - ($minutes * 60);
        $requests = array_filter($requests, fn($ts) => $ts > $cutoff);

        if (count($requests) >= $max_requests) {
            return false;
        }

        $requests[] = time();
        file_put_contents($limit_file, json_encode($requests));
        return true;
    }

    private function logSubmission(): void {
        $log_file = __DIR__ . '/../logs/contacts.log';
        $dir = dirname($log_file);
        if (!file_exists($dir)) {
            mkdir($dir, 0755, true);
        }

        $log_entry = date('Y-m-d H:i:s') . ' | ' . 
                     ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ' | ' .
                     $this->data['full_name'] . ' | ' .
                     $this->data['email'] . ' | ' .
                     $this->data['phone'] . PHP_EOL;

        file_put_contents($log_file, $log_entry, FILE_APPEND);
    }

    private function sendResponse(int $code, bool $success, string $message, $extra = null): void {
        http_response_code($code);
        $response = [
            'success' => $success,
            'message' => $message
        ];
        if ($extra !== null) {
            $response['errors'] = $extra;
        }
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit();
    }
}

// Запуск
$handler = new ContactHandler();
$handler->handle();
?>