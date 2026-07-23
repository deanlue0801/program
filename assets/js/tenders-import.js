/**
 * 匯入標單功能 (tenders-import.js) - v1.2 (語法結構修復版)
 * 對應路由: /tenders/import
 * 對應頁面: pages/tenders/import.html
 */
function initImportPage() {
    console.log("🚀 初始化 Excel 匯入標單頁面...");

    // --- 全域變數設定 ---
    let workbook = null;
    let parsedData = []; // 儲存解析後的項目
    let projects = [];
    const db = firebase.firestore();
    const currentUser = firebase.auth().currentUser;

    // --- DOM 元素取得 ---
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const worksheetSelect = document.getElementById('worksheetSelect');
    const startRowInput = document.getElementById('startRow');
    const parseBtn = document.getElementById('parseBtn');
    
    const ruleChineseNumber = document.getElementById('ruleChineseNumber');
    const ruleHeavenlyStem = document.getElementById('ruleHeavenlyStem');
    const ruleRomanNumber = document.getElementById('ruleRomanNumber');
    const ruleCustomPattern = document.getElementById('ruleCustomPattern');
    const customPatternGroup = document.getElementById('customPatternGroup');
    const customPatternInput = document.getElementById('customPattern');

    const previewTable = document.getElementById('previewTable');
    const proceedToImportBtn = document.getElementById('proceedToImportBtn');
    const backToUploadBtn = document.getElementById('backToUploadBtn');
    
    const projectSelectForImport = document.getElementById('projectSelectForImport');
    const tenderNameInput = document.getElementById('tenderName');
    const contractorNameInput = document.getElementById('contractorName');
    const backToPreviewBtn = document.getElementById('backToPreviewBtn');
    const executeImportBtn = document.getElementById('executeImportBtn');

    // Section 區塊
    const uploadSection = document.getElementById('uploadSection');
    const parseSection = document.getElementById('parseSection');
    const previewSection = document.getElementById('previewSection');
    const importSection = document.getElementById('importSection');

    setupEventListeners();
    loadProjects();

    // 1. 事件綁定
    function setupEventListeners() {
        // (A) 檔案拖放與點擊上傳
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#667eea';
            });
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#cbd5e0';
            });
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#cbd5e0';
                if (e.dataTransfer.files.length > 0) {
                    handleFileSelect(e.dataTransfer.files[0]);
                }
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                }
            });
        }

        // 自定義正則表達式切換
        if (ruleCustomPattern) {
            ruleCustomPattern.addEventListener('change', (e) => {
                customPatternGroup.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // 按鈕流程切換
        if (parseBtn) parseBtn.addEventListener('click', parseSelectedSheet);
        if (backToUploadBtn) backToUploadBtn.addEventListener('click', () => switchStep(1));
        if (proceedToImportBtn) proceedToImportBtn.addEventListener('click', () => switchStep(4));
        if (backToPreviewBtn) backToPreviewBtn.addEventListener('click', () => switchStep(3));
        if (executeImportBtn) executeImportBtn.addEventListener('click', executeImport);

        // 重新識別與清除按鈕
        const reDetectBtn = document.getElementById('re-detectBtn');
        if (reDetectBtn) reDetectBtn.addEventListener('click', parseSelectedSheet);

        const clearClassBtn = document.getElementById('clear-classBtn');
        if (clearClassBtn) {
            clearClassBtn.addEventListener('click', () => {
                parsedData.forEach(item => item.type = 'detail');
                renderPreviewTable();
            });
        }
    }

    // 2. 步驟切換器
    function switchStep(stepNum) {
        [1, 2, 3, 4].forEach(i => {
            const stepEl = document.getElementById(`step${i}`);
            if (stepEl) {
                stepEl.className = i === stepNum ? 'step active' : (i < stepNum ? 'step completed' : 'step inactive');
            }
        });

        uploadSection.style.display = stepNum === 1 ? 'block' : 'none';
        parseSection.style.display = stepNum === 2 ? 'block' : 'none';
        previewSection.style.display = stepNum === 3 ? 'block' : 'none';
        importSection.style.display = stepNum === 4 ? 'block' : 'none';
    }

    // 3. 處理選擇檔案 (Step 1 -> Step 2)
    async function handleFileSelect(file) {
        if (typeof XLSX === 'undefined') {
            return showAlert('缺少 SheetJS (XLSX) 套件，請確認頁面已載入該函式庫', 'error');
        }

        showLoading(true, `讀取 ${file.name} 中...`);
        try {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data, { type: 'array' });

            worksheetSelect.innerHTML = '';
            workbook.SheetNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                worksheetSelect.appendChild(opt);
            });

            // 設定預設標單名稱為檔名
            if (tenderNameInput) {
                tenderNameInput.value = file.name.replace(/\.[^/.]+$/, "");
            }

            switchStep(2);
        } catch (err) {
            console.error(err);
            showAlert('檔案讀取失敗: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    }

// 4. 解析 Sheet (Step 2 -> Step 3)
    function parseSelectedSheet() {
        if (!workbook) return;
        const sheetName = worksheetSelect.value;
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;
    
        const startRow = parseInt(startRowInput.value) || 1;
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
        parsedData = [];
        let totalAmount = 0;
    
        // 安全轉換純數字的輔助函式
        const parseStrictNumber = (val) => {
            if (val === undefined || val === null) return NaN;
            const str = String(val).trim();
            if (str === '' || str === '-') return NaN;
            if (/[a-zA-Z#,]/.test(str)) return NaN;
            const num = parseFloat(str);
            return isNaN(num) ? NaN : num;
        };

        // 🔍 【步驟 A】採樣檢測：判斷這張 Excel 是否包含「規格說明」欄位
        let hasSpecColumn = true; 
        let qtyAtCol3Count = 0; // 數量出現在 row[3] 的次數
        let qtyAtCol4Count = 0; // 數量出現在 row[4] 的次數

        // 抽取前 30 列進行結構採樣
        const sampleLimit = Math.min(rawData.length, startRow + 30);
        for (let i = startRow - 1; i < sampleLimit; i++) {
            const r = rawData[i];
            if (!r) continue;
            const valCol3 = parseStrictNumber(r[3]); // 測試 row[3] 是否為數字
            const valCol4 = parseStrictNumber(r[4]); // 測試 row[4] 是否為數字

            if (!isNaN(valCol3) && valCol3 > 0) qtyAtCol3Count++;
            if (!isNaN(valCol4) && valCol4 > 0) qtyAtCol4Count++;
        }

        // 如果數量出現在 row[3] 的頻率高於 row[4]，代表這張 Excel 沒有規格欄位！
        if (qtyAtCol3Count > qtyAtCol4Count) {
            hasSpecColumn = false;
            console.log("📊 自動判讀結果：這張 Excel 欄位結構為【無規格欄】(項次, 品名, 單位, 數量, 單價, 複價)");
        } else {
            console.log("📊 自動判讀結果：這張 Excel 欄位結構為【有規格欄】(項次, 品名, 規格, 單位, 數量, 單價, 複價)");
        }

        // 🔍 【步驟 B】依據判定好的結構，全表統一套用欄位索引
        for (let i = startRow - 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const seq = String(row[0] || '').trim();
            const name = String(row[1] || '').trim();
            
            let spec = '';
            let unit = '';
            let qtyRaw, priceRaw, amountRaw;

            if (hasSpecColumn) {
                // 有規格欄的標準對應
                spec = String(row[2] || '').trim();
                unit = String(row[3] || '').trim();
                qtyRaw = row[4];
                priceRaw = row[5];
                amountRaw = row[6];
            } else {
                // 無規格欄的縮減對應
                spec = ''; // 無規格
                unit = String(row[2] || '').trim();
                qtyRaw = row[3];
                priceRaw = row[4];
                amountRaw = row[5];
            }
            
            // 嚴格解析數量、單價、複價
            const qtyNum = parseStrictNumber(qtyRaw);
            const priceNum = parseStrictNumber(priceRaw);
            const amountNum = parseStrictNumber(amountRaw);
    
            const qty = !isNaN(qtyNum) ? qtyNum : 0;
            const price = !isNaN(priceNum) ? priceNum : 0;
            const amount = !isNaN(amountNum) ? amountNum : (qty * price);
    
            // 完全空白列跳過
            if (!seq && !name && !spec && !unit) continue;
    
            // --- 核心邏輯 1：跨行（續行）自動併入上一行 ---
            if (!seq && !unit && isNaN(qtyNum) && parsedData.length > 0) {
                const lastItem = parsedData[parsedData.length - 1];
                if (name) {
                    lastItem.name += (lastItem.name ? ' ' : '') + name;
                }
                if (spec) {
                    lastItem.spec += (lastItem.spec ? ' ' : '') + spec;
                }
                continue;
            }
    
            // --- 核心邏輯 2：大項目與細項判定 ---
            const isMajor = checkIsMajorItem(seq, name);
    
            if (!isMajor) {
                totalAmount += amount;
            }
    
            parsedData.push({
                id: i,
                type: isMajor ? 'major' : 'detail',
                seq: seq,
                name: name,
                spec: spec,
                unit: unit,
                qty: qty,
                price: price,
                amount: amount
            });
        }
    
        renderPreviewTable();
        switchStep(3);
    }

    // 大項目識別判斷函式 (獨立放於外層，含末端流水號過濾)
    function checkIsMajorItem(seq, name) {
        const fullStr = `${seq} ${name}`.trim();

        // 1. 先攔截細項特徵：若編號末端為 .數字. 或 .(數字) (如 .1. 或 .1.(1))，直接排除大項！
        if (/\.\d+(\.\(\d+\))?\.?$/.test(seq) || /\(\d+\)$/.test(seq)) {
            return false;
        }

        // 2. 匹配標準大項開頭：中文數字/天干地支/羅馬數字 (如: 甲.參.二. 或 甲.參.二.(一))
        if (ruleChineseNumber && ruleChineseNumber.checked && /^([一二三四五六七八九十壹貳參肆伍陸柒捌玖拾]+[、. ]|[甲乙丙丁戊己庚辛壬癸]+[、. ])/.test(fullStr)) {
            return true;
        }
        if (ruleHeavenlyStem && ruleHeavenlyStem.checked && /^[甲乙丙丁戊己庚辛壬癸]+[、. ]/.test(fullStr)) {
            return true;
        }
        if (ruleRomanNumber && ruleRomanNumber.checked && /^(I|II|III|IV|V|VI|VII|VIII|IX|X)+[、. ]/i.test(fullStr)) {
            return true;
        }
        
        // 3. 自定義模式
        if (ruleCustomPattern && ruleCustomPattern.checked && customPatternInput && customPatternInput.value) {
            try {
                const reg = new RegExp(customPatternInput.value);
                if (reg.test(fullStr)) return true;
            } catch (e) {
                console.warn('無效的正則表達式');
            }
        }
        return false;
    }

    // 5. 渲染預覽表格
    function renderPreviewTable() {
        let majorCount = 0, detailCount = 0, totalAmt = 0;

        let html = `
            <thead>
                <tr>
                    <th>類型</th>
                    <th>項次</th>
                    <th>項目名稱</th>
                    <th>規格說明</th>
                    <th>單位</th>
                    <th>數量</th>
                    <th>單價</th>
                    <th>複價</th>
                </tr>
            </thead>
            <tbody>
        `;

        parsedData.forEach((item, index) => {
            if (item.type === 'major') {
                majorCount++;
                html += `
                    <tr style="background-color: #e9ecef; font-weight: bold;">
                        <td>
                            <span class="badge" style="background:#4a5568; color:#fff; cursor:pointer;" onclick="window.toggleItemType(${index})">
                                大項目
                            </span>
                        </td>
                        <td>${item.seq}</td>
                        <td colspan="6">${item.name}</td>
                    </tr>
                `;
            } else {
                detailCount++;
                totalAmt += item.amount;
                html += `
                    <tr>
                        <td>
                            <span class="badge" style="background:#cbd5e0; color:#2d3748; cursor:pointer;" onclick="window.toggleItemType(${index})">
                                細項
                            </span>
                        </td>
                        <td>${item.seq}</td>
                        <td>${item.name}</td>
                        <td>${item.spec}</td>
                        <td>${item.unit}</td>
                        <td style="text-align:right;">${item.qty}</td>
                        <td style="text-align:right;">${item.price.toLocaleString()}</td>
                        <td style="text-align:right;">${item.amount.toLocaleString()}</td>
                    </tr>
                `;
            }
        });

        html += `</tbody>`;
        previewTable.innerHTML = html;

        document.getElementById('summaryTotal').textContent = parsedData.length;
        document.getElementById('summaryMajor').textContent = majorCount;
        document.getElementById('summaryDetail').textContent = detailCount;
        document.getElementById('summaryAmount').textContent = '$' + totalAmt.toLocaleString();

        window.toggleItemType = (idx) => {
            parsedData[idx].type = parsedData[idx].type === 'major' ? 'detail' : 'major';
            renderPreviewTable();
        };
    }

    // 6. 載入可匯入的專案選單 (Step 4)
    async function loadProjects() {
        try {
            const snapshot = await db.collection('projects').get();
            projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (projectSelectForImport) {
                projectSelectForImport.innerHTML = '<option value="">請選擇專案...</option>' + 
                    projects.map(p => `<option value="${p.id}">${p.name || p.code}</option>`).join('');
            }
        } catch (err) {
            console.error('載入專案失敗:', err);
        }
    }

    // 7. 執行匯入資料庫
    async function executeImport() {
        const projectId = projectSelectForImport.value;
        const tenderName = tenderNameInput.value.trim();
        const contractorName = contractorNameInput.value.trim();

        if (!projectId) return showAlert('請選擇專案', 'warning');
        if (!tenderName) return showAlert('請輸入標單名稱', 'warning');

        showLoading(true, '正在寫入資料庫...');

        try {
            // A. 新增 Tender 文件
            const tenderRef = await db.collection('tenders').add({
                projectId: projectId,
                name: tenderName,
                contractor: contractorName,
                createdBy: currentUser ? currentUser.email : '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            let currentMajorId = null;
            let currentMajorSeq = '';
            let batches = [];
            let currentBatch = db.batch();
            let opCount = 0;

            // B. 逐列處理 Major Items 與 Detail Items
            for (const item of parsedData) {
                if (item.type === 'major') {
                    const majorRef = db.collection('majorItems').doc();
                    currentMajorId = majorRef.id;
                    currentMajorSeq = item.seq;

                    currentBatch.set(majorRef, {
                        projectId: projectId,
                        tenderId: tenderRef.id,
                        sequence: item.seq,
                        name: item.name,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    opCount++;
                } else {
                    const detailRef = db.collection('detailItems').doc();
                    currentBatch.set(detailRef, {
                        projectId: projectId,
                        tenderId: tenderRef.id,
                        majorItemId: currentMajorId,
                        sequence: item.seq,
                        name: item.name,
                        specification: item.spec,
                        unit: item.unit,
                        quantity: item.qty,
                        totalQuantity: item.qty,
                        unitPrice: item.price,
                        amount: item.amount,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    opCount++;
                }

                if (opCount >= 450) {
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch();
                    opCount = 0;
                }
            }

            if (opCount > 0) batches.push(currentBatch.commit());
            await Promise.all(batches);

            showAlert('🎉 標單匯入成功！', 'success');
            setTimeout(() => {
                if (typeof navigateTo === 'function') {
                    navigateTo(`/tenders/procurement?projectId=${projectId}&tenderId=${tenderRef.id}`);
                } else {
                    window.location.href = `/tenders/procurement`;
                }
            }, 1000);

        } catch (err) {
            console.error('匯入失敗:', err);
            showAlert('匯入失敗: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // 輔助函式
    function showLoading(show, msg) {
        const loadingEl = document.getElementById('loadingSection');
        if (loadingEl) {
            loadingEl.style.display = show ? 'flex' : 'none';
            const txt = document.getElementById('loadingText');
            if (txt && msg) txt.textContent = msg;
        }
    }

    function showAlert(msg, type) {
        alert(msg);
    }
}
