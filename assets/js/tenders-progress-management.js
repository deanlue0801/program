/**
 * 施工進度管理 (progress-management.js) (SPA 版本 v2.9 - 修正專案載入問題)
 */
function initProgressManagementPage() {

    // --- 頁面級別變數 ---
    let projects = [], tenders = [], majorItems = [], floors = [], spaces = [];
    let selectedTender = null, selectedMajorItem = null, selectedFloor = null, selectedSpace = null;
    let workItems = ['配管', '配線', '設備安裝', '測試']; 
    let currentViewMode = 'floor';
    let allDetailItems = [];
    let allProgressPhotos = [];
    let currentUploadTarget = null; 

    const storage = firebase.storage();

    // --- 初始化 ---
    async function initializePage() {
        if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
        setupEventListeners();
        await loadProjects();
    }

    // --- 資料載入系列函數 ---

    /**
     * 【核心修改】載入專案列表
     * 將原本呼叫 safeFirestoreQuery 的方式，改為直接呼叫 db.collection，以繞過 config 檔內的潛在問題。
     */
    async function loadProjects() {
        showLoading(true, '載入專案中...');
        try {
            // 直接使用 Firestore 標準語法查詢
            const projectQuery = db.collection("projects")
                .where("createdBy", "==", currentUser.email)
                .orderBy("name", "asc");
            
            const projectDocs = await projectQuery.get();
            
            projects = projectDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
        } catch (error) {
            console.error("載入專案時發生錯誤:", error);
            // 如果是索引問題，提供更明確的提示
            if (error.code === 'failed-precondition') {
                showAlert('載入專案失敗：缺少資料庫索引。請至 Firebase -> Firestore Database -> 索引 頁面，依照錯誤訊息中的連結建立索引。', 'error', 15000);
            } else {
                showAlert('載入專案失敗，錯誤訊息請見開發者主控台 (F12)', 'error');
            }
        } finally {
            showLoading(false);
        }
    }

    async function onProjectChange(projectId) { resetSelects('tender'); if (!projectId) return; const tenderSelect = document.getElementById('tenderSelect'); tenderSelect.disabled = true; tenderSelect.innerHTML = `<option value="">載入中...</option>`; try { const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }], { field: "name", direction: "asc" }); tenders = tenderDocs.docs.map(doc => ({ id: doc.id, ...doc.data() })); populateSelect(tenderSelect, tenders, '請選擇標單...'); } catch (error) { showAlert('載入標單失敗', 'error'); } }
    async function onTenderChange(tenderId) { resetSelects('majorItem'); if(!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); const majorItemSelect = document.getElementById('majorItemSelect'); majorItemSelect.disabled = true; majorItemSelect.innerHTML = `<option value="">載入中...</option>`; try { const [majorItemDocs, floorSettingsDoc, workItemSettingsDoc] = await Promise.all([ safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }], { field: "name", direction: "asc" }), db.collection("floorSettings").where("tenderId", "==", tenderId).limit(1).get(), db.collection("workItemSettings").where("tenderId", "==", tenderId).limit(1).get() ]); majorItems = majorItemDocs.docs.map(doc => ({ id: doc.id, ...doc.data() })); populateSelect(majorItemSelect, majorItems, '請選擇大項目...'); floors = floorSettingsDoc.empty ? [] : (floorSettingsDoc.docs[0].data().floors || []); if (!workItemSettingsDoc.empty) { workItems = workItemSettingsDoc.docs[0].data().workItems || workItems; } else { workItems = ['配管', '配線', '設備安裝', '測試']; } document.getElementById('newWorkItemInput').value = workItems.join(','); } catch (error) { showAlert('載入標單資料失敗', 'error'); } }
    async function onMajorItemChange(majorItemId) { resetSelects('floor'); if(!majorItemId) return; selectedMajorItem = majorItems.find(m => m.id === majorItemId); const allItemsSnapshot = (await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }])); allDetailItems = allItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => !item.excludeFromProgress); populateSelect(document.getElementById('floorSelect'), floors.map(f => ({id:f, name:f})), '請選擇樓層...'); }
    async function onFloorChange(floorName) { resetSelects('space'); if(!floorName) return; selectedFloor = floorName; currentViewMode = 'floor'; loadProgressData(); }
    async function onSpaceChange(spaceName) { selectedSpace = spaceName; if(spaceName) { currentViewMode = 'space'; document.getElementById('spaceFilterContainer').style.display = 'none'; } else { currentViewMode = 'floor'; } loadProgressData(); }
    
    async function loadProgressData() { 
        if (!selectedFloor) { hideContent(); return; } 
        showLoading(true, "載入進度資料..."); 
        try { 
            const baseQuery = [ { field: "tenderId", operator: "==", value: selectedTender.id }, { field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor } ]; 
            const floorDistQuery = [ { field: "tenderId", operator: "==", value: selectedTender.id }, { field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "areaName", operator: "==", value: selectedFloor } ]; 
            const [floorDistDocs, spaceDistDocs, progressItemDocs, spaceSettingsDoc, progressPhotosDocs] = await Promise.all([ 
                safeFirestoreQuery("distributionTable", floorDistQuery), 
                safeFirestoreQuery("spaceDistribution", baseQuery), 
                safeFirestoreQuery("progressItems", baseQuery), 
                db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get(), 
                safeFirestoreQuery("inspectionPhotos", baseQuery) 
            ]); 
            
            const floorDists = floorDistDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const spaceDists = spaceDistDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const progressItems = progressItemDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allProgressPhotos = progressPhotosDocs.docs.map(doc => ({ id: doc.id, ...doc.data() })); 

            const trackedItemIds = allDetailItems.map(item => item.id); 
            const trackedFloorDists = floorDists.filter(doc => trackedItemIds.includes(doc.detailItemId)); 
            const trackedSpaceDists = spaceDists.filter(doc => trackedItemIds.includes(doc.detailItemId)); 
            
            const finalFloorDistDocs = (currentViewMode === 'space' && selectedSpace) 
                ? trackedFloorDists.filter(doc => trackedSpaceDists.some(sDoc => sDoc.detailItemId === doc.detailItemId && sDoc.spaceName === selectedSpace)) 
                : trackedFloorDists; 

            spaces = spaceSettingsDoc.empty ? [] : (spaceSettingsDoc.docs[0].data().spaces || []); 
            
            if (currentViewMode === 'floor') { 
                populateSelect(document.getElementById('spaceSelect'), spaces.map(s => ({id:s, name:s})), '可選，以檢視單一空間...'); 
                buildSpaceFilter(); 
            } 
            
            buildProgressTable(finalFloorDistDocs, trackedSpaceDists, progressItems, allDetailItems); 
            showContent(); 
        } catch (error) { 
            showAlert('載入進度資料失敗: ' + error.message, 'error'); 
        } finally { 
            showLoading(false); 
        } 
    }

    // --- UI 建構 ---
    function buildSpaceFilter() { /* ...維持不變... */ }
    function filterTableBySpace() { /* ...維持不變... */ }
    function buildProgressTable(floorDists, spaceDists, progressItems, detailItems) {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        
        let headerHTML = '<tr><th>項目名稱</th>';
        if (currentViewMode === 'floor') { headerHTML += '<th>所在空間</th>'; }
        workItems.forEach(w => headerHTML += `<th>${w}</th>`);
        headerHTML += '<th>查驗照片</th></tr>';
        tableHeader.innerHTML = headerHTML;
        
        let bodyHTML = '';
        const spaceDistsForFloor = spaceDists.filter(sd => sd.floorName === selectedFloor);

        floorDists.forEach(floorDist => {
            const detailItem = detailItems.find(d => d.id === floorDist.detailItemId);
            if (!detailItem) return;

            const itemSpaceDists = spaceDistsForFloor.filter(sd => sd.detailItemId === floorDist.detailItemId);
            let cumulativeQty = 0;
            const spaceLookup = itemSpaceDists.map(sd => {
                const start = cumulativeQty + 1;
                cumulativeQty += sd.quantity;
                return { space: sd.spaceName, start, end: cumulativeQty };
            });
            
            let totalQuantity = floorDist.quantity;
            if (currentViewMode === 'space' && selectedSpace) {
                totalQuantity = itemSpaceDists.find(sd => sd.spaceName === selectedSpace)?.quantity || 0;
                if (totalQuantity === 0) return;
            }

            for (let i = 1; i <= totalQuantity; i++) {
                const uniqueId = `${floorDist.detailItemId}-${i}`;
                const progressItem = progressItems.find(p => p.uniqueId === uniqueId);
                const spaceName = spaceLookup.find(sl => i >= sl.start && i <= sl.end)?.space || "尚未分配";

                if (currentViewMode === 'space' && selectedSpace && spaceName !== selectedSpace) continue;

                const hasPhotos = allProgressPhotos.some(p => p.uniqueId === uniqueId);
                const photoIndicatorClass = hasPhotos ? 'active' : '';

                bodyHTML += `<tr data-unique-id="${uniqueId}" data-detail-item-id="${floorDist.detailItemId}" data-space-name="${spaceName}">`;
                bodyHTML += `<td>${detailItem.name} #${i}</td>`;
                if (currentViewMode === 'floor') bodyHTML += `<td>${spaceName}</td>`;
                
                workItems.forEach(workItem => {
                    const currentStatus = progressItem?.workStatuses?.[workItem] || '未施工';
                    bodyHTML += `<td><select class="form-select progress-status-select" data-work-item="${workItem}">
                        <option value="未施工" ${currentStatus === '未施工' ? 'selected' : ''}>未施工</option>
                        <option value="施工中" ${currentStatus === '施工中' ? 'selected' : ''}>施工中</option>
                        <option value="已完成" ${currentStatus === '已完成' ? 'selected' : ''}>已完成</option>
                    </select></td>`;
                });

                bodyHTML += `<td class="photo-cell">
                    <button class="btn btn-sm btn-upload-photo">上傳</button>
                    <span class="photo-indicator ${photoIndicatorClass}" title="${hasPhotos ? '點擊預覽照片' : '無照片'}">📷</span>
                </td></tr>`;
            }
        });
        tableBody.innerHTML = bodyHTML;

        tableBody.querySelectorAll('.progress-status-select').forEach(el => el.addEventListener('change', () => onStatusChange(el)));
        tableBody.querySelectorAll('.btn-upload-photo').forEach(el => el.addEventListener('click', () => handlePhotoUploadClick(el)));
        tableBody.querySelectorAll('.photo-indicator.active').forEach(el => el.addEventListener('click', () => openPhotoViewer(el)));
    }

    // --- 核心功能邏輯 ---
    async function onStatusChange(selectElement) { /* ...維持不變... */ }
    function handlePhotoUploadClick(button) { /* ...維持不變... */ }
    async function uploadPhotos(files) { /* ...維持不變... */ }
    function addWatermarkToImage(imageFile, textLines) { /* ...維持不變... */ }
    
    function openPhotoViewer(indicator) {
        const tr = indicator.closest('tr');
        const uniqueId = tr.dataset.uniqueId;
        const itemName = tr.cells[0].textContent;
        const photosForItem = allProgressPhotos.filter(p => p.uniqueId === uniqueId);

        const modal = document.getElementById('photoViewerModal');
        document.getElementById('photoViewerTitle').textContent = `查驗照片: ${itemName}`;
        const grid = document.getElementById('photoGrid');
        
        if (photosForItem.length === 0) {
            grid.innerHTML = '<p style="text-align:center; width:100%; padding: 20px 0;">目前沒有照片，請點擊「上傳」按鈕新增。</p>';
        } else {
            grid.innerHTML = photosForItem.map(photo => `
                <div class="photo-thumbnail" id="thumb-${photo.id}">
                    <a href="${photo.photoUrl}" target="_blank" rel="noopener noreferrer">
                        <img src="${photo.photoUrl}" alt="查驗照片" loading="lazy">
                    </a>
                    <button class="photo-delete-btn" data-photo-id="${photo.id}" data-file-name="${photo.fileName}" title="刪除照片">×</button>
                </div>
            `).join('');
        }
        
        modal.style.display = 'flex';

        grid.querySelectorAll('.photo-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const photoId = btn.dataset.photoId;
                const fileName = btn.dataset.fileName;
                if(confirm('您確定要永久刪除這張照片嗎？此操作無法復原。')) {
                    deletePhoto(photoId, fileName, uniqueId);
                }
            });
        });
    }

    async function deletePhoto(photoId, fileName, uniqueId) {
        showLoading(true, '正在刪除照片...');
        try {
            const storageRef = storage.ref(`inspections/${selectedTender.id}/${fileName}`);
            await storageRef.delete();
            await db.collection('inspectionPhotos').doc(photoId).delete();
            
            allProgressPhotos = allProgressPhotos.filter(p => p.id !== photoId);

            const thumbnail = document.getElementById(`thumb-${photoId}`);
            if (thumbnail) thumbnail.remove();

            const remainingPhotos = allProgressPhotos.some(p => p.uniqueId === uniqueId);
            if (!remainingPhotos) {
                const tr = document.querySelector(`tr[data-unique-id="${uniqueId}"]`);
                if (tr) {
                    const indicator = tr.querySelector('.photo-indicator');
                    indicator.classList.remove('active');
                    indicator.title = '無照片';
                    indicator.replaceWith(indicator.cloneNode(true));
                }
                closeModal('photoViewerModal');
            } else {
                const grid = document.getElementById('photoGrid');
                if (!grid.querySelector('.photo-thumbnail')) {
                    grid.innerHTML = '<p style="text-align:center; width:100%; padding: 20px 0;">目前沒有照片，請點擊「上傳」按鈕新增。</p>';
                }
            }
            showAlert('照片已成功刪除', 'success');
        } catch (error) {
            console.error("刪除照片失敗:", error);
            showAlert(`刪除失敗: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- 事件監聽與輔助函數 ---
    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', e => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', e => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', e => onMajorItemChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', e => onFloorChange(e.target.value));
        document.getElementById('spaceSelect')?.addEventListener('change', e => onSpaceChange(e.target.value));
        document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click());
        document.getElementById('importInput')?.addEventListener('change', handleFileImport);
        document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);
        document.getElementById('workItemsManagerBtn')?.addEventListener('click', () => document.getElementById('workItemsModal').style.display = 'flex');
        document.getElementById('saveWorkItemsBtn')?.addEventListener('click', saveWorkItems);
        document.getElementById('cancelWorkItemsModalBtn')?.addEventListener('click', () => closeModal('workItemsModal'));
        document.getElementById('photoUploadInput')?.addEventListener('change', e => uploadPhotos(e.target.files));
        document.getElementById('closePhotoViewerBtn')?.addEventListener('click', () => closeModal('photoViewerModal'));
    }
    
    // --- 其他輔助函數 ---
    async function onStatusChange(selectElement) { const tr = selectElement.closest('tr'); const uniqueId = tr.dataset.uniqueId; const detailItemId = tr.dataset.detailItemId; const spaceName = tr.dataset.spaceName; const workItem = selectElement.dataset.workItem; const newStatus = selectElement.value; try { const querySnapshot = await db.collection("progressItems").where("uniqueId", "==", uniqueId).limit(1).get(); if (querySnapshot.empty) { const docRef = db.collection("progressItems").doc(); await docRef.set({ tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: detailItemId, floorName: selectedFloor, spaceName: spaceName, uniqueId: uniqueId, workStatuses: { [workItem]: newStatus }, createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); } else { const docId = querySnapshot.docs[0].id; const updateData = { [`workStatuses.${workItem}`]: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; await db.collection("progressItems").doc(docId).update(updateData); } } catch (error) { showAlert('儲存狀態失敗: ' + error.message, 'error'); } }
    function handlePhotoUploadClick(button) { const tr = button.closest('tr'); const itemName = tr.cells[0].textContent; currentUploadTarget = { uniqueId: tr.dataset.uniqueId, detailItemId: tr.dataset.detailItemId, spaceName: tr.dataset.spaceName, fullItemName: itemName }; document.getElementById('photoUploadInput').click(); }
    async function uploadPhotos(files) { if (!files || files.length === 0 || !currentUploadTarget) return; showLoading(true, `準備上傳 ${files.length} 張照片中...`); const tenderName = selectedTender?.name || '未知標單'; const projectDoc = projects.find(p => p.id === selectedTender?.projectId); const projectName = projectDoc ? projectDoc.name : '未知專案'; for (const file of Array.from(files)) { if (!file.type.startsWith('image/')) continue; showLoading(true, `正在為 ${file.name} 加上浮水印...`); try { const watermarkText = [ `專案: ${projectName}`, `標單: ${tenderName}`, `位置: ${selectedFloor}`, `工項: ${currentUploadTarget.fullItemName}`, `時間: ${new Date().toLocaleString('sv-SE')}` ]; const watermarkedBlob = await addWatermarkToImage(file, watermarkText); const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`; const storagePath = `inspections/${selectedTender.id}/${fileName}`; const storageRef = storage.ref(storagePath); showLoading(true, `正在上傳 ${file.name}...`); const snapshot = await storageRef.put(watermarkedBlob); const photoUrl = await snapshot.ref.getDownloadURL(); const photoData = { tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: currentUploadTarget.detailItemId, floorName: selectedFloor, spaceName: currentUploadTarget.spaceName, uniqueId: currentUploadTarget.uniqueId, photoUrl: photoUrl, fileName: fileName, uploaderId: currentUser.uid, uploaderEmail: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }; const newDoc = await db.collection('inspectionPhotos').add(photoData); allProgressPhotos.push({id: newDoc.id, ...photoData}); const tr = document.querySelector(`tr[data-unique-id="${currentUploadTarget.uniqueId}"]`); if (tr) { const indicator = tr.querySelector('.photo-indicator'); if (!indicator.classList.contains('active')) { indicator.classList.add('active'); indicator.addEventListener('click', () => openPhotoViewer(indicator)); } } } catch (error) { console.error('上傳單張照片失敗:', error); showAlert(`照片 ${file.name} 上傳失敗: ${error.message}`, 'error'); break; } } showAlert(`照片上傳處理完成！`, 'success'); showLoading(false); document.getElementById('photoUploadInput').value = ''; }
    function addWatermarkToImage(imageFile, textLines) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0); const fontSize = Math.max(18, Math.min(img.width, img.height) / 40); ctx.font = `bold ${fontSize}px "Arial", "Microsoft JhengHei", sans-serif`; ctx.textBaseline = 'bottom'; const padding = fontSize * 0.5; const textMetrics = textLines.map(line => ctx.measureText(line)); const maxWidth = Math.max(...textMetrics.map(m => m.width)); const boxWidth = maxWidth + padding * 2; const lineHeight = fontSize * 1.2; const boxHeight = (lineHeight * textLines.length) + (padding * 2); const x = canvas.width - boxWidth - padding; const y = canvas.height - boxHeight - padding; ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(x, y, boxWidth, boxHeight); ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; textLines.forEach((line, index) => { const textY = y + padding + (lineHeight * (index + 1)); ctx.fillText(line, x + padding, textY); }); canvas.toBlob((blob) => { if (blob) { resolve(blob); } else { reject(new Error('Canvas to Blob conversion failed')); } }, 'image/jpeg', 0.9); }; img.onerror = (err) => reject(err); img.src = event.target.result; }; reader.onerror = (err) => reject(err); reader.readAsDataURL(imageFile); }); }
    function buildSpaceFilter() { const container = document.getElementById('spaceFilterCheckboxes'); const filterContainer = document.getElementById('spaceFilterContainer'); if (spaces.length > 1) { container.innerHTML = spaces.map(space => `<label class="checkbox-label"><input type="checkbox" class="space-filter-checkbox" value="${space}" checked> ${space}</label>`).join(''); filterContainer.style.display = 'block'; container.querySelectorAll('.space-filter-checkbox').forEach(checkbox => { checkbox.addEventListener('change', filterTableBySpace); }); } else { filterContainer.style.display = 'none'; } }
    function filterTableBySpace() { const checkedSpaces = Array.from(document.querySelectorAll('.space-filter-checkbox:checked')).map(cb => cb.value); document.querySelectorAll('#progressTable tbody tr').forEach(row => { if (checkedSpaces.includes(row.dataset.spaceName)) { row.style.display = ''; } else { row.style.display = 'none'; } }); }
    function exportToExcel() { /* ... */ }
    function handleFileImport(event) { /* ... */ }
    async function saveWorkItems() { /* ... */ }
    function populateSelect(selectEl, options, defaultText) { let html = `<option value="">${defaultText}</option>`; options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); selectEl.innerHTML = html; selectEl.disabled = false; }
    function resetSelects(from = 'project') { const selects = ['tender', 'majorItem', 'floor', 'space']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } hideContent(); }
    function hideContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('initialEmptyState').style.display = 'flex'; }
    function showContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('initialEmptyState').style.display = 'none'; }
    function showLoading(isLoading, message = '載入中...') { const loadingEl = document.getElementById('loading'); if (isLoading) { loadingEl.querySelector('p').textContent = message; loadingEl.style.display = 'flex'; } else { loadingEl.style.display = 'none'; } }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; }

    // --- 頁面初始化 ---
    initializePage();
}
