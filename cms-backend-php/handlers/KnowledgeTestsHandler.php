<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../helpers/NotificationHelper.php';

$token  = Auth::require();
$role   = $token->role ?? '';
$uid    = (int)($token->uid ?? 0);

if (!in_array($role, ['admin', 'employee'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Нет доступа'], JSON_UNESCAPED_UNICODE);
    exit;
}
$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Сотрудники всегда могут: видеть назначенные им тесты, проходить их, смотреть результаты.
// Права knowledge нужны только для управления: создание, редактирование, назначение, удаление.
$action_check = $GLOBALS['knowledge_action'] ?? '';
$isManageAction = $action_check === 'assign'
    || ($method !== 'GET' && !in_array($action_check, ['submit', 'results'], true));
if ($role !== 'admin' && $isManageAction) {
    Auth::requirePermission($token, 'knowledge', ['add']);
}
// GET-запросы (список назначенных тестов, прохождение, результаты) — доступны всем сотрудникам без проверки прав knowledge.
$testId = (int)($GLOBALS['knowledge_test_id'] ?? 0);
$action = $GLOBALS['knowledge_action'] ?? '';

// Миграция: добавляем новые колонки если их нет
try { $db->exec("ALTER TABLE knowledge_tests ADD COLUMN max_attempts INT NULL DEFAULT NULL"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE knowledge_tests ADD COLUMN passing_score INT NOT NULL DEFAULT 60"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE knowledge_results ADD COLUMN passed TINYINT(1) NULL DEFAULT NULL"); } catch (\Exception $e) {}
try { $db->exec("ALTER TABLE knowledge_results ADD COLUMN attempt_count INT NOT NULL DEFAULT 1"); } catch (\Exception $e) {}

// ─── GET /api/knowledge/tests — список тестов ──────────────────────────────
if ($method === 'GET' && !$testId && $action !== 'my') {
    if ($role === 'admin') {
        $stmt = $db->query("SELECT kt.*, u.full_name AS creator, (SELECT COUNT(*) FROM knowledge_assignments ka WHERE ka.test_id = kt.id) AS assign_count FROM knowledge_tests kt LEFT JOIN users u ON u.id = kt.created_by ORDER BY kt.created_at DESC");
        $tests = $stmt->fetchAll();
    } else {
        // Сотрудник: тесты назначенные ему или всем
        $stmt = $db->prepare("
            SELECT kt.*, ka.due_date, ka.assigned_at,
                   (SELECT completed_at FROM knowledge_results kr WHERE kr.test_id=kt.id AND kr.user_id=?) AS completed_at,
                   (SELECT score FROM knowledge_results kr WHERE kr.test_id=kt.id AND kr.user_id=?) AS my_score,
                   (SELECT total FROM knowledge_results kr WHERE kr.test_id=kt.id AND kr.user_id=?) AS my_total
            FROM knowledge_tests kt
            JOIN knowledge_assignments ka ON ka.test_id = kt.id AND (ka.user_id = ? OR ka.user_id = 0)
            ORDER BY ka.assigned_at DESC
        ");
        $stmt->execute([$uid, $uid, $uid, $uid]);
        $tests = $stmt->fetchAll();
    }

    // Не отдавать вопросы со списком ответов, если не admin
    if ($role !== 'admin') {
        foreach ($tests as &$t) {
            $qs = json_decode($t['questions'], true) ?? [];
            $t['question_count'] = count($qs);
            unset($t['questions']);
        }
    }
    echo json_encode(['success' => true, 'tests' => $tests], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── GET /api/knowledge/tests/{id} — один тест для прохождения ────────────
if ($method === 'GET' && $testId && $action !== 'assign') {
    // Проверить что назначен (employee) или admin
    if ($role === 'employee') {
        $chk = $db->prepare("SELECT id FROM knowledge_assignments WHERE test_id=? AND (user_id=? OR user_id=0)");
        $chk->execute([$testId, $uid]);
        if (!$chk->fetch()) { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Тест не назначен'],JSON_UNESCAPED_UNICODE); exit; }
    }
    $stmt = $db->prepare("SELECT * FROM knowledge_tests WHERE id = ?");
    $stmt->execute([$testId]);
    $t = $stmt->fetch();
    if (!$t) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Тест не найден'],JSON_UNESCAPED_UNICODE); exit; }

    // Убрать правильные ответы для сотрудника, но сохранить флаг multi
    $qs = json_decode($t['questions'], true) ?? [];
    if ($role === 'employee') {
        foreach ($qs as &$q) {
            $q['multi'] = isset($q['ans']) && is_array($q['ans']);
            unset($q['ans']);
        }
    }
    $t['questions'] = $qs;
    echo json_encode(['success' => true, 'test' => $t], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── POST /api/knowledge/tests — создать тест ─────────────────────────────
if ($method === 'POST' && !$testId && $action !== 'submit' && $action !== 'assign') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');
    $desc  = trim($data['description'] ?? '');
    $qs    = $data['questions'] ?? [];

    if (!$title) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Название обязательно'],JSON_UNESCAPED_UNICODE); exit; }
    if (empty($qs)) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Добавьте хотя бы один вопрос'],JSON_UNESCAPED_UNICODE); exit; }

    $maxAttempts  = isset($data['max_attempts'])  ? (int)$data['max_attempts']  : null;
    $passingScore = isset($data['passing_score']) ? (int)$data['passing_score'] : 60;

    $ins = $db->prepare("INSERT INTO knowledge_tests (title, description, questions, created_by, max_attempts, passing_score) VALUES (?,?,?,?,?,?)");
    $ins->execute([$title, $desc, json_encode($qs, JSON_UNESCAPED_UNICODE), $uid, $maxAttempts, $passingScore]);
    $newId = (int)$db->lastInsertId();

    $get = $db->prepare("SELECT * FROM knowledge_tests WHERE id = ?");
    $get->execute([$newId]);
    echo json_encode(['success' => true, 'test' => $get->fetch()], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── PUT /api/knowledge/tests/{id} — редактировать тест ───────────────────
if ($method === 'PUT' && $testId && $action !== 'assign') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($data['title'] ?? '');
    $desc  = trim($data['description'] ?? '');
    $qs    = $data['questions'] ?? [];
    $maxAttempts  = array_key_exists('max_attempts', $data)  ? (strlen((string)$data['max_attempts']) ? (int)$data['max_attempts'] : null) : null;
    $passingScore = isset($data['passing_score']) ? (int)$data['passing_score'] : 60;

    if (!$title) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Название обязательно'],JSON_UNESCAPED_UNICODE); exit; }

    $stmt = $db->prepare("UPDATE knowledge_tests SET title=?, description=?, questions=?, max_attempts=?, passing_score=? WHERE id=?");
    $stmt->execute([$title, $desc, json_encode($qs, JSON_UNESCAPED_UNICODE), $maxAttempts, $passingScore, $testId]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── GET /api/knowledge/tests/{id}/assign — список назначенных ──────────────
if ($method === 'GET' && $testId && $action === 'assign') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    // user_id = 0 означает «все сотрудники»
    $stmt = $db->prepare("
        SELECT ka.id, ka.user_id, ka.due_date, ka.assigned_at,
               u.full_name, u.username,
               kr.score, kr.passed, kr.completed_at AS submitted_at, kr.attempt_count
        FROM knowledge_assignments ka
        LEFT JOIN users u ON u.id = ka.user_id
        LEFT JOIN knowledge_results kr ON kr.test_id = ka.test_id AND kr.user_id = ka.user_id
        WHERE ka.test_id = ?
        ORDER BY ka.assigned_at DESC
    ");
    $stmt->execute([$testId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $result = array_map(function($r) {
        return [
            'id'           => (int)$r['id'],
            'user_id'      => (int)$r['user_id'],
            'name'         => $r['user_id'] == 0 ? 'Все сотрудники' : ($r['full_name'] ?: $r['username'] ?: '—'),
            'due_date'     => $r['due_date'],
            'assigned_at'  => $r['assigned_at'],
            'score'        => $r['score'] !== null ? (int)$r['score'] : null,
            'passed'       => $r['passed'] !== null ? (bool)$r['passed'] : null,
            'submitted_at' => $r['submitted_at'],
        ];
    }, $rows);

    echo json_encode(['success' => true, 'assignments' => $result], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── POST /api/knowledge/tests/{id}/assign — назначить тест ───────────────
if ($method === 'POST' && $testId && $action === 'assign') {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $data     = json_decode(file_get_contents('php://input'), true) ?? [];
    $target   = $data['target']   ?? 'all';    // 'all' или конкретный user_id
    $due_date = $data['due_date'] ?? null;

    $testStmt = $db->prepare("SELECT title FROM knowledge_tests WHERE id = ?");
    $testStmt->execute([$testId]);
    $testTitle = $testStmt->fetchColumn() ?: 'Тест';

    if ($target === 'all') {
        try {
            $ins = $db->prepare("INSERT IGNORE INTO knowledge_assignments (test_id, user_id, assigned_by, due_date) VALUES (?, 0, ?, ?)");
            $ins->execute([$testId, $uid, $due_date ?: null]);
        } catch (\Exception $e) {}
        notifyRole($db, 'employee', 'test_assigned', 'Новый тест', "\u{AB}" . $testTitle . "\u{BB}", 'knowledge.html', 0);
    } else {
        $userId = (int)$target;
        if (!$userId) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Неверный пользователь'],JSON_UNESCAPED_UNICODE); exit; }
        $ins = $db->prepare("INSERT IGNORE INTO knowledge_assignments (test_id, user_id, assigned_by, due_date) VALUES (?, ?, ?, ?)");
        $ins->execute([$testId, $userId, $uid, $due_date ?: null]);
        notifyUser($db, $userId, 'test_assigned', 'Новый тест', "\u{AB}" . $testTitle . "\u{BB}", 'knowledge.html');
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/knowledge/tests/{id}/assign/{assignmentId} — снять назначение ──
$assignId = (int)($GLOBALS['knowledge_assign_id'] ?? 0);
if ($method === 'DELETE' && $testId && $action === 'assign' && $assignId) {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }
    $stmt = $db->prepare("DELETE FROM knowledge_assignments WHERE id = ? AND test_id = ?");
    $stmt->execute([$assignId, $testId]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── DELETE /api/knowledge/tests/{id} — удалить тест ─────────────────────
if ($method === 'DELETE' && $testId) {
    if ($role !== 'admin') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только администратор'],JSON_UNESCAPED_UNICODE); exit; }

    $db->prepare("DELETE FROM knowledge_assignments WHERE test_id=?")->execute([$testId]);
    $db->prepare("DELETE FROM knowledge_results WHERE test_id=?")->execute([$testId]);
    $db->prepare("DELETE FROM knowledge_tests WHERE id=?")->execute([$testId]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── POST /api/knowledge/submit — сдать тест ──────────────────────────────
if ($method === 'POST' && $action === 'submit') {
    if ($role !== 'employee') { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Только сотрудники сдают тесты'],JSON_UNESCAPED_UNICODE); exit; }

    $data   = json_decode(file_get_contents('php://input'), true) ?? [];
    $testId = (int)($data['test_id'] ?? 0);
    $ans    = $data['answers'] ?? [];

    if (!$testId) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Тест не указан'],JSON_UNESCAPED_UNICODE); exit; }

    // Проверить назначение
    $chk = $db->prepare("SELECT id FROM knowledge_assignments WHERE test_id=? AND (user_id=? OR user_id=0)");
    $chk->execute([$testId, $uid]);
    if (!$chk->fetch()) { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Тест не назначен'],JSON_UNESCAPED_UNICODE); exit; }

    // Загрузить тест с настройками
    $stmt = $db->prepare("SELECT questions, max_attempts, passing_score FROM knowledge_tests WHERE id=?");
    $stmt->execute([$testId]);
    $t = $stmt->fetch();
    if (!$t) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Тест не найден'],JSON_UNESCAPED_UNICODE); exit; }

    // Проверить количество попыток
    $maxAttempts = $t['max_attempts'] !== null ? (int)$t['max_attempts'] : null;
    if ($maxAttempts !== null) {
        $cntStmt = $db->prepare("SELECT attempt_count FROM knowledge_results WHERE test_id=? AND user_id=?");
        $cntStmt->execute([$testId, $uid]);
        $existing = $cntStmt->fetch();
        $used = $existing ? (int)$existing['attempt_count'] : 0;
        if ($used >= $maxAttempts) {
            http_response_code(403);
            echo json_encode(['success'=>false,'message'=>'Превышено количество попыток ('.$maxAttempts.')'],JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Подсчёт очков (поддержка одиночных и множественных ответов)
    $qs           = json_decode($t['questions'], true) ?? [];
    $passingScore = (int)($t['passing_score'] ?? 60);
    $total        = count($qs);
    $score        = 0;

    foreach ($qs as $i => $q) {
        $correct = $q['ans'] ?? null;
        $given   = $ans[$i] ?? null;
        if (is_array($correct)) {
            // Множественный выбор: сравниваем отсортированные массивы
            $givenArr   = is_array($given) ? $given : (isset($given) ? [$given] : []);
            $correctArr = $correct;
            sort($givenArr); sort($correctArr);
            if ($givenArr === $correctArr) $score++;
        } else {
            if (isset($given) && (int)$given === (int)$correct) $score++;
        }
    }

    $percent = $total ? round($score / $total * 100) : 0;
    $passed  = $percent >= $passingScore ? 1 : 0;

    // Сохранить результат (обновить если уже есть, увеличить счётчик попыток)
    $ins = $db->prepare("
        INSERT INTO knowledge_results (test_id, user_id, score, total, answers, passed, attempt_count, completed_at)
        VALUES (?,?,?,?,?,?,1,NOW())
        ON DUPLICATE KEY UPDATE
            score=VALUES(score), total=VALUES(total), answers=VALUES(answers),
            passed=VALUES(passed), attempt_count=attempt_count+1, completed_at=NOW()
    ");
    $ins->execute([$testId, $uid, $score, $total, json_encode($ans, JSON_UNESCAPED_UNICODE), $passed]);

    // Уведомить всех администраторов о результате теста
    $userStmt = $db->prepare("SELECT full_name, username FROM users WHERE id=?");
    $userStmt->execute([$uid]);
    $userRow = $userStmt->fetch();
    $userName = $userRow ? ($userRow['full_name'] ?: $userRow['username']) : 'Сотрудник';

    $testStmt = $db->prepare("SELECT title FROM knowledge_tests WHERE id=?");
    $testStmt->execute([$testId]);
    $testRow = $testStmt->fetch();
    $testTitle = $testRow ? $testRow['title'] : 'Тест';

    $resultLabel = $passed ? 'сдал' : 'не сдал';
    $notifTitle  = $passed ? 'Тест сдан ✓' : 'Тест не сдан ✗';
    $notifBody   = "{$userName} {$resultLabel} тест «{$testTitle}» — {$percent}%";
    notifyRole($db, 'admin', $passed ? 'test_passed' : 'test_failed', $notifTitle, $notifBody, 'admin.html');

    echo json_encode([
        'success'       => true,
        'score'         => $score,
        'total'         => $total,
        'percent'       => $percent,
        'passed'        => (bool)$passed,
        'passing_score' => $passingScore,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── GET /api/knowledge/results — результаты ──────────────────────────────
if ($method === 'GET' && $action === 'results') {
    if ($role === 'admin') {
        $stmt = $db->query("SELECT kr.*, kt.title AS test_title, u.full_name AS user_name, u.username FROM knowledge_results kr JOIN knowledge_tests kt ON kt.id=kr.test_id JOIN users u ON u.id=kr.user_id ORDER BY kr.completed_at DESC");
    } else {
        $stmt = $db->prepare("SELECT kr.*, kt.title AS test_title FROM knowledge_results kr JOIN knowledge_tests kt ON kt.id=kr.test_id WHERE kr.user_id=? ORDER BY kr.completed_at DESC");
        $stmt->execute([$uid]);
    }
    echo json_encode(['success' => true, 'results' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Метод не разрешён'], JSON_UNESCAPED_UNICODE);
