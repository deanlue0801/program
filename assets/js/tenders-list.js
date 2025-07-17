/**
 * 標單列表頁面 (tenders/list.js) - v4.0 (權限 Map 結構)
 */
function initTendersListPage() {
    let allTenders = [], allProjects = [], filteredAndGroupedData = [];

    async function loadAllData() {
        showLoading(true);
        try {
            const [tenders, projects] = await Promise.all([loadTenders(), loadProjects()]);
            allProjects = projects;
            allTenders = tenders.map(tender => ({ ...tender, projectName: projects.find(p => p.id === tender.projectId)?.name || '未歸屬專案' }));
            updateProjectFilter();
            applyFiltersAndGroup();
            updateSummary();
        } catch (error) {
            console.error('❌ 載入列表資料失敗:', error);
            showAlert('載入資料失敗，請稍後再試', 'error');
        } finally {
            showLoading(false);
        }
    }

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
        if (!tbody || !emptyState || !tableContainer) return;
        if (filteredAndGroupedData.length === 0) {
            tbody.innerHTML = '';
            tableContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        tableContainer.style.display = 'block';
        emptyState.style.display = 'none';
        let html = '';
        const currentUserEmail = auth.currentUser.email;
        filteredAndGroupedData.forEach(group => {
            // 【結構修正】從 Map 中讀取權限
            const memberInfo = (group.project.members && group.project.members[currentUserEmail]) ? group.project.members[currentUserEmail] : null;
            const userRole = memberInfo ? memberInfo.role : null;
            const userPermissions = (memberInfo && memberInfo.permissions) ? memberInfo.permissions : {};
            const canEditProject = userRole === 'owner';
            const canEditTenders = userRole === 'owner' || (userRole === 'editor' && userPermissions.canAccessTenders);

            html += `<tr class="project-group-header"><td colspan="6"><strong>📁 專案：${escapeHtml(group.project.name)}</strong><span class="project-code">(${escapeHtml(group.project.code || 'N/A')})</span></td><td class="project-actions">${canEditProject ? `<button class="btn btn-sm btn-edit-project" data-action="edit-project" data-project-id="${group.project.id}">編輯專案</button>` : ''}</td></tr>`;
            if (group.tenders && group.tenders.length > 0) {
                group.tenders.forEach(tender => {
                    html += `<tr class="tender-row"><td><a href="/program/tenders/detail?id=${tender.id}" data-route>${escapeHtml(tender.name || '未命名標單')}</a></td><td><code>${escapeHtml(tender.code || 'N/A')}</code></td><td>${escapeHtml(tender.projectName)}</td><td><strong>${formatCurrency(tender.totalAmount || 0)}</strong></td><td><span class="status-badge ${tender.status || 'planning'}">${getStatusText(tender.status)}</span></td><td>${formatDate(tender.createdAt)}</td><td><div class="action-buttons"><button class="btn btn-sm btn-view" data-action="view-tender" data-tender-id="${tender.id}">查看</button>${canEditTenders ? `<button class="btn btn-sm btn-edit" data-action="edit-tender" data-tender-id="${tender.id}">編輯標單</button><button class="btn btn-sm btn-delete" data-action="delete-tender" data-tender-id="${tender.id}" data-tender-name="${escapeHtml(tender.name)}">刪除</button>` : ''}</div></td></tr>`;
                });
            } else {
                 html += `<tr><td colspan="7" class="no-tenders-in-group">此專案下沒有符合篩選條件的標單。</td></tr>`;
            }
        });
        tbody.innerHTML = html;
    }

    function setupEventListeners() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        mainContent.addEventListener('click', (event) => {
            const target = event.target.closest('button[data-action]');
            if (!target) return;
            
            const { action, tenderId, tenderName, projectId } = target.dataset;

            switch (action) {
                case 'view-tender': viewTender(tenderId); break;
                case 'edit-tender': editTender(tenderId); break;
                case 'delete-tender': deleteTender(tenderId, tenderName); break;
                case 'edit-project': editProject(projectId); break;
                case 'clear-filters': clearFilters(); break;
            }
        });

        document.getElementById('projectFilter')?.addEventListener('change', applyFiltersAndGroup);
        document.getElementById('statusFilter')?.addEventListener('change', applyFiltersAndGroup);
        document.getElementById('searchInput')?.addEventListener('input', applyFiltersAndGroup);
    }

    function applyFiltersAndGroup() {
        const projectFilter = document.getElementById('projectFilter')?.value || '';
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        const searchInput = document.getElementById('searchInput')?.value.toLowerCase() || '';

        const filteredTenders = allTenders.filter(tender => {
            if (projectFilter && tender.projectId !== projectFilter) return false;
            if (statusFilter && tender.status !== statusFilter) return false;
            if (searchInput) {
                const searchFields = [ tender.name || '', tender.code || '', tender.projectName || '' ].join(' ').toLowerCase();
                if (!searchFields.includes(searchInput)) return false;
            }
            return true;
        });

        const groups = {};
        filteredTenders.forEach(tender => {
            const projectId = tender.projectId || 'unassigned';
            if (!groups[projectId]) {
                const projectInfo = allProjects.find(p => p.id === projectId);
                if (projectInfo) {
                    groups[projectId] = { project: projectInfo, tenders: [] };
                }
            }
            if (groups[projectId]) {
                groups[projectId].tenders.push(tender);
            }
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

    function viewTender(tenderId) { navigateTo(`/program/tenders/detail?id=${tenderId}`); }
    function editTender(tenderId) { navigateTo(`/program/tenders/edit?id=${tenderId}`); }
    function editProject(projectId) { navigateTo(`/program/projects/edit?id=${projectId}`); }

    async function deleteTender(tenderId, tenderName) {
        if (!confirm(`確定要刪除標單「${tenderName}」嗎？\n此操作將一併刪除所有相關資料且無法復原！`)) return;

        showLoading(true, '刪除中...');
        try {
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
    function showLoading(isLoading, message = '載入資料中...') {
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.getElementById('mainContent');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            const p = loadingEl.querySelector('p');
            if (p) p.textContent = message;
        }
        if (mainContentEl) mainContentEl.style.display = isLoading ? 'none' : 'block';
    }

    console.log("🚀 初始化標單列表頁面...");
    loadAllData();
    setupEventListeners();
}
