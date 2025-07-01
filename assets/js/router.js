/**
 * 簡易前端路由器 (SPA Router) - v2
 * 路徑已根據 assets/js, tenders/ 等結構更新
 */

// --- 路由表：註冊所有頁面 ---
const routes = {
    // 路由路徑 (網址上看的) : { HTML片段檔案路徑 (實際存放位置), JS初始化函數名稱 }
    '/': { html: '/pages/dashboard.html', init: 'initDashboardPage' },
    '/index.html': { html: '/pages/dashboard.html', init: 'initDashboardPage' },
    '/dashboard.html': { html: '/pages/dashboard.html', init: 'initDashboardPage' },
    '/tenders/list.html': { html: '/pages/tenders/list.html', init: 'initTendersListPage' },
    '/tenders/detail.html': { html: '/pages/tenders/detail.html', init: 'initTenderDetailPage' },
    '/tenders/distribution.html': { html: '/pages/tenders/distribution.html', init: 'initDistributionPage' },
    '/tenders/import.html': { html: '/pages/tenders/import.html', init: 'initImportPage' },
    '404': { html: '/pages/404.html' } // 建議也在 pages 裡放一個 404.html
};

// --- 路由核心邏輯 (此部分無需修改) ---

const navigateTo = url => {
    history.pushState(null, null, url);
    handleLocation();
};

async function handleLocation() {
    const path = window.location.pathname;
    const route = routes[path] || routes['404'];
    try {
        const response = await fetch(route.html);
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
    document.querySelectorAll('#sidebar a').forEach(link => {
        // 使用 startsWith 來處理子頁面高亮，例如點擊 detail 時，list 仍然高亮
        const linkPath = link.getAttribute('href');
        if (path.startsWith(linkPath)) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function setupRouter() {
    document.body.addEventListener('click', e => {
        if (e.target.matches('[data-route]')) {
            e.preventDefault();
            navigateTo(e.target.getAttribute('href')); // 從 href 獲取路徑
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
            if (!window.location.pathname.includes('login_page.html')) {
                window.location.href = '/login_page.html';
            }
        }
    );
});