<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin');

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// ─── GET /api/form-candidates/{id}/resume — скачать резюме ──────────────────
$action = $GLOBALS['form_candidate_action'] ?? '';
if ($method === 'GET' && $action === 'resume') {
    $id   = (int)($GLOBALS['form_candidate_id'] ?? 0);
    $stmt = $db->prepare("SELECT resume_path, resume_name FROM form_candidates WHERE id = ?");
    $stmt->execute([$id]);
    $row  = $stmt->fetch();
    if (!$row || !$row['resume_path']) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден']); exit; }
    $filePath = __DIR__ . '/../uploads/' . $row['resume_path'];
    if (!file_exists($filePath)) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден на диске']); exit; }
    $mime = mime_content_type($filePath) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . rawurlencode($row['resume_name']) . '"');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
}

// ─── GET /api/form-candidates — список ───────────────────────────────────────
if ($method === 'GET') {
    $stmt = $db->query("SELECT * FROM form_candidates ORDER BY created_at DESC");
    echo json_encode(['success' => true, 'candidates' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $id = (int)($GLOBALS['form_candidate_id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $db->prepare("DELETE FROM form_candidates WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не поддерживается'], JSON_UNESCAPED_UNICODE);
