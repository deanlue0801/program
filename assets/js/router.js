/**
 * 簡易前端路由器 (SPA Router) - v3.1 (乾淨連結最終版)
 */

// 【重要修正】路由表的「鍵」現在是不含 .html 的乾淨路徑
const routes = {
    '/': { html: 'pages/dashboard.html', init: 'initDashboardPage' },
    '/dashboard': { html: 'pages/dashboard.html', init: 'initDashboardPage' },
    '/tenders/list': { html: 'pages/tenders/list.html', init: 'initTendersListPage' },
    '/tenders/detail': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage' },
    '/tenders/distribution': { html: 'pages/tenders/distribution.html', init: 'initDistributionPage' },
    '/tenders/import': { html: 'pages/tenders/import.html', init: 'initImportPage' },
    '/tenders/detail': { html: 'pages/tenders/detail.html', init: 'initTenderDetailPage' },
    '/tenders/edit': { html: 'pages/tenders/edit.html', init: 'initTenderEditPage' },
    '404': { html: 'pages/404.html' }
};

// --- 路由核心邏輯 (與之前版本相同，但為了完整性一併提供) ---

const GHP_BASE_PATH = 'program';

function getBasePath() {
    const isGitHubPages = window.location.hostname.includes('github.io');
    return isGitHubPages ? `/${GHP_BASE_PATH}` : '';
}

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

async function handleLocation() {
    const basePath = getBasePath();
    // 從 URL 中移除基礎路徑，得到乾淨的路由鍵
    let path = window.location.pathname.replace(basePath, '');
    if (path === '' || path === '/') path = '/dashboard'; // 預設頁面
    
    // 移除 URL 參數以便匹配路由表
    const cleanPath = path.split('?')[0];
    
    const route = routes[cleanPath] || routes['404'];
    
    try {
        const fetchPath = `${basePath}/${route.html}`;
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
    const currentPath = window.location.pathname.split('?')[0];
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
            const baseUrl = getBasePath();
            // 注意：這裡的 login_page.html 是一個真實的檔案，所以路徑要正確
            const loginUrl = `${baseUrl}/login_page.html`;
            if (!window.location.pathname.endsWith('login_page.html')) {
                window.location.href = loginUrl;
            }
        }
    );
});
