const NP_API = 'http://localhost:8000';

function fmtNewsDate(str) {
    const d = new Date(str);
    return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const PLACEHOLDER_SVG = `<div class="np-card-img-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
    </svg>
</div>`;

async function loadPublicNews() {
    const grid = document.getElementById('np-grid');
    try {
        const res  = await fetch(NP_API + '/api/news');
        const data = await res.json();

        if (!data.success || !data.news.length) {
            grid.innerHTML = `<div class="np-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>Новостей пока нет</p>
            </div>`;
            return;
        }

        grid.innerHTML = data.news.map(n => {
            const imgBlock = n.image
                ? `<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}" loading="lazy" onerror="this.parentElement.innerHTML='${PLACEHOLDER_SVG.replace(/'/g, "\\'")}'">`
                : PLACEHOLDER_SVG;

            const bodyText = n.content || n.excerpt || '';

            return `<article class="np-card" onclick="openNewsView(${n.id})">
                <div class="np-card-img">${imgBlock}</div>
                <div class="np-card-body">
                    <span class="np-date">${fmtNewsDate(n.created_at)}</span>
                    <h3 class="np-title">${escHtml(n.title)}</h3>
                    ${bodyText ? `<p class="np-excerpt">${escHtml(bodyText)}</p>` : ''}
                    <span class="np-read-more">
                        Читать далее
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </span>
                </div>
            </article>`;
        }).join('');

    } catch {
        grid.innerHTML = `<div class="np-empty"><p>Ошибка загрузки новостей. Попробуйте позже.</p></div>`;
    }
}

async function openNewsView(id) {
    try {
        const res  = await fetch(NP_API + '/api/news/' + id);
        const data = await res.json();
        if (!data.success) return;
        const n = data.news;

        document.getElementById('np-modal-date').textContent    = fmtNewsDate(n.created_at);
        document.getElementById('np-modal-title').textContent   = n.title;
        document.getElementById('np-modal-content').textContent = n.content;

        const imgWrap = document.getElementById('np-modal-img-wrap');
        imgWrap.innerHTML = n.image
            ? `<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}">`
            : '';
        imgWrap.style.display = n.image ? '' : 'none';

        document.getElementById('np-modal').classList.add('open');
        document.body.style.overflow = 'hidden';
    } catch { /* silent */ }
}

function closeNewsViewBtn() {
    document.getElementById('np-modal').classList.remove('open');
    document.body.style.overflow = '';
}

function closeNewsView(e) {
    if (e.target.id === 'np-modal') closeNewsViewBtn();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeNewsViewBtn();
});

loadPublicNews();