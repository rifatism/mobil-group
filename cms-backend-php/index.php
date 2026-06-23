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

// ─── Notifications ────────────────────────────────────────────────────────
if ($uri === '/api/notifications') {
    require_once __DIR__ . '/handlers/NotificationsHandler.php';
    exit;
}
if ($uri === '/api/notifications/read') {
    $GLOBALS['notif_action'] = 'read_all';
    require_once __DIR__ . '/handlers/NotificationsHandler.php';
    exit;
}
if (preg_match('#^/api/notifications/(\d+)/read$#', $uri, $m)) {
    $GLOBALS['notif_id']     = (int)$m[1];
    require_once __DIR__ . '/handlers/NotificationsHandler.php';
    exit;
}
if (preg_match('#^/api/notifications/(\d+)$#', $uri, $m)) {
    $GLOBALS['notif_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/NotificationsHandler.php';
    exit;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────
// Folders: create / delete
if ($uri === '/api/knowledge/folders') {
    $GLOBALS['knowledge_action'] = $method === 'POST' ? 'folder_create' : 'folder_delete';
    require_once __DIR__ . '/handlers/KnowledgeFilesHandler.php';
    exit;
}

// Files: /api/knowledge/files, /api/knowledge/files/{id}, /api/knowledge/files/{id}/download
if ($uri === '/api/knowledge/files') {
    require_once __DIR__ . '/handlers/KnowledgeFilesHandler.php';
    exit;
}
if (preg_match('#^/api/knowledge/files/(\d+)/download$#', $uri, $m)) {
    $GLOBALS['knowledge_file_id'] = (int)$m[1];
    $GLOBALS['knowledge_action']  = 'download';
    require_once __DIR__ . '/handlers/KnowledgeFilesHandler.php';
    exit;
}
if (preg_match('#^/api/knowledge/files/(\d+)$#', $uri, $m)) {
    $GLOBALS['knowledge_file_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/KnowledgeFilesHandler.php';
    exit;
}

// Tests: list/create
if ($uri === '/api/knowledge/tests') {
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// Tests: submit answer
if ($uri === '/api/knowledge/submit') {
    $GLOBALS['knowledge_action'] = 'submit';
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// Tests: results
if ($uri === '/api/knowledge/results') {
    $GLOBALS['knowledge_action'] = 'results';
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// Tests: assign /api/knowledge/tests/{id}/assign
if (preg_match('#^/api/knowledge/tests/(\d+)/assign$#', $uri, $m)) {
    $GLOBALS['knowledge_test_id'] = (int)$m[1];
    $GLOBALS['knowledge_action']  = 'assign';
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// Tests: remove single assignment /api/knowledge/tests/{id}/assign/{assignmentId}
if (preg_match('#^/api/knowledge/tests/(\d+)/assign/(\d+)$#', $uri, $m)) {
    $GLOBALS['knowledge_test_id']    = (int)$m[1];
    $GLOBALS['knowledge_action']     = 'assign';
    $GLOBALS['knowledge_assign_id']  = (int)$m[2];
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// Tests: single / update / delete
if (preg_match('#^/api/knowledge/tests/(\d+)$#', $uri, $m)) {
    $GLOBALS['knowledge_test_id'] = (int)$m[1];
    require_once __DIR__ . '/handlers/KnowledgeTestsHandler.php';
    exit;
}
// ─── End Knowledge Base ───────────────────────────────────────────────────

// AutoGRAF proxy — /api/autograf/*
if (str_starts_with($uri, '/api/autograf/')) {
    require_once __DIR__ . '/handlers/AutografHandler.php';
    exit;
}

// 404
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Эндпоинт не найден'], JSON_UNESCAPED_UNICODE);