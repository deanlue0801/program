// assets/js/tracking-setup.js

function initTrackingSetupPage() {
    // 偵錯訊息：確認函式已被 router.js 呼叫
    console.log("🚀 tracking-setup.js: initTrackingSetupPage() 函式已成功執行。");

    // 檢查 Firebase 是否已初始化，這是所有操作的前提
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error("❌ Firebase 尚未初始化，請檢查 firebase-config.js 的載入順序。");
        return;
    }

    const db = firebase.firestore();

    // 將所有頁面元素集中管理，方便存取
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

    let allTenders = [];
    let allDetailItems = [];

    // --- Helper Functions ---
    const populateSelect = (selectEl, options, placeholder) => {
        selectEl.innerHTML = `<option selected disabled value="">${placeholder}</option>`;
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.id;
            opt.textContent = option.name;
            selectEl.appendChild(opt);
        });
    };

    const resetSelect = (selectEl, placeholder) => {
        selectEl.innerHTML = `<option selected disabled value="">${placeholder}</option>`;
        selectEl.disabled = true;
    };

    // --- Event Handlers ---
    const setupEventListeners = () => {
        ui.projectSelect.addEventListener('change', onProjectSelect);
        ui.tenderSelect.addEventListener('change', onTenderSelect);
        ui.majorItemSelect.addEventListener('change', onMajorItemSelect);
        ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
        ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
        ui.saveBtn.addEventListener('click', saveSettings);
        console.log("✅ 所有頁面元素的事件監聽器已設定完成。");
    };

    const onProjectSelect = async (e) => {
        const projectId = e.target.value;
        if (!projectId) return;

        resetSelect(ui.tenderSelect, '載入中...');
        resetSelect(ui.majorItemSelect, '請先選擇標單');
        ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇標單...</div>';

        try {
            const tendersSnapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
            allTenders = tendersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateSelect(ui.tenderSelect, allTenders, '請選擇標單...');
            ui.tenderSelect.disabled = false;
        } catch (error) {
            console.error("❌ 讀取標單列表時發生錯誤:", error);
            resetSelect(ui.tenderSelect, '讀取標單失敗');
        }
    };

    const onTenderSelect = async (e) => {
        const tenderId = e.target.value;
        if (!tenderId) return;

        resetSelect(ui.majorItemSelect, '載入中...');
        ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇大項目...</div>';

        try {
            const detailItemsSnapshot = await db.collection('detailItems').where('tenderId', '==', tenderId).orderBy('order').get();
            allDetailItems = detailItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const majorItems = [...new Set(allDetailItems.filter(item => item.majorItemName).map(item => item.majorItemName))]
                               .map(name => ({ id: name, name: name }));
                               
            populateSelect(ui.majorItemSelect, majorItems, '請選擇大項目...');
            ui.majorItemSelect.disabled = false;
        } catch (error) {
            console.error("❌ 讀取細項列表時發生錯誤:", error);
            resetSelect(ui.majorItemSelect, '讀取大項失敗');
        }
    };

    const onMajorItemSelect = (e) => {
        const selectedMajorItem = e.target.value;
        if (!selectedMajorItem) return;

        ui.itemsListHeader.textContent = `設定列表：${selectedMajorItem}`;
        const itemsToDisplay = allDetailItems.filter(item => item.majorItemName === selectedMajorItem);
        renderItemsList(itemsToDisplay);
        
        ui.saveBtn.disabled = itemsToDisplay.length === 0;
        ui.checkAllBtn.disabled = itemsToDisplay.length === 0;
        ui.uncheckAllBtn.disabled = itemsToDisplay.length === 0;
    };

    const saveSettings = async () => {
        ui.saveBtn.disabled = true;
        ui.saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`;

        const batch = db.batch();
        const switches = ui.itemsListContainer.querySelectorAll('.form-check-input');
        switches.forEach(sw => {
            const docRef = db.collection('detailItems').doc(sw.dataset.itemId);
            batch.update(docRef, { excludeFromProgress: !sw.checked });
        });

        try {
            await batch.commit();
            alert('設定已成功儲存！');
        } catch (error) {
            console.error("❌ 儲存設定時發生錯誤:", error);
            alert('儲存失敗，請查看主控台錯誤訊息。');
        } finally {
            ui.saveBtn.disabled = false;
            ui.saveBtn.innerHTML = `<i class="fas fa-save me-1"></i> 儲存設定`;
        }
    };

    // --- Rendering Logic ---
    function renderItemsList(items) {
        ui.itemsListContainer.innerHTML = '';
        if (items.length === 0) {
            ui.itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">此大項目下沒有施工細項。</div>';
            return;
        }
        items.forEach(item => {
            const listItem = document.createElement('label');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            listItem.innerHTML = `
                <span>${item.name} (${item.unit})</span>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" data-item-id="${item.id}" ${!item.excludeFromProgress ? 'checked' : ''}>
                </div>
            `;
            ui.itemsListContainer.appendChild(listItem);
        });
    }

    function toggleAllSwitches(checkedState) {
        const switches = ui.itemsListContainer.querySelectorAll('.form-check-input');
        switches.forEach(sw => sw.checked = checkedState);
    }

    // --- Page Initialization ---
    // 這是模仿您成功頁面模式的核心函式
    async function initializePage() {
        console.log("🔄 開始執行頁面初始化 `initializePage()`...");
        resetSelect(ui.tenderSelect, '請先選擇專案');
        resetSelect(ui.majorItemSelect, '請先選擇標單');
        
        try {
            console.log("🔄 正在從 Firestore 讀取『專案』列表...");
            const projectsSnapshot = await db.collection('projects').get();
            
            if (projectsSnapshot.empty) {
                console.warn("⚠️ 'projects' 集合是空的，或沒有讀取權限。");
                populateSelect(ui.projectSelect, [], '沒有找到任何專案');
                ui.projectSelect.disabled = true;
                return;
            }

            const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`✅ 成功讀取並轉換了 ${projects.length} 個專案。`);
            
            populateSelect(ui.projectSelect, projects, '請選擇專案...');
            ui.projectSelect.disabled = false;
            
            // 最後才設定事件監聽，確保頁面已準備就緒
            setupEventListeners();

        } catch (error) {
            console.error("❌ 讀取『專案』列表時發生嚴重錯誤:", error);
            populateSelect(ui.projectSelect, [], '讀取專案時發生錯誤');
            ui.projectSelect.disabled = true;
        }
    }

    // 執行初始化
    initializePage();
}
