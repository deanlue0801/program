// assets/js/tracking-setup.js

function initTrackingSetupPage() {
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
            console.error("儲存設定時發生錯誤:", error);
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
    (async function initialize() {
        resetSelect(tenderSelect, '請先選擇專案');
        resetSelect(majorItemSelect, '請先選擇標單');
        
        const projectsSnapshot = await db.collection('projects').get();
        const projects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateSelect(projectSelect, projects, '請選擇專案...');
    })();
}
