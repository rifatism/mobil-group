<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
Auth::requireRole($token, 'admin', 'employee');

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($GLOBALS['route_id'] ?? 0);

// Миграция: добавить колонку permissions и поля профиля если не существуют
try { $db->exec("ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN first_name VARCHAR(80) DEFAULT ''"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN last_name  VARCHAR(80) DEFAULT ''"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN patronymic VARCHAR(80) DEFAULT ''"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN description TEXT NULL"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN client_type VARCHAR(30) DEFAULT 'individual'"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE users ADD COLUMN company_name VARCHAR(150) DEFAULT ''"); } catch (\Exception $e) {}

// Хелпер: права по умолчанию
function defaultPermissions(string $role): ?array {
    if ($role === 'employee') {
        return [
            'users'         => 'deny',
            'profile_edit'  => 'deny',
            'articles'      => 'deny',
            'vacancies'     => 'deny',
            'knowledge'     => 'deny',
            'projects'      => 'deny',
            'candidates'    => 'deny',
            'notifications' => 'deny',
            'reports'       => 'deny',
        ];
    }
    if ($role === 'client') {
        return ['dashboard' => 'geoscan'];
    }
    return null;
}

// Хелпер: декодировать permissions из строки JSON
function decodePerms(?string $raw): ?array {
    return $raw ? (json_decode($raw, true) ?? null) : null;
}

// Проверка прав для сотрудника (не admin)
if ($token->role === 'employee') {
    $perms = Auth::getPermissions($token);
    $usersLevel = $perms['users'] ?? 'deny';
    if ($usersLevel === 'deny') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Нет доступа к разделу пользователей'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Только просмотр — запрещаем запись
    if ($usersLevel === 'view' && in_array($method, ['POST', 'DELETE'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Нет прав на изменение пользователей'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // PATCH permissions — только admin
    if ($method === 'PATCH') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Изменение прав доступно только администратору'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// GET /api/users — список
if ($method === 'GET' && !$id) {
    $stmt = $db->query(
        "SELECT id, username, full_name, first_name, last_name, patronymic,
                email, phone, description, client_type, company_name,
                role, active, created_at, permissions
         FROM users ORDER BY role, username"
    );
    $users = $stmt->fetchAll();
    foreach ($users as &$u) {
        $u['permissions'] = decodePerms($u['permissions']);
    }
    echo json_encode(['success' => true, 'users' => $users], JSON_UNESCAPED_UNICODE);
    exit;
}

// GET /api/users/{id}
if ($method === 'GET' && $id) {
    $stmt = $db->prepare(
        "SELECT id, username, full_name, first_name, last_name, patronymic,
                email, phone, description, client_type, company_name,
                role, active, created_at, permissions
         FROM users WHERE id = ?"
    );
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    if (!$u) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Не найден'], JSON_UNESCAPED_UNICODE); exit; }
    $u['permissions'] = decodePerms($u['permissions']);
    echo json_encode(['success' => true, 'user' => $u], JSON_UNESCAPED_UNICODE);
    exit;
}

// PUT /api/users/{id} — редактировать профиль
if ($method === 'PUT' && $id) {
    $check = $db->prepare("SELECT id, role FROM users WHERE id = ?");
    $check->execute([$id]);
    $target = $check->fetch();
    if (!$target) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE); exit; }
    if ($target['role'] === 'admin') { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Нельзя редактировать администратора'], JSON_UNESCAPED_UNICODE); exit; }

    // Для сотрудника — проверить право profile_edit
    if ($token->role === 'employee') {
        $perms = Auth::getPermissions($token);
        if (($perms['profile_edit'] ?? 'deny') !== 'add') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Нет прав на редактирование профиля'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $data        = json_decode(file_get_contents('php://input'), true) ?? [];
    $first_name  = trim($data['first_name']  ?? '');
    $last_name   = trim($data['last_name']   ?? '');
    $patronymic  = trim($data['patronymic']  ?? '');
    $phone       = trim($data['phone']       ?? '');
    $description = trim($data['description'] ?? '');
    $full_name   = trim("$last_name $first_name $patronymic");

    $allowed_types = ['individual', 'ip', 'selfemployed', 'company'];
    $client_type   = in_array($data['client_type'] ?? '', $allowed_types, true) ? $data['client_type'] : 'individual';
    $company_name  = in_array($client_type, ['company', 'ip'], true) ? trim($data['company_name'] ?? '') : '';

    $stmt = $db->prepare(
        "UPDATE users SET first_name=?, last_name=?, patronymic=?, full_name=?,
                          phone=?, description=?, client_type=?, company_name=? WHERE id=?"
    );
    $stmt->execute([$first_name, $last_name, $patronymic, $full_name, $phone, $description, $client_type, $company_name, $id]);

    $get = $db->prepare("SELECT id, username, full_name, first_name, last_name, patronymic, email, phone, description, client_type, company_name, role, active, created_at, permissions FROM users WHERE id = ?");
    $get->execute([$id]);
    $u = $get->fetch();
    $u['permissions'] = decodePerms($u['permissions']);
    echo json_encode(['success' => true, 'user' => $u], JSON_UNESCAPED_UNICODE);
    exit;
}

// PATCH /api/users/{id} — обновить права доступа (только admin)
if ($method === 'PATCH' && $id) {
    $check = $db->prepare("SELECT id, role FROM users WHERE id = ?");
    $check->execute([$id]);
    $target = $check->fetch();
    if (!$target) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE); exit; }
    if ($target['role'] === 'admin') { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Нельзя менять права администратора'], JSON_UNESCAPED_UNICODE); exit; }

    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $perms = $data['permissions'] ?? null;

    // Валидация прав для сотрудника
    if ($target['role'] === 'employee') {
        $allowed = ['deny', 'view', 'add', 'geoscan'];
        $validKeys = ['users','profile_edit','articles','vacancies','knowledge','projects','candidates','notifications','reports'];
        if (!is_array($perms)) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Некорректный формат прав'], JSON_UNESCAPED_UNICODE); exit; }
        $clean = [];
        foreach ($validKeys as $k) {
            if (isset($perms[$k]) && in_array($perms[$k], $allowed, true)) {
                $clean[$k] = $perms[$k];
            } else {
                $clean[$k] = 'deny';
            }
        }
        $perms = $clean;
    } elseif ($target['role'] === 'client') {
        $validDash = ['geoscan', 'deny'];
        $dashVal   = isset($perms['dashboard']) && in_array($perms['dashboard'], $validDash, true) ? $perms['dashboard'] : 'geoscan';
        $perms = ['dashboard' => $dashVal];
    }

    $stmt = $db->prepare("UPDATE users SET permissions = ? WHERE id = ?");
    $stmt->execute([json_encode($perms, JSON_UNESCAPED_UNICODE), $id]);

    echo json_encode(['success' => true, 'permissions' => $perms], JSON_UNESCAPED_UNICODE);
    exit;
}

// POST /api/users — создать пользователя
if ($method === 'POST') {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $username  = trim($data['username']  ?? '');
    $email     = trim($data['email']     ?? '');
    $password  = trim($data['password']  ?? '');
    $role      = trim($data['role']      ?? '');
    $full_name = trim($data['full_name'] ?? '');
    $phone     = trim($data['phone']     ?? '');

    if (!$username || !$email || !$password || !$role) {
        http_response_code(400); echo json_encode(['success' => false, 'message' => 'Логин, email, пароль и роль обязательны'], JSON_UNESCAPED_UNICODE); exit;
    }
    if (!in_array($role, ['employee', 'client'], true)) {
        http_response_code(400); echo json_encode(['success' => false, 'message' => 'Роль должна быть employee или client'], JSON_UNESCAPED_UNICODE); exit;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400); echo json_encode(['success' => false, 'message' => 'Некорректный email'], JSON_UNESCAPED_UNICODE); exit;
    }
    $check = $db->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
    $check->execute([$username, $email]);
    if ($check->fetch()) {
        http_response_code(409); echo json_encode(['success' => false, 'message' => 'Пользователь с таким логином или email уже существует'], JSON_UNESCAPED_UNICODE); exit;
    }

    $hash  = password_hash($password, PASSWORD_DEFAULT);
    $perms = json_encode(defaultPermissions($role), JSON_UNESCAPED_UNICODE);
    $ins   = $db->prepare("INSERT INTO users (username, full_name, email, phone, password, role, permissions) VALUES (?,?,?,?,?,?,?)");
    $ins->execute([$username, $full_name, $email, $phone, $hash, $role, $perms]);

    echo json_encode([
        'success'     => true,
        'message'     => 'Пользователь создан',
        'user'        => ['id' => (int)$db->lastInsertId(), 'username' => $username, 'email' => $email, 'role' => $role],
        'permissions' => defaultPermissions($role),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// DELETE /api/users/{id}
if ($method === 'DELETE' && $id) {
    $user = $db->prepare("SELECT role FROM users WHERE id = ?");
    $user->execute([$id]);
    $target = $user->fetch();
    if (!$target) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Пользователь не найден'], JSON_UNESCAPED_UNICODE); exit; }
    if ($target['role'] === 'admin') { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Нельзя удалить администратора'], JSON_UNESCAPED_UNICODE); exit; }
    $db->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Пользователь удалён'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
