const PRJ_API = 'https://mobil-service.site/backend';

let allProjects = [];
let activeCategory = 'all';

function escH(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== LOAD =====
async function loadProjects() {
    const grid = document.getElementById('prj-grid');
    grid.innerHTML = `<div class="prj-loading"><span class="prj-spinner"></span> Загрузка проектов...</div>`;
    try {
        const res  = await fetch(PRJ_API + '/api/projects');
        const data = await res.json();
        if (!data.success) throw new Error();
        allProjects = data.projects;
        buildFilters();
        renderGrid();
        renderClientLogos();
    } catch {
        grid.innerHTML = `<div class="prj-empty"><p>Ошибка загрузки. Попробуйте позже.</p></div>`;
    }
}

// ===== FILTERS =====
function buildFilters() {
    const categories = [...new Set(allProjects.map(p => p.category).filter(Boolean))];
    const wrap = document.getElementById('prj-filter-wrap');
    const extra = categories.map(c =>
        `<button class="prj-cat-btn" onclick="setCategory('${escH(c)}', this)">${escH(c)}</button>`
    ).join('');
    wrap.innerHTML = `<button class="prj-cat-btn active" onclick="setCategory('all', this)">Все проекты</button>${extra}`;
}

function setCategory(cat, el) {
    activeCategory = cat;
    document.querySelectorAll('.prj-cat-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderGrid();
}

// ===== RENDER GRID =====
function renderGrid() {
    const filtered = activeCategory === 'all'
        ? allProjects
        : allProjects.filter(p => p.category === activeCategory);

    const grid = document.getElementById('prj-grid');
    if (!filtered.length) {
        grid.innerHTML = `<div class="prj-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
            </svg>
            <p>Проектов в этой категории пока нет</p>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map((p, i) => {
        const imgBlock = p.image
            ? `<img src="${escH(p.image)}" alt="${escH(p.title)}" loading="lazy">`
            : `<div class="prj-card-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg></div>`;

        const catTag = p.category ? `<span class="prj-cat-tag">${escH(p.category)}</span>` : '';
        const logoBlock = p.client_logo
            ? `<img src="${escH(p.client_logo)}" alt="${escH(p.client_name)}" class="prj-client-logo">`
            : (p.client_name ? `<span class="prj-logo-name">${escH(p.client_name)}</span>` : '');

        return `<div class="prj-card" onclick="openProject(${p.id})" style="transition-delay:${i * 0.06}s">
            <div class="prj-card-img">${imgBlock}${catTag}</div>
            <div class="prj-card-body">
                <div class="prj-card-meta">
                    ${p.year ? `<span class="prj-year">${p.year}</span>` : ''}
                    ${p.client_name ? `<span class="prj-client">· ${escH(p.client_name)}</span>` : ''}
                </div>
                <h3 class="prj-card-title">${escH(p.title)}</h3>
                ${p.description ? `<p class="prj-card-desc">${escH(p.description)}</p>` : ''}
                <div class="prj-card-footer">
                    <div>${logoBlock}</div>
                    <span class="prj-read-more">Подробнее
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Анимация появления
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.prj-card').forEach(el => obs.observe(el));
}

// ===== CLIENT LOGOS =====
function renderClientLogos() {
    const clients = allProjects
        .filter(p => p.client_name)
        .reduce((acc, p) => {
            if (!acc.find(c => c.name === p.client_name)) {
                acc.push({ name: p.client_name, logo: p.client_logo });
            }
            return acc;
        }, []);

    const wrap = document.getElementById('prj-logos-grid');

    // Счётчики
    const statP = document.getElementById('prj-stat-projects');
    const statC = document.getElementById('prj-stat-clients');
    if (statP) statP.textContent = allProjects.length || '—';
    if (statC) statC.textContent = clients.length || '—';

    if (!clients.length) return;

    wrap.innerHTML = clients.map(c =>
        `<div class="prj-trust-logo">
            ${c.logo
                ? `<img src="${escH(c.logo)}" alt="${escH(c.name)}" title="${escH(c.name)}">`
                : `<span class="prj-trust-logo-name">${escH(c.name)}</span>`}
        </div>`
    ).join('');
}

// ===== MODAL =====
function openProject(id) {
    const p = allProjects.find(x => x.id === id);
    if (!p) return;

    const modal = document.getElementById('prj-modal');
    const imgWrap = document.getElementById('prj-modal-img-wrap');
    imgWrap.innerHTML = p.image
        ? `<img src="${escH(p.image)}" alt="${escH(p.title)}" class="prj-modal-img">`
        : '';

    document.getElementById('prj-modal-cat').textContent    = p.category || '';
    document.getElementById('prj-modal-cat').style.display  = p.category ? '' : 'none';
    document.getElementById('prj-modal-year').textContent   = p.year || '';
    document.getElementById('prj-modal-client').textContent = p.client_name ? `Клиент: ${p.client_name}` : '';
    document.getElementById('prj-modal-title').textContent  = p.title;
    document.getElementById('prj-modal-content').innerHTML  = (p.content || p.description || '')
        .split('\n').filter(Boolean).map(line => `<p>${escH(line)}</p>`).join('');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeProjectModal() {
    document.getElementById('prj-modal').classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('prj-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProjectModal();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProjectModal(); });

loadProjects();

