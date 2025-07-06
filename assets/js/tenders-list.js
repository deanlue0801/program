/**
 * 專案列表頁面 (tenders/list.js) (SPA 版本)
 * 由 router.js 呼叫 initTendersListPage() 函數來啟動
 */
function initTendersListPage() {

    // --- 頁面狀態管理 ---
    let allTenders = [];
    let allProjects = [];
    let filteredAndGroupedData = []; // 新的、用於分組的資料結構

    // --- 資料載入 ---

    async function loadAllData() {
        showLoading(true);
        try {
            const [tenders, projects] = await Promise.all([
                loadTenders(),
                loadProjects()
            ]);

            allProjects = projects;
            allTenders = tenders.map(tender => ({
                ...tender,
                projectName: projects.find(p => p.id === tender.projectId)?.name || '未歸屬專案'
            }));
            
            updateProjectFilter();
            applyFiltersAndGroup(); // 使用新的過濾與分組函數
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

    // 【重寫】新的渲染函數，會產生分組標頭
    function renderTenders() {
        const tbody = document.getElementById('tendersTableBody');
        const emptyState = document.getElementById('emptyState');
        const tableContainer = document.querySelector('.table-container');

        if (!tbody) return;

        if (filteredAndGroupedData.length === 0) {
            tbody.innerHTML = '';
            if(tableContainer) tableContainer.style.display = 'none';
            if(emptyState) emptyState.style.display = 'block';
            return;
        }

        if(tableContainer) tableContainer.style.display = 'block';
        if(emptyState) emptyState.style.display = 'none';

        let html = '';
        filteredAndGroupedData.forEach(group => {
            // 渲染專案的標題列
            html += `
                <tr class="project-group-header">
                    <td colspan="7">
                        <strong>📁 專案：${escapeHtml(group.project.name)}</strong>
                        <span class="project-code">(${escapeHtml(group.project.code || 'N/A')})</span>
                    </td>
                </tr>
            `;

            // 渲染這個專案底下的標單
            if (group.tenders && group.tenders.length > 0) {
                group.tenders.forEach(tender => {
                    html += `
                        <tr class="tender-row">
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
                    `;
                });
            } else {
                 html += `<tr><td colspan="7" class="no-tenders-in-group">此專案下沒有符合篩選條件的標單。</td></tr>`;
            }
        });
        tbody.innerHTML = html;
    }
    
    // --- 事件處理與操作 ---

    // 【重寫】新的函數，整合了過濾和分組
    function applyFiltersAndGroup() {
        const projectFilter = document.getElementById('projectFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const searchInput = document.getElementById('searchInput').value.toLowerCase();

        // 1. 過濾
        const filteredTenders = allTenders.filter(tender => {
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

        // 2. 分組
        const groups = {};
        filteredTenders.forEach(tender => {
            const projectId = tender.projectId || 'unassigned';
            if (!groups[projectId]) {
                const projectInfo = allProjects.find(p => p.id === projectId) || { name: '未歸屬專案', code: 'N/A' };
                groups[projectId] = {
                    project: projectInfo,
                    tenders: []
                };
            }
            groups[projectId].tenders.push(tender);
        });

        filteredAndGroupedData = Object.values(groups);
        renderTenders();
    }

    function clearFilters() {
        document.getElementById('projectFilter').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('searchInput').value = '';
        applyFiltersAndGroup();
    }
    
    function viewTender(tenderId) {
        navigateTo(`/program/tenders/detail?id=${tenderId}`);
    }

    function editTender(tenderId) {
        navigateTo(`/program/tenders/edit?id=${tenderId}`);
    }

    async function deleteTender(tenderId, tenderName) {
        if (!confirm(`確定要刪除標單「${tenderName}」嗎？\n此操作將一併刪除所有相關資料且無法復原！`)) return;
        
        try {
            showLoading(true, '刪除中...');
            await deleteTenderAndRelatedData(tenderId);
            
            allTenders = allTenders.filter(t => t.id !== tenderId);
            
            applyFiltersAndGroup();
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

    function showLoading(isLoading, message = '載入專案資料中...') {
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
        applyFilters: applyFiltersAndGroup, // 指向新的整合函數
        clearFilters,
        viewTender,
        editTender,
        deleteTender
    };
    
    console.log("🚀 初始化專案列表頁面...");
    loadAllData();
}
