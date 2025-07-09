/**
 * 空間分配管理系統 (space-distribution.js) (SPA 版本 v2.5 - 修正Modal關閉BUG)
 */
function initSpaceDistributionPage() {
    
    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], tenderFloors = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null, selectedFloor = null;

    let detailItems = []; 
    let floorDistributions = [], spaceDistributions = [];
    let spaces = []; 

    // --- 初始化與資料載入 ---
    async function initializePage() {
        console.log("🚀 初始化獨立空間分配頁面...");
        if (!currentUser) return showAlert("無法獲取用戶資訊", "error");

        setupEventListeners();
        await loadProjects();
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

    async function onProjectChange(projectId) {
        resetSelect('tenderSelect', '請先選擇專案');
        resetSelect('majorItemSelect', '請先選擇標單');
        resetSelect('floorSelect', '請先選擇大項');
        hideContent();
        if (!projectId) return;

        selectedProject = projects.find(p => p.id === projectId);
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
    
    async function onTenderChange(tenderId) {
        resetSelect('majorItemSelect', '請先選擇標單');
        resetSelect('floorSelect', '請先選擇大項');
        hideContent();
        if (!tenderId) return;

        selectedTender = tenders.find(t => t.id === tenderId);
        const majorItemSelect = document.getElementById('majorItemSelect');
        majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        majorItemSelect.disabled = true;

        try {
            const [majorItemDocs, floorSettingsDoc] = await Promise.all([
                 safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" }),
                 db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get()
            ]);

            majorItems = majorItemDocs.docs;
            majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(item => majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`);
            majorItemSelect.disabled = false;
            
            tenderFloors = floorSettingsDoc.empty ? [] : (floorSettingsDoc.docs[0].data().floors || []);

        } catch (error) {
            showAlert('載入大項目或樓層失敗', 'error');
            majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }
    
    async function onMajorItemChange(majorItemId) {
        resetSelect('floorSelect', '請先選擇大項');
        hideContent();
        detailItems = [];
        if(!majorItemId) return;
        
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        
        showLoading(true, '載入細項資料...');
        try {
            const detailItemsResult = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]);
            detailItems = detailItemsResult.docs.sort(naturalSequenceSort);
            
            const floorSelect = document.getElementById('floorSelect');
            floorSelect.innerHTML = '<option value="">請選擇樓層...</option>';
            if(tenderFloors.length > 0) {
                tenderFloors.forEach(floor => floorSelect.innerHTML += `<option value="${floor}">${floor}</option>`);
                floorSelect.disabled = false;
            } else {
                floorSelect.innerHTML = '<option value="">此標單無樓層設定</option>';
            }
        } catch (error) {
            showAlert('載入細項資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function onFloorChange(floorName) {
        hideContent();
        if(!floorName) return;
        selectedFloor = floorName;
        
        showLoading(true, '載入分配資料...');
        try {
            const [
                floorDistributionsResult,
                spaceSettingsResult,
                spaceDistributionsResult
            ] = await Promise.all([
                safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "areaName", operator: "==", value: selectedFloor }]),
                db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get(),
                safeFirestoreQuery("spaceDistribution", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }])
            ]);

            floorDistributions = floorDistributionsResult.docs;
            spaces = spaceSettingsResult.empty ? [] : (spaceSettingsResult.docs[0].data().spaces || []);
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
        const tableContainer = document.querySelector('.table-container');

        if (!tableHeader || !tableBody) return;
        tableContainer.style.display = 'table';
        document.getElementById('noSpacesState').style.display = 'none';

        let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">樓層總量</th>';
        
        if (spaces.length > 0) {
            spaces.forEach(space => headerHTML += `<th class="floor-header">${space}</th>`);
            headerHTML += '<th class="total-column">已分配(空間)</th></tr>';
        } else {
            headerHTML += '<th>空間分配</th></tr>';
        }
        tableHeader.innerHTML = headerHTML;

        let bodyHTML = '';
        
        detailItems.forEach((item, index) => {
            const floorDist = floorDistributions.find(d => d.detailItemId === item.id);
            const floorTotalQuantity = floorDist ? floorDist.quantity : 0;
            
            let rowHTML = `<tr class="item-row" data-total-quantity="${floorTotalQuantity}" data-item-id="${item.id}">`;
            rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'}</div></div></td>`;
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
            } else {
                rowHTML += `<td style="text-align: center; color: #6c757d; background-color: #f8f9fa;">請先點擊「管理空間」按鈕新增空間</td>`;
            }
            
            rowHTML += '</tr>';
            bodyHTML += rowHTML;
        });

        tableBody.innerHTML = bodyHTML;
        
        if (spaces.length > 0) {
             tableBody.querySelectorAll('.quantity-input').forEach(input => {
                input.addEventListener('input', () => onQuantityChange(input));
            });
        }
    }
    
    function onQuantityChange(inputElement) {
        const itemId = inputElement.dataset.itemId;
        const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`);
        const distributedCell = document.getElementById(`distributed-${itemId}`);
        const itemRow = distributedCell.closest('tr');
        const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0;
        
        let currentDistributed = 0;
        allInputsForRow.forEach(input => {
            currentDistributed += (Number(input.value) || 0);
        });

        if (currentDistributed > totalQuantity) {
             inputElement.value = (Number(inputElement.value) || 0) - (currentDistributed - totalQuantity);
             showAlert(`分配總數 (${currentDistributed}) 已超過此樓層總量 (${totalQuantity})，已自動修正。`, 'warning');
             currentDistributed = totalQuantity;
        }

        const strongTag = distributedCell.querySelector('strong');
        if(strongTag) strongTag.textContent = currentDistributed;
        
        distributedCell.classList.toggle('error', currentDistributed > totalQuantity);
    }

    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', (e) => onMajorItemChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value));

        document.getElementById('saveSpaceDistributionsBtn')?.addEventListener('click', saveAllSpaceDistributions);
        document.getElementById('spaceManagerBtn')?.addEventListener('click', showSpaceManager);
        document.getElementById('addCustomSpaceBtn')?.addEventListener('click', addCustomSpace);
        document.getElementById('clearAllSpacesBtn')?.addEventListener('click', clearAllSpaces);
        document.getElementById('saveSpaceSettingsBtn')?.addEventListener('click', saveSpaceSettings);
        document.getElementById('cancelSpaceModalBtn')?.addEventListener('click', () => closeModal('spaceModal'));
        
        document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click());
        document.getElementById('importInput')?.addEventListener('change', handleFileImport);
        document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);
    }
    
    function exportToExcel() {
        if (!selectedFloor || detailItems.length === 0) {
            return showAlert('沒有資料可匯出', 'error');
        }

        const header = ['項次', '項目名稱', '單位', '樓層總量', ...spaces];
        const data = [header];

        detailItems.forEach(item => {
            const row = document.querySelector(`tr[data-item-id="${item.id}"]`);
            if (!row) return;

            const floorTotal = row.querySelector(`#total-qty-${item.id} strong`)?.textContent || '0';
            const rowData = [item.sequence || '', item.name || '', item.unit || '', floorTotal];
            
            if (spaces.length > 0) {
                 spaces.forEach(space => {
                    const input = row.querySelector(`input[data-space="${space}"]`);
                    rowData.push(input ? input.value : '0');
                });
            }
            data.push(rowData);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedFloor}空間分配`);
        
        const fileName = `${selectedProject.name}_${selectedTender.name}_${selectedFloor}_空間分配表.xlsx`;
        XLSX.writeFile(workbook, fileName);
    }

    async function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file || !selectedFloor) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                showLoading(true, "正在讀取 Excel...");
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const importedHeader = jsonData[0];
                const importedSpaces = importedHeader.slice(4);

                if (JSON.stringify(importedSpaces) !== JSON.stringify(spaces)) {
                    const newSpaces = importedSpaces.filter(s => !spaces.includes(s));
                    if (newSpaces.length > 0) {
                        const confirmed = confirm(`偵測到新的空間欄位：\n\n[${newSpaces.join(', ')}]\n\n是否要將這些新空間自動新增至 '${selectedFloor}' 的設定中？`);
                        if (confirmed) {
                            spaces = [...spaces, ...newSpaces];
                            await saveSpaceSettings(true); 
                        } else {
                            showAlert('匯入已取消。', 'info');
                            return;
                        }
                    }
                }
                
                showLoading(true, "正在填入資料...");
                jsonData.slice(1).forEach(row => {
                    const sequence = row[0];
                    const targetItem = detailItems.find(item => String(item.sequence) === String(sequence));
                    
                    if (targetItem) {
                        spaces.forEach((space, index) => {
                            const quantity = parseInt(row[index + 4]) || 0;
                            const input = document.querySelector(`input[data-item-id="${targetItem.id}"][data-space="${space}"]`);
                            if (input && quantity > 0) {
                                input.value = quantity;
                            }
                        });
                        const firstInput = document.querySelector(`input[data-item-id="${targetItem.id}"]`);
                        if(firstInput) onQuantityChange(firstInput);
                    }
                });

                showAlert('匯入成功！請檢查表格內容並記得點擊「儲存空間分配」。', 'success');
            } catch (error) {
                showAlert('匯入失敗，請檢查檔案格式是否正確。 ' + error.message, 'error');
            } finally {
                showLoading(false);
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function saveAllSpaceDistributions() {
        if (spaces.length === 0) {
            return showAlert('尚未建立任何空間，無法儲存分配。', 'warning');
        }
        showLoading(true, '儲存空間分配中...');
        try {
            const batch = db.batch();
            
            const existingDocs = await safeFirestoreQuery("spaceDistribution", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }]);
            existingDocs.docs.forEach(doc => {
                batch.delete(db.collection("spaceDistribution").doc(doc.id));
            });

            document.querySelectorAll('.quantity-input').forEach(input => {
                const quantity = parseInt(input.value) || 0;
                if (quantity > 0) {
                    const docRef = db.collection("spaceDistribution").doc();
                    const data = {
                        tenderId: selectedTender.id,
                        majorItemId: selectedMajorItem.id,
                        detailItemId: input.dataset.itemId,
                        floorName: selectedFloor,
                        spaceName: input.dataset.space,
                        quantity: quantity,
                        createdBy: currentUser.email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(docRef, data);
                }
            });
            await batch.commit();
            await onFloorChange(selectedFloor);
            showAlert('✅ 空間分配已儲存成功！', 'success');

        } catch (error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    function showSpaceManager() {
        if (!selectedFloor) return showAlert('請先選擇一個樓層', 'warning');
        document.getElementById('currentFloorName').textContent = selectedFloor;
        displayCurrentSpaces();
        document.getElementById('spaceModal').style.display = 'flex';
    }

    function displayCurrentSpaces() {
        const container = document.getElementById('currentSpacesList');
        container.innerHTML = spaces.length === 0 
            ? '<p style="color: #6c757d;">尚未設定空間</p>' 
            : spaces.map(space => 
                `<div class="floor-tag"><span>${space}</span><button data-space="${space}" class="remove-floor-btn">&times;</button></div>`
              ).join('');
        container.querySelectorAll('.remove-floor-btn').forEach(btn => btn.onclick = () => {
            spaces = spaces.filter(s => s !== btn.dataset.space);
            displayCurrentSpaces();
        });
    }

    function addCustomSpace() {
        const input = document.getElementById('newSpaceInput');
        const values = input.value.trim().toUpperCase();
        if (!values) return;

        const newSpaces = values.split(/,|、/).flatMap(val => {
            val = val.trim();
            if (val.includes('-')) {
                const [startStr, endStr] = val.split('-');
                const prefixMatch = startStr.match(/^\D+/);
                const prefix = prefixMatch ? prefixMatch[0] : '';
                const startNum = parseInt(startStr.replace(prefix, ''));
                const endNum = parseInt(endStr.replace(/^\D+/, ''));
                if (!isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) {
                    return Array.from({length: endNum - startNum + 1}, (_, i) => `${prefix}${startNum + i}`);
                }
            }
            return val;
        }).filter(Boolean);

        newSpaces.forEach(s => {
            if (!spaces.includes(s)) spaces.push(s);
        });
        
        displayCurrentSpaces();
        input.value = '';
    }
    
    function clearAllSpaces() {
        if(confirm('確定要清空所有空間嗎？')){
            spaces = [];
            displayCurrentSpaces();
        }
    }

    // --- 【第 545 行：開始，這是本次修正的核心函數】 ---
    async function saveSpaceSettings(isSilent = false) {
        if (isSilent) {
            try {
                const settingData = { tenderId: selectedTender.id, floorName: selectedFloor, spaces: spaces, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                const query = await db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get();
                if (!query.empty) {
                    await db.collection("spaceSettings").doc(query.docs[0].id).update(settingData);
                } else {
                    settingData.createdBy = currentUser.email;
                    settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection("spaceSettings").add(settingData);
                }
            } catch (error) {
                throw error;
            }
            return;
        }

        // 修正後的正常流程
        closeModal('spaceModal');
        showLoading(true, '設定儲存中...');

        try {
            const settingData = { tenderId: selectedTender.id, floorName: selectedFloor, spaces: spaces, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const query = await db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get();
            if (!query.empty) {
                await db.collection("spaceSettings").doc(query.docs[0].id).update(settingData);
            } else {
                settingData.createdBy = currentUser.email;
                settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("spaceSettings").add(settingData);
            }
            
            await onFloorChange(selectedFloor);
            showAlert('✅ 空間設定已儲存！', 'success');

        } catch (error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    // --- 【第 591 行：結束，以上是本次修正的核心函數】 ---
    
    function resetSelect(selectId, defaultText) {
        const select = document.getElementById(selectId);
        select.innerHTML = `<option value="">${defaultText}</option>`;
        select.disabled = true;
    }
    
    function hideContent() {
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('initialEmptyState').style.display = 'flex';
        document.getElementById('noSpacesState').style.display = 'none';
    }

    function showContent() {
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('initialEmptyState').style.display = 'none';
        document.getElementById('noSpacesState').style.display = 'none';
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    function showLoading(isLoading, message='載入中...') {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            const p = loadingEl.querySelector('p');
            if (p) p.textContent = message;
        }
    }
    
    function naturalSequenceSort(a, b) {
        const re = /(\d+(\.\d+)?)|(\D+)/g;
        const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[];
        for(let i=0; i<Math.min(pA.length, pB.length); i++) {
            const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]);
            if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;}
            else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]);
        }
        return pA.length-pB.length;
    }
    
    initializePage();
}
