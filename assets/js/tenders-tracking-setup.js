// assets/js/tracking-setup.js (vFinal - 採用您的設計)

function initTenderTrackingSetupPage() {

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            initializePageForUser(user);
        } else {
            console.error("❌ Firebase Auth: 使用者未登入，無法初始化頁面。");
            alert("錯誤：您的登入狀態已失效，請重新整理頁面或登入。");
        }
    });

    async function initializePageForUser(currentUser) {

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
        let selectedMajorItem = null;

        async function loadProjects() {
            try {
                const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
                projects = projectDocs.docs;
                ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
                projects.forEach(project => {
                    ui.projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
                });
            } catch (error) {
                console.error("❌ 讀取專案失敗:", error);
                ui.projectSelect.innerHTML = '<option value="">讀取專案失敗</option>';
            }
        }

        async function loadTenders(projectId) {
            ui.tenderSelect.innerHTML = '<option value="">載入中...</option>';
            ui.tenderSelect.disabled = true;
            try {
                const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }, { field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
                tenders = tenderDocs.docs;
                ui.tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
                tenders.forEach(tender => {
                    ui.tenderSelect.innerHTML += `<option value="${tender.id}">${tender.name}</option>`;
                });
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
                const majorItemDocs = await safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" });
                majorItems = majorItemDocs.docs;
                ui.majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
                majorItems.forEach(item => {
                    ui.majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`;
                });
                ui.majorItemSelect.disabled = false;
            } catch (error) {
                console.error("❌ 載入大項目失敗:", error);
                ui.majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }
        
        async function loadDetailItems(majorItemId) {
            const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]);
            if (typeof naturalSequenceSort === 'function') {
                detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
            } else {
                detailItems = detailItemDocs.docs;
            }
        }

        // --- 【核心修改】渲染成表格 (Table) ---
        function renderItemsTable() {
            // 設定表格標頭
            ui.tableHeader.innerHTML = `
                <tr>
                    <th style="width: 8%;">項次</th>
                    <th style="width: 42%;">項目名稱</th>
                    <th style="width: 10%;">單位</th>
                    <th style="width: 10%;">數量</th>
                    <th style="width: 15%;">單價</th>
                    <th style="width: 15%;">複價</th>
                    <th style="width: 10%;">進度追蹤</th>
                </tr>
            `;

            // 清空表格內容
            ui.tableBody.innerHTML = '';
            if (detailItems.length === 0) {
                ui.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">此大項目下沒有可設定的施工細項。</td></tr>';
                return;
            }

            // 產生每一行
            detailItems.forEach(itemDoc => {
                const item = itemDoc.data() || itemDoc;
                const row = ui.tableBody.insertRow();
                row.innerHTML = `
                    <td>${item.sequence || ''}</td>
                    <td>${item.name || ''}</td>
                    <td>${item.unit || ''}</td>
                    <td style="text-align: right;">${item.totalQuantity || 0}</td>
                    <td style="text-align: right;">${(item.unitPrice || 0).toLocaleString()}</td>
                    <td style="text-align: right;">${(item.totalPrice || 0).toLocaleString()}</td>
                    <td style="text-align: center;">
                        <label class="toggle-switch">
                            <input type="checkbox" role="switch" data-item-id="${itemDoc.id}" ${!item.excludeFromProgress ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                `;
            });
        }

        async function saveSettings() {
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
        
        function toggleAllSwitches(checkedState) {
            ui.tableBody.querySelectorAll('input[type="checkbox"]').forEach(sw => sw.checked = checkedState);
        }

        function showMainContent(shouldShow) {
            ui.mainContent.style.display = shouldShow ? 'block' : 'none';
            ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
        }

        async function onMajorItemChange() {
            const majorItemId = ui.majorItemSelect.value;
            if (!majorItemId) { showMainContent(false); return; }
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);
            ui.itemsListHeader.textContent = `標單項目列表：${selectedMajorItem.name}`;
            await loadDetailItems(majorItemId);
            renderItemsTable(); // 改為呼叫渲染表格的函式
            showMainContent(true);
        }

        function onTenderChange() {
            const tenderId = ui.tenderSelect.value;
            ui.majorItemSelect.disabled = true;
            showMainContent(false);
            if (!tenderId) return;
            loadMajorItems(tenderId);
        }

        function onProjectChange() {
            const projectId = ui.projectSelect.value;
            ui.tenderSelect.disabled = true;
            ui.majorItemSelect.disabled = true;
            showMainContent(false);
            if (!projectId) return;
            loadTenders(projectId);
        }

        function setupEventListeners() {
            ui.projectSelect.addEventListener('change', onProjectChange);
            ui.tenderSelect.addEventListener('change', onTenderChange);
            ui.majorItemSelect.addEventListener('change', onMajorItemChange);
            ui.saveBtn.addEventListener('click', saveSettings);
            ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
            ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
        }

        // --- 主流程啟動點 ---
        showMainContent(false);
        setupEventListeners();
        await loadProjects();
    }
}
