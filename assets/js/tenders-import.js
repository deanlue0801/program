/**
 * EXCEL 匯入頁面 (tenders/import.js) (SPA 版本) - v2.2 新增天干地支規則
 * 由 router.js 呼叫 initImportPage() 函數來啟動
 */
function initImportPage() {

    // --- 頁面狀態管理 ---
    let selectedFile = null;
    let workbook = null;
    let parsedData = [];
    let projects = [];

    // --- 初始化與事件綁定 ---
    function initializePage() {
        console.log("🚀 初始化 EXCEL 匯入頁面...");
        if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
        setupEventListeners();
        loadProjects();
    }

    function setupEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const customPatternCheckbox = document.getElementById('ruleCustomPattern');
        const customPatternGroup = document.getElementById('customPatternGroup');

        if (uploadArea) {
            uploadArea.onclick = () => fileInput.click();
            uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); };
            uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');
            uploadArea.ondrop = (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                if (e.dataTransfer.files[0]) handleFileSelect({ target: { files: e.dataTransfer.files } });
            };
        }
        if (fileInput) fileInput.onchange = handleFileSelect;
        if (customPatternCheckbox) customPatternCheckbox.onchange = () => {
            if (customPatternGroup) customPatternGroup.style.display = customPatternCheckbox.checked ? 'block' : 'none';
        };
        
        document.getElementById('parseBtn')?.addEventListener('click', parseExcel);
        document.getElementById('backToUploadBtn')?.addEventListener('click', backToUpload);
        document.getElementById('proceedToImportBtn')?.addEventListener('click', proceedToImport);
        document.getElementById('backToPreviewBtn')?.addEventListener('click', backToPreview);
        document.getElementById('executeImportBtn')?.addEventListener('click', executeImport);
        document.getElementById('re-detectBtn')?.addEventListener('click', autoDetectMajorItems);
        document.getElementById('clear-classBtn')?.addEventListener('click', clearAllClassifications);
    }
    
    function parseCurrency(value) {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string' || value.trim() === '') return 0;
        const cleanedValue = value.replace(/[^0-9.-]+/g,"");
        return parseFloat(cleanedValue) || 0;
    }

    // --- 核心邏輯 ---
    async function loadProjects() {
        try {
            showLoading(true, '載入專案列表...');
            const projectDocs = await safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }], { field: "name", direction: "asc" });
            projects = projectDocs.docs;
            updateProjectOptions();
        } catch (error) {
            showAlert('載入專案失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function updateProjectOptions() {
        const projectSelect = document.getElementById('projectSelectForImport');
        if (!projectSelect) return;
        projectSelect.innerHTML = '<option value="">請選擇專案</option>';
        projects.forEach(project => {
            projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
        });
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.name.match(/\.(xls|xlsx)$/i)) return showAlert('請選擇 EXCEL 檔案 (.xls 或 .xlsx)', 'error');
        if (file.size > 10 * 1024 * 1024) return showAlert('檔案大小不能超過 10MB', 'error');

        selectedFile = file;
        document.getElementById('tenderName').value = file.name.replace(/\.(xls|xlsx)$/i, '');
        showAlert(`檔案 "${file.name}" 已選擇`, 'success');
        setActiveStep(2);
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('parseSection').style.display = 'block';
        readExcelFile(file);
    }

    function readExcelFile(file) {
        showLoading(true, '讀取 EXCEL 檔案...');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const worksheetSelect = document.getElementById('worksheetSelect');
                worksheetSelect.innerHTML = '';
                workbook.SheetNames.forEach(name => worksheetSelect.innerHTML += `<option value="${name}">${name}</option>`);
                showAlert('EXCEL 檔案讀取成功', 'success');
            } catch (error) {
                showAlert('解析檔案失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function parseExcel() {
        if (!workbook) return showAlert('請先選擇檔案', 'error');
        const worksheetName = document.getElementById('worksheetSelect').value;
        if (!worksheetName) return showAlert('請選擇工作表', 'error');

        try {
            showLoading(true, '解析 EXCEL 資料...');
            const worksheet = workbook.Sheets[worksheetName];
            const startRow = parseInt(document.getElementById('startRow').value) || 1;
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: startRow - 1, raw: false, defval: "" });
            
            parsedData = [];
            let currentMajorItem = null;

            jsonData.forEach((row, index) => {
                const itemName = row[1] ? String(row[1]).trim() : '';
                if (!itemName) return;
                
                const quantity = parseFloat(row[3]) || 0;
                const unitPrice = parseCurrency(row[4]);
                let totalPrice = parseCurrency(row[5]);
                
                if (totalPrice === 0 && quantity > 0 && unitPrice > 0) totalPrice = quantity * unitPrice;

                const rowData = {
                    rowNumber: startRow + index, type: 'other', sequence: row[0] || '', name: itemName,
                    unit: row[2] || '', quantity: quantity, unitPrice: unitPrice,
                    totalPrice: totalPrice, parentId: null
                };
                
                if (isMajorItem(rowData.name, rowData.sequence)) {
                    rowData.type = 'major';
                    currentMajorItem = rowData;
                } else if (currentMajorItem && rowData.name) {
                    rowData.type = 'detail';
                    rowData.parentId = currentMajorItem.rowNumber;
                }
                parsedData.push(rowData);
            });
            showLoading(false);
            showAlert('EXCEL 解析完成', 'success');
            setActiveStep(3);
            document.getElementById('parseSection').style.display = 'none';
            document.getElementById('previewSection').style.display = 'block';
            updatePreview();
        } catch (error) {
            showAlert('解析失敗: ' + error.message, 'error');
            showLoading(false);
        }
    }

    function isMajorItem(name, sequence) {
        if (!name && !sequence) return false;
        const text = (String(sequence) + ' ' + name).trim();
        
        if (document.getElementById('ruleChineseNumber').checked && /^[一二三四五六七八九十]/.test(text)) return true;
        // --- 【關鍵修正】: 新增對天干地支的判斷規則 ---
        if (document.getElementById('ruleHeavenlyStem').checked && /^[甲乙丙丁戊己庚辛壬癸]/.test(text)) return true;
        if (document.getElementById('ruleRomanNumber').checked && /^[IVX]+\.?\s/.test(text)) return true;
        if (document.getElementById('ruleCustomPattern').checked) {
            const pattern = document.getElementById('customPattern').value;
            if (pattern) try { if (new RegExp(pattern).test(text)) return true; } catch (e) { console.warn("自定義正則表達式錯誤"); }
        }
        return false;
    }

    function updatePreview() {
        let totalAmount = 0, majorCount = 0, detailCount = 0;
        const previewTable = document.getElementById('previewTable');
        previewTable.innerHTML = `
            <thead>
                <tr>
                    <th>行號</th><th>類型</th><th>項次</th><th>項目名稱</th><th>單位</th>
                    <th>數量</th><th>單價</th><th>總價</th><th>操作</th>
                </tr>
            </thead>
            <tbody></tbody>`;

        const newTableBody = previewTable.querySelector('tbody');

        parsedData.forEach((item, index) => {
            if (item.type === 'major') majorCount++; else if (item.type === 'detail') detailCount++;
            totalAmount += item.totalPrice || 0;
            const newRow = newTableBody.insertRow();
            newRow.innerHTML = `
                <td>${item.rowNumber}</td>
                <td><span class="item-type ${item.type}" data-index="${index}">${getTypeLabel(item.type)}</span></td>
                <td>${item.sequence}</td>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td>${formatCurrency(item.totalPrice)}</td>
                <td><button class="btn btn-danger btn-sm" data-index="${index}">刪除</button></td>`;
            
            newRow.querySelector('.item-type').onclick = () => toggleItemType(index);
            newRow.querySelector('.btn-danger').onclick = () => removeItem(index);
        });
        
        document.getElementById('summaryTotal').textContent = parsedData.length;
        document.getElementById('summaryMajor').textContent = majorCount;
        document.getElementById('summaryDetail').textContent = detailCount;
        document.getElementById('summaryAmount').textContent = formatCurrency(totalAmount);
    }

    function getTypeLabel(type) { return { major: '大項目', detail: '細項', other: '其他' }[type]; }

    function toggleItemType(index) {
        const types = ['other', 'major', 'detail'];
        const currentType = parsedData[index].type;
        parsedData[index].type = types[(types.indexOf(currentType) + 1) % types.length];
        updatePreview();
    }

    function removeItem(index) {
        if (confirm('確定要刪除這個項目嗎？')) {
            parsedData.splice(index, 1);
            updatePreview();
        }
    }

    function autoDetectMajorItems() {
        let currentMajorItem = null;
        parsedData.forEach(item => {
            if (isMajorItem(item.name, item.sequence)) {
                item.type = 'major'; item.parentId = null; currentMajorItem = item;
            } else if (currentMajorItem && item.name) {
                item.type = 'detail'; item.parentId = currentMajorItem.rowNumber;
            } else {
                item.type = 'other'; item.parentId = null;
            }
        });
        updatePreview();
        showAlert('重新識別完成', 'success');
    }

    function clearAllClassifications() {
        parsedData.forEach(item => { item.type = 'other'; item.parentId = null; });
        updatePreview();
    }

    async function executeImport() {
        const projectId = document.getElementById('projectSelectForImport').value;
        const tenderName = document.getElementById('tenderName').value.trim();
        if (!projectId || !tenderName) return showAlert('請選擇專案並輸入標單名稱', 'error');
        try {
            showLoading(true, '正在匯入資料到 Firebase...');
            const totalAmount = parsedData.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const tenderData = {
                projectId, name: tenderName, contractorName: document.getElementById('contractorName').value.trim(),
                code: `TENDER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
                totalAmount, tax: Math.round(totalAmount * 0.05), status: 'planning',
                createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const tenderRef = await db.collection('tenders').add(tenderData);
            
            const batch = db.batch();
            const majorItems = parsedData.filter(item => item.type === 'major');
            const detailItems = parsedData.filter(item => item.type === 'detail');
            const majorItemMap = {};

            majorItems.forEach(majorItem => {
                const majorRef = db.collection('majorItems').doc();
                batch.set(majorRef, { tenderId: tenderRef.id, sequence: majorItem.sequence || '', name: majorItem.name || '', amount: majorItem.totalPrice || 0, status: 'planning', createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                majorItemMap[majorItem.rowNumber] = majorRef.id;
            });
            detailItems.forEach(detailItem => {
                const detailRef = db.collection('detailItems').doc();
                batch.set(detailRef, { tenderId: tenderRef.id, majorItemId: majorItemMap[detailItem.parentId] || null, sequence: detailItem.sequence || '', name: detailItem.name || '', unitPrice: detailItem.unitPrice || 0, totalPrice: detailItem.totalPrice || 0, unit: detailItem.unit || '', totalQuantity: detailItem.quantity || 0, createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();

            showLoading(false);
            showAlert(`成功匯入！創建了 ${majorItems.length} 個大項目和 ${detailItems.length} 個細項`, 'success');
            
            setTimeout(() => navigateTo('/program/tenders/list'), 2000);

        } catch (error) {
            showAlert('匯入失敗: ' + error.message, 'error');
            showLoading(false);
        }
    }

    // --- UI 流程控制 ---
    function setActiveStep(stepNumber) {
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step${i}`);
            if(!step) continue;
            if (i < stepNumber) step.className = 'step completed';
            else if (i === stepNumber) step.className = 'step active';
            else step.className = 'step inactive';
        }
    }
    function backToUpload() {
        setActiveStep(1);
        document.getElementById('parseSection').style.display = 'none';
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        selectedFile = workbook = null;
        parsedData = [];
        document.getElementById('fileInput').value = '';
    }
    function proceedToImport() {
        if (parsedData.length === 0) return showAlert('沒有可匯入的資料', 'error');
        setActiveStep(4);
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('importSection').style.display = 'block';
    }
    function backToPreview() {
        setActiveStep(3);
        document.getElementById('importSection').style.display = 'none';
        document.getElementById('previewSection').style.display = 'block';
    }
    function showLoading(show, text = '處理中...') {
        const loadingSection = document.getElementById('loadingSection');
        if (loadingSection) {
            loadingSection.style.display = show ? 'flex' : 'none';
            document.getElementById('loadingText').textContent = text;
        }
    }

    // --- 頁面啟動點 ---
    initializePage();
}
