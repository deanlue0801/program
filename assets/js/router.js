/**
 * 簡易前端路由器 (SPA Router) - v2.2 (GitHub Pages 最終相容版)
 */

// --- 路由表 ---
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

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

async function handleLocation() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    
    // 在 GitHub Pages 環境下，路徑通常是 /<repo-name>/<page>，我們需要移除 repo-name
    const path = isGitHubPages && pathSegments.length > 1 ? `/${pathSegments.slice(1).join('/')}` : window.location.pathname;

    const route = routes[path] || routes['/'] || routes['404'];
    
    try {
        // 構建正確的檔案路徑
        const fetchPath = isGitHubPages ? `/${pathSegments[0]}/${route.html}` : route.html;
        const response = await fetch(fetchPath);

        if (!response.ok) throw new Error(`頁面載入失敗: ${response.status}`);
        
        document.getElementById('app-content').innerHTML = await response.text();
        
        if (route.init && typeof window[route.init] === 'function') {
            window[route.init]();
        }
        updateSidebarActiveState(path);
        
    } catch (error) {
        console.error('路由載入錯誤:', error);
        document.getElementById('app-content').innerHTML = `<h1>無法載入頁面</h1>`;
    }
}

function updateSidebarActiveState(path) {
    document.querySelectorAll('#sidebar a[data-route]').forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (window.location.pathname === linkPath) {
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
            console.log('Router: 登入成功，設定路由');
            const currentUserEl = document.getElementById('currentUser');
            if(currentUserEl) currentUserEl.textContent = `👤 ${user.email}`;
            setupRouter();
            handleLocation();
        },
        () => {
            // 【關鍵修正】使用相對路徑，以相容 GitHub Pages
            if (!window.location.pathname.includes('login_page.html')) {
                // 從當前路徑跳轉到 login_page.html
                const newPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/login_page.html';
                window.location.href = newPath;
            }
        }
    );
});
