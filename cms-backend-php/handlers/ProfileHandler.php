<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
$db    = (new Database())->getConnection();

// GET /api/profile — данные текущего пользователя
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        "SELECT id, username, first_name, last_name, patronymic, full_name,
                email, phone, description, client_type, company_name, role, created_at
         FROM users WHERE id = ? LIMIT 1"
    );
    $stmt->execute([$token->uid]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'user' => $user], JSON_UNESCAPED_UNICODE);
    exit;
}

// PUT /api/profile — обновить профиль
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];

    $first_name   = trim($data['first_name']   ?? '');
    $last_name    = trim($data['last_name']    ?? '');
    $patronymic   = trim($data['patronymic']   ?? '');
    $phone        = trim($data['phone']        ?? '');
    $description  = trim($data['description']  ?? '');
    $client_type  = trim($data['client_type']  ?? 'individual');
    $company_name = trim($data['company_name'] ?? '');

    if (!in_array($client_type, ['individual', 'company'], true)) {
        $client_type = 'individual';
    }
    if ($client_type === 'individual') $company_name = '';

    // Собираем full_name из частей
    $full_name = trim("$last_name $first_name $patronymic");

    $stmt = $db->prepare(
        "UPDATE users SET
            first_name   = ?,
            last_name    = ?,
            patronymic   = ?,
            full_name    = ?,
            phone        = ?,
            description  = ?,
            client_type  = ?,
            company_name = ?
         WHERE id = ?"
    );
    $stmt->execute([
        $first_name, $last_name, $patronymic, $full_name,
        $phone, $description, $client_type, $company_name,
        $token->uid
    ]);

    // Вернуть обновлённые данные
    $get = $db->prepare(
        "SELECT id, username, first_name, last_name, patronymic, full_name,
                email, phone, description, client_type, company_name, role
         FROM users WHERE id = ? LIMIT 1"
    );
    $get->execute([$token->uid]);
    $updated = $get->fetch();

    echo json_encode(['success' => true, 'user' => $updated], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);