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
    const map = {
      ArrowDown:  80, ArrowUp: -80,
      PageDown:   window.innerHeight * 0.88,
      PageUp:    -window.innerHeight * 0.88,
      End:        maxScroll(), Home: -maxScroll(),
      ' ':        window.innerHeight * 0.88,
    };
    const delta = e.shiftKey && e.key === ' ' ? -window.innerHeight * 0.88 : map[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      target = clamp(target + delta, 0, maxScroll());
      start();
    }
  });

  // Синхронизация со скроллбаром браузера
  window.addEventListener('scroll', () => {
    if (!running) { target = window.scrollY; current = window.scrollY; }
  });
})();

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
}

function resetNavbar() {
  const label = document.getElementById('btn-login-label');
  if (label) label.textContent = 'ВОЙТИ';
  const dd = document.getElementById('client-dropdown');
  if (dd) dd.classList.remove('open');
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
window.loginBtnClick = function() {
  const user = getSession();
  if (user) {
    // Показать дропдаун
    const dd = document.getElementById('client-dropdown');
    if (dd) dd.classList.toggle('open');
  } else {
    document.getElementById('login-error').hidden = true;
    document.getElementById('login-form').reset();
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
