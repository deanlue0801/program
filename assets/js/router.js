/**
 * 簡易前端路由器 (SPA Router) - v15.0 (最終穩定版)
 * 修正了腳本執行的競爭條件，確保初始化函數能被穩定呼叫。
 */

const routes = {
    '/': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '首頁' },
    '/dashboard': { html: 'pages/dashboard.html', init: 'initDashboardPage', title: '儀表板' },
    '/projects/list': { html: 'pages/projects/list.html', init: 'initProjectsListPage', title: '專案管理' },
    '/projects/create': { html: 'pages/projects/create.html', init: 'initProjectCreatePage', title: '新增專案' },
    '/projects/edit': { html: 'pages/projects/edit.html', init: 'initProjectEditPage', title: '編輯專案' },
    '/tenders/list': { html: 'pages/tenders/list.html', init: 'initTendersListPage', title: '標單列表' },
    '/tenders/detail': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage', title: '標單詳情' },
    '/tenders/distribution': { html: 'pages/tenders/distribution.html', init: 'initDistributionPage', title: '樓層分配' },
    '/tenders/space-distribution': { html: 'pages/tenders/space-distribution.html', init: 'initSpaceDistributionPage', title: '空間分配' },
    '/tenders/progress-management': { html: 'pages/tenders/progress-management.html', init: 'initProgressManagementPage', title: '進度管理' },
    '/tenders/tracking-setup': { html: 'pages/tenders/tracking-setup.html', init: 'initTenderTrackingSetupPage', title: '追蹤設定' },
    '/cost-management': { html: 'pages/cost-management.html', init: 'initCostManagementPage', title: '成本控管' }
    '/tenders/import': { html: 'pages/tenders/import.html', init: 'initImportPage', title: '匯入標單' },
    '/tenders/edit': { html: 'pages/tenders/edit.html', init: 'initTenderEditPage', title: '編輯標單' },
    '/tenders/procurement': { html: 'pages/tenders/procurement.html', init: 'initProcurementPage', title: '標單採購' }, 
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
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) || '/' : path;
    
    // 確保路由鍵值不包含查詢參數
    routeKey = routeKey.split('?')[0];

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
        
        const html = await response.text();
        
        // 替換內容並手動執行腳本
        appContainer.innerHTML = html;
        const scripts = appContainer.querySelectorAll('script');
        for (const script of scripts) {
            const newScript = document.createElement('script');
            // 複製所有屬性
            for (const attr of script.attributes) {
                newScript.setAttribute(attr.name, attr.value);
            }
            // 複製腳本內容
            newScript.textContent = script.textContent;
            // 替換舊腳本以觸發執行
            script.parentNode.replaceChild(newScript, script);
        }

        // 使用 setTimeout 確保 DOM 更新後再執行初始化
        setTimeout(() => {
            if (route.init && typeof window[route.init] === 'function') {
                console.log(`✅ Router: 找到並成功執行初始化函數: ${route.init}`);
                window[route.init]();
            } else if (route.init) {
                console.error(`❌ Router: 路由需要函數 ${route.init}，但它在延遲後仍未被定義。請檢查 ${route.html} 中的腳本是否有誤。`);
            }
        }, 0);

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
