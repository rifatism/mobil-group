const NP_API = 'https://mobil-service.site/backend';

// Навбар всегда тёмный на странице новостей
(function () {
  const nav = document.querySelector('.navbar');
  if (nav) {
    nav.classList.add('scrolled');
    window.addEventListener('scroll', () => nav.classList.add('scrolled'));
  }
})();

function fmtNewsDate(str) {
    const d = new Date(str);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const PLACEHOLDER = `<div class="np-row-img-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
    </svg>
</div>`;

let allNews = [];

function renderRows(list) {
    const grid = document.getElementById('np-grid');

    if (!list.length) {
        grid.innerHTML = `<div class="np-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Статей пока нет</p>
        </div>`;
        return;
    }

    grid.innerHTML = list.map((n, i) => {
        const imgBlock = n.image
            ? `<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}" loading="lazy">`
            : PLACEHOLDER;

        const dateStr = fmtNewsDate(n.created_at);

        return `<article class="np-row" onclick="openNewsView(${n.id})" style="transition-delay:${i * 0.06}s">
            <div class="np-row-left">
                <div>
                    <h3 class="np-row-title">${escHtml(n.title)}</h3>
                    <p class="np-row-excerpt">${escHtml(n.excerpt || '')}</p>
                </div>
                <div class="np-row-bottom">
                    <span class="np-row-readtime">читать далее</span>
                    <div class="np-row-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="np-row-img">${imgBlock}</div>
            <div class="np-row-right">
                <div class="np-row-meta-group">
                    <p class="np-row-meta-label">Опубликовано:</p>
                    <p class="np-row-meta-value">${dateStr}</p>
                </div>
            </div>
        </article>`;
    }).join('');

    // Плавное появление при прокрутке
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); }
        });
    }, { threshold: 0.08 });
    document.querySelectorAll('.np-row').forEach(el => obs.observe(el));
}

async function loadPublicNews(archive = false) {
    const grid = document.getElementById('np-grid');
    grid.innerHTML = `<div class="np-loading"><span class="np-spinner"></span><p>Загрузка статей...</p></div>`;
    try {
        const url  = NP_API + '/api/news' + (archive ? '?archive=1' : '');
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.success || !data.news.length) {
            grid.innerHTML = `<div class="np-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>${archive ? 'В архиве нет статей' : 'Статей пока нет'}</p>
            </div>`;
            return;
        }

        allNews = data.news;
        renderRows(allNews);

    } catch {
        grid.innerHTML = `<div class="np-empty"><p>Ошибка загрузки. Попробуйте позже.</p></div>`;
    }
}

// ===== ФИЛЬТРЫ =====
document.querySelectorAll('.np-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.np-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadPublicNews(btn.dataset.filter === 'archive');
    });
});

// ===== МОДАЛ =====
async function openNewsView(id) {
    try {
        const res  = await fetch(NP_API + '/api/news/' + id);
        const data = await res.json();
        if (!data.success) return;
        const n = data.news;

        document.getElementById('np-modal-date').textContent  = fmtNewsDate(n.created_at);
        document.getElementById('np-modal-title').textContent = n.title;
        document.getElementById('np-modal-content').innerHTML = n.content;

        const imgWrap = document.getElementById('np-modal-img-wrap');
        imgWrap.innerHTML = n.image ? `<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}">` : '';
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

loadPublicNews(false);

