/**
 * 施工進度管理 (progress-management.js) (SPA 版本 v2.6 - 整合浮水印照片上傳)
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

    // --- Firebase Storage 參考 ---
    const storage = firebase.storage();

    // --- 初始化與資料載入 (此部分函數維持不變) ---
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
            } else {
                workItems = ['配管', '配線', '設備安裝', '測試']; 
            }
            document.getElementById('newWorkItemInput').value = workItems.join(',');
        } catch (error) { showAlert('載入標單資料失敗', 'error'); }
    }

    async function onMajorItemChange(majorItemId) {
        resetSelects('floor');
        if(!majorItemId) return;
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);
        
        const allItems = (await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }])).docs;
        allDetailItems = allItems.filter(item => !item.excludeFromProgress);

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

    async function loadProgressData() {
        if (!selectedFloor) {
            hideContent();
            return;
        }
        
        showLoading(true, "載入進度資料...");
        try {
            const baseQuery = [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                { field: "floorName", operator: "==", value: selectedFloor }
            ];

            const floorDistQuery = [
                { field: "tenderId", operator: "==", value: selectedTender.id },
                { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                { field: "areaName", operator: "==", value: selectedFloor }
            ];
            
            const [floorDistDocs, spaceDistDocs, progressItemDocs, spaceSettingsDoc, progressPhotosDocs] = await Promise.all([
                safeFirestoreQuery("distributionTable", floorDistQuery),
                safeFirestoreQuery("spaceDistribution", baseQuery),
                safeFirestoreQuery("progressItems", baseQuery),
                db.collection("spaceSettings").where("tenderId", "==", selectedTender.id).where("floorName", "==", selectedFloor).limit(1).get(),
                safeFirestoreQuery("inspectionPhotos", baseQuery) 
            ]);
            
            allProgressPhotos = progressPhotosDocs.docs; 
            
            const trackedItemIds = allDetailItems.map(item => item.id);
            const trackedFloorDists = floorDistDocs.docs.filter(doc => trackedItemIds.includes(doc.detailItemId));
            const trackedSpaceDists = spaceDistDocs.docs.filter(doc => trackedItemIds.includes(doc.detailItemId));

            const finalFloorDistDocs = (currentViewMode === 'space' && selectedSpace)
                ? trackedFloorDists.filter(doc => trackedSpaceDists.some(sDoc => sDoc.detailItemId === doc.detailItemId && sDoc.spaceName === selectedSpace))
                : trackedFloorDists;

            spaces = spaceSettingsDoc.empty ? [] : (spaceSettingsDoc.docs[0].data().spaces || []);
            if (currentViewMode === 'floor') {
                populateSelect(document.getElementById('spaceSelect'), spaces.map(s => ({id:s, name:s})), '可選，以檢視單一空間...');
                buildSpaceFilter();
            }
            
            buildProgressTable(finalFloorDistDocs, trackedSpaceDists, progressItemDocs.docs, allDetailItems);
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
        headerHTML += '<th>查驗照片</th>';
        headerHTML += '</tr>';
        tableHeader.innerHTML = headerHTML;
        
        let bodyHTML = '';
        
        const spaceDistsForFloor = spaceDists.filter(sd => sd.floorName === selectedFloor);

        floorDists.forEach(floorDist => {
            const detailItem = detailItems.find(d => d.id === floorDist.detailItemId);
            if (!detailItem) return;

            const itemSpaceDists = spaceDistsForFloor.filter(sd => sd.detailItemId === floorDist.detailItemId);
            const spaceLookup = [];
            let cumulativeQty = 0;
            itemSpaceDists.forEach(sd => {
                const start = cumulativeQty + 1;
                const end = cumulativeQty + sd.quantity;
                spaceLookup.push({ space: sd.spaceName, start, end });
                cumulativeQty += sd.quantity;
            });
            
            let totalQuantity = floorDist.quantity;
            if (currentViewMode === 'space' && selectedSpace) {
                totalQuantity = itemSpaceDists.find(sd => sd.spaceName === selectedSpace)?.quantity || 0;
                if (totalQuantity === 0) return;
            }

            for (let i = 1; i <= totalQuantity; i++) {
                const uniqueId = `${floorDist.detailItemId}-${i}`;
                const progressItem = progressItems.find(p => p.uniqueId === uniqueId);
                const spaceInfo = spaceLookup.find(sl => i >= sl.start && i <= sl.end);
                const spaceName = spaceInfo ? spaceInfo.space : "尚未分配";

                if (currentViewMode === 'space' && selectedSpace && spaceName !== selectedSpace) continue;

                const hasPhotos = allProgressPhotos.some(p => p.uniqueId === uniqueId);
                const photoIndicatorClass = hasPhotos ? 'active' : '';

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

                bodyHTML += `
                    <td class="photo-cell">
                        <button class="btn btn-sm btn-upload-photo" data-action="upload-photo">上傳</button>
                        <span class="photo-indicator ${photoIndicatorClass}" title="${hasPhotos ? '已有照片' : '無照片'}">📷</span>
                    </td>
                `;

                bodyHTML += '</tr>';
            }
        });
        tableBody.innerHTML = bodyHTML;

        tableBody.querySelectorAll('.progress-status-select').forEach(select => {
            select.addEventListener('change', (e) => onStatusChange(e.target));
        });
        tableBody.querySelectorAll('.btn-upload-photo').forEach(button => {
            button.addEventListener('click', (e) => handlePhotoUploadClick(e.target));
        });
    }

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
                    createdBy: currentUser.email,
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
        }
    }

    // --- 照片上傳與浮水印核心邏輯 ---
    function handlePhotoUploadClick(button) {
        const tr = button.closest('tr');
        const itemName = tr.cells[0].textContent;

        currentUploadTarget = {
            uniqueId: tr.dataset.uniqueId,
            detailItemId: tr.dataset.detailItemId,
            spaceName: tr.dataset.spaceName,
            fullItemName: itemName 
        };
        document.getElementById('photoUploadInput').click();
    }

    async function uploadPhotos(files) {
        if (!files || files.length === 0 || !currentUploadTarget) return;

        showLoading(true, `準備上傳 ${files.length} 張照片中...`);

        const tenderName = selectedTender?.name || '未知標單';
        const projectDoc = projects.find(p => p.id === selectedTender?.projectId);
        const projectName = projectDoc ? projectDoc.name : '未知專案';

        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) continue;

            showLoading(true, `正在為 ${file.name} 加上浮水印...`);
            try {
                const watermarkText = [
                    `專案: ${projectName}`,
                    `標單: ${tenderName}`,
                    `位置: ${selectedFloor}`,
                    `工項: ${currentUploadTarget.fullItemName}`,
                    `時間: ${new Date().toLocaleString('sv-SE')}`
                ];

                const watermarkedBlob = await addWatermarkToImage(file, watermarkText);

                const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
                const storagePath = `inspections/${selectedTender.id}/${fileName}`;
                const storageRef = storage.ref(storagePath);
                
                showLoading(true, `正在上傳 ${file.name}...`);
                const snapshot = await storageRef.put(watermarkedBlob);
                const photoUrl = await snapshot.ref.getDownloadURL();

                const photoData = {
                    tenderId: selectedTender.id,
                    majorItemId: selectedMajorItem.id,
                    detailItemId: currentUploadTarget.detailItemId,
                    floorName: selectedFloor,
                    spaceName: currentUploadTarget.spaceName,
                    uniqueId: currentUploadTarget.uniqueId,
                    photoUrl: photoUrl,
                    fileName: fileName,
                    uploaderId: currentUser.uid,
                    uploaderEmail: currentUser.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const newDoc = await db.collection('inspectionPhotos').add(photoData);
                allProgressPhotos.push({id: newDoc.id, ...photoData});

                const tr = document.querySelector(`tr[data-unique-id="${currentUploadTarget.uniqueId}"]`);
                if (tr) {
                    const indicator = tr.querySelector('.photo-indicator');
                    indicator.classList.add('active');
                    indicator.title = '已有照片';
                }

            } catch (error) {
                console.error('上傳單張照片失敗:', error);
                showAlert(`照片 ${file.name} 上傳失敗: ${error.message}`, 'error');
                break; 
            }
        }
        
        showAlert(`照片上傳處理完成！`, 'success');
        showLoading(false);
        // 清空選擇，避免重複上傳
        document.getElementById('photoUploadInput').value = '';
    }

    function addWatermarkToImage(imageFile, textLines) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);

                    const fontSize = Math.max(18, Math.min(img.width, img.height) / 40);
                    ctx.font = `bold ${fontSize}px "Arial", "Microsoft JhengHei", sans-serif`;
                    ctx.textBaseline = 'bottom';
                    const padding = fontSize * 0.5;
                    
                    const textMetrics = textLines.map(line => ctx.measureText(line));
                    const maxWidth = Math.max(...textMetrics.map(m => m.width));
                    const boxWidth = maxWidth + padding * 2;
                    const lineHeight = fontSize * 1.2;
                    const boxHeight = (lineHeight * textLines.length) + (padding * 2);

                    const x = canvas.width - boxWidth - padding;
                    const y = canvas.height - boxHeight - padding;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(x, y, boxWidth, boxHeight);

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    textLines.forEach((line, index) => {
                        const textY = y + padding + (lineHeight * (index + 1));
                        ctx.fillText(line, x + padding, textY);
                    });

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas to Blob conversion failed'));
                        }
                    }, 'image/jpeg', 0.9);
                };
                img.onerror = (err) => reject(err);
                img.src = event.target.result;
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(imageFile);
        });
    }

    // --- 其他輔助函數與事件監聽 ---
    function setupEventListeners() {
        document.getElementById('projectSelect')?.addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect')?.addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect')?.addEventListener('change', (e) => onMajorItemChange(e.target.value));
        document.getElementById('floorSelect')?.addEventListener('change', (e) => onFloorChange(e.target.value));
        document.getElementById('spaceSelect')?.addEventListener('change', (e) => onSpaceChange(e.target.value));
        
        document.getElementById('importBtn')?.addEventListener('click', () => {
            if (!selectedFloor) return showAlert('請先選擇一個樓層後才能匯入', 'warning');
            document.getElementById('importInput').click()
        });
        document.getElementById('importInput')?.addEventListener('change', handleFileImport);
        document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);

        document.getElementById('workItemsManagerBtn')?.addEventListener('click', () => {
            if(!selectedTender) return showAlert('請先選擇一個標單', 'warning');
            document.getElementById('workItemsModal').style.display = 'flex';
        });
        document.getElementById('saveWorkItemsBtn')?.addEventListener('click', saveWorkItems);
        document.getElementById('cancelWorkItemsModalBtn')?.addEventListener('click', () => closeModal('workItemsModal'));

        document.getElementById('photoUploadInput')?.addEventListener('change', (e) => {
            uploadPhotos(e.target.files);
        });
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
            const itemNameCell = row.cells[0].textContent;
            const sequence = itemNameCell.split('#')[1]?.trim() || '';
            const name = itemNameCell.split('#')[0].trim();
            rowData.push(sequence, name);

            let cellIndex = 1;
            if (currentViewMode === 'floor') {
                rowData.push(row.cells[cellIndex].textContent);
                cellIndex++;
            }
            
            workItems.forEach(() => {
                const select = row.cells[cellIndex]?.querySelector('select');
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
    
    async function handleFileImport(event) {
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

                const importedHeader = jsonData[0];
                const hasSpaceColumn = importedHeader.includes('所在空間');
                
                if (hasSpaceColumn && currentViewMode !== 'floor') {
                    throw new Error("匯入檔案格式為「樓層總覽」，但目前為「單一空間」檢視模式，請先切換模式。");
                }
                if (!hasSpaceColumn && currentViewMode === 'floor' && selectedSpace) {
                     throw new Error("匯入檔案格式為「單一空間」，但目前為「樓層總覽」檢視模式，請清除空間選擇後再匯入。");
                }

                const excelWorkItems = hasSpaceColumn ? importedHeader.slice(3) : importedHeader.slice(2);
                if (JSON.stringify(excelWorkItems) !== JSON.stringify(workItems)) {
                    throw new Error(`工項不匹配！\n頁面工項: ${workItems.join(', ')}\nExcel工項: ${excelWorkItems.join(', ')}`);
                }
                
                showLoading(true, "準備更新資料...");
                const batch = db.batch();
                
                const progressQuery = await safeFirestoreQuery("progressItems", [
                    { field: "tenderId", operator: "==", value: selectedTender.id },
                    { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                    { field: "floorName", operator: "==", value: selectedFloor }
                ]);
                
                const progressMap = new Map(progressQuery.docs.map(doc => [doc.uniqueId, doc.id]));

                let updatedCount = 0;
                let createdCount = 0;

                for (const row of jsonData.slice(1)) {
                    const sequence = row[0];
                    const itemName = row[1];
                    const detailItem = allDetailItems.find(item => item.name === itemName);

                    if (!detailItem) {
                        console.warn(`在細項列表中找不到項目: ${itemName}，跳過此行。`);
                        continue;
                    }

                    const uniqueId = `${detailItem.id}-${sequence}`;
                    const spaceName = hasSpaceColumn ? row[2] : selectedSpace;
                    const workStatuses = {};
                    excelWorkItems.forEach((wItem, index) => {
                        const statusIndex = hasSpaceColumn ? index + 3 : index + 2;
                        workStatuses[wItem] = row[statusIndex] || "未施工";
                    });

                    const existingDocId = progressMap.get(uniqueId);
                    const docData = {
                        tenderId: selectedTender.id, majorItemId: selectedMajorItem.id, detailItemId: detailItem.id,
                        floorName: selectedFloor, spaceName: spaceName, uniqueId: uniqueId,
                        workStatuses: workStatuses,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    if (existingDocId) {
                        const docRef = db.collection("progressItems").doc(existingDocId);
                        batch.update(docRef, docData);
                        updatedCount++;
                    } else {
                        docData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        const docRef = db.collection("progressItems").doc();
                        batch.set(docRef, docData);
                        createdCount++;
                    }
                }

                if (updatedCount + createdCount > 0) {
                    showLoading(true, "正在批次寫入資料庫...");
                    await batch.commit();
                    showAlert(`匯入成功！\n更新了 ${updatedCount} 筆，新增了 ${createdCount} 筆紀錄。`, 'success');
                } else {
                    showAlert('沒有需要更新或新增的紀錄。', 'info');
                }
                
                await loadProgressData();

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
        
        document.getElementById('importBtn')?.addEventListener('click', () => {
            if (!selectedFloor) return showAlert('請先選擇一個樓層後才能匯入', 'warning');
            document.getElementById('importInput').click()
        });
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
