/**
 * 簡易前端路由器 (SPA Router) - v4.0 (GitHub Pages SPA 最終解決方案)
 */

const GHP_BASE_PATH = 'program';

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
    // 【新增規則】編輯專案的路由
    '/projects/edit': { html: `pages/projects/edit.html`, init: 'initProjectEditPage' },
    '/tenders/edit': { html: `pages/tenders/edit.html`, init: 'initTenderEditPage' },
    '404': { html: 'pages/404.html' }
};

function getBasePath() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/${GHP_BASE_PATH}` : '';
}

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

const handleLocation = async () => {
    const path = window.location.pathname;
    const basePath = '/program/'; // 定義您的 GitHub Pages 基礎路徑
    
    // 調整路徑以匹配路由表，移除基礎路徑
    let adjustedPath = path;
    if (path.startsWith(basePath)) {
        adjustedPath = path.substring(basePath.length - 1); // 結果會是 / 或 /projects/list
    }

    const route = routes[adjustedPath] || routes['404'];
    document.title = route.title;

    try {
        // 建立要抓取的 HTML 檔案的完整路徑
        const fetchPath = basePath + route.path.substring(1); // 結果會是 /program/pages/dashboard.html
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error(`Failed to fetch page: ${fetchPath}`);
        
        const html = await response.text();
        app.innerHTML = html;

        // --- 以下是關鍵修正 ---
        
        // 從載入的 HTML 中提取並載入 CSS
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        
        // 清除舊的動態載入樣式
        document.querySelectorAll('link[data-dynamic-style]').forEach(el => el.remove());

        links.forEach(link => {
            const originalHref = link.getAttribute('href');
            if (!originalHref) return;

            // 使用 URL 物件來正確解析相對路徑
            // new URL(fetchPath, window.location.origin) 會得到 HTML 檔案的絕對 URL
            // 例如：https://deanlue0801.github.io/program/pages/dashboard.html
            const resolvedCssUrl = new URL(originalHref, new URL(fetchPath, window.location.origin));

            const newLink = document.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.href = resolvedCssUrl.pathname; // 我們只取路徑部分，例如 /program/assets/css/layout.css
            newLink.setAttribute('data-dynamic-style', 'true');
            document.head.appendChild(newLink);
        });

        // 從載入的 HTML 中提取並執行 scripts (這部分邏輯不變)
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                // 處理外部腳本
                const resolvedScriptUrl = new URL(script.src, new URL(fetchPath, window.location.origin));
                newScript.src = resolvedScriptUrl.pathname;
            } else {
                // 處理內聯腳本
                newScript.textContent = script.textContent;
            }
            // 確保腳本被執行
            document.body.appendChild(newScript);
        });

    } catch (error) {
        console.error('Routing error:', error);
        app.innerHTML = `<h1>頁面載入失敗</h1><p>${error.message}</p>`;
    }
};

function updateSidebarActiveState() {
    const currentCleanPath = window.location.pathname.split('?')[0];
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        if (link.pathname === currentCleanPath) {
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
