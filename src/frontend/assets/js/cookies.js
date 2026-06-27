(function () {
    if (localStorage.getItem('cookie_consent')) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.innerHTML = `
        <div class="ck-inner">
            <div class="ck-text">
                <svg class="ck-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm1-4h-2V7h2z"/>
                </svg>
                <p>Мы используем файлы cookie, в том числе Яндекс&nbsp;Метрику, для анализа трафика и улучшения сайта.
                <a href="privacy.html" class="ck-link">Политика конфиденциальности</a></p>
            </div>
            <div class="ck-actions">
                <button class="ck-btn ck-btn--accept" id="ck-accept">Принять</button>
                <button class="ck-btn ck-btn--decline" id="ck-decline">Отказаться</button>
            </div>
        </div>
    `;
    document.body.appendChild(banner);

    requestAnimationFrame(() => banner.classList.add('ck-visible'));

    function dismiss(accepted) {
        localStorage.setItem('cookie_consent', accepted ? 'accepted' : 'declined');
        banner.classList.remove('ck-visible');
        setTimeout(() => banner.remove(), 400);
    }

    document.getElementById('ck-accept').addEventListener('click', () => dismiss(true));
    document.getElementById('ck-decline').addEventListener('click', () => dismiss(false));
})();
