/**
 * 標單採購管理 (tenders-procurement.js) - v6.0 (標準化載入版)
 * 修正：改用全域 loadProjects() 確保與其他頁面資料一致
 */
function initProcurementPage() {
    console.log("🚀 初始化採購頁面 (v6.0 標準化載入)...");

    // 1. 等待 HTML 元素載入
    const checkTimer = setInterval(() => {
        const targetElement = document.getElementById('projectSelect');
        if (targetElement) {
            clearInterval(checkTimer);
            runPageLogic();
        }
    }, 100);

    // 2. 主程式邏輯
    function runPageLogic() {
        // --- 確保變數與連線 ---
        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let selectedProject = null, selectedTender = null;
        
        // 明確宣告 db 與 auth，避免依賴不穩定的全域變數
        const db = firebase.firestore();
        const currentUser = firebase.auth().currentUser;

        if (!currentUser) return console.error("❌ 用戶未登入");

        // --- 啟動初始化 ---
        setupEventListeners();
        loadProjectsStandard(); // <--- 改用這個標準函數

        // --- 函數定義 ---

        // (A) 綁定事件
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

            if(ui.projectSelect) ui.projectSelect.addEventListener('change', handleProjectChange);
            if(ui.tenderSelect) ui.tenderSelect.addEventListener('change', handleTenderChange);
            if(ui.majorItemSelect) ui.majorItemSelect.addEventListener('change', renderTable);
            
            // 按鈕功能
            if(ui.exportBtn) ui.exportBtn.addEventListener('click', () => alert('匯出功能開發中...'));
            if(ui.importBtn) ui.importBtn.addEventListener('click', () => ui.importInput && ui.importInput.click());
            if(ui.manageQuotesBtn) ui.manageQuotesBtn.addEventListener('click', () => document.getElementById('manageQuotesModal').style.display = 'flex');
            
            document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.addEventListener('click', () => document.getElementById('manageQuotesModal').style.display = 'none');
            });
        }

        // (B) 標準化載入專案 (跟 Distribution 頁面邏輯一致)
        async function loadProjectsStandard() {
            try {
                showLoading(true, '載入專案中...');
                
                // 1. 嘗試呼叫全域 loadProjects (如果有的話)
                let allProjects = [];
                if (typeof loadProjects === 'function') {
                    console.log("✅ 使用全域 loadProjects() 載入...");
                    allProjects = await loadProjects();
                } else {
                    // 2. 備用方案：如果全域函數不存在，直接抓取
                    console.warn("⚠️ 找不到 loadProjects()，改為直接查詢...");
                    const snapshot = await db.collection('projects').get();
                    allProjects = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                }

                // 3. 前端權限篩選 (確保只顯示我有權限的)
                projects = allProjects.filter(p => {
                    // 如果我是建立者，或在成員名單中
                    if (p.createdBy === currentUser.email) return true;
                    if (p.members && p.members[currentUser.email]) return true;
                    return false;
                });

                console.log(`📊 載入完成，共 ${projects.length} 個專案`);
                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            
            } catch (error) {
                console.error("載入專案失敗:", error);
                alert("載入專案失敗：" + error.message);
            } finally {
                showLoading(false);
            }
        }

        // (C) 處理專案變更 -> 載入標單
        async function handleProjectChange(e) {
            const projectId = e.target.value;
            selectedProject = projects.find(p => p.id === projectId);
            resetSelects('project');
            
            if (!projectId) return;

            showLoading(true, '載入標單中...');
            try {
                // 這裡拿掉 orderBy，避免索引報錯
                const snapshot = await db.collection('tenders')
                    .where('projectId', '==', projectId)
                    .get();
                
                tenders = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                
                // 在前端做排序
                tenders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

                populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
                document.getElementById('tenderSelect').disabled = false;
            } catch (error) {
                console.error("載入標單失敗:", error);
                alert("載入標單失敗：" + error.message);
            } finally {
                showLoading(false);
            }
        }

        // (D) 處理標單變更 -> 載入細項
        async function handleTenderChange(e) {
            const tenderId = e.target.value;
            selectedTender = tenders.find(t => t.id === tenderId);
            resetSelects('tender');
            if (!tenderId) return;

            showLoading(true, '載入明細中...');
            try {
                // 1. 載入大項
                const majorSnap = await db.collection('majorItems')
                    .where('tenderId', '==', tenderId)
                    .orderBy('sequence')
                    .get();
                majorItems = majorSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                populateSelect(document.getElementById('majorItemSelect'), majorItems, '所有大項目');
                document.getElementById('majorItemSelect').disabled = false;

                // 2. 載入細項
                const detailSnap = await db.collection('detailItems')
                    .where('tenderId', '==', tenderId)
                    .get();
                detailItems = detailSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                detailItems.sort(naturalSequenceSort);

                // 3. 顯示內容
                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('emptyState').style.display = 'none';
                renderTable();

            } catch (error) {
                console.error("載入明細失敗:", error);
            } finally {
                showLoading(false);
            }
        }

        // (E) 渲染表格
        function renderTable() {
            const tbody = document.getElementById('procurementTableBody');
            const filterMajorId = document.getElementById('majorItemSelect').value;
            if (!tbody) return;

            tbody.innerHTML = '';
            let displayItems = detailItems;
            if (filterMajorId) {
                displayItems = detailItems.filter(item => item.majorItemId === filterMajorId);
            }

            document.getElementById('totalItemsCount').textContent = displayItems.length;

            if (displayItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">沒有資料</td></tr>';
                return;
            }

            displayItems.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.sequence || '-'}</td>
                    <td>${item.name || '未命名'}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="text-right">${item.quantity || 0}</td>
                    <td><span class="order-chip status-planning">規劃中</span></td>
                    <td><span class="text-muted text-sm">-</span></td>
                    <td class="text-right">${item.cost ? parseInt(item.cost).toLocaleString() : '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // --- 工具函數 ---
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
                document.getElementById('mainContent').style.display = 'none';
                document.getElementById('emptyState').style.display = 'flex';
            }
        }

        function naturalSequenceSort(a, b) {
            return (a.sequence || '').localeCompare((b.sequence || ''), undefined, {numeric: true, sensitivity: 'base'});
        }
    }
}
