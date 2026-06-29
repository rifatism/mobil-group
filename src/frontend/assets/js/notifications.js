/**
 * Notifications widget — подключается на любой странице где есть #notif-bell-wrap
 */
(function () {
  const API = 'http://localhost:8000';
  let pollTimer = null;
  let unreadCount = 0;

  function token() {
    return localStorage.getItem('cms_token') || '';
  }

  function user() {
    try { return JSON.parse(localStorage.getItem('cms_user') || '{}'); }
    catch { return {}; }
  }

  // ── Форматирование времени ────────────────────────────────────────────────
  // MySQL возвращает "YYYY-MM-DD HH:MM:SS" без timezone — добавляем Z чтобы JS парсил как UTC
  function parseUTC(dt) {
    if (!dt) return new Date(NaN);
    const s = String(dt).trim();
    return new Date(s.includes('T') || s.includes('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z');
  }

  function formatTime(dt) {
    const d = parseUTC(dt);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин. назад';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч. назад';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  // ── Иконка по типу ────────────────────────────────────────────────────────
  function typeIcon(type) {
    if (type === 'test_assigned') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    if (type === 'test_passed')   return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`;
    if (type === 'test_failed')   return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    if (type === 'file_uploaded') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }

  // ── Загрузить и отрендерить ────────────────────────────────────────────────
  async function loadNotifications(renderPanel = false) {
    if (!token()) return;
    try {
      const res  = await fetch(`${API}/api/notifications?limit=30`, {
        headers: { Authorization: 'Bearer ' + token() }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      unreadCount = data.unread;
      updateBadge();
      if (renderPanel) renderList(data.notifications);
    } catch { /* offline */ }
  }

  function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderList(list) {
    const body = document.getElementById('notif-list-body');
    if (!body) return;
    if (!list.length) {
      body.innerHTML = '<p class="notif-empty">Уведомлений нет</p>';
      return;
    }
    body.innerHTML = list.map(n => `
      <div class="notif-item${n.is_read == 1 ? '' : ' notif-item--unread'}" data-id="${n.id}" data-link="${n.link || ''}">
        <div class="notif-item-icon notif-icon--${n.type}">${typeIcon(n.type)}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${esc(n.title)}</div>
          ${n.body ? `<div class="notif-item-text">${esc(n.body)}</div>` : ''}
          <div class="notif-item-time">${formatTime(n.created_at)}</div>
        </div>
        <button class="notif-item-del" title="Удалить" onclick="notifDelete(event,${n.id})">×</button>
      </div>
    `).join('');

    body.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('notif-item-del')) return;
        const id   = +el.dataset.id;
        const link = el.dataset.link;
        markRead(id);
        if (link) window.location.href = link;
      });
    });
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Отметить как прочитанное ──────────────────────────────────────────────
  async function markRead(id) {
    const el = document.querySelector(`.notif-item[data-id="${id}"]`);
    if (el) el.classList.remove('notif-item--unread');
    try {
      await fetch(`${API}/api/notifications/${id}/read`, {
        method: 'PUT', headers: { Authorization: 'Bearer ' + token() }
      });
      if (unreadCount > 0) { unreadCount--; updateBadge(); }
    } catch {}
  }

  // ── Удалить уведомление ───────────────────────────────────────────────────
  window.notifDelete = async function (e, id) {
    e.stopPropagation();
    const el = document.querySelector(`.notif-item[data-id="${id}"]`);
    if (el) {
      const wasUnread = el.classList.contains('notif-item--unread');
      el.remove();
      if (wasUnread && unreadCount > 0) { unreadCount--; updateBadge(); }
    }
    try {
      await fetch(`${API}/api/notifications/${id}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token() }
      });
    } catch {}
  };

  // ── Отметить все прочитанными ─────────────────────────────────────────────
  window.notifReadAll = async function () {
    document.querySelectorAll('.notif-item--unread').forEach(el => el.classList.remove('notif-item--unread'));
    unreadCount = 0;
    updateBadge();
    try {
      await fetch(`${API}/api/notifications/read`, {
        method: 'PUT', headers: { Authorization: 'Bearer ' + token() }
      });
    } catch {}
  };

  // ── Открыть/закрыть панель ───────────────────────────────────────────────
  window.toggleNotifPanel = function (e) {
    e.stopPropagation();
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const open = panel.classList.toggle('notif-panel--open');
    if (open) loadNotifications(true);
  };

  // Закрыть при клике вне
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notif-bell-wrap');
    if (wrap && !wrap.contains(e.target)) {
      const panel = document.getElementById('notif-panel');
      if (panel) panel.classList.remove('notif-panel--open');
    }
  });

  // ── Инициализация ────────────────────────────────────────────────────────
  function init() {
    if (!token()) return;
    const wrap = document.getElementById('notif-bell-wrap');
    if (!wrap) return;

    // Вставить HTML колокола
    wrap.innerHTML = `
      <button class="notif-btn" id="notif-btn" onclick="toggleNotifPanel(event)" title="Уведомления">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="notif-badge" id="notif-badge" style="display:none">0</span>
      </button>
      <div class="notif-panel" id="notif-panel">
        <div class="notif-panel-head">
          <span class="notif-panel-title">Уведомления</span>
          <button class="notif-read-all-btn" onclick="notifReadAll()">Прочитать все</button>
        </div>
        <div class="notif-list-body" id="notif-list-body">
          <p class="notif-empty">Загрузка...</p>
        </div>
      </div>
    `;

    loadNotifications(false);
    // Полинг каждые 30 секунд
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => loadNotifications(false), 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
