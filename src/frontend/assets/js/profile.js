const API = 'http://localhost:8000';
const ROLE_LABELS = { admin: 'Администратор', employee: 'Сотрудник', client: 'Клиент' };
const CLIENT_TYPE_LABELS = {
  individual:   'Физическое лицо',
  ip:           'Индивидуальный предприниматель (ИП)',
  selfemployed: 'Самозанятый',
  company:      'Компания',
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('cms_token');
  const user  = getUser();

  if (!token || !user) {
    window.location.replace('index.html');
    return;
  }

  fillHeader(user);
  loadProfile();

  document.addEventListener('click', e => {
    const menu = document.getElementById('p-user-menu');
    if (menu && !menu.contains(e.target)) menu.classList.remove('open');
  });
});

function getUser() {
  try { return JSON.parse(localStorage.getItem('cms_user')); } catch { return null; }
}
function token() { return localStorage.getItem('cms_token'); }

// ===== HEADER =====
function fillHeader(user) {
  const ini = initials(user.full_name || user.username);
  setText('p-avatar',   ini);
  setText('p-username', user.full_name || user.username);
  setText('p-dd-avatar', ini);
  setText('p-dd-name',  user.full_name || user.username);
  setText('p-dd-email', user.email || '');
}

function toggleMenu(e) {
  e.stopPropagation();
  document.getElementById('p-user-menu').classList.toggle('open');
}

function logout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  window.location.replace('index.html');
}

// ===== LOAD PROFILE =====
async function loadProfile() {
  try {
    const res  = await fetch(API + '/api/profile', {
      headers: { Authorization: 'Bearer ' + token() }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    fillForm(data.user);
  } catch (err) {
    showMsg('Ошибка загрузки профиля: ' + err.message, false);
  }
}

function fillForm(u) {
  // Шапка профиля
  const ini  = initials(u.full_name || u.first_name || u.username);
  const name = u.full_name || u.username;
  setText('hero-avatar', ini);
  setText('hero-name',   name);
  setText('hero-role',   ROLE_LABELS[u.role] || u.role);
  setText('hero-email',  u.email || '');

  // Поля формы
  val('f-last',    u.last_name   || '');
  val('f-first',   u.first_name  || '');
  val('f-patr',    u.patronymic  || '');
  val('f-phone',   u.phone       || '');
  val('f-email',   u.email       || '');
  val('f-desc',    u.description || '');
  // Тип клиента — бейдж в hero-карточке, только для клиентов
  const type = u.client_type || 'individual';
  const typeBadge = document.getElementById('hero-client-type');
  if (typeBadge) {
    if (u.role === 'client') {
      typeBadge.textContent = CLIENT_TYPE_LABELS[type] || type;
      typeBadge.hidden = false;
    } else {
      typeBadge.hidden = true;
    }
  }

  // Поле компании — только для юридических лиц (тип company)
  const companyField = document.getElementById('company-field');
  if (companyField) {
    companyField.hidden = type !== 'company';
    val('f-company', u.company_name || '');
  }
}

// ===== SAVE PROFILE =====
async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  const msg = document.getElementById('save-msg');
  msg.hidden  = true;
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  const body = {
    first_name:  get('f-first'),
    last_name:   get('f-last'),
    patronymic:  get('f-patr'),
    phone:       get('f-phone'),
    description: get('f-desc'),
  };

  try {
    const res  = await fetch(API + '/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) { showMsg(data.message || 'Ошибка сохранения', false); return; }

    // Обновить localStorage
    const stored = getUser();
    if (stored) {
      stored.full_name = data.user.full_name || stored.full_name;
      localStorage.setItem('cms_user', JSON.stringify(stored));
    }

    fillForm(data.user);
    fillHeader(data.user);
    showMsg('Изменения сохранены', true);

  } catch {
    showMsg('Нет связи с сервером', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить изменения';
  }
}

// ===== HELPERS =====
function showMsg(text, ok) {
  const el = document.getElementById('save-msg');
  el.textContent = text;
  el.className   = 'p-save-msg ' + (ok ? 'p-save-msg--ok' : 'p-save-msg--err');
  el.hidden = false;
  if (ok) setTimeout(() => { el.hidden = true; }, 4000);
}

function initials(str) {
  if (!str) return '?';
  const p = str.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : str.slice(0, 2).toUpperCase();
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function val(id, v)  { const el = document.getElementById(id); if (el) el.value = v; }
function get(id)     { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
