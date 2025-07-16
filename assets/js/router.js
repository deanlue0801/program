/**
 * 簡易前端路由器 (SPA Router) - v9.0 (最終穩定版)
 * 修正了主內容容器的 ID，並整合所有已知修復
 */

const routes = {
    '/': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '首頁' },
    '/dashboard': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/tenders/list': { html: 'pages/tenders/list.html', init: 'initTendersListPage', title: '標單列表' },
    '/tenders/detail': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage', title: '標單詳情' },
    '/tenders/distribution': { html: `pages/tenders/distribution.html`, init: 'initDistributionPage', title: '樓層分配' },
    '/tenders/space-distribution': { html: `pages/tenders/space-distribution.html`, init: 'initSpaceDistributionPage', title: '空間分配' },
    '/tenders/progress-management': { html: `pages/tenders/progress-management.html`, init: 'initProgressManagementPage', title: '進度管理' },
    '/tenders/tracking-setup': { html: `pages/tenders/tracking-setup.html`, init: 'initTenderTrackingSetupPage', title: '追蹤設定' },
    '/tenders/import': { html: `pages/tenders/import.html`, init: 'initImportPage', title: '匯入標單' },
    '/projects/create': { html: 'pages/projects/create.html', title: '新增專案' },
    '/projects/edit': { html: `pages/projects/edit.html`, init: 'initProjectEditPage', title: '編輯專案' },
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
    // 【關鍵修正】使用正確的 ID 'app-content'
    const appContainer = document.getElementById('app-content');
    if (!appContainer) {
        console.error("handleLocation() was called on a page without an #app-content element.");
        return;
    }

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
        if (!response.ok) throw new Error(`無法載入頁面`);
        
        appContainer.innerHTML = await response.text();

        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }
        updateSidebarActiveState();
    } catch (error) {
        appContainer.innerHTML = `<h1>頁面載入失敗</h1>`;
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
    // 呼叫由 firebase-config.js 提供的全域初始化函式
    initFirebase(
        (user) => { // 登入成功
            const currentUserEl = document.getElementById('currentUser');
            if (currentUserEl) {
                currentUserEl.textContent = user ? `👤 ${user.email}` : '未登入';
            }

            // *** 環境偵測 ***
            // 【關鍵修正】使用正確的 ID 'app-content' 來判斷
            if (document.getElementById('app-content')) {
                console.log("SPA environment detected (#app-content). Setting up router.");
                setupRouter();
                handleLocation();
            } else {
                console.log("Standalone page detected. Skipping router setup.");
            }
        },
        () => { // 未登入
            const loginUrl = `${getBasePath()}/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
