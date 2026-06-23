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

// Profile — текущий пользователь
if ($uri === '/api/profile') {
    require_once __DIR__ . '/handlers/ProfileHandler.php';
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

// News — list / create
if ($uri === '/api/news') {
    require_once __DIR__ . '/handlers/NewsHandler.php';
    exit;
}

// News — single / update / delete
if (preg_match('#^/api/news/(\d+)$#', $uri, $m)) {
    $GLOBALS['news_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/NewsHandler.php';
    exit;
}

// Upload image
if ($uri === '/api/upload' && $method === 'POST') {
    require_once __DIR__ . '/handlers/UploadHandler.php';
    exit;
}

// Contact form
if ($uri === '/api/contact' && $method === 'POST') {
    require_once __DIR__ . '/handlers/ContactHandler.php';
    exit;
}

// Career contact (job application)
if ($uri === '/api/career-contact' && $method === 'POST') {
    require_once __DIR__ . '/handlers/CareerContactHandler.php';
    exit;
}

// Vacancies — list / create
if ($uri === '/api/vacancies') {
    require_once __DIR__ . '/handlers/VacanciesHandler.php';
    exit;
}

// Vacancies — single / update / delete
if (preg_match('#^/api/vacancies/(\d+)$#', $uri, $m)) {
    $GLOBALS['vacancy_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/VacanciesHandler.php';
    exit;
}

// AutoGRAF proxy — /api/autograf/*
if (str_starts_with($uri, '/api/autograf/')) {
    require_once __DIR__ . '/handlers/AutografHandler.php';
    exit;
}

// 404
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Эндпоинт не найден'], JSON_UNESCAPED_UNICODE);