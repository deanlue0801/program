/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本)
 * 由 router.js 呼叫 initDistributionPage() 函數來啟動
 */
function initDistributionPage() {
    
    // --- 頁面狀態與設定 ---
    let projects = [], tenders = [], majorItems = [], detailItems = [], distributions = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null;
    let floors = [];
    let sortableInstance = null;

    const defaultFloorTemplates = {
        'standard': ['B4F', 'B3F', 'B2F', 'B1F', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F', '11F', '12F', '13F', '14F', '15F', '16F', '17F', 'R1F', 'R2F', 'R3F'],
        'simple': ['B1F', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F'],
        'basement': ['B5F', 'B4F', 'B3F', 'B2F', 'B1F'],
        'building': Array.from({ length: 20 }, (_, i) => `${i + 1}F`)
    };

    // --- 初始化流程 ---

    async function initializePage() {
        console.log("🚀 初始化樓層分配頁面...");
        if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
        
        // 將需要在 HTML onclick 中呼叫的函數暴露到全局
        window.exposedDistributionFuncs = {
            onProjectChange, onTenderChange, onMajorItemChange,
            saveAllDistributions, clearAllDistributions, exportToExcel,
            triggerImport, handleFileImport,
            showFloorManager, applyFloorTemplate, addCustomFloor, removeFloor, clearAllFloors, saveFloorSettings,
            showSequenceManager, resetToOriginalOrder, saveSequenceChanges,
            closeModal
        };
        
        await loadProjects();
    }

    // --- 資料載入 ---

    async function loadProjects() {
        console.log('🔄 載入專案...');
        try {
            const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            projects = projectDocs.docs;
            const projectSelect = document.getElementById('projectSelect');
            projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            projects.forEach(project => projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`);
            console.log(`✅ 專案載入完成: ${projects.length} 個`);
        } catch (error) {
            console.error('❌ 載入專案失敗:', error);
            showAlert('載入專案失敗', 'error');
        }
    }

    async function loadTenders(projectId) {
        const tenderSelect = document.getElementById('tenderSelect');
        tenderSelect.innerHTML = '<option value="">載入中...</option>';
        tenderSelect.disabled = true;
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }, { field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            tenders = tenderDocs.docs;
            tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
            tenders.forEach(tender => tenderSelect.innerHTML += `<option value="${tender.id}">${tender.name}</option>`);
            tenderSelect.disabled = false;
        } catch (error) {
            showAlert('載入標單失敗', 'error');
            tenderSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    async function loadMajorItems(tenderId) {
        const majorItemSelect = document.getElementById('majorItemSelect');
        majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        majorItemSelect.disabled = true;
        try {
            const majorItemDocs = await safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" });
            majorItems = majorItemDocs.docs;
            majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(item => majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`);
            majorItemSelect.disabled = false;
        } catch (error) {
            showAlert('載入大項目失敗', 'error');
            majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    async function loadMajorItemData(majorItemId) {
        try {
            await Promise.all([
                loadFloorSettings(selectedTender.id),
                loadDetailItems(majorItemId),
                loadDistributions(majorItemId)
            ]);
            showMainContent();
            buildDistributionTable();
        } catch (error) {
            showAlert('載入大項目資料時發生錯誤', 'error');
        }
    }
    
    async function loadFloorSettings(tenderId) {
        try {
            const snapshot = await db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get();
            floors = snapshot.empty ? [] : (snapshot.docs[0].data().floors || []);
        } catch (error) {
            floors = [];
        }
    }

    async function loadDetailItems(majorItemId) {
        const detailItemDocs = await safeFirestoreQuery(
            "detailItems",
            [{ field: "majorItemId", operator: "==", value: majorItemId }]
            // 我們不再依賴 Firestore 的排序，因為它對字串數字的排序不符合預期
        );
        detailItems = detailItemDocs.docs;
    
        // 【關鍵】無論從 Firestore 拿到什麼順序，我們都在前端用新的智慧排序函數強制重排
        detailItems.sort(naturalSequenceSort);
        
        console.log(`✅ 載入細項: ${detailItems.length} 個 (已使用終極自然排序)`);
    }
    
    async function loadDistributions(majorItemId) {
        const distributionDocs = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }]);
        distributions = distributionDocs.docs;
    }

    // --- 下拉選單事件處理 ---

    function onProjectChange() {
        const projectId = document.getElementById('projectSelect').value;
        document.getElementById('tenderSelect').disabled = true;
        document.getElementById('majorItemSelect').disabled = true;
        hideMainContent();
        if (!projectId) return;
        selectedProject = projects.find(p => p.id === projectId);
        loadTenders(projectId);
    }

    function onTenderChange() {
        const tenderId = document.getElementById('tenderSelect').value;
        document.getElementById('majorItemSelect').disabled = true;
        hideMainContent();
        if (!tenderId) return;
        selectedTender = tenders.find(t => t.id === tenderId);
        loadMajorItems(tenderId);
    }

    function onMajorItemChange() {
        const majorItemId = document.getElementById('majorItemSelect').value;
        if (!majorItemId) {
            hideMainContent();
            return;
        }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        loadMajorItemData(majorItemId);
    }
    
    // --- 核心功能：分配表、儲存、匯入/匯出 ---

    function buildDistributionTable() {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>';
        floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`);
        headerHTML += '<th class="total-column">已分配</th><th>狀態</th></tr>';
        tableHeader.innerHTML = headerHTML;
        let bodyHTML = '';
        if (detailItems.length === 0) {
            bodyHTML = `<tr><td colspan="${floors.length + 4}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`;
        } else {
            detailItems.forEach((item, index) => {
                const totalQuantity = item.totalQuantity || 0;
                let distributedQuantity = 0;
                let rowHTML = '<tr class="item-row">';
                rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`;
                rowHTML += `<td class="total-column"><strong>${totalQuantity}</strong></td>`;
                floors.forEach(floor => {
                    const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor);
                    const quantity = dist ? dist.quantity : 0;
                    distributedQuantity += quantity;
                    rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" oninput="window.exposedDistributionFuncs.onQuantityChange(this)" placeholder="0"></td>`;
                });
                const status = distributedQuantity === 0 ? '未分配' : (distributedQuantity >= totalQuantity ? '已完成' : '部分分配');
                const statusClass = distributedQuantity === 0 ? 'status-none' : (distributedQuantity >= totalQuantity ? 'status-complete' : 'status-partial');
                rowHTML += `<td class="total-column"><strong id="distributed-${item.id}">${distributedQuantity}</strong></td>`;
                rowHTML += `<td>${status}<span class="status-indicator ${statusClass}"></span></td>`;
                rowHTML += '</tr>';
                bodyHTML += rowHTML;
            });
            bodyHTML += buildSummaryRow();
        }
        tableBody.innerHTML = bodyHTML;
    }
    
    function buildSummaryRow() {
        let summaryHTML = '<tr class="summary-row">';
        summaryHTML += '<td><strong>🔢 各樓層合計</strong></td>';
        summaryHTML += `<td class="total-column"><strong>${detailItems.reduce((sum, item) => sum + (item.totalQuantity || 0), 0)}</strong></td>`;
        floors.forEach(floor => {
            const floorTotal = Array.from(document.querySelectorAll(`input[data-floor="${floor}"]`)).reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
            summaryHTML += `<td><strong id="floor-total-${floor}">${floorTotal || ''}</strong></td>`;
        });
        const totalDistributed = Array.from(document.querySelectorAll('.quantity-input')).reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
        summaryHTML += `<td class="total-column"><strong>${totalDistributed}</strong></td><td>-</td>`;
        summaryHTML += '</tr>';
        return summaryHTML;
    }

    function onQuantityChange(input) {
        const itemId = input.dataset.itemId;
        input.classList.toggle('has-value', input.value > 0);
        updateRowTotals(itemId);
        updateFloorAndGrandTotals();
    }
    
    function updateRowTotals(itemId) {
        const rowInputs = document.querySelectorAll(`input[data-item-id="${itemId}"]`);
        const total = Array.from(rowInputs).reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
        document.getElementById(`distributed-${itemId}`).textContent = total;
    }
    
    function updateFloorAndGrandTotals() {
        let grandTotal = 0;
        floors.forEach(floor => {
            const floorInputs = document.querySelectorAll(`input[data-floor="${floor}"]`);
            const total = Array.from(floorInputs).reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
            document.getElementById(`floor-total-${floor}`).textContent = total || '';
            grandTotal += total;
        });
        const grandTotalElement = document.querySelector('.summary-row .total-column:nth-last-child(2) strong');
        if(grandTotalElement) grandTotalElement.textContent = grandTotal;
    }

    async function saveAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        try {
            showAlert('儲存中...', 'info');
            const batch = db.batch();
            const oldDistIds = new Set(distributions.map(d => d.id));
            const newDistData = new Map();

            document.querySelectorAll('.quantity-input').forEach(input => {
                const quantity = parseInt(input.value) || 0;
                if (quantity > 0) {
                    const key = `${input.dataset.itemId}_${input.dataset.floor}`;
                    newDistData.set(key, {
                        tenderId: selectedTender.id,
                        majorItemId: selectedMajorItem.id,
                        detailItemId: input.dataset.itemId,
                        areaType: "樓層",
                        areaName: input.dataset.floor,
                        quantity: quantity,
                        createdBy: currentUser.email,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            });

            // Delete all old distributions for this major item
            oldDistIds.forEach(id => batch.delete(db.collection("distributionTable").doc(id)));
            
            // Add all new distributions
            newDistData.forEach(data => {
                const docRef = db.collection("distributionTable").doc();
                batch.set(docRef, { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            
            await batch.commit();
            await loadDistributions(selectedMajorItem.id);
            buildDistributionTable();
            showAlert('✅ 所有分配已儲存成功！', 'success');
        } catch (error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        }
    }

    function clearAllDistributions() {
        if (!confirm('確定要清空所有分配設定嗎？')) return;
        document.querySelectorAll('.quantity-input').forEach(input => {
            if (input.value !== '') {
                input.value = '';
                onQuantityChange(input);
            }
        });
    }

    function exportToExcel() {
        // ... 此處放入您最新的 exportToExcel 完整程式碼 ...
    }
    
    function triggerImport() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        document.getElementById('importInput').click();
    }
    
    function handleFileImport(event) {
        // ... 此處放入您最新的 handleFileImport 完整程式碼 ...
    }

    // --- 樓層與順序管理 Modal ---
    
    function showFloorManager() {
        if (!selectedTender) return showAlert('請先選擇標單', 'warning');
        displayCurrentFloors();
        document.getElementById('floorModal').style.display = 'flex';
    }

    function displayCurrentFloors() {
        const container = document.getElementById('currentFloorsList');
        document.getElementById('currentTenderName').textContent = selectedTender.name;
        container.innerHTML = floors.length === 0 ? '<p>尚未設定樓層</p>' : floors.map((floor, index) =>
            `<div class="floor-tag"><span>${floor}</span><button onclick="window.exposedDistributionFuncs.removeFloor(${index})">&times;</button></div>`
        ).join('');
    }

    function applyFloorTemplate(templateType) {
        if (defaultFloorTemplates[templateType]) {
            floors = [...defaultFloorTemplates[templateType]];
            displayCurrentFloors();
        }
    }

    function addCustomFloor() {
        // ... 此處放入您最新的 addCustomFloor 完整程式碼 ...
    }

    function removeFloor(index) {
        floors.splice(index, 1);
        displayCurrentFloors();
    }

    function clearAllFloors() {
        if (confirm('確定清空所有樓層嗎？')) {
            floors = [];
            displayCurrentFloors();
        }
    }

    async function saveFloorSettings() {
        if (floors.length === 0 && !confirm('確定要儲存空的樓層設定嗎？')) return;
        if (!confirm('確定儲存樓層設定嗎？')) return;
        floors.sort(sortFloors);
        try {
            const settingData = { tenderId: selectedTender.id, projectId: selectedProject.id, floors: floors, createdBy: currentUser.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const query = await db.collection("floorSettings").where("tenderId", "==", selectedTender.id).limit(1).get();
            if (!query.empty) {
                await db.collection("floorSettings").doc(query.docs[0].id).update(settingData);
            } else {
                settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("floorSettings").add(settingData);
            }
            showAlert('✅ 樓層設定已儲存！', 'success');
            if (selectedMajorItem) buildDistributionTable();
            closeModal('floorModal');
        } catch(error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        }
    }

    function showSequenceManager() {
        if (!selectedMajorItem || detailItems.length === 0) return showAlert('沒有細項可調整順序', 'warning');
        buildSequenceList();
        document.getElementById('sequenceModal').style.display = 'flex';
    }

    function buildSequenceList() {
        const listContainer = document.getElementById('sequenceList');
        listContainer.innerHTML = detailItems.map(item =>
            `<div class="sequence-item" data-id="${item.id}">
                <input type="text" class="sequence-input" value="${item.sequence || ''}" data-item-id="${item.id}">
                <span class="sequence-name">${item.name}</span>
                <span class="drag-handle">☰</span>
            </div>`
        ).join('');
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(listContainer, { handle: '.drag-handle', animation: 150 });
    }
    
    async function saveSequenceChanges() {
        // ... 此處放入您最新的 saveSequenceChanges 完整程式碼 ...
    }

    function resetToOriginalOrder() {
        if (!confirm('這會按照「項目編號」重新排序，確定嗎？')) return;
        detailItems.sort(naturalSequenceSort);
        buildSequenceList();
        buildDistributionTable();
        showAlert('✅ 已恢復為項目編號順序！', 'success');
    }

    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    // --- 通用輔助函數 ---

    function hideMainContent() {
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
    }

    function showMainContent() {
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';
    }
    
    function sortFloors(a, b) {
        const getFloorParts = (floorStr) => {
            const match = String(floorStr).match(/([B|R]?)(\d+)/);
            if (!match) return { prefix: floorStr, num: 0 };
            const [, prefix, numStr] = match;
            return { prefix: prefix || '', num: parseInt(numStr, 10) };
        };
        const partsA = getFloorParts(a);
        const partsB = getFloorParts(b);
        const prefixOrder = { 'B': -1, '': 0, 'R': 1 };
        const orderA = prefixOrder[partsA.prefix];
        const orderB = prefixOrder[partsB.prefix];
        if (orderA !== orderB) return orderA - orderB;
        return partsA.num - partsB.num;
    }

// 【請使用這個全新的、更強大的版本來取代舊的 naturalSequenceSort 函數】

/**
 * 通用自然排序函數 (終極版)
 * 可以正確處理各種混合編號，如 "3", "3.1", "3-2", "10", "A-1" 等
 * @param {object} a - 要比較的第一個項目
 * @param {object} b - 要比較的第二個項目
 * @returns {number} - 排序結果
 */
function naturalSequenceSort(a, b) {
    // 取得要比較的 sequence 值，並確保是字串
    const seqA = String(a.sequence || '');
    const seqB = String(b.sequence || '');

    // 這個正規表達式會將字串分割成「連續的數字部分」和「連續的非數字部分」
    // 例如 "A-10.5-C" -> ["A-", "10.5", "-C"]
    const re = /(\d+(\.\d+)?)|(\D+)/g;

    const partsA = seqA.match(re) || [];
    const partsB = seqB.match(re) || [];

    const len = Math.min(partsA.length, partsB.length);

    // 逐一比較分割後的部分
    for (let i = 0; i < len; i++) {
        const partA = partsA[i];
        const partB = partsB[i];

        // 嘗試將部分轉為數字
        const numA = parseFloat(partA);
        const numB = parseFloat(partB);

        // 如果兩個部分都能成功轉為數字，就用數字大小比較
        if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) {
                return numA - numB;
            }
        } else {
            // 如果不是數字，就用文字規則比較
            if (partA !== partB) {
                return partA.localeCompare(partB);
            }
        }
    }

    // 如果所有共通部分都相同（例如 "A-1" 和 "A-1-2"），則較短的排前面
    return partsA.length - partsB.length;
}
    // --- 頁面啟動點 ---
    initializePage();
}
