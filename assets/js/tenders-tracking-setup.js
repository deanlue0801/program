// assets/js/tenders-tracking-setup.js (v6.2 - The .data() Fix)

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

        console.log("🚀 初始化『批次追蹤設定』頁面 (v6.2 - 修正 .data() 錯誤)");

        const db = firebase.firestore();

        const ui = {
            projectSelect: document.getElementById('projectSelect'),
            tenderSelect: document.getElementById('tenderSelect'),
            majorItemSelect: document.getElementById('majorItemSelect'),
            mainContent: document.getElementById('mainContent'),
            emptyState: document.getElementById('emptyState'),
            itemsListContainer: document.getElementById('items-list-container'),
            itemsListHeader: document.getElementById('items-list-header'),
            saveBtn: document.getElementById('save-settings-btn'),
            checkAllBtn: document.getElementById('check-all-btn'),
            uncheckAllBtn: document.getElementById('uncheck-all-btn')
        };

        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let selectedMajorItem = null;

        // --- 資料載入函式 (已修正) ---

        async function loadProjects() {
            try {
                const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
                projects = projectDocs.docs;
                ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
                projects.forEach(project => {
                    // 【核心修正】直接使用 project.name，不再呼叫 .data()
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
                    // 【核心修正】直接使用 tender.name，不再呼叫 .data()
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
                    // 【核心修正】直接使用 item.name，不再呼叫 .data()
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

        // --- 核心功能函式 ---

        function renderItemsList() {
            ui.itemsListContainer.innerHTML = '';
            if (detailItems.length === 0) {
                ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">此大項目下沒有可設定的施工細項。</div>';
                return;
            }
            detailItems.forEach(itemDoc => {
                // 這裡因為是細項，我們還是需要 .data() 來取得裡面的欄位
                const item = itemDoc.data ? itemDoc.data() : itemDoc; 
                const listItem = document.createElement('label');
                listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                listItem.style.cursor = 'pointer';
                listItem.innerHTML = `
                    <span>${item.sequence || ''}. ${item.name} (${item.unit || '-'})</span>
                    <div class="form-check form-switch fs-5">
                        <input class="form-check-input" type="checkbox" role="switch" data-item-id="${itemDoc.id}" ${!item.excludeFromProgress ? 'checked' : ''}>
                    </div>
                `;
                ui.itemsListContainer.appendChild(listItem);
            });
        }

        async function saveSettings() {
            ui.saveBtn.disabled = true;
            ui.saveBtn.innerHTML = `💾 儲存中...`;
            try {
                const batch = db.batch();
                const switches = ui.itemsListContainer.querySelectorAll('.form-check-input');
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
        
        // --- 事件處理與輔助函式 ---
        
        function toggleAllSwitches(checkedState) {
            ui.itemsListContainer.querySelectorAll('.form-check-input').forEach(sw => sw.checked = checkedState);
        }

        function showMainContent(shouldShow) {
            ui.mainContent.style.display = shouldShow ? 'block' : 'none';
            ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
        }

        async function onMajorItemChange() {
            const majorItemId = ui.majorItemSelect.value;
            if (!majorItemId) { showMainContent(false); return; }
            // 【核心修正】
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);
            ui.itemsListHeader.textContent = `設定列表：${selectedMajorItem.name}`;
            await loadDetailItems(majorItemId);
            renderItemsList();
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
