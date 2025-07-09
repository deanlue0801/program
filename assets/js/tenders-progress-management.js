/**
 * 施工進度管理 (progress-management.js) (SPA 版本 v1.0)
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
        // ... (這部分的程式碼與 space-distribution.js 的 loadProjects 相同)
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
        // ... (這部分的程式碼與 space-distribution.js 的 onProjectChange 相似)
        resetAllSelects();
        if (!projectId) return;
        const tenderSelect = document.getElementById('tenderSelect');
        tenderSelect.disabled = true;
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }], { field: "name", direction: "asc" });
            tenders = tenderDocs.docs;
            populateSelect(tenderSelect, tenders, '請選擇標單...');
        } catch (error) { showAlert('載入標單失敗', 'error'); }
    }
    
    async function onTenderChange(tenderId) {
        // ... (這部分的程式碼與 space-distribution.js 的 onTenderChange 相似)
        resetAllSelects(true);
        if(!tenderId) return;
        selectedTender = tenders.find(t => t.id === tenderId);
        
        // 同時載入大項、樓層、工項設定
        try {
            const [majorItemDocs, floorSettingsDoc, workItemSettingsDoc] = await Promise.all([
                 safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" }),
                 db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get(),
                 db.collection("workItemSettings").where("tenderId", "==", tenderId).limit(1).get()
            ]);
            majorItems = majorItemDocs.docs;
            populateSelect(document.getElementById('majorItemSelect'), majorItems, '請選擇大項目...');
            floors = floorSettingsDoc.empty ? [] : (floorSettingsDoc.docs[0].data().floors || []);
            populateSelect(document.getElementById('floorSelect'), floors.map(f => ({id:f, name:f})), '請選擇樓層...');
            if (!workItemSettingsDoc.empty) {
                workItems = workItemSettingsDoc.docs[0].data().workItems || workItems;
            }
            document.getElementById('newWorkItemInput').value = workItems.join(',');
        } catch (error) { showAlert('載入標單資料失敗', 'error'); }
    }

    async function onFloorChange(floorName) {
        // 載入該樓層的所有空間
        resetAllSelects(true, true);
        if(!floorName) return;
        selectedFloor = floorName;
        try {
            const spaceSettingsDoc = await db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", floorName).limit(1).get();
            spaces = spaceSettingsDoc.empty ? [] : (spaceSettingsDoc.docs[0].data().spaces || []);
            populateSelect(document.getElementById('spaceSelect'), spaces.map(s => ({id:s, name:s})), '請選擇空間...');
        } catch(error) { showAlert('載入空間資料失敗', 'error'); }
    }
    
    async function onSpaceChange(spaceName) {
        if(!spaceName) { hideContent(); return; }
        selectedSpace = spaceName;
        selectedMajorItem = majorItems.find(m => m.id === document.getElementById('majorItemSelect').value);
        
        showLoading(true, "載入進度資料...");
        try {
            // 取得這個空間分配了哪些項目和數量
            const spaceDistDocs = await safeFirestoreQuery("spaceDistribution", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "floorName", operator: "==", value: selectedFloor },
                { field: "spaceName", operator: "==", value: selectedSpace },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id }
            ]);

            // 取得已經存在的進度項目
            const progressItemDocs = await safeFirestoreQuery("progressItems", [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "floorName", operator: "==", value: selectedFloor },
                { field: "spaceName", operator: "==", value: selectedSpace },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id }
            ]);

            // 取得大項下的所有細項定義
            const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]);

            buildProgressTable(spaceDistDocs.docs, progressItemDocs.docs, detailItemDocs.docs);
            showContent();

        } catch (error) {
            showAlert('載入進度資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function buildProgressTable(spaceDists, progressItems, detailItems) {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        
        // 建立表頭
        let headerHTML = '<tr><th>項目名稱</th>';
        workItems.forEach(w => headerHTML += `<th>${w}</th>`);
        headerHTML += '</tr>';
        tableHeader.innerHTML = headerHTML;
        
        // 建立表格內容
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

        // 綁定狀態變更事件
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
                // 如果不存在，則新建一筆
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
                // 如果存在，則更新
                const docId = querySnapshot.docs[0].id;
                const updateData = {};
                updateData[`workStatuses.${workItem}`] = newStatus;
                updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("progressItems").doc(docId).update(updateData);
            }
            console.log(`Status for ${uniqueId} - ${workItem} updated to ${newStatus}`);
        } catch (error) {
            showAlert('儲存狀態失敗: ' + error.message, 'error');
            // 還原下拉選單的值
            selectElement.value = selectElement.querySelector('option[selected]').value;
        }
    }

    // --- 事件綁定 ---
    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', hideContent); // 選擇大項時先清空內容
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
            // 如果當前有顯示表格，重新渲染
            if (selectedSpace) {
                onSpaceChange(selectedSpace);
            }
        } catch(error) { showAlert('儲存工項設定失敗: ' + error.message, 'error'); }
    }

    // --- 輔助函數 ---
    function populateSelect(selectEl, options, defaultText) {
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
        options.forEach(opt => {
            selectEl.innerHTML += `<option value="${opt.id || opt}">${opt.name || opt}</option>`;
        });
        selectEl.disabled = false;
    }

    function resetAllSelects(keepProject = false) {
        if (!keepProject) populateSelect(document.getElementById('projectSelect'), [], '請選擇專案...');
        populateSelect(document.getElementById('tenderSelect'), [], '請先選擇專案');
        populateSelect(document.getElementById('majorItemSelect'), [], '請先選擇標單');
        populateSelect(document.getElementById('floorSelect'), [], '請先選擇標單');
        populateSelect(document.getElementById('spaceSelect'), [], '請先選擇樓層');
        hideContent();
    }

    function hideContent() {
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('initialEmptyState').style.display = 'flex';
    }

    function showContent() {
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('initialEmptyState').style.display = 'none';
        document.getElementById('currentLocation').textContent = `${selectedFloor} / ${selectedSpace}`;
    }

    function showLoading(isLoading, message = '載入中...') { /* ... */ }
    function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
    
    // --- 頁面啟動點 ---
    initializePage();
}
