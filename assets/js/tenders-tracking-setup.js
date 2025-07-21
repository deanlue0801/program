/**
 * 追蹤項目設定 (tenders-tracking-setup.js) - v2.2 (排序最終修正版)
 */
function initTenderTrackingSetupPage() {

    // --- 頁面級別變數 ---
    const db = firebase.firestore();
    const ui = {
        projectSelect: document.getElementById('projectSelect'),
        tenderSelect: document.getElementById('tenderSelect'),
        majorItemSelect: document.getElementById('majorItemSelect'),
        mainContent: document.getElementById('mainContent'),
        emptyState: document.getElementById('emptyState'),
        tableHeader: document.getElementById('tableHeader'),
        tableBody: document.getElementById('tableBody'),
        itemsListHeader: document.getElementById('items-list-header'),
        saveBtn: document.getElementById('save-settings-btn'),
        checkAllBtn: document.getElementById('check-all-btn'),
        uncheckAllBtn: document.getElementById('uncheck-all-btn')
    };
    let projects = [], tenders = [], majorItems = [], detailItems = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null;
    let currentUserRole = null, currentUserPermissions = {};
    const currentUser = firebase.auth().currentUser;

    if (!currentUser) {
        showAlert("錯誤：您的登入狀態已失效，請重新整理頁面或登入。", "error");
        return;
    }

    // --- 【核心修正】將排序函數內建於此檔案中 ---
    function naturalSequenceSort(a, b) {
        const re = /(\d+(\.\d+)?)|(\D+)/g;
        const pA = String(a.sequence || '').match(re) || [];
        const pB = String(b.sequence || '').match(re) || [];
        for (let i = 0; i < Math.min(pA.length, pB.length); i++) {
            const nA = parseFloat(pA[i]);
            const nB = parseFloat(pB[i]);
            if (!isNaN(nA) && !isNaN(nB)) {
                if (nA !== nB) return nA - nB;
            } else if (pA[i] !== pB[i]) {
                return pA[i].localeCompare(pB[i]);
            }
        }
        return pA.length - pB.length;
    }

    // --- 初始化流程 ---
    async function initializePage() {
        console.log("🚀 初始化追蹤項目設定頁面 (v2.2)...");
        showMainContent(false);
        setupEventListeners();
        await loadProjectsWithPermission();
    }

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

    // --- 事件處理函式 ---
    function onProjectChange() {
        const projectId = ui.projectSelect.value;
        ui.tenderSelect.disabled = true;
        ui.majorItemSelect.disabled = true;
        showMainContent(false);
        if (!projectId) {
            selectedProject = null;
            return;
        }
        selectedProject = projects.find(p => p.id === projectId);
        loadTenders(projectId);
    }

    function onTenderChange() {
        const tenderId = ui.tenderSelect.value;
        ui.majorItemSelect.disabled = true;
        showMainContent(false);
        if (!tenderId) {
            selectedTender = null;
            return;
        }
        selectedTender = tenders.find(t => t.id === tenderId);
        loadMajorItems(tenderId);
    }

    async function onMajorItemChange() {
        const majorItemId = ui.majorItemSelect.value;
        if (!majorItemId) {
            showMainContent(false);
            return;
        }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);

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
    
    // --- 資料讀取 ---
    async function loadTenders(projectId) {
        ui.tenderSelect.innerHTML = '<option value="">載入中...</option>';
        ui.tenderSelect.disabled = true;
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
            tenders = tenderDocs.docs;
            ui.tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
            tenders.forEach(tender => { ui.tenderSelect.innerHTML += `<option value="${tender.id}">${tender.name}</option>`; });
            ui.tenderSelect.disabled = false;
        } catch (error) {
            console.error("❌ 讀取標單失敗:", error);
            ui.tenderSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    async function loadMajorItems(tenderId) {
        ui.majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        ui.majorItemSelect.disabled = true;
        try {
            const majorItemDocs = await safeFirestoreQuery("majorItems", [
                { field: "tenderId", operator: "==", value: tenderId },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            majorItems = majorItemDocs.docs;
            ui.majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(item => { ui.majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`; });
            ui.majorItemSelect.disabled = false;
        } catch (error) {
            console.error("❌ 載入大項目失敗:", error);
            showAlert('載入大項目失敗: ' + error.message, 'error');
            ui.majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    async function loadDetailItems(majorItemId) {
        const detailItemDocs = await safeFirestoreQuery("detailItems", [
            { field: "majorItemId", operator: "==", value: majorItemId },
            { field: "projectId", operator: "==", value: selectedProject.id }
        ]);
        
        // 【核心修正】直接使用內建的排序函數，不再需要檢查
        detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
    }
    
    // --- 儲存與UI渲染 ---
    async function saveSettings() {
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
            showAlert('✅ 設定已成功儲存！', 'success');
        } catch (error) {
            console.error("❌ 儲存設定時發生錯誤:", error);
            showAlert('儲存失敗，請查看主控台錯誤訊息。', 'error');
        } finally {
            ui.saveBtn.disabled = false;
            ui.saveBtn.innerHTML = `💾 儲存設定`;
        }
    }
    
    function renderItemsTable() {
        ui.tableHeader.innerHTML = `<tr><th style="width: 5%;">項次</th><th style="width: 55%;">項目名稱</th><th style="width: 10%;">單位</th><th style="width: 10%;">數量</th><th style="width: 20%;">進度追蹤</th></tr>`;
        ui.tableBody.innerHTML = '';
        if (detailItems.length === 0) {
            ui.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">此大項目下沒有可設定的施工細項。</td></tr>';
            return;
        }
        detailItems.forEach(item => {
            const row = ui.tableBody.insertRow();
            row.innerHTML = `
                <td style="text-align: center;">${item.sequence || ''}</td>
                <td>${item.name || ''}</td>
                <td style="text-align: center;">${item.unit || ''}</td>
                <td style="text-align: right;">${item.totalQuantity || 0}</td>
                <td style="text-align: center;">
                    <label class="toggle-switch" style="display: inline-block; vertical-align: middle;">
                        <input type="checkbox" role="switch" data-item-id="${item.id}" ${!item.excludeFromProgress ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>`;
        });
    }

    function setupEventListeners() {
        ui.projectSelect.addEventListener('change', onProjectChange);
        ui.tenderSelect.addEventListener('change', onTenderChange);
        ui.majorItemSelect.addEventListener('change', onMajorItemChange);
        ui.saveBtn.addEventListener('click', saveSettings);
        ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
        ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
    }

    function toggleAllSwitches(checkedState) {
        ui.tableBody.querySelectorAll('input[type="checkbox"]').forEach(sw => sw.checked = checkedState);
    }
    
    function showMainContent(shouldShow) {
        ui.mainContent.style.display = shouldShow ? 'block' : 'none';
        ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
    }
    
    function showAlert(message, type) {
        // 假設您有一個全域的 showAlert 函數
        if(typeof window.showAlert === 'function') {
            window.showAlert(message, type);
        } else {
            alert(`[${type.toUpperCase()}] ${message}`);
        }
    }
    
    // --- 啟動頁面 ---
    initializePage();
}
