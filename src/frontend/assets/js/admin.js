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

function closeUserMenu() {
  document.getElementById('user-menu').classList.remove('open');
}

function toggleAdminSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const burger   = document.getElementById('admin-burger');
  const isOpen   = sidebar.classList.toggle('open');
  backdrop.classList.toggle('open', isOpen);
  burger.classList.toggle('open', isOpen);
}

function logout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  window.location.replace('index.html');
}

// ===== SECTIONS =====
const SECTION_TITLES  = { users: 'Пользователи', news: 'Статьи', vacancies: 'Вакансии', knowledge: 'База знаний', candidates: 'Кандидаты' };
const ADD_HANDLERS    = { users: 'openAddUser()', news: 'openAddNews()', vacancies: 'openAddVac()', knowledge: '', candidates: '' };
const ADD_BTN_LABELS  = { users: 'Добавить', news: 'Добавить статью', vacancies: 'Добавить вакансию', knowledge: '', candidates: '' };

function switchSection(name, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('section-' + name).classList.add('active');
  document.getElementById('page-title').textContent = SECTION_TITLES[name] || name;
  const addBtn = document.querySelector('.btn-header-add');
  addBtn.setAttribute('onclick', ADD_HANDLERS[name] || '');
  addBtn.style.display = (name === 'knowledge' || name === 'candidates') ? 'none' : '';
  const labelEl = addBtn.querySelector('.add-btn-label');
  if (labelEl) labelEl.textContent = ADD_BTN_LABELS[name] || 'Добавить';
  if (name === 'news')       loadNews();
  if (name === 'vacancies')  loadVacancies();
  if (name === 'knowledge')  loadKnowledgeSection();
  if (name === 'candidates') { loadAiCandidates(); loadFormCandidates(); }
  // Закрыть сайдбар на мобильном
  const sidebar  = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const burger   = document.getElementById('admin-burger');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  if (burger) burger.classList.remove('open');
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

const CLIENT_TYPE_LABELS = {
  individual:   'Физлицо',
  ip:           'ИП',
  selfemployed: 'Самозанятый',
  company:      'Компания',
};

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

    // Тип клиента — показываем только для клиентов
    const typeTag = u.role === 'client' && u.client_type
      ? `<span class="client-type-badge">${CLIENT_TYPE_LABELS[u.client_type] || u.client_type}</span>`
      : '';

    const actions = u.role !== 'admin' ? `
      <div style="display:flex;gap:0.4rem;justify-content:flex-end">
        <button class="btn-edit-user" onclick="openEditUser(${u.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Изменить
        </button>
        <button class="btn-delete" onclick="confirmDelete(${u.id}, '${esc(u.username)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
      </div>` : '';

    return `<tr>
      <td><div class="user-cell">
        <span class="user-initials role-${u.role}">${ini}</span>
        <div>${name}${typeTag}</div>
      </div></td>
      <td>${esc(u.email)}</td>
      <td>${phone}</td>
      <td><span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td class="muted">${date}</td>
      <td>${actions}</td>
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

// ===== EDIT USER =====
function openEditUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;

  document.getElementById('eu-id').value         = u.id;
  document.getElementById('eu-last').value        = u.last_name   || '';
  document.getElementById('eu-first').value       = u.first_name  || '';
  document.getElementById('eu-patr').value        = u.patronymic  || '';
  document.getElementById('eu-phone').value       = u.phone       || '';
  document.getElementById('eu-desc').value        = u.description || '';
  document.getElementById('eu-company').value     = u.company_name|| '';
  document.getElementById('eu-username').value    = u.username;
  document.getElementById('eu-email').value       = u.email;

  const typeSelect = document.getElementById('eu-client-type');
  if (typeSelect) typeSelect.value = u.client_type || 'individual';

  // Показываем блок с типом и компанией только для клиентов
  const typeRow    = document.getElementById('eu-type-row');
  const companyRow = document.getElementById('eu-company-row');
  if (typeRow)    typeRow.hidden    = u.role !== 'client';
  if (companyRow) companyRow.hidden = u.client_type !== 'company';

  document.getElementById('edituser-error').hidden = true;
  document.getElementById('eu-modal-title').textContent =
    `Редактировать: ${u.full_name || u.username}`;
  openModal('edituser-modal');
}

function onEuTypeChange() {
  const val = document.getElementById('eu-client-type').value;
  const row = document.getElementById('eu-company-row');
  if (row) row.hidden = val !== 'company';
}

function closeEditUser() { closeModal('edituser-modal'); }

async function handleEditUser(e) {
  e.preventDefault();
  const errEl = document.getElementById('edituser-error');
  const btn   = document.getElementById('edituser-submit');
  errEl.hidden = true;

  const id   = document.getElementById('eu-id').value;
  const type = document.getElementById('eu-client-type')?.value || 'individual';

  const body = {
    first_name:   document.getElementById('eu-first').value.trim(),
    last_name:    document.getElementById('eu-last').value.trim(),
    patronymic:   document.getElementById('eu-patr').value.trim(),
    phone:        document.getElementById('eu-phone').value.trim(),
    description:  document.getElementById('eu-desc').value.trim(),
    client_type:  type,
    company_name: type === 'company' ? document.getElementById('eu-company').value.trim() : '',
  };

  btn.disabled = true; btn.textContent = 'СОХРАНЕНИЕ...';

  try {
    const res  = await fetch(`${API}/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body:   JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeEditUser();
    await loadUsers();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОХРАНИТЬ';
  }
}

// ===== DELETE =====
function confirmDelete(id, username) {
  deleteTarget = id;
  document.getElementById('confirm-modal-title').textContent = 'Удалить пользователя?';
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
  let pub = 0, draft = 0, arch = 0;
  allNews.forEach(n => {
    if (n.archived) { arch++; return; }
    n.published ? pub++ : draft++;
  });
  document.getElementById('nc-all').textContent   = allNews.length - arch;
  document.getElementById('nc-pub').textContent   = pub;
  document.getElementById('nc-draft').textContent = draft;
  document.getElementById('nc-arch').textContent  = arch;
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
    if (newsFilter === 'archived') return !!n.archived;
    if (n.archived) return false; // скрыть архивные из других вкладок
    const matchPub = newsFilter === 'all' || String(n.published) === newsFilter;
    const matchQ   = !q || n.title.toLowerCase().includes(q);
    return matchPub && matchQ;
  });

  const grid = document.getElementById('news-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="admin-news-empty">Статей не найдено</div>';
    return;
  }

  grid.innerHTML = filtered.map(n => {
    const imgBlock = n.image
      ? `<img src="${esc(n.image)}" alt="${esc(n.title)}" onerror="this.style.display='none'">`
      : `<div class="anc-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    const pubBadge = n.archived
      ? '<span class="anc-badge anc-badge--arch">Архив</span>'
      : n.published
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
        ${!n.archived && !n.published ? `<button class="anc-btn anc-btn--pub" onclick="publishNews(${n.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          Опубликовать
        </button>` : ''}
        ${n.archived
          ? `<button class="anc-btn anc-btn--unarch" onclick="toggleArchiveNews(${n.id}, 0)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
              Из архива
            </button>`
          : `<button class="anc-btn anc-btn--arch" onclick="toggleArchiveNews(${n.id}, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              В архив
            </button>`}
        <button class="anc-btn anc-btn--edit" onclick="openEditNews(${n.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Редактировать
        </button>
        <button class="anc-btn anc-btn--del" onclick="confirmDeleteNews(${n.id}, '${esc(n.title)}')" title="Удалить статью">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

// --- Архивирование ---
async function toggleArchiveNews(id, archived) {
  const n = allNews.find(x => x.id === id);
  if (!n) return;
  try {
    const res = await fetch(`${API}/api/news/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ title: n.title, content: n.content, excerpt: n.excerpt, image: n.image, published: n.published, archived }),
    });
    const data = await res.json();
    if (!data.success) return;
    await loadNews();
  } catch { /* silent */ }
}

// --- Открыть модал добавления ---
function openAddNews() {
  document.getElementById('news-modal-title').textContent = 'Добавить статью';
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

  document.getElementById('news-modal-title').textContent = 'Редактировать статью';
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
  document.getElementById('confirm-modal-title').textContent = 'Удалить статью?';
  document.getElementById('confirm-text').textContent =
    `Статья «${title}» будет удалена. Это действие нельзя отменить.`;
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
        <button class="anc-btn anc-btn--del" onclick="confirmDeleteVac(${v.id}, '${esc(v.title)}')" title="Удалить вакансию">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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
  document.getElementById('confirm-modal-title').textContent = 'Удалить вакансию?';
  document.getElementById('confirm-text').textContent = `Вакансия «${title}» будет удалена. Это действие нельзя отменить.`;
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

// =============================================================================
// ===== БАЗА ЗНАНИЙ ===========================================================
// =============================================================================

let kbFiles    = [];
let kbFolders  = [];
let kbTests    = [];
let kbUsers    = [];
let kbTab      = 'files';
let kbAdminPath = '';

function switchKbTab(tab, el) {
  kbTab = tab;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('kb-admin-files').style.display = tab === 'files' ? '' : 'none';
  document.getElementById('kb-admin-tests').style.display = tab === 'tests' ? '' : 'none';
}

async function loadKnowledgeSection() {
  kbAdminPath = '';
  await Promise.all([loadKbFiles(), loadKbTests()]);
  kbUsers = allUsers.filter(u => u.role === 'employee');
}

// ─── NAVIGATE ────────────────────────────────────────────────────────────────
function kbAdminNavigateTo(path) {
  kbAdminPath = path;
  document.getElementById('kbf-search').value = '';
  loadKbFiles();
}

function renderAdminBreadcrumb() {
  const el = document.getElementById('kb-admin-breadcrumb');
  if (!el) return;
  const parts = kbAdminPath ? kbAdminPath.split('/') : [];
  let html = `<span class="kb-crumb kb-crumb--link" onclick="kbAdminNavigateTo('')">База знаний</span>`;
  let built = '';
  parts.forEach((part, i) => {
    built += (built ? '/' : '') + part;
    const p = built;
    html += `<span class="kb-crumb-sep">›</span>`;
    if (i === parts.length - 1) {
      html += `<span class="kb-crumb kb-crumb--active">${esc(part)}</span>`;
    } else {
      html += `<span class="kb-crumb kb-crumb--link" onclick="kbAdminNavigateTo('${esc(p)}')">${esc(part)}</span>`;
    }
  });
  el.innerHTML = html;
}

// ─── ФАЙЛЫ ───────────────────────────────────────────────────────────────────
async function loadKbFiles() {
  const el = document.getElementById('kb-admin-files-grid');
  el.innerHTML = '<div class="empty-state">Загрузка...</div>';
  renderAdminBreadcrumb();
  try {
    const qs   = kbAdminPath ? `?path=${encodeURIComponent(kbAdminPath)}` : '';
    const res  = await fetch(`${API}/api/knowledge/files${qs}`, {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    kbFolders  = data.folders || [];
    kbFiles    = data.files   || [];
    renderAdminFiles();
  } catch { el.innerHTML = '<div class="empty-state">Ошибка загрузки файлов</div>'; }
}

function renderAdminFiles() {
  const el = document.getElementById('kb-admin-files-grid');
  const q  = (document.getElementById('kbf-search')?.value || '').toLowerCase().trim();

  const filtFolders = q ? kbFolders.filter(f => f.name.toLowerCase().includes(q)) : kbFolders;
  const filtFiles   = q ? kbFiles.filter(f => (f.title + (f.description||'')).toLowerCase().includes(q)) : kbFiles;

  if (!filtFolders.length && !filtFiles.length) {
    el.innerHTML = '<div class="empty-state">Нет файлов. Загрузите первый или создайте папку.</div>';
    return;
  }

  const folderRows = filtFolders.map(f => {
    const meta = [
      f.file_count ? `${f.file_count} файл.` : '',
      f.dir_count  ? `${f.dir_count} папк.`  : '',
    ].filter(Boolean).join(' · ') || 'Пусто';

    return `<div class="kbf-row kbf-row--folder" onclick="kbAdminNavigateTo('${esc(f.path)}')">
      <span class="kbf-folder-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
      </span>
      <div class="kbf-info">
        <div class="kbf-title">${esc(f.name)}</div>
        <div class="kbf-meta">${meta}</div>
      </div>
      <button class="btn-delete" onclick="event.stopPropagation(); deleteKbFolder('${esc(f.path)}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Удалить
      </button>
    </div>`;
  }).join('');

  const fileRows = filtFiles.map(f => {
    const size = fmtFileSize(f.file_size);
    const date = f.created_at ? fmtDate(f.created_at) : '';
    const ext  = (f.original_name || '').split('.').pop().toUpperCase();
    return `<div class="kbf-row">
      <span class="kbf-ext">${esc(ext)}</span>
      <div class="kbf-info">
        <div class="kbf-title">${esc(f.title || f.original_name)}</div>
        <div class="kbf-meta">${size}${date ? ' · ' + date : ''}${f.uploader ? ' · ' + esc(f.uploader) : ''}</div>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        <a class="btn-edit-user" href="${API}/api/knowledge/files/${f.id || ''}/download" ${f.id ? `download="${esc(f.original_name)}"` : ''} target="_blank" style="text-decoration:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать
        </a>
        <button class="btn-delete" onclick="deleteKbFile(${f.id ? f.id : 'null'}, '${esc(f.filename)}', '${esc(f.folder_path || kbAdminPath)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = folderRows + fileRows;
}

function fmtFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '—';
  const b = Number(bytes);
  if (b < 1024)         return b + ' Б';
  if (b < 1024 * 1024)  return (b/1024).toFixed(1) + ' КБ';
  return (b/1024/1024).toFixed(1) + ' МБ';
}

// Создать папку (из admin-панели)
function openKbAdminMkdir() {
  document.getElementById('kbmkdir-name').value = '';
  document.getElementById('kbmkdir-error').hidden = true;
  const label = document.getElementById('kbmkdir-path-label');
  if (label) label.textContent = kbAdminPath ? `В папке: ${kbAdminPath}` : 'В корневом разделе';
  openModal('kbmkdir-modal');
  setTimeout(() => document.getElementById('kbmkdir-name').focus(), 100);
}

async function handleKbAdminMkdir() {
  const errEl = document.getElementById('kbmkdir-error');
  const btn   = document.getElementById('kbmkdir-submit');
  const name  = document.getElementById('kbmkdir-name').value.trim();
  errEl.hidden = true;
  if (!name) { errEl.textContent = 'Введите название папки'; errEl.hidden = false; return; }

  btn.disabled = true; btn.textContent = 'СОЗДАНИЕ...';
  try {
    const res  = await fetch(`${API}/api/knowledge/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ path: kbAdminPath, name }),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeModal('kbmkdir-modal');
    await loadKbFiles();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОЗДАТЬ';
  }
}

// Загрузить файл (из admin-панели)
function openKbAdminUpload() {
  document.getElementById('kbf-form').reset();
  document.getElementById('kbf-error').hidden = true;
  openModal('kbf-modal');
}

async function handleKbAdminUpload(e) {
  e.preventDefault();
  const errEl = document.getElementById('kbf-error');
  const btn   = document.getElementById('kbf-submit');
  const file  = document.getElementById('kbf-file').files[0];
  errEl.hidden = true;

  if (!file) { errEl.textContent = 'Выберите файл'; errEl.hidden = false; return; }

  const fd = new FormData();
  fd.append('file',        file);
  fd.append('title',       document.getElementById('kbf-title').value.trim());
  fd.append('description', document.getElementById('kbf-desc').value.trim());
  fd.append('path',        kbAdminPath);

  btn.disabled = true; btn.textContent = 'ЗАГРУЗКА...';
  try {
    const res  = await fetch(API + '/api/knowledge/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeModal('kbf-modal');
    await loadKbFiles();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'ЗАГРУЗИТЬ';
  }
}

async function deleteKbFile(id, filename, folderPath) {
  if (!confirm('Удалить файл? Это действие нельзя отменить.')) return;
  try {
    let res;
    if (id) {
      res = await fetch(`${API}/api/knowledge/files/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token() },
      });
    } else {
      res = await fetch(`${API}/api/knowledge/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ filename, folder_path: folderPath }),
      });
    }
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadKbFiles();
  } catch { alert('Ошибка соединения.'); }
}

async function deleteKbFolder(path) {
  if (!confirm(`Удалить папку «${path.split('/').pop()}» и все файлы внутри?`)) return;
  try {
    const res  = await fetch(`${API}/api/knowledge/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadKbFiles();
  } catch { alert('Ошибка соединения.'); }
}

// ─── ТЕСТЫ ───────────────────────────────────────────────────────────────────
async function loadKbTests() {
  const el = document.getElementById('kb-admin-tests-list');
  try {
    const res  = await fetch(API + '/api/knowledge/tests', {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    kbTests = data.tests || [];
    renderAdminTests();
  } catch { el.innerHTML = '<div class="empty-state">Ошибка загрузки тестов</div>'; }
}

function renderAdminTests() {
  const el = document.getElementById('kb-admin-tests-list');
  const cnt = document.getElementById('kb-tests-count');
  if (cnt) cnt.textContent = `Тестов: ${kbTests.length}`;

  if (!kbTests.length) {
    el.innerHTML = '<div class="empty-state">Тестов пока нет. Создайте первый.</div>';
    return;
  }

  el.innerHTML = kbTests.map(t => {
    const qs   = (() => { try { return JSON.parse(t.questions||'[]'); } catch { return []; } })();
    const qCnt = qs.length;
    return `<div class="kbt-admin-row">
      <div class="kbt-admin-info">
        <div class="kbt-admin-title">${esc(t.title)}</div>
        <div class="kbt-admin-meta">
          ${qCnt} вопр. · ${t.assign_count ?? 0} назначений
          ${t.description ? ' · ' + esc(t.description.slice(0,60)) : ''}
        </div>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
        <button class="btn-edit-user" onclick="openAssignTest(${t.id}, '${esc(t.title)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Назначить
        </button>
        <button class="btn-edit-user" onclick="openKbEditTest(${t.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Изменить
        </button>
        <button class="btn-delete" onclick="deleteKbTest(${t.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Удалить
        </button>
      </div>
    </div>`;
  }).join('');
}

// ─── Создать / редактировать тест ────────────────────────────────────────────
let kbQCount = 0;

function toggleAttemptsInput(radio) {
  const numInput = document.getElementById('kbt-max-attempts');
  numInput.disabled = radio.value !== 'limited';
}

function openKbAddTest() {
  document.getElementById('kbt-id').value    = '';
  document.getElementById('kbt-title').value = '';
  document.getElementById('kbt-desc').value  = '';
  document.getElementById('kbt-passing-score').value = '60';
  document.getElementById('kbt-error').hidden = true;
  document.getElementById('kbt-modal-title').textContent = 'Создать тест';
  document.getElementById('kbt-questions-list').innerHTML = '';
  document.querySelector('input[name="kbt-attempts-type"][value="unlimited"]').checked = true;
  document.getElementById('kbt-max-attempts').disabled = true;
  document.getElementById('kbt-max-attempts').value = '3';
  kbQCount = 0;
  addQuestion();
  openModal('kbt-modal');
}

async function openKbEditTest(id) {
  const t = kbTests.find(x => x.id === id);
  if (!t) return;

  document.getElementById('kbt-id').value    = t.id;
  document.getElementById('kbt-title').value = t.title;
  document.getElementById('kbt-desc').value  = t.description || '';
  document.getElementById('kbt-passing-score').value = t.passing_score ?? 60;
  document.getElementById('kbt-error').hidden = true;
  document.getElementById('kbt-modal-title').textContent = 'Редактировать тест';

  // Попытки
  if (t.max_attempts) {
    document.querySelector('input[name="kbt-attempts-type"][value="limited"]').checked = true;
    document.getElementById('kbt-max-attempts').disabled = false;
    document.getElementById('kbt-max-attempts').value = t.max_attempts;
  } else {
    document.querySelector('input[name="kbt-attempts-type"][value="unlimited"]').checked = true;
    document.getElementById('kbt-max-attempts').disabled = true;
    document.getElementById('kbt-max-attempts').value = '3';
  }

  const container = document.getElementById('kbt-questions-list');
  container.innerHTML = '';
  kbQCount = 0;

  const qs = (() => { try { return JSON.parse(t.questions || '[]'); } catch { return []; } })();
  qs.forEach(q => addQuestion(q));
  if (!qs.length) addQuestion();

  openModal('kbt-modal');
}

function addQuestion(prefill) {
  const idx  = kbQCount++;
  const div  = document.createElement('div');
  div.className   = 'kbt-q-block';
  div.dataset.idx = idx;

  const opts  = prefill?.opts || ['', '', '', ''];
  const ans   = prefill?.ans  ?? 0;
  const multi = Array.isArray(ans);  // true = множественный выбор

  div.innerHTML = `
    <div class="kbt-q-header">
      <span class="kbt-q-num">Вопрос ${idx + 1}</span>
      <button type="button" class="kbt-q-mode-toggle ${multi ? 'multi' : ''}"
              onclick="toggleQuestionMode(this)" title="Переключить тип ответа">
        ${multi ? '☑ Несколько ответов' : '◉ Один ответ'}
      </button>
      <button type="button" class="kbt-q-del" onclick="removeQuestion(this)" title="Удалить">×</button>
    </div>
    <div class="modal-field">
      <label>Текст вопроса *</label>
      <input type="text" class="kbt-q-text-input" placeholder="Вопрос..." value="${esc(prefill?.q || '')}" required>
    </div>
    <div class="kbt-opts-grid">
      ${opts.map((o, i) => {
        const checked = multi ? (Array.isArray(ans) && ans.includes(i)) : (ans === i);
        const type    = multi ? 'checkbox' : 'radio';
        const name    = multi ? `kbt-ans-multi-${idx}` : `kbt-ans-${idx}`;
        return `<label class="kbt-opt-row">
          <input type="${type}" name="${name}" value="${i}" ${checked ? 'checked' : ''}>
          <input type="text" class="kbt-opt-input" placeholder="Вариант ${i+1}" value="${esc(o)}">
        </label>`;
      }).join('')}
    </div>
    <div class="kbt-opt-hint">${multi
      ? 'Отметьте все правильные варианты (чекбоксы)'
      : 'Отметьте один правильный вариант (радиокнопка)'}</div>
  `;

  document.getElementById('kbt-questions-list').appendChild(div);
}

function toggleQuestionMode(btn) {
  const block = btn.closest('.kbt-q-block');
  const idx   = block.dataset.idx;
  const isMulti = btn.classList.contains('multi');

  // Запоминаем текущие значения
  const opts  = [...block.querySelectorAll('.kbt-opt-input')].map(i => i.value);
  const checked = new Set(
    [...block.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked')]
      .map(i => parseInt(i.value))
  );

  const newMulti = !isMulti;
  const grid = block.querySelector('.kbt-opts-grid');
  const hint = block.querySelector('.kbt-opt-hint');

  grid.innerHTML = opts.map((o, i) => {
    const type = newMulti ? 'checkbox' : 'radio';
    const name = newMulti ? `kbt-ans-multi-${idx}` : `kbt-ans-${idx}`;
    const ch   = newMulti ? checked.has(i) : (checked.has(i) || (i === 0 && !checked.size));
    return `<label class="kbt-opt-row">
      <input type="${type}" name="${name}" value="${i}" ${ch ? 'checked' : ''}>
      <input type="text" class="kbt-opt-input" placeholder="Вариант ${i+1}" value="${esc(o)}">
    </label>`;
  }).join('');

  btn.classList.toggle('multi', newMulti);
  btn.textContent = newMulti ? '☑ Несколько ответов' : '◉ Один ответ';
  hint.textContent = newMulti
    ? 'Отметьте все правильные варианты (чекбоксы)'
    : 'Отметьте один правильный вариант (радиокнопка)';
}

function removeQuestion(btn) {
  const block = btn.closest('.kbt-q-block');
  if (block) block.remove();
  document.querySelectorAll('.kbt-q-block').forEach((b, i) => {
    const num = b.querySelector('.kbt-q-num');
    if (num) num.textContent = `Вопрос ${i + 1}`;
  });
}

function collectQuestions() {
  const blocks = document.querySelectorAll('#kbt-questions-list .kbt-q-block');
  const qs = [];
  for (const b of blocks) {
    const q    = b.querySelector('.kbt-q-text-input')?.value.trim() || '';
    const opts = [...b.querySelectorAll('.kbt-opt-input')].map(i => i.value.trim());
    const multi = b.querySelector('.kbt-q-mode-toggle')?.classList.contains('multi');
    let ans;
    if (multi) {
      ans = [...b.querySelectorAll('input[type="checkbox"]:checked')].map(i => parseInt(i.value));
      if (!ans.length) { return null; }
    } else {
      const checked = b.querySelector('input[type="radio"]:checked');
      ans = checked ? parseInt(checked.value) : 0;
    }
    if (!q) return null;
    qs.push({ q, opts, ans });
  }
  return qs;
}

async function handleSaveTest(e) {
  e.preventDefault();
  const errEl = document.getElementById('kbt-error');
  const btn   = document.getElementById('kbt-submit');
  errEl.hidden = true;

  const id    = document.getElementById('kbt-id').value;
  const title = document.getElementById('kbt-title').value.trim();
  const desc  = document.getElementById('kbt-desc').value.trim();
  const qs    = collectQuestions();
  const passingScore = parseInt(document.getElementById('kbt-passing-score').value) || 60;
  const attemptsType = document.querySelector('input[name="kbt-attempts-type"]:checked')?.value;
  const maxAttempts  = attemptsType === 'limited'
    ? (parseInt(document.getElementById('kbt-max-attempts').value) || 3)
    : null;

  if (!title) { errEl.textContent = 'Введите название теста'; errEl.hidden = false; return; }
  if (!qs)    { errEl.textContent = 'Отметьте правильные ответы во всех вопросах'; errEl.hidden = false; return; }
  if (!qs.length) { errEl.textContent = 'Добавьте хотя бы один вопрос'; errEl.hidden = false; return; }

  btn.disabled = true; btn.textContent = 'СОХРАНЕНИЕ...';

  const body = { title, description: desc, questions: qs, passing_score: passingScore, max_attempts: maxAttempts };
  const url  = id ? `${API}/api/knowledge/tests/${id}` : `${API}/api/knowledge/tests`;

  try {
    const res  = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeModal('kbt-modal');
    await loadKbTests();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОХРАНИТЬ ТЕСТ';
  }
}

async function deleteKbTest(id) {
  if (!confirm('Удалить тест? Все назначения и результаты будут удалены.')) return;
  try {
    const res  = await fetch(`${API}/api/knowledge/tests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() },
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadKbTests();
  } catch { alert('Ошибка соединения.'); }
}

// ─── Назначить тест ──────────────────────────────────────────────────────────
function openAssignTest(id, title) {
  document.getElementById('kba-test-id').value        = id;
  document.getElementById('kba-test-name').textContent = title;
  document.getElementById('kba-error').hidden = true;
  document.getElementById('kba-due').value    = '';

  const sel = document.getElementById('kba-target');
  sel.innerHTML = '<option value="all">Всем сотрудникам</option>';
  kbUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value       = u.id;
    opt.textContent = u.full_name || u.username;
    sel.appendChild(opt);
  });

  openModal('kba-modal');
  loadAssignedList(id);
}

async function loadAssignedList(testId) {
  const el = document.getElementById('kba-assigned-list');
  el.innerHTML = '<span class="kba-assigned-loading">Загрузка...</span>';
  try {
    const res  = await fetch(`${API}/api/knowledge/tests/${testId}/assign`, {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    if (!data.success || !data.assignments.length) {
      el.innerHTML = '<span class="kba-assigned-empty">Никому не назначен</span>';
      return;
    }
    el.innerHTML = data.assignments.map(a => {
      let status = '';
      if (a.submitted_at) {
        status = a.passed
          ? `<span class="kba-badge kba-badge--pass">Сдан ${a.score}%</span>`
          : `<span class="kba-badge kba-badge--fail">Не сдан ${a.score}%</span>`;
      } else {
        status = `<span class="kba-badge kba-badge--wait">Ожидает</span>`;
      }
      const due = a.due_date ? `<span class="kba-due">до ${a.due_date}</span>` : '';
      return `<div class="kba-assigned-row">
        <span class="kba-assigned-name">${esc(a.name)}</span>
        <span class="kba-assigned-meta">${due}${status}</span>
        <button class="kba-remove-btn" onclick="removeAssignment(${a.id}, ${testId})" title="Снять назначение">✕</button>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<span class="kba-assigned-empty">Ошибка загрузки</span>';
  }
}

async function removeAssignment(assignId, testId) {
  if (!confirm('Снять назначение теста?')) return;
  try {
    const res  = await fetch(`${API}/api/knowledge/tests/${testId}/assign/${assignId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    if (!data.success) { alert(data.message || 'Ошибка'); return; }
    loadAssignedList(testId);
    loadKbTests();
  } catch { alert('Ошибка соединения.'); }
}

async function handleAssignTest() {
  const errEl  = document.getElementById('kba-error');
  errEl.hidden = true;
  const testId = document.getElementById('kba-test-id').value;
  const target = document.getElementById('kba-target').value;
  const due    = document.getElementById('kba-due').value;

  try {
    const res = await fetch(`${API}/api/knowledge/tests/${testId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ target, due_date: due || null }),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    await loadKbTests();
    loadAssignedList(testId);
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  }
}
// ===== CANDIDATES =====
function switchCandidatesTab(tab, el) {
  document.querySelectorAll('#section-candidates .filter-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('candidates-ai-list').style.display   = tab === 'ai'   ? '' : 'none';
  document.getElementById('candidates-form-list').style.display = tab === 'form' ? '' : 'none';
}

function candidateCard(fields, deleteCall, badge, transcript) {
  return '<div style="margin-bottom:1rem;padding:1.2rem 1.4rem;border:1px solid #e0e6ef;border-radius:10px;background:#fff">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">'
    + '<div style="flex:1;min-width:0">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
    + badge
    + '</div>'
    + fields
    + '</div>'
    + '<button onclick="' + deleteCall + '" style="background:none;border:1px solid #e0e0e0;border-radius:6px;padding:5px 10px;cursor:pointer;color:#999;font-size:12px;flex-shrink:0">Удалить</button>'
    + '</div>'
    + (transcript
        ? '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;color:#888;user-select:none">Показать диалог</summary>'
          + '<div style="margin-top:8px;padding:10px;background:#f4f6f8;border-radius:8px;font-size:12px;line-height:1.7;color:#333;max-height:200px;overflow-y:auto">' + transcript + '</div></details>'
        : '')
    + '</div>';
}

async function loadAiCandidates() {
  const wrap = document.getElementById('candidates-ai-list');
  if (!wrap) return;
  wrap.innerHTML = '<div class="table-loader"><span class="loader"></span></div>';
  try {
    const token = localStorage.getItem('cms_token');
    const data  = await fetch(API + '/api/ai-candidates', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json());
    const list  = data.candidates || [];
    if (!list.length) { wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:#888">Пока нет одобренных кандидатов от AI</div>'; return; }
    wrap.innerHTML = list.map(c => {
      const date       = new Date(c.created_at).toLocaleString('ru-RU');
      const transcript = (c.transcript || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      const badge      = '<span style="background:#1976d2;color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px">&#x1F916; Рекомендован ИИ</span>'
                       + '<span style="color:#888;font-size:12px">' + date + '</span>';
      const fields     = '<div style="font-size:1rem;font-weight:600;color:#1a1a2e">' + escH(c.candidate_name) + '</div>'
                       + '<div style="font-size:13px;color:#555;margin-top:2px">&#128222; <b>' + escH(c.candidate_phone || '—') + '</b> &nbsp;&middot;&nbsp; Вакансия: <b>' + escH(c.vacancy_title) + '</b></div>'
                       + '<div style="font-size:13px;color:#444;margin-top:6px;line-height:1.5">' + escH(c.ai_summary) + '</div>';
      return candidateCard(fields, 'deleteAiCandidate(' + c.id + ',this)', badge, transcript);
    }).join('');
  } catch {
    wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:#c00">Ошибка загрузки</div>';
  }
}

async function deleteAiCandidate(id, btn) {
  if (!confirm('Удалить запись?')) return;
  btn.disabled = true;
  try {
    await fetch(API + '/api/ai-candidates/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('cms_token') } });
    loadAiCandidates();
  } catch { btn.disabled = false; }
}

async function loadFormCandidates() {
  const wrap = document.getElementById('candidates-form-list');
  if (!wrap) return;
  wrap.innerHTML = '<div class="table-loader"><span class="loader"></span></div>';
  try {
    const token = localStorage.getItem('cms_token');
    const data  = await fetch(API + '/api/form-candidates', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json());
    const list  = data.candidates || [];
    if (!list.length) { wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:#888">Заявок с формы пока нет</div>'; return; }
    wrap.innerHTML = list.map(c => {
      const date   = new Date(c.created_at).toLocaleString('ru-RU');
      const badge  = '<span style="background:#388e3c;color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px">&#128203; Форма заявок</span>'
                   + '<span style="color:#888;font-size:12px">' + date + '</span>';
      const resumeBtn = c.resume_path
        ? `<button onclick="downloadResume(${c.id}, '${escH(c.resume_name || 'resume')}')"
              style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:4px 12px;
                     background:#e3f0fc;color:#1565c0;border-radius:6px;font-size:12px;font-weight:600;
                     border:1px solid #bbdefb;cursor:pointer">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
               <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
               <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
             </svg>
             ${escH(c.resume_name || 'Резюме')}
           </button>`
        : '';
      const fields = '<div style="font-size:1rem;font-weight:600;color:#1a1a2e">' + escH(c.fullname) + '</div>'
                   + '<div style="font-size:13px;color:#555;margin-top:2px">'
                   + (c.phone ? '&#128222; <b>' + escH(c.phone) + '</b> &nbsp;&middot;&nbsp; ' : '')
                   + '&#128231; <b>' + escH(c.email) + '</b>'
                   + (c.position ? ' &nbsp;&middot;&nbsp; Вакансия: <b>' + escH(c.position) + '</b>' : '')
                   + '</div>'
                   + (c.message ? '<div style="font-size:13px;color:#444;margin-top:6px;line-height:1.5">' + escH(c.message) + '</div>' : '')
                   + resumeBtn;
      return candidateCard(fields, 'deleteFormCandidate(' + c.id + ',this)', badge, '');
    }).join('');
  } catch {
    wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:#c00">Ошибка загрузки</div>';
  }
}

async function downloadResume(id, filename) {
  try {
    const res = await fetch(`${API}/api/form-candidates/${id}/resume`, {
      headers: { Authorization: 'Bearer ' + token() }
    });
    if (!res.ok) { alert('Файл не найден.'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { alert('Ошибка при скачивании файла.'); }
}

async function deleteFormCandidate(id, btn) {
  if (!confirm('Удалить запись?')) return;
  btn.disabled = true;
  try {
    await fetch(API + '/api/form-candidates/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('cms_token') } });
    loadFormCandidates();
  } catch { btn.disabled = false; }
}

function escH(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
