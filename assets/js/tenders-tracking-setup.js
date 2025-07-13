// assets/js/tracking-setup.js (v6.1 - Correct Function Name)

// 【核心修正】將函式名稱更正為 router.js 中指定的 initTenderTrackingSetupPage
function initTenderTrackingSetupPage() {

    // 使用 onAuthStateChanged 來「監聽」Firebase 的使用者狀態，確保在正確的時機執行
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // ✅ Firebase 確認使用者已登入，現在才真正開始執行我們的頁面邏輯。
            initializePageForUser(user);
        } else {
            // ❌ Firebase 確認使用者未登入。
            console.error("❌ Firebase Auth: 使用者未登入，無法初始化頁面。");
            alert("錯誤：您的登入狀態已失效，請重新整理頁面或登入。");
        }
    });

    // 這個函式只有在 Firebase 確認使用者已登入後，才會被呼叫。
    async function initializePageForUser(currentUser) {

        console.log("🚀 初始化『批次追蹤設定』頁面 (v6.1 - 採用正確函式名稱)");

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

        async function loadProjects() {
            try {
                const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
                projects = projectDocs.docs;
                ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
                projects.forEach(project => {
                    ui.projectSelect.innerHTML += `<option value="${project.id}">${project.data().name}</option>`;
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
                    ui.tenderSelect.innerHTML += `<option value="${tender.id}">${tender.data().name}</option>`;
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
                    ui.majorItemSelect.innerHTML += `<option value="${item.id}">${item.data().name}</option>`;
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

        function renderItemsList() {
            ui.itemsListContainer.innerHTML = '';
            if (detailItems.length === 0) {
                ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">此大項目下沒有可設定的施工細項。</div>';
                return;
            }
            detailItems.forEach(itemDoc => {
                const item = itemDoc.data();
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
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);
            ui.itemsListHeader.textContent = `設定列表：${selectedMajorItem.data().name}`;
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

        showMainContent(false);
        setupEventListeners();
        await loadProjects();
    }
}
