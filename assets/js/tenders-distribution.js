/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v2.5 融合修正最終版
 */
function initDistributionPage() {
    
    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], detailItems = [], allAdditionItems = [], distributions = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null;
    let floors = [];
    let sortableInstance = null;

    const defaultFloorTemplates = {
        'standard': ['B4F', 'B3F', 'B2F', 'B1F', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F', '11F', '12F', '13F', '14F', '15F', '16F', '17F', 'R1F', 'R2F', 'R3F'],
        'simple': ['B1F', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F'],
        'basement': ['B5F', 'B4F', 'B3F', 'B2F', 'B1F'],
        'building': Array.from({ length: 20 }, (_, i) => `${i + 1}F`)
    };

    // --- 所有函數定義區 ---

    function showLoading(isLoading, message='載入中...') {
        const loadingEl = document.querySelector('.loading'); 
        if(loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            const textEl = loadingEl.querySelector('p');
            if (textEl) textEl.textContent = message;
        }
    }

    function sortFloors(a, b) {
        const getFloorParts = (floorStr) => {
            const s = String(floorStr).toUpperCase();
            const buildingPrefixMatch = s.match(/^([^\dBRF]+)/);
            const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : '';
            const floorMatch = s.match(/([B|R]?)(\d+)/);
            if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0 };
            const [, type, numStr] = floorMatch;
            const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1;
            return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10) };
        };
        const partsA = getFloorParts(a);
        const partsB = getFloorParts(b);
        if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building);
        if (partsA.type !== partsB.type) return partsA.type - partsB.type;
        if (partsA.type === 0) return partsB.num - partsA.num;
        return partsA.num - partsB.num;
    }

    async function loadProjects() {
        showLoading(true, '載入專案中...');
        try {
            const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            projects = projectDocs.docs;
            const projectSelect = document.getElementById('projectSelect');
            projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            projects.forEach(project => projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`);
        } catch (error) {
            showAlert('載入專案失敗', 'error');
        } finally {
            showLoading(false);
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

    async function loadFloorSettings(tenderId) {
        try {
            const snapshot = await db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get();
            floors = snapshot.empty ? [] : (snapshot.docs[0].data().floors || []).sort(sortFloors);
        } catch (error) {
            console.error("載入樓層設定失敗", error);
            floors = [];
        }
    }

    async function loadDetailItems(majorItemId) {
        const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]);
        detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
    }
    
    async function loadDistributions(majorItemId) {
        const distributionDocs = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }]);
        distributions = distributionDocs.docs;
    }

    async function loadAllAdditionItems(tenderId) {
        const additionDocs = await safeFirestoreQuery("detailItems", [
            { field: "tenderId", operator: "==", value: tenderId },
            { field: "isAddition", operator: "==", value: true }
        ]);
        allAdditionItems = additionDocs.docs;
    }
    
    // --- 【關鍵修正】: 採用 Claude 建議的、更穩健的 onQuantityChange 函數 ---
    function onQuantityChange(inputElement) {
        const itemId = inputElement.dataset.itemId;
        const rowInputs = document.querySelectorAll(`input[data-item-id="${itemId}"]`);
        const distributedCell = document.getElementById(`distributed-${itemId}`);
        
        if (!distributedCell) return;

        let strongTag = distributedCell.querySelector('strong');
        if (!strongTag) {
            strongTag = document.createElement('strong');
            strongTag.textContent = distributedCell.textContent || '0';
            distributedCell.innerHTML = '';
            distributedCell.appendChild(strongTag);
        }

        const itemRow = distributedCell.closest('tr');
        if (!itemRow) return;

        const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0;
        
        const currentDistributed = Array.from(rowInputs).reduce((sum, input) => {
            return sum + (Number(input.value) || 0);
        }, 0);
        
        strongTag.textContent = currentDistributed;
        
        if (currentDistributed > totalQuantity) {
            distributedCell.classList.add('error');
        } else {
            distributedCell.classList.remove('error');
        }
    }

    function buildDistributionTable() {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>';
        floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`);
        headerHTML += '<th class="total-column">已分配</th></tr>';
        tableHeader.innerHTML = headerHTML;
        let bodyHTML = '';
        if (detailItems.length === 0) {
            bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`;
        } else {
            detailItems.forEach((item, index) => {
                const originalQuantity = item.totalQuantity || 0;
                const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id);
                const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
                const currentTotalQuantity = originalQuantity + additionalQuantity;
                let distributedQuantity = 0;
                let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`;
                rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`;
                rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`;
                floors.forEach(floor => {
                    const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor);
                    const quantity = dist ? dist.quantity : 0;
                    distributedQuantity += quantity;
                    rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`;
                });
                const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : '';
                rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`;
                rowHTML += '</tr>';
                bodyHTML += rowHTML;
            });
        }
        tableBody.innerHTML = bodyHTML;
        tableBody.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('input', () => onQuantityChange(input));
            input.addEventListener('change', () => onQuantityChange(input));
        });
    }

    async function loadMajorItemData(majorItemId) {
        showLoading(true, '載入大項目資料中...');
        try {
            await Promise.all([
                loadFloorSettings(selectedTender.id),
                loadAllAdditionItems(selectedTender.id),
                loadDetailItems(majorItemId),
                loadDistributions(majorItemId)
            ]);
            showMainContent();
            buildDistributionTable();
        } catch (error) {
            showAlert('載入大項目資料時發生錯誤', 'error');
        } finally {
            showLoading(false);
        }
    }

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
        if (!majorItemId) { hideMainContent(); return; }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        loadMajorItemData(majorItemId);
    }
    
    // --- 其他所有函數的完整實現 ---
    async function saveAllDistributions() { if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning'); showLoading(true, '儲存中...'); try { const batch = db.batch(); const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]); existingDistributions.docs.forEach(doc => { batch.delete(db.collection("distributionTable").doc(doc.id)); }); document.querySelectorAll('.quantity-input').forEach(input => { const quantity = parseInt(input.value) || 0; if (quantity > 0) { const docRef = db.collection("distributionTable").doc(); batch.set(docRef, { tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: input.dataset.itemId, areaType: "樓層", areaName: input.dataset.floor, quantity: quantity, createdBy: currentUser.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); } }); await batch.commit(); await loadDistributions(selectedMajorItem.id); buildDistributionTable(); showAlert('✅ 所有分配已儲存成功！', 'success'); } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
    function clearAllDistributions() { if (!confirm('確定要清空表格中所有已分配的數量嗎？此操作不會立即儲存，您仍需點擊「儲存分配」。')) return; document.querySelectorAll('.quantity-input').forEach(input => { if (input.value !== '') { input.value = ''; onQuantityChange(input); } }); }
    function exportToExcel() { if (!selectedMajorItem || detailItems.length === 0) return showAlert('沒有資料可匯出', 'error'); const data = [['項次', '項目名稱', '單位', '總量', ...floors]]; detailItems.forEach(item => { const row = [item.sequence || '', item.name || '', item.unit || '', item.totalQuantity || 0]; const distributedQuantities = {}; distributions.filter(d => d.detailItemId === item.id).forEach(d => { distributedQuantities[d.areaName] = d.quantity; }); floors.forEach(floor => { row.push(distributedQuantities[floor] || 0); }); data.push(row); }); const worksheet = XLSX.utils.aoa_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, selectedMajorItem.name); XLSX.writeFile(workbook, `${selectedProject.name}_${selectedTender.name}_${selectedMajorItem.name}_分配表.xlsx`); }
    function handleFileImport(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, { type: 'array' }); const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); const importedFloors = jsonData[0].slice(4); jsonData.slice(1).forEach(row => { const sequence = row[0]; const targetItem = detailItems.find(item => item.sequence === sequence); if (targetItem) { importedFloors.forEach((floor, index) => { const quantity = parseInt(row[index + 4]) || 0; const input = document.querySelector(`input[data-item-id="${targetItem.id}"][data-floor="${floor}"]`); if (input && quantity > 0) { input.value = quantity; onQuantityChange(input); } }); } }); showAlert('匯入成功！請檢查表格內容並手動儲存。', 'success'); } catch (error) { showAlert('匯入失敗，請檢查檔案格式是否正確。', 'error'); } }; reader.readAsArrayBuffer(file); }
    function showFloorManager() { if (!selectedTender) return showAlert('請先選擇標單', 'warning'); document.getElementById('currentTenderName').textContent = selectedTender.name; displayCurrentFloors(); document.getElementById('floorModal').style.display = 'flex'; }
    function displayCurrentFloors() { const container = document.getElementById('currentFloorsList'); container.innerHTML = floors.length === 0 ? '<p>尚未設定樓層</p>' : floors.map((floor, index) => `<div class="floor-tag"><span>${floor}</span><button data-index="${index}" class="remove-floor-btn">&times;</button></div>`).join(''); container.querySelectorAll('.remove-floor-btn').forEach(btn => btn.onclick = () => removeFloor(parseInt(btn.dataset.index))); }
    function applyFloorTemplate(templateType) { if (defaultFloorTemplates[templateType]) { floors = [...defaultFloorTemplates[templateType]]; displayCurrentFloors(); } }
    function addCustomFloor() { const input = document.getElementById('newFloorInput'); const value = input.value.trim().toUpperCase(); if (!value) return; if (value.includes('-')) { const [startStr, endStr] = value.split('-'); const startPrefix = (startStr.match(/^([^\d]+)/) || ['',''])[1]; const endPrefix = (endStr.match(/^([^\d]+)/) || ['',''])[1]; const startNum = parseInt(startStr.replace(/^[^\d]+/, '')); const endNum = parseInt(endStr.replace(/^[^\d]+/, '')); if (startPrefix === endPrefix && !isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) { for (let i = startNum; i <= endNum; i++) { const newFloor = `${startPrefix}${i}F`; if (!floors.includes(newFloor)) floors.push(newFloor); } } else { showAlert('範圍格式錯誤，前後綴需相同。例: 1F-10F 或 停1F-停5F', 'error'); } } else { const newFloors = value.split(',').map(f => f.trim()).filter(Boolean); newFloors.forEach(f => { if (!floors.includes(f)) floors.push(f); }); } floors.sort(sortFloors); displayCurrentFloors(); input.value = ''; }
    function removeFloor(index) { floors.splice(index, 1); displayCurrentFloors(); }
    function clearAllFloors() { if (confirm('確定清空所有樓層嗎？')) { floors = []; displayCurrentFloors(); } }
    async function saveFloorSettings() { if (!confirm('確定儲存目前的樓層設定嗎？')) return; showLoading(true, '儲存設定中...'); try { const settingData = { tenderId: selectedTender.id, projectId: selectedProject.id, floors: floors.sort(sortFloors), createdBy: currentUser.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; const query = await db.collection("floorSettings").where("tenderId", "==", selectedTender.id).limit(1).get(); if (!query.empty) { await db.collection("floorSettings").doc(query.docs[0].id).update(settingData); } else { settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("floorSettings").add(settingData); } showAlert('✅ 樓層設定已儲存！', 'success'); if (selectedMajorItem) buildDistributionTable(); closeModal('floorModal'); } catch(error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
    function showSequenceManager() { if (!selectedMajorItem || detailItems.length === 0) return showAlert('沒有細項可調整順序', 'warning'); buildSequenceList(); document.getElementById('sequenceModal').style.display = 'flex'; }
    function buildSequenceList() { const listContainer = document.getElementById('sequenceList'); listContainer.innerHTML = detailItems.map(item => `<div class="sequence-item" data-id="${item.id}"><input type="text" class="sequence-input" value="${item.sequence || ''}" data-item-id="${item.id}"><span class="sequence-name">${item.name}</span><span class="drag-handle">☰</span></div>`).join(''); if (sortableInstance) sortableInstance.destroy(); sortableInstance = new Sortable(listContainer, { handle: '.drag-handle', animation: 150 }); }
    async function saveSequenceChanges() { showLoading(true, '儲存順序中...'); try { const batch = db.batch(); const newOrder = Array.from(document.querySelectorAll('.sequence-item')).map((item, index) => ({ id: item.dataset.id, sequence: item.querySelector('.sequence-input').value || (index + 1).toString() })); newOrder.forEach(item => { const docRef = db.collection("detailItems").doc(item.id); batch.update(docRef, { sequence: item.sequence }); }); await batch.commit(); await loadDetailItems(selectedMajorItem.id); buildDistributionTable(); showAlert('✅ 順序已儲存！', 'success'); closeModal('sequenceModal'); } catch (error) { showAlert('儲存順序失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
    function resetToOriginalOrder() { if (!confirm('這會按照「項目編號」重新排序，確定嗎？')) return; detailItems.sort(naturalSequenceSort); buildSequenceList(); }
    function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
    function hideMainContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; }
    function showMainContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length-pB.length; }

    // 主流程啟動點
    initializePage();
}
