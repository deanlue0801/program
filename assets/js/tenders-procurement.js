/**
 * 標單採購管理 (tenders-procurement.js) - v23.0 (強制渲染版)
 * 修正重點：
 * 1. 【管理報價】修正 Modal 空白問題。改為直接鎖定 .modal-body 強制覆蓋內容。
 * 2. 移除「無資料時阻擋開啟」的邏輯，改為在 Modal 內顯示「尚無資料」提示，避免與 HTML 原生開啟行為衝突。
 * 3. 包含 v22 之前的所有功能 (匯入、分組、數量修正)。
 */
function initProcurementPage() {
    console.log("🚀 初始化採購管理頁面 (v23.0 強制渲染版)...");

    // 1. 等待 HTML 元素
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
            return;
        }
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback();
            }
        }, 100);
    }

    waitForElement('#projectSelect', () => {
        console.log("✅ HTML 元素已就緒，開始執行...");

        // --- 變數宣告 ---
        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let purchaseOrders = [], quotations = [];
        let selectedProject = null, selectedTender = null;
        
        const currentUser = firebase.auth().currentUser;
        const db = firebase.firestore();

        // --- 啟動初始化 ---
        initializePage();

        async function initializePage() {
            if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
            setupEventListeners();
            await loadProjectsWithPermission();
        }

        // --- (A) 載入專案 ---
        async function loadProjectsWithPermission() {
            showLoading(true, '載入專案中...');
            try {
                let allMyProjects = [];
                if (typeof loadProjects === 'function') {
                    allMyProjects = await loadProjects();
                } else {
                    const snapshot = await db.collection('projects').get();
                    allMyProjects = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                }
                
                projects = allMyProjects.filter(project => {
                    if (project.members && project.members[currentUser.email]) return true;
                    if (project.createdBy === currentUser.email) return true;
                    return false;
                });

                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) {
                console.error("載入專案失敗:", error);
                showAlert('載入專案失敗', 'error');
            } finally {
                showLoading(false);
            }
        }

        // --- (B) 專案變更 -> 載入標單 ---
        async function onProjectChange(projectId) {
            resetSelects('tender');
            if (!projectId) return;
            
            selectedProject = projects.find(p => p.id === projectId);
            const tenderSelect = document.getElementById('tenderSelect');
            tenderSelect.innerHTML = '<option value="">載入中...</option>';
            tenderSelect.disabled = true;

            try {
                let tenderDocs = [];
                if (typeof safeFirestoreQuery === 'function') {
                    const result = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
                    tenderDocs = result.docs;
                } else {
                    const snapshot = await db.collection('tenders')
                        .where('projectId', '==', projectId)
                        .get();
                    tenderDocs = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                }

                tenders = tenderDocs;
                tenders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (error) {
                console.error("載入標單失敗:", error);
                tenderSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        // --- (C) 標單變更 -> 載入資料 ---
        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            if (!tenderId) return;

            selectedTender = tenders.find(t => t.id === tenderId);
            const majorItemSelect = document.getElementById('majorItemSelect');
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            showLoading(true, '載入資料中...');

            try {
                const queryConditions = [
                    { field: 'tenderId', operator: '==', value: tenderId },
                    { field: 'projectId', operator: '==', value: selectedProject.id }
                ];

                // 1. 載入大項與細項
                let majorData, detailDataRaw;

                if (typeof safeFirestoreQuery === 'function') {
                    const [majorRes, detailRes] = await Promise.all([
                        safeFirestoreQuery('majorItems', queryConditions),
                        safeFirestoreQuery('detailItems', queryConditions)
                    ]);
                    majorData = majorRes.docs;
                    detailDataRaw = detailRes.docs;
                } else {
                    const majorSnap = await db.collection('majorItems')
                        .where('tenderId', '==', tenderId)
                        .where('projectId', '==', selectedProject.id)
                        .get();
                    
                    const detailSnap = await db.collection('detailItems')
                        .where('tenderId', '==', tenderId)
                        .where('projectId', '==', selectedProject.id)
                        .get();

                    majorData = majorSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    detailDataRaw = detailSnap.docs.map(d => ({id: d.id, ...d.data()}));
                }

                majorItems = majorData;
                detailItems = detailDataRaw.filter(item => !item.isAddition);

                majorItems.sort(naturalSequenceSort);
                detailItems.sort(naturalSequenceSort);

                populateSelect(majorItemSelect, majorItems, '所有大項目');

                // 2. 嘗試載入採購單
                try {
                    let poData = [];
                    if (typeof safeFirestoreQuery === 'function') {
                         const poRes = await safeFirestoreQuery('purchaseOrders', queryConditions);
                         poData = poRes.docs;
                    } else {
                        const poSnap = await db.collection('purchaseOrders')
                            .where('tenderId', '==', tenderId)
                            .where('projectId', '==', selectedProject.id)
                            .get();
                        poData = poSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    }
                    purchaseOrders = poData;
                } catch (poError) {
                    console.warn("⚠️ 採購單讀取失敗:", poError.message);
                    purchaseOrders = [];
                }

                // 3. 嘗試載入報價單
                try {
                    let quoteData = [];
                    if (typeof safeFirestoreQuery === 'function') {
                        const quoteRes = await safeFirestoreQuery('quotations', queryConditions);
                        quoteData = quoteRes.docs;
                    } else {
                        const quoteSnap = await db.collection('quotations')
                            .where('tenderId', '==', tenderId)
                            .where('projectId', '==', selectedProject.id)
                            .get();
                        quoteData = quoteSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    }
                    quotations = quoteData;
                } catch (quoteError) {
                    console.warn("⚠️ 報價單讀取失敗:", quoteError.message);
                    quotations = [];
                }

                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('emptyState').style.display = 'none';
                
                renderTable();
                updateStats();

            } catch (error) {
                console.error("❌ 資料載入失敗:", error);
                showAlert('載入失敗: ' + error.message, 'error');
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            } finally {
                showLoading(false);
            }
        }

        // --- (D) 渲染表格 ---
        function renderTable() {
            const tbody = document.getElementById('procurementTableBody');
            const filterMajorId = document.getElementById('majorItemSelect').value;
            
            if (!tbody) return;
            tbody.innerHTML = '';

            let targetMajorItems = majorItems;
            if (filterMajorId) {
                targetMajorItems = majorItems.filter(m => m.id === filterMajorId);
            }

            let hasAnyData = false;

            // 第一階段：原始項目
            targetMajorItems.forEach(major => {
                const myDetails = detailItems.filter(d => d.majorItemId === major.id);

                if (myDetails.length > 0) {
                    hasAnyData = true;
                    const headerRow = document.createElement('tr');
                    headerRow.className = 'table-active';
                    headerRow.innerHTML = `
                        <td colspan="7" style="font-weight: bold; background-color: #f1f3f5; padding: 12px 15px;">
                            ${major.sequence || ''} ${major.name || '未命名大項'}
                        </td>
                    `;
                    tbody.appendChild(headerRow);

                    myDetails.forEach(item => {
                        const tr = createDetailRow(item);
                        tbody.appendChild(tr);
                    });
                }
            });

            // 第二階段：額外項目
            const allExtraQuotes = quotations.filter(q => q.isExtra);
            if (allExtraQuotes.length > 0) {
                targetMajorItems.forEach((major) => {
                    const myExtraQuotes = allExtraQuotes.filter(q => q.majorItemId === major.id);
                    if (myExtraQuotes.length > 0) {
                        hasAnyData = true;
                        const headerRow = document.createElement('tr');
                        headerRow.style.borderTop = "3px double #dee2e6";
                        headerRow.innerHTML = `
                            <td colspan="7" style="font-weight: bold; background-color: #fff3cd; color: #856404; padding: 12px 15px;">
                                ⚠️ ${major.sequence || ''} ${major.name || ''} (廠商額外新增)
                            </td>
                        `;
                        tbody.appendChild(headerRow);
                        myExtraQuotes.forEach(quote => {
                            const tr = createExtraQuoteRow(quote);
                            tbody.appendChild(tr);
                        });
                    }
                });
            }

            if (!hasAnyData) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">沒有符合的項目資料</td></tr>';
            }
        }

        function createDetailRow(item) {
            const tr = document.createElement('tr');
            
            const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
            const itemQuotes = quotations.filter(q => q.detailItemId === item.id && !q.isExtra);
            
            let statusText = '規劃中', statusClass = 'status-planning';
            let currentStatusCode = 'planning';

            if (itemPO) {
                currentStatusCode = itemPO.status;
                const statusMap = {
                    'ordered': {t: '已下單', c: 'status-ordered'},
                    'arrived': {t: '已到貨', c: 'status-arrived'},
                    'installed': {t: '已安裝', c: 'status-installed'}
                };
                const s = statusMap[itemPO.status] || {t: itemPO.status, c: 'status-planning'};
                statusText = s.t; statusClass = s.c;
            }

            let quotesHtml = '<span class="text-muted text-sm">-</span>';
            if (itemQuotes.length > 0) {
                quotesHtml = itemQuotes.map(q => 
                    `<span class="quote-chip" title="${q.supplierName || q.supplier}">
                        ${(q.supplierName || q.supplier || '').substring(0,4)}.. $${q.quotedUnitPrice || 0}
                     </span>`
                ).join('');
            }

            let qty = 0;
            if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity);
            else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity);
            else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty);

            let unitPrice = 0;
            if (item.unitPrice !== undefined) unitPrice = item.unitPrice;
            else if (item.cost !== undefined) unitPrice = item.cost;

            tr.innerHTML = `
                <td>${item.sequence || '-'}</td>
                <td>
                    <div style="font-weight:bold;">${item.name || '未命名'}</div>
                    <div class="text-muted text-sm">${item.brand || ''} ${item.model || ''}</div>
                </td>
                <td>${item.unit || '-'}</td>
                <td class="text-right">${qty}</td>
                <td>
                    <span class="order-chip ${statusClass}" 
                          onclick="window.toggleStatus('${item.id}', '${currentStatusCode}')"
                          title="點擊切換狀態">
                        ${statusText}
                    </span>
                </td>
                <td>${quotesHtml}</td>
                <td class="text-right">${unitPrice ? parseInt(unitPrice).toLocaleString() : '-'}</td>
            `;
            return tr;
        }

        function createExtraQuoteRow(quote) {
            const tr = document.createElement('tr');
            tr.style.backgroundColor = '#fff9db';

            const quotesHtml = `
                <span class="quote-chip" style="border: 1px solid #f59f00; color: #f59f00;" title="${quote.supplierName}">
                    ${(quote.supplierName || '').substring(0,4)}.. $${quote.quotedUnitPrice || 0}
                </span>`;

            tr.innerHTML = `
                <td class="text-muted"><small>(額外)</small></td>
                <td>
                    <div style="font-weight:bold; color: #d63384;">${quote.itemName || '額外項目'}</div>
                    <div class="text-muted text-sm">${quote.remark || '(廠商新增項目)'}</div>
                </td>
                <td>${quote.itemUnit || '-'}</td>
                <td class="text-right">${quote.itemQty || 1}</td>
                <td><span class="text-muted text-sm">-</span></td>
                <td>${quotesHtml}</td>
                <td class="text-right">-</td>
            `;
            return tr;
        }

        // --- (E) 事件綁定 ---
        function setupEventListeners() {
            const bind = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(event, handler);
            };

            bind('projectSelect', 'change', (e) => onProjectChange(e.target.value));
            bind('tenderSelect', 'change', (e) => onTenderChange(e.target.value));
            bind('majorItemSelect', 'change', () => renderTable());
            bind('exportRfqBtn', 'click', handleExportRFQ);
            bind('importQuotesBtn', 'click', () => document.getElementById('importQuotesInput')?.click());
            bind('importQuotesInput', 'change', handleImportQuotes);
            
            // ✅ 管理報價按鈕
            bind('manageQuotesBtn', 'click', openQuoteManager);

            // Modal 關閉
            document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modal = btn.closest('.modal-overlay');
                    if (modal) modal.style.display = 'none';
                });
            });

            window.toggleStatus = handleToggleStatus;
            window.selectQuote = handleSelectQuote;
            window.deleteSupplierQuotes = deleteSupplierQuotes;
        }

        // --- (F) 功能函數 ---

        // 🔥 管理供應商報價 (Modal 邏輯 - 強制渲染)
        function openQuoteManager() {
            // 尋找 Modal Body，這是我們唯一確定存在的元素
            const modalBody = document.querySelector('#manageQuotesModal .modal-body');
            
            if (!modalBody) {
                return showAlert('無法開啟管理視窗 (找不到 .modal-body)', 'error');
            }

            // 1. 如果沒有資料，顯示空狀態
            if (!quotations || quotations.length === 0) {
                modalBody.innerHTML = `
                    <div class="text-center p-4">
                        <h5 class="text-muted">目前尚無任何報價紀錄</h5>
                        <p class="text-muted text-sm">請使用「匯入報價單」功能匯入資料。</p>
                    </div>
                `;
            } else {
                // 2. 有資料，開始統計
                const stats = {};
                quotations.forEach(q => {
                    const supplier = q.supplierName || '未知供應商';
                    if (!stats[supplier]) {
                        stats[supplier] = { count: 0, totalAmount: 0 };
                    }
                    stats[supplier].count++;
                    
                    let qty = 1;
                    if (q.isExtra) {
                        qty = Number(q.itemQty) || 1;
                    } else {
                        const detail = detailItems.find(d => d.id === q.detailItemId);
                        if (detail) {
                            if (detail.totalQuantity !== undefined && detail.totalQuantity !== null) qty = Number(detail.totalQuantity);
                            else if (detail.quantity !== undefined && detail.quantity !== null) qty = Number(detail.quantity);
                        }
                    }
                    stats[supplier].totalAmount += (q.quotedUnitPrice || 0) * qty;
                });

                // 3. 渲染列表 HTML
                let html = `
                    <h5 class="mb-3">已匯入的供應商</h5>
                    <div class="table-responsive">
                    <table class="table table-bordered table-hover">
                        <thead class="thead-light">
                            <tr>
                                <th>供應商名稱</th>
                                <th class="text-right">項目數</th>
                                <th class="text-right">總金額(預估)</th>
                                <th class="text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                Object.keys(stats).forEach(supplier => {
                    html += `
                        <tr>
                            <td style="vertical-align: middle;"><strong>${supplier}</strong></td>
                            <td class="text-right" style="vertical-align: middle;">${stats[supplier].count}</td>
                            <td class="text-right" style="vertical-align: middle;">$${parseInt(stats[supplier].totalAmount).toLocaleString()}</td>
                            <td class="text-center">
                                <button class="btn btn-outline-danger btn-sm" onclick="deleteSupplierQuotes('${supplier}')">
                                    🗑️ 刪除
                                </button>
                            </td>
                        </tr>
                    `;
                });

                html += `</tbody></table></div>`;
                
                // 4. 強制寫入 DOM
                modalBody.innerHTML = html;
            }

            // 5. 顯示 Modal
            document.getElementById('manageQuotesModal').style.display = 'flex';
        }

        async function deleteSupplierQuotes(supplierName) {
            if (!confirm(`確定要刪除「${supplierName}」的所有報價嗎？\n此動作無法復原。`)) return;

            showLoading(true, `正在刪除 ${supplierName} 的報價...`);

            try {
                const targetQuotes = quotations.filter(q => q.supplierName === supplierName);
                
                const batch = db.batch();
                targetQuotes.forEach(q => {
                    const ref = db.collection('quotations').doc(q.id);
                    batch.delete(ref);
                });

                await batch.commit();
                
                // 重新載入資料
                await onTenderChange(selectedTender.id);
                
                // 重新渲染 Modal (因為資料變了)
                openQuoteManager();
                
                showAlert(`已刪除 ${supplierName} 的所有報價`, 'success');

            } catch (error) {
                console.error("刪除失敗:", error);
                showAlert("刪除失敗: " + error.message, 'error');
                showLoading(false);
            } finally {
                // 如果是透過 reload 觸發的 finally，這裡其實不會執行到，因為 onTenderChange 裡面有 showLoading(false)
            }
        }

        async function handleImportQuotes(e) {
            const file = e.target.files[0];
            if (!file) return;

            try {
                if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件");

                const supplierName = prompt("請輸入此報價單的供應商名稱：");
                if (!supplierName || supplierName.trim() === "") {
                    showAlert("已取消匯入 (未輸入供應商)", "info");
                    e.target.value = '';
                    return;
                }

                showLoading(true, `正在解析 ${file.name}...`);

                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                const batch = db.batch();
                let matchCount = 0;
                let extraCount = 0;
                let operationCounter = 0;
                let batches = []; 
                let currentBatch = db.batch();
                let currentMajorItem = null;

                jsonData.forEach(row => {
                    const seqCol = row['項次'] ? String(row['項次']).trim() : '';
                    const nameCol = row['項目名稱'] ? String(row['項目名稱']).trim() : '';
                    const priceRaw = row['供應商報價(單價)'] || row['單價'] || 0;
                    
                    const foundMajor = majorItems.find(m => {
                        const majorKey = `${m.sequence || ''} ${m.name || ''}`.trim();
                        return seqCol.includes(majorKey) || seqCol.replace('.','').includes(majorKey.replace('.',''));
                    });

                    if (foundMajor) {
                        currentMajorItem = foundMajor;
                        return;
                    }

                    if (!currentMajorItem || (!seqCol && !nameCol)) return;

                    const targetItem = detailItems.find(item => 
                        item.majorItemId === currentMajorItem.id && 
                        String(item.sequence).trim() === seqCol && 
                        String(item.name).trim() === nameCol
                    );

                    if (priceRaw > 0) {
                        const price = Number(priceRaw);
                        const newQuoteRef = db.collection('quotations').doc();
                        let quoteData = {};

                        if (targetItem) {
                            quoteData = {
                                projectId: selectedProject.id,
                                tenderId: selectedTender.id,
                                detailItemId: targetItem.id,
                                majorItemId: currentMajorItem.id,
                                supplierName: supplierName.trim(),
                                quotedUnitPrice: price,
                                isExtra: false,
                                remark: row['備註'] || '',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            matchCount++;
                        } else {
                            quoteData = {
                                projectId: selectedProject.id,
                                tenderId: selectedTender.id,
                                detailItemId: null,
                                majorItemId: currentMajorItem.id,
                                supplierName: supplierName.trim(),
                                quotedUnitPrice: price,
                                isExtra: true,
                                itemName: nameCol || '未命名額外項',
                                itemUnit: row['單位'] || '',
                                itemQty: row['數量'] || 1,
                                remark: row['備註'] || '',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            extraCount++;
                        }

                        currentBatch.set(newQuoteRef, quoteData);
                        operationCounter++;

                        if (operationCounter >= 450) {
                            batches.push(currentBatch.commit());
                            currentBatch = db.batch();
                            operationCounter = 0;
                        }
                    }
                });

                if (operationCounter > 0) batches.push(currentBatch.commit());
                await Promise.all(batches);

                showAlert(`匯入完成！匹配 ${matchCount} 筆，額外新增 ${extraCount} 筆`, 'success');
                await onTenderChange(selectedTender.id);

            } catch (error) {
                console.error("匯入失敗:", error);
                showAlert("匯入失敗: " + error.message, 'error');
            } finally {
                e.target.value = '';
                showLoading(false);
            }
        }

        async function handleToggleStatus(itemId, currentStatus) {
            const statusCycle = {
                'planning': 'ordered',
                'ordered': 'arrived',
                'arrived': 'installed',
                'installed': 'planning'
            };

            const nextStatus = statusCycle[currentStatus] || 'ordered';
            const itemPO = purchaseOrders.find(po => po.detailItemId === itemId);

            showLoading(true, '更新狀態中...');

            try {
                if (nextStatus === 'planning') {
                    if (itemPO) {
                        await db.collection('purchaseOrders').doc(itemPO.id).delete();
                    }
                } else {
                    const poData = {
                        status: nextStatus,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    if (itemPO) {
                        await db.collection('purchaseOrders').doc(itemPO.id).update(poData);
                    } else {
                        const newItem = detailItems.find(i => i.id === itemId);
                        await db.collection('purchaseOrders').add({
                            projectId: selectedProject.id,
                            tenderId: selectedTender.id,
                            detailItemId: itemId,
                            majorItemId: newItem ? newItem.majorItemId : null,
                            status: nextStatus,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            ...poData
                        });
                    }
                }
                await onTenderChange(selectedTender.id);
            } catch (error) {
                console.error("狀態更新失敗:", error);
                showAlert("狀態更新失敗: " + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }

        function handleSelectQuote(quoteId) {
            console.log("選擇報價:", quoteId);
        }

        function handleExportRFQ() {
            if (!selectedTender) return showAlert('請先選擇標單', 'warning');
            if (detailItems.length === 0) return showAlert('目前沒有項目可匯出', 'warning');

            try {
                if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件");

                const exportData = [];

                majorItems.forEach(major => {
                    const myDetails = detailItems.filter(d => d.majorItemId === major.id);

                    if (myDetails.length > 0) {
                        exportData.push({
                            '項次': `${major.sequence || ''} ${major.name || ''}`,
                            '項目名稱': '',
                            '說明(廠牌/型號)': '',
                            '單位': '',
                            '數量': '',
                            '供應商報價(單價)': '',
                            '小計(複價)': '',
                            '備註': ''
                        });

                        myDetails.forEach(item => {
                            let qty = 0;
                            if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity);
                            else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity);
                            else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty);

                            exportData.push({
                                '項次': item.sequence || '',
                                '項目名稱': item.name || '',
                                '說明(廠牌/型號)': `${item.brand || ''} ${item.model || ''}`.trim(),
                                '單位': item.unit || '',
                                '數量': qty, 
                                '供應商報價(單價)': '',
                                '小計(複價)': '', 
                                '備註': ''
                            });
                        });
                    }
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(exportData);

                ws['!cols'] = [
                    {wch: 15}, {wch: 30}, {wch: 25}, {wch: 8}, {wch: 10}, 
                    {wch: 15}, {wch: 15}, {wch: 20}
                ];

                XLSX.utils.book_append_sheet(wb, ws, "詢價單");
                const filename = `${selectedProject.name}_${selectedTender.name}_詢價單.xlsx`;
                XLSX.writeFile(wb, filename);

            } catch (error) {
                console.error("匯出失敗:", error);
                showAlert("匯出失敗: " + error.message, 'error');
            }
        }

        function handleDeleteOrder() {
            openQuoteManager();
        }

        // --- 輔助函式 ---
        function showLoading(show, msg) {
            const el = document.getElementById('loading');
            if(el) {
                el.style.display = show ? 'flex' : 'none';
                if(msg) el.querySelector('p').textContent = msg;
            }
        }

        function populateSelect(select, items, defaultText) {
            if(!select) return;
            select.innerHTML = `<option value="">${defaultText}</option>` + 
                items.map(i => `<option value="${i.id}">${i.sequence ? i.sequence + '.' : ''} ${i.name || i.code}</option>`).join('');
            select.disabled = items.length === 0;
        }

        function resetSelects(level) {
            if (level === 'project') {
                document.getElementById('tenderSelect').innerHTML = '<option value="">請先選擇專案</option>';
                document.getElementById('tenderSelect').disabled = true;
                document.getElementById('majorItemSelect').innerHTML = '<option value="">所有大項目</option>';
                document.getElementById('majorItemSelect').disabled = true;
                document.getElementById('mainContent').style.display = 'none';
                document.getElementById('emptyState').style.display = 'flex';
            } else if (level === 'tender') {
                document.getElementById('majorItemSelect').innerHTML = '<option value="">所有大項目</option>';
            }
        }
        
        function updateStats() {
            const totalEl = document.getElementById('totalItemsCount');
            if(totalEl) totalEl.textContent = detailItems.length;
        }
        
        function showAlert(msg, type) {
            alert(msg);
        }

        function naturalSequenceSort(a, b) {
            const CHINESE_NUM_MAP = {
                '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
                '壹': 1, '貳': 2, '參': 3, '肆': 4, '伍': 5, '陸': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
                '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10
            };
            const seqA = String(a.sequence || '');
            const seqB = String(b.sequence || '');
            const valA = CHINESE_NUM_MAP[seqA] || seqA;
            const valB = CHINESE_NUM_MAP[seqB] || seqB;
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return seqA.localeCompare(seqB, undefined, {numeric: true, sensitivity: 'base'});
        }
    });
}
