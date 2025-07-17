assets/js/projects-list.js (權限最終修正版)請用以下完整的程式碼，替換掉您現有的 assets/js/projects-list.js 檔案。/**
 * 專案列表頁面 (projects-list.js) - v3.0 (權限最終修正)
 * 負責載入並顯示使用者有權限的專案列表。
 */
function initProjectsListPage() {
    console.log("🚀 初始化專案列表頁面 (v3.0)...");

    // --- DOM 元素快取 ---
    const loadingEl = document.getElementById('loading');
    const container = document.getElementById('projectsListContainer');
    const emptyStateEl = document.getElementById('emptyState');
    const cardTemplate = document.getElementById('projectCardTemplate');

    // --- 主要流程 ---
    async function loadAndRenderProjects() {
        showLoading(true);
        container.innerHTML = ''; // 清空舊內容
        
        try {
            // loadProjects() 來自 firebase-config.js，已具備權限檢查
            const projects = await loadProjects();

            if (projects.length === 0) {
                emptyStateEl.style.display = 'block';
                container.style.display = 'none';
            } else {
                emptyStateEl.style.display = 'none';
                container.style.display = 'grid';
                container.className = 'projects-grid'; // 應用卡片網格樣式

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

    // --- UI 渲染 ---
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
        
        // 只有 owner 才能看到刪除按鈕
        if (userRole === 'owner') {
            deleteBtn.addEventListener('click', () => handleDeleteProject(project.id, project.name));
        } else {
            deleteBtn.style.display = 'none';
        }

        return card;
    }

    // --- 操作處理函式 ---
    async function handleDeleteProject(projectId, projectName) {
        if (!confirm(`您確定要刪除專案「${projectName}」嗎？\n警告：此操作將會刪除專案本身，但不會自動刪除其下的標單資料，請謹慎操作！`)) {
            return;
        }

        try {
            showLoading(true, '刪除專案中...');
            await db.collection('projects').doc(projectId).delete();
            showAlert('專案刪除成功！', 'success');
            // 重新載入列表以反映變更
            loadAndRenderProjects();
        } catch (error) {
            console.error("❌ 刪除專案失敗:", error);
            showAlert("刪除專案失敗: " + error.message, 'error');
            showLoading(false);
        }
    }

    // --- 輔助函數 ---
    function showLoading(isLoading) {
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (!isLoading) {
            // 載入完成後，由 loadAndRenderProjects 決定顯示哪個區塊
        } else {
            if(container) container.style.display = 'none';
            if(emptyStateEl) emptyStateEl.style.display = 'none';
        }
    }

    function getStatusText(status) {
        const statusMap = { 'planning': '規劃中', 'active': '進行中', 'completed': '已完成', 'paused': '暫停' };
        return statusMap[status] || '未設定';
    }

    // --- 啟動頁面 ---
    loadAndRenderProjects();
}
