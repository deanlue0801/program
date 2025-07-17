/**
 * 編輯專案頁面 (projects-edit.js) - v3.0 (權限 Map 結構)
 */
function initProjectEditPage() {
    let projectId = null, currentProjectData = {}, currentUserRole = null;
    const form = document.getElementById('projectEditForm');
    const pageTitleEl = document.querySelector('.page-title');
    const memberManagementSection = document.getElementById('memberManagementSection');
    const membersTableBody = document.getElementById('membersTableBody');
    const newMemberEmailInput = document.getElementById('newMemberEmail');
    const newMemberRoleSelect = document.getElementById('newMemberRole');
    const permissionsContainer = document.getElementById('permissionsContainer');
    const addMemberBtn = document.getElementById('addMemberBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const permissionAlert = document.getElementById('permissionAlert');

    async function loadPageData() {
        showLoading(true);
        projectId = new URLSearchParams(window.location.search).get('id');
        if (!projectId) {
            showAlert('無效的專案ID', 'error');
            return navigateTo('/program/projects/list');
        }
        try {
            const projectDoc = await db.collection('projects').doc(projectId).get();
            if (!projectDoc.exists) {
                showAlert('找不到指定的專案', 'error');
                return navigateTo('/program/projects/list');
            }
            currentProjectData = { id: projectDoc.id, ...projectDoc.data() };
            if (!currentProjectData.memberEmails.includes(auth.currentUser.email)) {
                showAlert('您沒有權限查看此專案', 'error');
                return navigateTo('/program/projects/list');
            }
            populateForm(currentProjectData);
            renderMembersTable();
            setupEventListeners();
            setupUIPermissions();
            showLoading(false);
        } catch (error) {
            console.error("載入專案資料失敗:", error);
            showAlert("載入專案資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    function setupUIPermissions() {
        const userMemberInfo = currentProjectData.members[auth.currentUser.email];
        currentUserRole = userMemberInfo ? userMemberInfo.role : null;
        const canEdit = currentUserRole === 'owner';
        if (!canEdit) {
            form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
            saveChangesBtn.style.display = 'none';
            memberManagementSection.style.display = 'none';
            permissionAlert.style.display = 'block';
        }
    }

    function renderMembersTable() {
        membersTableBody.innerHTML = '';
        for (const email in currentProjectData.members) {
            const member = currentProjectData.members[email];
            const tr = document.createElement('tr');
            const roleText = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' }[member.role] || member.role;
            tr.innerHTML = `<td>${email}</td><td><span class="status-badge ${member.role}">${roleText}</span></td><td>${member.role !== 'owner' ? `<button type="button" class="btn btn-sm btn-danger" data-action="remove-member" data-email="${email}">移除</button>` : '—'}</td>`;
            membersTableBody.appendChild(tr);
        }
    }

    async function handleAddMember() {
        const email = newMemberEmailInput.value.trim().toLowerCase();
        const role = newMemberRoleSelect.value;
        if (!email) return showAlert('請輸入成員的 Email', 'warning');
        if (currentProjectData.memberEmails.includes(email)) return showAlert('該成員已在專案中', 'warning');

        const newMember = { role };
        if (role === 'editor') {
            newMember.permissions = {};
            permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                newMember.permissions[cb.dataset.permission] = cb.checked;
            });
        }
        
        const updatedMembers = { ...currentProjectData.members, [email]: newMember };
        const updatedMemberEmails = [...currentProjectData.memberEmails, email];

        try {
            showLoading(true, '新增成員中...');
            await db.collection('projects').doc(projectId).update({ members: updatedMembers, memberEmails: updatedMemberEmails, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            currentProjectData.members = updatedMembers;
            currentProjectData.memberEmails = updatedMemberEmails;
            showAlert('成員新增成功！', 'success');
            renderMembersTable();
            newMemberEmailInput.value = '';
        } catch (error) {
            console.error("新增成員失敗:", error);
            showAlert("新增成員失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }
    
    async function handleRemoveMember(emailToRemove) {
        if (!confirm(`確定要從專案中移除成員「${emailToRemove}」嗎？`)) return;
        const updatedMembers = { ...currentProjectData.members };
        delete updatedMembers[emailToRemove];
        const updatedMemberEmails = currentProjectData.memberEmails.filter(e => e !== emailToRemove);
        try {
            showLoading(true, '移除成員中...');
            await db.collection('projects').doc(projectId).update({ members: updatedMembers, memberEmails: updatedMemberEmails, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            currentProjectData.members = updatedMembers;
            currentProjectData.memberEmails = updatedMemberEmails;
            showAlert('成員移除成功！', 'success');
            renderMembersTable();
        } catch (error) {
            console.error("移除成員失敗:", error);
            showAlert("移除成員失敗: " + error.message, "error");
            loadPageData();
        } finally {
            showLoading(false);
        }
    }
    
    function setupEventListeners() {
        if (form.dataset.initialized) return;
        form.dataset.initialized = 'true';
        form.addEventListener('submit', handleFormSubmit);
        cancelBtn.addEventListener('click', () => navigateTo('/program/projects/list'));
        addMemberBtn.addEventListener('click', handleAddMember);
        newMemberRoleSelect.addEventListener('change', () => { permissionsContainer.style.display = newMemberRoleSelect.value === 'editor' ? 'block' : 'none'; });
        membersTableBody.addEventListener('click', e => { if (e.target.dataset.action === 'remove-member') handleRemoveMember(e.target.dataset.email); });
    }
    
    async function handleFormSubmit(e) {
        e.preventDefault();
        const updatedData = {
            name: document.getElementById('projectName').value.trim(),
            code: document.getElementById('projectCode').value.trim(),
            status: document.getElementById('statusSelect').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (!updatedData.name) return showAlert("專案名稱為必填項", "error");
        try {
            showLoading(true, '儲存中...');
            await db.collection('projects').doc(projectId).update(updatedData);
            showAlert("專案資料更新成功！", "success");
            navigateTo(`/program/projects/list`);
        } catch (error) {
            console.error("更新專案失敗:", error);
            showAlert("更新失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    function populateForm(project) {
        if (pageTitleEl) pageTitleEl.textContent = `✏️ 編輯專案：${project.name || ''}`;
        document.getElementById('projectName').value = project.name || '';
        document.getElementById('projectCode').value = project.code || '';
        document.getElementById('statusSelect').value = project.status || 'planning';
        const startDateEl = document.getElementById('startDate');
        if(startDateEl) startDateEl.value = safeFormatDateForInput(project.startDate);
        const endDateEl = document.getElementById('endDate');
        if(endDateEl) endDateEl.value = safeFormatDateForInput(project.endDate);
        const contractorNameEl = document.getElementById('contractorName');
        if(contractorNameEl) contractorNameEl.value = project.contractorName || '';
        const contractorContactEl = document.getElementById('contractorContact');
        if(contractorContactEl) contractorContactEl.value = project.contractorContact || '';
        const descriptionEl = document.getElementById('description');
        if(descriptionEl) descriptionEl.value = project.description || '';
        const notesEl = document.getElementById('notes');
        if(notesEl) notesEl.value = project.notes || '';
    }

    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        const formEl = document.getElementById('projectEditForm');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) loadingEl.querySelector('p').textContent = message;
        }
        if (formEl) {
            formEl.style.display = isLoading ? 'none' : 'block';
        }
    }

    function safeFormatDateForInput(dateField) {
        if (!dateField) return '';
        const date = dateField.toDate ? dateField.toDate() : new Date(dateField);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    }
    
    loadPageData();
}
