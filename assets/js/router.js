/**
 * 簡易前端路由器 (SPA Router) - v6.0 (最終穩定版)
 * 增加頁面環境檢查，使其能與獨立頁面共存
 */

// 【無需修改】保留您完整的路由表
const routes = {
    '/': { html: `pages/dashboard.html`, init: 'initDashboardPage' },
    '/dashboard': { html: `pages/dashboard.html`, init: 'initDashboardPage' },
    '/tenders/list': { html: `pages/tenders/list.html`, init: 'initTendersListPage' },
    '/tenders/detail': { html: `pages/tenders/detail.html`, init: 'initTenderDetailPage' },
    '/tenders/distribution': { html: `pages/tenders/distribution.html`, init: 'initDistributionPage' },
    '/tenders/space-distribution': { html: `pages/tenders/space-distribution.html`, init: 'initSpaceDistributionPage' },
    '/tenders/progress-management': { html: `pages/tenders/progress-management.html`, init: 'initProgressManagementPage' },
    '/tenders/tracking-setup': { html: `pages/tenders/tracking-setup.html`, init: 'initTenderTrackingSetupPage' },
    '/tenders/import': { html: `pages/tenders/import.html`, init: 'initImportPage' },
    '/projects/create': { html: `pages/projects/create.html` },
    '/projects/edit': { html: `pages/projects/edit.html`, init: 'initProjectEditPage' },
    '/tenders/edit': { html: `pages/tenders/edit.html`, init: 'initTenderEditPage' },
    '404': { html: 'pages/404.html' }
};

// 輔助函式：取得 GitHub Pages 的基礎路徑
function getBasePath() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/program` : '';
}

// 導航函式
const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

const handleLocation = async () => {
    const app = document.getElementById('app');
    // 這個檢查仍然保留，作為雙重保險
    if (!app) {
        console.error("handleLocation called on a page without #app element.");
        return;
    }

    const path = window.location.pathname;
    const basePath = getBasePath();
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) : path;
    if (routeKey === "" || routeKey === "/") {
        routeKey = "/";
    }
    
    const route = routes[routeKey] || routes['404'];

    if (!route) {
        app.innerHTML = `<h1>路由錯誤</h1><p>找不到路徑 "${routeKey}" 的設定。</p>`;
        return;
    }

    document.title = route.title || '專案管理系統';

    try {
        const fetchPath = `${basePath}/${route.html}`;
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`無法載入頁面 (${response.status})`);
        
        app.innerHTML = await response.text();

        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }

        updateSidebarActiveState();

    } catch (error) {
        console.error('Routing error:', error);
        app.innerHTML = `<h1>頁面載入失敗</h1><p>${error.message}</p>`;
    }
};

function updateSidebarActiveState() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        if (link.pathname === currentPath) {
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


// ==========================================================
// == 【關鍵修正】初始化時，先檢查自己在哪種類型的頁面 ==
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    // 檢查頁面上是否存在 #app "畫框"
    const appElement = document.getElementById('app');

    if (appElement) {
        // --- 情況一：這是在 SPA 主頁 (index.html) ---
        console.log("Router: #app element found. Initializing SPA mode.");
        initFirebase(
            (user) => {
                const currentUserEl = document.getElementById('currentUser');
                if(currentUserEl) currentUserEl.textContent = `👤 ${user.email}`;
                setupRouter();    // 設定路由點擊事件
                handleLocation(); // 載入初始頁面內容
            },
            () => {
                const loginUrl = `${getBasePath()}/login_page.html`;
                if (!window.location.pathname.endsWith('login_page.html')) {
                    window.location.href = loginUrl;
                }
            }
        );
    } else {
        // --- 情況二：這是在一個獨立頁面 (如 create.html) ---
        console.log("Router: #app element not found. Initializing in standalone page mode.");
        // 在獨立頁面，我們只需要初始化 Firebase 來驗證使用者身份，但【不執行】路由功能
        initFirebase(
            (user) => {
                // 獨立頁面也可能有顯示使用者資訊的地方
                const currentUserEl = document.getElementById('currentUser');
                if(currentUserEl) {
                     // 這裡就是解決您「帳號載入中」問題的關鍵！
                    currentUserEl.textContent = user.email;
                }
            },
            () => {
                const loginUrl = `${getBasePath()}/login_page.html`;
                // 獨立頁面也需要被保護
                if (!window.location.pathname.endsWith('login_page.html')) {
                    window.location.href = loginUrl;
                }
            }
        );
    }
});
