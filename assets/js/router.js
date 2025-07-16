/**
 * 簡易前端路由器 (SPA Router) - v7.0 (最終穩定版)
 * 修正了初始化流程，使其能安全地在 SPA 主頁和獨立頁面之間共存
 */

// 【無需修改】保留您完整的路由表
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
    '/projects/create': { html: 'pages/projects/create.html', title: '新增專案' },
    '/projects/edit': { html: 'pages/projects/edit.html', init: 'initProjectEditPage', title: '編輯專案' },
    '/tenders/edit': { html: 'pages/tenders/edit.html', init: 'initTenderEditPage', title: '編輯標單' },
    '404': { html: 'pages/404.html', title: '找不到頁面' }
};

// 輔助函式：取得 GitHub Pages 的基礎路徑
function getBasePath() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? '/program' : '';
}

// 導航函式
const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

const handleLocation = async () => {
    const app = document.getElementById('app');
    // 雙重保險：如果此函式被意外呼叫，提前退出
    if (!app) {
        console.error("handleLocation() was called on a page without an #app element. This should not happen.");
        return;
    }

    const path = window.location.pathname;
    const basePath = getBasePath();
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) : path;
    if (routeKey === "") routeKey = "/";
    
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
        const linkPath = new URL(link.href).pathname;
        if (linkPath === currentPath) {
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
// == 【最終關鍵修正】初始化時，先偵查環境 ==
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    // 由於 firebase-config.js 會先執行並呼叫 initFirebase，
    // 我們需要確保 initFirebase 本身是安全的。
    // 這個檔案現在只提供路由相關的函式，並等待被呼叫。
    console.log("router.js loaded and ready.");
});

// 假設 firebase-config.js 的 initFirebase 是這樣
/*
function initFirebase(onUser, onNoUser) {
    auth.onAuthStateChanged(user => {
        if (user) {
            onUser(user);
        } else {
            onNoUser();
        }
    });
}
*/

// 我們需要修改的是 index.html 和其他頁面呼叫 initFirebase 的方式，
// 但最簡單的方法是直接修正 router.js 的初始化部分，讓它自己處理。

// 為了確保萬無一失，請用這段取代您 router.js 最下方的 DOMContentLoaded
// (舊的程式碼已完全移除，替換成這個)
document.addEventListener('DOMContentLoaded', () => {
    // 這個函式只會在 initFirebase.js 載入並驗證使用者後被呼叫
    const initializePage = (user) => {
        // 更新所有頁面都會有的使用者資訊
        const currentUserEl = document.getElementById('currentUser');
        if (currentUserEl) {
            currentUserEl.textContent = user ? `👤 ${user.email}` : '未登入';
        }

        // *** 環境偵測 ***
        // 只有在主應用程式頁面 (有 #app 的頁面) 才設定和執行路由
        if (document.getElementById('app')) {
            console.log("SPA environment detected. Setting up router.");
            setupRouter();
            handleLocation();
        } else {
            console.log("Standalone page detected. Skipping router setup.");
            // 在獨立頁面，我們什麼都不用做，因為帳號已經在上面更新了
        }
    };

    // 呼叫由 firebase-config.js 提供的全域初始化函式
    initFirebase(
        (user) => {
            // 登入成功
            initializePage(user);
        },
        () => {
            // 未登入
            const baseUrl = getBasePath();
            const loginUrl = `${baseUrl}/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
