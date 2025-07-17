/**
 * 追蹤項目設定 (tenders-tracking-setup.js) - v2.0 (權限系統整合)
 */
function initTenderTrackingSetupPage() {

    function initializePageForUser(currentUser) {
        const db = firebase.firestore();
        const ui = { projectSelect: document.getElementById('projectSelect'), tenderSelect: document.getElementById('tenderSelect'), majorItemSelect: document.getElementById('majorItemSelect'), mainContent: document.getElementById('mainContent'), emptyState: document.getElementById('emptyState'), tableHeader: document.getElementById('tableHeader'), tableBody: document.getElementById('tableBody'), itemsListHeader: document.getElementById('items-list-header'), saveBtn: document.getElementById('save-settings-btn'), checkAllBtn: document.getElementById('check-all-btn'), uncheckAllBtn: document.getElementById('uncheck-all-btn') };
        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let selectedProject = null, selectedMajorItem = null;
        let currentUserRole = null, currentUserPermissions = {};

        async function loadProjectsWithPermission() {
            try {
                const allMyProjects = await loadProjects();
                const userEmail = currentUser.email;
                projects = allMyProjects.filter(project => {
                    const memberInfo = project.members[userEmail];
                    return memberInfo && (memberInfo.role === 'owner' || (memberInfo.role === 'editor' && memberInfo.permissions.canAccessTenders));
                });
                ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
                projects.forEach(project => ui.projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`);
            } catch (error) {
                console.error("❌ 讀取專案失敗:", error);
                ui.projectSelect.innerHTML = '<option value="">讀取專案失敗</option>';
            }
        }

        async function onMajorItemChange() {
            const majorItemId = ui.majorItemSelect.value;
            if (!majorItemId) { showMainContent(false); return; }
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);

            // 【權限守衛】
            const memberInfo = selectedProject.members[currentUser.email];
            currentUserRole = memberInfo.role;
            currentUserPermissions = memberInfo.permissions || {};
            const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders);

            if (!canAccess) {
                showAlert('您沒有權限設定此專案的追蹤項目', 'error');
                showMainContent(false);
                return;
            }

            ui.itemsListHeader.textContent = `標單項目列表：${selectedMajorItem.name}`;
            await loadDetailItems(majorItemId);
            renderItemsTable();
            showMainContent(true);
        }

        async function saveSettings() {
            // 【權限守衛】
            const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders);
            if (!canAccess) return showAlert('權限不足，無法儲存', 'error');

            ui.saveBtn.disabled = true;
            ui.saveBtn.innerHTML = `💾 儲存中...`;
            try {
                const batch = db.batch();
                const switches = ui.tableBody.querySelectorAll('input[type="checkbox"]');
                switches.forEach(sw => {
                    const docRef = db.collection('detailItems').doc(sw.dataset.itemId);
                    batch.update(docRef, { excludeFromProgress: !sw.checked });
                });
                await batch.commit();
                alert('✅ 設定已成功儲存！');
            } catch (error) {
                console.error("❌ 儲存設定時發生錯誤:", error);
                alert('儲存失敗，請查看主控台錯誤訊息。');
            } finally {
                ui.saveBtn.disabled = false;
                ui.saveBtn.innerHTML = `💾 儲存設定`;
            }
        }
        
        function onProjectChange() {
            const projectId = ui.projectSelect.value;
            ui.tenderSelect.disabled = true;
            ui.majorItemSelect.disabled = true;
            showMainContent(false);
            if (!projectId) return;
            selectedProject = projects.find(p => p.id === projectId); // 儲存選中的專案
            loadTenders(projectId);
        }
        
        // --- 其他所有函式維持不變 ---
        async function loadTenders(projectId) { ui.tenderSelect.innerHTML = '<option value="">載入中...</option>'; ui.tenderSelect.disabled = true; try { const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]); tenders = tenderDocs.docs; ui.tenderSelect.innerHTML = '<option value="">請選擇標單...</option>'; tenders.forEach(tender => { ui.tenderSelect.innerHTML += `<option value="${tender.id}">${tender.name}</option>`; }); ui.tenderSelect.disabled = false; } catch (error) { console.error("❌ 讀取標單失敗:", error); ui.tenderSelect.innerHTML = '<option value="">載入失敗</option>'; } }
        async function loadMajorItems(tenderId) { ui.majorItemSelect.innerHTML = '<option value="">載入中...</option>'; ui.majorItemSelect.disabled = true; try { const majorItemDocs = await safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }]); majorItems = majorItemDocs.docs; ui.majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>'; majorItems.forEach(item => { ui.majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`; }); ui.majorItemSelect.disabled = false; } catch (error) { console.error("❌ 載入大項目失敗:", error); ui.majorItemSelect.innerHTML = '<option value="">載入失敗</option>'; } }
        async function loadDetailItems(majorItemId) { const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]); if (typeof naturalSequenceSort === 'function') { detailItems = detailItemDocs.docs.sort(naturalSequenceSort); } else { detailItems = detailItemDocs.docs; } }
        function renderItemsTable() { ui.tableHeader.innerHTML = `<tr><th style="width: 5%;">項次</th><th style="width: 55%;">項目名稱</th><th style="width: 10%;">單位</th><th style="width: 10%;">數量</th><th style="width: 20%;">進度追蹤</th></tr>`; ui.tableBody.innerHTML = ''; if (detailItems.length === 0) { ui.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">此大項目下沒有可設定的施工細項。</td></tr>'; return; } detailItems.forEach(item => { const row = ui.tableBody.insertRow(); row.innerHTML = `<td style="text-align: center;">${item.sequence || ''}</td><td>${item.name || ''}</td><td style="text-align: center;">${item.unit || ''}</td><td style="text-align: right;">${item.totalQuantity || 0}</td><td style="text-align: center;"><label class="toggle-switch" style="display: inline-block; vertical-align: middle;"><input type="checkbox" role="switch" data-item-id="${item.id}" ${!item.excludeFromProgress ? 'checked' : ''}><span class="slider"></span></label></td>`; }); }
        function toggleAllSwitches(checkedState) { ui.tableBody.querySelectorAll('input[type="checkbox"]').forEach(sw => sw.checked = checkedState); }
        function showMainContent(shouldShow) { ui.mainContent.style.display = shouldShow ? 'block' : 'none'; ui.emptyState.style.display = shouldShow ? 'none' : 'flex'; }
        function onTenderChange() { const tenderId = ui.tenderSelect.value; ui.majorItemSelect.disabled = true; showMainContent(false); if (!tenderId) return; loadMajorItems(tenderId); }
        function setupEventListeners() { ui.projectSelect.addEventListener('change', onProjectChange); ui.tenderSelect.addEventListener('change', onTenderChange); ui.majorItemSelect.addEventListener('change', onMajorItemChange); ui.saveBtn.addEventListener('click', saveSettings); ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true)); ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false)); }
        showMainContent(false);
        setupEventListeners();
        loadProjectsWithPermission();
    }

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            initializePageForUser(user);
        } else {
            console.error("❌ Firebase Auth: 使用者未登入，無法初始化頁面。");
            alert("錯誤：您的登入狀態已失效，請重新整理頁面或登入。");
        }
    });
}
