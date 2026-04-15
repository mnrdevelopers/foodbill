(function() {
    const DEFAULT_PAGE = 'dashboard.html';
    const LAST_PAGE_KEY = 'mnrfoodbill_last_page';

    function getLoginScreen() {
        return document.getElementById('loginScreen');
    }

    function getAppShell() {
        return document.getElementById('appShell');
    }

    function getAppFrame() {
        return document.getElementById('appFrame');
    }

    function normalizeTarget(target) {
        if (!target) return '';

        let value = String(target).trim();
        if (!value) return '';

        if (value.startsWith('#')) {
            value = value.slice(1);
        }

        value = decodeURIComponent(value).replace(/^\.\//, '');

        if (/^https?:\/\//i.test(value)) {
            return '';
        }

        if (value.includes('/')) {
            value = value.split('/').pop() || '';
        }

        if (!value || value === 'index.html') {
            return '';
        }

        return /^[a-z0-9-]+\.html(?:\?.*)?$/i.test(value) ? value : '';
    }

    function updateHash(target) {
        const hash = target ? `#${target}` : '';
        if (window.location.hash === hash) return;

        const nextUrl = hash
            ? `${window.location.pathname}${window.location.search}${hash}`
            : `${window.location.pathname}${window.location.search}`;

        window.history.replaceState(null, '', nextUrl);
    }

    function setAppMode(isAppMode) {
        const loginScreen = getLoginScreen();
        const appShell = getAppShell();

        document.body.classList.toggle('app-mode', isAppMode);

        if (loginScreen) {
            loginScreen.classList.toggle('hidden', isAppMode);
        }

        if (appShell) {
            appShell.classList.toggle('hidden', !isAppMode);
        }
    }

    function resolveRequestedPage(fallbackTarget) {
        return normalizeTarget(fallbackTarget) ||
            normalizeTarget(window.location.hash) ||
            normalizeTarget(localStorage.getItem(LAST_PAGE_KEY)) ||
            DEFAULT_PAGE;
    }

    function navigateTo(target, options = {}) {
        const frame = getAppFrame();
        if (!frame) return;

        const page = resolveRequestedPage(target);
        const current = frame.dataset.current || '';

        setAppMode(true);

        if (current !== page || options.force) {
            frame.dataset.current = page;
            frame.src = page;
        }

        localStorage.setItem(LAST_PAGE_KEY, page);

        if (options.syncHash !== false) {
            updateHash(page);
        }
    }

    function openApp(target) {
        navigateTo(target, { syncHash: true });
    }

    function showLogin() {
        const frame = getAppFrame();

        setAppMode(false);
        document.title = 'MNRFoodBill - Login';

        if (frame) {
            frame.dataset.current = '';
            if (frame.src && frame.src !== 'about:blank') {
                frame.src = 'about:blank';
            }
        }
    }

    function syncFromFrame() {
        const frame = getAppFrame();
        if (!frame || !frame.contentWindow) return;

        try {
            const frameLocation = frame.contentWindow.location;
            const page = normalizeTarget(
                `${frameLocation.pathname.split('/').pop() || ''}${frameLocation.search || ''}`
            );

            if (!page) return;

            frame.dataset.current = page;
            localStorage.setItem(LAST_PAGE_KEY, page);
            updateHash(page);

            if (frame.contentDocument && frame.contentDocument.title) {
                document.title = frame.contentDocument.title;
            }
        } catch (error) {
            console.warn('Could not sync iframe location:', error);
        }
    }

    window.MNRAppShell = {
        getRequestedPage: resolveRequestedPage,
        navigateTo,
        openApp,
        showLogin
    };

    document.addEventListener('DOMContentLoaded', function() {
        const frame = getAppFrame();
        if (!frame) return;

        frame.addEventListener('load', syncFromFrame);

        window.addEventListener('hashchange', function() {
            if (getAppShell()?.classList.contains('hidden')) return;

            const target = normalizeTarget(window.location.hash);
            if (!target) return;

            navigateTo(target, { syncHash: false });
        });
    });
})();
