/**
 * 標單採購管理 (tenders-procurement.js) - v17.0 (大項分組顯示版)
 * 修正重點：
 * 1. 【介面優化】表格改為「大項目分組」顯示，每個大項有獨立標題列 (參考 Detail 頁面)。
 * 2. 只有當大項底下有細項時，才會顯示該大項標題。
 * 3. 完整保留 v16 的數量修正、排序優化與狀態切換功能。
 */
function initProcurementPage() {
    console.log("🚀 初始化採購管理頁面 (v17.0 大項分組版)...");

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
                
                // 過濾掉追加減項目
                detailItems = detailDataRaw.filter(item => !item.isAddition);

                // 排序
                majorItems.sort(naturalSequenceSort);
                // 細項排序: 先依sequence排序，分組時會再對應到各大項
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
                
                // 🔥 渲染表格 (現在會自動分組)
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

        // --- (D) 渲染表格 (🔥 分組顯示邏輯) ---
        function renderTable() {
            const tbody = document.getElementById('procurementTableBody');
            const filterMajorId = document.getElementById('majorItemSelect').value;
            
            if (!tbody) return;
            tbody.innerHTML = '';

            // 1. 決定要顯示哪些大項
            let targetMajorItems = majorItems;
            if (filterMajorId) {
                targetMajorItems = majorItems.filter(m => m.id === filterMajorId);
            }

            let hasAnyData = false;

            // 2. 依序遍歷大項 (外層迴圈)
            targetMajorItems.forEach(major => {
                // 找出該大項底下的所有細項
                const myDetails = detailItems.filter(d => d.majorItemId === major.id);

                if (myDetails.length > 0) {
                    hasAnyData = true;

                    // (A) 插入大項標題列
                    // 使用 colspan="7" 跨越所有欄位，並加上背景色
                    const headerRow = document.createElement('tr');
                    headerRow.className = 'table-active'; // Bootstrap 灰色背景
                    headerRow.innerHTML = `
                        <td colspan="7" style="font-weight: bold; background-color: #f1f3f5; padding: 12px 15px;">
                            ${major.sequence || ''} ${major.name || '未命名大項'}
                        </td>
                    `;
                    tbody.appendChild(headerRow);

                    // (B) 插入細項列 (內層迴圈)
                    myDetails.forEach(item => {
                        const tr = createDetailRow(item);
                        tbody.appendChild(tr);
                    });
                }
            });

            // 處理沒有任何資料的情況
            if (!hasAnyData) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">沒有符合的項目資料</td></tr>';
            }
        }

        // 建立單一細項列的 HTML (抽離出來讓程式碼更整潔)
        function createDetailRow(item) {
            const tr = document.createElement('tr');
            
            const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
            const itemQuotes = quotations.filter(q => q.detailItemId === item.id);
            
            // 狀態顯示
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

            // 報價顯示
            let quotesHtml = '<span class="text-muted text-sm">-</span>';
            if (itemQuotes.length > 0) {
                quotesHtml = itemQuotes.map(q => 
                    `<span class="quote-chip" title="${q.supplier}">
                        ${(q.supplier||'').substring(0,4)}.. $${q.quotedUnitPrice || 0}
                     </span>`
                ).join('');
            }

            // 數量處理 (優先讀取 totalQuantity)
            let qty = 0;
            if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity);
            else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity);
            else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty);

            // 單價處理
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
            bind('manageQuotesBtn', 'click', () => document.getElementById('manageQuotesModal').style.display = 'flex');
            bind('deleteOrderBtn', 'click', handleDeleteOrder);
            
            document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modal = btn.closest('.modal-overlay');
                    if (modal) modal.style.display = 'none';
                });
            });

            window.toggleStatus = handleToggleStatus;
            window.selectQuote = handleSelectQuote;
        }

        // --- (F) 功能函數 ---

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

                const exportData = detailItems.map(item => {
                    let qty = 0;
                    if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity);
                    else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity);
                    else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty);

                    return {
                        '項次': item.sequence || '',
                        '項目名稱': item.name || '',
                        '說明(廠牌/型號)': `${item.brand || ''} ${item.model || ''}`.trim(),
                        '單位': item.unit || '',
                        '數量': qty, 
                        '供應商報價(單價)': '',
                        '小計(複價)': '', 
                        '備註': ''
                    };
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(exportData);

                ws['!cols'] = [
                    {wch: 8}, {wch: 30}, {wch: 25}, {wch: 8}, {wch: 10}, 
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

        async function handleImportQuotes(e) {
            const file = e.target.files[0];
            if (!file) return;
            try {
                if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件");
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                console.log("解析資料:", jsonData);
                showAlert(`成功解析 ${jsonData.length} 筆資料 (寫入邏輯建置中)`, 'success');
            } catch (error) {
                console.error("匯入失敗:", error);
                showAlert("匯入失敗: " + error.message, 'error');
            } finally {
                e.target.value = '';
            }
        }

        function handleDeleteOrder() {
            showAlert("請先選擇要刪除的項目 (功能建置中)", 'info');
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
