/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v7.1 (安全規則修正版)
 * - 修正 floorSettings 相關的查詢，使其符合最新的安全規則
 * - 確保所有資料庫互動都包含 projectId
 */
function initDistributionPage() {

    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], detailItems = [], allAdditionItems = [], distributions = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null;
    let floors = [];
    let sortableFloor = null, sortableSequence = null;

    // --- 初始化與資料載入 ---

    async function initializePage() {
        console.log("🚀 初始化樓層分配頁面 (v7.1)...");
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

    // --- 資料讀取核心函式 ---
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

    async function loadFloorSettings(tenderId) {
        try {
            // 【核心修正】查詢 floorSettings 時，必須同時提供 projectId
            const result = await safeFirestoreQuery("floorSettings", [
                { field: "tenderId", operator: "==", value: tenderId },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            
            if (result.docs.length === 0) {
                floors = [];
            } else {
                floors = (result.docs[0].floors || []).sort(sortFloors);
            }
        } catch (error) {
            console.error("載入樓層設定失敗", error);
            floors = [];
            throw new Error('無法載入樓層設定。');
        }
    }

    async function loadDetailItems(majorItemId) {
        const result = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }, { field: "projectId", operator: "==", value: selectedProject.id }]);
        detailItems = result.docs.sort(naturalSequenceSort);
    }

    async function loadDistributions(majorItemId) {
        const result = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }, { field: "projectId", operator: "==", value: selectedProject.id }]);
        distributions = result.docs;
    }

    async function loadAllAdditionItems(tenderId) {
        const result = await safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "isAddition", operator: "==", value: true }, { field: "projectId", operator: "==", value: selectedProject.id }]);
        allAdditionItems = result.docs;
    }

    // --- 主要功能函式 (儲存/清空) ---
    async function saveAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        showLoading(true, '儲存中...');
        try {
            const batch = db.batch();
            const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "projectId", operator: "==", value: selectedProject.id }]);
            existingDistributions.docs.forEach(doc => {
                const docRef = db.collection("distributionTable").doc(doc.id);
                batch.delete(docRef);
            });
            document.querySelectorAll('.quantity-input').forEach(input => {
                const quantity = parseInt(input.value) || 0;
                if (quantity > 0) {
                    const docRef = db.collection("distributionTable").doc();
                    batch.set(docRef, { projectId: selectedProject.id, tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: input.dataset.itemId, areaType: "樓層", areaName: input.dataset.floor, quantity: quantity, createdBy: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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

    function clearAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        if (!confirm(`確定要清空「${selectedMajorItem.name}」的所有樓層分配嗎？\n此操作不會立即儲存，您需要點擊「儲存所有分配」按鈕來確認變更。`)) return;
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('.item-row').forEach(row => {
            const distributedCell = document.getElementById(`distributed-${row.dataset.itemId}`);
            if (distributedCell) {
                distributedCell.querySelector('strong').textContent = '0';
                distributedCell.classList.remove('error');
            }
        });
        showAlert('已清空畫面上的分配，請點擊儲存按鈕以生效。', 'info');
    }

    // --- 匯入 / 匯出 ---
    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!selectedMajorItem) {
            showAlert('請先選擇大項目才能匯入', 'warning');
            event.target.value = '';
            return;
        }
        showLoading(true, '解析檔案中...');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                processImportData(jsonData);
            } catch (error) {
                console.error("匯入錯誤:", error);
                showAlert('檔案解析失敗，請確認檔案為標準 Excel 格式 (.xlsx)', 'error');
            } finally {
                showLoading(false);
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function processImportData(data) {
        if (data.length < 2) return showAlert('匯入檔案中沒有資料', 'warning');
        const headers = data[0].map(h => String(h).trim());
        const itemNameHeader = headers[0];
        const floorHeaders = headers.slice(1, headers.length - 1);
        let importCount = 0;
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const itemName = String(row[0] || '').trim();
            if (!itemName) continue;
            const detailItem = detailItems.find(item => `${item.sequence || ''} ${item.name}`.trim() === itemName);
            if (detailItem) {
                floorHeaders.forEach((floor, index) => {
                    const quantity = parseInt(row[index + 1]) || 0;
                    const input = document.querySelector(`input[data-item-id="${detailItem.id}"][data-floor="${floor}"]`);
                    if (input) {
                        input.value = quantity > 0 ? quantity : '';
                        if(quantity > 0) importCount++;
                    }
                });
                const firstInput = document.querySelector(`input[data-item-id="${detailItem.id}"]`);
                if(firstInput) onQuantityChange(firstInput);
            }
        }
        showAlert(importCount > 0 ? `成功匯入 ${importCount} 筆分配資料！` : '沒有找到可匹配的資料', importCount > 0 ? 'success' : 'warning');
    }

    function exportToExcel() {
        if (!selectedMajorItem || detailItems.length === 0) return showAlert('沒有可匯出的資料', 'warning');
        const data = [];
        const headers = ['細項名稱', ...floors, '已分配'];
        data.push(headers);
        detailItems.forEach(item => {
            const row = [];
            row.push(`${item.sequence || ''} ${item.name}`.trim());
            let distributed = 0;
            floors.forEach(floor => {
                const input = document.querySelector(`input[data-item-id="${item.id}"][data-floor="${floor}"]`);
                const quantity = parseInt(input?.value) || 0;
                row.push(quantity);
                distributed += quantity;
            });
            row.push(distributed);
            data.push(row);
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "樓層分配表");
        XLSX.writeFile(wb, `樓層分配_${selectedTender.name}_${selectedMajorItem.name}.xlsx`);
    }

    // --- 樓層 & 項次管理 ---
    function showFloorManager() {
        if (!selectedTender) return showAlert('請先選擇標單', 'warning');
        displayCurrentFloors();
        openModal('floorModal');
    }
    
    function displayCurrentFloors() {
        const container = document.getElementById('currentFloorsList');
        if (!container) return;
        container.innerHTML = floors.length === 0 ? '<p class="empty-modal-text">尚未設定樓層</p>' : floors.map(floor => `<div class="floor-tag" data-floor="${floor}"><span>${floor}</span><button class="remove-floor-btn" data-floor="${floor}">&times;</button></div>`).join('');
        container.querySelectorAll('.remove-floor-btn').forEach(btn => btn.onclick = () => {
            floors = floors.filter(f => f !== btn.dataset.floor);
            displayCurrentFloors();
        });
        if (sortableFloor) sortableFloor.destroy();
        sortableFloor = new Sortable(container, { animation: 150, onEnd: (evt) => { const element = floors.splice(evt.oldIndex, 1)[0]; floors.splice(evt.newIndex, 0, element); } });
    }

    function addCustomFloor() {
        const input = document.getElementById('newFloorInput');
        const values = input.value.trim().toUpperCase();
        if (!values) return;
        const newFloors = values.split(/,|、/).map(val => val.trim()).filter(Boolean);
        newFloors.forEach(f => { if (!floors.includes(f)) floors.push(f); });
        floors.sort(sortFloors);
        displayCurrentFloors();
        input.value = '';
    }

    function applyFloorTemplate(template) {
        let templateFloors = [];
        if (template === 'B1-10F') templateFloors = ['B1', ...Array.from({length: 10}, (_, i) => `${i + 1}F`)];
        if (template === '1F-20F') templateFloors = Array.from({length: 20}, (_, i) => `${i + 1}F`);
        if (template === 'B3-15F_R') templateFloors = ['B3','B2','B1', ...Array.from({length: 15}, (_, i) => `${i + 1}F`), 'R'];
        floors = [...new Set([...floors, ...templateFloors])].sort(sortFloors);
        displayCurrentFloors();
    }
    
    function clearAllFloors() {
        if (confirm('確定要清空所有樓層嗎？')) {
            floors = [];
            displayCurrentFloors();
        }
    }

    async function saveFloorSettings() {
        if (!selectedTender) return showAlert('請先選擇標單', 'warning');
        showLoading(true, '儲存樓層設定中...');
        try {
            const floorData = {
                projectId: selectedProject.id,
                tenderId: selectedTender.id,
                floors: floors,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: auth.currentUser.email
            };
            // 【核心修正】查詢時也必須加入 projectId
            const existingResult = await safeFirestoreQuery("floorSettings", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            
            if (existingResult.docs.length > 0) {
                const docId = existingResult.docs[0].id;
                await db.collection("floorSettings").doc(docId).update(floorData);
            } else {
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

    function showSequenceManager() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        const list = document.getElementById('sequenceList');
        if (!list) return;
        list.innerHTML = '';
        detailItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'sequence-item';
            div.dataset.itemId = item.id;
            div.innerHTML = `<span class="drag-handle">☰</span><input class="sequence-input" value="${item.sequence || ''}" placeholder="項次"><span class="item-name">${item.name}</span>`;
            list.appendChild(div);
        });
        if (sortableSequence) sortableSequence.destroy();
        sortableSequence = new Sortable(list, { handle: '.drag-handle', animation: 150 });
        openModal('sequenceModal');
    }

    async function saveSequenceChanges() {
        const items = document.querySelectorAll('#sequenceList .sequence-item');
        if (items.length === 0) return closeModal('sequenceModal');
        showLoading(true, '儲存順序中...');
        try {
            const batch = db.batch();
            const newDetailItems = [];
            items.forEach((item) => {
                const itemId = item.dataset.itemId;
                const sequence = item.querySelector('.sequence-input').value.trim();
                const docRef = db.collection("detailItems").doc(itemId);
                batch.update(docRef, { sequence });
                const originalItem = detailItems.find(d => d.id === itemId);
                if(originalItem) newDetailItems.push({ ...originalItem, sequence });
            });
            await batch.commit();
            detailItems = newDetailItems.sort(naturalSequenceSort);
            buildDistributionTable();
            closeModal('sequenceModal');
            showAlert('項次順序已成功儲存！', 'success');
        } catch (error) {
            showAlert('儲存項次順序失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // --- UI 控制與輔助函式 ---
    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', onProjectChange);
        document.getElementById('tenderSelect')?.addEventListener('change', onTenderChange);
        document.getElementById('majorItemSelect')?.addEventListener('change', onMajorItemChange);
        document.getElementById('saveDistributionsBtn')?.addEventListener('click', saveAllDistributions);
        document.getElementById('clearDistributionsBtn')?.addEventListener('click', clearAllDistributions);
        document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click());
        document.getElementById('importInput')?.addEventListener('change', handleFileImport);
        document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);
        document.getElementById('floorManagerBtn')?.addEventListener('click', showFloorManager);
        document.getElementById('sequenceManagerBtn')?.addEventListener('click', showSequenceManager);
        document.getElementById('templateButtons')?.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') applyFloorTemplate(e.target.dataset.template); });
        document.getElementById('addCustomFloorBtn')?.addEventListener('click', addCustomFloor);
        document.getElementById('clearAllFloorsBtn')?.addEventListener('click', clearAllFloors);
        document.getElementById('saveFloorSettingsBtn')?.addEventListener('click', saveFloorSettings);
        document.getElementById('cancelFloorModalBtn')?.addEventListener('click', () => closeModal('floorModal'));
        document.getElementById('saveSequenceBtn')?.addEventListener('click', saveSequenceChanges);
        document.getElementById('cancelSequenceModalBtn')?.addEventListener('click', () => closeModal('sequenceModal'));
    }
    function onProjectChange() { const projectId = document.getElementById('projectSelect').value; resetSelect('tenderSelect', '請先選擇專案'); resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!projectId) return; selectedProject = projects.find(p => p.id === projectId); loadTenders(projectId); }
    function onTenderChange() { const tenderId = document.getElementById('tenderSelect').value; resetSelect('majorItemSelect', '請先選擇標單'); hideMainContent(); if (!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); loadMajorItems(tenderId); }
    function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'flex'; }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; }
    function resetSelect(selectId, text) { const select = document.getElementById(selectId); if (select) { select.innerHTML = `<option value="">${text}</option>`; select.disabled = true; } }
    function buildDistributionTable() { const tableHeader = document.getElementById('tableHeader'); const tableBody = document.getElementById('tableBody'); let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>'; floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`); headerHTML += '<th class="total-column">已分配</th></tr>'; tableHeader.innerHTML = headerHTML; let bodyHTML = ''; if (detailItems.length === 0) { bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`; } else { detailItems.forEach((item, index) => { const originalQuantity = item.totalQuantity || 0; const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id); const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0); const currentTotalQuantity = originalQuantity + additionalQuantity; let distributedQuantity = 0; let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`; rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`; rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`; floors.forEach(floor => { const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor); const quantity = dist ? dist.quantity : 0; distributedQuantity += quantity; rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`; }); const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : ''; rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`; rowHTML += '</tr>'; bodyHTML += rowHTML; }); } tableBody.innerHTML = bodyHTML; tableBody.querySelectorAll('.quantity-input').forEach(input => input.addEventListener('input', () => onQuantityChange(input))); }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; if (!itemId) return; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); if (!distributedCell) return; const itemRow = distributedCell.closest('tr'); if (!itemRow) return; const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let currentDistributed = 0; allInputsForRow.forEach(input => { currentDistributed += (Number(input.value) || 0); }); if (currentDistributed > totalQuantity) { const overage = currentDistributed - totalQuantity; inputElement.value = Math.max(0, (Number(inputElement.value) || 0) - overage); showAlert(`分配總數 (${currentDistributed}) 已超過此樓層總量 (${totalQuantity})，已自動修正。`, 'warning'); currentDistributed = totalQuantity; } const strongTag = distributedCell.querySelector('strong'); if(strongTag) strongTag.textContent = currentDistributed; distributedCell.classList.toggle('error', currentDistributed > totalQuantity); }
    function hideMainContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; }
    function showMainContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; }
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.querySelector('.loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const textEl = loadingEl.querySelector('p'); if (textEl) textEl.textContent = message; } }
    function populateSelect(selectEl, options, defaultText, emptyText) { let html = `<option value="">${defaultText}</option>`; if (options.length === 0 && emptyText) { html += `<option value="" disabled>${emptyText}</option>`; } else { options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); } selectEl.innerHTML = html; selectEl.disabled = (options.length === 0); }
    function formatCurrency(amount) { return `NT$ ${parseInt(amount || 0).toLocaleString()}`; }
    function sortFloors(a, b) { const getFloorParts = (floorStr) => { const s = String(floorStr).toUpperCase(); const buildingPrefixMatch = s.match(/^([^\dBRF]+)/); const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : ''; const floorMatch = s.match(/([B|R]?)(\d+)/); if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0, raw: s }; const [, type, numStr] = floorMatch; const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1; return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10), raw: s }; }; const partsA = getFloorParts(a); const partsB = getFloorParts(b); if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building, 'zh-Hans-CN-u-kn-true'); if (partsA.type !== partsB.type) return partsA.type - partsB.type; if (partsA.type === 0) return partsB.num - partsA.num; if(partsA.num !== partsB.num) return partsA.num - partsB.num; return a.localeCompare(b, 'zh-Hans-CN-u-kn-true'); }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }
    function showAlert(message, type = 'info') { alert(`[${type.toUpperCase()}] ${message}`); }

    initializePage();
}
