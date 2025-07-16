/**
 * 編輯專案頁面 (projects-edit.js) - v2.0 (權限管理第二階段)
 * 實現了成員管理介面、操作邏輯與權限守衛功能。
 */
function initProjectEditPage() {
    console.log("🚀 初始化編輯專案頁面 (v2.0)...");

    // --- 全域變數與狀態管理 ---
    let projectId = null;
    let currentProjectData = {}; // 儲存當前專案的完整資料
    let currentUserRole = null; // 儲存當前登入者的角色

    // --- DOM 元素快取 ---
    const form = document.getElementById('projectEditForm');
    const pageTitleEl = document.querySelector('.page-title');
    const permissionAlert = document.getElementById('permissionAlert');
    const memberManagementSection = document.getElementById('memberManagementSection');
    const membersTableBody = document.getElementById('membersTableBody');
    const newMemberEmailInput = document.getElementById('newMemberEmail');
    const newMemberRoleSelect = document.getElementById('newMemberRole');
    const permissionsContainer = document.getElementById('permissionsContainer');
    const addMemberBtn = document.getElementById('addMemberBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const cancelBtn = document.getElementById('cancelBtn');


    // --- 主要流程 ---
    async function loadPageData() {
        showLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        projectId = urlParams.get('id');

        if (!projectId) {
            showAlert('無效的專案ID', 'error');
            return navigateTo('/program/tenders/list');
        }

        try {
            const projectDoc = await db.collection('projects').doc(projectId).get();

            if (!projectDoc.exists) {
                showAlert('找不到指定的專案', 'error');
                return navigateTo('/program/tenders/list');
            }
            
            currentProjectData = { id: projectDoc.id, ...projectDoc.data() };
            
            // 【權限守衛】檢查權限
            if (!checkAccessPermission()) {
                // 如果沒有存取權限，直接跳轉
                showAlert('您沒有權限查看此專案', 'error');
                return navigateTo('/program/tenders/list');
            }

            populateForm(currentProjectData);
            renderMembersTable();
            setupEventListeners();
            
            // 【權限守衛】根據角色設定 UI 狀態
            setupUIPermissions();
            
            showLoading(false);

        } catch (error) {
            console.error("載入專案資料失敗:", error);
            showAlert("載入專案資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    // --- 權限檢查與 UI 設定 ---
    function checkAccessPermission() {
        if (!auth.currentUser || !currentProjectData.memberEmails) {
            return false;
        }
        // 只要 email 在 memberEmails 列表中，就代表有權限「查看」
        return currentProjectData.memberEmails.includes(auth.currentUser.email);
    }

    function setupUIPermissions() {
        // 從 members 陣列中找到當前使用者的詳細資料
        const userMemberInfo = currentProjectData.members.find(m => m.email === auth.currentUser.email);
        currentUserRole = userMemberInfo ? userMemberInfo.role : null;

        // 只有 owner 才能編輯
        const canEdit = currentUserRole === 'owner';
        
        console.log(`[權限] 使用者角色: ${currentUserRole}, 是否可編輯: ${canEdit}`);

        if (!canEdit) {
            // 禁用所有表單元素
            form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
            // 隱藏儲存按鈕和成員管理區塊
            saveChangesBtn.style.display = 'none';
            memberManagementSection.style.display = 'none';
            // 顯示權限不足的提示
            permissionAlert.style.display = 'block';
        } else {
            // 確保有權限時，所有東西都是可見且可用的
            form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
            saveChangesBtn.style.display = 'inline-block';
            memberManagementSection.style.display = 'block';
            permissionAlert.style.display = 'none';
        }
    }

    // --- UI 渲染 ---
    function populateForm(project) {
        if (pageTitleEl) pageTitleEl.textContent = `✏️ 編輯專案：${project.name || ''}`;
        
        document.getElementById('projectName').value = project.name || '';
        document.getElementById('projectCode').value = project.code || '';
        document.getElementById('statusSelect').value = project.status || 'planning';
        document.getElementById('startDate').value = safeFormatDateForInput(project.startDate);
        document.getElementById('endDate').value = safeFormatDateForInput(project.endDate);
        document.getElementById('contractorName').value = project.contractorName || '';
        document.getElementById('contractorContact').value = project.contractorContact || '';
        document.getElementById('description').value = project.description || '';
        document.getElementById('notes').value = project.notes || '';
    }
    
    function renderMembersTable() {
        if (!membersTableBody) return;
        membersTableBody.innerHTML = ''; // 清空現有列表
        
        currentProjectData.members.forEach(member => {
            const tr = document.createElement('tr');
            const roleText = member.role === 'owner' ? '擁有者' : (member.role === 'editor' ? '編輯者' : '檢視者');
            
            tr.innerHTML = `
                <td>${member.email}</td>
                <td><span class="status-badge ${member.role}">${roleText}</span></td>
                <td>
                    ${member.role !== 'owner' ? `<button type="button" class="btn btn-sm btn-danger" data-action="remove-member" data-email="${member.email}">移除</button>` : '—'}
                </td>
            `;
            membersTableBody.appendChild(tr);
        });
    }

    // --- 事件監聽器設定 ---
    function setupEventListeners() {
        if (form.dataset.initialized === 'true') return;
        form.dataset.initialized = 'true';

        form.addEventListener('submit', handleFormSubmit);
        cancelBtn.addEventListener('click', cancelEdit);
        addMemberBtn.addEventListener('click', handleAddMember);
        newMemberRoleSelect.addEventListener('change', () => {
            permissionsContainer.style.display = newMemberRoleSelect.value === 'editor' ? 'block' : 'none';
        });
        
        // 使用事件委派處理移除按鈕的點擊
        membersTableBody.addEventListener('click', event => {
            if (event.target.dataset.action === 'remove-member') {
                const emailToRemove = event.target.dataset.email;
                handleRemoveMember(emailToRemove);
            }
        });
    }

    // --- 操作處理函式 ---
    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const updatedData = {
            name: document.getElementById('projectName').value.trim(),
            code: document.getElementById('projectCode').value.trim(),
            status: document.getElementById('statusSelect').value,
            startDate: document.getElementById('startDate').value ? new Date(document.getElementById('startDate').value) : null,
            endDate: document.getElementById('endDate').value ? new Date(document.getElementById('endDate').value) : null,
            contractorName: document.getElementById('contractorName').value.trim(),
            contractorContact: document.getElementById('contractorContact').value.trim(),
            description: document.getElementById('description').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!updatedData.name) return showAlert("專案名稱為必填項", "error");

        try {
            showLoading(true, '儲存中...');
            await db.collection('projects').doc(projectId).update(updatedData);
            showAlert("專案資料更新成功！", "success");
            navigateTo(`/program/tenders/list`);
        } catch (error) {
            console.error("更新專案失敗:", error);
            showAlert("更新失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }
    
    async function handleAddMember() {
        const email = newMemberEmailInput.value.trim().toLowerCase();
        const role = newMemberRoleSelect.value;
        
        if (!email) return showAlert('請輸入成員的 Email', 'warning');
        if (currentProjectData.memberEmails.includes(email)) return showAlert('該成員已在專案中', 'warning');

        const newMember = { email, role };
        if (role === 'editor') {
            newMember.permissions = {};
            permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                newMember.permissions[cb.dataset.permission] = cb.checked;
            });
        }
        
        // 更新本地資料
        currentProjectData.members.push(newMember);
        currentProjectData.memberEmails.push(email);

        // 儲存到 Firebase
        try {
            showLoading(true, '新增成員中...');
            await db.collection('projects').doc(projectId).update({
                members: currentProjectData.members,
                memberEmails: currentProjectData.memberEmails,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showAlert('成員新增成功！', 'success');
            renderMembersTable(); // 重新渲染列表
            newMemberEmailInput.value = ''; // 清空輸入框
        } catch (error) {
            console.error("新增成員失敗:", error);
            showAlert("新增成員失敗: " + error.message, "error");
            // 如果失敗，復原本地資料
            currentProjectData.members.pop();
            currentProjectData.memberEmails.pop();
        } finally {
            showLoading(false);
        }
    }
    
    async function handleRemoveMember(emailToRemove) {
        if (!confirm(`確定要從專案中移除成員「${emailToRemove}」嗎？`)) return;

        // 更新本地資料
        currentProjectData.members = currentProjectData.members.filter(m => m.email !== emailToRemove);
        currentProjectData.memberEmails = currentProjectData.memberEmails.filter(e => e !== emailToRemove);

        // 儲存到 Firebase
        try {
            showLoading(true, '移除成員中...');
            await db.collection('projects').doc(projectId).update({
                members: currentProjectData.members,
                memberEmails: currentProjectData.memberEmails,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showAlert('成員移除成功！', 'success');
            renderMembersTable(); // 重新渲染列表
        } catch (error) {
            console.error("移除成員失敗:", error);
            showAlert("移除成員失敗: " + error.message, "error");
            // 如果失敗，需要重新載入資料以同步狀態
            loadPageData();
        } finally {
            showLoading(false);
        }
    }

    function cancelEdit() {
        if (confirm('您確定要取消編輯嗎？所有未儲存的變更將會遺失。')) {
            navigateTo('/program/tenders/list');
        }
    }

    // --- 輔助函數 ---
    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) loadingEl.querySelector('p').textContent = message;
        }
        if (form) form.style.display = isLoading ? 'none' : 'block';
    }
    
    function safeFormatDateForInput(dateField) {
        if (!dateField) return '';
        const date = dateField.toDate ? dateField.toDate() : new Date(dateField);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    }

    // --- 啟動頁面 ---
    loadPageData();
}
