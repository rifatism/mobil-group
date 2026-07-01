const CR_API = 'https://mobil-service.site/backend';

// Статус AI HR-ассистента — промис, await-им при каждом клике
const _aiStatusPromise = fetch(CR_API + '/api/ai-status')
  .then(r => r.json())
  .then(d => d.enabled !== false)
  .catch(() => true);

// Навбар всегда белый на этой странице
(function () {
  const nav = document.querySelector('.navbar');
  if (nav) {
    nav.classList.add('scrolled');
    window.addEventListener('scroll', () => nav.classList.add('scrolled'));
  }
})();

// ===== VACANCIES =====
let allVacancies = [];

function escH(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function loadVacancies() {
  const grid = document.getElementById('cr-vac-grid');
  if (!grid) return;

  try {
    const res  = await fetch(CR_API + '/api/vacancies');
    const data = await res.json();
    allVacancies = data.vacancies || [];

    if (!allVacancies.length) {
      grid.innerHTML = `<div class="cr-vac-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        <p>Активных вакансий пока нет.<br>Следите за обновлениями!</p>
      </div>`;
      return;
    }

    grid.innerHTML = allVacancies.map(v => `
      <div class="cr-vac-card" onclick="openVacancy(${v.id})">
        <div class="cr-vac-info">
          <div class="cr-vac-title">${escH(v.title)}</div>
          <div class="cr-vac-meta">
            ${v.department       ? `<span class="cr-vac-tag">${escH(v.department)}</span>` : ''}
            ${v.location         ? `<span class="cr-vac-tag cr-tag-loc">${escH(v.location)}</span>` : ''}
            ${v.employment_type  ? `<span class="cr-vac-tag">${escH(v.employment_type)}</span>` : ''}
            ${v.salary           ? `<span class="cr-vac-tag cr-tag-sal">${escH(v.salary)}</span>` : ''}
          </div>
        </div>
        <div class="cr-vac-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>
    `).join('');

    // Заполняем селект вакансий в форме
    const sel = document.getElementById('cr-position');
    if (sel) {
      sel.innerHTML = '<option value="">— Выберите вакансию —</option>' +
        allVacancies.map(v => `<option value="${escH(v.title)}">${escH(v.title)}</option>`).join('');
    }

  } catch {
    grid.innerHTML = '<div class="cr-vac-empty"><p>Не удалось загрузить вакансии.</p></div>';
  }
}

// ===== VACANCY MODAL =====
let currentModalVacancy = null;

function openVacancy(id) {
  const v = allVacancies.find(x => x.id === id);
  if (!v) return;
  currentModalVacancy = v;

  document.getElementById('cr-modal-dept').textContent  = v.department || '';
  document.getElementById('cr-modal-title').textContent = v.title;

  const tags = [
    v.location        ? `<span class="cr-vac-tag cr-tag-loc">${escH(v.location)}</span>`        : '',
    v.employment_type ? `<span class="cr-vac-tag">${escH(v.employment_type)}</span>`             : '',
    v.salary          ? `<span class="cr-vac-tag cr-tag-sal">${escH(v.salary)}</span>`           : '',
  ].join('');
  document.getElementById('cr-modal-tags').innerHTML = tags;

  const desc = document.getElementById('cr-modal-desc');
  desc.innerHTML = v.description
    ? `<h4>О вакансии</h4><p>${escH(v.description)}</p>`
    : '';

  const req = document.getElementById('cr-modal-req');
  req.innerHTML = v.requirements
    ? `<h4>Требования</h4><pre>${escH(v.requirements)}</pre>`
    : '';

  // Предзаполняем поле вакансии в форме
  const sel = document.getElementById('cr-position');
  if (sel) sel.value = v.title;

  document.getElementById('cr-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeVacancy(e) {
  if (!e || e.target === e.currentTarget) {
    document.getElementById('cr-modal').classList.remove('open');
    document.body.style.overflow = '';
  }
}

function closeVacancyBtn() {
  document.getElementById('cr-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function scrollToApply() {
  const vacancy = currentModalVacancy;
  closeVacancyBtn();
  _aiStatusPromise.then(aiEnabled => {
    setTimeout(() => {
      if (aiEnabled && vacancy && typeof openAiChat === 'function') {
        openAiChat(vacancy);
      } else {
        const applySection = document.getElementById('cr-apply');
        if (applySection) applySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (vacancy) {
          const sel = document.getElementById('cr-vacancy');
          if (sel) {
            for (const opt of sel.options) {
              if (opt.value == vacancy.id) { sel.value = opt.value; break; }
            }
          }
        }
      }
    }, 280);
  });
}

const COMPANY_PHONE     = '+7 (3452) 68-90-90';
const COMPANY_PHONE_TEL = 'tel:+73452689090';

function showPhone(btn) {
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.87a16 16 0 0 0 6.29 6.29l1.77-1.76a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    <a href="${COMPANY_PHONE_TEL}" onclick="event.stopPropagation()">${COMPANY_PHONE}</a>
  `;
  btn.classList.add('cr-phone-revealed');
  btn.onclick = null;
}

// ===== APPLICATION FORM =====
document.addEventListener('DOMContentLoaded', () => {
  loadVacancies();

  const form = document.getElementById('cr-form');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const statusEl = document.getElementById('cr-status');
    const btn      = document.getElementById('cr-submit');

    statusEl.className = 'cr-status';

    const fileInput  = document.getElementById('cr-resume');
    const fileErrEl  = document.getElementById('cr-file-error');
    const file       = fileInput?.files[0] || null;

    if (fileErrEl) fileErrEl.hidden = true;

    if (file && file.size > 5 * 1024 * 1024) {
      fileErrEl.textContent = 'Файл превышает 5 МБ. Выберите файл меньшего размера.';
      fileErrEl.hidden = false;
      return;
    }

    const fd = new FormData();
    fd.append('fullname', document.getElementById('cr-fullname').value.trim());
    fd.append('email',    document.getElementById('cr-email').value.trim());
    fd.append('phone',    document.getElementById('cr-phone').value.trim());
    fd.append('position', document.getElementById('cr-position').value.trim());
    fd.append('message',  document.getElementById('cr-message').value.trim());
    fd.append('consent',  document.getElementById('cr-consent').checked ? '1' : '');
    if (file) fd.append('resume', file, file.name);

    btn.disabled    = true;
    btn.textContent = 'ОТПРАВКА...';

    try {
      const res  = await fetch(CR_API + '/api/career-contact', {
        method: 'POST',
        body:   fd,
      });
      const data = await res.json();

      if (data.success) {
        statusEl.textContent = 'Ваш отклик отправлен! Мы свяжемся с вами в ближайшее время.';
        statusEl.className   = 'cr-status success';
        form.reset();
        clearResume();
      } else {
        statusEl.textContent = data.message || 'Ошибка при отправке. Попробуйте позже.';
        statusEl.className   = 'cr-status error';
      }
    } catch {
      statusEl.textContent = 'Нет связи с сервером.';
      statusEl.className   = 'cr-status error';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'ОТПРАВИТЬ ОТКЛИК';
    }
  });
});

function clearResume() {
  const input  = document.getElementById('cr-resume');
  const nameEl = document.getElementById('cr-file-name');
  const clear  = document.getElementById('cr-file-clear');
  const wrap   = document.getElementById('cr-file-wrap');
  const errEl  = document.getElementById('cr-file-error');
  if (input)  input.value = '';
  if (nameEl) nameEl.textContent = 'Прикрепить резюме';
  if (clear)  clear.hidden = true;
  if (wrap)   wrap.classList.remove('has-file');
  if (errEl)  errEl.hidden = true;
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('cr-resume');
  if (!input) return;
  input.addEventListener('change', () => {
    const file   = input.files[0];
    const nameEl = document.getElementById('cr-file-name');
    const clear  = document.getElementById('cr-file-clear');
    const wrap   = document.getElementById('cr-file-wrap');
    const errEl  = document.getElementById('cr-file-error');
    if (!file) { clearResume(); return; }
    if (file.size > 5 * 1024 * 1024) {
      errEl.textContent = 'Файл превышает 5 МБ. Выберите файл меньшего размера.';
      errEl.hidden = false;
      input.value  = '';
      return;
    }
    errEl.hidden = true;
    nameEl.textContent = file.name;
    clear.hidden = false;
    wrap.classList.add('has-file');
  });
});

