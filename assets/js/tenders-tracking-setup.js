/**
 * 追蹤項目設定 (tenders-tracking-setup.js) - v2.3 (執行時機修正版)
 * 解決在 SPA 路由下，腳本比 HTML 內容先執行的問題。
 */
function initTenderTrackingSetupPage() {
    console.log("🚀 初始化「施工追蹤項目設定」頁面 (v2.3)...");

    // 【新增】一個輔助函數，用來等待特定元素出現在頁面上
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback(); // 如果元素已存在，立即執行
            return;
        }
        // 如果不存在，則設定一個計時器持續檢查
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval); // 找到後就停止計時
                callback();              // 執行真正的初始化邏輯
            }
        }, 100);
    }

    // 【修改】將您所有的頁面邏輯，都包裹在 waitForElement 的回呼函式中
    // 我們等待頁面中最關鍵的元素之一 '#projectSelect' 出現後才繼續
    waitForElement('#projectSelect', () => {

        // --- 您原本的頁面級別變數 (維持不變) ---
        const db = firebase.firestore();
        // 【修改】將 ui 物件的定義移到這裡，確保 DOM 元素都已存在
        const ui = {
            projectSelect: document.getElementById('projectSelect'),
            tenderSelect: document.getElementById('tenderSelect'),
            majorItemSelect: document.getElementById('majorItemSelect'),
            mainContent: document.getElementById('mainContent'),
            emptyState: document.getElementById('emptyState'),
            tableBody: document.getElementById('tableBody'),
            // 舊版 HTML 的 ID 是 items-list-header，新版是 saveTrackingItemsBtn
            // 為了兼容，我們同時檢查並優先使用新的
            itemsListHeader: document.getElementById('items-list-header'),
            saveBtn: document.getElementById('saveTrackingItemsBtn') || document.getElementById('save-settings-btn'),
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

        // --- 您原本的所有函式 (維持不變) ---
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

        async function initializePage() {
            console.log("✅ 追蹤項目設定頁面 DOM 已就緒，開始執行核心邏輯...");
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

            if(ui.itemsListHeader) ui.itemsListHeader.textContent = `標單項目列表：${selectedMajorItem.name}`;
            await loadDetailItems(majorItemId);
            renderItemsTable();
            showMainContent(true);
        }
        
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
            
            detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
        }
        
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
            const tableHeader = document.querySelector('#trackingItemsTable thead');
            if(tableHeader) tableHeader.innerHTML = `<tr><th style="width: 10%;">項次</th><th>項目名稱</th><th style="width: 15%;">單位</th><th class="text-right" style="width: 15%;">數量</th><th style="width: 8%;">追蹤</th></tr>`;
        
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
                        <label class="toggle-switch">
                            <input type="checkbox" role="switch" data-item-id="${item.id}" ${!item.excludeFromProgress ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>`;
            });
        }

        function setupEventListeners() {
            // 現在 ui.saveBtn 絕對不會是 null
            if (ui.saveBtn) ui.saveBtn.addEventListener('click', saveSettings);
            if (ui.projectSelect) ui.projectSelect.addEventListener('change', onProjectChange);
            if (ui.tenderSelect) ui.tenderSelect.addEventListener('change', onTenderChange);
            if (ui.majorItemSelect) ui.majorItemSelect.addEventListener('change', onMajorItemChange);
            if (ui.checkAllBtn) ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
            if (ui.uncheckAllBtn) ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
        }

        function toggleAllSwitches(checkedState) {
            ui.tableBody.querySelectorAll('input[type="checkbox"]').forEach(sw => sw.checked = checkedState);
        }
        
        function showMainContent(shouldShow) {
            if(ui.mainContent) ui.mainContent.style.display = shouldShow ? 'block' : 'none';
            if(ui.emptyState) ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
        }
        
        function showAlert(message, type) {
            if(typeof window.showAlert === 'function') {
                window.showAlert(message, type);
            } else {
                alert(`[${type.toUpperCase()}] ${message}`);
            }
        }
        
        // --- 啟動頁面 ---
        initializePage();

    }); // waitForElement 的結尾
}
