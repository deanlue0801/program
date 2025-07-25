/**
 * 簡易前端路由器 (SPA Router) - v17.0 (執行時機修正版)
 * 確保在動態載入 HTML 後，能穩定地找到並執行對應的初始化腳本。
 */

const routes = {
    '/program/': { html: '/program/pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/program/dashboard': { html: '/program/pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/program/projects/list': { html: '/program/pages/projects/list.html', init: 'initProjectsListPage', title: '專案管理' },
    '/program/projects/create': { html: '/program/pages/projects/create.html', init: 'initProjectCreatePage', title: '新增專案' },
    '/program/projects/edit': { html: '/program/pages/projects/edit.html', init: 'initProjectEditPage', title: '編輯專案' },
    '/program/tenders/list': { html: '/program/pages/tenders/list.html', init: 'initTendersListPage', title: '標單列表' },
    '/program/tenders/create': { html: '/program/pages/tenders/create.html', init: 'initTenderCreatePage', title: '新增標單' },
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
    // 處理帶有查詢參數的路由
    const baseRoute = path.split('?')[0];
    const route = routes[baseRoute] || routes['404'];
    
    document.title = route.title || '專案管理系統';

    try {
        const response = await fetch(route.html);
        if (!response.ok) throw new Error(`無法載入頁面: ${route.html}`);
        
        const html = await response.text();
        appContainer.innerHTML = html; // 將新頁面內容注入

        // --- 【核心修正】---
        // 使用 setTimeout 將初始化函數的執行推遲到下一個事件循環。
        // 這給了瀏覽器足夠的時間來解析剛剛注入的 HTML，確保元素都已存在於 DOM 中。
        setTimeout(() => {
            if (route.init && typeof window[route.init] === 'function') {
                console.log(`✅ Router: 執行初始化函數 -> ${route.init}`);
                window[route.init]();
            } else if (route.init) {
                console.error(`❌ Router: 找不到初始化函數: ${route.init}`);
            }
        }, 0); // 延遲 0 毫秒就足以達成目的

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
        // onAuthSuccess
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
        // onAuthFail
        () => {
            const loginUrl = `/program/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
