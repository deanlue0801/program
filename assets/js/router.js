/**
 * 簡易前端路由器 (SPA Router) - v5.0 (最終修正版)
 * 結合了使用者原始架構與修正後的路由引擎
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
    '/projects/create': { html: `pages/projects/create.html` }, // 這頁沒有 init 函式，是正常的
    '/projects/edit': { html: `pages/projects/edit.html`, init: 'initProjectEditPage' },
    '/tenders/edit': { html: `pages/tenders/edit.html`, init: 'initTenderEditPage' },
    '404': { html: 'pages/404.html' }
};

// 輔助函式：取得 GitHub Pages 的基礎路徑
function getBasePath() {
    // 您的 GHP_BASE_PATH 是 'program'
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/program` : ''; // 回傳的路徑不應有結尾斜線
}

// 導航函式
const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

// ==========================================================
// == 【關鍵修正】修正後的 handleLocation 函式 ==
// ==========================================================
const handleLocation = async () => {
    const app = document.getElementById('app');
    if (!app) {
        console.error("Fatal Error: #app element not found in the main document.");
        return;
    }

    const path = window.location.pathname;
    const basePath = getBasePath();
    
    // 修正1：從完整路徑中正確提取出路由鍵
    let routeKey = path;
    if (path.startsWith(basePath)) {
        routeKey = path.substring(basePath.length); // 例如，從 "/program/projects/list" 得到 "/projects/list"
    }
    if (routeKey === "") {
        routeKey = "/"; // 確保根路徑是 "/"
    }
    
    // 根據路由鍵尋找對應的路由設定，如果找不到，就使用 '404'
    const route = routes[routeKey] || routes['404'];

    if (!route) {
        document.title = "錯誤";
        app.innerHTML = `<h1>路由設定錯誤</h1><p>找不到路徑 "${routeKey}" 的設定，且未指定 404 頁面。</p>`;
        return;
    }

    // 更新網頁標題（安全地檢查 title 屬性是否存在）
    document.title = route.title || '專案管理系統';

    try {
        // 修正2：使用 route.html 而不是 route.path
        const fetchPath = `${basePath}/${route.html}`; 
        
        const response = await fetch(fetchPath);
        if (!response.ok) {
            throw new Error(`無法載入頁面 (${response.status}): ${fetchPath}`);
        }
        
        const html = await response.text();
        app.innerHTML = html;

        // 修正3：在載入 HTML 後，呼叫您定義的 init 函式
        if (route.init && typeof window[route.init] === 'function') {
            console.log(`Executing init function: ${route.init}`);
            window[route.init]();
        } else if (route.init) {
            console.warn(`Init function "${route.init}" was defined in routes but not found on window object.`);
        }

        // 更新側邊欄的 활성화 狀態
        updateSidebarActiveState();

    } catch (error) {
        console.error('Routing error:', error);
        app.innerHTML = `<h1>頁面載入失敗</h1><p>${error.message}</p>`;
    }
};

// 【無需修改】保留您原本的輔助函式
function updateSidebarActiveState() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        // 確保比較時都使用絕對路徑
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

// 【無需修改】保留您原本的初始化流程
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
