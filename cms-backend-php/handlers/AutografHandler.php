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

    // GetPremiumParams — пробуем без splitter и с каждым переданным splitter ID
    $splitterIds = array_values(array_filter(explode(',', $_GET['splitterIds'] ?? '')));
    $splitterIdsToTry = array_merge([''], $splitterIds); // '' = без splitter (первый попытка)
    $params        = [];
    $paramsRaw     = [];
    $paramsSplitter = '';
    foreach ($splitterIdsToTry as $splId) {
        $urlP = ag_base() . '/GetPremiumParams?session=' . rawurlencode($sid)
              . '&schemaID=' . rawurlencode($schemaId);
        if ($splId !== '') $urlP .= '&tripSplitterID=' . rawurlencode($splId);
        $pRaw = ag_req_retry($urlP, [$deviceId]);
        $paramsRaw[$splId ?: 'no_splitter'] = $pRaw;
        // Ищем данные устройства в ответе
        $pDev = $pRaw[$deviceId] ?? $pRaw[(int)$deviceId]
             ?? (count($pRaw) === 1 ? reset($pRaw) : null);
        if ($pDev !== null && !empty($pDev)) {
            $params = $pRaw;
            $paramsSplitter = $splId;
            break;
        }
    }
    $deviceParams = $params[$deviceId] ?? $params[(int)$deviceId]
                 ?? (count($params) === 1 ? reset($params) : null);

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

    // Все ненулевые поля из Final — отдаём целиком для диагностики
    $allFinalFields = [];
    foreach ($fin as $key => $val) {
        if ($val !== null && $val !== '' && $val !== 0 && $val !== 0.0) {
            $allFinalFields[$key] = $val;
        }
    }

    // Известные поля топлива из Final (для удобного доступа в JS)
    $fuelFields = [
        'FuelLevel'        => ['label' => 'Уровень топлива',   'unit' => 'л'],
        'FuelLevel1'       => ['label' => 'Бак 1 (уровень)',   'unit' => 'л'],
        'FuelLevel2'       => ['label' => 'Бак 2 (уровень)',   'unit' => 'л'],
        'FuelLevel3'       => ['label' => 'Бак 3 (уровень)',   'unit' => 'л'],
        'TotalFuelLevel'   => ['label' => 'Общий бак',         'unit' => 'л'],
        'TotalFuel'        => ['label' => 'Всего топлива',     'unit' => 'л'],
        'CANFuelLevel'     => ['label' => 'Топливо (CAN)',     'unit' => 'л'],
        'FuelSensor'       => ['label' => 'ДУТ',               'unit' => 'л'],
        'FuelSensor1'      => ['label' => 'ДУТ 1',             'unit' => 'л'],
        'FuelSensor2'      => ['label' => 'ДУТ 2',             'unit' => 'л'],
        'Consumption1'     => ['label' => 'Расход (л/100км)', 'unit' => 'л/100км'],
        'Consumption2'     => ['label' => 'Расход 2',         'unit' => 'л/ч'],
        'CANTotalDistance' => ['label' => 'Одометр',          'unit' => 'км'],
        'CurrLocation'     => ['label' => 'Местоположение',   'unit' => ''],
    ];
    $knownFields = [];
    foreach ($fuelFields as $key => $meta) {
        if (isset($fin[$key]) && $fin[$key] !== null && $fin[$key] !== '') {
            $knownFields[$key] = ['label' => $meta['label'], 'value' => $fin[$key], 'unit' => $meta['unit']];
        }
    }

    // После ag_req_retry сессия могла обновиться — берём актуальную
    $sid = ag_session();

    // Стратегия получения топлива: GetTripItems (табличные данные в точках трека)
    // и GetTrips (рейсы + стоянки, в отличие от GetTripsOnly)
    $today    = date('Y-m-d');
    $dateFrom1y = date('Y-m-d', strtotime('-365 days')) . 'T00:00:00';
    $dateTo   = $today . 'T23:59:59';
    $dateFromToday = $today . 'T00:00:00';
    $lastTrip   = null;
    $tripItems  = [];
    $tripsDebug = ['device_id' => $deviceId];

    // 1. GetTripItems за сегодня — значения ДУТ в каждой GPS-точке трека
    $urlItems = ag_base() . '/GetTripItems?session=' . rawurlencode($sid)
              . '&schemaID=' . rawurlencode($schemaId)
              . '&IDs='      . rawurlencode($deviceId)
              . '&SD='       . rawurlencode($dateFromToday)
              . '&ED='       . rawurlencode($dateTo);
    $itemsRaw = ag_req($urlItems);
    $itemsDev = $itemsRaw[$deviceId] ?? $itemsRaw[(int)$deviceId]
             ?? (count($itemsRaw) === 1 ? reset($itemsRaw) : null);
    $tripItems = $itemsDev['Items'] ?? $itemsDev['Rows'] ?? $itemsDev['Data'] ?? [];
    $tripsDebug['trip_items'] = count($tripItems);
    $tripsDebug['items_raw_preview'] = mb_substr(json_encode($itemsRaw), 0, 400);

    // 2. GetTrips (рейсы + отрезки, включая стоянки) — 1 год
    $urlGetTrips = ag_base() . '/GetTrips?session=' . rawurlencode($sid)
                 . '&schemaID='          . rawurlencode($schemaId)
                 . '&IDs='               . rawurlencode($deviceId)
                 . '&SD='                . rawurlencode($dateFrom1y)
                 . '&ED='                . rawurlencode($dateTo)
                 . '&tripSplitterIndex=0';
    $getTripsRaw = ag_req($urlGetTrips);
    $getTripsdev = $getTripsRaw[$deviceId] ?? $getTripsRaw[(int)$deviceId]
                ?? (count($getTripsRaw) === 1 ? reset($getTripsRaw) : null);
    $allSegments  = $getTripsdev['Trips'] ?? $getTripsdev['Segments'] ?? $getTripsdev['Items'] ?? [];
    $tripsDebug['get_trips_count'] = count($allSegments);
    $tripsDebug['get_trips_keys']  = $getTripsdev ? array_keys($getTripsdev) : [];

    $getTripsTotal = $getTripsdev['Total'] ?? null;

    if (!empty($allSegments)) {
        $lastTrip = end($allSegments);
    }

    // 3. GetCountersValues — счётчики техконтроля (могут включать уровень топлива)
    $urlCounters = ag_base() . '/GetCountersValues?session=' . rawurlencode($sid)
                 . '&schemaID=' . rawurlencode($schemaId)
                 . '&IDs='      . rawurlencode($deviceId);
    $countersRaw = ag_req($urlCounters);
    $countersDev = $countersRaw[$deviceId] ?? $countersRaw[(int)$deviceId]
                ?? (count($countersRaw) === 1 ? reset($countersRaw) : null);
    $tripsDebug['counters_raw']    = mb_substr(json_encode($countersRaw), 0, 300);
    $tripsDebug['get_trips_total'] = $getTripsTotal;

    // Все ключи верхнего уровня deviceData (для поиска скрытых полей с топливом)
    $rawOnlineKeys = $deviceData ? array_keys($deviceData) : [];

    // Все числовые поля верхнего уровня deviceData (не вложенные объекты)
    $rawOnlineFlat = [];
    foreach ($deviceData ?? [] as $k => $v) {
        if (!is_array($v) && !is_object($v) && $v !== null && $v !== '') {
            $rawOnlineFlat[$k] = $v;
        }
    }

    json_out([
        'success'           => true,
        'deviceId'          => $deviceId,
        'sensors'           => $sensors,
        'fields'            => $knownFields,
        'final_all'         => $allFinalFields,
        'params'            => $deviceParams,
        'params_splitter'   => $paramsSplitter,
        'params_raw'        => $paramsRaw,
        'last_trip'         => $lastTrip,
        'trip_items'        => array_slice($tripItems, -3),  // последние 3 точки трека
        '_trips_debug'      => $tripsDebug,
        '_raw_online'       => $deviceData,
        '_raw_online_keys'  => $rawOnlineKeys,
        '_raw_online_flat'  => $rawOnlineFlat,
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

// GET /api/autograf/fuel-debug?schemaId=X&deviceId=Y — сырой ответ GetTripsOnly для диагностики
if ($sub === '/fuel-debug' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    $deviceId = $_GET['deviceId'] ?? '';
    $sid = ag_session();
    ag_get(ag_base() . '/SelectSchema?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId));
    $dateFrom = date('Y-m-d', strtotime('-7 days')) . 'T00:00:00';
    $dateTo   = date('Y-m-d') . 'T23:59:59';
    $url = ag_base() . '/GetTripsOnly?session=' . rawurlencode($sid)
         . '&schemaID=' . rawurlencode($schemaId)
         . '&IDs='      . rawurlencode($deviceId)
         . '&SD='       . rawurlencode($dateFrom)
         . '&ED='       . rawurlencode($dateTo)
         . '&tripSplitterIndex=0';
    $raw = ag_req($url);
    // Берём первый попавшийся ключ с данными
    $devData = $raw[$deviceId] ?? $raw[(int)$deviceId] ?? (count($raw) === 1 ? reset($raw) : null);
    $trips   = $devData['Trips'] ?? [];
    $last    = !empty($trips) ? end($trips) : null;
    json_out([
        'total_trips'       => count($trips),
        'last_trip_keys'    => $last ? array_keys($last) : [],
        'last_trip'         => $last,
        'raw_keys'          => array_keys($raw),
        '_raw_full'         => $raw,
    ]);
    exit;
}

http_response_code(404);
json_out(['success' => false, 'message' => 'AutoGRAF endpoint not found']);