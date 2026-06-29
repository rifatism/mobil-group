// ─── Конфигурация ─────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';
const AG  = API + '/api/autograf';
const REFRESH_MS = 60_000;

// ─── Состояние ────────────────────────────────────────────────────────────────
let state = {
  schemaId:      '',
  schemaName:    '',
  groups:        [],
  vehicles:      [],
  positions:     {},
  selectedId:    null,
  selectedName:  '',
  refreshTimer:  null,
  markers:       {},
  map:           null,
};

// ─── Вспомогательные функции авторизации ──────────────────────────────────────
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

// ─── Вспомогательные функции для дат ──────────────────────────────────────────
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

function fmtNum(v, dec = 1) {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  return Number(v).toFixed(dec);
}

// ─── Инициализация карты ──────────────────────────────────────────────────────
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
  // Используем поле state: 0=двигатель выключен (но может быть на стоянке/передавать данные), 1=двигатель включён
  // Онлайн/офлайн определяется исключительно по возрасту последней GPS-метки (7 дней = точно нет сигнала)
  const age = pos.time ? (Date.now() - new Date(pos.time).getTime()) / 1000 : 99999;
  if (age > 604800) return 'offline'; // > 7 суток → точно офлайн
  if (pos.speed > 1) return 'moving';
  return 'parked'; // двигатель выключен или включён, но без движения — оба случая показываются как стоянка
}

function parsePositions(raw) {
  const result = {};
  const parseOne = p => {
    const lp  = p.LastPosition ?? p.lastPosition ?? {};
    const fin = p.Final ?? {};
    const cons = fin.Consumption2;
    const odo  = fin.CANTotalDistance;
    // Корневые Lat/Lng — текущая позиция; LastPosition — исторический кэш (приоритет ниже)
    const lat = p.Lat ?? p.lat ?? p.X ?? lp.Lat ?? lp.lat ?? null;
    const lon = p.Lng ?? p.lng ?? p.Lon ?? p.lon ?? p.Y ?? lp.Lng ?? lp.lng ?? lp.Lon ?? null;
    const time = p.DT ?? p.DTLocal ?? p.LastData ?? lp.DT ?? lp.DTLocal ?? null;
    return {
      lat,
      lon,
      speed:       p.Speed ?? p.speed ?? 0,
      time,
      address:     p.Address ?? lp.Address ?? '',
      state:       p.State ?? -1,
      course:      p.Course ?? lp.Course ?? 0,
      currLocation: fin.CurrLocation || '',
      consumption:  (cons != null && Number(cons) > 0) ? Number(cons) : null,
      canOdometer:  (odo  != null && Number(odo)  > 0) ? Number(odo)  : null,
    };
  };
  if (Array.isArray(raw)) {
    raw.forEach(p => {
      if (!p || typeof p !== 'object') return; // пропустить null и не-объектные записи
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
  map.invalidateSize(); // обновить размеры после flex-раскладки
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
  const fuel    = pos?.consumption != null ? `<div class="lp-row"><b>Расход:</b> ${fmtNum(pos.consumption, 1)} л/ч</div>` : '';
  const odo     = pos?.canOdometer != null ? `<div class="lp-row"><b>Одометр:</b> ${fmtNum(pos.canOdometer)} км</div>` : '';
  const reg     = v._regNum       ? ` · <span style="color:#888">${v._regNum}</span>` : '';
  return `<div class="lp-name">${v.Name}${reg}</div>
          <div class="lp-row">${stLabel}</div>${speed}${addr}${time}${fuel}${odo}`;
}

// ─── Дерево транспортных средств ──────────────────────────────────────────────
function buildTree() {
  const tree = document.getElementById('sb-tree');
  tree.innerHTML = '';

  if (!state.vehicles.length) {
    tree.innerHTML = '<div class="sb-loading"><span>Нет данных</span></div>';
    return;
  }

  // Построение иерархии групп
  const groupMap = {};
  state.groups.forEach(g => { groupMap[g.ID] = { ...g, children: [], vehicles: [] }; });

  // Привязка ТС к родительской группе
  state.vehicles.forEach(v => {
    const pid = v.ParentID;
    if (pid && groupMap[pid]) groupMap[pid].vehicles.push(v);
    else if (!pid) {
      // ТС верхнего уровня без группы — добавляем в корзину «без группы»
      if (!groupMap['__orphan__']) groupMap['__orphan__'] = { ID: '__orphan__', Name: '', children: [], vehicles: [] };
      groupMap['__orphan__'].vehicles.push(v);
    }
  });

  // Построение дерева групп (связи родитель-потомок)
  const roots = [];
  state.groups.forEach(g => {
    const pid = g.ParentID;
    if (pid && groupMap[pid]) groupMap[pid].children.push(groupMap[g.ID]);
    else roots.push(groupMap[g.ID]);
  });

  // Если групп нет — просто выводим список ТС
  if (!roots.length) {
    renderVehicleList(tree, state.vehicles);
    return;
  }

  roots.forEach(g => renderGroup(tree, g, 0));

  // ТС без группы
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

  // Сначала отрисовываем подгруппы
  group.children.forEach(child => renderGroup(children, child, depth + 1));
  // Затем ТС
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
      spd.textContent = ''; // стоянка — скорость не показываем
    } else {
      spd.textContent = ''; // нет связи
    }
  });

  // Статистика
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

// ─── Выбор транспортного средства ─────────────────────────────────────────────
function selectVehicle(v, el) {
  if (state.selectedId === v.ID) return;
  state.selectedId   = v.ID;
  state.selectedName = v.Name + (v._regNum ? ' · ' + v._regNum : '');

  document.querySelectorAll('.tree-vehicle').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');

  document.getElementById('tb-vehicle-name').textContent = v.Name;

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

// ─── Загрузка схем ────────────────────────────────────────────────────────────
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

  sel.addEventListener('change', () => {
    state.schemaId   = sel.value;
    state.schemaName = sel.options[sel.selectedIndex]?.text || '';
    document.getElementById('tb-schema-name').textContent = state.schemaName;
    state.selectedId   = null;
    state.selectedName = '';
    loadVehicles();
  });

  if (data.schemas?.length) {
    state.schemaId   = sel.value;
    state.schemaName = sel.options[sel.selectedIndex]?.text || '';
    document.getElementById('tb-schema-name').textContent = state.schemaName;
    await loadVehicles();
  }
}

// ─── Транспортные средства + дерево ───────────────────────────────────────────
async function loadVehicles() {
  clearAllMarkers();
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

  state.groups   = data.groups   || [];
  state.vehicles = data.vehicles || [];
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


// ─── Позиции ──────────────────────────────────────────────────────────────────
async function loadPositions() {
  let data;
  try {
    data = await apiFetch(`${AG}/positions?schemaId=${encodeURIComponent(state.schemaId)}`);
  } catch (e) {
    console.error('[positions] fetch error:', e);
    return;
  }
  if (!data?.success) { console.warn('[positions] bad response:', data); return; }

  const rawPositions = data.positions || [];
  if (rawPositions.length > 0) {
    console.debug('[positions] raw sample (первый объект от AutoGRAF):', JSON.stringify(rawPositions[0], null, 2));
  }
  state.positions = parsePositions(rawPositions);
  console.log(`[positions] parsed=${Object.keys(state.positions).length}`);

  try {
    placeMarkers();
  } catch (e) {
    console.error('[placeMarkers] error:', e);
  }
  updateTreeStatuses();
}

// ─── Сворачивание боковой панели ──────────────────────────────────────────────
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

// ─── Фильтр поиска ────────────────────────────────────────────────────────────
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


// ─── Обновление данных ────────────────────────────────────────────────────────
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

// ─── Меню пользователя ────────────────────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-menu-wrap')) {
    document.getElementById('user-dropdown')?.classList.remove('open');
  }
});

// ─── Запуск ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) { logout(); return; }

  // Заполнение аватара пользователя
  const user = getUser();
  if (user) {
    const displayName = user.full_name || user.username || user.email || '?';
    document.getElementById('topbar-avatar').textContent   = displayName[0].toUpperCase();
    document.getElementById('topbar-username').textContent = displayName;
  }

  initSidebar();
  initSearch();

  // Откладываем инициализацию карты и загрузку данных до завершения браузерной раскладки.
  // Двойной requestAnimationFrame гарантирует, что стили вычислены и элементы получили размеры.
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      initMap();
      await loadSchemas();
      initRefresh();
    });
  });
});
