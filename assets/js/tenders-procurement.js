/**
 * 標單採購管理 (tenders-procurement.js) - v12.0 (匯出欄位補強版)
 * 修正：
 * 1. 匯出 Excel 時加入「小計(復價)」欄位。
 * 2. 調整 Excel 欄位寬度設定。
 */
function initProcurementPage() {
    console.log("🚀 初始化採購管理頁面 (v12.0 匯出補強版)...");

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
                let majorData, detailData;

                if (typeof safeFirestoreQuery === 'function') {
                    const [majorRes, detailRes] = await Promise.all([
                        safeFirestoreQuery('majorItems', queryConditions),
                        safeFirestoreQuery('detailItems', queryConditions)
                    ]);
                    majorData = majorRes.docs;
                    detailData = detailRes.docs;
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
                    detailData = detailSnap.docs.map(d => ({id: d.id, ...d.data()}));
                }

                majorItems = majorData;
                detailItems = detailData;

                majorItems.sort(naturalSequenceSort);
                detailItems.sort(naturalSequenceSort);

                populateSelect(majorItemSelect, majorItems, '所有大項目');

                // 2. 嘗試載入採購單 (容錯)
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

                // 3. 嘗試載入報價單 (容錯)
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

            const displayItems = filterMajorId 
                ? detailItems.filter(i => i.majorItemId === filterMajorId) 
                : detailItems;

            if (displayItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">沒有資料</td></tr>';
                return;
            }

            let html = '';
            displayItems.forEach(item => {
                const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
                const itemQuotes = quotations.filter(q => q.detailItemId === item.id);
                
                let statusText = '規劃中', statusClass = 'status-planning';
                if (itemPO) {
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
                        `<span class="quote-chip" title="${q.supplier}">
                            ${(q.supplier||'').substring(0,4)}.. $${q.quotedUnitPrice || 0}
                         </span>`
                    ).join('');
                }

                html += `
                    <tr>
                        <td>${item.sequence || '-'}</td>
                        <td>
                            <div style="font-weight:bold;">${item.name || '未命名'}</div>
                            <div class="text-muted text-sm">${item.brand || ''} ${item.model || ''}</div>
                        </td>
                        <td>${item.unit || '-'}</td>
                        <td class="text-right">${item.quantity || 0}</td>
                        <td><span class="order-chip ${statusClass}">${statusText}</span></td>
                        <td>${quotesHtml}</td>
                        <td class="text-right">${item.cost ? parseInt(item.cost).toLocaleString() : '-'}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
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
        }

        // --- (F) 功能函數 ---

        // 1. 匯出詢價單 (加入小計)
        function handleExportRFQ() {
            if (!selectedTender) return showAlert('請先選擇標單', 'warning');
            if (detailItems.length === 0) return showAlert('目前沒有項目可匯出', 'warning');

            try {
                if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件");

                const exportData = detailItems.map(item => ({
                    '項次': item.sequence || '',
                    '項目名稱': item.name || '',
                    '說明(廠牌/型號)': `${item.brand || ''} ${item.model || ''}`.trim(),
                    '單位': item.unit || '',
                    '數量': item.quantity || 0,
                    '供應商報價(單價)': '',
                    '小計(復價)': '', // ✅ 已加入
                    '備註': ''
                }));

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(exportData);

                // 設定欄寬
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

        // 2. 匯入報價單
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

        // 3. 刪除單據
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

        function naturalSequenceSort(a, b) {
            return (a.sequence || '').localeCompare((b.sequence || ''), undefined, {numeric: true, sensitivity: 'base'});
        }
        
        function showAlert(msg, type) {
            alert(msg);
        }
    });
}
