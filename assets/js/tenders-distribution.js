/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v3.0 (權限系統整合)
 */
function initDistributionPage() {
    
    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], detailItems = [], allAdditionItems = [], distributions = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null;
    let currentUserRole = null, currentUserPermissions = {};
    let floors = [];
    let sortableInstance = null;

    // --- 初始化與資料載入 ---

    async function initializePage() {
        console.log("🚀 初始化樓層分配頁面 (v3.0)...");
        if (!auth.currentUser) return showAlert("無法獲取用戶資訊", "error");
        
        setupEventListeners();
        await loadProjectsWithPermission();
    }

    async function loadProjectsWithPermission() {
        showLoading(true, '載入專案中...');
        try {
            const allMyProjects = await loadProjects();
            const userEmail = auth.currentUser.email;

            // 篩選出有權限進行樓層分配的專案
            projects = allMyProjects.filter(project => {
                const memberInfo = project.members[userEmail];
                return memberInfo && (memberInfo.role === 'owner' || (memberInfo.role === 'editor' && memberInfo.permissions.canAccessDistribution));
            });

            const projectSelect = document.getElementById('projectSelect');
            projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            if (projects.length === 0) {
                projectSelect.innerHTML += '<option value="" disabled>您沒有可進行樓層分配的專案</option>';
            } else {
                projects.forEach(project => projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`);
            }
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
            // 查詢時不需要再檢查 createdBy，因為 loadProjects 已經過濾了權限
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
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
            const majorItemDocs = await safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }]);
            majorItems = majorItemDocs.docs;
            majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(item => majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`);
            majorItemSelect.disabled = false;
        } catch (error) {
            showAlert('載入大項目失敗', 'error');
            majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    // 【v3.1 修正】新增遺漏的 clearAllDistributions 函式
    function clearAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        if (!confirm(`確定要清空「${selectedMajorItem.name}」的所有樓層分配嗎？\n此操作不會立即儲存，您需要點擊「儲存所有分配」按鈕來確認變更。`)) return;

        // 將表格中所有的 input 欄位的值都設為空
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.value = '';
        });
        
        // 重新計算一次已分配數量，確保介面更新
        document.querySelectorAll('.item-row').forEach(row => {
            const distributedCell = document.getElementById(`distributed-${row.dataset.itemId}`);
            if (distributedCell) {
                const strongTag = distributedCell.querySelector('strong');
                if(strongTag) {
                    strongTag.textContent = '0';
                }
                distributedCell.classList.remove('error');
            }
        });

        showAlert('已清空畫面上的分配，請點擊儲存按鈕以生效。', 'info');
    }
    
    async function onMajorItemChange() {
        const majorItemId = document.getElementById('majorItemSelect').value;
        if (!majorItemId) { hideMainContent(); return; }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);

        // 【權限守衛】
        const memberInfo = selectedProject.members[auth.currentUser.email];
        currentUserRole = memberInfo.role;
        currentUserPermissions = memberInfo.permissions || {};
        const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);

        if (!canAccess) {
            showAlert('您沒有權限設定此專案的樓層分配', 'error');
            hideMainContent();
            return;
        }
        
        loadMajorItemData(majorItemId);
    }

    async function saveAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');

        // 【權限守衛】
        const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);
        if (!canAccess) return showAlert('權限不足，無法儲存', 'error');

        showLoading(true, '儲存中...');
        try {
            const batch = db.batch();
            const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]);
            existingDistributions.docs.forEach(doc => {
                batch.delete(db.collection("distributionTable").doc(doc.id));
            });
            document.querySelectorAll('.quantity-input').forEach(input => {
                const quantity = parseInt(input.value) || 0;
                if (quantity > 0) {
                    const docRef = db.collection("distributionTable").doc();
                    batch.set(docRef, { 
                        projectId: selectedProject.id, // 寫入 projectId
                        tenderId: selectedTender.id, 
                        majorItemId: selectedMajorItem.id, 
                        detailItemId: input.dataset.itemId, 
                        areaType: "樓層", 
                        areaName: input.dataset.floor, 
                        quantity: quantity, 
                        createdBy: auth.currentUser.email, 
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
                    });
                }
            });
            await batch.commit();
            await loadDistributions(selectedMajorItem.id);
            buildDistributionTable();
            showAlert('✅ 所有分配已儲存成功！', 'success');
        } catch (error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    function onProjectChange() { const projectId = document.getElementById('projectSelect').value; document.getElementById('tenderSelect').disabled = true; document.getElementById('majorItemSelect').disabled = true; hideMainContent(); if (!projectId) return; selectedProject = projects.find(p => p.id === projectId); loadTenders(projectId); }
    function onTenderChange() { const tenderId = document.getElementById('tenderSelect').value; document.getElementById('majorItemSelect').disabled = true; hideMainContent(); if (!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); loadMajorItems(tenderId); }
    async function loadFloorSettings(tenderId) { try { const snapshot = await db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get(); floors = snapshot.empty ? [] : (snapshot.docs[0].data().floors || []).sort(sortFloors); } catch (error) { console.error("載入樓層設定失敗", error); floors = []; } }
    async function loadDetailItems(majorItemId) { const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]); detailItems = detailItemDocs.docs.sort(naturalSequenceSort); }
    async function loadDistributions(majorItemId) { const distributionDocs = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }]); distributions = distributionDocs.docs; }
    async function loadAllAdditionItems(tenderId) { const additionDocs = await safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "isAddition", operator: "==", value: true }]); allAdditionItems = additionDocs.docs; }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); if (!distributedCell) return; const itemRow = distributedCell.closest('tr'); if (!itemRow) return; const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let otherInputsTotal = 0; allInputsForRow.forEach(input => { if (input !== inputElement) { otherInputsTotal += (Number(input.value) || 0); } }); const maxAllowed = totalQuantity - otherInputsTotal; let currentInputValue = Number(inputElement.value) || 0; if (currentInputValue > maxAllowed) { showAlert(`分配數量已達上限 (${totalQuantity})，已自動修正為最大可分配量: ${maxAllowed}`, 'warning'); inputElement.value = maxAllowed; currentInputValue = maxAllowed; } const finalDistributed = otherInputsTotal + currentInputValue; const strongTag = distributedCell.querySelector('strong'); if(strongTag) { strongTag.textContent = finalDistributed; } if (finalDistributed > totalQuantity) { distributedCell.classList.add('error'); } else { distributedCell.classList.remove('error'); } }
    function buildDistributionTable() { const tableHeader = document.getElementById('tableHeader'); const tableBody = document.getElementById('tableBody'); let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>'; floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`); headerHTML += '<th class="total-column">已分配</th></tr>'; tableHeader.innerHTML = headerHTML; let bodyHTML = ''; if (detailItems.length === 0) { bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`; } else { detailItems.forEach((item, index) => { const originalQuantity = item.totalQuantity || 0; const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id); const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0); const currentTotalQuantity = originalQuantity + additionalQuantity; let distributedQuantity = 0; let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`; rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`; rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`; floors.forEach(floor => { const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor); const quantity = dist ? dist.quantity : 0; distributedQuantity += quantity; rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`; }); const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : ''; rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`; rowHTML += '</tr>'; bodyHTML += rowHTML; }); } tableBody.innerHTML = bodyHTML; tableBody.querySelectorAll('.quantity-input').forEach(input => { input.addEventListener('input', () => onQuantityChange(input)); }); }
    async function loadMajorItemData(majorItemId) { showLoading(true, '載入大項目資料中...'); try { await Promise.all([ loadFloorSettings(selectedTender.id), loadAllAdditionItems(selectedTender.id), loadDetailItems(majorItemId), loadDistributions(majorItemId) ]); showMainContent(); buildDistributionTable(); } catch (error) { showAlert('載入大項目資料時發生錯誤', 'error'); } finally { showLoading(false); } }
    function hideMainContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; }
    function showMainContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; }
    function setupEventListeners() { document.getElementById('projectSelect')?.addEventListener('change', onProjectChange); document.getElementById('tenderSelect')?.addEventListener('change', onTenderChange); document.getElementById('majorItemSelect')?.addEventListener('change', onMajorItemChange); document.getElementById('saveDistributionsBtn')?.addEventListener('click', saveAllDistributions); document.getElementById('clearDistributionsBtn')?.addEventListener('click', clearAllDistributions); document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click()); document.getElementById('importInput')?.addEventListener('change', handleFileImport); document.getElementById('exportBtn')?.addEventListener('click', exportToExcel); document.getElementById('sequenceManagerBtn')?.addEventListener('click', showSequenceManager); document.getElementById('floorManagerBtn')?.addEventListener('click', showFloorManager); document.getElementById('templateButtons')?.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') applyFloorTemplate(e.target.dataset.template); }); document.getElementById('addCustomFloorBtn')?.addEventListener('click', addCustomFloor); document.getElementById('clearAllFloorsBtn')?.addEventListener('click', clearAllFloors); document.getElementById('saveFloorSettingsBtn')?.addEventListener('click', saveFloorSettings); document.getElementById('cancelFloorModalBtn')?.addEventListener('click', () => closeModal('floorModal')); document.getElementById('floorModal')?.addEventListener('click', (e) => { if(e.target.id === 'floorModal') closeModal('floorModal'); }); document.getElementById('resetOrderBtn')?.addEventListener('click', resetToOriginalOrder); document.getElementById('saveSequenceBtn')?.addEventListener('click', saveSequenceChanges); document.getElementById('cancelSequenceModalBtn')?.addEventListener('click', () => closeModal('sequenceModal')); document.getElementById('sequenceModal')?.addEventListener('click', (e) => { if(e.target.id === 'sequenceModal') closeModal('sequenceModal'); }); }
    function showAlert(message, type = 'info', duration = 3000) { alert(`[${type.toUpperCase()}] ${message}`); }
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.querySelector('.loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const textEl = loadingEl.querySelector('p'); if (textEl) textEl.textContent = message; } }
    function sortFloors(a, b) { const getFloorParts = (floorStr) => { const s = String(floorStr).toUpperCase(); const buildingPrefixMatch = s.match(/^([^\dBRF]+)/); const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : ''; const floorMatch = s.match(/([B|R]?)(\d+)/); if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0 }; const [, type, numStr] = floorMatch; const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1; return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10) }; }; const partsA = getFloorParts(a); const partsB = getFloorParts(b); if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building); if (partsA.type !== partsB.type) return partsA.type - partsB.type; if (partsA.type === 0) return partsB.num - partsA.num; return partsA.num - partsB.num; }
    function naturalSequenceSort(a, b) { const CHINESE_NUM_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10 }; const re = /(\d+(\.\d+)?)|([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸])|(\D+)/g; const seqA = String(a.sequence || ''); const seqB = String(b.sequence || ''); const partsA = seqA.match(re) || []; const partsB = seqB.match(re) || []; const len = Math.min(partsA.length, partsB.length); for (let i = 0; i < len; i++) { const partA = partsA[i]; const partB = partsB[i]; let numA = parseFloat(partA); let numB = parseFloat(partB); if (isNaN(numA)) numA = CHINESE_NUM_MAP[partA]; if (isNaN(numB)) numB = CHINESE_NUM_MAP[partB]; if (numA !== undefined && numB !== undefined) { if (numA !== numB) return numA - numB; } else { const comparison = partA.localeCompare(partB); if (comparison !== 0) return comparison; } } return partsA.length - partsB.length; }
    
    initializePage();
}
