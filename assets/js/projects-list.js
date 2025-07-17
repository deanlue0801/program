/**
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

        // 【核心修正】從 Map 物件中直接讀取成員資訊，而不是用 find()
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
