(function () {
    if (localStorage.getItem('cookie_consent')) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-banner';

    function render() {
        const _fb = {
            'cookie.text': 'Мы используем файлы cookie, в том числе Яндекс Метрику, для анализа трафика и улучшения сайта.',
            'cookie.privacy': 'Политика конфиденциальности',
            'cookie.accept': 'Принять',
            'cookie.decline': 'Отказаться'
        };
        const _t = (window.i18n && window.i18n.t) ? window.i18n.t.bind(window.i18n) : (k => _fb[k] || k);
        const privacyHref = document.location.pathname.includes('privacy') ? '#' : 'privacy.html';
        banner.innerHTML = `
            <div class="ck-inner">
                <div class="ck-text">
                    <svg class="ck-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm1-4h-2V7h2z"/>
                    </svg>
                    <p><span data-i18n="cookie.text">${_t('cookie.text')}</span>
                    <a href="${privacyHref}" class="ck-link" data-i18n="cookie.privacy">${_t('cookie.privacy')}</a></p>
                </div>
                <div class="ck-actions">
                    <button class="ck-btn ck-btn--accept" id="ck-accept" data-i18n="cookie.accept">${_t('cookie.accept')}</button>
                    <button class="ck-btn ck-btn--decline" id="ck-decline" data-i18n="cookie.decline">${_t('cookie.decline')}</button>
                </div>
            </div>
        `;
    }

    render();
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
