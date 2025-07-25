/**
 * 施工進度管理 (progress-management.js) - v4.2 (表格欄位最終修正版)
 */
function initProgressManagementPage() {

    let projects = [], tenders = [], majorItems = [], floors = [], spaces = [];
    let selectedProject = null, selectedTender = null, selectedMajorItem = null, selectedFloor = null, selectedSpace = null;
    let currentUserRole = null, currentUserPermissions = {};
    let workItems = ['配管', '配線', '設備安裝', '測試']; // 預設工項
    let allDetailItems = [], allProgressItems = [], allProgressPhotos = [];
    let currentUploadTarget = null;
    const storage = firebase.storage();

    async function initializePage() {
        console.log("🚀 初始化施工進度管理頁面 (v4.2)...");
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
                return memberInfo && (memberInfo.role === 'owner' || (memberInfo.permissions && (memberInfo.permissions.canAccessTenders || memberInfo.permissions.canUploadPhotos)));
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
        if (!projectId) { selectedProject = null; return; }
        selectedProject = projects.find(p => p.id === projectId);
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
            tenders = tenderDocs.docs;
            populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
        } catch (error) { showAlert('載入標單失敗', 'error'); }
    }

    async function onTenderChange(tenderId) {
        resetSelects('majorItem');
        if (!tenderId) { selectedTender = null; return; }
        selectedTender = tenders.find(t => t.id === tenderId);
        try {
            const [majorItemDocs, floorSettingsDoc, workItemsDoc] = await Promise.all([
                safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("floorSettings", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("workItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }])
            ]);
            majorItems = majorItemDocs.docs;
            floors = floorSettingsDoc.docs.length > 0 ? (floorSettingsDoc.docs[0].floors || []) : [];
            if(workItemsDoc.docs.length > 0 && workItemsDoc.docs[0].items) { workItems = workItemsDoc.docs[0].items; }
            populateSelect(document.getElementById('majorItemSelect'), majorItems, '請選擇大項目...');
        } catch (error) { showAlert('載入大項目或設定失敗: ' + error.message, 'error'); }
    }

    async function onMajorItemChange(majorItemId) {
        resetSelects('floor');
        if(!majorItemId) return;
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        const memberInfo = selectedProject.members[auth.currentUser.email];
        currentUserRole = memberInfo.role;
        currentUserPermissions = memberInfo.permissions || {};
        const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && (currentUserPermissions.canAccessTenders || currentUserPermissions.canUploadPhotos));
        if (!canAccess) { showAlert('您沒有權限查看此專案的施工進度', 'error'); return; }
        const allItemsSnapshot = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }, { field: "projectId", operator: "==", value: selectedProject.id }]);
        allDetailItems = allItemsSnapshot.docs.filter(item => !item.excludeFromProgress).sort(naturalSequenceSort);
        populateSelect(document.getElementById('floorSelect'), floors.map(f => ({id:f, name:f})), '請選擇樓層...');
    }
    
    async function onFloorChange(floorName) {
        resetSelects('space');
        if(!floorName) { selectedFloor = null; return; }
        selectedFloor = floorName;
        try {
            const spaceSettingsResult = await safeFirestoreQuery("spaceSettings", [{ field: "tenderId", operator: "==", value: selectedTender.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]);
            spaces = spaceSettingsResult.docs.length > 0 ? (spaceSettingsResult.docs[0].spaces || []) : [];
            const spaceSelect = document.getElementById('spaceSelect');
            spaceSelect.innerHTML = '<option value="all">所有空間</option>' + spaces.map(s => `<option value="${s}">${s}</option>`).join('');
            spaceSelect.disabled = false;
            await loadProgressData();
        } catch(error) { showAlert('載入空間資料失敗: ' + error.message, 'error'); }
    }

    async function onSpaceChange(spaceName) {
        selectedSpace = spaceName === 'all' ? null : spaceName;
        await loadProgressData();
    }
    
    async function loadProgressData() {
        if (!selectedFloor || !selectedMajorItem) return;
        showLoading(true, '載入進度資料...');
        try {
            const [floorDists, spaceDists, progressItems, photos] = await Promise.all([
                safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "areaName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("spaceDistribution", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("progressItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("inspectionPhotos", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }, { field: "floorName", operator: "==", value: selectedFloor }, { field: "projectId", operator: "==", value: selectedProject.id }])
            ]);
            allProgressPhotos = photos.docs;
            buildProgressTable(floorDists.docs, spaceDists.docs, progressItems.docs, allDetailItems);
            showContent();
        } catch(error) {
            showAlert('載入進度資料失敗: ' + error.message, 'error');
            hideContent();
        } finally {
            showLoading(false);
        }
    }
    
    // --- 【核心修正】重寫表格渲染邏輯 ---
    function buildProgressTable(floorDists, spaceDists, progressItems, detailItems) {
        const tableHeader = document.getElementById('tableHeader');
        const tableBody = document.getElementById('tableBody');
        
        // 步驟 1: 修改表頭，將「項次」和「項目名稱」分開
        let headerHTML = '<tr><th style="width: 80px;">項次</th><th>項目名稱</th>';
        if (!selectedSpace) { headerHTML += '<th>所在空間</th>'; }
        workItems.forEach(w => headerHTML += `<th>${w}</th>`);
        headerHTML += '<th>查驗照片</th></tr>';
        tableHeader.innerHTML = headerHTML;
        
        let bodyHTML = '';
        const canEditStatus = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders);
        const canUpload = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canUploadPhotos);
        
        // 使用 allDetailItems 進行遍歷，確保順序正確
        allDetailItems.forEach(detailItem => {
            const floorDist = floorDists.find(d => d.detailItemId === detailItem.id);
            if (!floorDist || !floorDist.quantity) return; // 如果此樓層沒有分配此項目，則跳過

            const itemSpaceDists = spaceDists.filter(sd => sd.detailItemId === detailItem.id);
            let cumulativeQty = 0;
            const spaceLookup = itemSpaceDists.map(sd => { const start = cumulativeQty + 1; cumulativeQty += sd.quantity; return { space: sd.spaceName, start, end: cumulativeQty }; });
            let totalQuantity = floorDist.quantity;
            if (selectedSpace) { totalQuantity = itemSpaceDists.find(sd => sd.spaceName === selectedSpace)?.quantity || 0; if (totalQuantity === 0) return; }
            
            for (let i = 1; i <= totalQuantity; i++) {
                const uniqueId = `${detailItem.id}-${i}`;
                const progressItem = progressItems.find(p => p.uniqueId === uniqueId);
                const spaceName = selectedSpace || spaceLookup.find(sl => i >= sl.start && i <= sl.end)?.space || "尚未分配";
                const hasPhotos = allProgressPhotos.some(p => p.uniqueId === uniqueId);
                const photoIndicatorClass = hasPhotos ? 'active' : '';
                
                bodyHTML += `<tr data-unique-id="${uniqueId}" data-detail-item-id="${detailItem.id}" data-space-name="${spaceName}">`;
                
                // 步驟 2: 修改表格內容，將項次和名稱放入不同的 <td>
                bodyHTML += `<td>${detailItem.sequence || ''}</td>`;
                bodyHTML += `<td>${detailItem.name} #${i}</td>`;
                
                if (!selectedSpace) bodyHTML += `<td>${spaceName}</td>`;
                
                workItems.forEach(workItem => {
                    const currentStatus = progressItem?.workStatuses?.[workItem] || '未施工';
                    bodyHTML += `<td><select class="form-select progress-status-select" data-work-item="${workItem}" ${!canEditStatus ? 'disabled' : ''}>
                        <option value="未施工" ${currentStatus === '未施工' ? 'selected' : ''}>未施工</option>
                        <option value="施工中" ${currentStatus === '施工中' ? 'selected' : ''}>施工中</option>
                        <option value="已完成" ${currentStatus === '已完成' ? 'selected' : ''}>已完成</option>
                    </select></td>`;
                });
                
                bodyHTML += `<td class="photo-cell">
                    ${canUpload ? '<button class="btn btn-sm btn-upload-photo">上傳</button>' : ''}
                    <span class="photo-indicator ${photoIndicatorClass}" title="${hasPhotos ? '點擊預覽照片' : '無照片'}">📷</span>
                </td></tr>`;
            }
        });
        tableBody.innerHTML = bodyHTML;
        tableBody.querySelectorAll('.progress-status-select').forEach(el => el.addEventListener('change', () => onStatusChange(el)));
        tableBody.querySelectorAll('.btn-upload-photo').forEach(el => el.addEventListener('click', () => handlePhotoUploadClick(el)));
        tableBody.querySelectorAll('.photo-indicator.active').forEach(el => el.addEventListener('click', () => openPhotoViewer(el)));
    }
    
    // --- 其他所有函式維持不變 ---
    function setupEventListeners() { document.getElementById('projectSelect')?.addEventListener('change', e => onProjectChange(e.target.value)); document.getElementById('tenderSelect')?.addEventListener('change', e => onTenderChange(e.target.value)); document.getElementById('majorItemSelect')?.addEventListener('change', e => onMajorItemChange(e.target.value)); document.getElementById('floorSelect')?.addEventListener('change', e => onFloorChange(e.target.value)); document.getElementById('spaceSelect')?.addEventListener('change', e => onSpaceChange(e.target.value)); document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click()); document.getElementById('importInput')?.addEventListener('change', handleFileImport); document.getElementById('exportBtn')?.addEventListener('click', exportToExcel); document.getElementById('workItemsManagerBtn')?.addEventListener('click', () => document.getElementById('workItemsModal').style.display = 'flex'); document.getElementById('saveWorkItemsBtn')?.addEventListener('click', saveWorkItems); document.getElementById('cancelWorkItemsModalBtn')?.addEventListener('click', () => closeModal('workItemsModal')); document.getElementById('photoUploadInput')?.addEventListener('change', e => uploadPhotos(e.target.files)); document.getElementById('closePhotoViewerBtn')?.addEventListener('click', () => closeModal('photoViewerModal')); }
    async function onStatusChange(selectElement) { const canEditStatus = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders); if (!canEditStatus) { showAlert('權限不足，無法修改狀態', 'error'); selectElement.value = selectElement.dataset.previousValue || '未施工'; return; } const tr = selectElement.closest('tr'); const uniqueId = tr.dataset.uniqueId; const detailItemId = tr.dataset.detailItemId; const spaceName = tr.dataset.spaceName; const workItem = selectElement.dataset.workItem; const newStatus = selectElement.value; try { const querySnapshot = await safeFirestoreQuery("progressItems", [{ field: "uniqueId", operator: "==", value: uniqueId }]); if (querySnapshot.docs.length === 0) { const docRef = db.collection("progressItems").doc(); await docRef.set({ projectId: selectedProject.id, tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: detailItemId, floorName: selectedFloor, spaceName: spaceName, uniqueId: uniqueId, workStatuses: { [workItem]: newStatus }, createdBy: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); } else { const docId = querySnapshot.docs[0].id; const updateData = { [`workStatuses.${workItem}`]: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; await db.collection("progressItems").doc(docId).update(updateData); } } catch (error) { showAlert('儲存狀態失敗: ' + error.message, 'error'); } }
    function handlePhotoUploadClick(button) { const tr = button.closest('tr'); const itemName = tr.cells[1].textContent; currentUploadTarget = { uniqueId: tr.dataset.uniqueId, detailItemId: tr.dataset.detailItemId, spaceName: tr.dataset.spaceName, fullItemName: itemName }; document.getElementById('photoUploadInput').click(); }
    async function uploadPhotos(files) { if (!files || files.length === 0 || !currentUploadTarget) return; showLoading(true, `準備上傳 ${files.length} 張照片中...`); const tenderName = selectedTender?.name || '未知標單'; const projectName = selectedProject?.name || '未知專案'; for (const file of Array.from(files)) { if (!file.type.startsWith('image/')) continue; showLoading(true, `正在為 ${file.name} 加上浮水印...`); try { const watermarkText = [ `專案: ${projectName}`, `標單: ${tenderName}`, `位置: ${selectedFloor}`, `工項: ${currentUploadTarget.fullItemName}`, `時間: ${new Date().toLocaleString('sv-SE')}` ]; const watermarkedBlob = await addWatermarkToImage(file, watermarkText); const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`; const storagePath = `inspections/${selectedTender.id}/${fileName}`; const storageRef = storage.ref(storagePath); showLoading(true, `正在上傳 ${file.name}...`); const snapshot = await storageRef.put(watermarkedBlob); const photoUrl = await snapshot.ref.getDownloadURL(); const photoData = { projectId: selectedProject.id, tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: currentUploadTarget.detailItemId, floorName: selectedFloor, spaceName: currentUploadTarget.spaceName, uniqueId: currentUploadTarget.uniqueId, photoUrl: photoUrl, fileName: fileName, uploaderEmail: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() }; const newDoc = await db.collection('inspectionPhotos').add(photoData); allProgressPhotos.push({id: newDoc.id, ...photoData}); const tr = document.querySelector(`tr[data-unique-id="${currentUploadTarget.uniqueId}"]`); if (tr) { const indicator = tr.querySelector('.photo-indicator'); if (!indicator.classList.contains('active')) { indicator.classList.add('active'); indicator.addEventListener('click', () => openPhotoViewer(indicator)); } } } catch (error) { console.error('上傳單張照片失敗:', error); showAlert(`照片 ${file.name} 上傳失敗: ${error.message}`, 'error'); break; } } showAlert(`照片上傳處理完成！`, 'success'); showLoading(false); document.getElementById('photoUploadInput').value = ''; }
    function addWatermarkToImage(imageFile, textLines) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0); const fontSize = Math.max(18, Math.min(img.width, img.height) / 40); ctx.font = `bold ${fontSize}px "Arial", "Microsoft JhengHei", sans-serif`; ctx.textBaseline = 'bottom'; const padding = fontSize * 0.5; const textMetrics = textLines.map(line => ctx.measureText(line)); const maxWidth = Math.max(...textMetrics.map(m => m.width)); const boxWidth = maxWidth + padding * 2; const lineHeight = fontSize * 1.2; const boxHeight = (lineHeight * textLines.length) + (padding * 2); const x = canvas.width - boxWidth - padding; const y = canvas.height - boxHeight - padding; ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(x, y, boxWidth, boxHeight); ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; textLines.forEach((line, index) => { const textY = y + padding + (lineHeight * (index + 1)); ctx.fillText(line, x + padding, textY); }); canvas.toBlob((blob) => { if (blob) { resolve(blob); } else { reject(new Error('Canvas to Blob conversion failed')); } }, 'image/jpeg', 0.9); }; img.onerror = (err) => reject(err); img.src = event.target.result; }; reader.onerror = (err) => reject(err); reader.readAsDataURL(imageFile); }); }
    function openPhotoViewer(indicator) { const tr = indicator.closest('tr'); const uniqueId = tr.dataset.uniqueId; const photos = allProgressPhotos.filter(p => p.uniqueId === uniqueId); const photoGrid = document.getElementById('photoGrid'); photoGrid.innerHTML = ''; if(photos.length > 0){ photos.forEach(photo => { const thumb = document.createElement('div'); thumb.className = 'photo-thumbnail'; thumb.innerHTML = `<a href="${photo.photoUrl}" target="_blank"><img src="${photo.photoUrl}" alt="${photo.fileName}"></a><button class="photo-delete-btn" data-photo-id="${photo.id}">&times;</button>`; photoGrid.appendChild(thumb); }); } else { photoGrid.innerHTML = '<p>沒有可預覽的照片。</p>'; } document.getElementById('photoViewerModal').style.display = 'flex'; }
    function exportToExcel() { /* ... */ }
    function handleFileImport(event) { /* ... */ }
    async function saveWorkItems() { /* ... */ }
    function populateSelect(selectEl, options, defaultText) { let html = `<option value="">${defaultText}</option>`; options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
    function resetSelects(from = 'project') { const selects = ['tender', 'majorItem', 'floor', 'space']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } hideContent(); }
    function hideContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('initialEmptyState').style.display = 'flex'; }
    function showContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('initialEmptyState').style.display = 'none'; }
    function showLoading(isLoading, message = '載入中...') { const loadingEl = document.getElementById('loading'); if (isLoading) { loadingEl.querySelector('p').textContent = message; loadingEl.style.display = 'flex'; } else { loadingEl.style.display = 'none'; } }
    function closeModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }

    initializePage();
}
