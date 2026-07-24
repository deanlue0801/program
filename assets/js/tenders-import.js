/**
 * 匯入標單功能 (tenders-import.js) - v1.3 (欄位結構自動判讀增強版)
 * 對應路由: /tenders/import
 * 對應頁面: pages/tenders/import.html
 */
function initImportPage() {
    console.log("🚀 初始化 Excel 匯入標單頁面 (v1.3)...");

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

    // 全域切換類型輔助函式 (供 HTML onclick 呼叫)
    window.toggleItemType = function(index) {
        if (parsedData[index]) {
            parsedData[index].type = parsedData[index].type === 'major' ? 'detail' : 'major';
            renderPreviewTable();
        }
    };

    // 2. 步驟切換器
    function switchStep(stepNum) {
        [1, 2, 3, 4].forEach(i => {
            const stepEl = document.getElementById(`step${i}`);
            if (stepEl) {
                stepEl.className = i === stepNum ? 'step active' : (i < stepNum ? 'step completed' : 'step inactive');
            }
        });

        if (uploadSection) uploadSection.style.display = stepNum === 1 ? 'block' : 'none';
        if (parseSection) parseSection.style.display = stepNum === 2 ? 'block' : 'none';
        if (previewSection) previewSection.style.display = stepNum === 3 ? 'block' : 'none';
        if (importSection) importSection.style.display = stepNum === 4 ? 'block' : 'none';
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

        // 常見工程單位比對（用於特徵判斷）
        const commonUnits = ['式', '項', '台', '套', '組', '個', '米', 'm', 'M', 'kg', '隻', '張', '塊', '捲', '公尺', '平方公尺', 'm2', 'M2', 'm³', '式'];
        const isLikelyUnit = (val) => {
            if (!val) return false;
            const s = String(val).trim();
            return commonUnits.includes(s) || s.length <= 4;
        };

        // 🔍 【步驟 A】採樣檢測：強化判斷這張 Excel 是否包含「規格說明」欄位
        let hasSpecColumn = true; 
        let qtyAtCol3Count = 0; // 數量出現在 col 3 (第4欄) 的次數
        let qtyAtCol4Count = 0; // 數量出現在 col 4 (第5欄) 的次數
        let unitAtCol2Count = 0; // 單位出現在 col 2 (第3欄) 的次數

        const sampleLimit = Math.min(rawData.length, startRow + 40);
        for (let i = startRow - 1; i < sampleLimit; i++) {
            const r = rawData[i];
            if (!r) continue;

            const valCol2 = String(r[2] || '').trim();
            const valCol3 = parseStrictNumber(r[3]);
            const valCol4 = parseStrictNumber(r[4]);

            if (isLikelyUnit(valCol2) && isNaN(parseStrictNumber(valCol2))) unitAtCol2Count++;
            if (!isNaN(valCol3) && valCol3 > 0) qtyAtCol3Count++;
            if (!isNaN(valCol4) && valCol4 > 0) qtyAtCol4Count++;
        }

        // 綜合判定：若 col 2 經常為單位，或 col 3 經常為數量，判定為【無規格欄】
        if (qtyAtCol3Count > qtyAtCol4Count || unitAtCol2Count > 5) {
            hasSpecColumn = false;
            console.log("📊 自動判讀結果：這張 Excel 欄位結構為【無規格欄】(項次, 品名, 單位, 數量, 單價, 複價)");
        } else {
            console.log("📊 自動判讀結果：這張 Excel 欄位結構為【有規格欄】(項次, 品名, 規格, 單位, 數量, 單價, 複價)");
        }

        // 🔍 【步驟 B】全表解析
        for (let i = startRow - 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const seq = String(row[0] || '').trim();
            const name = String(row[1] || '').trim();
            
            let spec = '';
            let unit = '';
            let qtyRaw, priceRaw, amountRaw;

            if (hasSpecColumn) {
                spec = String(row[2] || '').trim();
                unit = String(row[3] || '').trim();
                qtyRaw = row[4];
                priceRaw = row[5];
                amountRaw = row[6];
            } else {
                spec = ''; 
                unit = String(row[2] || '').trim();
                qtyRaw = row[3];
                priceRaw = row[4];
                amountRaw = row[5];
            }
            
            const qtyNum = parseStrictNumber(qtyRaw);
            const priceNum = parseStrictNumber(priceRaw);
            const amountNum = parseStrictNumber(amountRaw);
    
            const qty = !isNaN(qtyNum) ? qtyNum : 0;
            const price = !isNaN(priceNum) ? priceNum : 0;
            const amount = !isNaN(amountNum) ? amountNum : (qty * price);
    
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

    // 大項目識別判斷函式
    function checkIsMajorItem(seq, name) {
        const fullStr = `${seq} ${name}`.trim();

        // 1. 攔截細項特徵：若編號末端為 .數字. 或 .(數字)
        if (/\.\d+(\.\(\d+\))?\.?$/.test(seq) || /\(\d+\)$/.test(seq)) {
            return false;
        }

        // 2. 匹配標準大項開頭
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
        if (!previewTable) return;

        let majorCount = 0, detailCount = 0, totalAmt = 0;

        let html = `
            <thead>
                <tr>
                    <th style="width: 80px;">類型</th>
                    <th style="width: 100px;">項次</th>
                    <th>項目名稱</th>
                    <th>規格說明</th>
                    <th style="width: 60px;">單位</th>
                    <th style="width: 80px;" class="text-right">數量</th>
                    <th style="width: 100px;" class="text-right">單價</th>
                    <th style="width: 120px;" class="text-right">複價</th>
                </tr>
            </thead>
            <tbody>
        `;

        parsedData.forEach((item, index) => {
            if (item.type === 'major') {
                majorCount++;
                html += `
                    <tr style="background-color: #f7fafc; font-weight: bold;">
                        <td>
                            <span class="badge" style="background:#4a5568; color:#fff; cursor:pointer; padding: 4px 8px; border-radius: 4px;" onclick="window.toggleItemType(${index})">
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
                            <span class="badge" style="background:#e2e8f0; color:#2d3748; cursor:pointer; padding: 4px 8px; border-radius: 4px;" onclick="window.toggleItemType(${index})">
                                細項
                            </span>
                        </td>
                        <td>${item.seq}</td>
                        <td>${item.name}</td>
                        <td>${item.spec || '-'}</td>
                        <td style="text-align: center;">${item.unit}</td>
                        <td style="text-align: right;">${item.qty ? item.qty.toLocaleString() : 0}</td>
                        <td style="text-align: right;">${formatCurrency(item.price)}</td>
                        <td style="text-align: right;">${formatCurrency(item.amount)}</td>
                    </tr>
                `;
            }
        });

        html += `</tbody>`;
        previewTable.innerHTML = html;

        // 更新統計數據 UI
        const parsedMajorCountEl = document.getElementById('parsedMajorCount');
        const parsedDetailCountEl = document.getElementById('parsedDetailCount');
        const parsedTotalAmountEl = document.getElementById('parsedTotalAmount');

        if (parsedMajorCountEl) parsedMajorCountEl.textContent = majorCount;
        if (parsedDetailCountEl) parsedDetailCountEl.textContent = detailCount;
        if (parsedTotalAmountEl) parsedTotalAmountEl.textContent = formatCurrency(totalAmt);
    }

    // 6. 載入可寫入專案選單
    async function loadProjects() {
        if (!projectSelectForImport) return;
        try {
            const snapshot = await db.collection('projects').get();
            projects = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (currentUser && data.members && data.members[currentUser.email]) {
                    const member = data.members[currentUser.email];
                    if (member.role === 'owner' || (member.role === 'editor' && member.permissions?.canAccessTenders)) {
                        projects.push({ id: doc.id, name: data.name });
                    }
                }
            });

            projectSelectForImport.innerHTML = '<option value="">請選擇專案...</option>';
            projects.forEach(p => {
                projectSelectForImport.innerHTML += `<option value="${p.id}">${p.name}</option>`;
            });

            // 支援從 URL query 帶入 projectId
            const params = new URLSearchParams(window.location.search);
            const pid = params.get('projectId');
            if (pid && projects.some(p => p.id === pid)) {
                projectSelectForImport.value = pid;
            }
        } catch (error) {
            console.error("載入專案選單失敗:", error);
        }
    }

    // 7. 執行匯入資料庫 (Step 4)
    async function executeImport() {
        const projectId = projectSelectForImport ? projectSelectForImport.value : '';
        const tenderName = tenderNameInput ? tenderNameInput.value.trim() : '';
        const contractorName = contractorNameInput ? contractorNameInput.value.trim() : '';

        if (!projectId) return showAlert('請選擇要匯入的專案', 'warning');
        if (!tenderName) return showAlert('請輸入標單名稱', 'warning');
        if (parsedData.length === 0) return showAlert('沒有可匯入的項目資料', 'warning');

        showLoading(true, '寫入標單資料庫中...');

        try {
            // A. 建立 Tender 主文件
            const tenderRef = db.collection('tenders').doc();
            const tenderId = tenderRef.id;

            const tenderData = {
                projectId,
                name: tenderName,
                contractor: contractorName,
                status: 'planning',
                createdBy: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await tenderRef.set(tenderData);

            // B. 批次寫入 MajorItems 與 DetailItems
            let currentMajorId = null;
            let currentMajorSeq = '';
            let batch = db.batch();
            let batchOpCount = 0;
            const batches = [];

            const commitBatchIfNeeded = () => {
                if (batchOpCount >= 400) {
                    batches.push(batch.commit());
                    batch = db.batch();
                    batchOpCount = 0;
                }
            };

            for (const item of parsedData) {
                if (item.type === 'major') {
                    const majorRef = db.collection('majorItems').doc();
                    currentMajorId = majorRef.id;
                    currentMajorSeq = item.seq;

                    batch.set(majorRef, {
                        tenderId,
                        projectId,
                        sequence: item.seq,
                        name: item.name,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    batchOpCount++;
                    commitBatchIfNeeded();
                } else {
                    const detailRef = db.collection('detailItems').doc();
                    batch.set(detailRef, {
                        tenderId,
                        projectId,
                        majorItemId: currentMajorId || '',
                        sequence: item.seq,
                        name: item.name,
                        spec: item.spec || '',
                        unit: item.unit || '',
                        totalQuantity: item.qty || 0,
                        unitPrice: item.price || 0,
                        totalPrice: item.amount || 0,
                        excludeFromProgress: false,
                        isAddition: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    batchOpCount++;
                    commitBatchIfNeeded();
                }
            }

            if (batchOpCount > 0) {
                batches.push(batch.commit());
            }

            await Promise.all(batches);

            showAlert('🎉 標單已成功匯入！', 'success');
            setTimeout(() => {
                if (typeof window.navigateTo === 'function') {
                    window.navigateTo(`/program/tenders/detail?tenderId=${tenderId}&projectId=${projectId}`);
                } else {
                    window.location.href = `/program/tenders/detail?tenderId=${tenderId}&projectId=${projectId}`;
                }
            }, 1200);

        } catch (error) {
            console.error("❌ 匯入標單失敗:", error);
            showAlert('匯入失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // 輔助函式
    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            const p = loadingEl.querySelector('p');
            if (p) p.textContent = message;
        }
    }

    function formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return 'NT$ 0';
        return 'NT$ ' + parseInt(amount, 10).toLocaleString();
    }

    function showAlert(message, type = 'info') {
        if (typeof window.showAlert === 'function') {
            window.showAlert(message, type);
        } else {
            alert(`[${type.toUpperCase()}] ${message}`);
        }
    }
}
