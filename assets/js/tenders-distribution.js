/**
 * 樓層分配管理系統 (distribution.js) (SPA 版本) - v3.1 (修復匯入/匯出功能)
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
        console.log("🚀 初始化樓層分配頁面 (v3.1)...");
        if (!auth.currentUser) return showAlert("無法獲取用戶資訊", "error");
        
        setupEventListeners();
        await loadProjectsWithPermission();
    }

    async function loadProjectsWithPermission() {
        showLoading(true, '載入專案中...');
        try {
            const allMyProjects = await loadProjects();
            const userEmail = auth.currentUser.email;

            // 篩選出有權限進行樓層分配的專案
            projects = allMyProjects.filter(project => {
                const memberInfo = project.members[userEmail];
                return memberInfo && (memberInfo.role === 'owner' || (memberInfo.role === 'editor' && memberInfo.permissions.canAccessDistribution));
            });

            const projectSelect = document.getElementById('projectSelect');
            projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            if (projects.length === 0) {
                projectSelect.innerHTML += '<option value="" disabled>您沒有可進行樓層分配的專案</option>';
            } else {
                projects.forEach(project => projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`);
            }
        } catch (error) {
            showAlert('載入專案失敗', 'error');
        } finally {
            showLoading(false);
        }
    }

    async function loadTenders(projectId) {
        const tenderSelect = document.getElementById('tenderSelect');
        tenderSelect.innerHTML = '<option value="">載入中...</option>';
        tenderSelect.disabled = true;
        try {
            // 查詢時不需要再檢查 createdBy，因為 loadProjects 已經過濾了權限
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
            tenders = tenderDocs.docs;
            tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
            tenders.forEach(tender => tenderSelect.innerHTML += `<option value="${tender.id}">${tender.name}</option>`);
            tenderSelect.disabled = false;
        } catch (error) {
            showAlert('載入標單失敗', 'error');
            tenderSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    async function loadMajorItems(tenderId) {
        const majorItemSelect = document.getElementById('majorItemSelect');
        majorItemSelect.innerHTML = '<option value="">載入中...</option>';
        majorItemSelect.disabled = true;
        try {
            // 【v3.2 修正】查詢時必須同時傳入 projectId，以符合 Firebase 安全規則
            const majorItemDocs = await safeFirestoreQuery("majorItems", [
                { field: "tenderId", operator: "==", value: tenderId },
                { field: "projectId", operator: "==", value: selectedProject.id } // 加上這一行
            ]);
            majorItems = majorItemDocs.docs;
            majorItemSelect.innerHTML = '<option value="">請選擇大項目...</option>';
            majorItems.forEach(item => majorItemSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`);
            majorItemSelect.disabled = false;
        } catch (error) {
            showAlert('載入大項目失敗', 'error');
            majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    // 【v3.1 修正】新增遺漏的 clearAllDistributions 函式
    function clearAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');
        if (!confirm(`確定要清空「${selectedMajorItem.name}」的所有樓層分配嗎？\n此操作不會立即儲存，您需要點擊「儲存所有分配」按鈕來確認變更。`)) return;

        // 將表格中所有的 input 欄位的值都設為空
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.value = '';
        });
        
        // 重新計算一次已分配數量，確保介面更新
        document.querySelectorAll('.item-row').forEach(row => {
            const distributedCell = document.getElementById(`distributed-${row.dataset.itemId}`);
            if (distributedCell) {
                const strongTag = distributedCell.querySelector('strong');
                if(strongTag) {
                    strongTag.textContent = '0';
                }
                distributedCell.classList.remove('error');
            }
        });

        showAlert('已清空畫面上的分配，請點擊儲存按鈕以生效。', 'info');
    }
    
    async function onMajorItemChange() {
        const majorItemId = document.getElementById('majorItemSelect').value;
        if (!majorItemId) { hideMainContent(); return; }
        selectedMajorItem = majorItems.find(m => m.id === majorItemId);

        // 【權限守衛】
        const memberInfo = selectedProject.members[auth.currentUser.email];
        currentUserRole = memberInfo.role;
        currentUserPermissions = memberInfo.permissions || {};
        const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);

        if (!canAccess) {
            showAlert('您沒有權限設定此專案的樓層分配', 'error');
            hideMainContent();
            return;
        }
        
        loadMajorItemData(majorItemId);
    }

    async function saveAllDistributions() {
        if (!selectedMajorItem) return showAlert('請先選擇大項目', 'warning');

        // 【權限守衛】
        const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);
        if (!canAccess) return showAlert('權限不足，無法儲存', 'error');

        showLoading(true, '儲存中...');
        try {
            const batch = db.batch();
            const existingDistributions = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: selectedMajorItem.id }]);
            existingDistributions.docs.forEach(doc => {
                batch.delete(db.collection("distributionTable").doc(doc.id));
            });
            document.querySelectorAll('.quantity-input').forEach(input => {
                const quantity = parseInt(input.value) || 0;
                if (quantity > 0) {
                    const docRef = db.collection("distributionTable").doc();
                    batch.set(docRef, { 
                        projectId: selectedProject.id, // 寫入 projectId
                        tenderId: selectedTender.id, 
                        majorItemId: selectedMajorItem.id, 
                        detailItemId: input.dataset.itemId, 
                        areaType: "樓層", 
                        areaName: input.dataset.floor, 
                        quantity: quantity, 
                        createdBy: auth.currentUser.email, 
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), 
                        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
                    });
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

    // 【新增】匯入功能
    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!selectedMajorItem) {
            showAlert('請先選擇大項目', 'warning');
            event.target.value = '';
            return;
        }

        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
            showAlert('請選擇 Excel (.xlsx, .xls) 或 CSV 檔案', 'error');
            event.target.value = '';
            return;
        }

        showLoading(true, '解析檔案中...');
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let data;
                if (fileName.endsWith('.csv')) {
                    // 處理 CSV 檔案
                    const csvText = e.target.result;
                    data = parseCSV(csvText);
                } else {
                    // 處理 Excel 檔案
                    const arrayBuffer = e.target.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                }
                
                processImportData(data);
                showAlert('✅ 檔案匯入成功！', 'success');
            } catch (error) {
                console.error('檔案解析錯誤:', error);
                showAlert('檔案解析失敗，請確認檔案格式正確', 'error');
            } finally {
                showLoading(false);
                event.target.value = '';
            }
        };

        reader.onerror = function() {
            showAlert('讀取檔案失敗', 'error');
            showLoading(false);
            event.target.value = '';
        };

        if (fileName.endsWith('.csv')) {
            reader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsArrayBuffer(file);
        }
    }

    // 【新增】CSV 解析器
    function parseCSV(csvText) {
        const lines = csvText.split('\n');
        return lines.map(line => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }).filter(row => row.some(cell => cell && cell.length > 0));
    }

    // 【新增】處理匯入資料
    function processImportData(data) {
        if (data.length < 2) {
            showAlert('匯入檔案資料不足', 'warning');
            return;
        }

        const headers = data[0];
        const floorColumns = [];
        
        // 找出樓層欄位
        headers.forEach((header, index) => {
            if (floors.includes(header)) {
                floorColumns.push({ name: header, index: index });
            }
        });

        if (floorColumns.length === 0) {
            showAlert('匯入檔案中找不到對應的樓層欄位', 'warning');
            return;
        }

        let importCount = 0;
        
        // 處理資料行
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const itemName = row[0] || '';
            
            if (!itemName) continue;

            // 找對應的細項
            const detailItem = detailItems.find(item => 
                item.name === itemName || 
                itemName.includes(item.name) || 
                item.name.includes(itemName)
            );

            if (detailItem) {
                floorColumns.forEach(floorCol => {
                    const quantity = parseInt(row[floorCol.index]) || 0;
                    if (quantity > 0) {
                        const input = document.querySelector(`input[data-item-id="${detailItem.id}"][data-floor="${floorCol.name}"]`);
                        if (input) {
                            input.value = quantity;
                            input.classList.add('has-value');
                            onQuantityChange(input);
                            importCount++;
                        }
                    }
                });
            }
        }

        if (importCount > 0) {
            showAlert(`成功匯入 ${importCount} 筆分配資料`, 'success');
        } else {
            showAlert('沒有找到可匯入的資料', 'warning');
        }
    }

    // 【新增】匯出至 Excel
    function exportToExcel() {
        if (!selectedMajorItem || floors.length === 0 || detailItems.length === 0) {
            showAlert('沒有可匯出的資料', 'warning');
            return;
        }

        try {
            const data = [];
            
            // 建立標題行
            const headers = ['細項名稱', '單位', '單價', '總量', ...floors, '已分配總計'];
            data.push(headers);

            // 建立資料行
            detailItems.forEach(item => {
                const originalQuantity = item.totalQuantity || 0;
                const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id);
                const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
                const totalQuantity = originalQuantity + additionalQuantity;
                
                const row = [
                    `${item.sequence || ''} ${item.name || '未命名'}`,
                    item.unit || '-',
                    item.unitPrice || 0,
                    totalQuantity
                ];

                let distributedTotal = 0;
                floors.forEach(floor => {
                    const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor);
                    const quantity = dist ? dist.quantity : 0;
                    row.push(quantity);
                    distributedTotal += quantity;
                });
                
                row.push(distributedTotal);
                data.push(row);
            });

            // 建立工作簿
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "樓層分配");

            // 設定欄寬
            const colWidths = [
                { wch: 30 }, // 細項名稱
                { wch: 10 }, // 單位
                { wch: 12 }, // 單價
                { wch: 10 }, // 總量
                ...floors.map(() => ({ wch: 12 })), // 樓層欄位
                { wch: 12 }  // 已分配總計
            ];
            ws['!cols'] = colWidths;

            // 匯出檔案
            const fileName = `樓層分配_${selectedProject.name}_${selectedTender.name}_${selectedMajorItem.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            showAlert('✅ Excel 檔案匯出成功！', 'success');
        } catch (error) {
            console.error('匯出失敗:', error);
            showAlert('匯出失敗: ' + error.message, 'error');
        }
    }

    // 【新增】樓層管理功能
    function showFloorManager() {
        if (!selectedTender) {
            showAlert('請先選擇標單', 'warning');
            return;
        }

        const modal = document.getElementById('floorModal');
        if (!modal) return;

        // 載入當前樓層設定到模態視窗
        const floorList = document.getElementById('floorList');
        if (floorList) {
            floorList.innerHTML = '';
            floors.forEach((floor, index) => {
                const div = document.createElement('div');
                div.className = 'floor-item';
                div.innerHTML = `
                    <input type="text" value="${floor}" onchange="updateFloorName(${index}, this.value)">
                    <button onclick="removeFloor(${index})" class="delete-btn">刪除</button>
                `;
                floorList.appendChild(div);
            });
        }

        modal.style.display = 'flex';
    }

    function addCustomFloor() {
        const input = document.getElementById('customFloorInput');
        if (!input) return;

        const floorName = input.value.trim();
        if (!floorName) {
            showAlert('請輸入樓層名稱', 'warning');
            return;
        }

        if (floors.includes(floorName)) {
            showAlert('此樓層已存在', 'warning');
            return;
        }

        floors.push(floorName);
        floors.sort(sortFloors);
        input.value = '';
        showFloorManager(); // 重新載入列表
    }

    function clearAllFloors() {
        if (!confirm('確定要清空所有樓層設定嗎？')) return;
        floors = [];
        showFloorManager();
    }

    function applyFloorTemplate(template) {
        let templateFloors = [];
        
        switch (template) {
            case 'basement':
                templateFloors = ['B3', 'B2', 'B1'];
                break;
            case 'lowrise':
                templateFloors = ['1F', '2F', '3F', '4F', '5F'];
                break;
            case 'midrise':
                templateFloors = Array.from({length: 15}, (_, i) => `${i + 1}F`);
                break;
            case 'highrise':
                templateFloors = [...Array.from({length: 30}, (_, i) => `${i + 1}F`), 'RF'];
                break;
        }

        if (templateFloors.length > 0) {
            floors = [...new Set([...floors, ...templateFloors])];
            floors.sort(sortFloors);
            showFloorManager();
        }
    }

    async function saveFloorSettings() {
        if (!selectedTender) return;

        try {
            showLoading(true, '儲存樓層設定中...');
            
            const floorSettingsRef = db.collection("floorSettings");
            const existingQuery = await floorSettingsRef.where("tenderId", "==", selectedTender.id).limit(1).get();
            
            const floorData = {
                tenderId: selectedTender.id,
                floors: floors,
                updatedBy: auth.currentUser.email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (existingQuery.empty) {
                floorData.createdBy = auth.currentUser.email;
                floorData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await floorSettingsRef.add(floorData);
            } else {
                await floorSettingsRef.doc(existingQuery.docs[0].id).update(floorData);
            }

            closeModal('floorModal');
            
            // 如果有選擇的大項目，重新載入分配表
            if (selectedMajorItem) {
                await loadMajorItemData(selectedMajorItem.id);
            }
            
            showAlert('樓層設定已儲存', 'success');
        } catch (error) {
            console.error('儲存樓層設定失敗:', error);
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // 【新增】序列管理功能
    function showSequenceManager() {
        if (!selectedMajorItem || detailItems.length === 0) {
            showAlert('請先選擇大項目', 'warning');
            return;
        }

        const modal = document.getElementById('sequenceModal');
        const container = document.getElementById('sequenceContainer');
        if (!modal || !container) return;

        container.innerHTML = '';
        
        detailItems.forEach(item => {
            const div = document.createElement('div');
            div.className = 'sequence-item';
            div.dataset.itemId = item.id;
            div.innerHTML = `
                <span class="drag-handle">⋮⋮</span>
                <span class="item-name">${item.name}</span>
                <input type="text" class="sequence-input" value="${item.sequence || ''}" 
                       placeholder="序號" data-item-id="${item.id}">
            `;
            container.appendChild(div);
        });

        // 初始化拖拽排序
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: function(evt) {
                console.log('排序已變更');
            }
        });

        modal.style.display = 'flex';
    }

    function resetToOriginalOrder() {
        detailItems.sort(naturalSequenceSort);
        showSequenceManager();
    }

    async function saveSequenceChanges() {
        try {
            showLoading(true, '儲存序列變更中...');
            
            const batch = db.batch();
            const container = document.getElementById('sequenceContainer');
            const sequenceItems = container.children;
            
            for (let i = 0; i < sequenceItems.length; i++) {
                const item = sequenceItems[i];
                const itemId = item.dataset.itemId;
                const sequenceInput = item.querySelector('.sequence-input');
                const newSequence = sequenceInput.value.trim();
                
                // 更新 detailItems 陣列
                const detailItem = detailItems.find(d => d.id === itemId);
                if (detailItem) {
                    detailItem.sequence = newSequence;
                }
                
                // 更新資料庫
                const docRef = db.collection("detailItems").doc(itemId);
                batch.update(docRef, { sequence: newSequence });
            }
            
            await batch.commit();
            
            // 重新排序並重建表格
            detailItems.sort(naturalSequenceSort);
            buildDistributionTable();
            
            closeModal('sequenceModal');
            showAlert('序列已儲存', 'success');
        } catch (error) {
            console.error('儲存序列失敗:', error);
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // 【工具函式】
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('zh-TW', {
            style: 'currency',
            currency: 'TWD',
            minimumFractionDigits: 0
        }).format(amount);
    }
    
    function onProjectChange() { const projectId = document.getElementById('projectSelect').value; document.getElementById('tenderSelect').disabled = true; document.getElementById('majorItemSelect').disabled = true; hideMainContent(); if (!projectId) return; selectedProject = projects.find(p => p.id === projectId); loadTenders(projectId); }
    function onTenderChange() { const tenderId = document.getElementById('tenderSelect').value; document.getElementById('majorItemSelect').disabled = true; hideMainContent(); if (!tenderId) return; selectedTender = tenders.find(t => t.id === tenderId); loadMajorItems(tenderId); }
        async function loadFloorSettings(tenderId) {
        try {
            // 【v3.3 修正】查詢時必須同時傳入 projectId，以符合 Firebase 安全規則
            const snapshot = await db.collection("floorSettings")
                .where("tenderId", "==", tenderId)
                .where("projectId", "==", selectedProject.id) // 加上這一行
                .limit(1)
                .get();
            floors = snapshot.empty ? [] : (snapshot.docs[0].data().floors || []).sort(sortFloors);
        } catch (error) {
            console.error("載入樓層設定失敗", error);
            floors = [];
            // 主動拋出錯誤，讓呼叫者知道載入失敗
            throw new Error('無法載入樓層設定，請檢查權限。');
        }
    }
    async function loadDetailItems(majorItemId) { const detailItemDocs = await safeFirestoreQuery("detailItems", [{ field: "majorItemId", operator: "==", value: majorItemId }]); detailItems = detailItemDocs.docs.sort(naturalSequenceSort); }
    async function loadDistributions(majorItemId) { const distributionDocs = await safeFirestoreQuery("distributionTable", [{ field: "majorItemId", operator: "==", value: majorItemId }]); distributions = distributionDocs.docs; }
    async function loadAllAdditionItems(tenderId) { const additionDocs = await safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "isAddition", operator: "==", value: true }]); allAdditionItems = additionDocs.docs; }
    function onQuantityChange(inputElement) { const itemId = inputElement.dataset.itemId; const allInputsForRow = document.querySelectorAll(`input[data-item-id="${itemId}"]`); const distributedCell = document.getElementById(`distributed-${itemId}`); if (!distributedCell) return; const itemRow = distributedCell.closest('tr'); if (!itemRow) return; const totalQuantity = parseFloat(itemRow.dataset.totalQuantity) || 0; let otherInputsTotal = 0; allInputsForRow.forEach(input => { if (input !== inputElement) { otherInputsTotal += (Number(input.value) || 0); } }); const maxAllowed = totalQuantity - otherInputsTotal; let currentInputValue = Number(inputElement.value) || 0; if (currentInputValue > maxAllowed) { showAlert(`分配數量已達上限 (${totalQuantity})，已自動修正為最大可分配量: ${maxAllowed}`, 'warning'); inputElement.value = maxAllowed; currentInputValue = maxAllowed; } const finalDistributed = otherInputsTotal + currentInputValue; const strongTag = distributedCell.querySelector('strong'); if(strongTag) { strongTag.textContent = finalDistributed; } if (finalDistributed > totalQuantity) { distributedCell.classList.add('error'); } else { distributedCell.classList.remove('error'); } }
    function buildDistributionTable() { const tableHeader = document.getElementById('tableHeader'); const tableBody = document.getElementById('tableBody'); let headerHTML = '<tr><th style="width: 300px;">細項名稱</th><th class="total-column">總量</th>'; floors.forEach(floor => headerHTML += `<th class="floor-header">${floor}</th>`); headerHTML += '<th class="total-column">已分配</th></tr>'; tableHeader.innerHTML = headerHTML; let bodyHTML = ''; if (detailItems.length === 0) { bodyHTML = `<tr><td colspan="${floors.length + 3}" style="text-align:center; padding: 2rem;">此大項目沒有細項資料</td></tr>`; } else { detailItems.forEach((item, index) => { const originalQuantity = item.totalQuantity || 0; const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id); const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0); const currentTotalQuantity = originalQuantity + additionalQuantity; let distributedQuantity = 0; let rowHTML = `<tr class="item-row" data-total-quantity="${currentTotalQuantity}" data-item-id="${item.id}">`; rowHTML += `<td><div class="item-info"><div class="item-name">${item.sequence || `#${index + 1}`}. ${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'} | 單價: ${formatCurrency(item.unitPrice || 0)}</div></div></td>`; rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${currentTotalQuantity}</strong></td>`; floors.forEach(floor => { const dist = distributions.find(d => d.detailItemId === item.id && d.areaName === floor); const quantity = dist ? dist.quantity : 0; distributedQuantity += quantity; rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-floor="${floor}" placeholder="0"></td>`; }); const errorClass = distributedQuantity > currentTotalQuantity ? 'error' : ''; rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedQuantity}</strong></td>`; rowHTML += '</tr>'; bodyHTML += rowHTML; }); } tableBody.innerHTML = bodyHTML; tableBody.querySelectorAll('.quantity-input').forEach(input => { input.addEventListener('input', () => onQuantityChange(input)); }); }
    async function loadMajorItemData(majorItemId) { showLoading(true, '載入大項目資料中...'); try { await Promise.all([ loadFloorSettings(selectedTender.id), loadAllAdditionItems(selectedTender.id), loadDetailItems(majorItemId), loadDistributions(majorItemId) ]); showMainContent(); buildDistributionTable(); } catch (error) { showAlert('載入大項目資料時發生錯誤', 'error'); } finally { showLoading(false); } }
    function hideMainContent() { document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; }
    function showMainContent() { document.getElementById('mainContent').style.display = 'block'; document.getElementById('emptyState').style.display = 'none'; }
    function setupEventListeners() { document.getElementById('projectSelect')?.addEventListener('change', onProjectChange); document.getElementById('tenderSelect')?.addEventListener('change', onTenderChange); document.getElementById('majorItemSelect')?.addEventListener('change', onMajorItemChange); document.getElementById('saveDistributionsBtn')?.addEventListener('click', saveAllDistributions); document.getElementById('clearDistributionsBtn')?.addEventListener('click', clearAllDistributions); document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importInput').click()); document.getElementById('importInput')?.addEventListener('change', handleFileImport); document.getElementById('exportBtn')?.addEventListener('click', exportToExcel); document.getElementById('sequenceManagerBtn')?.addEventListener('click', showSequenceManager); document.getElementById('floorManagerBtn')?.addEventListener('click', showFloorManager); document.getElementById('templateButtons')?.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') applyFloorTemplate(e.target.dataset.template); }); document.getElementById('addCustomFloorBtn')?.addEventListener('click', addCustomFloor); document.getElementById('clearAllFloorsBtn')?.addEventListener('click', clearAllFloors); document.getElementById('saveFloorSettingsBtn')?.addEventListener('click', saveFloorSettings); document.getElementById('cancelFloorModalBtn')?.addEventListener('click', () => closeModal('floorModal')); document.getElementById('floorModal')?.addEventListener('click', (e) => { if(e.target.id === 'floorModal') closeModal('floorModal'); }); document.getElementById('resetOrderBtn')?.addEventListener('click', resetToOriginalOrder); document.getElementById('saveSequenceBtn')?.addEventListener('click', saveSequenceChanges); document.getElementById('cancelSequenceModalBtn')?.addEventListener('click', () => closeModal('sequenceModal')); document.getElementById('sequenceModal')?.addEventListener('click', (e) => { if(e.target.id === 'sequenceModal') closeModal('sequenceModal'); }); }
    function showAlert(message, type = 'info', duration = 3000) { alert(`[${type.toUpperCase()}] ${message}`); }
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.querySelector('.loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const textEl = loadingEl.querySelector('p'); if (textEl) textEl.textContent = message; } }
    function sortFloors(a, b) { const getFloorParts = (floorStr) => { const s = String(floorStr).toUpperCase(); const buildingPrefixMatch = s.match(/^([^\dBRF]+)/); const buildingPrefix = buildingPrefixMatch ? buildingPrefixMatch[1] : ''; const floorMatch = s.match(/([B|R]?)(\d+)/); if (!floorMatch) return { building: buildingPrefix, type: 2, num: 0 }; const [, type, numStr] = floorMatch; const floorType = (type === 'B') ? 0 : (type === 'R') ? 2 : 1; return { building: buildingPrefix, type: floorType, num: parseInt(numStr, 10) }; }; const partsA = getFloorParts(a); const partsB = getFloorParts(b); if (partsA.building.localeCompare(partsB.building) !== 0) return partsA.building.localeCompare(partsB.building); if (partsA.type !== partsB.type) return partsA.type - partsB.type; if (partsA.type === 0) return partsB.num - partsA.num; return partsA.num - partsB.num; }
    function naturalSequenceSort(a, b) { const CHINESE_NUM_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10 }; const re = /(\d+(\.\d+)?)|([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸])|(\D+)/g; const seqA = String(a.sequence || ''); const seqB = String(b.sequence || ''); const partsA = seqA.match(re) || []; const partsB = seqB.match(re) || []; const len = Math.min(partsA.length, partsB.length); for (let i = 0; i < len; i++) { const partA = partsA[i]; const partB = partsB[i]; let numA = parseFloat(partA); let numB = parseFloat(partB); if (isNaN(numA)) numA = CHINESE_NUM_MAP[partA]; if (isNaN(numB)) numB = CHINESE_NUM_MAP[partB]; if (numA !== undefined && numB !== undefined) { if (numA !== numB) return numA - numB; } else { const comparison = partA.localeCompare(partB); if (comparison !== 0) return comparison; } } return partsA.length - partsB.length; }
    
    initializePage();
}
