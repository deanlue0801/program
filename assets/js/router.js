/**
 * 簡易前端路由器 (SPA Router) - v3.0 (GitHub Pages 子目錄最終相容版)
 */

// 專案在 GitHub Pages 上的基礎路徑 (您的專案名稱)
const GHP_BASE_PATH = 'program';

// --- 路由表：使用相對路徑，不含 base path ---
const routes = {
    '/': { html: 'pages/dashboard.html', init: 'initDashboardPage' },
    '/index.html': { html: 'pages/dashboard.html', init: 'initDashboardPage' },
    '/dashboard.html': { html: 'pages/dashboard.html', init: 'initDashboardPage' },
    '/tenders/list.html': { html: 'pages/tenders/list.html', init: 'initTendersListPage' },
    '/tenders/detail.html': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage' },
    '/tenders/distribution.html': { html: 'pages/tenders/distribution.html', init: 'initDistributionPage' },
    '/tenders/import.html': { html: 'pages/tenders/import.html', init: 'initImportPage' },
    '404': { html: 'pages/404.html' }
};

// --- 路由核心邏輯 ---

// 獲取當前環境的基礎 URL
function getBaseUrl() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/${GHP_BASE_PATH}/` : '/';
}

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

async function handleLocation() {
    const baseUrl = getBaseUrl();
    // 從 URL 中移除基礎路徑，得到乾淨的路由鍵
    let path = window.location.pathname.replace(baseUrl, '/').replace('//', '/');
    if (path === '' || path === baseUrl) path = '/';
    
    const route = routes[path] || routes['404'];
    
    try {
        // 構建正確的檔案抓取路徑
        const fetchPath = `${baseUrl}${route.html}`;
        const response = await fetch(fetchPath);

        if (!response.ok) throw new Error(`頁面載入失敗: ${fetchPath}`);
        
        document.getElementById('app-content').innerHTML = await response.text();
        
        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }
        updateSidebarActiveState();
        
    } catch (error) {
        console.error('路由載入錯誤:', error);
        document.getElementById('app-content').innerHTML = `<h1>無法載入頁面</h1>`;
    }
}

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

document.addEventListener('DOMContentLoaded', () => {
    initFirebase(
        (user) => {
            const currentUserEl = document.getElementById('currentUser');
            if(currentUserEl) currentUserEl.textContent = `👤 ${user.email}`;
            setupRouter();
            handleLocation();
        },
        () => {
            // 【關鍵修正】跳轉到 login_page.html
            const baseUrl = getBaseUrl();
            const loginUrl = `${baseUrl}login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
