<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../controllers/NewsController.php';
require_once __DIR__ . '/../controllers/VacancyController.php';
require_once __DIR__ . '/../controllers/PageController.php';
require_once __DIR__ . '/../controllers/MediaController.php';
require_once __DIR__ . '/../middleware/Auth.php';

// Получение URI
$request_uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$request_method = $_SERVER['REQUEST_METHOD'];

// Убираем /api/ из пути
$path = str_replace('/api/', '', $request_uri);

// Роутинг
switch ($path) {
    // Новости
    case 'news':
        $controller = new NewsController();
        if ($request_method === 'GET') {
            $controller->getAll();
        } elseif ($request_method === 'POST') {
            Auth::verify();
            $controller->create();
        }
        break;

    case preg_match('/^news\/(\d+)$/', $path, $matches) ? true : false:
        $controller = new NewsController();
        $id = $matches[1];
        if ($request_method === 'GET') {
            $controller->getById($id);
        } elseif ($request_method === 'PUT') {
            Auth::verify();
            $controller->update($id);
        } elseif ($request_method === 'DELETE') {
            Auth::verify();
            $controller->delete($id);
        }
        break;

    // Вакансии
    case 'vacancies':
        $controller = new VacancyController();
        if ($request_method === 'GET') {
            $controller->getAll();
        } elseif ($request_method === 'POST') {
            Auth::verify();
            $controller->create();
        }
        break;

    // Страницы
    case 'pages':
        $controller = new PageController();
        if ($request_method === 'GET') {
            $controller->getAll();
        } elseif ($request_method === 'POST') {
            Auth::verify();
            $controller->create();
        }
        break;

    // Медиа
    case 'media':
        $controller = new MediaController();
        if ($request_method === 'GET') {
            $controller->getAll();
        } elseif ($request_method === 'POST' && strpos($path, 'upload') !== false) {
            Auth::verify();
            $controller->upload();
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Endpoint не найден']);
        break;
}
?>