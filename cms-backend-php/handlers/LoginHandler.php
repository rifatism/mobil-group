<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim($data['username'] ?? '');
$password = trim($data['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Логин и пароль обязательны'], JSON_UNESCAPED_UNICODE);
    exit;
}

$db   = (new Database())->getConnection();
$stmt = $db->prepare("SELECT * FROM users WHERE (username = :u OR email = :u) AND active = 1 LIMIT 1");
$stmt->bindValue(':u', $username);
$stmt->execute();
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Неверный логин или пароль'], JSON_UNESCAPED_UNICODE);
    exit;
}

$token = Auth::generateToken($user);
$perms = ($user['permissions'] ?? null) ? (json_decode($user['permissions'], true) ?? null) : null;

echo json_encode([
    'success' => true,
    'token'   => $token,
    'user'    => [
        'id'          => $user['id'],
        'username'    => $user['username'],
        'full_name'   => $user['full_name'] ?? '',
        'email'       => $user['email'],
        'role'        => $user['role'],
        'permissions' => $perms,
    ],
], JSON_UNESCAPED_UNICODE);