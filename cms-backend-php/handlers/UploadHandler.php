<?php
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Файл не передан или ошибка загрузки'], JSON_UNESCAPED_UNICODE);
    exit;
}

$file    = $_FILES['file'];
$allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
$finfo   = new finfo(FILEINFO_MIME_TYPE);
$mime    = $finfo->file($file['tmp_name']);

if (!in_array($mime, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Допустимые форматы: JPEG, PNG, WebP, GIF'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Файл слишком большой (максимум 5 МБ)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ext  = match($mime) {
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
};
$name = 'news_' . uniqid('', true) . '.' . $ext;
$dir  = __DIR__ . '/../uploads/news/';

if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
}

if (!move_uploaded_file($file['tmp_name'], $dir . $name)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Ошибка сохранения файла'], JSON_UNESCAPED_UNICODE);
    exit;
}

$scheme  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host    = $_SERVER['HTTP_HOST'];
$url     = "$scheme://$host/backend/uploads/news/$name";

echo json_encode(['success' => true, 'url' => $url], JSON_UNESCAPED_UNICODE);