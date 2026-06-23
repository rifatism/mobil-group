const KB_API = 'http://localhost:8000';

// ─── AUTH ────────────────────────────────────────────────────────────────────
function kbToken() { return localStorage.getItem('cms_token'); }
function kbUser()  { try { return JSON.parse(localStorage.getItem('cms_user')); } catch { return null; } }
function kbLogout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  window.location.replace('index.html');
}

let currentRole     = '';
let currentKbPath   = '';
let allFiles        = [];
let allFolders      = [];
let allTests        = [];

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = kbToken();
  const user  = kbUser();
  if (!token || !user) { window.location.replace('index.html'); return; }
  if (!['admin','employee'].includes(user.role)) { window.location.replace('index.html'); return; }

  currentRole = user.role;

  const ini = initials2(user.full_name || user.username);
  document.getElementById('p-avatar').textContent    = ini;
  document.getElementById('p-dd-avatar').textContent = ini;
  document.getElementById('p-username').textContent  = user.full_name || user.username;
  document.getElementById('p-dd-name').textContent   = user.full_name || user.username;
  document.getElementById('p-dd-email').textContent  = user.email || '';

  if (user.role === 'admin') {
    const uploadBtn = document.getElementById('kb-upload-btn');
    if (uploadBtn) uploadBtn.style.display = '';
    const mkdirBtn = document.getElementById('kb-mkdir-btn');
    if (mkdirBtn) mkdirBtn.style.display = '';
    const adminRow = document.getElementById('dd-admin-row');
    if (adminRow) adminRow.style.display = '';
  }

  document.addEventListener('click', e => {
    const menu = document.getElementById('p-user-menu');
    if (menu && !menu.contains(e.target)) menu.classList.remove('open');
  });

  loadTests();
  loadFiles();
});

function toggleKbMenu(e) {
  e.stopPropagation();
  document.getElementById('p-user-menu').classList.toggle('open');
}

function initials2(str) {
  if (!str) return '?';
  const p = String(str).trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : String(str).slice(0, 2).toUpperCase();
}

// ─── NAVIGATE ────────────────────────────────────────────────────────────────
function kbNavigateTo(path) {
  currentKbPath = path;
  document.getElementById('kb-file-search').value = '';
  loadFiles();
}

function renderBreadcrumb() {
  const el = document.getElementById('kb-breadcrumb');
  if (!el) return;
  const parts = currentKbPath ? currentKbPath.split('/') : [];
  let html = `<span class="kb-crumb kb-crumb--link" onclick="kbNavigateTo('')">База знаний</span>`;
  let built = '';
  parts.forEach((part, i) => {
    built += (built ? '/' : '') + part;
    const p = built;
    html += `<span class="kb-crumb-sep">›</span>`;
    if (i === parts.length - 1) {
      html += `<span class="kb-crumb kb-crumb--active">${escH(part)}</span>`;
    } else {
      html += `<span class="kb-crumb kb-crumb--link" onclick="kbNavigateTo('${escH(p)}')">${escH(part)}</span>`;
    }
  });
  el.innerHTML = html;
}

// ─── TESTS ───────────────────────────────────────────────────────────────────
async function loadTests() {
  const grid = document.getElementById('kb-tests-grid');
  try {
    const res  = await fetch(KB_API + '/api/knowledge/tests', {
      headers: { Authorization: 'Bearer ' + kbToken() }
    });
    const data = await res.json();
    allTests = data.tests || [];
    renderTests();
  } catch {
    grid.innerHTML = '<div class="kb-tests-empty"><p>Не удалось загрузить тесты.</p></div>';
  }
}

function renderTests() {
  const grid = document.getElementById('kb-tests-grid');
  const title = document.getElementById('kb-tests-title');

  if (currentRole === 'admin') {
    // ── Вид администратора: все тесты с кнопкой назначить ──
    if (title) title.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Тесты`;
    if (!allTests.length) {
      grid.innerHTML = `<div class="kb-tests-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <p>Тесты ещё не созданы. Создайте тест в панели администратора.</p>
        <a href="admin.html" class="kb-btn-take" style="margin-top:.75rem;display:inline-block">Открыть панель</a>
      </div>`;
      return;
    }
    grid.innerHTML = allTests.map(t => {
      const qCount  = t.question_count || 0;
      const assigns = t.assign_count != null ? t.assign_count : '?';
      return `<div class="kb-test-card kb-test-card--admin">
        <div class="kb-test-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <div class="kb-test-info">
          <div class="kb-test-title">${escH(t.title)}</div>
          <div class="kb-test-meta">
            ${qCount ? `<span class="kb-test-tag">${qCount} вопр.</span>` : ''}
            <span class="kb-test-tag kb-test-tag--assign">Назначен: ${assigns}×</span>
          </div>
          ${t.description ? `<div class="kb-test-desc">${escH(t.description)}</div>` : ''}
        </div>
        <div class="kb-test-action">
          <button class="kb-btn-take" onclick="openKbAssignModal(${t.id},'${escH(t.title).replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:15px;height:15px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Назначить
          </button>
        </div>
      </div>`;
    }).join('');
  } else {
    // ── Вид сотрудника: назначенные тесты ──
    if (title) title.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Назначенные тесты`;
    if (!allTests.length) {
      grid.innerHTML = `<div class="kb-tests-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <p>Назначенных тестов пока нет</p>
      </div>`;
      return;
    }
    grid.innerHTML = allTests.map(t => {
      const done   = !!t.completed_at;
      const qCount = t.question_count || 0;
      const score  = done ? `${t.my_score ?? 0}/${t.my_total ?? 0}` : '';
      const pct    = done && t.my_total ? Math.round((t.my_score / t.my_total) * 100) : null;
      const due    = t.due_date ? `до ${fmtDate(t.due_date)}` : '';
      const icon   = done
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
      const actionBtn = done
        ? `<button class="kb-btn-retake" onclick="openTest(${t.id})">Пройти ещё раз</button>`
        : `<button class="kb-btn-take"   onclick="openTest(${t.id})">Пройти тест</button>`;
      return `<div class="kb-test-card ${done ? 'kb-test-card--done' : ''}">
        <div class="kb-test-icon">${icon}</div>
        <div class="kb-test-info">
          <div class="kb-test-title">${escH(t.title)}</div>
          <div class="kb-test-meta">
            ${qCount ? `<span class="kb-test-tag">${qCount} вопр.</span>` : ''}
            ${done   ? `<span class="kb-test-tag kb-test-tag--done">Пройден</span>` : ''}
            ${pct !== null ? `<span class="kb-test-tag kb-test-tag--score">${score} (${pct}%)</span>` : ''}
            ${due   ? `<span class="kb-test-due">${escH(due)}</span>` : ''}
          </div>
        </div>
        <div class="kb-test-action">${actionBtn}</div>
      </div>`;
    }).join('');
  }
}

// ─── ASSIGN MODAL (admin on knowledge.html) ────────────────────────────────
let kbAssignTestId = 0;
let kbEmployees    = [];

async function openKbAssignModal(id, title) {
  kbAssignTestId = id;
  document.getElementById('kb-assign-test-name').textContent = title;
  document.getElementById('kb-assign-error').style.display = 'none';
  document.getElementById('kb-assign-submit').textContent  = 'НАЗНАЧИТЬ';
  document.getElementById('kb-assign-submit').disabled     = false;

  // Загружаем список сотрудников если ещё не загружали
  const select = document.getElementById('kb-assign-target');
  select.innerHTML = '<option value="all">Всем сотрудникам</option>';
  try {
    const res  = await fetch(`${KB_API}/api/users`, {
      headers: { Authorization: 'Bearer ' + kbToken() }
    });
    const data = await res.json();
    kbEmployees = (data.users || []).filter(u => u.role === 'employee');
    kbEmployees.forEach(u => {
      const opt = document.createElement('option');
      opt.value       = u.id;
      opt.textContent = u.full_name || u.username;
      select.appendChild(opt);
    });
  } catch {}

  document.getElementById('kb-assign-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeKbAssignModal(e) {
  if (e && e.target !== document.getElementById('kb-assign-modal')) return;
  document.getElementById('kb-assign-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function handleKbAssign() {
  const btn    = document.getElementById('kb-assign-submit');
  const errEl  = document.getElementById('kb-assign-error');
  const target = document.getElementById('kb-assign-target').value;
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'НАЗНАЧАЮ...';

  try {
    const res  = await fetch(`${KB_API}/api/knowledge/tests/${kbAssignTestId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + kbToken() },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.style.display = ''; return; }
    document.getElementById('kb-assign-modal').style.display = 'none';
    document.body.style.overflow = '';
    // Обновить счётчик на карточке
    loadTests();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.style.display = '';
  } finally {
    btn.disabled = false; btn.textContent = 'НАЗНАЧИТЬ';
  }
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// ─── TEST MODAL ───────────────────────────────────────────────────────────────
let testState = { test: null, current: 0, answers: {}, submitting: false };

async function openTest(id) {
  try {
    const res  = await fetch(`${KB_API}/api/knowledge/tests/${id}`, {
      headers: { Authorization: 'Bearer ' + kbToken() }
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    testState = { test: data.test, current: 0, answers: {}, submitting: false };
    renderTestModal();
    document.getElementById('kb-test-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  } catch { alert('Ошибка загрузки теста.'); }
}

function closeTestModal() {
  document.getElementById('kb-test-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function renderTestModal() {
  const { test, current, answers } = testState;
  const qs    = test.questions || [];
  const total = qs.length;
  const q     = qs[current];
  const pct   = total ? Math.round((current / total) * 100) : 0;

  document.getElementById('kb-test-content').innerHTML = `
    <div class="kbt-head">
      <div class="kbt-title">${escH(test.title)}</div>
      ${test.description ? `<p class="kbt-desc">${escH(test.description)}</p>` : ''}
    </div>
    <div class="kbt-progress">
      <div class="kbt-progress-bar"><div class="kbt-progress-fill" style="width:${pct}%"></div></div>
      <span class="kbt-progress-label">${current + 1} / ${total}</span>
    </div>
    <div class="kbt-question">
      <div class="kbt-q-text">${escH(q.q)}</div>
      <div class="kbt-options">
        ${(q.opts || []).map((opt, i) => `
          <label class="kbt-option ${answers[current] === i ? 'selected' : ''}" onclick="selectAnswer(${current}, ${i})">
            <input type="radio" name="kbt-opt" value="${i}" ${answers[current] === i ? 'checked' : ''}>
            <span class="kbt-option-text">${escH(opt)}</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div class="kbt-nav">
      <button class="kbt-btn kbt-btn--prev" onclick="prevQuestion()" ${current === 0 ? 'disabled' : ''}>← Назад</button>
      ${current < total - 1
        ? `<button class="kbt-btn kbt-btn--next" onclick="nextQuestion()" ${answers[current] === undefined ? 'disabled' : ''}>Далее →</button>`
        : `<button class="kbt-btn kbt-btn--finish" id="kbt-finish-btn" onclick="submitTest()" ${answers[current] === undefined ? 'disabled' : ''}>Завершить</button>`
      }
    </div>
  `;
}

function selectAnswer(qIdx, optIdx) {
  testState.answers[qIdx] = optIdx;
  document.querySelectorAll('.kbt-option').forEach((el, i) => {
    el.classList.toggle('selected', i === optIdx);
  });
  const btn = document.getElementById('kbt-finish-btn') || document.querySelector('.kbt-btn--next');
  if (btn) btn.disabled = false;
}

function nextQuestion() {
  if (testState.answers[testState.current] === undefined) return;
  testState.current++;
  renderTestModal();
}

function prevQuestion() {
  if (testState.current > 0) { testState.current--; renderTestModal(); }
}

async function submitTest() {
  if (testState.submitting) return;
  const { test, answers } = testState;
  const qs = test.questions || [];
  if (Object.keys(answers).length < qs.length) { alert('Пожалуйста, ответьте на все вопросы'); return; }

  testState.submitting = true;
  const finBtn = document.getElementById('kbt-finish-btn');
  if (finBtn) { finBtn.disabled = true; finBtn.textContent = 'Отправка...'; }

  try {
    const res  = await fetch(`${KB_API}/api/knowledge/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + kbToken() },
      body: JSON.stringify({ test_id: test.id, answers }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    const ok = data.percent >= 60;
    document.getElementById('kb-test-content').innerHTML = `
      <div class="kbt-result">
        <div class="kbt-result-circle kbt-result-circle--${ok ? 'ok' : 'bad'}">${data.percent}%</div>
        <div class="kbt-result-title">${ok ? 'Отлично! Тест пройден' : 'Тест не пройден'}</div>
        <p class="kbt-result-sub">Правильных ответов: ${data.score} из ${data.total}</p>
        <button class="kbt-result-close" onclick="closeTestModal(); loadTests()">Закрыть</button>
      </div>
    `;
    loadTests();
  } catch { alert('Ошибка при отправке теста.'); }
  finally { testState.submitting = false; }
}

// ─── FILES + FOLDERS ─────────────────────────────────────────────────────────
async function loadFiles() {
  const grid = document.getElementById('kb-files-grid');
  grid.innerHTML = `<div class="kb-loading"><div class="kb-spinner"></div>Загрузка...</div>`;
  renderBreadcrumb();

  try {
    const qs   = currentKbPath ? `?path=${encodeURIComponent(currentKbPath)}` : '';
    const res  = await fetch(`${KB_API}/api/knowledge/files${qs}`, {
      headers: { Authorization: 'Bearer ' + kbToken() }
    });
    const data = await res.json();
    allFolders  = data.folders || [];
    allFiles    = data.files   || [];
    renderFilesAndFolders();
  } catch {
    grid.innerHTML = '<div class="kb-files-empty"><p>Не удалось загрузить файлы.</p></div>';
  }
}

function renderFiles() { renderFilesAndFolders(); } // alias for search input

function renderFilesAndFolders() {
  const grid = document.getElementById('kb-files-grid');
  const q    = (document.getElementById('kb-file-search')?.value || '').toLowerCase().trim();

  const filteredFolders = q
    ? allFolders.filter(f => f.name.toLowerCase().includes(q))
    : allFolders;

  const filteredFiles = q
    ? allFiles.filter(f => (f.title + (f.description||'')).toLowerCase().includes(q))
    : allFiles;

  if (!filteredFolders.length && !filteredFiles.length) {
    grid.innerHTML = `<div class="kb-files-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <p>${q ? 'Ничего не найдено' : 'Папка пуста'}</p>
    </div>`;
    return;
  }

  const folderCards = filteredFolders.map(f => {
    const delBtn = currentRole === 'admin'
      ? `<button class="kb-btn-del-file" title="Удалить папку" onclick="event.stopPropagation(); deleteKbFolder('${escH(f.path)}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
         </button>` : '';
    const meta = [
      f.file_count ? `${f.file_count} файл${pluralRu(f.file_count,'','а','ов')}` : '',
      f.dir_count  ? `${f.dir_count} папк${pluralRu(f.dir_count,'а','и','')}`  : '',
    ].filter(Boolean).join(' · ') || 'Пусто';

    return `<div class="kb-folder-card" onclick="kbNavigateTo('${escH(f.path)}')">
      <div class="kb-folder-icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
      </div>
      <div class="kb-folder-info">
        <div class="kb-folder-name">${escH(f.name)}</div>
        <div class="kb-folder-meta">${meta}</div>
      </div>
      ${delBtn}
    </div>`;
  }).join('');

  const fileCards = filteredFiles.map(f => {
    const icon    = fileIcon(f.file_type, f.original_name);
    const size    = fmtSize(f.file_size);
    const date    = f.created_at ? fmtDate(f.created_at) : '';
    const dlHref  = f.id
      ? `${KB_API}/api/knowledge/files/${f.id}/download`
      : `${KB_API}/uploads/knowledge/${currentKbPath ? encodeURIComponent(currentKbPath) + '/' : ''}${encodeURIComponent(f.filename)}`;

    const delBtn = currentRole === 'admin'
      ? `<button class="kb-btn-del-file" title="Удалить" onclick="deleteKbFile(${f.id ? f.id : 'null'}, '${escH(f.filename)}', '${escH(f.folder_path || currentKbPath)}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
         </button>` : '';

    return `<div class="kb-file-card">
      <div class="kb-file-icon ${icon.cls}">${icon.emoji}</div>
      <div class="kb-file-title">${escH(f.title || f.original_name)}</div>
      ${f.description ? `<div class="kb-file-desc">${escH(f.description)}</div>` : ''}
      <div class="kb-file-meta">
        <span class="kb-file-size-badge">${size}</span>
        ${date ? `<span>${date}</span>` : ''}
        ${f.uploader ? `<span>${escH(f.uploader)}</span>` : ''}
      </div>
      <div class="kb-file-actions">
        <a class="kb-btn-download" href="${dlHref}" download="${escH(f.original_name)}" target="_blank">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Скачать
        </a>
        ${delBtn}
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = folderCards + fileCards;
}

function pluralRu(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return few;
  return many;
}

function fileIcon(mime, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf')
    return { cls: 'kb-file-icon--pdf', emoji: '📄' };
  if (['doc','docx'].includes(ext) || (mime||'').includes('word'))
    return { cls: 'kb-file-icon--doc', emoji: '📝' };
  if (['xls','xlsx'].includes(ext) || (mime||'').includes('spreadsheet') || (mime||'').includes('excel'))
    return { cls: 'kb-file-icon--xls', emoji: '📊' };
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext) || (mime||'').startsWith('image/'))
    return { cls: 'kb-file-icon--img', emoji: '🖼️' };
  if (['zip','rar','7z','tar','gz'].includes(ext))
    return { cls: 'kb-file-icon--zip', emoji: '🗜️' };
  if (['ppt','pptx'].includes(ext))
    return { cls: 'kb-file-icon--def', emoji: '📋' };
  return { cls: 'kb-file-icon--def', emoji: '📁' };
}

function fmtSize(bytes) {
  if (!bytes || isNaN(bytes)) return '—';
  const b = Number(bytes);
  if (b < 1024)         return b + ' Б';
  if (b < 1024*1024)    return (b/1024).toFixed(1) + ' КБ';
  return (b/1024/1024).toFixed(1) + ' МБ';
}

// ─── DELETE FILE ──────────────────────────────────────────────────────────────
async function deleteKbFile(id, filename, folderPath) {
  if (!confirm('Удалить файл?')) return;
  try {
    let res;
    if (id) {
      res = await fetch(`${KB_API}/api/knowledge/files/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + kbToken() },
      });
    } else {
      res = await fetch(`${KB_API}/api/knowledge/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + kbToken() },
        body: JSON.stringify({ filename, folder_path: folderPath }),
      });
    }
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadFiles();
  } catch { alert('Ошибка соединения.'); }
}

// ─── DELETE FOLDER ────────────────────────────────────────────────────────────
async function deleteKbFolder(path) {
  if (!confirm(`Удалить папку «${path.split('/').pop()}» и все файлы внутри?`)) return;
  try {
    const res  = await fetch(`${KB_API}/api/knowledge/folders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + kbToken() },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadFiles();
  } catch { alert('Ошибка соединения.'); }
}

// ─── CREATE FOLDER ────────────────────────────────────────────────────────────
function openKbMkdir() {
  document.getElementById('kb-mkdir-name').value = '';
  document.getElementById('kb-mkdir-error').hidden = true;
  document.getElementById('kb-mkdir-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('kb-mkdir-name').focus(), 100);
}
function closeKbMkdir() {
  document.getElementById('kb-mkdir-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function handleKbMkdir(e) {
  e.preventDefault();
  const errEl = document.getElementById('kb-mkdir-error');
  const btn   = document.getElementById('kb-mkdir-submit');
  const name  = document.getElementById('kb-mkdir-name').value.trim();
  errEl.hidden = true;
  if (!name) { errEl.textContent = 'Введите название папки'; errEl.hidden = false; return; }

  btn.disabled = true; btn.textContent = 'СОЗДАНИЕ...';
  try {
    const res  = await fetch(`${KB_API}/api/knowledge/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + kbToken() },
      body: JSON.stringify({ path: currentKbPath, name }),
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeKbMkdir();
    await loadFiles();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'СОЗДАТЬ';
  }
}

// ─── UPLOAD FILE ──────────────────────────────────────────────────────────────
function openKbUpload() {
  document.getElementById('kb-upload-form').reset();
  document.getElementById('kbu-error').hidden = true;
  document.getElementById('kb-upload-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeKbUpload() {
  document.getElementById('kb-upload-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function handleKbUpload(e) {
  e.preventDefault();
  const errEl = document.getElementById('kbu-error');
  const btn   = document.getElementById('kbu-submit');
  const file  = document.getElementById('kbu-file').files[0];
  errEl.hidden = true;
  if (!file) { errEl.textContent = 'Выберите файл'; errEl.hidden = false; return; }

  const fd = new FormData();
  fd.append('file',        file);
  fd.append('title',       document.getElementById('kbu-title').value.trim());
  fd.append('description', document.getElementById('kbu-desc').value.trim());
  fd.append('path',        currentKbPath);

  btn.disabled = true; btn.textContent = 'ЗАГРУЗКА...';
  try {
    const res  = await fetch(`${KB_API}/api/knowledge/files`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + kbToken() },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; errEl.hidden = false; return; }
    closeKbUpload();
    await loadFiles();
  } catch {
    errEl.textContent = 'Ошибка соединения.'; errEl.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'ЗАГРУЗИТЬ';
  }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escH(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
