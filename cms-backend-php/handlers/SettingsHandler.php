<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin');

try {
    $db = (new Database())->getConnection();
    $db->exec("CREATE TABLE IF NOT EXISTS `settings` (
        `key`   VARCHAR(100) PRIMARY KEY,
        `value` VARCHAR(1000) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $stmt = $db->query("SELECT `key`, `value` FROM `settings`");
        $out  = [];
        foreach ($stmt->fetchAll() as $row) $out[$row['key']] = $row['value'];
        echo json_encode(['success' => true, 'settings' => $out], JSON_UNESCAPED_UNICODE);
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

if ($method === 'POST') {
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $key   = trim($data['key']   ?? '');
    $value = trim($data['value'] ?? '');

    if ($key === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Key не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    try {
        $stmt = $db->prepare("INSERT INTO `settings` (`key`, `value`) VALUES (?, ?)
                              ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $stmt->execute([$key, $value]);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
