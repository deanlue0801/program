Clarifying the Approach

I'm seeking clarification on the user's feedback regarding my previous code block. Specifically, I need to understand whether the user found my use of placeholders satisfactory. I'm focusing on their response to the comment, as that was the main change. I'm aiming to refine my communication based on their specific concerns.

Improving Code Integration

I now understand that my previous response was incomplete and confusing. The user's point about where to make changes is valid. I apologize for the unclear code block. My goal is now to provide a fully functional, complete tenders-space-distribution.js file by integrating their v3.4 code within a waitForElement wrapper. I need to acknowledge my mistake and ensure the user receives working code. To proceed, I require the full contents of their uploaded v3.4 file.

Rectifying Previous Error

I acknowledge my past error in the tenders-space-distribution.js file, specifically the confusing omission of actual code. I now understand the need for a comprehensive, functional solution. I'm actively integrating the user's v3.4 code within my waitForElement structure. My focus is on producing a ready-to-use file by wrapping the user's logic appropriately, and replacing the prior placeholder. This is now the priority in the project.

Constructing Final Solution

I'm now fully aware of the previous issue and have a clear strategy. My focus shifts to assembling the tenders-space-distribution.js file, incorporating the user's v3.4 code within my waitForElement wrapper. The goal is to provide a complete, plug-and-play solution. I'm actively integrating the code and finalizing the structure for immediate use. The aim is to rectify my previous error and ensure a seamless experience for the user.

Defining the Necessary Changes

I'm currently focused on the user's inquiry: what specific modifications are needed? The context is the TypeError: ... is null error we were troubleshooting on the tenders/space-distribution page. I'm now zeroing in on pinpointing the areas requiring adjustment based on our previous debugging efforts.

Confirming the Necessary Adjustments

I'm now zeroing in on the user's explicit question: "What changes are needed?" I've verified the user's latest tenders-space-distribution.js file, version 3.4. The problem, as I see it, stems from the script attempting execution before the HTML router has completed loading. The definitive solution, therefore, is the wrapper function I proposed previously, tailored to ensure proper timing.

Providing the Definitive Solution

I'm now focusing on the user's explicit request: "What needs to change?" I've verified their most recent tenders-space-distribution.js file (v3.4).  The root cause remains the timing issue – their code executes before the HTML router finishes loading. The single modification needed is to wrap their complete v3.4 code within the waitForElement function. This function ensures the page is ready before the script attempts to run. The only change involves encapsulating their existing script logic, without any deletion or alteration to their code. I'll provide the complete, ready-to-use JS file, and reiterate that the corrected HTML is still required. This delivers a straightforward, non-invasive fix.

Outlining the Final Modification

我現在專注於回應使用者的明確詢問：「請問 那我要修改的內容 為哪裡?」。 我已確認您提供的最新的 tenders-space-distribution.js 檔案 (v3.4)，並且該檔案的內容完整無缺。 問題在於腳本嘗試在 HTML 路由器完成載入之前執行，導致錯誤。 您只需將您的整個 v3.4 程式碼包裝在 waitForElement 函式中，以解決這個時序問題。 這個函式確保頁面已準備好再執行腳本。您唯一需要進行的修改，就是將您的現有程式碼置於 waitForElement 的程式碼之內，而無需刪除或更改您的原始程式碼。 我將提供完整的、可以直接使用的 JS 檔案給您，並再次提醒您，仍然需要搭配我先前提供的修正後 HTML 文件。

好的，感謝您提供最新的 tenders-space-distribution.js v3.4 版本的程式碼。

您問了一個最直接的問題：「那我到底要修改哪裡？」

答案是： 您的 v3.4 版本程式碼功能邏輯是完全正確的，我們不需要修改它內部的任何功能。唯一要修改的，是它開始執行的「時機」。

問題核心
您提供的 v3.4 檔案，會在 router.js 將對應的 HTML 頁面載入完成之前就開始執行，導致它找不到任何 HTML 元素，從而崩潰。

最終解決方案
我們要做的，就是將您這份完整、正確的 v3.4 程式碼，放入一個「等待盒子」(waitForElement) 裡。這個盒子會等到 HTML 頁面準備好之後，才把裡面的程式碼放出來執行。

請將您 assets/js/tenders-space-distribution.js 檔案的全部內容，完整替換為以下程式碼。

這份程式碼完整保留了您 v3.4 的所有功能，只是修正了它的啟動方式。

JavaScript

/**
 * 空間分配管理系統 (space-distribution.js) - v3.5 (最終執行時機修正版)
 * 基於您提供的 v3.4 版本，修正 SPA 路由下的初始化問題。
 */
function initSpaceDistributionPage() {
    console.log("🚀 初始化獨立空間分配頁面 (v3.5)...");

    // 【步驟一】定義一個「等待盒子」函數
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
            return;
        }
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback();
            }
        }, 100);
    }

    // 【步驟二】將您 v3.4 的所有程式碼，放入這個「等待盒子」中
    waitForElement('#projectSelect', () => {
        
        console.log("✅ HTML 已就緒，開始執行 v3.4 核心邏輯...");

        // =======================================================
        // 以下是您 v3.4 版本的完整程式碼，原封不動
        // =======================================================
        
        let projects = [], tenders = [], majorItems = [], tenderFloors = [];
        let selectedProject = null, selectedTender = null, selectedMajorItem = null, selectedFloor = null;
        let currentUserRole = null, currentUserPermissions = {};
        let detailItems = [], floorDistributions = [], spaceDistributions = [], spaces = []; 

        async function initializePage() {
            console.log("🚀 初始化獨立空間分配頁面 (v3.4)...");
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
                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) {
                showAlert('載入專案失敗', 'error');
            } finally {
                showLoading(false);
            }
        }

        async function onProjectChange(projectId) {
            resetSelects('tender');
            hideContent();
            if (!projectId) {
                selectedProject = null;
                return;
            }
            selectedProject = projects.find(p => p.id === projectId);
            const tenderSelect = document.getElementById('tenderSelect');
            tenderSelect.innerHTML = '<option value="">載入中...</option>';
            tenderSelect.disabled = true;
            try {
                const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
                tenders = tenderDocs.docs;
                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (error) {
                showAlert('載入標單失敗', 'error');
                tenderSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            hideContent();
            if (!tenderId) {
                selectedTender = null;
                return;
            }
            selectedTender = tenders.find(t => t.id === tenderId);
            const majorItemSelect = document.getElementById('majorItemSelect');
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            try {
                const [majorItemDocs, floorSettingsDoc] = await Promise.all([
                    safeFirestoreQuery("majorItems", [
                        { field: "tenderId", operator: "==", value: tenderId },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("floorSettings", [
                        { field: "tenderId", operator: "==", value: tenderId },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ])
                ]);

                majorItems = majorItemDocs.docs;
                populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
                
                tenderFloors = floorSettingsDoc.docs.length > 0 ? (floorSettingsDoc.docs[0].floors || []) : [];
                tenderFloors.sort(sortFloors);

            } catch (error) {
                showAlert('載入大項目或樓層失敗: ' + error.message, 'error');
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onMajorItemChange(majorItemId) {
            resetSelects('floor');
            hideContent();
            if(!majorItemId) return;
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);

            const memberInfo = selectedProject.members[auth.currentUser.email];
            currentUserRole = memberInfo.role;
            currentUserPermissions = memberInfo.permissions || {};
            const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);

            if (!canAccess) {
                showAlert('您沒有權限設定此專案的空間分配', 'error');
                hideContent();
                return;
            }

            showLoading(true, '載入細項資料...');
            try {
                const detailItemsResult = await safeFirestoreQuery("detailItems", [
                    { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                    { field: "projectId", operator: "==", value: selectedProject.id }
                ]);
                detailItems = detailItemsResult.docs.sort(naturalSequenceSort);
                
                const floorSelect = document.getElementById('floorSelect');
                populateSelect(floorSelect, tenderFloors.map(f => ({id:f, name:f})), '請選擇樓層...', '此標單無樓層設定');
            } catch (error) {
                showAlert('載入細項資料失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }

        async function onFloorChange(floorName) {
            hideContent();
            if(!floorName) {
                selectedFloor = null;
                return;
            }
            selectedFloor = floorName;
            showLoading(true, '載入分配資料...');
            try {
                const [ floorDistributionsResult, spaceSettingsResult, spaceDistributionsResult ] = await Promise.all([
                    safeFirestoreQuery("distributionTable", [
                        { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                        { field: "areaName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("spaceSettings", [
                        { field: "tenderId", operator: "==", value: selectedTender.id },
                        { field: "floorName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("spaceDistribution", [
                        { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                        { field: "floorName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ])
                ]);
                floorDistributions = floorDistributionsResult.docs;
                spaces = spaceSettingsResult.docs.length > 0 ? (spaceSettingsResult.docs[0].spaces || []) : [];
                spaceDistributions = spaceDistributionsResult.docs;
                
                document.getElementById('currentLocation').textContent = `樓層: ${selectedFloor}`;
                buildSpaceDistributionTable();
                showContent();
            } catch (error) {
                showAlert('載入樓層資料失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
        
        function buildSpaceDistributionTable() {
            const tableHeader = document.getElementById('tableHeader');
            const tableBody = document.getElementById('tableBody');
            const noSpacesState = document.getElementById('noSpacesState');
            const tableContainer = document.querySelector('.table-container');

            if (!tableHeader || !tableBody) return;
            
            const itemsForThisFloor = detailItems.filter(item => {
                const floorDist = floorDistributions.find(d => d.detailItemId === item.id);
                return floorDist && floorDist.quantity > 0;
            });

            if (itemsForThisFloor.length === 0) {
                noSpacesState.querySelector('p').textContent = '此樓層無任何已設定數量的細項。';
                noSpacesState.style.display = 'flex';
                tableContainer.style.display = 'none';
                return;
            }

            tableContainer.style.display = '';
            if (spaces.length === 0) {
                noSpacesState.querySelector('p').textContent = '尚未建立任何空間。請點擊「管理空間」按鈕來新增。';
                noSpacesState.style.display = 'flex';
            } else {
                noSpacesState.style.display = 'none';
            }

            let headerHTML = '<tr><th style="width: 80px;">項次</th><th style="width: 250px;">細項名稱</th><th class="total-column">樓層總量</th>';
            if (spaces.length > 0) {
                spaces.forEach(space => headerHTML += `<th class="floor-header">${space}</th>`);
                headerHTML += '<th class="total-column">已分配(空間)</th>';
            }
            headerHTML += '</tr>';
            tableHeader.innerHTML = headerHTML;
            
            let bodyHTML = '';
            itemsForThisFloor.forEach(item => {
                const floorDist = floorDistributions.find(d => d.detailItemId === item.id);
                const floorTotalQuantity = floorDist ? floorDist.quantity : 0;
                
                let rowHTML = `<tr class="item-row" data-total-quantity="${floorTotalQuantity}" data-item-id="${item.id}">`;
                
                rowHTML += `<td>${item.sequence || ''}</td>`;
                rowHTML += `<td><div class="item-info"><div class="item-name">${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'}</div></div></td>`;
                rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${floorTotalQuantity}</strong></td>`;
                
                if (spaces.length > 0) {
                    let distributedInSpaces = 0;
                    spaces.forEach(space => {
                        const spaceDist = spaceDistributions.find(d => d.detailItemId === item.id && d.spaceName === space);
                        const quantity = spaceDist ? spaceDist.quantity : 0;
                        distributedInSpaces += quantity;
                        rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-space="${space}" placeholder="0"></td>`;
                    });
                    const errorClass = distributedInSpaces > floorTotalQuantity ? 'error' : '';
                    rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedInSpaces}</strong></td>`;
                }
                rowHTML += '</tr>';
                bodyHTML += rowHTML;
            });
            tableBody.innerHTML = bodyHTML;

            if (spaces.length > 0) {
                tableBody.querySelectorAll('.quantity-input').forEach(input => input.addEventListener('input', () => onQuantityChange(input)));
            }
        }
        
    async function saveAllSpaceDistributions() { const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution); if (!canAccess) return showAlert('權限不足，無法儲存', 'error'); if (spaces.length === 0) return showAlert('尚未建立任何空間，無法儲存分配。', 'warning'); showLoading(true, '儲存空間分配中...'); try { const batch = db.batch(); const existingDocs = await safeFirestoreQuery("spaceDistribution", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]); existingDocs.docs.forEach(doc => batch.delete(db.collection("spaceDistribution").doc(doc.id))); document.querySelectorAll('.quantity-input').forEach(input => { const quantity = parseInt(input.value) || 0; if (quantity > 0) { const docRef = db.collection("spaceDistribution").doc(); batch.set(docRef, { projectId: selectedProject.id, tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: input.dataset.itemId, floorName: selectedFloor, spaceName: input.dataset.space, quantity: quantity, createdBy: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); } }); await batch.commit(); await onFloorChange(selectedFloor); showAlert('✅ 空間分配已儲存成功！', 'success'); } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); const itemRow = distributedCell.closest('tr'); const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let currentDistributed = 0; allInputsForRow.forEach(input => { currentDistributed += (Number(input.value) || 0); }); if (currentDistributed > totalQuantity) { inputElement.value = (Number(inputElement.value) || 0) - (currentDistributed - totalQuantity); showAlert(`分配總數 (${currentDistributed}) 已超過此樓層總量 (${totalQuantity})，已自動修正。`, 'warning'); currentDistributed = totalQuantity; } const strongTag = distributedCell.querySelector('strong'); if(strongTag) strongTag.textContent = currentDistributed; distributedCell.classList.toggle('error', currentDistributed > totalQuantity); }
    function setupEventListeners() { document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value)); document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value)); document.getElementById('majorItemSelect')?.addEventListener('change', (e) => onMajorItemChange(e.target.value)); document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value)); document.getElementById('saveSpaceDistributionsBtn')?.addEventListener('click', saveAllSpaceDistributions); document.getElementById('spaceManagerBtn')?.addEventListener('click', showSpaceManager); document.getElementById('addCustomSpaceBtn')?.addEventListener('click', addCustomSpace); document.getElementById('clearAllSpacesBtn')?.addEventListener('click', clearAllSpaces); document.getElementById('saveSpaceSettingsBtn')?.addEventListener('click', saveSpaceSettings); document.getElementById('cancelSpaceModalBtn')?.addEventListener('click', () => closeModal('spaceModal')); document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click()); document.getElementById('importInput')?.addEventListener('change', handleFileImport); document.getElementById('exportBtn')?.addEventListener('click', exportToExcel); }
    function exportToExcel() { if (!selectedFloor || detailItems.length === 0) { return showAlert('沒有資料可匯出', 'error'); } const header = ['項次', '項目名稱', '單位', '樓層總量', ...spaces]; const data = [header]; detailItems.forEach(item => { const row = document.querySelector(`tr[data-item-id="${item.id}"]`); if (!row) return; const floorTotal = row.querySelector(`#total-qty-${item.id} strong`)?.textContent || '0'; const rowData = [item.sequence || '', item.name || '', item.unit || '', floorTotal]; if (spaces.length > 0) { spaces.forEach(space => { const input = row.querySelector(`input[data-space="${space}"]`); rowData.push(input ? input.value : '0'); }); } data.push(rowData); }); const worksheet = XLSX.utils.aoa_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedFloor}空間分配`); const fileName = `${selectedProject.name}_${selectedTender.name}_${selectedFloor}_空間分配表.xlsx`; XLSX.writeFile(workbook, fileName); }
    async function handleFileImport(event) { const file = event.target.files[0]; if (!file || !selectedFloor) return; const reader = new FileReader(); reader.onload = async (e) => { try { showLoading(true, "正在讀取 Excel..."); const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, { type: 'array' }); const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); const importedHeader = jsonData[0]; const importedSpaces = importedHeader.slice(4); if (JSON.stringify(importedSpaces) !== JSON.stringify(spaces)) { const newSpaces = importedSpaces.filter(s => !spaces.includes(s)); if (newSpaces.length > 0) { const confirmed = confirm(`偵測到新的空間欄位：\n\n[${newSpaces.join(', ')}]\n\n是否要將這些新空間自動新增至 '${selectedFloor}' 的設定中？`); if (confirmed) { spaces = [...spaces, ...newSpaces]; await _performSaveSpaceSettings(); } else { showAlert('匯入已取消。', 'info'); return; } } } showLoading(true, "正在填入資料..."); jsonData.slice(1).forEach(row => { const sequence = row[0]; const targetItem = detailItems.find(item => String(item.sequence) === String(sequence)); if (targetItem) { spaces.forEach((space, index) => { const quantity = parseInt(row[index + 4]) || 0; const input = document.querySelector(`input[data-item-id="${targetItem.id}"][data-space="${space}"]`); if (input && quantity > 0) { input.value = quantity; } }); const firstInput = document.querySelector(`input[data-item-id="${targetItem.id}"]`); if(firstInput) onQuantityChange(firstInput); } }); showAlert('匯入成功！請檢查表格內容並記得點擊「儲存空間分配」。', 'success'); } catch (error) { showAlert('匯入失敗，請檢查檔案格式是否正確。 ' + error.message, 'error'); } finally { showLoading(false); event.target.value = ''; } }; reader.readAsArrayBuffer(file); }
    function showSpaceManager() { if (!selectedFloor) return showAlert('請先選擇一個樓層', 'warning'); document.getElementById('currentFloorName').textContent = selectedFloor; displayCurrentSpaces(); document.getElementById('spaceModal').style.display = 'flex'; }
    function displayCurrentSpaces() { const container = document.getElementById('currentSpacesList'); container.innerHTML = spaces.length === 0 ? '<p style="color: #6c757d;">尚未設定空間</p>' : spaces.map(space => `<div class="floor-tag"><span>${space}</span><button data-space="${space}" class="remove-floor-btn">&times;</button></div>`).join(''); container.querySelectorAll('.remove-floor-btn').forEach(btn => btn.onclick = () => { spaces = spaces.filter(s => s !== btn.dataset.space); displayCurrentSpaces(); }); }
    function addCustomSpace() { const input = document.getElementById('newSpaceInput'); const values = input.value.trim().toUpperCase(); if (!values) return; const newSpaces = values.split(/,|、/).flatMap(val => { val = val.trim(); if (val.includes('-')) { const [startStr, endStr] = val.split('-'); const prefixMatch = startStr.match(/^\D+/); const prefix = prefixMatch ? prefixMatch[0] : ''; const startNum = parseInt(startStr.replace(prefix, '')); const endNum = parseInt(endStr.replace(/^\D+/, '')); if (!isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) { return Array.from({length: endNum - startNum + 1}, (_, i) => `${prefix}${startNum + i}`); } } return val; }).filter(Boolean); newSpaces.forEach(s => { if (!spaces.includes(s)) spaces.push(s); }); displayCurrentSpaces(); input.value = ''; }
    function clearAllSpaces() { if(confirm('確定要清空所有空間嗎？')){ spaces = []; displayCurrentSpaces(); } }
    async function _performSaveSpaceSettings() { try { const settingData = { tenderId: selectedTender.id, projectId: selectedProject.id, floorName: selectedFloor, spaces: spaces, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; const query = await safeFirestoreQuery("spaceSettings", [{ field: "tenderId", operator: "==", value: selectedTender.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]); if (query.docs.length > 0) { await db.collection("spaceSettings").doc(query.docs[0].id).update(settingData); } else { settingData.createdBy = auth.currentUser.email; settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("spaceSettings").add(settingData); } } catch (error) { throw error; } }
    function saveSpaceSettings() { closeModal('spaceModal'); setTimeout(async () => { showLoading(true, '設定儲存中...'); try { await _performSaveSpaceSettings(); await onFloorChange(selectedFloor); showAlert('✅ 空間設定已儲存！', 'success'); } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }, 10); }
    function resetSelects(from = 'project') { const selects = ['tender', 'majorItem', 'floor', 'space']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } hideContent(); }
    function hideContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('initialEmptyState').style.display = 'flex'; document.getElementById('noSpacesState').style.display = 'none'; }
    function showContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('initialEmptyState').style.display = 'none'; }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if (modal) modal.style.display = 'none'; }
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if (loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const p = loadingEl.querySelector('p'); if (p) p.textContent = message; } }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length-pB.length; }
    function populateSelect(selectEl, options, defaultText, emptyText) { let html = `<option value="">${defaultText}</option>`; if (options.length === 0 && emptyText) { html += `<option value="" disabled>${emptyText}</option>`; } else { options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); } selectEl.innerHTML = html; selectEl.disabled = (options.length === 0); }
    function sortFloors(a, b) { const getFloorParts = (floorStr) => { const s = String(floorStr).toUpperCase(); const buildingPrefixMatch = s.match(/^([^\dBRF]+)/); const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : ''; const floorMatch = s.match(/([B|R]?)(\d+)/); if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0, raw: s }; const [, type, numStr] = floorMatch; const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1; return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10), raw: s }; }; const partsA = getFloorParts(a); const partsB = getFloorParts(b); if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building, 'zh-Hans-CN-u-kn-true'); if (partsA.type !== partsB.type) return partsA.type - partsB.type; if (partsA.type === 0) return partsB.num - partsA.num; if(partsA.num !== partsB.num) return partsA.num - partsB.num; return a.localeCompare(b, 'zh-Hans-CN-u-kn-true'); }
    
        // --- 啟動頁面 ---
        initializePage();

    }); // waitForElement 結束
}
