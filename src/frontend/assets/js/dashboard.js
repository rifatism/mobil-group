// ─── Config ───────────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';
const AG  = API + '/api/autograf';
const REFRESH_MS = 60_000;

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  schemaId:      '',
  schemaName:    '',
  groups:        [],   // [{ID, ParentID, Name}]
  vehicles:      [],   // [{ID, ParentID, Name, _regNum, TripSplitters}]
  positions:     {},   // {deviceId -> parsed position}
  selectedId:    null, // selected vehicle ID
  selectedName:  '',
  splitters:     [],   // [{ID, Name}]
  splitterIdx:   0,
  dateFrom:      '',
  dateTo:        '',
  trips:         [],
  selectedTrip:  null,
  refreshTimer:  null,
  markers:       {},   // {deviceId -> L.Marker}
  trackLayer:    null,
  map:           null,
  markerStart:   null,
  markerEnd:     null,
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('cms_token'); }
function getUser()  { const u = localStorage.getItem('cms_user'); try { return JSON.parse(u); } catch { return null; } }

function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

function logout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  location.href = 'index.html';
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function toISOLocal(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtNum(v, dec = 1) {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  return Number(v).toFixed(dec);
}

// ─── Period setup (defaults to today, full day) ───────────────────────────────
function applyShift() {
  const today = todayStr();
  state.dateFrom = toISOLocal(today, '00:00:00');
  state.dateTo   = toISOLocal(today, '23:59:59');
}

function readDates() {
  // Dates are fixed to today (no UI picker)
}

// ─── Map init ─────────────────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('db-map');
  state.map = L.map(container, { zoomControl: false }).setView([62, 70], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(state.map);
  L.control.zoom({ position: 'topright' }).addTo(state.map);
}

function makePin(status) {
  const cls = status === 'moving' ? 'moving' : status === 'parked' ? 'parked' : 'offline';
  const svgInner = status === 'moving'
    ? '<path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<rect x="1" y="3" width="15" height="13" rx="1" stroke="#fff" stroke-width="1.5"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" stroke="#fff" stroke-width="1.5"/><circle cx="5.5" cy="18.5" r="2.5" stroke="#fff" stroke-width="1.5"/><circle cx="18.5" cy="18.5" r="2.5" stroke="#fff" stroke-width="1.5"/>';
  return L.divIcon({
    className: '',
    html: `<div class="veh-marker"><div class="veh-marker-pin ${cls}"><svg viewBox="0 0 24 24" fill="none">${svgInner}</svg></div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32],
  });
}

function vehicleStatus(pos) {
  if (!pos) return 'offline';
  // Use raw state field: 0=engine off (but may be parked/transmitting), 1=engine on
  // Determine online/offline purely by age of last GPS fix (7 days = definitively no signal)
  const age = pos.time ? (Date.now() - new Date(pos.time).getTime()) / 1000 : 99999;
  if (age > 604800) return 'offline'; // > 7 days → definitely offline
  if (pos.speed > 1) return 'moving';
  return 'parked'; // engine off OR on but stationary — both show as parked
}

function parsePositions(raw) {
  const result = {};
  const parseOne = p => {
    const lp = p.LastPosition ?? p.lastPosition ?? {};
    return {
      lat:     lp.Lat  ?? lp.lat  ?? p.Lat  ?? null,
      lon:     lp.Lng  ?? lp.lng  ?? lp.Lon ?? p.Lng ?? null,
      speed:   p.Speed ?? p.speed ?? 0,
      time:    p.DT ?? p.DTLocal ?? p.LastData ?? null,
      address: p.Address ?? '',
      state:   p.State ?? -1,
      course:  p.Course ?? 0,
    };
  };
  if (Array.isArray(raw)) {
    raw.forEach(p => {
      const id = String(p.ID ?? p.Id ?? p.DeviceId ?? '');
      if (id) result[id] = parseOne(p);
    });
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([id, p]) => {
      if (p && typeof p === 'object') result[String(id)] = parseOne(p);
    });
  }
  return result;
}

function clearAllMarkers() {
  Object.values(state.markers).forEach(m => state.map?.removeLayer(m));
  state.markers = {};
}

function placeMarkers() {
  const map = state.map;
  if (!map) return;
  map.invalidateSize(); // ensure correct dimensions after flex layout
  const bounds = [];

  state.vehicles.forEach(v => {
    const pos = state.positions[v.ID];
    const st  = vehicleStatus(pos);
    const lat = pos?.lat != null ? Number(pos.lat) : null;
    const lon = pos?.lon != null ? Number(pos.lon) : null;

    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
      const icon = makePin(st);
      const popupContent = buildPopup(v, pos, st);

      if (state.markers[v.ID]) {
        state.markers[v.ID].setLatLng([lat, lon]).setIcon(icon).setPopupContent(popupContent);
      } else {
        const m = L.marker([lat, lon], { icon }).addTo(map).bindPopup(L.popup({ maxWidth: 240 }).setContent(popupContent));
        m.on('click', () => selectVehicleById(v.ID));
        state.markers[v.ID] = m;
      }
      bounds.push([lat, lon]);
    }
  });

  if (bounds.length && !state.selectedId) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
}

function buildPopup(v, pos, st) {
  const stLabel = st === 'moving' ? '🟢 В движении' : st === 'parked' ? '🟡 Стоянка' : '⚫ Нет связи';
  const speed   = pos?.speed > 0 ? `<div class="lp-row"><b>Скорость:</b> ${fmtNum(pos.speed)} км/ч</div>` : '';
  const addr    = pos?.address    ? `<div class="lp-row">${pos.address}</div>` : '';
  const time    = pos?.time       ? `<div class="lp-row"><b>Данные:</b> ${fmtDateTime(pos.time)}</div>` : '';
  const reg     = v._regNum       ? ` · <span style="color:#888">${v._regNum}</span>` : '';
  return `<div class="lp-name">${v.Name}${reg}</div>
          <div class="lp-row">${stLabel}</div>${speed}${addr}${time}`;
}

// ─── Vehicle Tree ─────────────────────────────────────────────────────────────
function buildTree() {
  const tree = document.getElementById('sb-tree');
  tree.innerHTML = '';

  if (!state.vehicles.length) {
    tree.innerHTML = '<div class="sb-loading"><span>Нет данных</span></div>';
    return;
  }

  // Build group hierarchy
  const groupMap = {};
  state.groups.forEach(g => { groupMap[g.ID] = { ...g, children: [], vehicles: [] }; });

  // Attach vehicles to their parent group
  state.vehicles.forEach(v => {
    const pid = v.ParentID;
    if (pid && groupMap[pid]) groupMap[pid].vehicles.push(v);
    else if (!pid) {
      // top-level vehicle without group — append to orphan bucket
      if (!groupMap['__orphan__']) groupMap['__orphan__'] = { ID: '__orphan__', Name: '', children: [], vehicles: [] };
      groupMap['__orphan__'].vehicles.push(v);
    }
  });

  // Build group tree (parent-child links)
  const roots = [];
  state.groups.forEach(g => {
    const pid = g.ParentID;
    if (pid && groupMap[pid]) groupMap[pid].children.push(groupMap[g.ID]);
    else roots.push(groupMap[g.ID]);
  });

  // If no groups, just list vehicles flat
  if (!roots.length) {
    renderVehicleList(tree, state.vehicles);
    return;
  }

  roots.forEach(g => renderGroup(tree, g, 0));

  // Orphaned vehicles (no group)
  if (groupMap['__orphan__']) {
    renderVehicleList(tree, groupMap['__orphan__'].vehicles);
  }

  updateTreeStatuses();
}

function renderGroup(parent, group, depth) {
  const allVehicles = collectVehicles(group);
  if (!allVehicles.length) return;

  const el = document.createElement('div');
  el.className = 'tree-group';
  el.dataset.gid = group.ID;

  const head = document.createElement('div');
  head.className = 'tree-group-head';
  head.style.paddingLeft = (12 + depth * 14) + 'px';
  head.innerHTML = `
    <svg class="tree-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    <span class="tg-name">${group.Name}</span>
    <span class="tg-count">${allVehicles.length}</span>`;
  head.addEventListener('click', () => el.classList.toggle('collapsed'));

  const children = document.createElement('div');
  children.className = 'tree-group-children';

  // Render sub-groups first
  group.children.forEach(child => renderGroup(children, child, depth + 1));
  // Then vehicles
  group.vehicles.forEach(v => renderVehicleItem(children, v, depth + 1));

  el.append(head, children);
  parent.appendChild(el);
}

function renderVehicleList(parent, vehicles) {
  vehicles.forEach(v => renderVehicleItem(parent, v, 0));
}

function renderVehicleItem(parent, v, depth) {
  const el = document.createElement('div');
  el.className = 'tree-vehicle';
  el.dataset.vid = v.ID;
  el.style.paddingLeft = (28 + depth * 14) + 'px';
  el.innerHTML = `<span class="tv-dot offline"></span><span class="tv-name">${v.Name}</span><span class="tv-speed"></span>`;
  el.addEventListener('click', () => selectVehicle(v, el));
  parent.appendChild(el);
}

function collectVehicles(group) {
  let result = [...group.vehicles];
  group.children.forEach(c => result = result.concat(collectVehicles(c)));
  return result;
}

function updateTreeStatuses() {
  document.querySelectorAll('.tree-vehicle').forEach(el => {
    const id  = el.dataset.vid;
    const pos = state.positions[id];
    const st  = vehicleStatus(pos);
    const dot = el.querySelector('.tv-dot');
    const spd = el.querySelector('.tv-speed');
    dot.className = `tv-dot ${st}`;
    el.classList.toggle('moving', st === 'moving');
    if (st === 'moving' && pos?.speed > 0) {
      spd.textContent = fmtNum(pos.speed, 0) + ' км/ч';
    } else if (st === 'parked') {
      spd.textContent = ''; // parked — no speed shown
    } else {
      spd.textContent = ''; // offline
    }
  });

  // Stats
  let moving = 0, parked = 0, offline = 0;
  state.vehicles.forEach(v => {
    const s = vehicleStatus(state.positions[v.ID]);
    if (s === 'moving')  moving++;
    else if (s === 'parked') parked++;
    else offline++;
  });
  document.getElementById('stat-moving').textContent  = moving;
  document.getElementById('stat-parked').textContent  = parked;
  document.getElementById('stat-offline').textContent = offline;
  document.getElementById('stat-total').textContent   = state.vehicles.length;
}

// ─── Vehicle selection ────────────────────────────────────────────────────────
function selectVehicle(v, el) {
  if (state.selectedId === v.ID) return;
  state.selectedId   = v.ID;
  state.selectedName = v.Name + (v._regNum ? ' · ' + v._regNum : '');

  document.querySelectorAll('.tree-vehicle').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');

  document.getElementById('tb-vehicle-name').textContent = v.Name;

  clearTrack();
  loadTrips();

  // Pan to vehicle marker if it has valid coordinates
  const pos = state.positions[v.ID];
  const lat = pos ? Number(pos.lat) : null;
  const lon = pos ? Number(pos.lon) : null;
  if (state.map && lat != null && lon != null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
    state.map.setView([lat, lon], 13, { animate: true });
    state.markers[v.ID]?.openPopup();
  }
}

function selectVehicleById(id) {
  const v = state.vehicles.find(x => x.ID === id);
  if (!v) return;
  const el = document.querySelector(`.tree-vehicle[data-vid="${id}"]`);
  if (el) selectVehicle(v, el);
}

// ─── Schema loading ───────────────────────────────────────────────────────────
async function loadSchemas() {
  const data = await apiFetch(`${AG}/schemas`);
  if (!data?.success) return;

  const sel = document.getElementById('db-schema-select');
  sel.innerHTML = '';
  (data.schemas || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.ID ?? s.Id ?? '';
    opt.textContent = s.Name ?? s.name ?? s.ID;
    sel.appendChild(opt);
  });

  // Register listener BEFORE initial loadVehicles so it's always active
  sel.addEventListener('change', () => {
    state.schemaId   = sel.value;
    state.schemaName = sel.options[sel.selectedIndex]?.text || '';
    document.getElementById('tb-schema-name').textContent = state.schemaName;
    state.selectedId   = null;
    state.selectedName = '';
    state.trips        = [];
    resetTripsUI();
    loadVehicles(); // fire-and-forget — no await needed here
  });

  if (data.schemas?.length) {
    state.schemaId   = sel.value;
    state.schemaName = sel.options[sel.selectedIndex]?.text || '';
    document.getElementById('tb-schema-name').textContent = state.schemaName;
    await loadVehicles();
  }
}

// ─── Vehicles + tree ─────────────────────────────────────────────────────────
async function loadVehicles() {
  clearAllMarkers();
  clearTrack();
  state.positions = {};
  state.vehicles  = [];
  state.groups    = [];
  document.getElementById('tb-vehicle-name').textContent = 'Все ТС';

  const tree = document.getElementById('sb-tree');
  tree.innerHTML = '<div class="sb-loading"><div class="sb-spinner"></div><span>Загрузка...</span></div>';

  let data;
  try {
    data = await apiFetch(`${AG}/vehicles?schemaId=${encodeURIComponent(state.schemaId)}`);
  } catch (e) {
    console.error('[vehicles] fetch error:', e);
    tree.innerHTML = `<div class="sb-loading"><span>Ошибка сети: ${e.message}</span></div>`;
    return;
  }

  if (!data?.success) {
    console.warn('[vehicles] bad response:', data);
    tree.innerHTML = `<div class="sb-loading"><span>Ошибка: ${data?.message || 'нет данных'}</span></div>`;
    return;
  }

  state.groups    = data.groups    || [];
  state.vehicles  = data.vehicles  || [];
  state.splitters = data.splitters || [];
  console.log(`[vehicles] schema=${state.schemaId} groups=${state.groups.length} vehicles=${state.vehicles.length}`);

  try {
    buildTree();
  } catch (e) {
    console.error('[buildTree] error:', e);
    tree.innerHTML = `<div class="sb-loading"><span>Ошибка дерева: ${e.message}</span></div>`;
    return;
  }

  await loadPositions();
}


// ─── Positions ────────────────────────────────────────────────────────────────
async function loadPositions() {
  let data;
  try {
    data = await apiFetch(`${AG}/positions?schemaId=${encodeURIComponent(state.schemaId)}`);
  } catch (e) {
    console.error('[positions] fetch error:', e);
    return;
  }
  if (!data?.success) { console.warn('[positions] bad response:', data); return; }

  state.positions = parsePositions(data.positions || []);
  console.log(`[positions] parsed=${Object.keys(state.positions).length}`);

  try {
    placeMarkers();
  } catch (e) {
    console.error('[placeMarkers] error:', e);
  }
  updateTreeStatuses();
}

// ─── Trips ────────────────────────────────────────────────────────────────────
async function loadTrips() {
  if (!state.selectedId || !state.schemaId) return;

  readDates();
  const params = new URLSearchParams({
    schemaId:    state.schemaId,
    deviceId:    state.selectedId,
    from:        state.dateFrom,
    to:          state.dateTo,
    splitterIdx: state.splitterIdx,
  });

  const emptyEl = document.getElementById('trips-empty');
  const table   = document.getElementById('trips-table');
  emptyEl.innerHTML = '<div class="sb-spinner" style="border-top-color:var(--blue);border-color:#e5e7eb;"></div>';
  emptyEl.hidden = false;
  table.hidden = true;

  const data = await apiFetch(`${AG}/trips?${params}`);
  state.trips = data?.trips || [];

  document.getElementById('trips-title').textContent = `Рейсы — ${state.selectedName}`;
  renderTripsTable();
}

function renderTripsTable() {
  const emptyEl = document.getElementById('trips-empty');
  const table   = document.getElementById('trips-table');
  const tbody   = document.getElementById('trips-tbody');
  const tfoot   = document.getElementById('trips-tfoot');

  if (!state.trips.length) {
    emptyEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;opacity:.2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg><p>Рейсы не найдены за выбранный период</p>';
    emptyEl.hidden = false;
    table.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  table.hidden = false;
  tbody.innerHTML = '';

  let totDist = 0, totMaxSpd = 0, totAvgSpd = 0;

  state.trips.forEach((trip, idx) => {
    // Flexible field extraction to handle different AutoGRAF response variants
    const bt     = trip.BT ?? trip.BeginTime ?? trip.beginTime ?? trip.SD ?? '';
    const et     = trip.ET ?? trip.EndTime   ?? trip.endTime   ?? trip.ED ?? '';
    const dist   = trip.M  ?? trip.Mileage   ?? trip.mileage   ?? trip.Distance ?? null;
    const maxSpd = trip.MaxSpeed ?? trip.Mxs ?? trip.maxSpeed  ?? null;
    const avgSpd = trip.AvgSpeed ?? trip.Avs ?? trip.avgSpeed  ?? null;
    const addrS  = trip.SA ?? trip.StartAddress ?? trip.startAddress ?? trip.AddressFrom ?? '';
    const addrE  = trip.EA ?? trip.EndAddress   ?? trip.endAddress   ?? trip.AddressTo   ?? '';

    // Fuel sensors (optional)
    const sensors = trip.Sensors ?? trip.sensors ?? [];
    const fuelStart = extractSensor(sensors, ['Уровень нач', 'FuelStart', 'ДУТ нач', 'Fuel', 'Level']);
    const fuelEnd   = extractSensor(sensors, ['Уровень кон', 'FuelEnd',   'ДУТ кон']);
    const fuelCons  = extractSensor(sensors, ['Расход', 'Consumption', 'Consume']);

    if (dist != null) totDist   += Number(dist);
    if (maxSpd != null && Number(maxSpd) > totMaxSpd) totMaxSpd = Number(maxSpd);
    if (avgSpd != null) totAvgSpd += Number(avgSpd);

    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td class="col-num">${idx + 1}</td>
      <td class="col-date">${fmtDateTime(bt)}</td>
      <td class="col-date">${fmtDateTime(et)}</td>
      <td class="col-num" style="text-align:right">${dist != null ? fmtNum(dist) : '—'}</td>
      <td class="col-num" style="text-align:right">${maxSpd != null ? fmtNum(maxSpd, 0) : '—'}</td>
      <td class="col-num" style="text-align:right">${avgSpd != null ? fmtNum(avgSpd, 0) : '—'}</td>
      <td class="col-addr" title="${addrS}">${addrS || '—'}</td>
      <td class="col-addr" title="${addrE}">${addrE || '—'}</td>
      <td class="col-fuel" style="text-align:right">${fuelStart ?? '—'}</td>
      <td class="col-fuel" style="text-align:right">${fuelEnd   ?? '—'}</td>
      <td class="col-fuel" style="text-align:right">${fuelCons  ?? '—'}</td>`;
    tr.addEventListener('click', () => selectTrip(idx, tr, trip));
    tbody.appendChild(tr);
  });

  // Footer totals
  const cnt = state.trips.length;
  tfoot.innerHTML = `<tr>
    <td class="col-num" colspan="3">Итого рейсов: ${cnt}</td>
    <td class="col-num" style="text-align:right">${fmtNum(totDist)}</td>
    <td class="col-num" style="text-align:right">${fmtNum(totMaxSpd, 0)}</td>
    <td class="col-num" style="text-align:right">${cnt > 0 ? fmtNum(totAvgSpd / cnt, 0) : '—'}</td>
    <td colspan="5"></td>
  </tr>`;
}

function extractSensor(sensors, keys) {
  if (!Array.isArray(sensors) || !sensors.length) return null;
  for (const s of sensors) {
    const name = s.Name ?? s.name ?? '';
    if (keys.some(k => name.toLowerCase().includes(k.toLowerCase()))) {
      const v = s.Value ?? s.value ?? s.V ?? s.v;
      if (v != null) return fmtNum(v);
    }
  }
  return null;
}

// ─── Trip selection → load track ─────────────────────────────────────────────
async function selectTrip(idx, rowEl, trip) {
  state.selectedTrip = idx;
  document.querySelectorAll('#trips-tbody tr').forEach(r => r.classList.remove('selected'));
  rowEl.classList.add('selected');

  clearTrack();

  const bt = trip.BT ?? trip.BeginTime ?? trip.beginTime ?? trip.SD ?? '';
  const et = trip.ET ?? trip.EndTime   ?? trip.endTime   ?? trip.ED ?? '';
  if (!bt || !et) return;

  // Show loading
  document.getElementById('map-loading').hidden = false;

  const params = new URLSearchParams({
    schemaId:    state.schemaId,
    deviceId:    state.selectedId,
    from:        bt,
    to:          et,
    splitterIdx: state.splitterIdx,
  });

  const data = await apiFetch(`${AG}/track?${params}`);
  document.getElementById('map-loading').hidden = true;

  const points = data?.track || [];
  if (!points.length) {
    showMapInfo('Трек не найден для данного рейса');
    return;
  }

  drawTrack(points, bt, et);
}

function drawTrack(points, bt, et) {
  const map = state.map;
  const latLngs = points
    .map(p => {
      const lat = p.Lat ?? p.lat;
      const lng = p.Lng ?? p.lng ?? p.Lon ?? p.lon;
      return (lat && lng) ? [lat, lng] : null;
    })
    .filter(Boolean);

  if (!latLngs.length) return;

  // Draw polyline
  state.trackLayer = L.polyline(latLngs, { color: '#1976d2', weight: 4, opacity: .85, lineJoin: 'round' }).addTo(map);

  // Start marker (green)
  const startIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
  // End marker (red)
  const endIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7],
  });

  state.markerStart = L.marker(latLngs[0], { icon: startIcon }).addTo(map)
    .bindPopup(`<b>Начало рейса</b><br>${fmtDateTime(bt)}`);
  state.markerEnd = L.marker(latLngs[latLngs.length - 1], { icon: endIcon }).addTo(map)
    .bindPopup(`<b>Конец рейса</b><br>${fmtDateTime(et)}`);

  map.fitBounds(state.trackLayer.getBounds(), { padding: [40, 40] });

  const info = `${fmtDateTime(bt)} → ${fmtTime(et)} · ${points.length} точек`;
  showMapInfo(info);
}

function clearTrack() {
  const map = state.map;
  if (state.trackLayer)   { map.removeLayer(state.trackLayer);  state.trackLayer  = null; }
  if (state.markerStart)  { map.removeLayer(state.markerStart); state.markerStart = null; }
  if (state.markerEnd)    { map.removeLayer(state.markerEnd);   state.markerEnd   = null; }
  document.getElementById('map-info-bar').hidden = true;
}

function showMapInfo(text) {
  const bar = document.getElementById('map-info-bar');
  document.getElementById('map-info-trip').textContent = text;
  bar.hidden = false;
}

// ─── Drag handle (resize trips ↕ map) ────────────────────────────────────────
function initDragHandle() {
  const handle    = document.getElementById('drag-handle');
  const container = document.getElementById('split-container');
  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startH = document.getElementById('trips-pane').offsetHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta  = e.clientY - startY;
    const newH   = Math.max(80, Math.min(startH + delta, container.clientHeight - 120));
    document.documentElement.style.setProperty('--trips-h', newH + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    state.map?.invalidateSize();
  });
}

// ─── Sidebar collapse ─────────────────────────────────────────────────────────
function initSidebar() {
  document.getElementById('sb-collapse').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sb-expand').style.display = 'flex';
    setTimeout(() => state.map?.invalidateSize(), 300);
  });

  document.getElementById('sb-expand').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('collapsed');
    document.getElementById('sb-expand').style.display = '';
    setTimeout(() => state.map?.invalidateSize(), 300);
  });
}

// ─── Search filter ────────────────────────────────────────────────────────────
function initSearch() {
  document.getElementById('sb-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.tree-vehicle').forEach(el => {
      const name = (el.querySelector('.tv-name')?.textContent || '').toLowerCase();
      el.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
    document.querySelectorAll('.tree-group').forEach(g => {
      const anyVisible = [...g.querySelectorAll('.tree-vehicle')].some(v => v.style.display !== 'none');
      g.style.display = anyVisible ? '' : 'none';
    });
  });
}


// ─── Refresh ──────────────────────────────────────────────────────────────────
async function refreshAll() {
  if (!state.schemaId) return;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  await loadPositions();
  btn.classList.remove('spinning');
}

function initRefresh() {
  document.getElementById('refresh-btn').addEventListener('click', refreshAll);
  state.refreshTimer = setInterval(refreshAll, REFRESH_MS);
}

// ─── Map clear button ─────────────────────────────────────────────────────────
function initMapClear() {
  document.getElementById('map-clear-btn').addEventListener('click', () => {
    clearTrack();
    document.querySelectorAll('#trips-tbody tr').forEach(r => r.classList.remove('selected'));
    state.selectedTrip = null;
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────
function resetTripsUI() {
  document.getElementById('trips-title').textContent = 'Рейсы';
  document.getElementById('trips-empty').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;opacity:.25"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
    <p>Выберите транспортное средство<br>для просмотра рейсов</p>`;
  document.getElementById('trips-empty').hidden = false;
  document.getElementById('trips-table').hidden = true;
  document.getElementById('trips-tbody').innerHTML = '';
  document.getElementById('trips-tfoot').innerHTML = '';
}

function initExport() {
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
}

function tripsToRows() {
  if (!state.trips.length) return [];
  return state.trips.map((t, i) => ({
    '№': i + 1,
    'Начало':    fmtDateTime(t.BT ?? t.BeginTime ?? ''),
    'Конец':     fmtDateTime(t.ET ?? t.EndTime   ?? ''),
    'Пробег':    fmtNum(t.M  ?? t.Mileage   ?? null),
    'V макс':    fmtNum(t.MaxSpeed ?? t.Mxs ?? null, 0),
    'V ср':      fmtNum(t.AvgSpeed ?? t.Avs ?? null, 0),
    'Откуда':    t.SA ?? t.StartAddress ?? '',
    'Куда':      t.EA ?? t.EndAddress   ?? '',
  }));
}

function exportCSV() {
  const rows = tripsToRows();
  if (!rows.length) return alert('Нет данных для экспорта');
  const header = Object.keys(rows[0]).join(';');
  const body   = rows.map(r => Object.values(r).join(';')).join('\n');
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `trips_${state.selectedName.replace(/[^а-яa-z0-9]/gi, '_')}.csv`);
}

function exportExcel() {
  const rows = tripsToRows();
  if (!rows.length) return alert('Нет данных для экспорта');
  const header = Object.keys(rows[0]).join('\t');
  const body   = rows.map(r => Object.values(r).join('\t')).join('\n');
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(blob, `trips_${state.selectedName.replace(/[^а-яa-z0-9]/gi, '_')}.xls`);
}

function exportPDF() {
  const rows = tripsToRows();
  if (!rows.length) return alert('Нет данных для экспорта');
  const win = window.open('', '_blank');
  const headers = Object.keys(rows[0]).map(k => `<th>${k}</th>`).join('');
  const body    = rows.map(r => '<tr>' + Object.values(r).map(v => `<td>${v}</td>`).join('') + '</tr>').join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Рейсы — ${state.selectedName}</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:16px}
      h2{margin-bottom:8px;font-size:14px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
      th{background:#1976d2;color:#fff}</style></head>
    <body><h2>Рейсы — ${state.selectedName}</h2>
    <table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>
    <script>window.print();<\/script></body></html>`);
  win.document.close();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── User menu ────────────────────────────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-menu-wrap')) {
    document.getElementById('user-dropdown')?.classList.remove('open');
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) { logout(); return; }

  // Fill user avatar
  const user = getUser();
  if (user) {
    const displayName = user.full_name || user.username || user.email || '?';
    document.getElementById('topbar-avatar').textContent   = displayName[0].toUpperCase();
    document.getElementById('topbar-username').textContent = displayName;
  }

  // Set today as default period
  applyShift(); // sets dateFrom/dateTo to today

  // Init UI controls synchronously
  initDragHandle();
  initSidebar();
  initSearch();
  initMapClear();
  initExport();

  // Defer map init + data loading until AFTER browser has performed layout.
  // Double requestAnimationFrame guarantees styles are computed and elements sized.
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      initMap();
      await loadSchemas();
      initRefresh();
    });
  });
});