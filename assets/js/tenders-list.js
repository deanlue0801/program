/**
 * 標單列表頁面 (tenders/list.js) (SPA 版本)
 * 由 router.js 呼叫 initTendersListPage() 函數來啟動
 */
function initTendersListPage() {

    // --- 頁面狀態管理 ---
    let allTenders = [];
    let allProjects = [];
    let filteredTenders = [];

    // --- 資料載入 ---

    async function loadAllData() {
        showLoading(true);
        try {
            // 並行載入標單和專案資料，速度更快
            const [tenders, projects] = await Promise.all([
                loadTenders(),   // 來自 firebase-config.js
                loadProjects()   // 來自 firebase-config.js
            ]);

            allProjects = projects;
            // 將專案名稱合併到標單資料中，方便顯示
            allTenders = tenders.map(tender => {
                const project = allProjects.find(p => p.id === tender.projectId);
                return {
                    ...tender,
                    projectName: project ? project.name : '未歸屬專案'
                };
            });
            
            updateProjectFilter();
            applyFilters(); // 初始載入時，不過濾，直接顯示全部
            updateSummary();

        } catch (error) {
            console.error('❌ 載入列表資料失敗:', error);
            showAlert('載入資料失敗，請稍後再試', 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- UI 更新與渲染 ---

    function updateProjectFilter() {
        const projectFilter = document.getElementById('projectFilter');
        if (!projectFilter) return;
        projectFilter.innerHTML = '<option value="">所有專案</option>';
        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            projectFilter.appendChild(option);
        });
    }

    function updateSummary() {
        const totalTendersEl = document.getElementById('totalTenders');
        const totalAmountEl = document.getElementById('totalAmount');
        const activeTendersEl = document.getElementById('activeTenders');
        const completedTendersEl = document.getElementById('completedTenders');

        if(totalTendersEl) totalTendersEl.textContent = allTenders.length;
        if(totalAmountEl) {
             const totalAmount = allTenders.reduce((sum, tender) => sum + (tender.totalAmount || 0), 0);
             totalAmountEl.textContent = formatCurrency(totalAmount);
        }
        if(activeTendersEl) activeTendersEl.textContent = allTenders.filter(t => t.status === 'active').length;
        if(completedTendersEl) completedTendersEl.textContent = allTenders.filter(t => t.status === 'completed').length;
    }

    function renderTenders() {
        const tbody = document.getElementById('tendersTableBody');
        const emptyState = document.getElementById('emptyState');
        const tableContainer = document.querySelector('.table-container');

        if (!tbody) return;

        if (filteredTenders.length === 0) {
            tbody.innerHTML = '';
            if(tableContainer) tableContainer.style.display = 'none';
            if(emptyState) emptyState.style.display = 'block';
            return;
        }

        if(tableContainer) tableContainer.style.display = 'block';
        if(emptyState) emptyState.style.display = 'none';

        // 【修正處】這裡的 href 路徑移除了 .html，並確保路徑是絕對路徑
        tbody.innerHTML = filteredTenders.map(tender => `
            <tr>
                <td><a href="/program/tenders/detail?id=${tender.id}" data-route>${escapeHtml(tender.name || '未命名標單')}</a></td>
                <td><code>${escapeHtml(tender.code || 'N/A')}</code></td>
                <td>${escapeHtml(tender.projectName)}</td>
                <td><strong>${formatCurrency(tender.totalAmount || 0)}</strong></td>
                <td><span class="status-badge ${tender.status || 'planning'}">${getStatusText(tender.status)}</span></td>
                <td>${formatDate(tender.createdAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-view" onclick="window.exposedListFuncs.viewTender('${tender.id}')">查看</button>
                        <button class="btn btn-sm btn-edit" onclick="window.exposedListFuncs.editTender('${tender.id}')">編輯</button>
                        <button class="btn btn-sm btn-delete" onclick="window.exposedListFuncs.deleteTender('${tender.id}', '${escapeHtml(tender.name)}')">刪除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    // --- 事件處理與操作 ---

    function applyFilters() {
        const projectFilter = document.getElementById('projectFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const searchInput = document.getElementById('searchInput').value.toLowerCase();

        filteredTenders = allTenders.filter(tender => {
            if (projectFilter && tender.projectId !== projectFilter) return false;
            if (statusFilter && tender.status !== statusFilter) return false;
            if (searchInput) {
                const searchFields = [
                    tender.name || '',
                    tender.code || '',
                    tender.projectName || ''
                ].join(' ').toLowerCase();
                if (!searchFields.includes(searchInput)) return false;
            }
            return true;
        });

        renderTenders();
    }

    function clearFilters() {
        document.getElementById('projectFilter').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('searchInput').value = '';
        applyFilters();
    }
    
    // 【修正處】navigateTo 的路徑移除了 .html
    function viewTender(tenderId) {
        navigateTo(`/program/tenders/detail?id=${tenderId}`);
    }

    // 【修正處】navigateTo 的路徑移除了 .html
    function editTender(tenderId) {
        navigateTo(`/program/tenders/edit?id=${tenderId}`);
    }

    async function deleteTender(tenderId, tenderName) {
        if (!confirm(`確定要刪除標單「${tenderName}」嗎？\n此操作將一併刪除所有相關資料且無法復原！`)) return;
        
        try {
            showLoading(true, '刪除中...');
            await deleteTenderAndRelatedData(tenderId);
            
            allTenders = allTenders.filter(t => t.id !== tenderId);
            
            applyFilters();
            updateSummary();
            
            showAlert('標單已成功刪除！', 'success');
        } catch (error) {
            console.error('❌ 刪除標單失敗:', error);
            showAlert('刪除失敗：' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- 輔助函數 ---

    function getStatusText(status) {
        const statusMap = { 'planning': '規劃中', 'bidding': '招標中', 'awarded': '得標', 'active': '進行中', 'completed': '已完成', 'paused': '暫停' };
        return statusMap[status] || '未設定';
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showLoading(isLoading, message = '載入標單資料中...') {
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.getElementById('mainContent');
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (mainContentEl) mainContentEl.style.display = isLoading ? 'none' : 'block';
        if (isLoading && loadingEl) {
            const p = loadingEl.querySelector('p');
            if (p) p.textContent = message;
        }
    }
    
    // --- 函數暴露與頁面啟動 ---
    
    window.exposedListFuncs = {
        applyFilters,
        clearFilters,
        viewTender,
        editTender,
        deleteTender
    };
    
    console.log("🚀 初始化標單列表頁面...");
    loadAllData();
}
