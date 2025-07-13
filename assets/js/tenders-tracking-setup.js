// assets/js/tracking-setup.js

function initTrackingSetupPage() {
    console.log("🚀 開始初始化追蹤設定頁面...");
    
    // === 第一步：依賴項檢查 ===
    console.log("📋 檢查依賴項...");
    
    // 檢查 currentUser
    if (typeof currentUser === 'undefined') {
        console.error("❌ currentUser 未定義！");
        alert("❌ 系統錯誤：無法獲取用戶資訊，請重新登入。");
        return;
    }
    
    if (!currentUser.email) {
        console.error("❌ currentUser.email 不存在！", currentUser);
        alert("❌ 系統錯誤：用戶資訊不完整，請重新登入。");
        return;
    }
    
    console.log("✅ currentUser 檢查通過:", currentUser.email);
    
    // 檢查 safeFirestoreQuery
    if (typeof safeFirestoreQuery === 'undefined') {
        console.error("❌ safeFirestoreQuery 函式未定義！");
        alert("❌ 系統錯誤：缺少必要的數據庫查詢函式。");
        return;
    }
    
    console.log("✅ safeFirestoreQuery 檢查通過");
    
    // 檢查 Firebase
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.error("❌ Firebase 未正確初始化！");
        alert("❌ 系統錯誤：數據庫連接失敗。");
        return;
    }
    
    console.log("✅ Firebase 檢查通過");
    
    // 檢查 naturalSequenceSort
    if (typeof naturalSequenceSort === 'undefined') {
        console.warn("⚠️ naturalSequenceSort 未定義，將使用預設排序");
        // 提供備用排序函式
        window.naturalSequenceSort = (a, b) => {
            const aData = a.data();
            const bData = b.data();
            const aSeq = aData.sequence || 0;
            const bSeq = bData.sequence || 0;
            return aSeq - bSeq;
        };
    }
    
    console.log("✅ naturalSequenceSort 檢查通過");

    // === 第二步：DOM 元素檢查 ===
    console.log("📋 檢查 DOM 元素...");
    
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

    // 檢查每個元素是否存在
    let missingElements = [];
    Object.keys(ui).forEach(key => {
        if (!ui[key]) {
            missingElements.push(key);
            console.error(`❌ 找不到元素: ${key}`);
        } else {
            console.log(`✅ 找到元素: ${key}`);
        }
    });
    
    if (missingElements.length > 0) {
        console.error("❌ 缺少必要的 DOM 元素:", missingElements);
        alert(`❌ 頁面元素缺失：${missingElements.join(', ')}`);
        return;
    }

    // === 第三步：頁面級別變數 ===
    let projects = [], tenders = [], majorItems = [], detailItems = [];
    let selectedMajorItem = null;

    // === 第四步：數據載入函式 ===
    
    async function loadProjects() {
        console.log("🔍 開始載入專案...");
        console.log("查詢條件 - 用戶:", currentUser.email);
        
        try {
            ui.projectSelect.innerHTML = '<option value="">載入中...</option>';
            ui.projectSelect.disabled = true;
            
            const projectDocs = await safeFirestoreQuery(
                "projects", 
                [{ field: "createdBy", operator: "==", value: currentUser.email }], 
                { field: "name", direction: "asc" }
            );
            
            console.log("✅ 專案查詢完成");
            console.log("📊 查詢結果:", projectDocs);
            console.log("📊 找到專案數量:", projectDocs.docs.length);
            
            projects = projectDocs.docs;
            
            // 更新下拉選單
            ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            
            if (projects.length === 0) {
                console.warn("⚠️ 沒有找到任何專案");
                ui.projectSelect.innerHTML += '<option value="" disabled>沒有找到專案</option>';
            } else {
                projects.forEach((project, index) => {
                    const projectData = project.data();
                    console.log(`專案 ${index + 1}:`, project.id, projectData);
                    ui.projectSelect.innerHTML += `<option value="${project.id}">${projectData.name}</option>`;
                });
                console.log("✅ 專案下拉選單已更新");
            }
            
        } catch (error) {
            console.error("❌ 讀取專案失敗:", error);
            console.error("錯誤詳情:", error.stack);
            ui.projectSelect.innerHTML = '<option value="">讀取專案失敗</option>';
        } finally {
            ui.projectSelect.disabled = false;
        }
    }

    async function loadTenders(projectId) {
        console.log("🔍 開始載入標單...", projectId);
        
        ui.tenderSelect.innerHTML = '<option value="">載入中...</option>';
        ui.tenderSelect.disabled = true;
        
        try {
            const tenderDocs = await safeFirestoreQuery(
                "tenders", 
                [
                    { field: "projectId", operator: "==", value: projectId }, 
                    { field: "createdBy", operator: "==", value: currentUser.email }
                ], 
                { field: "name", direction: "asc" }
            );
            
            console.log("✅ 標單查詢完成，數量:", tenderDocs.docs.length);
            
            tenders = tenderDocs.docs;
            ui.tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
            
            if (tenders.length === 0) {
                console.warn("⚠️ 沒有找到任何標單");
                ui.tenderSelect.innerHTML += '<option value="" disabled>沒有找到標單</option>';
            } else {
                tenders.forEach(tender => {
                    const tenderData = tender.data();
                    console.log("標單:", tender.id, tenderData);
                    ui.tenderSelect.innerHTML += `<option value="${tender.id}">${tenderData.name}</option>`;
                });
                console.log("✅ 標單下拉選單已更新");
            }
            
        } catch (error) {
            console.error("❌ 讀取標單失敗:", error);
            ui.tenderSelect.innerHTML = '<option value="">載入失敗</option>';
        } finally {
            ui.tenderSelect.disabled = false;
        }
    }

    async function loadMajorItems(tenderId) {
        console.log("🔍 開始載入大項目...", tenderId);
        
        ui.majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        ui.majorItemSelect.disabled = true;
        
        try {
            const majorItemDocs = await safeFirestoreQuery(
                "majorItems", 
                [{ field: "tenderId", operator: "==", value: tenderId }], 
                { field: "name", direction: "asc" }
            );
            
            console.log("✅ 大項目查詢完成，數量:", majorItemDocs.docs.length);
            
            majorItems = majorItemDocs.docs;
            ui.majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            
            if (majorItems.length === 0) {
                console.warn("⚠️ 沒有找到任何大項目");
                ui.majorItemSelect.innerHTML += '<option value="" disabled>沒有找到大項目</option>';
            } else {
                majorItems.forEach(item => {
                    const itemData = item.data();
                    console.log("大項目:", item.id, itemData);
                    ui.majorItemSelect.innerHTML += `<option value="${item.id}">${itemData.name}</option>`;
                });
                console.log("✅ 大項目下拉選單已更新");
            }
            
        } catch (error) {
            console.error("❌ 載入大項目失敗:", error);
            ui.majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        } finally {
            ui.majorItemSelect.disabled = false;
        }
    }

    async function loadDetailItems(majorItemId) {
        console.log("🔍 開始載入細項...", majorItemId);
        
        try {
            const detailItemDocs = await safeFirestoreQuery(
                "detailItems", 
                [{ field: "majorItemId", operator: "==", value: majorItemId }]
            );
            
            console.log("✅ 細項查詢完成，數量:", detailItemDocs.docs.length);
            
            // 使用自然排序
            detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
            
            console.log("✅ 細項已排序");
            
        } catch (error) {
            console.error("❌ 載入細項失敗:", error);
            detailItems = [];
        }
    }
    
    // === 第五步：渲染和操作函式 ===

    function renderItemsList() {
        console.log("🎨 開始渲染項目列表...");
        
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
        
        console.log("✅ 項目列表渲染完成");
    }

    async function saveSettings() {
        console.log("💾 開始儲存設定...");
        
        ui.saveBtn.disabled = true;
        ui.saveBtn.innerHTML = `💾 儲存中...`;

        try {
            const batch = firebase.firestore().batch();
            const switches = ui.itemsListContainer.querySelectorAll('.form-check-input');
            
            switches.forEach(sw => {
                const docRef = firebase.firestore().collection('detailItems').doc(sw.dataset.itemId);
                batch.update(docRef, { excludeFromProgress: !sw.checked });
            });
            
            await batch.commit();
            
            console.log("✅ 設定儲存成功");
            alert('✅ 設定已成功儲存！');
            
        } catch (error) {
            console.error("❌ 儲存設定時發生錯誤:", error);
            alert('❌ 儲存失敗，請查看控制台錯誤訊息。');
        } finally {
            ui.saveBtn.disabled = false;
            ui.saveBtn.innerHTML = `💾 儲存設定`;
        }
    }

    function toggleAllSwitches(checkedState) {
        console.log("🔄 切換所有開關:", checkedState);
        ui.itemsListContainer.querySelectorAll('.form-check-input').forEach(sw => sw.checked = checkedState);
    }

    function showMainContent(shouldShow) {
        console.log("👀 顯示主要內容:", shouldShow);
        ui.mainContent.style.display = shouldShow ? 'block' : 'none';
        ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
    }

    // === 第六步：事件處理 ===

    async function onMajorItemChange() {
        console.log("🔄 大項目選擇變更");
        
        const majorItemId = ui.majorItemSelect.value;
        if (!majorItemId) {
            showMainContent(false);
            return;
        }
        
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        ui.itemsListHeader.textContent = `設定列表：${selectedMajorItem.data().name}`;
        
        await loadDetailItems(majorItemId);
        renderItemsList();
        showMainContent(true);
    }

    async function onTenderChange() {
        console.log("🔄 標單選擇變更");
        
        const tenderId = ui.tenderSelect.value;
        ui.majorItemSelect.disabled = true;
        ui.majorItemSelect.innerHTML = '<option value="">請先選擇標單</option>';
        showMainContent(false);
        
        if (!tenderId) return;
        
        await loadMajorItems(tenderId);
    }

    async function onProjectChange() {
        console.log("🔄 專案選擇變更");
        
        const projectId = ui.projectSelect.value;
        ui.tenderSelect.disabled = true;
        ui.tenderSelect.innerHTML = '<option value="">請先選擇專案</option>';
        ui.majorItemSelect.disabled = true;
        ui.majorItemSelect.innerHTML = '<option value="">請先選擇標單</option>';
        showMainContent(false);
        
        if (!projectId) return;
        
        await loadTenders(projectId);
    }

    function setupEventListeners() {
        console.log("📡 設定事件監聽器...");
        
        ui.projectSelect.addEventListener('change', onProjectChange);
        ui.tenderSelect.addEventListener('change', onTenderChange);
        ui.majorItemSelect.addEventListener('change', onMajorItemChange);
        ui.saveBtn.addEventListener('click', saveSettings);
        ui.checkAllBtn.addEventListener('click', () => toggleAllSwitches(true));
        ui.uncheckAllBtn.addEventListener('click', () => toggleAllSwitches(false));
        
        console.log("✅ 事件監聽器設定完成");
    }

    // === 第七步：初始化流程 ===

    async function initializePage() {
        console.log("🚀 開始初始化頁面...");
        
        showMainContent(false); // 初始隱藏內容區
        setupEventListeners();
        
        // 載入專案列表
        await loadProjects();
        
        console.log("✅ 頁面初始化完成");
    }
    
    // 執行初始化
    initializePage();
}

// 確保在 DOM 載入完成後執行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrackingSetupPage);
} else {
    // DOM 已經載入完成，直接執行
    initTrackingSetupPage();
}
