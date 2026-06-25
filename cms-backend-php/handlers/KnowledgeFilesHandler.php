<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../helpers/NotificationHelper.php';

$token  = Auth::require();
$role   = $token->role ?? '';
$uid    = (int)($token->uid ?? 0);

if (!in_array($role, ['admin', 'employee'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Нет доступа'], JSON_UNESCAPED_UNICODE);
    exit;
}

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$subId  = (int)($GLOBALS['knowledge_file_id'] ?? 0);
$action = $GLOBALS['knowledge_action'] ?? '';
$base   = '/var/www/html/uploads/knowledge/';

// ─── Вспомогательная функция: очистка и разрешение пути ──────────────────────────────────────────
function kb_resolve(string $raw, string $base): ?string {
    $raw = trim($raw, '/');
    // Удаляем только переходы по директориям и нулевые байты
    $raw = preg_replace('#\.\.+#', '', $raw);
    $raw = preg_replace('#[\x00-\x1F\\\\]#', '', $raw);
    $raw = preg_replace('#/+#', '/', trim($raw, '/'));

    if ($raw === '') return '';

    $full     = $base . $raw;
    $realBase = realpath(rtrim($base, '/'));
    $real     = realpath($full);

    if (!$realBase) return null;
    if ($raw !== '' && !$real) return null; // не существует
    if ($real && strpos($real . '/', $realBase . '/') !== 0) return null;

    return $raw;
}

function kb_dir(string $base, string $path): string {
    return $base . ($path !== '' ? $path . '/' : '');
}

// ─── GET /api/knowledge/files/{id}/download ────────────────────────────────────
if ($method === 'GET' && $subId && $action === 'download') {
    $stmt = $db->prepare("SELECT filename, original_name, file_type, folder_path FROM knowledge_files WHERE id = ?");
    $stmt->execute([$subId]);
    $f = $stmt->fetch();
    if (!$f) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден'],JSON_UNESCAPED_UNICODE); exit; }

    $fpath = kb_dir($base, $f['folder_path']) . $f['filename'];
    if (!file_exists($fpath)) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл отсутствует на диске'],JSON_UNESCAPED_UNICODE); exit; }

    header('Content-Type: ' . ($f['file_type'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . rawurlencode($f['original_name']) . '"');
    header('Content-Length: ' . filesize($fpath));
    header('Cache-Control: private');
    readfile($fpath);
    exit;
}

// ─── FOLDER: create ───────────────────────────────────────────────────────────
if ($method === 'POST' && $action === 'folder_create') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $data   = json_decode(file_get_contents('php://input'), true) ?? [];
    $parent = kb_resolve(trim($data['path'] ?? ''), $base) ?? '';
    $name = trim($data['name'] ?? '');
    // Запрещаем только опасные символы: слэши, нулевые байты, точки в начале
    $name = preg_replace('#[/\\\\\x00-\x1F]#', '', $name);
    $name = preg_replace('#^\.+#', '', $name);
    $name = trim($name);

    if (!$name) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Укажите название папки'],JSON_UNESCAPED_UNICODE); exit; }

    $newPath = kb_dir($base, $parent) . $name;
    if (is_dir($newPath)) { http_response_code(409); echo json_encode(['success'=>false,'message'=>'Папка уже существует'],JSON_UNESCAPED_UNICODE); exit; }
    if (!mkdir($newPath, 0775, true)) { http_response_code(500); echo json_encode(['success'=>false,'message'=>'Ошибка создания папки'],JSON_UNESCAPED_UNICODE); exit; }

    echo json_encode(['success' => true, 'name' => $name], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── FOLDER: delete ───────────────────────────────────────────────────────────
if ($method === 'DELETE' && $action === 'folder_delete') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $folderPath = kb_resolve(trim($data['path'] ?? ''), $base);

    if ($folderPath === null || $folderPath === '') {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Неверный путь к папке'],JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Удаляем все записи БД по данному пути папки (точное совпадение или вложенные)
    $like = $db->quote($folderPath . '%');
    $db->exec("DELETE FROM knowledge_files WHERE folder_path = " . $db->quote($folderPath) . " OR folder_path LIKE " . $db->quote($folderPath . '/%'));

    // Рекурсивное удаление директории
    function kb_rmdir(string $dir): void {
        if (!is_dir($dir)) return;
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = $dir . '/' . $item;
            is_dir($path) ? kb_rmdir($path) : unlink($path);
        }
        rmdir($dir);
    }
    kb_rmdir(kb_dir($base, $folderPath));

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── GET /api/knowledge/files — список директории ─────────────────────────────────
if ($method === 'GET' && !$subId) {
    $rawPath = trim($_GET['path'] ?? '');
    $curPath = kb_resolve($rawPath, $base) ?? '';
    $targetDir = kb_dir($base, $curPath);

    // Подпапки
    $folders = [];
    if (is_dir($targetDir)) {
        foreach (scandir($targetDir) as $item) {
            if ($item[0] === '.') continue;
            if (!is_dir($targetDir . $item)) continue;
            $itemDir   = $targetDir . $item . '/';
            $fileCount = 0; $dirCount = 0;
            foreach (scandir($itemDir) as $sub) {
                if ($sub[0] === '.') continue;
                is_dir($itemDir . $sub) ? $dirCount++ : $fileCount++;
            }
            $folders[] = [
                'name'       => $item,
                'path'       => $curPath !== '' ? "$curPath/$item" : $item,
                'file_count' => $fileCount,
                'dir_count'  => $dirCount,
            ];
        }
    }

    // Файлы из БД для данной папки
    $stmt = $db->prepare("SELECT kf.*, u.full_name AS uploader FROM knowledge_files kf LEFT JOIN users u ON u.id = kf.uploaded_by WHERE kf.folder_path = ? ORDER BY kf.created_at DESC");
    $stmt->execute([$curPath]);
    $dbFiles  = $stmt->fetchAll();
    $dbNames  = array_column($dbFiles, 'filename');

    // Файлы на диске, отсутствующие в БД
    $extra = [];
    if (is_dir($targetDir)) {
        foreach (scandir($targetDir) as $fname) {
            if ($fname[0] === '.') continue;
            if (is_dir($targetDir . $fname)) continue;
            if (in_array($fname, $dbNames, true)) continue;
            $fpath = $targetDir . $fname;
            $extra[] = [
                'id'            => null,
                'folder_path'   => $curPath,
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

    echo json_encode([
        'success' => true,
        'path'    => $curPath,
        'folders' => $folders,
        'files'   => array_merge($dbFiles, $extra),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── POST /api/knowledge/files — загрузка файла ───────────────────────────────────────
if ($method === 'POST' && !$action) {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Файл не передан'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($_FILES['file']['size'] > 50 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Файл слишком большой (максимум 50 МБ)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $rawPath   = trim($_POST['path'] ?? '');
    $curPath   = kb_resolve($rawPath, $base) ?? '';
    $targetDir = kb_dir($base, $curPath);
    if (!is_dir($targetDir)) mkdir($targetDir, 0775, true);

    $orig  = $_FILES['file']['name'];
    $ext   = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    $safe  = preg_replace('/[^a-z0-9_\-]/i', '_', pathinfo($orig, PATHINFO_FILENAME));
    $fname = $safe . '_' . uniqid('', true) . ($ext ? ".$ext" : '');

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetDir . $fname)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Ошибка сохранения файла'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($targetDir . $fname);
    $title = trim($_POST['title'] ?? '') ?: $orig;
    $desc  = trim($_POST['description'] ?? '');

    $ins = $db->prepare("INSERT INTO knowledge_files (folder_path, title, description, filename, original_name, file_size, file_type, uploaded_by) VALUES (?,?,?,?,?,?,?,?)");
    $ins->execute([$curPath, $title, $desc, $fname, $orig, $_FILES['file']['size'], $mime, $uid]);

    $newId = $db->lastInsertId();
    $get = $db->prepare("SELECT kf.*, u.full_name AS uploader FROM knowledge_files kf LEFT JOIN users u ON u.id = kf.uploaded_by WHERE kf.id = ?");
    $get->execute([$newId]);

    // Уведомить всех сотрудников о новом файле
    $folderNote = $curPath ? " (папка: $curPath)" : '';
    notifyRole($db, 'employee', 'file_uploaded', 'Новый файл в базе знаний', 'Добавлен файл: ' . "\u{AB}" . $title . "\u{BB}" . $folderNote, 'knowledge.html', $uid);

    echo json_encode(['success' => true, 'file' => $get->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/knowledge/files/{id} — удалить файл ───────────────────────────
if ($method === 'DELETE' && $subId) {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $stmt = $db->prepare("SELECT filename, folder_path FROM knowledge_files WHERE id = ?");
    $stmt->execute([$subId]);
    $f = $stmt->fetch();
    if (!$f) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Файл не найден'],JSON_UNESCAPED_UNICODE); exit; }

    $fpath = kb_dir($base, $f['folder_path']) . $f['filename'];
    if (file_exists($fpath)) @unlink($fpath);

    $db->prepare("DELETE FROM knowledge_files WHERE id = ?")->execute([$subId]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE без id — удалить файл только из папки ──────────────────────────────
if ($method === 'DELETE' && !$subId && $action !== 'folder_delete') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $fn   = basename($data['filename'] ?? '');
    $fp   = kb_resolve(trim($data['folder_path'] ?? ''), $base) ?? '';
    if (!$fn) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Имя файла не указано'],JSON_UNESCAPED_UNICODE); exit; }
    $fpath = kb_dir($base, $fp) . $fn;
    if (file_exists($fpath)) @unlink($fpath);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
