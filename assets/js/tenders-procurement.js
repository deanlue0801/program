/**
 * 標單採購管理 (tenders-procurement.js) - v9.0 (去除排序限制版)
 * 修正核心：移除 Firestore 查詢時的 .orderBy()，改由前端排序，解決 "Missing or insufficient permissions" 問題。
 */
function initProcurementPage() {
    console.log("🚀 初始化採購管理頁面 (v9.0 去除排序限制)...");

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
                // 使用全域 loadProjects()
                let allMyProjects = [];
                if (typeof loadProjects === 'function') {
                    allMyProjects = await loadProjects();
                } else {
                    const db = firebase.firestore();
                    const snapshot = await db.collection('projects').get();
                    allMyProjects = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
                }
                
                // 篩選權限
                projects = allMyProjects.filter(project => {
                    const memberInfo = project.members && project.members[currentUser.email];
                    return memberInfo || project.createdBy === currentUser.email;
                });

                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) {
                console.error("載入專案失敗:", error);
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
                const db = firebase.firestore();
                // ❌ 移除 orderBy，避免權限問題
                const snapshot = await db.collection('tenders')
                    .where('projectId', '==', projectId)
                    .get();
                
                tenders = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                
                // ✅ 改在前端排序 (最新在前)
                tenders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (error) {
                console.error("載入標單失敗:", error);
                tenderSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        // --- (C) 標單變更 -> 載入所有資料 (🔥 修正重點) ---
        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            if (!tenderId) return;

            selectedTender = tenders.find(t => t.id === tenderId);
            const majorItemSelect = document.getElementById('majorItemSelect');
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            showLoading(true, '載入標單明細...');

            try {
                const db = firebase.firestore();

                // 1. 載入大項與細項 (❌ 移除 .orderBy，改用純 where)
                // 這會跟 space-distribution.js 的查詢方式一模一樣
                const majorProm = db.collection('majorItems')
                    .where('tenderId', '==', tenderId)
                    .get();
                
                const detailProm = db.collection('detailItems')
                    .where('tenderId', '==', tenderId)
                    .get();

                const [majorSnap, detailSnap] = await Promise.all([majorProm, detailProm]);
                
                majorItems = majorSnap.docs.map(d => ({id: d.id, ...d.data()}));
                detailItems = detailSnap.docs.map(d => ({id: d.id, ...d.data()}));

                // ✅ 改在前端排序 (依 sequence)
                majorItems.sort(naturalSequenceSort);
                detailItems.sort(naturalSequenceSort);

                populateSelect(majorItemSelect, majorItems, '所有大項目');

                // 2. 嘗試載入採購單 (容錯)
                try {
                    const poSnap = await db.collection('purchaseOrders').where('tenderId', '==', tenderId).get();
                    purchaseOrders = poSnap.docs.map(d => ({id: d.id, ...d.data()}));
                } catch (poError) {
                    console.warn("⚠️ 採購單讀取被拒 (可能是權限未開)，視為無資料");
                    purchaseOrders = [];
                }

                // 3. 嘗試載入報價單 (容錯)
                try {
                    const quoteSnap = await db.collection('quotations').where('tenderId', '==', tenderId).get();
                    quotations = quoteSnap.docs.map(d => ({id: d.id, ...d.data()}));
                } catch (quoteError) {
                    console.warn("⚠️ 報價單讀取被拒，視為無資料");
                    quotations = [];
                }

                // 4. 顯示表格
                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('emptyState').style.display = 'none';
                renderTable();
                updateStats();

            } catch (error) {
                console.error("❌ 核心資料載入失敗:", error);
                // 這裡如果不幸失敗，我們至少要在 Console 看到是誰失敗
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
                // 狀態與報價顯示
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

            bind('exportRfqBtn', 'click', () => alert('匯出功能建置中...'));
            bind('importQuotesBtn', 'click', () => document.getElementById('importQuotesInput')?.click());
            bind('manageQuotesBtn', 'click', () => document.getElementById('manageQuotesModal').style.display = 'flex');
            
            document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modal = btn.closest('.modal-overlay');
                    if (modal) modal.style.display = 'none';
                });
            });
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

        // 自然排序法 (前端排序)
        function naturalSequenceSort(a, b) {
            return (a.sequence || '').localeCompare((b.sequence || ''), undefined, {numeric: true, sensitivity: 'base'});
        }
    });
}
