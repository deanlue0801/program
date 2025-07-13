// assets/js/tracking-setup.js

function initTrackingSetupPage() {
    console.log("🚀 開始初始化『批次追蹤設定』頁面...");

    const db = firebase.firestore();

    const projectSelect = document.getElementById('projectSelect');
    const tenderSelect = document.getElementById('tenderSelect');
    const majorItemSelect = document.getElementById('majorItemSelect');
    const itemsListContainer = document.getElementById('items-list-container');
    const itemsListHeader = document.getElementById('items-list-header');
    const saveBtn = document.getElementById('save-settings-btn');
    const checkAllBtn = document.getElementById('check-all-btn');
    const uncheckAllBtn = document.getElementById('uncheck-all-btn');

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

    // --- Event Listeners ---
    projectSelect.addEventListener('change', async () => {
        const projectId = projectSelect.value;
        resetSelect(tenderSelect, '載入中...');
        resetSelect(majorItemSelect, '請先選擇標單');
        itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇標單...</div>';
        
        const tendersSnapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
        allTenders = tendersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateSelect(tenderSelect, allTenders, '請選擇標單...');
        tenderSelect.disabled = false;
    });

    tenderSelect.addEventListener('change', async () => {
        const tenderId = tenderSelect.value;
        resetSelect(majorItemSelect, '載入中...');
        itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">請繼續選擇大項目...</div>';

        const detailItemsSnapshot = await db.collection('detailItems').where('tenderId', '==', tenderId).orderBy('order').get();
        allDetailItems = detailItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const majorItems = [...new Set(allDetailItems.filter(item => item.majorItemName).map(item => item.majorItemName))]
                           .map((name, index) => ({ id: name, name: name }));
                           
        populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
        majorItemSelect.disabled = false;
    });

    majorItemSelect.addEventListener('change', () => {
        const selectedMajorItem = majorItemSelect.value;
        itemsListHeader.textContent = `設定列表：${selectedMajorItem}`;
        
        const itemsToDisplay = allDetailItems.filter(item => item.majorItemName === selectedMajorItem);
        renderItemsList(itemsToDisplay);
        
        saveBtn.disabled = false;
        checkAllBtn.disabled = false;
        uncheckAllBtn.disabled = false;
    });

    checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
    uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
    
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`;

        const batch = db.batch();
        const switches = itemsListContainer.querySelectorAll('.form-check-input');
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
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fas fa-save me-1"></i> 儲存設定`;
        }
    });

    // --- Rendering Logic ---
    function renderItemsList(items) {
        itemsListContainer.innerHTML = '';
        if (items.length === 0) {
            itemsListContainer.innerHTML = '<div class="text-center text-muted p-5">此大項目下沒有施工細項。</div>';
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
            itemsListContainer.appendChild(listItem);
        });
    }

    function toggleAllSwitches(checkedState) {
        const switches = itemsListContainer.querySelectorAll('.form-check-input');
        switches.forEach(sw => sw.checked = checkedState);
    }

    // --- Page Initialization ---
    // 這是在頁面載入時，最先執行的區塊
    (async function initialize() {
        resetSelect(tenderSelect, '請先選擇專案');
        resetSelect(majorItemSelect, '請先選擇標單');
        
        try {
            console.log("🔄 正在從 Firestore 讀取『專案』列表...");
            const projectsSnapshot = await db.collection('projects').get();
            
            // 【偵錯點#1】我們在這裡檢查到底找到了幾個專案
            console.log(`✅ 成功讀取！共找到 ${projectsSnapshot.docs.length} 個專案。`);

            if (projectsSnapshot.docs.length === 0) {
                console.warn("⚠️ 警告：'projects' 集合是空的，或沒有讀取權限。");
                populateSelect(projectSelect, [], '沒有找到任何專案');
                projectSelect.disabled = true;
                return;
            }

            const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 【偵錯點#2】我們在這裡檢查轉換後的專案資料是否正確
            console.log("📊 轉換後的專案資料:", projects);
            
            // 【修正】我也修正了這裡的錯字 "專AN" -> "專案"
            populateSelect(projectSelect, projects, '請選擇專案...');
            projectSelect.disabled = false;

        } catch (error) {
            // 【偵錯點#3】如果過程中發生任何錯誤，會在這裡顯示
            console.error("❌ 讀取『專案』列表時發生嚴重錯誤:", error);
            populateSelect(projectSelect, [], '讀取專案時發生錯誤');
            projectSelect.disabled = true;
        }
    })();
}
