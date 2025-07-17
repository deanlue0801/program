/**
 * 專案管理系統 - 主控台 (Dashboard) 邏輯 (SPA 版本)
 * v3.0 - 權限系統最終修正版
 * 由 router.js 呼叫 initDashboardPage() 函數來啟動
 */
function initDashboardPage() {
    
    // --- 主要資料處理與載入 ---

    async function loadDashboardData() {
        console.log('📊 載入主控台資料 (v3.0)...');
        try {
            // 【核心修正】一次性載入所有具備權限的資料
            // 這兩個函式來自 firebase-config.js，已經包含了權限檢查，是安全的。
            const projects = await loadProjects(); 
            const tenders = await loadTenders();

            // 將已安全載入的資料傳遞給後續函式進行計算與渲染
            const stats = calculateStats(projects, tenders);
            const activities = getRecentActivities(tenders);
            
            updateStatsDisplay(stats);
            updateActivitiesDisplay(activities);
            
            console.log('✅ 主控台資料載入完成');
        } catch(error) {
            // 這個 catch 現在主要處理網路問題或 firebase-config.js 中的錯誤
            console.error("❌ 主控台資料載入失敗", error);
            showAlert("無法載入您的主控台資料，請檢查網路連線或稍後再試。", "error");
        } finally {
            showMainContent();
        }
    }

    /**
     * 【核心修正】此函式現在只負責計算，不再進行任何資料庫讀取
     * @param {Array} projects - 已安全載入的專案列表
     * @param {Array} tenders - 已安全載入的標單列表
     * @returns {Object} 統計物件
     */
    function calculateStats(projects, tenders) {
        try {
            let totalAmount = 0;
            let lastUpdate = null;

            tenders.forEach(tender => {
                totalAmount += tender.totalAmount || 0;
                const updateTime = tender.updatedAt || tender.createdAt;
                if (updateTime && (!lastUpdate || updateTime.toDate() > lastUpdate)) {
                    lastUpdate = updateTime.toDate();
                }
            });

            return {
                projectCount: projects.length,
                tenderCount: tenders.length,
                totalAmount: totalAmount,
                lastUpdate: lastUpdate || new Date()
            };
        } catch (error) {
            console.error('❌ 計算統計資料失敗:', error);
            return { projectCount: 0, tenderCount: 0, totalAmount: 0, lastUpdate: new Date() };
        }
    }

    /**
     * 【核心修正】此函式現在只處理已傳入的資料，不再進行任何資料庫讀取
     * @param {Array} tenders - 已安全載入的標單列表
     * @returns {Array} 最近活動的陣列
     */
    function getRecentActivities(tenders) {
        try {
            // 直接對已載入的標單進行排序和篩選
            return tenders
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
                .slice(0, 5) // 取最近的 5 筆
                .map(tender => ({
                    type: 'tender',
                    title: `新增標單：${tender.name || '未命名'}`,
                    time: tender.createdAt,
                    icon: '📋'
                }));
        } catch (error) {
            console.error('❌ 處理活動記錄失敗:', error);
            return [];
        }
    }

    function startAutoRefresh() {
        console.log('🔄 啟動每 5 分鐘自動刷新機制');
        setInterval(async () => {
            if (auth.currentUser) {
                try {
                    // 自動刷新時也使用新的安全流程
                    const projects = await loadProjects();
                    const tenders = await loadTenders();
                    const stats = calculateStats(projects, tenders);
                    updateStatsDisplay(stats);
                    console.log('🔄 資料已自動刷新');
                } catch (error) {
                    console.error('❌ 自動刷新失敗:', error);
                }
            }
        }, 300000);
    }

    // --- UI 更新與顯示 (此區塊維持不變) ---

    function updateStatsDisplay(stats) {
        const projectCountEl = document.getElementById('projectCount');
        if (projectCountEl) projectCountEl.textContent = stats.projectCount;
        const tenderCountEl = document.getElementById('tenderCount');
        if (tenderCountEl) tenderCountEl.textContent = stats.tenderCount;
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalAmountEl) totalAmountEl.textContent = formatCurrency(stats.totalAmount);
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) lastUpdateEl.textContent = stats.lastUpdate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const projectChangeEl = document.getElementById('projectChange');
        if(projectChangeEl) projectChangeEl.textContent = `共 ${stats.projectCount} 個專案`;
        const tenderChangeEl = document.getElementById('tenderChange');
        if(tenderChangeEl) tenderChangeEl.textContent = `共 ${stats.tenderCount} 個標單`;
        const amountChangeEl = document.getElementById('amountChange');
        if(amountChangeEl) amountChangeEl.textContent = `總計 ${formatCurrency(stats.totalAmount)}`;
        const updateTimeEl = document.getElementById('updateTime');
        if(updateTimeEl) updateTimeEl.textContent = `於 ${formatDateTime(stats.lastUpdate)} 更新`;
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
        if (diffDays < 7) return `${diffDays} 天前`;
        return date.toLocaleDateString('zh-TW');
    }

    function showMainContent() {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        const mainContentEl = document.getElementById('mainContent');
        if (mainContentEl) mainContentEl.style.display = 'block';
    }

    // --- 頁面啟動點 ---
    function startPage() {
        console.log("🚀 初始化儀表板頁面 (v3.0)...");
        if (!auth.currentUser) {
            showAlert("無法獲取用戶資訊，請重新登入", "error");
            return;
        }
        console.log(`主控台：歡迎 ${auth.currentUser.email}！`);
        loadDashboardData();
        startAutoRefresh();
    }

    startPage();
}
