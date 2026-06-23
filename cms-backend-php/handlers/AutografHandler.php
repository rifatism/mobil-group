<?php
require_once __DIR__ . '/../middleware/Auth.php';
require_once __DIR__ . '/../config/config.php';

Auth::require();

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$sub    = preg_replace('#^/api/autograf#', '', $uri);

// ─── AutoGRAF session cache ───────────────────────────────────────────────────

function ag_base(): string  { return $_ENV['AG_BASE_URL'] ?? 'https://ag.r72.ru/ServiceJSON'; }
function ag_user(): string  { return $_ENV['AG_USERNAME']  ?? 'testapi'; }
function ag_pass(): string  { return $_ENV['AG_PASSWORD']  ?? '1234'; }

function ag_session(): string {
    $cache = sys_get_temp_dir() . '/ag_sid_' . md5(ag_user() . ag_pass()) . '.json';
    if (file_exists($cache)) {
        $d = json_decode(file_get_contents($cache), true);
        if ($d && !empty($d['sid']) && ($d['exp'] ?? 0) > time()) {
            return $d['sid'];
        }
    }
    $url = ag_base() . '/Login?UserName=' . rawurlencode(ag_user()) . '&Password=' . rawurlencode(ag_pass());
    $sid = trim(ag_get($url), " \t\n\r\0\x0B\"");
    file_put_contents($cache, json_encode(['sid' => $sid, 'exp' => time() + 1500]));
    return $sid;
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

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/autograf/schemas
if ($sub === '/schemas' && $method === 'GET') {
    $sid  = ag_session();
    $url  = ag_base() . '/EnumSchemas?session=' . rawurlencode($sid);
    $data = ag_req($url);
    if (empty($data)) {
        // refresh session and retry
        @unlink(sys_get_temp_dir() . '/ag_sid_' . md5(ag_user() . ag_pass()) . '.json');
        $sid  = ag_session();
        $data = ag_req(ag_base() . '/EnumSchemas?session=' . rawurlencode($sid));
    }
    json_out(['success' => true, 'schemas' => $data]);
    exit;
}

// GET /api/autograf/vehicles?schemaId=X
// Returns devices with Groups hierarchy
if ($sub === '/vehicles' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    if (!$schemaId) { http_response_code(400); json_out(['success' => false, 'message' => 'schemaId required']); exit; }
    $sid = ag_session();
    ag_get(ag_base() . '/SelectSchema?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId));
    $url  = ag_base() . '/EnumDevices?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId);
    $data = ag_req($url);

    // Extract reg numbers from Properties
    $items = $data['Items'] ?? [];
    foreach ($items as &$item) {
        $item['_regNum'] = '';
        foreach ($item['Properties'] ?? [] as $p) {
            if ($p['Name'] === 'VehicleRegNumber' && !empty($p['Value'])) {
                $item['_regNum'] = (string)$p['Value'];
                break;
            }
        }
        unset($item['Properties']); // slim down response
    }
    unset($item);

    // TripSplitters are per-item; take them from the first item that has them
    $splitters = [];
    foreach ($items as $it) {
        if (!empty($it['TripSplitters'])) { $splitters = $it['TripSplitters']; break; }
    }

    json_out([
        'success'   => true,
        'groups'    => $data['Groups'] ?? [],
        'vehicles'  => $items,
        'splitters' => $splitters,
    ]);
    exit;
}

// GET /api/autograf/positions?schemaId=X
// Uses GetOnlineInfoAll — last known GPS for all devices
if ($sub === '/positions' && $method === 'GET') {
    $schemaId = $_GET['schemaId'] ?? '';
    if (!$schemaId) { http_response_code(400); json_out(['success' => false, 'message' => 'schemaId required']); exit; }
    $sid  = ag_session();
    $url  = ag_base() . '/GetOnlineInfoAll?session=' . rawurlencode($sid) . '&schemaID=' . rawurlencode($schemaId);
    $data = ag_req($url);
    // Normalize: response is array or dict
    if (isset($data[0])) {
        // already array
    } elseif (is_array($data)) {
        $data = array_values($data);
    }
    json_out(['success' => true, 'positions' => $data]);
    exit;
}

// GET /api/autograf/trips?schemaId=X&deviceId=Y&from=ISO&to=ISO&splitterIdx=N
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

// GET /api/autograf/track?schemaId=X&deviceId=Y&from=ISO&to=ISO&splitterIdx=N
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

// GET /api/autograf/params?schemaId=X&splitterId=Y&deviceIds=ID1,ID2,...
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