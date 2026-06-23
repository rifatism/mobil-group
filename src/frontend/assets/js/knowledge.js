const KB_API = 'http://localhost:8000';

// ─── AUTH ────────────────────────────────────────────────────────────────────
function kbToken() { return localStorage.getItem('cms_token'); }
function kbUser()  { try { return JSON.parse(localStorage.getItem('cms_user')); } catch { return null; } }
function kbLogout() {
  localStorage.removeItem('cms_token');
  localStorage.removeItem('cms_user');
  window.location.replace('index.html');
}

let currentRole = '';
let allFiles    = [];
let allTests    = [];

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = kbToken();
  const user  = kbUser();
  if (!token || !user) { window.location.replace('index.html'); return; }
  if (!['admin','employee'].includes(user.role)) { window.location.replace('index.html'); return; }

  currentRole = user.role;

  // Header
  const ini = initials2(user.full_name || user.username);
  document.getElementById('p-avatar').textContent    = ini;
  document.getElementById('p-dd-avatar').textContent = ini;
  document.getElementById('p-username').textContent  = user.full_name || user.username;
  document.getElementById('p-dd-name').textContent   = user.full_name || user.username;
  document.getElementById('p-dd-email').textContent  = user.email || '';

  if (user.role === 'admin') {
    const uploadBtn  = document.getElementById('kb-upload-btn');
    if (uploadBtn) uploadBtn.style.display = '';
    const adminRow = document.getElementById('dd-admin-row');
    if (adminRow) adminRow.style.display = '';
  }

  // Close dropdown on outside click
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

    const icon = done
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
  const pct   = total ? Math.round(((current) / total) * 100) : 0;

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
  // Update option highlight
  document.querySelectorAll('.kbt-option').forEach((el, i) => {
    el.classList.toggle('selected', i === optIdx);
  });
  // Enable next/finish button
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
  // Check all answered
  if (Object.keys(answers).length < qs.length) {
    alert('Пожалуйста, ответьте на все вопросы');
    return;
  }

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

    // Show result
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

// ─── FILES ───────────────────────────────────────────────────────────────────
async function loadFiles() {
  const grid = document.getElementById('kb-files-grid');
  try {
    const res  = await fetch(KB_API + '/api/knowledge/files', {
      headers: { Authorization: 'Bearer ' + kbToken() }
    });
    const data = await res.json();
    allFiles = data.files || [];
    renderFiles();
  } catch {
    grid.innerHTML = '<div class="kb-files-empty"><p>Не удалось загрузить файлы.</p></div>';
  }
}

function renderFiles() {
  const grid = document.getElementById('kb-files-grid');
  const q    = (document.getElementById('kb-file-search')?.value || '').toLowerCase().trim();
  const list = q ? allFiles.filter(f => (f.title + (f.description||'')).toLowerCase().includes(q)) : allFiles;

  if (!list.length) {
    grid.innerHTML = `<div class="kb-files-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <p>${q ? 'Файлы не найдены' : 'Файлов пока нет'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(f => {
    const icon    = fileIcon(f.file_type, f.original_name);
    const size    = fmtSize(f.file_size);
    const date    = f.created_at ? fmtDate(f.created_at) : '';
    const dlHref  = f.id
      ? `${KB_API}/api/knowledge/files/${f.id}/download`
      : `${KB_API}/uploads/knowledge/${encodeURIComponent(f.filename)}`;

    const delBtn = currentRole === 'admin'
      ? `<button class="kb-btn-del-file" title="Удалить" onclick="deleteFile(${f.id ? f.id : `null,'${escH(f.filename)}'`})">
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

async function deleteFile(id, filename) {
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
        body: JSON.stringify({ filename }),
      });
    }
    const data = await res.json();
    if (!data.success) { alert(data.message); return; }
    await loadFiles();
  } catch { alert('Ошибка соединения.'); }
}

// ─── UPLOAD MODAL ─────────────────────────────────────────────────────────────
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

  btn.disabled = true; btn.textContent = 'ЗАГРУЗКА...';
  try {
    const res  = await fetch(KB_API + '/api/knowledge/files', {
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
