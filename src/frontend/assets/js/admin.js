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
function switchSection(name, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('section-' + name).classList.add('active');
  document.getElementById('page-title').textContent =
    name === 'users' ? 'Пользователи' : name;
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