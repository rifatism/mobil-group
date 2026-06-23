// ===== SMOOTH SCROLL (lerp / инерционное скольжение) =====
(function () {
  // Пропускаем на тач-устройствах — там нативный скролл лучше
  if ('ontouchstart' in window) return;

  let target  = window.scrollY;
  let current = window.scrollY;
  let running = false;
  const EASE  = 0.042; // чем меньше — тем длиннее скольжение

  function lerp(a, b, t) { return a + (b - a) * t; }
  function maxScroll()    { return document.documentElement.scrollHeight - window.innerHeight; }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function tick() {
    current = lerp(current, target, EASE);
    window.scrollTo(0, current);

    if (Math.abs(target - current) > 0.5) {
      requestAnimationFrame(tick);
    } else {
      current = target;
      window.scrollTo(0, current);
      running = false;
    }
  }

  function start() {
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  // Колесо мыши
  window.addEventListener('wheel', e => {
    e.preventDefault();
    target = clamp(target + e.deltaY, 0, maxScroll());
    start();
  }, { passive: false });

  // Клавиатура
  window.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    const editable = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;

    // Блокируем пробел везде, кроме полей ввода
    if (e.key === ' ' && !editable) {
      e.preventDefault();
      return;
    }

    const map = {
      ArrowDown:  80, ArrowUp: -80,
      PageDown:   window.innerHeight * 0.88,
      PageUp:    -window.innerHeight * 0.88,
      End:        maxScroll(), Home: -maxScroll(),
    };
    const delta = map[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      target = clamp(target + delta, 0, maxScroll());
      start();
    }
  });

  // Публичный метод плавного скролла к позиции
  window.smoothScrollTo = function(y) {
    target = clamp(y, 0, maxScroll());
    start();
  };

  // Синхронизация со скроллбаром браузера
  window.addEventListener('scroll', () => {
    if (!running) { target = window.scrollY; current = window.scrollY; }
  });
})();

// ===== ПЛАВНЫЙ ПЕРЕХОД К РАЗДЕЛАМ ПО ЯКОРЮ =====
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const y = el.getBoundingClientRect().top + window.scrollY;
    if (window.smoothScrollTo) { window.smoothScrollTo(y); }
    else { window.scrollTo({ top: y, behavior: 'smooth' }); }
  });
});

// ===== HERO SLIDER =====
const slides = document.querySelectorAll('.hero-slide');
let currentSlide = 0;
function nextSlide() {
  slides[currentSlide].classList.remove('active');
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add('active');
}
setInterval(nextSlide, 4000);

// ===== NAVBAR SCROLL =====
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.6);
});

// ===== SCROLL REVEAL (scale from center) =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.feat-card, .cat-item').forEach(el => revealObserver.observe(el));

// ===== 3D TILT HOVER — карточки преимуществ =====
document.querySelectorAll('.feat-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transition = 'transform 0.08s ease, box-shadow 0.08s ease';
    card.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.03)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease';
    card.style.transform = card.classList.contains('feat-dark')
      ? 'translateY(-30px) scale(1)'
      : 'scale(1)';
    setTimeout(() => { card.style.transform = ''; }, 560);
  });
});

// ===== AUTH =====
const API_BASE = 'http://localhost:8000';

// --- Утилиты модалов ---
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Закрытие по клику на backdrop
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
});

// --- Состояние сессии ---
function getSession() {
  try { return JSON.parse(localStorage.getItem('cms_user')); } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem('cms_token', token);
  localStorage.setItem('cms_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
}

const ROLE_LABELS = { admin: 'Администратор', employee: 'Сотрудник', client: 'Клиент' };

function applySession(user) {
  const label = document.getElementById('btn-login-label');
  if (label) label.textContent = (user.full_name || user.username).toUpperCase();
  const adminLink = document.getElementById('cd-admin-link');
  if (adminLink) adminLink.style.display = user.role === 'admin' ? '' : 'none';
  const kbLink = document.getElementById('cd-knowledge-link');
  if (kbLink) kbLink.style.display = ['admin','employee'].includes(user.role) ? '' : 'none';
  const kbNav = document.getElementById('nav-knowledge-item');
  if (kbNav) kbNav.style.display = ['admin','employee'].includes(user.role) ? '' : 'none';
  const kbMob = document.getElementById('mob-knowledge-item');
  if (kbMob) kbMob.style.display = ['admin','employee'].includes(user.role) ? '' : 'none';
}

function resetNavbar() {
  const label = document.getElementById('btn-login-label');
  if (label) label.textContent = 'ВОЙТИ';
  const dd = document.getElementById('client-dropdown');
  if (dd) dd.classList.remove('open');
  const adminLink = document.getElementById('cd-admin-link');
  if (adminLink) adminLink.style.display = 'none';
  const kbLink = document.getElementById('cd-knowledge-link');
  if (kbLink) kbLink.style.display = 'none';
  const kbNav = document.getElementById('nav-knowledge-item');
  if (kbNav) kbNav.style.display = 'none';
  const kbMob = document.getElementById('mob-knowledge-item');
  if (kbMob) kbMob.style.display = 'none';
}

// При загрузке — восстановить сессию
(function restoreSession() {
  const user = getSession();
  if (user) applySession(user);
})();

// Закрыть дропдаун при клике вне
document.addEventListener('click', e => {
  const dd = document.getElementById('client-dropdown-wrap');
  if (dd && !dd.contains(e.target)) {
    const menu = document.getElementById('client-dropdown');
    if (menu) menu.classList.remove('open');
  }
});

// --- Кнопка ВОЙТИ / дропдаун ---
window.toggleForgotPassword = function() {
  const info = document.getElementById('forgot-info');
  if (!info) return;
  info.hidden = !info.hidden;
};

window.loginBtnClick = function() {
  const user = getSession();
  if (user) {
    // Залогинен — показать дропдаун
    const dd = document.getElementById('client-dropdown');
    if (dd) dd.classList.toggle('open');
  } else {
    // Не залогинен — открыть модал
    document.getElementById('login-error').hidden = true;
    document.getElementById('login-form').reset();
    // Сбрасываем блок с телефоном при каждом открытии модала
    const forgotInfo = document.getElementById('forgot-info');
    if (forgotInfo) forgotInfo.hidden = true;
    openModal('login-modal');
    setTimeout(() => document.getElementById('login-username').focus(), 150);
  }
};

window.clientLogout = function() {
  clearSession();
  resetNavbar();
  window.location.reload();
};

window.closeLoginModal = function() { closeModal('login-modal'); };

// --- Логин ---
window.handleLogin = async function(e) {
  e.preventDefault();
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('login-submit');
  errEl.hidden = true;

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  btn.disabled = true;
  btn.textContent = 'ВХОД...';

  try {
    const res  = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!data.success) {
      errEl.textContent = data.message || 'Неверный логин или пароль';
      errEl.hidden = false;
      return;
    }

    setSession(data.token, data.user);
    if (data.user.role === 'admin') {
      window.location.href = 'admin.html';
      return;
    }
    applySession(data.user);
    closeModal('login-modal');

  } catch {
    errEl.textContent = 'Нет связи с сервером. Проверьте подключение.';
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'ВОЙТИ';
  }
};

// --- Добавить пользователя (admin) ---
window.openAddUser = function() {
  document.getElementById('adduser-error').hidden = true;
  document.getElementById('adduser-success').hidden = true;
  document.getElementById('adduser-form').reset();
  openModal('adduser-modal');
};
window.closeAddUser = function() { closeModal('adduser-modal'); };

window.handleAddUser = async function(e) {
  e.preventDefault();
  const errEl = document.getElementById('adduser-error');
  const okEl  = document.getElementById('adduser-success');
  const btn   = document.getElementById('adduser-submit');
  errEl.hidden = true;
  okEl.hidden  = true;

  const token = localStorage.getItem('cms_token');
  if (!token) { errEl.textContent = 'Сессия истекла, войдите заново.'; errEl.hidden = false; return; }

  const body = {
    role:      document.getElementById('au-role').value,
    username:  document.getElementById('au-username').value.trim(),
    full_name: document.getElementById('au-fullname').value.trim(),
    email:     document.getElementById('au-email').value.trim(),
    phone:     document.getElementById('au-phone').value.trim(),
    password:  document.getElementById('au-password').value,
  };

  btn.disabled = true;
  btn.textContent = 'СОЗДАНИЕ...';

  try {
    const res  = await fetch(API_BASE + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      errEl.textContent = data.message || 'Ошибка при создании';
      errEl.hidden = false;
      return;
    }

    okEl.textContent = `Пользователь «${data.user.username}» (${ROLE_LABELS[data.user.role]}) создан`;
    okEl.hidden = false;
    document.getElementById('adduser-form').reset();

  } catch {
    errEl.textContent = 'Нет связи с сервером.';
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'СОЗДАТЬ';
  }
};

// ===== HOME NEWS =====
(async function loadHomeNews() {
  const grid = document.getElementById('home-news-grid');
  if (!grid) return;

  const PH_SVG = '<div class="news-card-img-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';

  function fmtHomeDate(str) {
    const d = new Date(str);
    return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function escN(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  try {
    const res  = await fetch(API_BASE + '/api/news');
    const data = await res.json();
    const items = (data.news || []).slice(0, 2);

    if (!items.length) { grid.innerHTML = ''; return; }

    grid.innerHTML = items.map(n => {
      const imgInner = n.image
        ? `<img src="${escN(n.image)}" alt="${escN(n.title)}" loading="lazy">`
        : PH_SVG;

      return `<article class="news-card" onclick="window.location.href='news.html'">
        <div class="news-card-img">${imgInner}</div>
        <div class="news-card-body">
          <span class="news-card-date">${fmtHomeDate(n.created_at)}</span>
          <h3 class="news-card-title">${escN(n.title)}</h3>
          ${n.excerpt ? `<p class="news-card-excerpt">${escN(n.excerpt)}</p>` : ''}
          <span class="news-card-link">Читать далее →</span>
        </div>
      </article>`;
    }).join('');

  } catch {
    grid.innerHTML = '';
  }
})();

// ===== CONTACT FORM =====
window.submitContactForm = async function(e) {
  e.preventDefault();
  const statusEl = document.getElementById('cf-status');
  const btn      = document.getElementById('cf-submit');

  statusEl.className = 'cf-status';
  statusEl.hidden    = true;

  const body = {
    organization: document.getElementById('cf-organization').value.trim(),
    contact:      document.getElementById('cf-contact').value.trim(),
    email:        document.getElementById('cf-email').value.trim(),
    phone:        document.getElementById('cf-phone').value.trim(),
    message:      document.getElementById('cf-message').value.trim(),
    consent:      document.getElementById('cf-consent').checked,
  };

  btn.disabled    = true;
  btn.textContent = 'ОТПРАВКА...';

  try {
    const res  = await fetch(API_BASE + '/api/contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();

    if (data.success) {
      statusEl.textContent = 'Спасибо! Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.';
      statusEl.className   = 'cf-status success';
      document.getElementById('contact-form').reset();
    } else {
      statusEl.textContent = data.message || 'Ошибка при отправке. Попробуйте позже.';
      statusEl.className   = 'cf-status error';
    }
  } catch {
    statusEl.textContent = 'Нет связи с сервером. Проверьте подключение.';
    statusEl.className   = 'cf-status error';
  } finally {
    statusEl.hidden  = false;
    btn.disabled     = false;
    btn.textContent  = 'ОТПРАВИТЬ';
  }
};

// ===== MOBILE NAV =====
window.toggleMobNav = function() {
  const nav    = document.getElementById('mob-nav');
  const burger = document.getElementById('nav-burger');
  if (!nav) return;
  const opening = !nav.classList.contains('open');
  nav.classList.toggle('open', opening);
  if (burger) burger.classList.toggle('open', opening);
  document.body.style.overflow = opening ? 'hidden' : '';
};

window.toggleMobDrop = function(btn) {
  const sub = btn.nextElementSibling;
  if (!sub) return;
  btn.classList.toggle('open');
  sub.classList.toggle('open');
};

window.toggleMobUser = function(btn) {
  const menu = document.getElementById('mob-user-menu');
  if (!menu) return;
  btn.classList.toggle('open');
  menu.classList.toggle('open');
};

function updateMobNav(user) {
  const avatar = document.getElementById('mob-u-avatar');
  const name   = document.getElementById('mob-u-name');
  const label  = document.getElementById('mob-u-label');
  const menu   = document.getElementById('mob-user-menu');
  const loginLink = document.getElementById('mob-login-link');

  if (!menu) return;

  if (user) {
    if (avatar) avatar.textContent = (user.full_name || user.username || '?')[0].toUpperCase();
    if (name)   name.textContent   = user.full_name || user.username;
    if (label)  label.textContent  = (user.role === 'admin' ? 'Администратор' : user.role === 'employee' ? 'Сотрудник' : 'Клиент');
    if (loginLink) loginLink.style.display = 'none';

    menu.innerHTML = `
      ${user.role === 'admin' ? `<a href="admin.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Панель администратора</a>` : ''}
      <a href="profile.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        Профиль</a>
      <a href="dashboard.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Дашборд</a>
      ${['admin','employee'].includes(user.role) ? `<a href="knowledge.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        База знаний</a>` : ''}
      <button onclick="clientLogout()" class="mob-logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Выйти</button>
    `;
  } else {
    if (avatar) avatar.textContent = '?';
    if (name)   name.textContent   = 'Войти';
    if (label)  label.textContent  = 'Личный кабинет';
    if (loginLink) loginLink.style.display = '';
    menu.innerHTML = '';
  }
}

// Патчим applySession и resetNavbar чтобы обновляли и мобильное меню
const _origApply = typeof applySession === 'function' ? applySession : null;
const _origReset = typeof resetNavbar  === 'function' ? resetNavbar  : null;
(function patchSession() {
  const origApply = window._origApplySession || applySession;
  const origReset = window._origResetNavbar  || resetNavbar;
  window._origApplySession = origApply;
  window._origResetNavbar  = origReset;
  applySession = function(u) { origApply(u); updateMobNav(u); };
  resetNavbar  = function()  { origReset();  updateMobNav(null); };
  // Sync current session
  const u = getSession();
  updateMobNav(u || null);
})();

// Закрыть мобильный нав кликом по бэкдропу
document.addEventListener('click', e => {
  if (e.target.classList.contains('mob-nav-backdrop')) toggleMobNav();
});
