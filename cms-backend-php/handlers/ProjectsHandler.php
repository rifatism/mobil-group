<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($GLOBALS['project_id'] ?? 0);

// Миграция — создать таблицу если не существует
$db->exec("CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE,
    description VARCHAR(400) DEFAULT '',
    content TEXT NULL,
    image VARCHAR(255) DEFAULT '',
    client_name VARCHAR(150) DEFAULT '',
    client_logo VARCHAR(255) DEFAULT '',
    category VARCHAR(100) DEFAULT '',
    year INT DEFAULT 0,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

if ($method === 'GET') {
    if ($id) {
        $stmt = $db->prepare("SELECT * FROM projects WHERE id = ?");
        $stmt->execute([$id]);
        $item = $stmt->fetch();
        if (!$item) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Проект не найден'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode(['success' => true, 'project' => $item], JSON_UNESCAPED_UNICODE);
    } else {
        $showAll = isset($_GET['all']) && $_GET['all'] === '1';
        if ($showAll) {
            $token = Auth::require();
            Auth::requireRole($token, 'admin', 'employee');
            Auth::requirePermission($token, 'projects', ['add']);
            $stmt = $db->query("SELECT * FROM projects ORDER BY created_at DESC");
        } else {
            $stmt = $db->query("SELECT * FROM projects WHERE published = 1 ORDER BY year DESC, created_at DESC");
        }
        echo json_encode(['success' => true, 'projects' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

$token = Auth::require();
Auth::requireRole($token, 'admin', 'employee');
Auth::requirePermission($token, 'projects', ['add']);

if ($method === 'POST') {
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');
    if ($title === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Заголовок обязателен'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $slug = makeProjectSlug($title);
    $check = $db->prepare("SELECT id FROM projects WHERE slug = ?");
    $check->execute([$slug]);
    if ($check->fetch()) $slug .= '-' . time();

    $stmt = $db->prepare(
        "INSERT INTO projects (title, slug, description, content, image, client_name, client_logo, category, year, published)
         VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    $stmt->execute([
        $title,
        $slug,
        $data['description'] ?? '',
        $data['content']     ?? '',
        $data['image']       ?? '',
        $data['client_name'] ?? '',
        $data['client_logo'] ?? '',
        $data['category']    ?? '',
        (int)($data['year']  ?? date('Y')),
        (int)($data['published'] ?? 0),
    ]);
    $newId = (int)$db->lastInsertId();
    $row   = $db->prepare("SELECT * FROM projects WHERE id = ?");
    $row->execute([$newId]);
    echo json_encode(['success' => true, 'project' => $row->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT') {
    if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE); exit; }
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');
    if ($title === '') { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Заголовок обязателен'], JSON_UNESCAPED_UNICODE); exit; }
    $stmt = $db->prepare(
        "UPDATE projects SET title=?, description=?, content=?, image=?, client_name=?, client_logo=?, category=?, year=?, published=?, updated_at=NOW() WHERE id=?"
    );
    $stmt->execute([
        $title,
        $data['description'] ?? '',
        $data['content']     ?? '',
        $data['image']       ?? '',
        $data['client_name'] ?? '',
        $data['client_logo'] ?? '',
        $data['category']    ?? '',
        (int)($data['year']  ?? date('Y')),
        (int)($data['published'] ?? 0),
        $id,
    ]);
    $row = $db->prepare("SELECT * FROM projects WHERE id = ?");
    $row->execute([$id]);
    echo json_encode(['success' => true, 'project' => $row->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE); exit; }
    $db->prepare("DELETE FROM projects WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Проект удалён'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);

function makeProjectSlug(string $s): string {
    $map = [
        'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'yo','ж'=>'zh',
        'з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o',
        'п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts',
        'ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
    ];
    $s = mb_strtolower(trim($s));
    $s = strtr($s, $map);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-') ?: 'project';
}
