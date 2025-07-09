/**
 * 施工進度管理 (progress-management.js) (SPA 版本 v1.1 - 修正下拉選單BUG)
 */
function initProgressManagementPage() {

    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], floors = [], spaces = [];
    let selectedTender = null, selectedMajorItem = null, selectedFloor = null, selectedSpace = null;
    let workItems = ['配管', '配線', '設備安裝', '測試']; // 預設工項
    
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
        } catch (error) {
            showAlert('載入專案失敗', 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // --- 【第 41 行：開始，這是本次修正的核心邏輯】 ---

    async function onProjectChange(projectId) {
        resetSelects('tender'); // 重設標單及之後的選單
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
        resetSelects('majorItem'); // 重設大項及之後的選單
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
        resetSelects('floor'); // 重設樓層及之後的選單
        if(!majorItemId) return;
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        populateSelect(document.getElementById('floorSelect'), floors.map(f => ({id:f, name:f})), '請選擇樓層...');
    }

    async function onFloorChange(floorName) {
        resetSelects('space'); // 重設空間選單
        if(!floorName) return;
        selectedFloor = floorName;
        
        const spaceSelect = document.getElementById('spaceSelect');
        spaceSelect.disabled = true;
        spaceSelect.innerHTML = `<option value="">載入中...</option>`;
        try {
            const spaceSettingsDoc = await db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", floorName).limit(1).get();
            spaces = spaceSettingsDoc.empty ? [] : (spaceSettingsDoc.docs[0].data().spaces || []);
            populateSelect(spaceSelect, spaces.map(s => ({id:s, name:s})), '請選擇空間...');
        } catch(error) { showAlert('載入空間資料失敗', 'error'); }
    }
    
    async function onSpaceChange(spaceName) {
        hideContent(true); // 隱藏表格內容，但保留主區塊
        if(!spaceName) return; 
        selectedSpace = spaceName;
        
        showLoading(true, "載入進度資料...");
        try {
            const spaceDistDocs = await safeFirestoreQuery("spaceDistribution", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "floorName", operator: "==", value: selectedFloor },
                { field: "spaceName", operator: "==", value: selectedSpace },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id }
            ]);

            const progressItemDocs = await safeFirestoreQuery("progressItems", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "floorName", operator: "==", value: selectedFloor },
                { field: "spaceName", operator: "==", value: selectedSpace },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id }
            ]);

            const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]);

            buildProgressTable(spaceDistDocs.docs, progressItemDocs.docs, detailItemDocs.docs);
            showContent();

        } catch (error) {
            showAlert('載入進度資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- 【第 142 行：結束，這是本次修正的核心邏輯】 ---

    function buildProgressTable(spaceDists, progressItems, detailItems) {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        
        let headerHTML = '<tr><th>項目名稱</th>';
        workItems.forEach(w => headerHTML += `<th>${w}</th>`);
        headerHTML += '</tr>';
        tableHeader.innerHTML = headerHTML;
        
        let bodyHTML = '';
        spaceDists.forEach(dist => {
            const detailItem = detailItems.find(d => d.id === dist.detailItemId);
            if (!detailItem) return;
            
            for (let i = 1; i <= dist.quantity; i++) {
                const uniqueId = `${dist.detailItemId}-${i}`;
                const progressItem = progressItems.find(p => p.uniqueId === uniqueId);
                
                bodyHTML += `<tr data-unique-id="${uniqueId}" data-detail-item-id="${dist.detailItemId}">`;
                bodyHTML += `<td>${detailItem.name} #${i}</td>`;
                
                workItems.forEach(workItem => {
                    const currentStatus = progressItem ? (progressItem.workStatuses ? progressItem.workStatuses[workItem] : '未施工') : '未施工';
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

    async function onStatusChange(selectElement) {
        const uniqueId = selectElement.closest('tr').dataset.uniqueId;
        const detailItemId = selectElement.closest('tr').dataset.detailItemId;
        const workItem = selectElement.dataset.workItem;
        const newStatus = selectElement.value;
        
        try {
            const querySnapshot = await db.collection("progressItems").where("uniqueId", "==", uniqueId).limit(1).get();
            
            if (querySnapshot.empty) {
                const docRef = db.collection("progressItems").doc();
                await docRef.set({
                    tenderId: selectedTender.id,
                    majorItemId: selectedMajorItem.id,
                    detailItemId: detailItemId,
                    floorName: selectedFloor,
                    spaceName: selectedSpace,
                    uniqueId: uniqueId,
                    workStatuses: {
                        [workItem]: newStatus
                    },
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                const docId = querySnapshot.docs[0].id;
                const updateData = {};
                updateData[`workStatuses.${workItem}`] = newStatus;
                updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("progressItems").doc(docId).update(updateData);
            }
            console.log(`Status for ${uniqueId} - ${workItem} updated to ${newStatus}`);
        } catch (error) {
            showAlert('儲存狀態失敗: ' + error.message, 'error');
            selectElement.value = selectElement.querySelector('option[selected]').value;
        }
    }

    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', (e) => onMajorItemChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value));
        document.getElementById('spaceSelect')?.addEventListener('change', (e) => onSpaceChange(e.target.value));
        
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
            if (selectedSpace) {
                onSpaceChange(selectedSpace);
            }
        } catch(error) { showAlert('儲存工項設定失敗: ' + error.message, 'error'); }
    }

    function populateSelect(selectEl, options, defaultText) {
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
        options.forEach(opt => {
            selectEl.innerHTML += `<option value="${opt.id || opt}">${opt.name || opt}</option>`;
        });
        selectEl.disabled = false;
    }
    
    // --- 【第 279 行：新的、更精確的重設函數】 ---
    function resetSelects(from = 'project') {
        const selects = ['project', 'tender', 'space', 'floor', 'majorItem'];
        const startIndex = selects.indexOf(from);
        
        for (let i = startIndex; i < selects.length; i++) {
            const selectId = selects[i] + 'Select';
            const el = document.getElementById(selectId);
            if(el) {
                el.innerHTML = `<option value="">請先選擇${el.previousElementSibling.textContent}</option>`;
                el.disabled = true;
            }
        }
        hideContent();
    }

    function hideContent(keepMainWrapper = false) {
        document.getElementById('mainContent').style.display = 'none';
        if (!keepMainWrapper) {
            document.getElementById('initialEmptyState').style.display = 'flex';
        }
    }

    function showContent() {
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('initialEmptyState').style.display = 'none';
        document.getElementById('currentLocation').textContent = `${selectedFloor} / ${selectedSpace}`;
    }

    function showLoading(isLoading, message = '載入中...') {
        const loadingEl = document.getElementById('loading');
        if(loadingEl) {
             loadingEl.style.display = isLoading ? 'flex' : 'none';
        }
    }
    function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
    
    initializePage();
}
