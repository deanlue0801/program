/**
 * 簡易前端路由器 (SPA Router) - v16.0 (穩定版)
 * 確保在動態載入 HTML 後，能穩定地找到並執行對應的初始化腳本。
 */

const routes = {
    '/program/': { html: '/program/pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/program/dashboard': { html: '/program/pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/program/projects/list': { html: '/program/pages/projects/list.html', init: 'initProjectsListPage', title: '專案管理' },
    '/program/projects/create': { html: '/program/pages/projects/create.html', init: 'initProjectCreatePage', title: '新增專案' },
    '/program/projects/edit': { html: '/program/pages/projects/edit.html', init: 'initProjectEditPage', title: '編輯專案' },
    '/program/tenders/list': { html: '/program/pages/tenders/list.html', init: 'initTendersListPage', title: '標單列表' },
    '/program/tenders/detail': { html: '/program/pages/tenders/detail.html', init: 'initTenderDetailPage', title: '標單詳情' },
    '/program/tenders/edit': { html: '/program/pages/tenders/edit.html', init: 'initTenderEditPage', title: '編輯標單' },
    '/program/tenders/distribution': { html: '/program/pages/tenders/distribution.html', init: 'initDistributionPage', title: '樓層分配' },
    '/program/tenders/space-distribution': { html: '/program/pages/tenders/space-distribution.html', init: 'initSpaceDistributionPage', title: '空間分配' },
    '/program/tenders/progress-management': { html: '/program/pages/tenders/progress-management.html', init: 'initProgressManagementPage', title: '進度管理' },
    '/program/tenders/tracking-setup': { html: '/program/pages/tenders/tracking-setup.html', init: 'initTenderTrackingSetupPage', title: '追蹤設定' },
    '/program/tenders/import': { html: '/program/pages/tenders/import.html', init: 'initImportPage', title: '匯入標單' },
    '404': { html: '/program/pages/404.html', title: '找不到頁面' }
};

// 全域函數，用於導航
function navigateTo(url) {
    history.pushState(null, null, url);
    handleLocation();
}

async function handleLocation() {
    const appContainer = document.getElementById('app-content');
    if (!appContainer) { 
        console.error("Router Error: 'app-content' container not found!");
        return; 
    }

    const path = window.location.pathname;
    const route = routes[path] || routes['404'];
    
    document.title = route.title || '專案管理系統';

    try {
        const response = await fetch(route.html);
        if (!response.ok) throw new Error(`無法載入頁面: ${route.html}`);
        
        const html = await response.text();
        appContainer.innerHTML = html; // 將新頁面內容注入

        // 使用 setTimeout 延遲執行，確保 DOM 更新完畢
        setTimeout(() => {
            if (route.init && typeof window[route.init] === 'function') {
                console.log(`✅ Router: 執行初始化函數 -> ${route.init}`);
                window[route.init]();
            } else if (route.init) {
                console.error(`❌ Router: 找不到初始化函數: ${route.init}`);
            }
        }, 0);

        updateSidebarActiveState(path);

    } catch (error) {
        console.error('Routing error:', error);
        appContainer.innerHTML = `<h1>頁面載入失敗</h1><p>${error.message}</p>`;
    }
}

function updateSidebarActiveState(currentPath) {
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

// --- 應用程式啟動點 ---
document.addEventListener('DOMContentLoaded', () => {
    initFirebase(
        // onAuthSuccess: 用戶登入成功後執行的函數
        (user) => {
            const currentUserEl = document.getElementById('currentUser');
            if (currentUserEl) {
                currentUserEl.textContent = user ? `👤 ${user.email}` : '未登入';
            }
            if (document.getElementById('app-content')) {
                setupRouter();
                handleLocation(); // 初始載入頁面
            }
        },
        // onAuthFail: 用戶未登入時執行的函數
        () => {
            const loginUrl = `/program/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
