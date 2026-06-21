<?php
class UploadHandler {
    private $upload_dir;
    private $max_size;
    private $allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

    public function __construct() {
        $this->upload_dir = $_ENV['UPLOAD_DIR'] ?? './uploads';
        $this->max_size = (int)($_ENV['MAX_FILE_SIZE'] ?? 5242880);

        if (!file_exists($this->upload_dir)) {
            mkdir($this->upload_dir, 0755, true);
        }
    }

    public function handleUpload($file, $folder = 'uploads') {
        // Проверка ошибок загрузки
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return ['success' => false, 'message' => 'Ошибка загрузки файла'];
        }

        // Проверка размера
        if ($file['size'] > $this->max_size) {
            return ['success' => false, 'message' => 'Файл слишком большой'];
        }

        // Проверка типа
        if (!in_array($file['type'], $this->allowed_types)) {
            return ['success' => false, 'message' => 'Недопустимый тип файла'];
        }

        // Генерация уникального имени
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = uniqid() . '_' . time() . '.' . $ext;
        $folder_path = $this->upload_dir . '/' . $folder;

        if (!file_exists($folder_path)) {
            mkdir($folder_path, 0755, true);
        }

        $destination = $folder_path . '/' . $filename;

        if (move_uploaded_file($file['tmp_name'], $destination)) {
            return [
                'success' => true,
                'filename' => $filename,
                'path' => $destination,
                'url' => '/uploads/' . $folder . '/' . $filename
            ];
        }

        return ['success' => false, 'message' => 'Не удалось сохранить файл'];
    }

    public function deleteFile($path) {
        if (file_exists($path)) {
            return unlink($path);
        }
        return false;
    }
}
?>