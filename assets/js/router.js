/**
 * 簡易前端路由器 (SPA Router) - v14.0 (腳本執行修正版)
 * 實現了動態樣式載入、路徑修正與自動清理，並能正確執行子頁面的腳本。
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
    let routeKey = path.startsWith(basePath) ? path.substring(basePath.length) || '/' : path;
    
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
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const fetchUrlBase = new URL(fetchPath, window.location.origin);

        // --- 動態樣式處理 (維持不變) ---
        document.querySelectorAll('[data-dynamic-style]').forEach(el => el.remove());
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const originalHref = link.getAttribute('href');
            if (originalHref) {
                const correctCssUrl = new URL(originalHref, fetchUrlBase);
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = correctCssUrl.pathname;
                newLink.setAttribute('data-dynamic-style', 'true');
                document.head.appendChild(newLink);
            }
        });

        // --- ✨ 核心修正：替換內容並手動執行腳本 ---
        appContainer.innerHTML = doc.body.innerHTML; // 1. 先載入 HTML 結構

        // 2. 找到所有腳本並重新建立以執行它們
        const scripts = appContainer.querySelectorAll('script');
        for (const script of scripts) {
            const newScript = document.createElement('script');
            // 複製所有屬性 (例如 type, async)
            for (const attr of script.attributes) {
                newScript.setAttribute(attr.name, attr.value);
            }
            newScript.textContent = script.textContent; // 複製腳本內容
            // 替換舊的、未執行的腳本節點
            script.parentNode.replaceChild(newScript, script);
        }
        // --- 修正結束 ---

        // 3. 現在，初始化函數應該已經被定義了，可以安全呼叫
        if (route.init && typeof window[route.init] === 'function') {
            console.log(`✅ Router: 找到並準備執行初始化函數: ${route.init}`);
            window[route.init]();
        } else if (route.init) {
            console.warn(`⚠️ Router: 路由需要函數 ${route.init}，但它未被定義。請檢查 ${route.html} 中的腳本。`);
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
