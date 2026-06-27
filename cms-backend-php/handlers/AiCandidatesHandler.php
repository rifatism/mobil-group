<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin');

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $db->query("SELECT * FROM ai_candidates ORDER BY created_at DESC");
    echo json_encode(['success' => true, 'candidates' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $id = (int)($GLOBALS['ai_candidate_id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $db->prepare("DELETE FROM ai_candidates WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не поддерживается'], JSON_UNESCAPED_UNICODE);
