const API = 'http://localhost:8000';
const ROLE_LABELS = { admin: 'Администратор', employee: 'Сотрудник', client: 'Клиент' };

let allUsers    = [];
let activeRole  = 'all';
let deleteTarget = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('cms_token');
  const user  = getUser();

  if (!token || !user || user.role !== 'admin') {
    window.location.replace('index.html');
    return;
  }

  fillUserMenu(user);
  loadUsers();

  // Закрыть меню при клике снаружи
  document.addEventListener('click', e => {
    const menu = document.getElementById('user-menu');
    if (!menu.contains(e.target)) menu.classList.remove('open');
  });
});

function getUser() {
  try { return JSON.parse(localStorage.getItem('cms_user')); } catch { return null; }
}
function token() { return localStorage.getItem('cms_token'); }

// ===== USER MENU =====
function fillUserMenu(user) {
  const initials = initials2(user.full_name || user.username);
  document.getElementById('user-avatar').textContent   = initials;
  document.getElementById('user-name').textContent     = user.full_name || user.username;
  document.getElementById('dd-avatar').textContent     = initials;
  document.getElementById('dd-name').textContent       = user.full_name || user.username;
  document.getElementById('dd-email').textContent      = user.email || '';
  document.getElementById('dd-role').textContent       = ROLE_LABELS[user.role] || user.role;
}

function toggleUserMenu(e) {
  e.stopPropagation();
  document.getElementById('user-menu').classList.toggle('open');
}

function logout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  window.location.replace('index.html');
}

// ===== SECTIONS =====
const SECTION_TITLES = { users: 'Пользователи', news: 'Новости', vacancies: 'Вакансии' };
const ADD_HANDLERS   = { users: 'openAddUser()', news: 'openAddNews()', vacancies: 'openAddVac()' };

function switchSection(name, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('section-' + name).classList.add('active');
  document.getElementById('page-title').textContent = SECTION_TITLES[name] || name;
  document.querySelector('.btn-header-add').setAttribute('onclick', ADD_HANDLERS[name] || '');
  if (name === 'news')      loadNews();
  if (name === 'vacancies') loadVacancies();
}

// ===== LOAD USERS =====
async function loadUsers() {
  try {
    const res  = await fetch(API + '/api/users', {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    allUsers = data.users;
    updateCounts();
    renderTable();
  } catch (err) {
    document.getElementById('users-tbody').innerHTML =
      `<tr class="table-empty"><td colspan="6">Ошибка загрузки: ${err.message}</td></tr>`;
  }
}

function updateCounts() {
  const counts = { all: allUsers.length, admin: 0, employee: 0, client: 0 };
  allUsers.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });
  Object.entries(counts).forEach(([role, n]) => {
    const el = document.getElementById('count-' + role);
    if (el) el.textContent = n;
  });
}

// ===== FILTER =====
function setFilter(role, el) {
  activeRole = role;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

// ===== RENDER TABLE =====
function renderTable() {
  const q = (document.getElementById('search-input').value || '').toLowerCase().trim();

  const filtered = allUsers.filter(u => {
    const matchRole = activeRole === 'all' || u.role === activeRole;
    const matchQ    = !q || (u.username + u.full_name + u.email).toLowerCase().includes(q);
    return matchRole && matchQ;
  });

  const tbody = document.getElementById('users-tbody');

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="table-empty"><td colspan="6">Пользователи не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const ini  = initials2(u.full_name || u.username);
    const name = u.full_name
      ? `<div class="user-cell-name">${esc(u.full_name)}</div><div class="user-cell-login">@${esc(u.username)}</div>`
      : `<div class="user-cell-name">@${esc(u.username)}</div>`;
    const phone = u.phone ? esc(u.phone) : '<span class="muted">—</span>';
    const date  = u.created_at ? fmtDate(u.created_at) : '—';
    const del   = u.role !== 'admin'
      ? `<button class="btn-delete" onclick="confirmDelete(${u.id}, '${esc(u.username)}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
           Удалить
         </button>`
      : '';

    return `<tr>
      <td><div class="user-cell">
        <span class="user-initials role-${u.role}">${ini}</span>
        <div>${name}</div>
      </div></td>
      <td>${esc(u.email)}</td>
      <td>${phone}</td>
      <td><span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td class="muted">${date}</td>
      <td>${del}</td>
    </tr>`;
  }).join('');
}

// ===== ADD USER MODAL =====
function openAddUser() {
  document.getElementById('adduser-error').hidden   = true;
  document.getElementById('adduser-success').hidden = true;
  document.getElementById('adduser-form').reset();
  openModal('adduser-modal');
}
function closeAddUser() { closeModal('adduser-modal'); }

async function handleAddUser(e) {
  e.preventDefault();
  const errEl = document.getElementById('adduser-error');
  const okEl  = document.getElementById('adduser-success');
  const btn   = document.getElementById('adduser-submit');
  errEl.hidden = true; okEl.hidden = true;

  const body = {
    role:      document.getElementById('au-role').value,
    username:  document.getElementById('au-username').value.trim(),
    full_name: document.getElementById('au-fullname').value.trim(),
    email:     document.getElementById('au-email').value.trim(),
    phone:     document.getElementById('au-phone').value.trim(),
    password:  document.getElementById('au-password').value,
  };

  btn.disabled = true; btn.textContent = 'СОЗДАНИЕ...';

  try {
    const res  = await fetch(API + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }

    okEl.textContent = `Пользователь «${data.user.username}» (${ROLE_LABELS[data.user.role]}) создан`;
    okEl.hidden = false;
    document.getElementById('adduser-form').reset();
    await loadUsers();
  } catch {
    errEl.textContent = 'Нет связи с сервером.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОЗДАТЬ ПОЛЬЗОВАТЕЛЯ';
  }
}

// ===== DELETE =====
function confirmDelete(id, username) {
  deleteTarget = id;
  document.getElementById('confirm-text').textContent =
    `Пользователь «${username}» будет удалён. Это действие нельзя отменить.`;
  document.getElementById('confirm-ok').onclick = doDelete;
  openModal('confirm-modal');
}

async function doDelete() {
  if (!deleteTarget) return;
  const btn = document.getElementById('confirm-ok');
  btn.disabled = true; btn.textContent = 'Удаление...';

  try {
    const res  = await fetch(`${API}/api/users/${deleteTarget}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() },
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    closeModal('confirm-modal');
    deleteTarget = null;
    await loadUsers();
  } catch {
    alert('Ошибка соединения.');
  } finally {
    btn.disabled = false; btn.textContent = 'Удалить';
  }
}

// ===== MODAL HELPERS =====
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function backdropClick(e, id) {
  if (e.target.id === id) closeModal(id);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
});

// ===== NEWS =====
let allNews      = [];
let newsFilter   = 'all';

async function loadNews() {
  const grid = document.getElementById('news-grid');
  grid.innerHTML = '<div class="table-loader"><span class="loader"></span></div>';
  try {
    const res  = await fetch(API + '/api/news?all=1', { headers: { Authorization: 'Bearer ' + token() } });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    allNews = data.news;
    updateNewsCounts();
    renderNewsGrid();
  } catch (err) {
    grid.innerHTML = `<div class="admin-news-empty">Ошибка загрузки: ${esc(err.message)}</div>`;
  }
}

function updateNewsCounts() {
  let pub = 0, draft = 0;
  allNews.forEach(n => n.published ? pub++ : draft++);
  document.getElementById('nc-all').textContent   = allNews.length;
  document.getElementById('nc-pub').textContent   = pub;
  document.getElementById('nc-draft').textContent = draft;
}

function setNewsFilter(val, el) {
  newsFilter = val;
  document.querySelectorAll('#section-news .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderNewsGrid();
}

function renderNewsGrid() {
  const q = (document.getElementById('news-search').value || '').toLowerCase().trim();
  const filtered = allNews.filter(n => {
    const matchPub = newsFilter === 'all' || String(n.published) === newsFilter;
    const matchQ   = !q || n.title.toLowerCase().includes(q);
    return matchPub && matchQ;
  });

  const grid = document.getElementById('news-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="admin-news-empty">Новостей не найдено</div>';
    return;
  }

  grid.innerHTML = filtered.map(n => {
    const imgBlock = n.image
      ? `<img src="${esc(n.image)}" alt="${esc(n.title)}" onerror="this.style.display='none'">`
      : `<div class="anc-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    const pubBadge = n.published
      ? '<span class="anc-badge anc-badge--pub">Опубликовано</span>'
      : '<span class="anc-badge anc-badge--draft">Черновик</span>';

    return `<div class="anc-card">
      <div class="anc-img">${imgBlock}</div>
      <div class="anc-body">
        <div class="anc-meta">
          ${pubBadge}
          <span class="anc-date">${fmtDate(n.created_at)}</span>
        </div>
        <h3 class="anc-title">${esc(n.title)}</h3>
        ${n.excerpt ? `<p class="anc-excerpt">${esc(n.excerpt)}</p>` : ''}
      </div>
      <div class="anc-actions">
        ${!n.published ? `<button class="anc-btn anc-btn--pub" onclick="publishNews(${n.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Опубликовать
        </button>` : ''}
        <button class="anc-btn anc-btn--edit" onclick="openEditNews(${n.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Редактировать
        </button>
        <button class="anc-btn anc-btn--del" onclick="confirmDeleteNews(${n.id}, '${esc(n.title)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
      </div>
    </div>`;
  }).join('');
}

// --- Открыть модал добавления ---
function openAddNews() {
  document.getElementById('news-modal-title').textContent = 'Добавить новость';
  document.getElementById('news-form').reset();
  document.getElementById('nm-id').value    = '';
  document.getElementById('nm-image').value = '';
  document.getElementById('nm-published').checked = false;
  document.getElementById('news-modal-error').hidden = true;
  setImgPreview('');
  openModal('news-modal');
}

// --- Открыть модал редактирования ---
function openEditNews(id) {
  const n = allNews.find(x => x.id === id);
  if (!n) return;

  document.getElementById('news-modal-title').textContent = 'Редактировать новость';
  document.getElementById('nm-id').value       = n.id;
  document.getElementById('nm-title').value    = n.title   || '';
  document.getElementById('nm-excerpt').value  = n.excerpt || '';
  document.getElementById('nm-content').value  = n.content || '';
  document.getElementById('nm-image').value    = n.image   || '';
  document.getElementById('nm-published').checked = !!n.published;
  document.getElementById('news-modal-error').hidden = true;
  setImgPreview(n.image || '');
  openModal('news-modal');
}

function closeNewsModal() { closeModal('news-modal'); }

// --- Сохранить ---
async function handleSaveNews(e) {
  e.preventDefault();
  const errEl = document.getElementById('news-modal-error');
  const btn   = document.getElementById('news-modal-submit');
  errEl.hidden = true;

  const id    = document.getElementById('nm-id').value;
  const body  = {
    title:     document.getElementById('nm-title').value.trim(),
    excerpt:   document.getElementById('nm-excerpt').value.trim(),
    content:   document.getElementById('nm-content').value.trim(),
    image:     document.getElementById('nm-image').value.trim(),
    published: document.getElementById('nm-published').checked ? 1 : 0,
  };

  const isEdit = !!id;
  const url    = isEdit ? `${API}/api/news/${id}` : `${API}/api/news`;
  const method = isEdit ? 'PUT' : 'POST';

  btn.disabled = true; btn.textContent = 'СОХРАНЕНИЕ...';

  try {
    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeModal('news-modal');
    await loadNews();
  } catch {
    errEl.textContent = 'Нет связи с сервером.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОХРАНИТЬ';
  }
}

// --- Загрузка изображения ---
async function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('nm-upload-status');
  statusEl.textContent = 'Загрузка...';
  statusEl.className   = 'nm-upload-status';
  statusEl.hidden      = false;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res  = await fetch(API + '/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) { statusEl.textContent = data.message; statusEl.className = 'nm-upload-status error'; return; }
    document.getElementById('nm-image').value = data.url;
    setImgPreview(data.url);
    statusEl.hidden = true;
  } catch {
    statusEl.textContent = 'Ошибка загрузки.'; statusEl.className = 'nm-upload-status error';
  } finally {
    input.value = '';
  }
}

function setImgPreview(url) {
  const preview  = document.getElementById('img-preview');
  const ph       = document.getElementById('img-placeholder');
  if (url) {
    document.getElementById('img-preview-img').src = url;
    preview.hidden = false;
    ph.hidden      = true;
  } else {
    preview.hidden = true;
    ph.hidden      = false;
  }
}

function removeNewsImg(e) {
  e.stopPropagation();
  document.getElementById('nm-image').value = '';
  setImgPreview('');
}

// --- Быстрая публикация черновика ---
async function publishNews(id) {
  const n = allNews.find(x => x.id === id);
  if (!n) return;

  try {
    const res  = await fetch(`${API}/api/news/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({
        title:     n.title,
        excerpt:   n.excerpt  || '',
        content:   n.content  || '',
        image:     n.image    || '',
        published: 1,
      }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadNews();
  } catch {
    alert('Ошибка соединения.');
  }
}

// --- Удаление новости ---
function confirmDeleteNews(id, title) {
  deleteTarget = id;
  document.getElementById('confirm-text').textContent =
    `Новость «${title}» будет удалена. Это действие нельзя отменить.`;
  document.getElementById('confirm-ok').onclick = doDeleteNews;
  openModal('confirm-modal');
}

async function doDeleteNews() {
  if (!deleteTarget) return;
  const btn = document.getElementById('confirm-ok');
  btn.disabled = true; btn.textContent = 'Удаление...';

  try {
    const res  = await fetch(`${API}/api/news/${deleteTarget}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() },
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    closeModal('confirm-modal');
    deleteTarget = null;
    await loadNews();
  } catch {
    alert('Ошибка соединения.');
  } finally {
    btn.disabled = false; btn.textContent = 'Удалить';
  }
}

// ===== VACANCIES =====
let allVacancies  = [];
let vacFilterPub  = 'all';

async function loadVacancies() {
  const grid = document.getElementById('vac-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="table-loader"><span class="loader"></span></div>';

  try {
    const res  = await fetch(API + '/api/vacancies?all=1', {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    allVacancies = data.vacancies || [];

    const all   = allVacancies.length;
    const pub   = allVacancies.filter(v => v.published == 1).length;
    const draft = all - pub;
    document.getElementById('vc-all').textContent   = all;
    document.getElementById('vc-pub').textContent   = pub;
    document.getElementById('vc-draft').textContent = draft;

    renderVacGrid();
  } catch (e) {
    grid.innerHTML = `<p style="padding:2rem;color:#e53935">${e.message}</p>`;
  }
}

function setVacFilter(pub, el) {
  vacFilterPub = pub;
  document.querySelectorAll('#section-vacancies .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderVacGrid();
}

function renderVacGrid() {
  const grid = document.getElementById('vac-grid');
  const q    = (document.getElementById('vac-search')?.value || '').toLowerCase();

  let list = allVacancies;
  if (vacFilterPub !== 'all') list = list.filter(v => String(v.published) === vacFilterPub);
  if (q) list = list.filter(v => v.title.toLowerCase().includes(q));

  if (!list.length) {
    grid.innerHTML = '<p style="padding:2rem;color:#6b7a8d;text-align:center">Вакансии не найдены</p>';
    return;
  }

  grid.innerHTML = list.map(v => `
    <div class="anc-card">
      <div class="anc-body">
        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem">
          <span class="anc-badge ${v.published == 1 ? 'anc-badge--pub' : 'anc-badge--draft'}">
            ${v.published == 1 ? 'Опубликована' : 'Черновик'}
          </span>
          ${v.department ? `<span style="font-size:0.72rem;color:#6b7a8d">${esc(v.department)}</span>` : ''}
        </div>
        <h3 class="anc-title" style="margin:0 0 0.4rem;font-size:1rem">${esc(v.title)}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem">
          ${v.location        ? `<span style="font-size:0.73rem;color:#2e7d32;background:#e8f5e9;padding:2px 8px;border-radius:100px">${esc(v.location)}</span>` : ''}
          ${v.employment_type ? `<span style="font-size:0.73rem;color:#1976d2;background:#e3f0ff;padding:2px 8px;border-radius:100px">${esc(v.employment_type)}</span>` : ''}
          ${v.salary          ? `<span style="font-size:0.73rem;color:#f57c00;background:#fff8e1;padding:2px 8px;border-radius:100px">${esc(v.salary)}</span>` : ''}
        </div>
        ${v.description ? `<p class="anc-excerpt">${esc(v.description)}</p>` : ''}
      </div>
      <div class="anc-actions">
        ${v.published != 1 ? `<button class="anc-btn anc-btn--pub" onclick="publishVac(${v.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Опубликовать
        </button>` : ''}
        <button class="anc-btn anc-btn--edit" onclick="openEditVac(${v.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Редактировать
        </button>
        <button class="anc-btn anc-btn--del" onclick="confirmDeleteVac(${v.id}, '${esc(v.title)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
      </div>
    </div>
  `).join('');
}

function openAddVac() {
  document.getElementById('vac-modal-title').textContent = 'Добавить вакансию';
  document.getElementById('vac-form').reset();
  document.getElementById('vm-id').value = '';
  document.getElementById('vm-location').value = 'Тюмень';
  document.getElementById('vac-modal-error').hidden = true;
  openModal('vac-modal');
}

function openEditVac(id) {
  const v = allVacancies.find(x => x.id === id);
  if (!v) return;
  document.getElementById('vac-modal-title').textContent = 'Редактировать вакансию';
  document.getElementById('vm-id').value          = v.id;
  document.getElementById('vm-title').value       = v.title       || '';
  document.getElementById('vm-department').value  = v.department  || '';
  document.getElementById('vm-location').value    = v.location    || 'Тюмень';
  document.getElementById('vm-type').value        = v.employment_type || 'Полная занятость';
  document.getElementById('vm-salary').value      = v.salary      || '';
  document.getElementById('vm-description').value = v.description || '';
  document.getElementById('vm-requirements').value= v.requirements|| '';
  document.getElementById('vm-published').checked = v.published == 1;
  document.getElementById('vac-modal-error').hidden = true;
  openModal('vac-modal');
}

function closeVacModal() { closeModal('vac-modal'); }

async function handleSaveVac(e) {
  e.preventDefault();
  const errEl = document.getElementById('vac-modal-error');
  const btn   = document.getElementById('vac-modal-submit');
  errEl.hidden = true;

  const id   = document.getElementById('vm-id').value;
  const body = {
    title:          document.getElementById('vm-title').value.trim(),
    department:     document.getElementById('vm-department').value.trim(),
    location:       document.getElementById('vm-location').value.trim(),
    employment_type:document.getElementById('vm-type').value,
    salary:         document.getElementById('vm-salary').value.trim(),
    description:    document.getElementById('vm-description').value.trim(),
    requirements:   document.getElementById('vm-requirements').value.trim(),
    published:      document.getElementById('vm-published').checked ? 1 : 0,
  };

  btn.disabled = true; btn.textContent = 'СОХРАНЕНИЕ...';

  try {
    const res  = await fetch(API + '/api/vacancies' + (id ? '/' + id : ''), {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeVacModal();
    await loadVacancies();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОХРАНИТЬ';
  }
}

async function publishVac(id) {
  const v = allVacancies.find(x => x.id === id);
  if (!v) return;
  try {
    const res  = await fetch(API + '/api/vacancies/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ ...v, published: 1 }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadVacancies();
  } catch { alert('Ошибка соединения.'); }
}

function confirmDeleteVac(id, title) {
  deleteTarget = { id, type: 'vacancy' };
  document.getElementById('confirm-text').textContent = `Удалить вакансию «${title}»? Это действие нельзя отменить.`;
  document.getElementById('confirm-ok').onclick = doDeleteVac;
  openModal('confirm-modal');
}

async function doDeleteVac() {
  if (!deleteTarget) return;
  const { id } = deleteTarget;
  const btn = document.getElementById('confirm-ok');
  btn.disabled = true; btn.textContent = 'Удаление...';
  try {
    await fetch(API + '/api/vacancies/' + id, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() }
    });
    closeModal('confirm-modal');
    deleteTarget = null;
    await loadVacancies();
  } catch { alert('Ошибка соединения.'); }
  finally { btn.disabled = false; btn.textContent = 'Удалить'; }
}

// ===== UTILS =====
function initials2(str) {
  if (!str) return '?';
  const parts = str.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : str.slice(0, 2).toUpperCase();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(str) {
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}