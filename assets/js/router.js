/**
 * 簡易前端路由器 (SPA Router) - v8.0 (偵錯專用版)
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
    const app = document.getElementById('app');
    if (!app) return;

    const path = window.location.pathname;
    const basePath = getBasePath();
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) : path;
    if (routeKey === "") routeKey = "/";
    
    const route = routes[routeKey] || routes['404'];

    if (!route) {
        app.innerHTML = `<h1>路由錯誤</h1>`;
        return;
    }

    document.title = route.title || '專案管理系統';

    try {
        const fetchPath = `${basePath}/${route.html}`;
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`無法載入頁面`);
        
        app.innerHTML = await response.text();

        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }
        updateSidebarActiveState();
    } catch (error) {
        app.innerHTML = `<h1>頁面載入失敗</h1>`;
    }
}

function updateSidebarActiveState() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        link.classList.toggle('active', new URL(link.href).pathname === currentPath);
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

// ==========================================================
// == 【偵錯關鍵】全新的初始化流程，帶有詳細日誌 ==
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("偵錯模式：DOMContentLoaded 事件觸發。");

    // 假設 initFirebase 函式存在於 firebase-config.js 中
    if (typeof initFirebase === 'function') {
        initFirebase(
            (user) => {
                // 登入成功
                console.log("偵錯模式：Firebase 回呼 - 登入成功。使用者:", user.email);
                
                // 在執行任何操作前，先印出當前的 DOM 結構
                console.log("偵錯模式：準備檢查 #app 元素，當前的 document.body.innerHTML 如下：");
                console.log(document.body.innerHTML); // 這會印出非常長的 HTML 字串

                const appElement = document.getElementById('app');
                const currentUserEl = document.getElementById('currentUser');
                
                if (currentUserEl) {
                    currentUserEl.textContent = `👤 ${user.email}`;
                }

                if (appElement) {
                    console.log("偵錯模式：成功找到 #app 元素！準備初始化 SPA 路由...");
                    setupRouter();
                    handleLocation();
                } else {
                    console.log("偵錯模式：在獨立頁面，跳過路由設定。");
                }
            },
            () => {
                // 未登入
                const loginUrl = `${getBasePath()}/login_page.html`;
                if (!window.location.pathname.endsWith('login_page.html')) {
                    window.location.href = loginUrl;
                }
            }
        );
    } else {
        console.error("偵錯模式：initFirebase() 函式不存在，請檢查 firebase-config.js 是否已正確載入。");
    }
});
