<?php
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../config/config.php';

Auth::require();

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$sub    = preg_replace('#^/api/autograf#', '', $uri);

// ─── Кэш сессии AutoGRAF ───────────────────────────────────────────────────

function ag_base(): string  { return $_ENV['AG_BASE_URL'] ?? 'https://ag.r72.ru/ServiceJSON'; }
function ag_user(): string  { return $_ENV['AG_USERNAME']  ?? 'testapi'; }
function ag_pass(): string  { return $_ENV['AG_PASSWORD']  ?? '1234'; }

function ag_session_cache_file(): string {
    return sys_get_temp_dir() . '/ag_sid_' . md5(ag_user() . ag_pass()) . '.json';
}

function ag_session_new(): string {
    $url = ag_base() . '/Login?UserName=' . rawurlencode(ag_user()) . '&Password=' . rawurlencode(ag_pass());
    $sid = trim(ag_get($url), " \t\n\r\0\x0B\"");
    file_put_contents(ag_session_cache_file(), json_encode(['sid' => $sid, 'exp' => time() + 1500]));
    return $sid;
}

function ag_session(): string {
    $cache = ag_session_cache_file();
    if (file_exists($cache)) {
        $d = json_decode(file_get_contents($cache), true);
        if ($d && !empty($d['sid']) && ($d['exp'] ?? 0) > time()) {
            return $d['sid'];
        }
    }
    return ag_session_new();
}

function ag_session_refresh(): string {
    @unlink(ag_session_cache_file());
    return ag_session_new();
}

// Выполнить запрос к AutoGRAF; при пустом/ошибочном ответе повторить один раз с новой сессией.
function ag_req_retry(string $url, ?array $post_body = null): array {
    $raw  = $post_body !== null ? ag_post($url, $post_body) : ag_get($url);
    $data = json_decode($raw, true);
    if (!empty($data) && is_array($data)) return $data;
    // Сессия могла истечь — обновляем и повторяем
    $newSid = ag_session_refresh();
    $url2 = preg_replace('/session=[^&]+/', 'session=' . rawurlencode($newSid), $url);
    $raw2 = $post_body !== null ? ag_post($url2, $post_body) : ag_get($url2);
    $data2 = json_decode($raw2, true);
    return is_array($data2) ? $data2 : [];
}

function ag_get(string $url): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $r = curl_exec($ch);
    curl_close($ch);
    return $r ?: '';
}

function ag_post(string $url, array $body): string {
    $payload = json_encode($body);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Content-Length: ' . strlen($payload)],
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $r = curl_exec($ch);
    curl_close($ch);
    return $r ?: '';
}

function ag_req(string $url, ?array $post_body = null): array {
    $raw  = $post_body !== null ? ag_post($url, $post_body) : ag_get($url);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_out(array $data): void {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// ─── Маршруты ──────────────────────────────────────────────────────────────────

// GET /api/autograf/schemas — схемы
if ($sub === '/schemas' && $method === 'GET') {
    $sid  = ag_session();
    $url  = ag_base() . '/EnumSchemas?session=' . rawurlencode($sid);
    $data = ag_req_retry($url);
    json_out(['success' => true, 'schemas' => $data]);
    exit;
}

// GET /api/autograf/vehicles?schemaId=X
// Возвращает устройства с иерархией групп
if ($sub === '/vehicles' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    if (!$schemaId) { http_response_code(400); json_out(['success' => false, 'message' => 'schemaId required']); exit; }
    $sid = ag_session();
    ag_get(ag_base() . '/SelectSchema?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId));
    $url  = ag_base() . '/EnumDevices?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId);
    $data = ag_req_retry($url);

    // Извлекаем рег. номера; удаляем тяжёлые поля для уменьшения размера ответа
    $items = $data['Items'] ?? [];
    $splitters = [];
    foreach ($items as &$item) {
        $item['_regNum'] = '';
        foreach ($item['Properties'] ?? [] as $p) {
            if ($p['Name'] === 'VehicleRegNumber' && !empty($p['Value'])) {
                $item['_regNum'] = (string)$p['Value'];
                break;
            }
        }
        // TripSplitters выносим на верхний уровень один раз; удаляем из каждого элемента для уменьшения ответа
        if (!empty($item['TripSplitters']) && empty($splitters)) {
            $splitters = $item['TripSplitters'];
        }
        unset($item['Properties'], $item['TripSplitters'], $item['splitters'],
              $item['Image'], $item['ImageColored'], $item['ImageHue'],
              $item['IsAreaEnabled'], $item['FixedLocation']);
    }
    unset($item);

    json_out([
        'success'   => true,
        'groups'    => $data['Groups'] ?? [],
        'vehicles'  => $items,
        'splitters' => $splitters,
    ]);
    exit;
}

// GET /api/autograf/positions?schemaId=X
// Использует GetOnlineInfoAll — последнее известное GPS-положение всех устройств
if ($sub === '/positions' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    if (!$schemaId) { http_response_code(400); json_out(['success' => false, 'message' => 'schemaId required']); exit; }
    $sid  = ag_session();
    ag_get(ag_base() . '/SelectSchema?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId));
    $url  = ag_base() . '/GetOnlineInfoAll?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId);
    $data = ag_req_retry($url);
    // Нормализация: ответ может быть массивом или словарём; фильтруем null-элементы
    if (!isset($data[0]) && is_array($data)) {
        $data = array_values($data);
    }
    $data = array_values(array_filter($data, fn($v) => $v !== null));
    json_out(['success' => true, 'positions' => $data]);
    exit;
}

// GET /api/autograf/sensors?schemaId=X&deviceId=Y — датчики конкретного ТС
if ($sub === '/sensors' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    $deviceId = $_GET['deviceId'] ?? '';
    if (!$schemaId || !$deviceId) {
        http_response_code(400);
        json_out(['success' => false, 'message' => 'schemaId and deviceId required']);
        exit;
    }
    $sid = ag_session();
    ag_get(ag_base() . '/SelectSchema?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId));

    // GetOnlineInfo для одного устройства — возвращает полный объект с датчиками
    $urlOnline = ag_base() . '/GetOnlineInfo?session=' . rawurlencode($sid)
               . '&schemaID=' . rawurlencode($schemaId)
               . '&IDs='      . rawurlencode($deviceId);
    $online = ag_req_retry($urlOnline);

    // GetPremiumParams — дополнительные параметры (топливо, CAN-шина и т.д.)
    $urlParams = ag_base() . '/GetPremiumParams?session=' . rawurlencode($sid)
               . '&schemaID=' . rawurlencode($schemaId);
    $params = ag_req($urlParams, [$deviceId]);

    // Извлекаем данные устройства из ответа
    $deviceData = null;
    if (is_array($online)) {
        // Ответ может быть массивом или словарём
        if (isset($online[$deviceId])) {
            $deviceData = $online[$deviceId];
        } elseif (isset($online[0])) {
            // Массив — ищем по ID
            foreach ($online as $item) {
                $id = $item['ID'] ?? $item['Id'] ?? $item['DeviceId'] ?? '';
                if ((string)$id === (string)$deviceId) { $deviceData = $item; break; }
            }
            if (!$deviceData) $deviceData = $online[0];
        } else {
            $deviceData = $online;
        }
    }

    $deviceParams = $params[$deviceId] ?? $params[0] ?? null;

    // Парсим датчики из разных полей ответа
    $sensors = [];
    $fin = $deviceData['Final'] ?? $deviceData['final'] ?? [];

    // Датчики из массива Sensors
    $rawSensors = $deviceData['Sensors'] ?? $deviceData['sensors'] ?? [];
    foreach ($rawSensors as $s) {
        $sensors[] = [
            'name'  => $s['Name']  ?? $s['name']  ?? '',
            'value' => $s['Value'] ?? $s['value'] ?? $s['V'] ?? null,
            'unit'  => $s['Unit']  ?? $s['unit']  ?? '',
        ];
    }

    // Известные поля топлива из Final
    $fuelFields = [
        'FuelLevel'      => ['label' => 'Уровень топлива', 'unit' => 'л'],
        'FuelLevel1'     => ['label' => 'Уровень топлива 1', 'unit' => 'л'],
        'FuelLevel2'     => ['label' => 'Уровень топлива 2', 'unit' => 'л'],
        'Consumption1'   => ['label' => 'Расход топлива', 'unit' => 'л/ч'],
        'Consumption2'   => ['label' => 'Расход топлива 2', 'unit' => 'л/ч'],
        'TotalFuel'      => ['label' => 'Всего топлива', 'unit' => 'л'],
        'CANFuelLevel'   => ['label' => 'Топливо (CAN)', 'unit' => 'л'],
        'CANTotalDistance' => ['label' => 'Одометр', 'unit' => 'км'],
        'CurrLocation'   => ['label' => 'Местоположение', 'unit' => ''],
    ];
    $knownFields = [];
    foreach ($fuelFields as $key => $meta) {
        if (isset($fin[$key]) && $fin[$key] !== null && $fin[$key] !== '') {
            $knownFields[$key] = ['label' => $meta['label'], 'value' => $fin[$key], 'unit' => $meta['unit']];
        }
    }

    json_out([
        'success'      => true,
        'deviceId'     => $deviceId,
        'sensors'      => $sensors,       // массив датчиков {name, value, unit}
        'fields'       => $knownFields,   // известные поля из Final
        'params'       => $deviceParams,  // PremiumParams
        '_raw_online'  => $deviceData,    // сырые данные для диагностики
    ]);
    exit;
}

// GET /api/autograf/trips?schemaId=X&deviceId=Y&from=ISO&to=ISO&splitterIdx=N — поездки
if ($sub === '/trips' && $method === 'GET') {
    $schemaId    = $_GET['schemaId']    ?? '';
    $deviceId    = $_GET['deviceId']    ?? '';
    $splitterIdx = $_GET['splitterIdx'] ?? '0';
    $from        = $_GET['from'] ?? date('Y-m-d\T00:00:00');
    $to          = $_GET['to']   ?? date('Y-m-d\T23:59:59');
    if (!$schemaId || !$deviceId) {
        http_response_code(400); json_out(['success' => false, 'message' => 'schemaId and deviceId required']); exit;
    }
    $sid = ag_session();
    $url = ag_base() . '/GetTripsOnly?session=' . rawurlencode($sid)
         . '&schemaID='        . rawurlencode($schemaId)
         . '&IDs='             . rawurlencode($deviceId)
         . '&SD='              . rawurlencode($from)
         . '&ED='              . rawurlencode($to)
         . '&tripSplitterIndex=' . rawurlencode($splitterIdx);
    $data    = ag_req($url);
    $devData = $data[$deviceId] ?? [];
    json_out([
        'success' => true,
        'trips'   => $devData['Trips'] ?? [],
        'total'   => $devData['Total'] ?? [],
        'name'    => $devData['Name']  ?? '',
        'vrn'     => $devData['VRN']   ?? '',
    ]);
    exit;
}

// GET /api/autograf/track?schemaId=X&deviceId=Y&from=ISO&to=ISO&splitterIdx=N — трек
if ($sub === '/track' && $method === 'GET') {
    $schemaId    = $_GET['schemaId']    ?? '';
    $deviceId    = $_GET['deviceId']    ?? '';
    $splitterIdx = $_GET['splitterIdx'] ?? '0';
    $from        = $_GET['from'] ?? date('Y-m-d\T00:00:00');
    $to          = $_GET['to']   ?? date('Y-m-d\T23:59:59');
    if (!$schemaId || !$deviceId) {
        http_response_code(400); json_out(['success' => false, 'message' => 'schemaId and deviceId required']); exit;
    }
    $sid = ag_session();
    $url = ag_base() . '/GetTrack?session=' . rawurlencode($sid)
         . '&schemaID='        . rawurlencode($schemaId)
         . '&IDs='             . rawurlencode($deviceId)
         . '&SD='              . rawurlencode($from)
         . '&ED='              . rawurlencode($to)
         . '&tripSplitterIndex=' . rawurlencode($splitterIdx);
    $data   = ag_req($url);
    $points = $data[$deviceId] ?? [];
    json_out(['success' => true, 'track' => is_array($points) ? $points : []]);
    exit;
}

// GET /api/autograf/params?schemaId=X&splitterId=Y&deviceIds=ID1,ID2,... — параметры
if ($sub === '/params' && $method === 'GET') {
    $schemaId   = $_GET['schemaId']   ?? '';
    $splitterId = $_GET['splitterId'] ?? '';
    $deviceIds  = $_GET['deviceIds']  ?? '';
    if (!$schemaId) { http_response_code(400); json_out(['success' => false, 'message' => 'schemaId required']); exit; }
    $ids = array_values(array_filter(explode(',', $deviceIds)));
    if (empty($ids)) { json_out(['success' => true, 'params' => []]); exit; }
    $sid = ag_session();
    $url = ag_base() . '/GetPremiumParams?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId);
    if ($splitterId !== '') $url .= '&tripSplitterID=' . rawurlencode($splitterId);
    $data = ag_req($url, $ids);
    json_out(['success' => true, 'params' => $data]);
    exit;
}

http_response_code(404);
json_out(['success' => false, 'message' => 'AutoGRAF endpoint not found']);