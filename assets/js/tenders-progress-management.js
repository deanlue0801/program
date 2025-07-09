/**
 * 施工進度管理 (progress-management.js) (SPA 版本 v2.1 - 修正無空間時的BUG)
 */
function initProgressManagementPage() {

    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], floors = [], spaces = [];
    let selectedTender = null, selectedMajorItem = null, selectedFloor = null, selectedSpace = null;
    let workItems = ['配管', '配線', '設備安裝', '測試']; 
    let currentViewMode = 'floor'; // 'floor' or 'space'

    // --- 初始化與資料載入 ---
    async function initializePage() {
        if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
        setupEventListeners();
        await loadProjects();
    }

    async function loadProjects() {
        showLoading(true, '載入專案中...');
        try {
            const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            projects = projectDocs.docs;
            populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
        } catch (error) { showAlert('載入專案失敗', 'error'); } finally { showLoading(false); }
    }
    
    async function onProjectChange(projectId) {
        resetSelects('tender'); 
        if (!projectId) return;
        const tenderSelect = document.getElementById('tenderSelect');
        tenderSelect.disabled = true;
        tenderSelect.innerHTML = `<option value="">載入中...</option>`;
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }], { field: "name", direction: "asc" });
            tenders = tenderDocs.docs;
            populateSelect(tenderSelect, tenders, '請選擇標單...');
        } catch (error) { showAlert('載入標單失敗', 'error'); }
    }
    
    async function onTenderChange(tenderId) {
        resetSelects('majorItem');
        if(!tenderId) return;
        selectedTender = tenders.find(t => t.id === tenderId);
        
        const majorItemSelect = document.getElementById('majorItemSelect');
        majorItemSelect.disabled = true;
        majorItemSelect.innerHTML = `<option value="">載入中...</option>`;
        
        try {
            const [majorItemDocs, floorSettingsDoc, workItemSettingsDoc] = await Promise.all([
                 safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" }),
                 db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get(),
                 db.collection("workItemSettings").where("tenderId", "==", tenderId).limit(1).get()
            ]);
            majorItems = majorItemDocs.docs;
            populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
            floors = floorSettingsDoc.empty ? [] : (floorSettingsDoc.docs[0].data().floors || []);
             if (!workItemSettingsDoc.empty) {
                workItems = workItemSettingsDoc.docs[0].data().workItems || workItems;
            }
            document.getElementById('newWorkItemInput').value = workItems.join(',');
        } catch (error) { showAlert('載入標單資料失敗', 'error'); }
    }

    async function onMajorItemChange(majorItemId) {
        resetSelects('floor');
        if(!majorItemId) return;
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        populateSelect(document.getElementById('floorSelect'), floors.map(f => ({id:f, name:f})), '請選擇樓層...');
    }

    async function onFloorChange(floorName) {
        resetSelects('space');
        if(!floorName) return;
        selectedFloor = floorName;
        
        currentViewMode = 'floor';
        loadProgressData(); 
    }
    
    async function onSpaceChange(spaceName) {
        selectedSpace = spaceName;
        if(spaceName) {
            currentViewMode = 'space';
            document.getElementById('spaceFilterContainer').style.display = 'none';
        } else {
            currentViewMode = 'floor';
        }
        loadProgressData();
    }

    // --- 【第 119 行：開始，這是本次修正的核心函數】 ---
    async function loadProgressData() {
        if (!selectedFloor) {
            hideContent();
            return;
        }
        
        showLoading(true, "載入進度資料...");
        try {
            // 基礎查詢條件
            const baseQuery = [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                { field: "floorName", operator: "==", value: selectedFloor }
            ];

            // 1. **主要資料來源**：從「樓層分配表」取得總數
            const floorDistQuery = [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                { field: "areaName", operator: "==", value: selectedFloor } // 注意這裡的欄位是 areaName
            ];
            const floorDistDocs = await safeFirestoreQuery("distributionTable", floorDistQuery);

            // 2. **輔助資料來源**：取得所有相關的空間分配、進度項目、細項定義和空間設定
            const [spaceDistDocs, progressItemDocs, detailItemDocs, spaceSettingsDoc] = await Promise.all([
                safeFirestoreQuery("spaceDistribution", baseQuery),
                safeFirestoreQuery("progressItems", baseQuery),
                safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]),
                db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get()
            ]);

            // 如果是單一空間檢視，需要過濾樓層總數資料
            const finalFloorDistDocs = (currentViewMode === 'space' && selectedSpace)
                ? floorDistDocs.docs.filter(doc => spaceDistDocs.docs.some(sDoc => sDoc.detailItemId === doc.detailItemId))
                : floorDistDocs.docs;

            spaces = spaceSettingsDoc.empty ? [] : (spaceSettingsDoc.docs[0].data().spaces || []);
            if (currentViewMode === 'floor') {
                populateSelect(document.getElementById('spaceSelect'), spaces.map(s => ({id:s, name:s})), '可選，以檢視單一空間...');
                buildSpaceFilter();
            }
            
            buildProgressTable(finalFloorDistDocs, spaceDistDocs.docs, progressItemDocs.docs, detailItemDocs.docs);
            showContent();

        } catch (error) {
            showAlert('載入進度資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function buildSpaceFilter() {
        const container = document.getElementById('spaceFilterCheckboxes');
        const filterContainer = document.getElementById('spaceFilterContainer');
        
        if (spaces.length > 1) {
            container.innerHTML = spaces.map(space => `
                <label class="checkbox-label">
                    <input type="checkbox" class="space-filter-checkbox" value="${space}" checked>
                    ${space}
                </label>
            `).join('');
            filterContainer.style.display = 'block';

            container.querySelectorAll('.space-filter-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', filterTableBySpace);
            });
        } else {
            filterContainer.style.display = 'none';
        }
    }
    
    function filterTableBySpace() {
        const checkedSpaces = Array.from(document.querySelectorAll('.space-filter-checkbox:checked')).map(cb => cb.value);
        document.querySelectorAll('#progressTable tbody tr').forEach(row => {
            if (checkedSpaces.includes(row.dataset.spaceName)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    function buildProgressTable(floorDists, spaceDists, progressItems, detailItems) {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        
        let headerHTML = '<tr><th>項目名稱</th>';
        if (currentViewMode === 'floor') {
            headerHTML += '<th>所在空間</th>';
        }
        workItems.forEach(w => headerHTML += `<th>${w}</th>`);
        headerHTML += '</tr>';
        tableHeader.innerHTML = headerHTML;
        
        let bodyHTML = '';

        floorDists.forEach(floorDist => {
            const detailItem = detailItems.find(d => d.id === floorDist.detailItemId);
            if (!detailItem) return;

            // 建立一個查找表，來決定每個編號的設備在哪個空間
            const itemSpaceDists = spaceDists.filter(sd => sd.detailItemId === floorDist.detailItemId);
            const spaceLookup = [];
            let cumulativeQty = 0;
            itemSpaceDists.forEach(sd => {
                const start = cumulativeQty + 1;
                const end = cumulativeQty + sd.quantity;
                spaceLookup.push({ space: sd.spaceName, start, end });
                cumulativeQty += sd.quantity;
            });

            const totalQuantity = (currentViewMode === 'space' && selectedSpace)
                ? itemSpaceDists.find(sd => sd.spaceName === selectedSpace)?.quantity || 0
                : floorDist.quantity;

            for (let i = 1; i <= totalQuantity; i++) {
                const uniqueId = `${floorDist.detailItemId}-${i}`;
                const progressItem = progressItems.find(p => p.uniqueId === uniqueId);
                const spaceInfo = spaceLookup.find(sl => i >= sl.start && i <= sl.end);
                const spaceName = spaceInfo ? spaceInfo.space : "尚未分配";

                bodyHTML += `<tr data-unique-id="${uniqueId}" data-detail-item-id="${floorDist.detailItemId}" data-space-name="${spaceName}">`;
                bodyHTML += `<td>${detailItem.name} #${i}</td>`;
                if (currentViewMode === 'floor') {
                    bodyHTML += `<td>${spaceName}</td>`;
                }
                
                workItems.forEach(workItem => {
                    const currentStatus = progressItem?.workStatuses?.[workItem] || '未施工';
                    bodyHTML += `<td>
                        <select class="form-select progress-status-select" data-work-item="${workItem}">
                            <option value="未施工" ${currentStatus === '未施工' ? 'selected' : ''}>未施工</option>
                            <option value="施工中" ${currentStatus === '施工中' ? 'selected' : ''}>施工中</option>
                            <option value="已完成" ${currentStatus === '已完成' ? 'selected' : ''}>已完成</option>
                        </select>
                    </td>`;
                });
                bodyHTML += '</tr>';
            }
        });
        tableBody.innerHTML = bodyHTML;

        tableBody.querySelectorAll('.progress-status-select').forEach(select => {
            select.addEventListener('change', (e) => onStatusChange(e.target));
        });
    }

    // --- 【第 274 行：結束，以上是本次修正的核心函數】 ---

    async function onStatusChange(selectElement) {
        const tr = selectElement.closest('tr');
        const uniqueId = tr.dataset.uniqueId;
        const detailItemId = tr.dataset.detailItemId;
        const spaceName = tr.dataset.spaceName;
        const workItem = selectElement.dataset.workItem;
        const newStatus = selectElement.value;
        
        try {
            const querySnapshot = await db.collection("progressItems").where("uniqueId", "==", uniqueId).limit(1).get();
            
            if (querySnapshot.empty) {
                const docRef = db.collection("progressItems").doc();
                await docRef.set({
                    tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: detailItemId,
                    floorName: selectedFloor, spaceName: spaceName, uniqueId: uniqueId,
                    workStatuses: { [workItem]: newStatus },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                const docId = querySnapshot.docs[0].id;
                const updateData = { [`workStatuses.${workItem}`]: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                await db.collection("progressItems").doc(docId).update(updateData);
            }
            console.log(`Status for ${uniqueId} updated.`);
        } catch (error) {
            showAlert('儲存狀態失敗: ' + error.message, 'error');
            // Revert dropdown value on error
        }
    }
    
    function exportToExcel() {
        if (!selectedFloor) return showAlert('沒有資料可匯出', 'error');

        const header = ['項次', '項目名稱'];
        if (currentViewMode === 'floor') {
            header.push('所在空間');
        }
        header.push(...workItems);
        const data = [header];

        document.querySelectorAll('#progressTable tbody tr').forEach(row => {
            if (row.style.display === 'none') return;
            
            const rowData = [];
            const itemName = row.cells[0].textContent;
            const sequence = itemName.split('#')[1] || '';
            const name = itemName.split('#')[0].trim();
            rowData.push(sequence, name);

            let cellIndex = 1;
            if (currentViewMode === 'floor') {
                rowData.push(row.cells[cellIndex].textContent);
                cellIndex++;
            }
            
            workItems.forEach(() => {
                const select = row.cells[cellIndex].querySelector('select');
                rowData.push(select ? select.value : '');
                cellIndex++;
            });

            data.push(rowData);
        });
        
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '施工進度');
        const fileName = `${selectedTender.name}_${selectedFloor}_施工進度.xlsx`;
        XLSX.writeFile(workbook, fileName);
    }
    
    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file || !selectedFloor) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            showLoading(true, "正在讀取 Excel...");
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // 在這裡實現完整的匯入邏輯
                showAlert('匯入功能正在開發中...', 'info');

            } catch (error) {
                showAlert('匯入失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
                event.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', (e) => onMajorItemChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value));
        document.getElementById('spaceSelect')?.addEventListener('change', (e) => onSpaceChange(e.target.value));
        
        document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click());
        document.getElementById('importInput')?.addEventListener('change', handleFileImport);
        document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);

        document.getElementById('workItemsManagerBtn')?.addEventListener('click', () => {
            if(!selectedTender) return showAlert('請先選擇一個標單', 'warning');
            document.getElementById('workItemsModal').style.display = 'flex';
        });
        document.getElementById('saveWorkItemsBtn')?.addEventListener('click', saveWorkItems);
        document.getElementById('cancelWorkItemsModalBtn')?.addEventListener('click', () => closeModal('workItemsModal'));
    }

    async function saveWorkItems() {
        const input = document.getElementById('newWorkItemInput').value.trim();
        if (!input) return showAlert('工項不能為空', 'error');
        
        const newWorkItems = input.split(/,|、/).map(item => item.trim()).filter(Boolean);
        workItems = newWorkItems;
        
        try {
            const settingData = {
                tenderId: selectedTender.id,
                workItems: workItems,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const query = await db.collection("workItemSettings").where("tenderId", "==", selectedTender.id).limit(1).get();
            if (!query.empty) {
                await db.collection("workItemSettings").doc(query.docs[0].id).update(settingData);
            } else {
                settingData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("workItemSettings").add(settingData);
            }
            showAlert('工項設定已儲存', 'success');
            closeModal('workItemsModal');
            if (selectedFloor) {
                loadProgressData();
            }
        } catch(error) { showAlert('儲存工項設定失敗: ' + error.message, 'error'); }
    }

    function populateSelect(selectEl, options, defaultText) {
        if(!selectEl) return;
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
        options.forEach(opt => {
            selectEl.innerHTML += `<option value="${opt.id || opt}">${opt.name || opt}</option>`;
        });
        selectEl.disabled = false;
    }

    function resetSelects(from = 'project') {
        const selects = ['tender', 'majorItem', 'floor', 'space'];
        const labels = {
            'tender': '標單', 'majorItem': '大項', 'floor': '樓層', 'space': '空間'
        };
        const startIndex = selects.indexOf(from);
        
        if (startIndex === -1) return;

        for (let i = startIndex; i < selects.length; i++) {
            const selectId = selects[i] + 'Select';
            const el = document.getElementById(selectId);
            if(el) {
                let label = labels[selects[i-1]] || '上一個項目';
                if (selects[i] === 'space') {
                    el.innerHTML = `<option value="">可選，以檢視單一空間...</option>`;
                } else {
                    el.innerHTML = `<option value="">請先選擇${label}</option>`;
                }
                el.disabled = true;
            }
        }
        hideContent();
    }

    function hideContent() {
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('initialEmptyState').style.display = 'flex';
    }

    function showContent() {
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('initialEmptyState').style.display = 'none';
        
        let locationText = `${selectedFloor || ''}`;
        if (currentViewMode === 'space' && selectedSpace) {
            locationText += ` / ${selectedSpace}`;
        }
        document.getElementById('currentLocation').textContent = locationText;
    }

    function showLoading(isLoading, message = '載入中...') {
        const loadingEl = document.getElementById('loading');
        if(loadingEl) {
             loadingEl.style.display = isLoading ? 'flex' : 'none';
             const p = loadingEl.querySelector('p');
             if (p) p.textContent = message;
        }
    }
    
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if(modal) modal.style.display = 'none';
    }
    
    initializePage();
}
