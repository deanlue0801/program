/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v4.0 (後端修正對應版)
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
        console.log("🚀 初始化樓層分配頁面 (v4.0)...");
        if (!auth.currentUser) return showAlert("無法獲取用戶資訊", "error");
        
        setupEventListeners();
        await loadProjectsWithPermission();
    }

    async function loadProjectsWithPermission() {
        showLoading(true, '載入專案中...');
        try {
            const allMyProjects = await loadProjects();
            const userEmail = auth.currentUser.email;

            projects = allMyProjects.filter(project => {
                const memberInfo = project.members[userEmail];
                return memberInfo && (memberInfo.role === 'owner' || (memberInfo.role === 'editor' && memberInfo.permissions.canAccessDistribution));
            });
            populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...', '您沒有可進行樓層分配的專案');
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
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
            tenders = tenderDocs.docs;
            populateSelect(tenderSelect, tenders, '請選擇標單...');
        } catch (error) {
            showAlert('載入標單失敗', 'error');
            populateSelect(tenderSelect, [], '載入失敗');
        }
    }

    async function loadMajorItems(tenderId) {
        const majorItemSelect = document.getElementById('majorItemSelect');
        majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        majorItemSelect.disabled = true;
        try {
            const majorItemDocs = await safeFirestoreQuery("majorItems", [
                { field: "tenderId", operator: "==", value: tenderId },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            majorItems = majorItemDocs.docs;
            populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
        } catch (error) {
            showAlert('載入大項目失敗', 'error');
            populateSelect(majorItemSelect, [], '載入失敗');
        }
    }
    
    async function onMajorItemChange() {
        const majorItemId = document.getElementById('majorItemSelect').value;
        if (!majorItemId) { hideMainContent(); return; }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);

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
            showAlert('載入大項目資料時發生錯誤: ' + error.message, 'error');
            hideMainContent();
        } finally {
            showLoading(false);
        }
    }

    // 只使用安全的方式查詢
    async function loadFloorSettings(tenderId) {
        try {
            console.log("🔍 載入樓層設定...", {
                tenderId,
                projectId: selectedProject?.id,
                userEmail: auth.currentUser?.email
            });
    
            // 檢查使用者驗證狀態
            if (!auth.currentUser) {
                throw new Error('使用者未登入');
            }
    
            // 檢查必要參數
            if (!selectedProject?.id) {
                throw new Error('缺少專案ID');
            }
    
            // 嘗試使用複合查詢
            let result;
            try {
                result = await safeFirestoreQuery("floorSettings", [
                    { field: "tenderId", operator: "==", value: tenderId },
                    { field: "projectId", operator: "==", value: selectedProject.id }
                ]);
            } catch (error) {
                if (error.code === 'failed-precondition') {
                    console.log("索引尚未建立，使用單一查詢條件...");
                    // 降級到單一查詢條件
                    const allResults = await safeFirestoreQuery("floorSettings", [
                        { field: "tenderId", operator: "==", value: tenderId }
                    ]);
                    // 在客戶端過濾
                    result = {
                        docs: allResults.docs.filter(doc => doc.projectId === selectedProject.id)
                    };
                } else {
                    throw error;
                }
            }
            
            floors = result.docs.length > 0 ? (result.docs[0].floors || []).sort(sortFloors) : [];
            console.log("✅ 樓層設定載入成功:", floors.length, "個樓層");
            
        } catch (error) {
            console.error("❌ 載入樓層設定失敗:", error);
            floors = [];
            
            // 根據錯誤類型提供具體指導
            if (error.code === 'permission-denied') {
                throw new Error('權限不足，請檢查 Firestore 安全規則設定。');
            } else if (error.code === 'failed-precondition') {
                throw new Error('缺少必要的資料庫索引，請建立 Firestore 複合索引。');
            } else if (error.code === 'unavailable') {
                throw new Error('網路連線問題，請稍後再試。');
            } else {
                throw new Error(`載入樓層設定時發生錯誤: ${error.message}`);
            }
        }
    }
    
    // 儲存/升級資料
    async function saveFloorSettings() {
        if (!selectedTender) return showAlert('請先選擇標單', 'warning');
        if (currentUserRole !== 'owner' && !(currentUserPermissions.canAccessDistribution)) return showAlert('權限不足', 'error');

        showLoading(true, '儲存樓層設定中...');
        try {
            const floorSettingsRef = db.collection("floorSettings");
            
            // 優先用安全的方式尋找文件
            let docId = null;
            const safeQuery = await floorSettingsRef.where("tenderId", "==", selectedTender.id).where("projectId", "==", selectedProject.id).limit(1).get();
            if (!safeQuery.empty) {
                docId = safeQuery.docs[0].id;
            } else {
                // 如果找不到，代表可能是需要升級的舊資料，用不安全的方式定位一次 (需要暫時放寬安全規則)
                try {
                    const oldQuery = await db.collection("floorSettings").where("tenderId", "==", selectedTender.id).limit(1).get();
                    if (!oldQuery.empty) docId = oldQuery.docs[0].id;
                } catch(e) {
                     console.warn("無法用舊方式定位文件，可能安全規則已收緊。將建立新文件。");
                }
            }
            
            const floorData = {
                projectId: selectedProject.id,
                tenderId: selectedTender.id,
                floors: floors,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.currentUser.email
            };

            if (docId) { // 如果找到了文件 (無論新舊)，就更新它
                await floorSettingsRef.doc(docId).update(floorData);
                showAlert('✅ 設定已更新！', 'success');
            } else { // 找不到就新增
                floorData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                floorData.createdBy = auth.currentUser.email;
                await floorSettingsRef.add(floorData);
                showAlert('✅ 設定已成功新增！', 'success');
            }

            closeModal('floorModal');
            if (selectedMajorItem) {
                await loadMajorItemData(selectedMajorItem.id);
            }
        } catch (error) {
            showAlert('儲存樓層設定失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- 其他所有函式 (UI, Event Listeners etc.) ---
    function onProjectChange() { const projectId = document.getElementById('projectSelect').value; resetSelect('tenderSelect', '請先選擇專案'); resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!projectId) return; selectedProject = projects.find(p => p.id === projectId); loadTenders(projectId); }
    function onTenderChange() { const tenderId = document.getElementById('tenderSelect').value; resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); loadMajorItems(tenderId); }
    function resetSelect(selectId, text) { const select = document.getElementById(selectId); if (select) { select.innerHTML = `<option value="">${text}</option>`; select.disabled = true; } }
    async function loadDetailItems(majorItemId) { const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]); detailItems = detailItemDocs.docs.sort(naturalSequenceSort); }
    async function loadDistributions(majorItemId) { const distributionDocs = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }]); distributions = distributionDocs.docs; }
    async function loadAllAdditionItems(tenderId) { const additionDocs = await safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "isAddition", operator: "==", value: true }]); allAdditionItems = additionDocs.docs; }
    function buildDistributionTable() { const tableHeader = document.getElementById('tableHeader'); const tableBody = document.getElementById('tableBody'); let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>'; floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`); headerHTML += '<th class="total-column">已分配</th></tr>'; tableHeader.innerHTML = headerHTML; let bodyHTML = ''; if (detailItems.length === 0) { bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`; } else { detailItems.forEach((item, index) => { const originalQuantity = item.totalQuantity || 0; const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id); const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0); const currentTotalQuantity = originalQuantity + additionalQuantity; let distributedQuantity = 0; let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`; rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`; rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`; floors.forEach(floor => { const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor); const quantity = dist ? dist.quantity : 0; distributedQuantity += quantity; rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`; }); const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : ''; rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`; rowHTML += '</tr>'; bodyHTML += rowHTML; }); } tableBody.innerHTML = bodyHTML; tableBody.querySelectorAll('.quantity-input').forEach(input => input.addEventListener('input', () => onQuantityChange(input))); }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); if (!distributedCell) return; const itemRow = distributedCell.closest('tr'); if (!itemRow) return; const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let otherInputsTotal = 0; allInputsForRow.forEach(input => { if (input !== inputElement) { otherInputsTotal += (Number(input.value) || 0); } }); const maxAllowed = totalQuantity - otherInputsTotal; let currentInputValue = Number(inputElement.value) || 0; if (currentInputValue > maxAllowed) { showAlert(`分配數量已達上限 (${totalQuantity})，已自動修正為最大可分配量: ${maxAllowed}`, 'warning'); inputElement.value = maxAllowed; currentInputValue = maxAllowed; } const finalDistributed = otherInputsTotal + currentInputValue; const strongTag = distributedCell.querySelector('strong'); if(strongTag) { strongTag.textContent = finalDistributed; } distributedCell.classList.toggle('error', finalDistributed > totalQuantity); }
    async function saveAllDistributions() { if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning'); if (currentUserRole !== 'owner' && !(currentUserPermissions.canAccessDistribution)) return showAlert('權限不足', 'error'); showLoading(true, '儲存中...'); try { const batch = db.batch(); const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]); existingDistributions.docs.forEach(doc => { batch.delete(db.collection("distributionTable").doc(doc.id)); }); document.querySelectorAll('.quantity-input').forEach(input => { const quantity = parseInt(input.value) || 0; if (quantity > 0) { const docRef = db.collection("distributionTable").doc(); batch.set(docRef, { projectId: selectedProject.id, tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: input.dataset.itemId, areaType: "樓層", areaName: input.dataset.floor, quantity: quantity, createdBy: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); } }); await batch.commit(); await loadDistributions(selectedMajorItem.id); buildDistributionTable(); showAlert('✅ 所有分配已儲存成功！', 'success'); } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
    function clearAllDistributions() { if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning'); if (!confirm(`確定要清空「${selectedMajorItem.name}」的所有樓層分配嗎？\n此操作不會立即儲存，您需要點擊「儲存所有分配」按鈕來確認變更。`)) return; document.querySelectorAll('.quantity-input').forEach(input => { input.value = ''; input.classList.remove('has-value'); }); document.querySelectorAll('.item-row').forEach(row => { const distributedCell = document.getElementById(`distributed-${row.dataset.itemId}`); if (distributedCell) { distributedCell.querySelector('strong').textContent = '0'; distributedCell.classList.remove('error'); } }); showAlert('已清空畫面上的分配，請點擊儲存按鈕以生效。', 'info'); }
    function showFloorManager() { if (!selectedTender) return showAlert('請先選擇標單', 'warning'); displayCurrentFloors(); document.getElementById('floorModal').style.display = 'flex'; }
    function displayCurrentFloors() { const container = document.getElementById('currentFloorsList'); container.innerHTML = floors.length === 0 ? '<p style="color: #6c757d;">尚未設定樓層</p>' : floors.map(floor => `<div class="floor-tag"><span>${floor}</span><button data-floor="${floor}" class="remove-floor-btn">&times;</button></div>`).join(''); container.querySelectorAll('.remove-floor-btn').forEach(btn => btn.onclick = () => { floors = floors.filter(f => f !== btn.dataset.floor); displayCurrentFloors(); }); if (sortableInstance) sortableInstance.destroy(); sortableInstance = new Sortable(container, { animation: 150, onEnd: (evt) => { const element = floors.splice(evt.oldIndex, 1)[0]; floors.splice(evt.newIndex, 0, element); } }); }
    function addCustomFloor() { const input = document.getElementById('newFloorInput'); const values = input.value.trim().toUpperCase(); if (!values) return; const newFloors = values.split(/,|、/).map(val => val.trim()).filter(Boolean); newFloors.forEach(f => { if (!floors.includes(f)) floors.push(f); }); floors.sort(sortFloors); displayCurrentFloors(); input.value = ''; }
    function applyFloorTemplate(template) { let templateFloors = []; if (template === 'B1-10F') templateFloors = ['B1', ...Array.from({length: 10}, (_, i) => `${i + 1}F`)]; if (template === '1F-20F') templateFloors = Array.from({length: 20}, (_, i) => `${i + 1}F`); if (template === 'B3-15F_R') templateFloors = ['B3','B2','B1', ...Array.from({length: 15}, (_, i) => `${i + 1}F`), 'R']; floors = [...new Set([...floors, ...templateFloors])].sort(sortFloors); displayCurrentFloors(); }
    function clearAllFloors() { if (confirm('確定要清空所有樓層嗎？')) { floors = []; displayCurrentFloors(); } }
    function setupEventListeners() { document.getElementById('projectSelect')?.addEventListener('change', onProjectChange); document.getElementById('tenderSelect')?.addEventListener('change', onTenderChange); document.getElementById('majorItemSelect')?.addEventListener('change', onMajorItemChange); document.getElementById('saveDistributionsBtn')?.addEventListener('click', saveAllDistributions); document.getElementById('clearDistributionsBtn')?.addEventListener('click', clearAllDistributions); document.getElementById('floorManagerBtn')?.addEventListener('click', showFloorManager); document.getElementById('templateButtons')?.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') applyFloorTemplate(e.target.dataset.template); }); document.getElementById('addCustomFloorBtn')?.addEventListener('click', addCustomFloor); document.getElementById('clearAllFloorsBtn')?.addEventListener('click', clearAllFloors); document.getElementById('saveFloorSettingsBtn')?.addEventListener('click', saveFloorSettings); document.getElementById('cancelFloorModalBtn')?.addEventListener('click', () => closeModal('floorModal')); }
    function hideMainContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; }
    function showMainContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'none'; }
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.querySelector('.loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const textEl = loadingEl.querySelector('p'); if (textEl) textEl.textContent = message; } }
    function populateSelect(selectEl, options, defaultText, emptyText) { let html = `<option value="">${defaultText}</option>`; if (options.length === 0 && emptyText) { html += `<option value="" disabled>${emptyText}</option>`; } else { options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); } selectEl.innerHTML = html; selectEl.disabled = false; }
    function formatCurrency(amount) { return `NT$ ${parseInt(amount || 0).toLocaleString()}`; }
    function sortFloors(a, b) { const getFloorParts = (floorStr) => { const s = String(floorStr).toUpperCase(); const buildingPrefixMatch = s.match(/^([^\dBRF]+)/); const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : ''; const floorMatch = s.match(/([B|R]?)(\d+)/); if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0 }; const [, type, numStr] = floorMatch; const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1; return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10) }; }; const partsA = getFloorParts(a); const partsB = getFloorParts(b); if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building); if (partsA.type !== partsB.type) return partsA.type - partsB.type; if (partsA.type === 0) return partsB.num - partsA.num; return partsA.num - partsB.num; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length-pB.length; }
    function showAlert(message, type = 'info') { alert(`[${type.toUpperCase()}] ${message}`); }

    initializePage();
}
