/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v5.0 (藍圖修正版)
 * - 參照 tenders-detail.js 的成功模式，修正所有查詢邏輯
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
        console.log("🚀 初始化樓層分配頁面 (v5.0)...");
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
        
        loadMajorItemData(majorItemId);
    }
    
    async function loadMajorItemData(majorItemId) {
        showLoading(true, '載入大項目資料中...');
        try {
            // 所有資料都透過 safeFirestoreQuery 載入，並帶上 projectId
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

    // 【v5.0 核心修正】改用 safeFirestoreQuery，與 tenders-detail.js 的模式對齊
    async function loadFloorSettings(tenderId) {
        try {
            const result = await safeFirestoreQuery("floorSettings", [
                { field: "tenderId", operator: "==", value: tenderId },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            
            if (result.docs.length === 0) {
                console.warn(`找不到符合權限的樓層設定 (Tender: ${tenderId})。將視為尚未設定。`);
                floors = [];
            } else {
                floors = (result.docs[0].floors || []).sort(sortFloors);
            }
        } catch (error) {
            console.error("載入樓層設定失敗，請檢查 Firestore 索引與安全規則。", error);
            floors = [];
            throw new Error('無法載入樓層設定。');
        }
    }
    
    // 【v5.0 核心修正】強化儲存邏輯，使其能安全地升級或建立資料
    async function saveFloorSettings() {
        if (!selectedTender) return showAlert('請先選擇標單', 'warning');
        if (currentUserRole !== 'owner' && !(currentUserPermissions.canAccessDistribution)) return showAlert('權限不足', 'error');

        showLoading(true, '儲存樓層設定中...');
        try {
            const floorData = {
                projectId: selectedProject.id,
                tenderId: selectedTender.id,
                floors: floors,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.currentUser.email
            };

            // 安全地檢查文件是否存在
            const existingResult = await safeFirestoreQuery("floorSettings", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);

            if (existingResult.docs.length > 0) {
                // 更新現有文件
                const docId = existingResult.docs[0].id;
                await db.collection("floorSettings").doc(docId).update(floorData);
            } else {
                // 建立新文件 (這同時處理了舊資料的「升級」情況)
                floorData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                floorData.createdBy = auth.currentUser.email;
                await db.collection("floorSettings").add(floorData);
            }

            closeModal('floorModal');
            if (selectedMajorItem) await loadMajorItemData(selectedMajorItem.id);
            showAlert('✅ 樓層設定已成功儲存！', 'success');

        } catch (error) {
            showAlert('儲存樓層設定失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // --- 其他所有函式 (UI, Event Listeners etc.) ---
    function onProjectChange() { const projectId = document.getElementById('projectSelect').value; resetSelect('tenderSelect', '請先選擇專案'); resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!projectId) return; selectedProject = projects.find(p => p.id === projectId); loadTenders(projectId); }
    function onTenderChange() { const tenderId = document.getElementById('tenderSelect').value; resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); const memberInfo = selectedProject.members[auth.currentUser.email]; currentUserRole = memberInfo.role; currentUserPermissions = memberInfo.permissions || {}; loadMajorItems(tenderId); }
    function resetSelect(selectId, text) { const select = document.getElementById(selectId); if (select) { select.innerHTML = `<option value="">${text}</option>`; select.disabled = true; } }
    async function loadDetailItems(majorItemId) { const result = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }, { field: "projectId", operator: "==", value: selectedProject.id }]); detailItems = result.docs.sort(naturalSequenceSort); }
    async function loadDistributions(majorItemId) { const result = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }, { field: "projectId", operator: "==", value: selectedProject.id }]); distributions = result.docs; }
    async function loadAllAdditionItems(tenderId) { const result = await safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "isAddition", operator: "==", value: true }, { field: "projectId", operator: "==", value: selectedProject.id }]); allAdditionItems = result.docs; }
    function buildDistributionTable() { const tableHeader = document.getElementById('tableHeader'); const tableBody = document.getElementById('tableBody'); let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>'; floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`); headerHTML += '<th class="total-column">已分配</th></tr>'; tableHeader.innerHTML = headerHTML; let bodyHTML = ''; if (detailItems.length === 0) { bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`; } else { detailItems.forEach((item, index) => { const originalQuantity = item.totalQuantity || 0; const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id); const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0); const currentTotalQuantity = originalQuantity + additionalQuantity; let distributedQuantity = 0; let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`; rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`; rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`; floors.forEach(floor => { const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor); const quantity = dist ? dist.quantity : 0; distributedQuantity += quantity; rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`; }); const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : ''; rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`; rowHTML += '</tr>'; bodyHTML += rowHTML; }); } tableBody.innerHTML = bodyHTML; tableBody.querySelectorAll('.quantity-input').forEach(input => input.addEventListener('input', () => onQuantityChange(input))); }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); if (!distributedCell) return; const itemRow = distributedCell.closest('tr'); if (!itemRow) return; const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let otherInputsTotal = 0; allInputsForRow.forEach(input => { if (input !== inputElement) { otherInputsTotal += (Number(input.value) || 0); } }); const maxAllowed = totalQuantity - otherInputsTotal; let currentInputValue = Number(inputElement.value) || 0; if (currentInputValue > maxAllowed) { showAlert(`分配數量已達上限 (${totalQuantity})，已自動修正為最大可分配量: ${maxAllowed}`, 'warning'); inputElement.value = maxAllowed; currentInputValue = maxAllowed; } const finalDistributed = otherInputsTotal + currentInputValue; const strongTag = distributedCell.querySelector('strong'); if(strongTag) { strongTag.textContent = finalDistributed; } distributedCell.classList.toggle('error', finalDistributed > totalQuantity); }
    async function saveAllDistributions() { if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning'); if (currentUserRole !== 'owner' && !(currentUserPermissions.canAccessDistribution)) return showAlert('權限不足', 'error'); showLoading(true, '儲存中...'); try { const batch = db.batch(); const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "projectId", operator: "==", value: selectedProject.id }]); existingDistributions.docs.forEach(doc => { batch.delete(db.collection("distributionTable").doc(doc.id)); }); document.querySelectorAll('.quantity-input').forEach(input => { const quantity = parseInt
