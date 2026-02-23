/**
 * 標單採購管理 (tenders-procurement.js) - v5.0 (完整修復版)
 * 配合 2026/02/23 最新 HTML 結構
 */
function initProcurementPage() {
    console.log("🚀 初始化採購頁面 (v5.0 完整版)...");

    // 1. 等待 HTML 元素載入的機制
    const checkTimer = setInterval(() => {
        const targetElement = document.getElementById('projectSelect');
        if (targetElement) {
            clearInterval(checkTimer);
            console.log("✅ 抓到 HTML 元素，開始執行主程式...");
            runPageLogic();
        }
    }, 100);

    // 2. 主程式邏輯
    function runPageLogic() {
        // --- 變數宣告 ---
        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let purchaseOrders = [], quotations = []; // 採購單與報價單
        let selectedProject = null, selectedTender = null;
        
        // 取得全域變數 (由 firebase-config.js 提供)
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return console.error("❌ 用戶未登入");

        // --- 啟動初始化 ---
        setupEventListeners();
        loadProjectsWithPermission();

        // --- 函數定義 ---

        // (A) 綁定下拉選單與按鈕事件
        function setupEventListeners() {
            const ui = {
                projectSelect: document.getElementById('projectSelect'),
                tenderSelect: document.getElementById('tenderSelect'),
                majorItemSelect: document.getElementById('majorItemSelect'),
                exportBtn: document.getElementById('exportRfqBtn'),
                importBtn: document.getElementById('importQuotesBtn'),
                importInput: document.getElementById('importQuotesInput'),
                manageQuotesBtn: document.getElementById('manageQuotesBtn')
            };

            // 下拉選單變更事件
            if(ui.projectSelect) ui.projectSelect.addEventListener('change', handleProjectChange);
            if(ui.tenderSelect) ui.tenderSelect.addEventListener('change', handleTenderChange);
            if(ui.majorItemSelect) ui.majorItemSelect.addEventListener('change', renderTable); // 篩選大項只重繪表格

            // 按鈕功能 (防止報錯，先檢查存在性)
            if(ui.exportBtn) ui.exportBtn.addEventListener('click', () => alert('匯出功能開發中...'));
            if(ui.importBtn) ui.importBtn.addEventListener('click', () => ui.importInput && ui.importInput.click());
            if(ui.manageQuotesBtn) ui.manageQuotesBtn.addEventListener('click', () => document.getElementById('manageQuotesModal').style.display = 'flex');
            
            // Modal 關閉按鈕
            document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('manageQuotesModal').style.display = 'none';
                });
            });

            console.log("✅ 事件監聽器綁定完成");
        }

        // (B) 載入專案列表
        async function loadProjectsWithPermission() {
            try {
                // 這裡假設 loadProjects() 是全域函數，如果不是，需自行實作 fetch
                // 為了保險，這裡直接呼叫 Firestore
                const snapshot = await db.collection('projects')
                    .where(`members.${currentUser.email}.role`, 'in', ['owner', 'editor', 'viewer'])
                    .get();
                
                projects = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) {
                console.error("載入專案失敗:", error);
            }
        }

        // (C) 處理專案變更 -> 載入標單
        async function handleProjectChange(e) {
            const projectId = e.target.value;
            selectedProject = projects.find(p => p.id === projectId);
            
            // 重置後續選單
            resetSelects('project');
            
            if (!projectId) return;

            showLoading(true, '載入標單中...');
            try {
                const snapshot = await db.collection('tenders')
                    .where('projectId', '==', projectId)
                    .orderBy('createdAt', 'desc') // 如果沒索引可能會報錯，可先拿掉 orderBy
                    .get();
                
                tenders = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
                
                // 開啟標單選單
                document.getElementById('tenderSelect').disabled = false;
            } catch (error) {
                console.error("載入標單失敗:", error);
                // 如果是索引錯誤，改用客戶端排序
                if(error.code === 'failed-precondition') {
                    const snapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
                    tenders = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                    populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
                    document.getElementById('tenderSelect').disabled = false;
                }
            } finally {
                showLoading(false);
            }
        }

        // (D) 處理標單變更 -> 載入細項與採購資料 (關鍵!)
        async function handleTenderChange(e) {
            const tenderId = e.target.value;
            selectedTender = tenders.find(t => t.id === tenderId);
            
            resetSelects('tender');
            if (!tenderId) return;

            showLoading(true, '載入採購明細中...');
            try {
                // 1. 載入大項
                const majorSnap = await db.collection('majorItems')
                    .where('tenderId', '==', tenderId)
                    .orderBy('sequence')
                    .get();
                majorItems = majorSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                populateSelect(document.getElementById('majorItemSelect'), majorItems, '所有大項目');
                document.getElementById('majorItemSelect').disabled = false;

                // 2. 載入細項 (Table 資料來源)
                const detailSnap = await db.collection('detailItems')
                    .where('tenderId', '==', tenderId)
                    .get(); // 細項通常很多，先不 sort
                detailItems = detailSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                
                // 簡易排序 (依 sequence)
                detailItems.sort(naturalSequenceSort);

                console.log(`📊 載入完成: ${detailItems.length} 筆細項`);

                // 3. 顯示主內容區塊
                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('emptyState').style.display = 'none';

                // 4. 渲染表格
                renderTable();

            } catch (error) {
                console.error("載入明細失敗:", error);
                alert("載入資料失敗：" + error.message);
            } finally {
                showLoading(false);
            }
        }

        // (E) 渲染表格核心邏輯
        function renderTable() {
            const tbody = document.getElementById('procurementTableBody');
            const filterMajorId = document.getElementById('majorItemSelect').value;

            if (!tbody) return console.error("❌ 找不到表格主體 #procurementTableBody");

            tbody.innerHTML = ''; // 清空

            // 篩選資料
            let displayItems = detailItems;
            if (filterMajorId) {
                displayItems = detailItems.filter(item => item.majorItemId === filterMajorId);
            }

            // 更新統計數字
            document.getElementById('totalItemsCount').textContent = displayItems.length;

            if (displayItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">沒有資料</td></tr>';
                return;
            }

            // 產生 HTML
            displayItems.forEach(item => {
                const tr = document.createElement('tr');
                
                // 假裝的採購狀態 (因為還沒載入 purchaseOrders)
                // 實際專案需比對 purchaseOrders 來決定狀態
                const status = 'planning'; 
                const statusText = '規劃中';
                const statusClass = 'status-planning';

                tr.innerHTML = `
                    <td>${item.sequence || '-'}</td>
                    <td>${item.name || '未命名項目'}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="text-right">${item.quantity || 0}</td>
                    <td>
                        <span class="order-chip ${statusClass}">${statusText}</span>
                    </td>
                    <td>
                        <span class="text-muted text-sm">尚未詢價</span>
                    </td>
                    <td class="text-right">
                        ${item.cost ? 'NT$ ' + item.cost.toLocaleString() : '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // --- 輔助工具 ---
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

        // 自然排序法 (處理 1-1, 1-2, 1-10)
        function naturalSequenceSort(a, b) {
            return (a.sequence || '').localeCompare((b.sequence || ''), undefined, {numeric: true, sensitivity: 'base'});
        }
    }
}
