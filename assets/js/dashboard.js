/**
 * 專案管理系統 - 主控台 (Dashboard) 邏輯 (獨立檔案版)
 * v6.1 - 修正 SPA 腳本執行時機問題
 * 由 router.js 呼叫 initDashboardPage() 函數來啟動
 */
function initDashboardPage() {
    console.log("🚀 初始化儀表板頁面 (v6.1)...");

    // 【新增】等待元素載入的輔助函數
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
            return;
        }
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback();
            }
        }, 100);
    }

    // 【修改】將所有邏輯包裹在 waitForElement 回呼中
    // 等待 #loading 元素出現，代表 HTML 已被路由器載入
    waitForElement('#loading', () => {
        // DOM 元素快取
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.querySelector('.dashboard-container');

        // --- 主要資料處理與載入 ---
        async function loadDashboardData() {
            console.log('📊 載入主控台資料...');
            showLoading(true);
            try {
                if (!auth.currentUser) {
                    throw new Error("使用者未登入或認證資訊已失效。");
                }
                const [projects, tenders] = await Promise.all([
                    loadProjects(),
                    loadTenders()
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
                            無法載入您的主控台資料：${error.message}
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
            const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'planning');
            return {
                projectCount: activeProjects.length,
                tenderCount: tenders.length,
                totalAmount: totalAmount,
                lastUpdate: lastUpdate || new Date()
            };
        }

        function getRecentActivities(tenders, projects) {
            const projectMap = new Map(projects.map(p => [p.id, p.name]));
            return tenders
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
                .slice(0, 5)
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
            // 現在這些元素都保證存在
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
        loadDashboardData();
    });
}
