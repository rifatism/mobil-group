<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';

$token = Auth::require();
$uid   = (int)($token->uid  ?? 0);
$role  = $token->role ?? '';

$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$notifId = (int)($GLOBALS['notif_id'] ?? 0);
$action  = $GLOBALS['notif_action'] ?? '';

// ─── GET /api/notifications — мои уведомления ─────────────────────────────
if ($method === 'GET' && !$notifId) {
    $limit  = min((int)($_GET['limit'] ?? 30), 100);
    $offset = max((int)($_GET['offset'] ?? 0), 0);

    $stmt = $db->prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT $limit OFFSET $offset"
    );
    $stmt->execute([$uid]);
    $notifications = $stmt->fetchAll();

    $cntStmt = $db->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0");
    $cntStmt->execute([$uid]);
    $unread = (int)$cntStmt->fetchColumn();

    echo json_encode([
        'success'       => true,
        'notifications' => $notifications,
        'unread'        => $unread,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── PUT /api/notifications/read — отметить все как прочитанные ───────────
if ($method === 'PUT' && $action === 'read_all') {
    $db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")->execute([$uid]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── PUT /api/notifications/{id}/read — отметить одно ────────────────────
if ($method === 'PUT' && $notifId) {
    $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")->execute([$notifId, $uid]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/notifications/{id} ───────────────────────────────────────
if ($method === 'DELETE' && $notifId) {
    $db->prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?")->execute([$notifId, $uid]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/notifications — удалить все мои уведомления ─────────────
if ($method === 'DELETE' && !$notifId) {
    $db->prepare("DELETE FROM notifications WHERE user_id = ?")->execute([$uid]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
