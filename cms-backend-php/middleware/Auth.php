<?php
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class Auth {
    private static function secret(): string {
        return $_ENV['JWT_SECRET'] ?? 'secret';
    }

    public static function generateToken(array $user): string {
        $expire = (int)($_ENV['JWT_EXPIRE'] ?? 604800);
        $payload = [
            'iss'  => 'cms-api',
            'iat'  => time(),
            'exp'  => time() + $expire,
            'uid'  => $user['id'],
            'role' => $user['role'],
        ];
        return JWT::encode($payload, self::secret(), 'HS256');
    }

    // Возвращает payload токена или завершает запрос с 401
    public static function require(): object {
        $header = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? '') : '')
            ?? '';
        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Токен не передан'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        try {
            return JWT::decode($m[1], new Key(self::secret(), 'HS256'));
        } catch (Exception) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Токен недействителен'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Проверить роль; если не подходит — 403
    public static function requireRole(object $token, string ...$roles): void {
        if (!in_array($token->role, $roles, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Доступ запрещён'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Получить permissions пользователя из БД
    public static function getPermissions(object $token): array {
        if ($token->role === 'admin') return [];
        try {
            $db   = (new Database())->getConnection();
            $stmt = $db->prepare("SELECT permissions FROM users WHERE id = ?");
            $stmt->execute([$token->uid]);
            $row = $stmt->fetch();
            return ($row && $row['permissions']) ? (json_decode($row['permissions'], true) ?? []) : [];
        } catch (\Exception $e) {
            return [];
        }
    }

    // Проверить разрешение; admin всегда проходит; иначе 403
    // $allowedLevels — массив допустимых значений, например ['add', 'view']
    public static function requirePermission(object $token, string $key, array $allowedLevels): void {
        if ($token->role === 'admin') return;
        $perms = self::getPermissions($token);
        $level = $perms[$key] ?? 'deny';
        if (!in_array($level, $allowedLevels, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Нет доступа к этому разделу'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Проверка без выхода — возвращает true/false
    public static function hasPermission(object $token, string $key, array $allowedLevels): bool {
        if ($token->role === 'admin') return true;
        $perms = self::getPermissions($token);
        return in_array($perms[$key] ?? 'deny', $allowedLevels, true);
    }
}
