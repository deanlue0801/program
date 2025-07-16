/**
 * 簡易前端路由器 (SPA Router) - v11.0 (最終生產架構版)
 * 採用標準 SPA 模式，不再處理子頁面腳本，只負責載入內容並呼叫 init 函式。
 */

const routes = {
    '/': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '首頁' },
    '/dashboard': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/tenders/list': { html: 'pages/tenders/list.html', init: 'initTendersListPage', title: '標單列表' },
    '/tenders/detail': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage', title: '標單詳情' },
    '/tenders/distribution': { html: 'pages/tenders/distribution.html', init: 'initDistributionPage', title: '樓層分配' },
    '/tenders/space-distribution': { html: 'pages/tenders/space-distribution.html', init: 'initSpaceDistributionPage', title: '空間分配' },
    '/tenders/progress-management': { html: 'pages/tenders/progress-management.html', init: 'initProgressManagementPage', title: '進度管理' },
    '/tenders/tracking-setup': { html: 'pages/tenders/tracking-setup.html', init: 'initTenderTrackingSetupPage', title: '追蹤設定' },
    '/tenders/import': { html: 'pages/tenders/import.html', init: 'initImportPage', title: '匯入標單' },
    // 【關鍵修正】為 create 頁面也加上 init 函式
    '/projects/create': { html: 'pages/projects/create.html', init: 'initProjectCreatePage', title: '新增專案' },
    '/projects/edit': { html: 'pages/projects/edit.html', init: 'initProjectEditPage', title: '編輯專案' },
    '/tenders/edit': { html: 'pages/tenders/edit.html', init: 'initTenderEditPage', title: '編輯標單' },
    '404': { html: 'pages/404.html', title: '找不到頁面' }
};

function getBasePath() {
    return window.location.hostname.includes('github.io') ? '/program' : '';
}

function navigateTo(url) {
    history.pushState(null, null, url);
    handleLocation();
}

async function handleLocation() {
    const appContainer = document.getElementById('app-content');
    if (!appContainer) { return; }

    const path = window.location.pathname;
    const basePath = getBasePath();
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) : path;
    if (routeKey === "") routeKey = "/";
    
    const route = routes[routeKey] || routes['404'];
    if (!route) {
        appContainer.innerHTML = `<h1>路由錯誤</h1>`;
        return;
    }

    document.title = route.title || '專案管理系統';

    try {
        const fetchPath = `${basePath}/${route.html}`;
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`無法載入頁面: ${fetchPath}`);
        
        // 【關鍵修正】只注入 HTML，不再處理 script 和 link
        appContainer.innerHTML = await response.text();

        // 執行頁面對應的初始化函式 (這是現在唯一的腳本執行方式)
        if (route.init && typeof window[route.init] === 'function') {
            console.log(`Router: Executing init function -> ${route.init}()`);
            window[route.init]();
        }
        updateSidebarActiveState();

    } catch (error) {
        console.error('Routing error:', error);
        appContainer.innerHTML = `<h1>頁面載入失敗</h1><p>${error.message}</p>`;
    }
}

function updateSidebarActiveState() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        const linkPath = new URL(link.href).pathname;
        link.classList.toggle('active', linkPath === currentPath);
    });
}

function setupRouter() {
    window.addEventListener('popstate', handleLocation);
    document.body.addEventListener('click', e => {
        const anchor = e.target.closest('a[data-route]');
        if (anchor) {
            e.preventDefault();
            navigateTo(anchor.href);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebase(
        (user) => {
            const currentUserEl = document.getElementById('currentUser');
            if (currentUserEl) {
                currentUserEl.textContent = user ? `👤 ${user.email}` : '未登入';
            }

            if (document.getElementById('app-content')) {
                setupRouter();
                handleLocation();
            }
        },
        () => {
            const loginUrl = `${getBasePath()}/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
