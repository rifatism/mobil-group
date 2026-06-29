<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($GLOBALS['vacancy_id'] ?? 0);

if ($method === 'GET') {
    if ($id) {
        $stmt = $db->prepare("SELECT * FROM vacancies WHERE id = ? AND published = 1");
        $stmt->execute([$id]);
        $item = $stmt->fetch();
        if (!$item) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Вакансия не найдена'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode(['success' => true, 'vacancy' => $item], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $showAll = isset($_GET['all']) && $_GET['all'] === '1';
    if ($showAll) {
        $token = Auth::require();
        Auth::requireRole($token, 'admin', 'employee');
        Auth::requirePermission($token, 'vacancies', ['add']);
        $stmt = $db->query("SELECT * FROM vacancies ORDER BY created_at DESC");
    } else {
        $stmt = $db->query("SELECT * FROM vacancies WHERE published = 1 ORDER BY created_at DESC");
    }
    echo json_encode(['success' => true, 'vacancies' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $token = Auth::require();
    Auth::requireRole($token, 'admin', 'employee');
    Auth::requirePermission($token, 'vacancies', ['add']);

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($body['title'] ?? '');
    if (!$title) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Название обязательно'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $db->prepare("INSERT INTO vacancies (title, department, location, employment_type, description, requirements, salary, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $title,
        trim($body['department']       ?? ''),
        trim($body['location']         ?? 'Тюмень'),
        trim($body['employment_type']  ?? 'Полная занятость'),
        trim($body['description']      ?? ''),
        trim($body['requirements']     ?? ''),
        trim($body['salary']           ?? ''),
        (int)($body['published']       ?? 0),
    ]);
    $newId = $db->lastInsertId();
    $row   = $db->query("SELECT * FROM vacancies WHERE id = $newId")->fetch();
    echo json_encode(['success' => true, 'vacancy' => $row], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT' && $id) {
    $token = Auth::require();
    Auth::requireRole($token, 'admin', 'employee');
    Auth::requirePermission($token, 'vacancies', ['add']);

    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($body['title'] ?? '');
    if (!$title) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Название обязательно'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $db->prepare("UPDATE vacancies SET title=?, department=?, location=?, employment_type=?, description=?, requirements=?, salary=?, published=? WHERE id=?");
    $stmt->execute([
        $title,
        trim($body['department']       ?? ''),
        trim($body['location']         ?? 'Тюмень'),
        trim($body['employment_type']  ?? 'Полная занятость'),
        trim($body['description']      ?? ''),
        trim($body['requirements']     ?? ''),
        trim($body['salary']           ?? ''),
        (int)($body['published']       ?? 0),
        $id,
    ]);
    $row = $db->query("SELECT * FROM vacancies WHERE id = $id")->fetch();
    echo json_encode(['success' => true, 'vacancy' => $row], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE' && $id) {
    $token = Auth::require();
    Auth::requireRole($token, 'admin', 'employee');
    Auth::requirePermission($token, 'vacancies', ['add']);

    $db->prepare("DELETE FROM vacancies WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не поддерживается'], JSON_UNESCAPED_UNICODE);