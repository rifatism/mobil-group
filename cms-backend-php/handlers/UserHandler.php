<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin');

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// GET /api/users — список всех пользователей (кроме паролей)
if ($method === 'GET') {
    $stmt = $db->query("SELECT id, username, full_name, first_name, last_name, patronymic, email, phone, description, client_type, company_name, role, active, created_at FROM users ORDER BY role, username");
    echo json_encode(['success' => true, 'users' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

// PUT /api/users/{id} — редактировать профиль пользователя (только admin)
if ($method === 'PUT') {
    $id = (int)($GLOBALS['route_id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $check = $db->prepare("SELECT id, role FROM users WHERE id = ?");
    $check->execute([$id]);
    $target = $check->fetch();
    if (!$target) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($target['role'] === 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Нельзя редактировать администратора'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data        = json_decode(file_get_contents('php://input'), true) ?? [];
    $first_name  = trim($data['first_name']  ?? '');
    $last_name   = trim($data['last_name']   ?? '');
    $patronymic  = trim($data['patronymic']  ?? '');
    $phone       = trim($data['phone']       ?? '');
    $description = trim($data['description'] ?? '');
    $full_name   = trim("$last_name $first_name $patronymic");

    $allowed_types = ['individual', 'ip', 'selfemployed', 'company'];
    $client_type   = in_array($data['client_type'] ?? '', $allowed_types, true)
                     ? $data['client_type'] : 'individual';
    $company_name  = in_array($client_type, ['company', 'ip'], true)
                     ? trim($data['company_name'] ?? '') : '';

    $stmt = $db->prepare(
        "UPDATE users SET
            first_name   = ?, last_name  = ?, patronymic   = ?, full_name    = ?,
            phone        = ?, description= ?, client_type  = ?, company_name = ?
         WHERE id = ?"
    );
    $stmt->execute([
        $first_name, $last_name, $patronymic, $full_name,
        $phone, $description, $client_type, $company_name,
        $id,
    ]);

    $get = $db->prepare("SELECT id, username, full_name, first_name, last_name, patronymic, email, phone, description, client_type, company_name, role, active, created_at FROM users WHERE id = ?");
    $get->execute([$id]);
    echo json_encode(['success' => true, 'user' => $get->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

// POST /api/users — создать сотрудника или клиента
if ($method === 'POST') {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $username  = trim($data['username']  ?? '');
    $email     = trim($data['email']     ?? '');
    $password  = trim($data['password']  ?? '');
    $role      = trim($data['role']      ?? '');
    $full_name = trim($data['full_name'] ?? '');
    $phone     = trim($data['phone']     ?? '');

    if (!$username || !$email || !$password || !$role) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Логин, email, пароль и роль обязательны'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!in_array($role, ['employee', 'client'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Роль должна быть employee или client'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Некорректный email'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Проверка уникальности
    $check = $db->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
    $check->execute([$username, $email]);
    if ($check->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Пользователь с таким логином или email уже существует'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $ins  = $db->prepare("INSERT INTO users (username, full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)");
    $ins->execute([$username, $full_name, $email, $phone, $hash, $role]);

    echo json_encode([
        'success' => true,
        'message' => 'Пользователь создан',
        'user'    => ['id' => (int)$db->lastInsertId(), 'username' => $username, 'email' => $email, 'role' => $role],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// DELETE /api/users/{id}
if ($method === 'DELETE') {
    $id = (int)($GLOBALS['route_id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $user = $db->prepare("SELECT role FROM users WHERE id = ?");
    $user->execute([$id]);
    $target = $user->fetch();

    if (!$target) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($target['role'] === 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Нельзя удалить администратора'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $db->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Пользователь удалён'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);