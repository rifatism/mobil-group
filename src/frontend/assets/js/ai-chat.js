(function () {
  'use strict';

  const API_BASE = typeof CR_API !== 'undefined' ? CR_API : 'https://mobil-service.site/backend';

  let currentVacancy = null;
  let history = [];   // [{role:'user'|'model', text:'...'}]
  let isApproved = false;

  // ── Public API ────────────────────────────────────────────────────────────
  window.openAiChat = function (vacancy) {
    currentVacancy = vacancy;
    history = [];
    isApproved = false;

    // Vacancy name in header
    const sub = document.getElementById('ai-chat-header-sub');
    if (sub) sub.textContent = vacancy.title || 'Вакансия';

    // Clear messages area
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) msgs.innerHTML = '';

    // Reset input
    const inp = document.getElementById('ai-chat-input');
    const btn = document.getElementById('ai-chat-send');
    if (inp) { inp.value = ''; inp.disabled = false; inp.placeholder = 'Введите сообщение…'; }
    if (btn) btn.disabled = false;

    // Show greeting (not sent to Gemini — starts conversation in UI only)
    const greeting = 'Здравствуйте! Я AI HR-ассистент МобилСервис. '
      + 'Вы откликаетесь на вакансию «' + escHtml(vacancy.title) + '». '
      + 'Расскажите, пожалуйста, как вас зовут?';
    appendBubble('model', greeting);

    // Show widget
    const widget = document.getElementById('ai-chat-widget');
    if (widget) {
      widget.classList.remove('ai-chat--minimized');
      widget.classList.add('ai-chat--visible', 'ai-chat--open');
    }

    setTimeout(() => { if (inp) inp.focus(); }, 350);
  };

  window.aiChatClose = function () {
    const widget = document.getElementById('ai-chat-widget');
    if (widget) widget.classList.remove('ai-chat--visible', 'ai-chat--open');
  };

  window.aiChatMinimize = function () {
    const widget = document.getElementById('ai-chat-widget');
    if (widget) widget.classList.toggle('ai-chat--minimized');
  };

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (isApproved) return;

    const inp = document.getElementById('ai-chat-input');
    const btn = document.getElementById('ai-chat-send');
    if (!inp || !currentVacancy) return;

    const text = inp.value.trim();
    if (!text) return;

    inp.value = '';
    setInputState(false);

    appendBubble('user', text);
    appendTyping();

    try {
      const res = await fetch(API_BASE + '/api/ai-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: text,
          history: history,          // all previous messages
          vacancy: currentVacancy,
        }),
      });

      removeTyping();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        appendBubble('model', 'Ошибка: ' + (err.message || 'что-то пошло не так. Попробуйте позже.'));
        setInputState(true);
        return;
      }

      const data = await res.json();

      if (!data.success) {
        appendBubble('model', data.message || 'Произошла ошибка. Попробуйте позже.');
        setInputState(true);
        return;
      }

      // Commit both messages to history
      history.push({ role: 'user',  text });
      history.push({ role: 'model', text: data.reply });

      appendBubble('model', data.reply);

      if (data.approved) {
        isApproved = true;
        showApprovedBanner();
      } else {
        setInputState(true);
        inp.focus();
      }

    } catch {
      removeTyping();
      appendBubble('model', 'Нет связи с сервером. Проверьте подключение к интернету.');
      setInputState(true);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function appendBubble(role, text) {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;

    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--' + (role === 'model' ? 'ai' : 'user');

    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';
    bubble.innerHTML = escHtml(text).replace(/\n/g, '<br>');

    div.appendChild(bubble);
    msgs.appendChild(div);
    scrollBottom(msgs);
  }

  function appendTyping() {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs || document.getElementById('ai-typing')) return;

    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--ai';
    div.id = 'ai-typing';
    div.innerHTML = '<div class="ai-msg-bubble"><span class="ai-dots"><span></span><span></span><span></span></span></div>';
    msgs.appendChild(div);
    scrollBottom(msgs);
  }

  function removeTyping() {
    const el = document.getElementById('ai-typing');
    if (el) el.remove();
  }

  function showApprovedBanner() {
    const msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;

    const banner = document.createElement('div');
    banner.className = 'ai-approved-banner';
    banner.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + 'Ваши данные переданы HR-менеджеру. Ожидайте звонка!';
    msgs.appendChild(banner);
    scrollBottom(msgs);

    const inp = document.getElementById('ai-chat-input');
    const btn = document.getElementById('ai-chat-send');
    if (inp) { inp.disabled = true; inp.placeholder = 'Диалог завершён'; }
    if (btn) btn.disabled = true;
  }

  function setInputState(enabled) {
    const inp = document.getElementById('ai-chat-input');
    const btn = document.getElementById('ai-chat-send');
    if (inp) inp.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
  }

  function scrollBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const inp = document.getElementById('ai-chat-input');
    const btn = document.getElementById('ai-chat-send');

    if (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    if (btn) {
      btn.addEventListener('click', sendMessage);
    }
  });
})();
