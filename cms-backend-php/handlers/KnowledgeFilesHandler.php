<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token  = Auth::require();
$role   = $token->role ?? '';
$uid    = (int)($token->uid ?? 0);

// Только admin и employee
if (!in_array($role, ['admin', 'employee'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Нет доступа'], JSON_UNESCAPED_UNICODE);
    exit;
}

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$subId  = (int)($GLOBALS['knowledge_file_id'] ?? 0);
$action = $GLOBALS['knowledge_action'] ?? '';
$dir    = '/var/www/html/uploads/knowledge/';

// ─── GET /api/knowledge/files/{id}/download ────────────────────────────────
if ($method === 'GET' && $subId && $action === 'download') {
    $stmt = $db->prepare("SELECT filename, original_name, file_type FROM knowledge_files WHERE id = ?");
    $stmt->execute([$subId]);
    $f = $stmt->fetch();
    if (!$f) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден'],JSON_UNESCAPED_UNICODE); exit; }

    $path = $dir . $f['filename'];
    if (!file_exists($path)) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл отсутствует на диске'],JSON_UNESCAPED_UNICODE); exit; }

    header('Content-Type: ' . ($f['file_type'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . rawurlencode($f['original_name']) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private');
    readfile($path);
    exit;
}

// ─── GET /api/knowledge/files ──────────────────────────────────────────────
if ($method === 'GET') {
    // Файлы из БД
    $stmt = $db->query("SELECT kf.*, u.full_name AS uploader FROM knowledge_files kf LEFT JOIN users u ON u.id = kf.uploaded_by ORDER BY kf.created_at DESC");
    $dbFiles = $stmt->fetchAll();
    $dbNames = array_column($dbFiles, 'filename');

    // Файлы напрямую в папке, которых нет в БД
    $extra = [];
    if (is_dir($dir)) {
        foreach (scandir($dir) as $fname) {
            if ($fname === '.' || $fname === '..') continue;
            if (in_array($fname, $dbNames, true)) continue;
            $fpath = $dir . $fname;
            $extra[] = [
                'id'            => null,
                'title'         => $fname,
                'description'   => null,
                'filename'      => $fname,
                'original_name' => $fname,
                'file_size'     => filesize($fpath),
                'file_type'     => mime_content_type($fpath),
                'uploaded_by'   => null,
                'uploader'      => null,
                'created_at'    => date('Y-m-d H:i:s', filemtime($fpath)),
                'folder_only'   => true,
            ];
        }
    }

    $all = array_merge($dbFiles, $extra);
    echo json_encode(['success' => true, 'files' => $all], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── POST /api/knowledge/files ─────────────────────────────────────────────
if ($method === 'POST') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Файл не передан'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $maxSize = 50 * 1024 * 1024; // 50 МБ
    if ($_FILES['file']['size'] > $maxSize) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Файл слишком большой (максимум 50 МБ)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!is_dir($dir)) mkdir($dir, 0775, true);

    $orig  = $_FILES['file']['name'];
    $ext   = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    $safe  = preg_replace('/[^a-z0-9_\-\.]/i', '_', pathinfo($orig, PATHINFO_FILENAME));
    $fname = $safe . '_' . uniqid('', true) . ($ext ? ".$ext" : '');

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $dir . $fname)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Ошибка сохранения файла'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mime     = $finfo->file($dir . $fname);
    $title    = trim($_POST['title'] ?? '') ?: $orig;
    $desc     = trim($_POST['description'] ?? '');

    $ins = $db->prepare("INSERT INTO knowledge_files (title, description, filename, original_name, file_size, file_type, uploaded_by) VALUES (?,?,?,?,?,?,?)");
    $ins->execute([$title, $desc, $fname, $orig, $_FILES['file']['size'], $mime, $uid]);

    $get = $db->prepare("SELECT kf.*, u.full_name AS uploader FROM knowledge_files kf LEFT JOIN users u ON u.id = kf.uploaded_by WHERE kf.id = ?");
    $get->execute([$db->lastInsertId()]);
    echo json_encode(['success' => true, 'file' => $get->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/knowledge/files/{id} ─────────────────────────────────────
if ($method === 'DELETE') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }
    if (!$subId) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'ID не указан'],JSON_UNESCAPED_UNICODE); exit; }

    $stmt = $db->prepare("SELECT filename FROM knowledge_files WHERE id = ?");
    $stmt->execute([$subId]);
    $f = $stmt->fetch();
    if (!$f) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден'],JSON_UNESCAPED_UNICODE); exit; }

    $fpath = $dir . $f['filename'];
    if (file_exists($fpath)) @unlink($fpath);

    $db->prepare("DELETE FROM knowledge_files WHERE id = ?")->execute([$subId]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/knowledge/files?folder_file=filename ─────────────────────
if ($method === 'DELETE' && !$subId) {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $fn   = basename($data['filename'] ?? '');
    if (!$fn) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Имя файла не указано'],JSON_UNESCAPED_UNICODE); exit; }
    $fpath = $dir . $fn;
    if (file_exists($fpath)) @unlink($fpath);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
