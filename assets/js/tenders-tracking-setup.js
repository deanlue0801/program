// assets/js/tracking-setup.js

function initTrackingSetupPage() {
    // 檢查 currentUser 是否存在，這是您系統的必要前提
    if (typeof currentUser === 'undefined' || !currentUser.email) {
        console.error("❌ 無法獲取當前使用者資訊！頁面無法初始化。");
        alert("錯誤：無法獲取用戶資訊，請重新登入。");
        return;
    }

    const db = firebase.firestore();

    // 集中管理所有頁面上的 HTML 元素
    const ui = {
        projectSelect: document.getElementById('projectSelect'),
        tenderSelect: document.getElementById('tenderSelect'),
        majorItemSelect: document.getElementById('majorItemSelect'),
        itemsListContainer: document.getElementById('items-list-container'),
        itemsListHeader: document.getElementById('items-list-header'),
        saveBtn: document.getElementById('save-settings-btn'),
        checkAllBtn: document.getElementById('check-all-btn'),
        uncheckAllBtn: document.getElementById('uncheck-all-btn')
    };

    // 頁面級別的變數，用來儲存從資料庫讀取的資料
    let projects = [], tenders = [], allDetailItems = [];
    let selectedTender = null;

    // --- 【移植】完全複製您 distribution.js 的資料載入函式 ---

    async function loadProjects() {
        try {
            // 使用您成功的 safeFirestoreQuery 函式，並加上 email 篩選
            const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            projects = projectDocs.docs; // 直接儲存 docs
            
            // 填充下拉選單
            ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            projects.forEach(project => {
                ui.projectSelect.innerHTML += `<option value="${project.id}">${project.data().name}</option>`;
            });
            ui.projectSelect.disabled = false;
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

    // --- 針對此頁面客製化的函式 ---

    function renderItemsList(items) {
        ui.itemsListContainer.innerHTML = '';
        if (items.length === 0) {
            ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">此大項目下沒有可設定的施工細項。</div>';
            return;
        }

        items.forEach(itemData => {
            const item = itemData.data(); // 取得文件資料
            const itemId = itemData.id;    // 取得文件 ID

            const listItem = document.createElement('label');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            listItem.style.cursor = 'pointer';

            listItem.innerHTML = `
                <span>${item.name} (${item.unit || '-'})</span>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" data-item-id="${itemId}" ${!item.excludeFromProgress ? 'checked' : ''}>
                </div>
            `;
            ui.itemsListContainer.appendChild(listItem);
        });
    }

    async function saveSettings() {
        ui.saveBtn.disabled = true;
        ui.saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`;

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
            ui.saveBtn.innerHTML = `<i class="fas fa-save me-1"></i> 儲存設定`;
        }
    }

    function toggleAllSwitches(checkedState) {
        const switches = ui.itemsListContainer.querySelectorAll('.form-check-input');
        switches.forEach(sw => sw.checked = checkedState);
    }

    // --- 事件處理函式 ---

    function onProjectChange() {
        const projectId = ui.projectSelect.value;
        ui.tenderSelect.disabled = true;
        ui.tenderSelect.innerHTML = '<option value="">請先選擇專案</option>';
        ui.majorItemSelect.disabled = true;
        ui.majorItemSelect.innerHTML = '<option value="">請先選擇標單</option>';
        ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇標單...</div>';
        if (!projectId) return;
        loadTenders(projectId);
    }

    async function onTenderChange() {
        const tenderId = ui.tenderSelect.value;
        ui.majorItemSelect.disabled = true;
        ui.majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇大項目...</div>';
        if (!tenderId) return;

        selectedTender = tenders.find(t => t.id === tenderId);
        
        try {
            const detailItemsSnapshot = await db.collection('detailItems').where('tenderId', '==', tenderId).orderBy('order').get();
            allDetailItems = detailItemsSnapshot.docs;
            
            const majorItems = [...new Set(allDetailItems.map(item => item.data().majorItemName).filter(Boolean))];
            
            ui.majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(name => {
                ui.majorItemSelect.innerHTML += `<option value="${name}">${name}</option>`;
            });
            ui.majorItemSelect.disabled = false;
        } catch (error) {
             console.error("❌ 讀取大項目失敗:", error);
             ui.majorItemSelect.innerHTML = '<option value="">讀取失敗</option>';
        }
    }

    function onMajorItemChange() {
        const selectedMajorItemName = ui.majorItemSelect.value;
        if (!selectedMajorItemName) return;

        ui.itemsListHeader.textContent = `設定列表：${selectedMajorItemName}`;
        const itemsToDisplay = allDetailItems.filter(item => item.data().majorItemName === selectedMajorItemName);
        renderItemsList(itemsToDisplay);

        const hasItems = itemsToDisplay.length > 0;
        ui.saveBtn.disabled = !hasItems;
        ui.checkAllBtn.disabled = !hasItems;
        ui.uncheckAllBtn.disabled = !hasItems;
    }

    // --- 主流程啟動點 (同樣模仿您的成功模式) ---

    function setupEventListeners() {
        ui.projectSelect.addEventListener('change', onProjectChange);
        ui.tenderSelect.addEventListener('change', onTenderChange);
        ui.majorItemSelect.addEventListener('change', onMajorItemChange);
        ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
        ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
        ui.saveBtn.addEventListener('click', saveSettings);
    }

    async function initializePage() {
        console.log("🚀 初始化『批次追蹤設定』頁面 (v3.0 - 採用 distribution 模式)");
        setupEventListeners();
        await loadProjects(); // 初始化時，只載入專案列表
    }

    // *** 最終執行啟動點 ***
    initializePage();
}
