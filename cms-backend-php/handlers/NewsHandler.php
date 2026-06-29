<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($GLOBALS['news_id'] ?? 0);

// Миграция
try { $db->exec("ALTER TABLE news ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0"); } catch (\Exception $e) {}

// GET — публичный доступ
if ($method === 'GET') {
    if ($id) {
        $stmt = $db->prepare("SELECT * FROM news WHERE id = ? AND published = 1");
        $stmt->execute([$id]);
        $item = $stmt->fetch();
        if (!$item) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Новость не найдена'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $db->prepare("UPDATE news SET views = views + 1 WHERE id = ?")->execute([$id]);
        echo json_encode(['success' => true, 'news' => $item], JSON_UNESCAPED_UNICODE);
    } else {
        // Для GET /api/news?all=1 от админа вернуть все (включая черновики и архив)
        $showAll  = isset($_GET['all'])     && $_GET['all']     === '1';
        $showArch = isset($_GET['archive']) && $_GET['archive'] === '1';
        if ($showAll) {
            $token = Auth::require();
            Auth::requireRole($token, 'admin', 'employee');
            Auth::requirePermission($token, 'articles', ['add', 'view']);
            $stmt = $db->query("SELECT * FROM news ORDER BY created_at DESC");
        } elseif ($showArch) {
            $stmt = $db->query("SELECT id, title, slug, excerpt, content, image, author, views, created_at, archived FROM news WHERE published = 1 AND archived = 1 ORDER BY created_at DESC");
        } else {
            $stmt = $db->query("SELECT id, title, slug, excerpt, content, image, author, views, created_at, archived FROM news WHERE published = 1 AND archived = 0 ORDER BY created_at DESC");
        }
        echo json_encode(['success' => true, 'news' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// POST / PUT / DELETE — admin или employee с правом articles=add
$token = Auth::require();
Auth::requireRole($token, 'admin', 'employee');
Auth::requirePermission($token, 'articles', ['add']);

if ($method === 'POST') {
    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');

    if ($title === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Заголовок обязателен'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $slug = makeNewsSlug($title);
    $check = $db->prepare("SELECT id FROM news WHERE slug = ?");
    $check->execute([$slug]);
    if ($check->fetch()) {
        $slug .= '-' . time();
    }

    $stmt = $db->prepare(
        "INSERT INTO news (title, slug, content, excerpt, image, author, published, archived) VALUES (?,?,?,?,?,?,?,?)"
    );
    $stmt->execute([
        $title,
        $slug,
        $data['content']   ?? '',
        $data['excerpt']   ?? '',
        $data['image']     ?? '',
        $data['author']    ?? 'Администратор',
        (int)($data['published'] ?? 0),
        (int)($data['archived']  ?? 0),
    ]);

    $newId = (int)$db->lastInsertId();
    $row   = $db->prepare("SELECT * FROM news WHERE id = ?");
    $row->execute([$newId]);
    echo json_encode(['success' => true, 'news' => $row->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT') {
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');

    if ($title === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Заголовок обязателен'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $db->prepare(
        "UPDATE news SET title=?, content=?, excerpt=?, image=?, published=?, archived=?, updated_at=NOW() WHERE id=?"
    );
    $stmt->execute([
        $title,
        $data['content']   ?? '',
        $data['excerpt']   ?? '',
        $data['image']     ?? '',
        (int)($data['published'] ?? 0),
        (int)($data['archived']  ?? 0),
        $id,
    ]);

    $row = $db->prepare("SELECT * FROM news WHERE id = ?");
    $row->execute([$id]);
    echo json_encode(['success' => true, 'news' => $row->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID не указан'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $db->prepare("DELETE FROM news WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Новость удалена'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);

function makeNewsSlug(string $s): string {
    $map = [
        'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'yo','ж'=>'zh',
        'з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o',
        'п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts',
        'ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
    ];
    $s = mb_strtolower(trim($s));
    $s = strtr($s, $map);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-') ?: 'news';
}