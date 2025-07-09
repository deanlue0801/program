/**
 * 簡易前端路由器 (SPA Router) - v4.0 (GitHub Pages SPA 最終解決方案)
 */

const GHP_BASE_PATH = 'program';

const routes = {
    '/': { html: `pages/dashboard.html`, init: 'initDashboardPage' },
    '/dashboard': { html: `pages/dashboard.html`, init: 'initDashboardPage' },
    '/tenders/list': { html: `pages/tenders/list.html`, init: 'initTendersListPage' },
    '/tenders/detail': { html: `pages/tenders/detail.html`, init: 'initTenderDetailPage' },
    '/tenders/distribution': { html: `pages/tenders/distribution.html`, init: 'initDistributionPage' },
    '/tenders/import': { html: `pages/tenders/import.html`, init: 'initImportPage' },
    '/projects/create': { html: 'pages/projects/create.html' },
    '/projects/edit': { html: 'pages/projects/edit.html' },
    // 【新增規則】編輯專案的路由
    '/projects/edit': { html: `pages/projects/edit.html`, init: 'initProjectEditPage' },
    '/tenders/edit': { html: `pages/tenders/edit.html`, init: 'initTenderEditPage' },
    '404': { html: 'pages/404.html' }
};

function getBasePath() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/${GHP_BASE_PATH}` : '';
}

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

async function handleLocation() {
    const basePath = getBasePath();
    let path = window.location.pathname.replace(basePath, '');
    if (path === '' || path === '/') path = '/dashboard';
    
    const cleanPath = path.split('?')[0];
    const route = routes[cleanPath] || routes['404'];
    
    try {
        const fetchPath = `${basePath}/${route.html}`;
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`頁面載入失敗: ${fetchPath}`);
        
        document.getElementById('app-content').innerHTML = await response.text();
        
        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }
        updateSidebarActiveState();
        
    } catch (error) {
        console.error('路由載入錯誤:', error);
        document.getElementById('app-content').innerHTML = `<h1>無法載入頁面</h1>`;
    }
}

function updateSidebarActiveState() {
    const currentCleanPath = window.location.pathname.split('?')[0];
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        if (link.pathname === currentCleanPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function setupRouter() {
    document.body.addEventListener('click', e => {
        const anchor = e.target.closest('a[data-route]');
        if (anchor) {
            e.preventDefault();
            navigateTo(anchor.href);
        }
    });
    window.addEventListener('popstate', handleLocation);
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebase(
        (user) => {
            const currentUserEl = document.getElementById('currentUser');
            if(currentUserEl) currentUserEl.textContent = `👤 ${user.email}`;
            setupRouter();
            handleLocation();
        },
        () => {
            const baseUrl = getBasePath();
            const loginUrl = `${baseUrl}/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
