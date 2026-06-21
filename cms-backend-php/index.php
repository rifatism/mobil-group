<?php
require_once __DIR__ . '/config/config.php';

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Health check
if ($uri === '/api/health') {
    echo json_encode(['status' => 'ok', 'time' => date('Y-m-d H:i:s')]);
    exit;
}

// Login
if ($uri === '/api/login' && $method === 'POST') {
    require_once __DIR__ . '/handlers/LoginHandler.php';
    exit;
}

// Users — список, создание
if ($uri === '/api/users') {
    require_once __DIR__ . '/handlers/UserHandler.php';
    exit;
}

// Users — удаление /api/users/{id}
if (preg_match('#^/api/users/(\d+)$#', $uri, $m)) {
    $GLOBALS['route_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/UserHandler.php';
    exit;
}

// 404
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Эндпоинт не найден'], JSON_UNESCAPED_UNICODE);