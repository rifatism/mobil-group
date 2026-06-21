<?php
require_once __DIR__ . '/config/config.php';

// Перенаправление всех запросов на API
$request_uri = $_SERVER['REQUEST_URI'];

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