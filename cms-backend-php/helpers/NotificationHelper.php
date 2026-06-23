<?php
/**
 * Создать уведомление для одного пользователя
 */
function notifyUser(PDO $db, int $userId, string $type, string $title, string $body = '', string $link = ''): void {
    $stmt = $db->prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)");
    $stmt->execute([$userId, $type, $title, $body, $link]);
}

/**
 * Создать уведомление для всех активных сотрудников (и опционально - всех пользователей)
 * @param string $roles  Разделённые запятой роли: 'employee', 'admin,employee'
 */
function notifyRole(PDO $db, string $roles, string $type, string $title, string $body = '', string $link = '', int $excludeUserId = 0): void {
    $roleList  = array_map('trim', explode(',', $roles));
    $placeholders = implode(',', array_fill(0, count($roleList), '?'));
    $params    = $roleList;

    $sql = "SELECT id FROM users WHERE role IN ($placeholders) AND active = 1";
    if ($excludeUserId > 0) {
        $sql   .= " AND id != ?";
        $params[] = $excludeUserId;
    }
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $users = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $ins = $db->prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)");
    foreach ($users as $uid) {
        $ins->execute([$uid, $type, $title, $body, $link]);
    }
}
