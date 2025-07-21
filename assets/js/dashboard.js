/**
 * 專案管理系統 - 主控台 (Dashboard) 邏輯 (獨立檔案版)
 * v6.0 - 修正 SPA 腳本執行問題
 * 由 router.js 呼叫 initDashboardPage() 函數來啟動
 */
function initDashboardPage() {
    
    // DOM 元素快取
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.querySelector('.dashboard-container');

    // --- 主要資料處理與載入 ---
    async function loadDashboardData() {
        console.log('📊 載入主控台資料 (v6.0)...');
        showLoading(true);
        try {
            // 使用 Promise.all 平行載入專案和標單
            const [projects, tenders] = await Promise.all([
                loadProjects(), // 來自 firebase-config.js
                loadTenders()   // 來自 firebase-config.js
            ]);
            
            const stats = calculateStats(projects, tenders);
            const activities = getRecentActivities(tenders, projects);
            
            updateStatsDisplay(stats);
            updateActivitiesDisplay(activities);
            
            console.log('✅ 主控台資料載入完成');
        } catch(error) {
            console.error("❌ 主控台資料載入失敗", error);
            if (mainContentEl) {
                mainContentEl.innerHTML = `
                    <div class="alert error" style="display: block;">
                        無法載入您的主控台資料，請檢查網路連線或稍後再試。
                    </div>`;
            }
        } finally {
            showLoading(false);
        }
    }

    function calculateStats(projects, tenders) {
        let totalAmount = 0;
        let lastUpdate = null;

        tenders.forEach(tender => {
            totalAmount += tender.totalAmount || 0;
            const updateTime = tender.updatedAt || tender.createdAt;
            if (updateTime) {
                const date = updateTime.toDate ? updateTime.toDate() : new Date(updateTime);
                if (!lastUpdate || date > lastUpdate) {
                    lastUpdate = date;
                }
            }
        });

        // 確保 projectCount 是基於有權限的專案
        const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'planning');

        return {
            projectCount: activeProjects.length,
            tenderCount: tenders.length,
            totalAmount: totalAmount,
            lastUpdate: lastUpdate || new Date()
        };
    }

    function getRecentActivities(tenders, projects) {
        // 建立一個 projectId -> projectName 的查找表以提高效率
        const projectMap = new Map(projects.map(p => [p.id, p.name]));
        
        return tenders
            .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
            .slice(0, 5) // 只取最近 5 筆
            .map(tender => ({
                type: 'tender',
                title: `${tender.name || '未命名'}`,
                subtitle: `歸屬於專案：${projectMap.get(tender.projectId) || '未知專案'}`,
                time: tender.createdAt,
                icon: '📋'
            }));
    }

    // --- UI 更新與顯示 ---
    function updateStatsDisplay(stats) {
        document.getElementById('projectCount').textContent = stats.projectCount;
        document.getElementById('tenderCount').textContent = stats.tenderCount;
        document.getElementById('totalAmount').textContent = formatCurrency(stats.totalAmount);
        document.getElementById('lastUpdate').textContent = stats.lastUpdate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    }

    function updateActivitiesDisplay(activities) {
        const activityList = document.getElementById('activityList');
        if (!activityList) return;
        if (activities.length === 0) {
            activityList.innerHTML = `<li class="activity-item"><div class="activity-icon">ℹ️</div><div class="activity-content"><div class="activity-title">暫無活動記錄</div><div class="activity-time">開始新增標單後將會顯示您的最近活動</div></div></li>`;
            return;
        }
        activityList.innerHTML = activities.map(activity => `
            <li class="activity-item">
                <div class="activity-icon ${activity.type}">${activity.icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-subtitle">${activity.subtitle}</div>
                    <div class="activity-time">${formatRelativeTime(activity.time)}</div>
                </div>
            </li>`).join('');
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
        return `${diffDays} 天前`;
    }

    function showLoading(isLoading) {
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (mainContentEl) mainContentEl.style.visibility = isLoading ? 'hidden' : 'visible';
    }

    // --- 頁面啟動點 ---
    console.log("🚀 初始化儀表板頁面 (v6.0)...");
    if (!auth.currentUser) {
        showAlert("無法獲取用戶資訊，請重新登入", "error");
        return;
    }
    loadDashboardData();
}
