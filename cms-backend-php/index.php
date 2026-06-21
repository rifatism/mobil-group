<?php
require_once __DIR__ . '/config/config.php';

// Перенаправление всех запросов на API
$request_uri = $_SERVER['REQUEST_URI'];

switch ($request_uri) {
    case '/api/contact':
        require_once __DIR__ . '/handlers/ContactHandler.php';
        break;

    case '/api/health':
        echo json_encode([
            'status' => 'ok',
            'time' => date('Y-m-d H:i:s')
        ]);
        break;

    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Endpoint не найден']);
        break;
}

if (strpos($request_uri, '/api/') === 0) {
    require_once __DIR__ . '/routes/api.php';
} else {
    echo json_encode([
        'message' => 'CMS API',
        'version' => '1.0.0',
        'endpoints' => [
            '/api/news',
            '/api/vacancies',
            '/api/pages',
            '/api/media'
        ]
    ]);
}
?>
