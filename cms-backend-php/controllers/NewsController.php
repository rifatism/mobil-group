<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/News.php';

class NewsController {
    private $db;
    private $news;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->news = new News($this->db);
    }

    // GET /api/news
    public function getAll() {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $published = isset($_GET['published']) ? $_GET['published'] === 'true' : null;
        $featured = isset($_GET['featured']) ? $_GET['featured'] === 'true' : null;

        $stmt = $this->news->getAll($page, $limit, $published, $featured);
        $news = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'count' => count($news),
            'data' => $news
        ]);
    }

    // GET /api/news/:id
    public function getById($id) {
        $news = $this->news->getById($id);

        if (!$news) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Новость не найдена']);
            return;
        }

        $this->news->incrementViews($id);

        echo json_encode(['success' => true, 'data' => $news]);
    }

    // POST /api/news
    public function create() {
        $data = json_decode(file_get_contents("php://input"));

        if (empty($data->title) || empty($data->content)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Заголовок и содержание обязательны']);
            return;
        }

        $this->news->title = $data->title;
        $this->news->content = $data->content;
        $this->news->excerpt = $data->excerpt ?? '';
        $this->news->image = $data->image ?? '';
        $this->news->author = $data->author ?? 'Администратор';
        $this->news->published = $data->published ?? false;
        $this->news->featured = $data->featured ?? false;

        $news_id = $this->news->create();

        if ($news_id) {
            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Новость создана',
                'id' => $news_id
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Ошибка при создании']);
        }
    }

    // PUT /api/news/:id
    public function update($id) {
        $data = json_decode(file_get_contents("php://input"));

        $this->news->title = $data->title;
        $this->news->content = $data->content;
        $this->news->excerpt = $data->excerpt ?? '';
        $this->news->image = $data->image ?? '';
        $this->news->published = $data->published ?? false;
        $this->news->featured = $data->featured ?? false;

        if ($this->news->update($id)) {
            echo json_encode(['success' => true, 'message' => 'Новость обновлена']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Ошибка при обновлении']);
        }
    }

    // DELETE /api/news/:id
    public function delete($id) {
        if ($this->news->delete($id)) {
            echo json_encode(['success' => true, 'message' => 'Новость удалена']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Ошибка при удалении']);
        }
    }
}
?>