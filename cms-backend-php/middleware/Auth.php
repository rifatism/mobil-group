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
}