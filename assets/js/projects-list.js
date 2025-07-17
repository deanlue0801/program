前端最終修正1. 修正 assets/js/projects-list.js (確保刪除功能正常)請用以下完整的程式碼，替換掉您現有的 assets/js/projects-list.js 檔案。/**
 * 專案列表頁面 (projects-list.js) - v2.0 (權限最終修正)
 * 負責載入並顯示使用者有權限的專案列表。
 */
function initProjectsListPage() {
    console.log("🚀 初始化專案列表頁面 (v2.0)...");

    const loadingEl = document.getElementById('loading');
    const container = document.getElementById('projectsListContainer');
    const emptyStateEl = document.getElementById('emptyState');
    const cardTemplate = document.getElementById('projectCardTemplate');

    async function loadAndRenderProjects() {
        showLoading(true);
        container.innerHTML = '';
        
        try {
            const projects = await loadProjects();

            if (projects.length === 0) {
                emptyStateEl.style.display = 'block';
                container.style.display = 'none';
            } else {
                emptyStateEl.style.display = 'none';
                container.style.display = 'grid';
                container.className = 'projects-grid';

                projects.forEach(project => {
                    const card = createProjectCard(project);
                    container.appendChild(card);
                });
            }
        } catch (error) {
            console.error("❌ 載入專案列表失敗:", error);
            showAlert("載入專案列表失敗: " + error.message, 'error');
            emptyStateEl.style.display = 'block';
            emptyStateEl.innerHTML = '<h3>載入失敗</h3><p>無法讀取專案資料，請稍後再試。</p>';
        } finally {
            showLoading(false);
        }
    }

    function createProjectCard(project) {
        const card = cardTemplate.content.cloneNode(true).firstElementChild;
        const userEmail = auth.currentUser.email;

        const memberInfo = (project.members && project.members[userEmail]) ? project.members[userEmail] : null;
        const userRole = memberInfo ? memberInfo.role : '未知';
        const roleText = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' }[userRole] || '未知';

        card.querySelector('.project-title').textContent = project.name || '未命名專案';
        card.querySelector('.project-code').textContent = project.code || 'N/A';
        
        const statusEl = card.querySelector('.project-status');
        statusEl.textContent = getStatusText(project.status);
        statusEl.className = `project-status status-${project.status || 'planning'}`;
        
        card.querySelector('.budget').textContent = formatCurrency(project.budget || 0);
        card.querySelector('.created-date').textContent = formatDate(project.createdAt);
        card.querySelector('.user-role').textContent = roleText;
        
        const editBtn = card.querySelector('[data-action="edit"]');
        const deleteBtn = card.querySelector('[data-action="delete"]');
        
        editBtn.addEventListener('click', () => navigateTo(`/program/projects/edit?id=${project.id}`));
        
        if (userRole === 'owner') {
            deleteBtn.addEventListener('click', () => handleDeleteProject(project.id, project.name));
        } else {
            deleteBtn.style.display = 'none';
        }

        return card;
    }

    async function handleDeleteProject(projectId, projectName) {
        if (!confirm(`您確定要刪除專案「${projectName}」嗎？\n警告：此操作將會刪除專案本身，但不會自動刪除其下的標單資料，請謹慎操作！`)) {
            return;
        }

        try {
            showLoading(true, '刪除專案中...');
            await db.collection('projects').doc(projectId).delete();
            showAlert('專案刪除成功！', 'success');
            loadAndRenderProjects();
        } catch (error) {
            console.error("❌ 刪除專案失敗:", error);
            showAlert("刪除專案失敗: " + error.message, 'error');
            showLoading(false);
        }
    }

    function showLoading(isLoading) {
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (!isLoading) {
        } else {
            if(container) container.style.display = 'none';
            if(emptyStateEl) emptyStateEl.style.display = 'none';
        }
    }

    function getStatusText(status) {
        const statusMap = { 'planning': '規劃中', 'active': '進行中', 'completed': '已完成', 'paused': '暫停' };
        return statusMap[status] || '未設定';
    }

    loadAndRenderProjects();
}
2. 修正 pages/dashboard.html (內嵌腳本)請用以下完整的程式碼，替換掉您現有的 pages/dashboard.html 檔案。<!-- pages/dashboard.html -->
<div class="dashboard-container">
    <div class="dashboard-header">
        <div id="welcomeMessage">
            <h1 class="page-title">歡迎回來！</h1>
            <p class="page-subtitle">這是您所有專案的即時總覽。</p>
        </div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon project">📁</div><div class="stat-value" id="projectCount">0</div><div class="stat-label">進行中專案</div><div class="stat-change" id="projectChange">共 0 個專案</div></div>
            <div class="stat-card"><div class="stat-icon tender">📋</div><div class="stat-value" id="tenderCount">0</div><div class="stat-label">標單總數</div><div class="stat-change" id="tenderChange">共 0 個標單</div></div>
            <div class="stat-card"><div class="stat-icon amount">💰</div><div class="stat-value" id="totalAmount">NT$ 0</div><div class="stat-label">合約總金額</div><div class="stat-change" id="amountChange">總計 NT$ 0</div></div>
            <div class="stat-card"><div class="stat-icon time">⏰</div><div class="stat-value" id="lastUpdate">--:--</div><div class="stat-label">最後更新</div><div class="stat-change" id="updateTime">等待資料...</div></div>
        </div>
    </div>
    <div class="dashboard-main-content">
        <div class="content-card recent-activity">
            <h3 class="card-title">最近活動</h3>
            <ul class="activity-list" id="activityList"></ul>
        </div>
    </div>
</div>
<div id="loading" class="loading" style="display: flex; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.8); z-index: 10;">
    <div class="spinner"></div><p>載入儀表板資料中...</p>
</div>

<script>
function initDashboardPage() {
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.querySelector('.dashboard-container');
    async function loadDashboardData() {
        console.log('📊 載入主控台資料 (v4.0)...');
        showLoading(true);
        try {
            const projects = await loadProjects();
            const tenders = await loadTenders();
            const stats = calculateStats(projects, tenders);
            const activities = getRecentActivities(tenders);
            updateStatsDisplay(stats);
            updateActivitiesDisplay(activities);
            console.log('✅ 主控台資料載入完成');
        } catch(error) {
            console.error("❌ 主控台資料載入失敗", error);
            showAlert("無法載入您的主控台資料，請檢查網路連線或稍後再試。", "error");
        } finally {
            showLoading(false);
        }
    }
    function calculateStats(projects, tenders) {
        try {
            let totalAmount = 0, lastUpdate = null;
            tenders.forEach(tender => {
                totalAmount += tender.totalAmount || 0;
                const updateTime = tender.updatedAt || tender.createdAt;
                if (updateTime && (!lastUpdate || updateTime.toDate() > lastUpdate)) lastUpdate = updateTime.toDate();
            });
            return { projectCount: projects.length, tenderCount: tenders.length, totalAmount, lastUpdate: lastUpdate || new Date() };
        } catch (error) {
            console.error('❌ 計算統計資料失敗:', error);
            return { projectCount: 0, tenderCount: 0, totalAmount: 0, lastUpdate: new Date() };
        }
    }
    function getRecentActivities(tenders) {
        try {
            return tenders
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
                .slice(0, 5)
                .map(tender => ({ type: 'tender', title: `新增標單：${tender.name || '未命名'}`, time: tender.createdAt, icon: '📋' }));
        } catch (error) {
            console.error('❌ 處理活動記錄失敗:', error);
            return [];
        }
    }
    function startAutoRefresh() {
        setInterval(async () => {
            if (auth.currentUser) {
                try {
                    const projects = await loadProjects();
                    const tenders = await loadTenders();
                    updateStatsDisplay(calculateStats(projects, tenders));
                } catch (error) { console.error('❌ 自動刷新失敗:', error); }
            }
        }, 300000);
    }
    function updateStatsDisplay(stats) {
        document.getElementById('projectCount').textContent = stats.projectCount;
        document.getElementById('tenderCount').textContent = stats.tenderCount;
        document.getElementById('totalAmount').textContent = formatCurrency(stats.totalAmount);
        document.getElementById('lastUpdate').textContent = stats.lastUpdate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('projectChange').textContent = `共 ${stats.projectCount} 個專案`;
        document.getElementById('tenderChange').textContent = `共 ${stats.tenderCount} 個標單`;
        document.getElementById('amountChange').textContent = `總計 ${formatCurrency(stats.totalAmount)}`;
        document.getElementById('updateTime').textContent = `於 ${formatDateTime(stats.lastUpdate)} 更新`;
    }
    function updateActivitiesDisplay(activities) {
        const activityList = document.getElementById('activityList');
        if (!activityList) return;
        if (activities.length === 0) {
            activityList.innerHTML = `<li class="activity-item"><div class="activity-icon project">ℹ️</div><div class="activity-content"><div class="activity-title">暫無活動記錄</div><div class="activity-time">開始使用系統後將會顯示您的活動</div></div></li>`;
            return;
        }
        activityList.innerHTML = activities.map(activity => `<li class="activity-item"><div class="activity-icon ${activity.type}">${activity.icon}</div><div class="activity-content"><div class="activity-title">${activity.title}</div><div class="activity-time">${formatRelativeTime(activity.time)}</div></div></li>`).join('');
    }
    function formatRelativeTime(timestamp) {
        if (!timestamp) return '未知時間';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 1) return '剛剛';
        if (diffMins < 60) return `${diffMins} 分鐘前`;
        const diffHours = Math.round(diffMs / 3600000);
        if (diffHours < 24) return `${diffHours} 小時前`;
        const diffDays = Math.round(diffMs / 86400000);
        return diffDays < 7 ? `${diffDays} 天前` : date.toLocaleDateString('zh-TW');
    }
    function showLoading(isLoading) {
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (mainContentEl) mainContentEl.style.visibility = isLoading ? 'hidden' : 'visible';
    }
    function startPage() {
        console.log("🚀 初始化儀表板頁面 (v4.0)...");
        if (!auth.currentUser) {
            showAlert("無法獲取用戶資訊，請重新登入", "error");
            return;
        }
        loadDashboardData();
        startAutoRefresh();
    }
    startPage();
}
</script>
3. 修正 index.html (移除舊腳本)請用以下完整的程式碼，替換掉您現有的 index.html 檔案。<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>專案管理系統</title>
    <link rel="stylesheet" href="/program/assets/css/layout.css">
    <link rel="stylesheet" href="/program/assets/css/dashboard.css">
    <link rel="stylesheet" href="/program/assets/css/tenders-list.css">
    <link rel="stylesheet" href="/program/assets/css/detail.css">
    <link rel="stylesheet" href="/program/assets/css/distribution.css">
    <link rel="stylesheet" href="/program/assets/css/import.css">
    <link rel="stylesheet" href="/program/assets/css/edit.css">
    <link rel="stylesheet" href="/program/assets/css/components/buttons.css">
    <link rel="stylesheet" href="/program/assets/css/components/tables.css">
    <link rel="stylesheet" href="/program/assets/css/tenders-edit.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
<script>
  (function(){
    var redirect = sessionStorage.redirect;
    delete sessionStorage.redirect;
    if (redirect && redirect != location.href) {
      history.replaceState(null, null, redirect);
    }
  })();
</script>
</head>
<body>
    <div class="app-layout">
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-header"><h3>🏗️ 專案管理</h3></div>
            <ul class="nav-list">
                <li><a href="/program/dashboard" data-route>📊 儀表板</a></li>
                <li><a href="/program/projects/list" data-route>📁 專案管理</a></li>
                <li>
                    <a href="/program/tenders/list" data-route>📋 標單管理</a>
                    <ul class="sub-nav">
                        <li><a href="/program/tenders/distribution" data-route>🏢 分配管理</a></li>
                        <li><a href="/program/tenders/space-distribution" data-route>🚪 空間分配管理</a></li>
                        <li><a href="/program/tenders/progress-management" data-route>🚧 施工進度管理</a></li>
                        <li><a href="/program/tenders/tracking-setup" data-route><i class="fas fa-list-check fa-fw me-2"></i> 追蹤項目設定</a></li>
                        <li><a href="/program/tenders/import" data-route>📥 匯入細項</a></li>
                    </ul>
                </li>
            </ul>
            <div class="sidebar-footer">
                <span id="currentUser"></span>
                <button onclick="logout()">登出</button>
            </div>
        </nav>
        <main class="main-content" id="app-content"></main>
    </div>

    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js"></script>
    <script src="/program/assets/js/firebase-config.js"></script> 
    <script src="/program/assets/js/router.js"></script>
    <script src="/program/assets/js/tenders-list.js"></script> 
    <script src="/program/assets/js/tenders-detail.js"></script>
    <script src="/program/assets/js/tenders-distribution.js"></script>
    <script src="/program/assets/js/tenders-space-distribution.js"></script>
    <script src="/program/assets/js/tenders-progress-management.js"></script>
    <script src="/program/assets/js/tenders-import.js"></script>
    <script src="/program/assets/js/tenders-edit.js"></script>
    <script src="/program/assets/js/projects-edit.js"></script>
    <script src="/program/assets/js/projects-list.js"></script>
    <script src="/program/assets/js/tenders-tracking-setup.js"></script>
</body>
</html>
