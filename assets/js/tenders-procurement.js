/**
 * 標單採購管理 (tenders-procurement.js) - v30.0 (UI 重複修復版)
 * 修正重點：
 * 1. 【UI 修復】：加入 hideLegacyDashboard 函式。
 * - 自動偵測並隱藏頁面上原本舊有的「採購狀態概覽」HTML 區塊，解決出現兩個儀表板的 Bug。
 * 2. 【功能完整】：保留 v29 的強制儀表板 (圓餅圖)、批次日期、批次狀態等所有功能。
 */
function initProcurementPage() {
    console.log("🚀 初始化採購管理頁面 (v30.0 UI 重複修復版)...");

    // 全域變數
    let statusChart = null;
    let currentBatchMajorId = null;
    let currentBatchType = null;

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

        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let purchaseOrders = [], quotations = [];
        let selectedProject = null, selectedTender = null;
        
        const currentUser = firebase.auth().currentUser;
        const db = firebase.firestore();

        injectStylesAndScripts();
        injectHiddenDateInputs();

        initializePage();

        async function initializePage() {
            if (!currentUser) return showAlert("無法獲取用戶資訊", "error");
            setupEventListeners();
            await loadProjectsWithPermission();
        }

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
                    const snapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
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

                // 載入標單細項
                let majorData, detailDataRaw;
                if (typeof safeFirestoreQuery === 'function') {
                    const [majorRes, detailRes] = await Promise.all([
                        safeFirestoreQuery('majorItems', queryConditions),
                        safeFirestoreQuery('detailItems', queryConditions)
                    ]);
                    majorData = majorRes.docs;
                    detailDataRaw = detailRes.docs;
                } else {
                    const majorSnap = await db.collection('majorItems').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject.id).get();
                    const detailSnap = await db.collection('detailItems').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject.id).get();
                    majorData = majorSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    detailDataRaw = detailSnap.docs.map(d => ({id: d.id, ...d.data()}));
                }

                majorItems = majorData;
                detailItems = detailDataRaw.filter(item => !item.isAddition);
                majorItems.sort(naturalSequenceSort);
                detailItems.sort(naturalSequenceSort);
                populateSelect(majorItemSelect, majorItems, '所有大項目');

                // 載入採購單 & 報價單
                try {
                    let poData = [];
                    if (typeof safeFirestoreQuery === 'function') {
                         const poRes = await safeFirestoreQuery('purchaseOrders', queryConditions);
                         poData = poRes.docs;
                    } else {
                        const poSnap = await db.collection('purchaseOrders').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject.id).get();
                        poData = poSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    }
                    purchaseOrders = poData;
                } catch (poError) { purchaseOrders = []; }

                try {
                    let quoteData = [];
                    if (typeof safeFirestoreQuery === 'function') {
                        const quoteRes = await safeFirestoreQuery('quotations', queryConditions);
                        quoteData = quoteRes.docs;
                    } else {
                        const quoteSnap = await db.collection('quotations').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject.id).get();
                        quoteData = quoteSnap.docs.map(d => ({id: d.id, ...d.data()}));
                    }
                    quotations = quoteData;
                } catch (quoteError) { quotations = []; }

                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('emptyState').style.display = 'none';
                
                // 🔥 UI 修復核心
                ensureDashboardSection();
                adjustTableHeader();   
                
                renderTable();
                updateStats();

            } catch (error) {
                console.error("資料載入失敗:", error);
                showAlert('載入失敗: ' + error.message, 'error');
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            } finally {
                showLoading(false);
            }
        }

        // 🔥 強制建立儀表板 並 隱藏舊的
        function ensureDashboardSection() {
            const mainContent = document.getElementById('mainContent');

            // 1. 先執行清除舊儀表板的邏輯
            hideLegacyDashboard();

            // 2. 檢查是否已經建立過新儀表板
            const oldDash = document.getElementById('procurement-dashboard');
            if (oldDash) oldDash.remove();

            // 3. 建立新 Dashboard
            const dashboard = document.createElement('div');
            dashboard.id = 'procurement-dashboard';
            dashboard.className = 'card mb-3 shadow-sm';
            // 使用漸層背景讓它看起來跟舊的不一樣
            dashboard.style.background = 'linear-gradient(to right, #ffffff, #f8f9fa)'; 
            dashboard.style.borderLeft = '5px solid #20c997'; 
            dashboard.innerHTML = `
                <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 300px;">
                        <h5 class="card-title mb-3" style="font-weight: bold; color: #333;">📊 採購狀態概覽</h5>
                        <div class="d-flex flex-wrap" style="gap: 15px; font-size: 1rem;">
                            <div class="p-2 border rounded text-center" style="min-width: 80px; background: #fff;">
                                <div class="text-muted small">總項次</div>
                                <strong id="dash-total" style="font-size: 1.2rem;">-</strong>
                            </div>
                            <div class="p-2 border rounded text-center" style="min-width: 80px; background: #e9ecef; border-color: #dee2e6 !important;">
                                <div class="text-secondary small">規劃中</div>
                                <strong id="dash-planning" style="font-size: 1.2rem; color: #495057;">-</strong>
                            </div>
                            <div class="p-2 border rounded text-center" style="min-width: 80px; background: #dbe4ff; border-color: #bac8ff !important;">
                                <div class="text-primary small">詢價中</div>
                                <strong id="dash-inquiry" style="font-size: 1.2rem; color: #3b5bdb;">-</strong>
                            </div>
                            <div class="p-2 border rounded text-center" style="min-width: 80px; background: #fff3bf; border-color: #fcc419 !important;">
                                <div class="text-warning small" style="color: #e67700;">已下單</div>
                                <strong id="dash-ordered" style="font-size: 1.2rem; color: #f08c00;">-</strong>
                            </div>
                            <div class="p-2 border rounded text-center" style="min-width: 80px; background: #d3f9d8; border-color: #8ce99a !important;">
                                <div class="text-success small">已到貨</div>
                                <strong id="dash-arrived" style="font-size: 1.2rem; color: #2b8a3e;">-</strong>
                            </div>
                        </div>
                    </div>
                    <div style="width: 250px; height: 120px; position: relative;">
                        <canvas id="procurementChart"></canvas>
                    </div>
                </div>
            `;
            
            // 插入在 mainContent 最上方
            mainContent.insertBefore(dashboard, mainContent.firstChild);
        }

        // 🔥 自動搜尋並隱藏舊的儀表板 HTML
        function hideLegacyDashboard() {
            // 策略：尋找含有「採購狀態概覽」或「採購概覽」文字的標題，然後隱藏其父容器
            const allHeaders = document.querySelectorAll('h5, h4, .card-title');
            
            allHeaders.forEach(header => {
                const text = header.textContent.trim();
                // 如果標題包含關鍵字，且不是我們新建立的 dashboard (ID判斷)
                if ((text.includes('採購狀態概覽') || text.includes('採購概覽')) && 
                    !header.closest('#procurement-dashboard')) {
                    
                    // 嘗試找到最外層的卡片容器
                    const parentCard = header.closest('.card') || header.closest('.stats-container');
                    if (parentCard) {
                        parentCard.style.display = 'none';
                        console.log("已自動隱藏舊版儀表板:", parentCard);
                    }
                }
            });
        }

        // 🔥 強制修正表頭
        function adjustTableHeader() {
            const tbody = document.getElementById('procurementTableBody');
            if (!tbody) return;
            const table = tbody.closest('table');
            if (!table) return;
            const thead = table.querySelector('thead tr');
            if (!thead) return;

            thead.innerHTML = `
                <th style="width: 5%">項次</th>
                <th style="width: 22%">項目名稱</th>
                <th style="width: 5%">單位</th>
                <th style="width: 11%; background-color: #f8f0fc;">需用日期</th>
                <th style="width: 11%; background-color: #fff4e6;">下單日期</th>
                <th class="text-right" style="width: 8%">數量</th>
                <th style="width: 10%">採購狀態</th>
                <th style="width: 18%">供應商報價</th>
                <th class="text-right" style="width: 10%">成本單價</th>
            `;
        }

        function renderTable() {
            const tbody = document.getElementById('procurementTableBody');
            const filterMajorId = document.getElementById('majorItemSelect').value;
            
            if (!tbody) return;
            tbody.innerHTML = '';

            let targetMajorItems = majorItems;
            if (filterMajorId) targetMajorItems = majorItems.filter(m => m.id === filterMajorId);

            let hasAnyData = false;

            targetMajorItems.forEach(major => {
                const myDetails = detailItems.filter(d => d.majorItemId === major.id);

                if (myDetails.length > 0) {
                    hasAnyData = true;
                    const headerRow = document.createElement('tr');
                    headerRow.className = 'table-active';
                    
                    headerRow.innerHTML = `
                        <td colspan="9" style="background-color: #f1f3f5; padding: 8px 15px; vertical-align: middle; border-bottom: 2px solid #dee2e6;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-weight: bold; font-size: 1.05rem;">
                                        ${major.sequence || ''} ${major.name || '未命名大項'} 
                                    </span>
                                    <span class="badge badge-secondary badge-pill">${myDetails.length} 項</span>
                                </div>
                                
                                <div class="btn-group shadow-sm">
                                    <button class="btn btn-sm btn-light border" 
                                            onclick="window.triggerBatchDate('required', '${major.id}')"
                                            title="設定此大項所有項目的需用日期">
                                        📅 批次需用
                                    </button>
                                    <button class="btn btn-sm btn-light border" 
                                            onclick="window.triggerBatchDate('ordered', '${major.id}')"
                                            title="設定此大項所有項目的下單日期">
                                        📅 批次下單
                                    </button>
                                    <button class="btn btn-sm btn-outline-dark border" 
                                            onclick="window.batchUpdateStatus('${major.id}', '${major.name}')"
                                            title="變更此大項所有項目的狀態">
                                        ⚡ 批次狀態
                                    </button>
                                </div>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(headerRow);

                    myDetails.forEach(item => {
                        const tr = createDetailRow(item);
                        tbody.appendChild(tr);
                    });
                }
            });

            const allExtraQuotes = quotations.filter(q => q.isExtra);
            if (allExtraQuotes.length > 0) {
                targetMajorItems.forEach((major) => {
                    const myExtraQuotes = allExtraQuotes.filter(q => q.majorItemId === major.id);
                    if (myExtraQuotes.length > 0) {
                        hasAnyData = true;
                        const headerRow = document.createElement('tr');
                        headerRow.style.borderTop = "3px double #dee2e6";
                        headerRow.innerHTML = `<td colspan="9" style="font-weight: bold; background-color: #fff3cd; color: #856404; padding: 12px 15px;">⚠️ ${major.sequence || ''} ${major.name || ''} (廠商額外新增)</td>`;
                        tbody.appendChild(headerRow);
                        myExtraQuotes.forEach(quote => tbody.appendChild(createExtraQuoteRow(quote)));
                    }
                });
            }

            if (!hasAnyData) tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 20px;">沒有符合的項目資料</td></tr>';
        }

        function createDetailRow(item) {
            const tr = document.createElement('tr');
            const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
            const itemQuotes = quotations.filter(q => q.detailItemId === item.id && !q.isExtra);
            
            let statusText = '規劃中', statusClass = 'status-planning', currentStatusCode = 'planning';
            let reqDate = '', ordDate = '';

            if (itemPO) {
                currentStatusCode = itemPO.status;
                reqDate = itemPO.requiredDate || '';
                ordDate = itemPO.orderedDate || '';
                const statusMap = {
                    'inquiry': {t: '詢價中', c: 'status-inquiry'},
                    'ordered': {t: '已下單', c: 'status-ordered'},
                    'arrived': {t: '已到貨', c: 'status-arrived'}
                };
                const s = statusMap[itemPO.status] || {t: itemPO.status, c: 'status-planning'};
                statusText = s.t; statusClass = s.c;
            }

            let reqDateStyle = '';
            if (reqDate) {
                const today = new Date().toISOString().split('T')[0];
                if (reqDate < today && currentStatusCode !== 'arrived') reqDateStyle = 'color: #e03131; font-weight: bold; border-color: #e03131;';
            }

            let quotesHtml = itemQuotes.length > 0 ? itemQuotes.map(q => `<span class="quote-chip" title="${q.supplierName}">${(q.supplierName || '').substring(0,4)}.. $${q.quotedUnitPrice || 0}</span>`).join('') : '<span class="text-muted text-sm">-</span>';
            
            let qty = 0;
            if (item.totalQuantity !== undefined) qty = Number(item.totalQuantity);
            else if (item.quantity !== undefined) qty = Number(item.quantity);

            let unitPrice = item.unitPrice !== undefined ? item.unitPrice : (item.cost !== undefined ? item.cost : 0);

            tr.innerHTML = `
                <td>${item.sequence || '-'}</td>
                <td><div style="font-weight:bold;">${item.name || '未命名'}</div><div class="text-muted text-sm">${item.brand || ''} ${item.model || ''}</div></td>
                <td>${item.unit || '-'}</td>
                
                <td style="background-color: #fcf9fe;">
                    <input type="date" class="form-control form-control-sm date-input" 
                           value="${reqDate}" style="${reqDateStyle}"
                           onchange="window.updateDate('${item.id}', 'requiredDate', this.value)"
                           title="需用日期">
                </td>
                
                <td style="background-color: #fff9f2;">
                    <input type="date" class="form-control form-control-sm date-input" 
                           value="${ordDate}"
                           onchange="window.updateDate('${item.id}', 'orderedDate', this.value)"
                           title="下單日期">
                </td>

                <td class="text-right">${qty}</td>
                <td><span class="order-chip ${statusClass}" onclick="window.toggleStatus('${item.id}', '${currentStatusCode}')">${statusText}</span></td>
                <td>${quotesHtml}</td>
                <td class="text-right">${unitPrice ? parseInt(unitPrice).toLocaleString() : '-'}</td>
            `;
            return tr;
        }

        function createExtraQuoteRow(quote) {
            const tr = document.createElement('tr');
            tr.style.backgroundColor = '#fff9db';
            const quotesHtml = `<span class="quote-chip" style="border: 1px solid #f59f00; color: #f59f00;" title="${quote.supplierName}">${(quote.supplierName || '').substring(0,4)}.. $${quote.quotedUnitPrice || 0}</span>`;

            tr.innerHTML = `
                <td class="text-muted"><small>(額外)</small></td>
                <td><div style="font-weight:bold; color: #d63384;">${quote.itemName || '額外項目'}</div><div class="text-muted text-sm">${quote.remark || '(廠商新增項目)'}</div></td>
                <td>${quote.itemUnit || '-'}</td>
                <td></td><td></td>
                <td class="text-right">${quote.itemQty || 1}</td>
                <td><span class="text-muted text-sm">-</span></td>
                <td>${quotesHtml}</td>
                <td class="text-right">-</td>
            `;
            return tr;
        }

        // 🔥 更新統計數字與圖表
        function updateStats() {
            const counts = { planning: 0, inquiry: 0, ordered: 0, arrived: 0 };
            detailItems.forEach(item => {
                const po = purchaseOrders.find(p => p.detailItemId === item.id);
                if (!po) counts.planning++;
                else {
                    if (counts[po.status] !== undefined) counts[po.status]++;
                    else counts.planning++;
                }
            });

            // 更新新 Dashboard 的數字
            const setId = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
            setId('dash-total', detailItems.length);
            setId('dash-planning', counts.planning);
            setId('dash-inquiry', counts.inquiry);
            setId('dash-ordered', counts.ordered);
            setId('dash-arrived', counts.arrived);

            renderChart(counts);
        }

        function renderChart(counts) {
            if (typeof Chart === 'undefined') { console.warn("Chart.js not loaded yet"); return; }
            const ctx = document.getElementById('procurementChart');
            if (!ctx) return;

            const dataValues = [counts.planning, counts.inquiry, counts.ordered, counts.arrived];
            const colors = ['#e9ecef', '#dbe4ff', '#fff3bf', '#d3f9d8'];
            const borders = ['#ced4da', '#bac8ff', '#fcc419', '#8ce99a'];

            if (statusChart) {
                statusChart.data.datasets[0].data = dataValues;
                statusChart.update();
            } else {
                statusChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['規劃中', '詢價中', '已下單', '已到貨'],
                        datasets: [{ data: dataValues, backgroundColor: colors, borderColor: borders, borderWidth: 1 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '70%',
                        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } }
                    }
                });
            }
        }

        // --- 批次功能 ---
        function injectHiddenDateInputs() {
            if (document.getElementById('batch-date-picker')) return;
            const input = document.createElement('input');
            input.type = 'date';
            input.id = 'batch-date-picker';
            input.style.cssText = 'position:fixed; top:-1000px; opacity:0; pointer-events:none;';
            document.body.appendChild(input);

            input.addEventListener('change', (e) => {
                const dateStr = e.target.value;
                if (dateStr && currentBatchMajorId && currentBatchType) {
                    handleBatchDateUpdate(currentBatchType, currentBatchMajorId, dateStr);
                }
                e.target.value = '';
            });
        }

        function triggerBatchDate(type, majorId) {
            currentBatchMajorId = majorId;
            currentBatchType = type;
            const picker = document.getElementById('batch-date-picker');
            if (picker && 'showPicker' in HTMLInputElement.prototype) {
                try { picker.showPicker(); } catch(e) { const date = prompt("請輸入日期 (YYYY-MM-DD):", new Date().toISOString().split('T')[0]); if(date) handleBatchDateUpdate(type, majorId, date); }
            } else {
                const date = prompt("請輸入日期 (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
                if(date) handleBatchDateUpdate(type, majorId, date);
            }
        }

        async function handleBatchDateUpdate(type, majorId, dateStr) {
            const targetDetails = detailItems.filter(d => d.majorItemId === majorId);
            const typeLabel = type === 'required' ? '需用日期' : '下單日期';
            
            if (!confirm(`將【${targetDetails.length}】個項目的「${typeLabel}」全部設為 ${dateStr}？`)) return;

            showLoading(true, '批次更新中...');
            const batch = db.batch();
            const fieldName = type === 'required' ? 'requiredDate' : 'orderedDate';

            targetDetails.forEach(item => {
                const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
                let updates = { [fieldName]: dateStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

                if (itemPO) {
                    batch.update(db.collection('purchaseOrders').doc(itemPO.id), updates);
                } else {
                    const ref = db.collection('purchaseOrders').doc();
                    batch.set(ref, {
                        projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: item.id, majorItemId: majorId,
                        status: 'planning', createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...updates
                    });
                }
            });

            try {
                await batch.commit();
                await onTenderChange(selectedTender.id);
                showAlert('更新完成', 'success');
            } catch (error) {
                console.error(error); showAlert("更新失敗", 'error');
            } finally {
                showLoading(false);
            }
        }

        // --- 互動功能函式 ---
        async function handleUpdateDate(itemId, field, dateStr) {
            const itemPO = purchaseOrders.find(po => po.detailItemId === itemId);
            const newItem = detailItems.find(i => i.id === itemId);
            try {
                if (itemPO) await db.collection('purchaseOrders').doc(itemPO.id).update({ [field]: dateStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                else await db.collection('purchaseOrders').add({ projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: itemId, majorItemId: newItem.majorItemId, status: 'planning', [field]: dateStr, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                renderTable();
            } catch(e) { showAlert('Error', 'error'); }
        }
        
        async function handleToggleStatus(itemId, currentStatus) {
            const cycle = {'planning':'inquiry', 'inquiry':'ordered', 'ordered':'arrived', 'arrived':'planning'};
            const next = cycle[currentStatus] || 'inquiry';
            const itemPO = purchaseOrders.find(po => po.detailItemId === itemId);
            const item = detailItems.find(i => i.id === itemId);
            showLoading(true);
            try {
                let up = { status: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (next === 'ordered' && (!itemPO || !itemPO.orderedDate)) up.orderedDate = new Date().toISOString().split('T')[0];
                if (next === 'planning' && itemPO) await db.collection('purchaseOrders').doc(itemPO.id).delete();
                else if (itemPO) await db.collection('purchaseOrders').doc(itemPO.id).update(up);
                else await db.collection('purchaseOrders').add({ projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: itemId, majorItemId: item.majorItemId, createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...up });
                await onTenderChange(selectedTender.id);
            } catch(e) { console.error(e); showAlert('Error', 'error'); } finally { showLoading(false); }
        }

        async function handleBatchUpdateStatus(majorId, majorName) {
            const choice = prompt(`變更【${majorName}】狀態：\n1.詢價\n2.下單\n3.到貨\n4.規劃`);
            const map = {'1':'inquiry', '2':'ordered', '3':'arrived', '4':'planning'};
            if (!choice || !map[choice]) return;
            const next = map[choice];
            const targets = detailItems.filter(d => d.majorItemId === majorId);
            if (!confirm(`變更 ${targets.length} 項為 ${next}?`)) return;
            showLoading(true);
            const b = db.batch();
            const today = new Date().toISOString().split('T')[0];
            targets.forEach(item => {
                const po = purchaseOrders.find(p => p.detailItemId === item.id);
                let up = { status: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (next === 'ordered' && (!po || !po.orderedDate)) up.orderedDate = today;
                if (po) {
                    if (next === 'planning') b.delete(db.collection('purchaseOrders').doc(po.id));
                    else b.update(db.collection('purchaseOrders').doc(po.id), up);
                } else if (next !== 'planning') {
                    b.set(db.collection('purchaseOrders').doc(), { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: item.id, majorItemId: majorId, createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...up });
                }
            });
            await b.commit();
            await onTenderChange(selectedTender.id);
            showAlert('批次更新完成', 'success');
            showLoading(false);
        }

        function setupEventListeners() {
            const change = (id, fn) => { const el = document.getElementById(id); if(el) el.onchange = fn; };
            const click = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
            change('projectSelect', e => onProjectChange(e.target.value));
            change('tenderSelect', e => onTenderChange(e.target.value));
            change('majorItemSelect', () => renderTable());
            click('exportRfqBtn', handleExportRFQ);
            click('importQuotesBtn', () => document.getElementById('importQuotesInput')?.click());
            change('importQuotesInput', handleImportQuotes);
            click('manageQuotesBtn', openQuoteManager);
            
            window.triggerBatchDate = triggerBatchDate;
            window.batchUpdateStatus = handleBatchUpdateStatus;
            window.toggleStatus = handleToggleStatus;
            window.updateDate = handleUpdateDate;
            window.deleteSupplierQuotes = deleteSupplierQuotes;
            window.selectQuote = handleSelectQuote;

            document.querySelectorAll('[data-action="close-modal"]').forEach(b => b.onclick = () => b.closest('.modal-overlay').style.display='none');
        }

        function injectStylesAndScripts() {
            const style = document.createElement('style');
            style.innerHTML = `
                .status-planning { background-color: #e9ecef; color: #495057; }
                .status-inquiry { background-color: #dbe4ff; color: #3b5bdb; }
                .status-ordered { background-color: #fff3bf; color: #f08c00; }
                .status-arrived { background-color: #d3f9d8; color: #2b8a3e; }
                .order-chip { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; min-width: 80px; text-align: center; }
                .order-chip:hover { opacity: 0.8; transform: scale(1.05); }
                .date-input { border: 1px solid #ced4da; border-radius: 4px; padding: 2px 5px; font-size: 0.85rem; width: 100%; box-sizing: border-box; }
            `;
            document.head.appendChild(style);
            if (!document.querySelector('script[src*="chart.js"]')) {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/chart.js";
                document.head.appendChild(script);
            }
        }

        // --- 省略重複的輔助函式，請確保與 v28/v29 相同 ---
        function showLoading(show, msg) { const el = document.getElementById('loading'); if(el) { el.style.display = show ? 'flex' : 'none'; if(msg) el.querySelector('p').textContent = msg; } }
        function populateSelect(select, items, defaultText) { if(!select) return; select.innerHTML = `<option value="">${defaultText}</option>` + items.map(i => `<option value="${i.id}">${i.sequence ? i.sequence + '.' : ''} ${i.name || i.code}</option>`).join(''); select.disabled = items.length === 0; }
        function resetSelects(level) { if (level === 'project') { document.getElementById('tenderSelect').innerHTML = '<option value="">請先選擇專案</option>'; document.getElementById('tenderSelect').disabled = true; document.getElementById('majorItemSelect').innerHTML = '<option value="">所有大項目</option>'; document.getElementById('majorItemSelect').disabled = true; document.getElementById('mainContent').style.display = 'none'; document.getElementById('emptyState').style.display = 'flex'; } else if (level === 'tender') { document.getElementById('majorItemSelect').innerHTML = '<option value="">所有大項目</option>'; } }
        function showAlert(msg, type) { alert(msg); }
        function handleSelectQuote(id) { console.log(id); }
        function naturalSequenceSort(a, b) { const MAP = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'壹':1,'貳':2,'參':3,'肆':4,'伍':5,'陸':6,'柒':7,'捌':8,'玖':9,'拾':10}; const sA = String(a.sequence||''), sB = String(b.sequence||''); const nA = parseFloat(MAP[sA]||sA), nB = parseFloat(MAP[sB]||sB); if(!isNaN(nA)&&!isNaN(nB)) return nA-nB; return sA.localeCompare(sB, undefined, {numeric:true}); }
        function normalizeString(str) { return String(str).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim().toLowerCase(); }
        async function handleImportQuotes(e) { const file = e.target.files[0]; if (!file) return; try { if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件"); const supplierName = prompt("請輸入此報價單的供應商名稱："); if (!supplierName || supplierName.trim() === "") return; showLoading(true); const data = await file.arrayBuffer(); const workbook = XLSX.read(data); const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); const batch = db.batch(); let cnt=0, ext=0, ops=0, batches=[], curBatch=db.batch(), curMajor=null; jsonData.forEach(row => { const seq=row['項次']?String(row['項次']).trim():'', name=row['項目名稱']?String(row['項目名稱']).trim():'', price=row['供應商報價(單價)']||row['單價']||0; const foundMajor = majorItems.find(m => { const k = `${m.sequence||''} ${m.name||''}`; return normalizeString(seq).includes(normalizeString(k)); }); if(foundMajor) { curMajor=foundMajor; return; } if(!curMajor || (!seq && !name)) return; const item = detailItems.find(i => i.majorItemId===curMajor.id && normalizeString(i.sequence)===normalizeString(seq) && normalizeString(i.name)===normalizeString(name)); if(price>0) { const ref = db.collection('quotations').doc(); let q = { projectId:selectedProject.id, tenderId:selectedTender.id, majorItemId:curMajor.id, supplierName:supplierName.trim(), quotedUnitPrice:Number(price), remark:row['備註']||'', createdAt:firebase.firestore.FieldValue.serverTimestamp() }; if(item) { q.detailItemId=item.id; q.isExtra=false; cnt++; } else { q.detailItemId=null; q.isExtra=true; q.itemName=name||'額外'; q.itemUnit=row['單位']||''; q.itemQty=row['數量']||1; ext++; } curBatch.set(ref, q); ops++; if(ops>=450) { batches.push(curBatch.commit()); curBatch=db.batch(); ops=0; } } }); if(ops>0) batches.push(curBatch.commit()); await Promise.all(batches); showAlert(`匯入完成！匹配 ${cnt} 筆，額外 ${ext} 筆`, 'success'); await onTenderChange(selectedTender.id); } catch(e) { console.error(e); showAlert(e.message, 'error'); } finally { e.target.value=''; showLoading(false); } }
        function openQuoteManager() { const mb = document.querySelector('#manageQuotesModal .modal-body'); if(!mb) return; if(!quotations.length) mb.innerHTML = '<div class="text-center p-4">無資料</div>'; else { let h = '<table class="table"><thead><tr><th>供應商</th><th>操作</th></tr></thead><tbody>'; const suppliers = [...new Set(quotations.map(q=>q.supplierName))]; suppliers.forEach(s => h+=`<tr><td>${s}</td><td><button class="btn btn-sm btn-danger" onclick="deleteSupplierQuotes('${s}')">刪除</button></td></tr>`); h+='</tbody></table>'; mb.innerHTML = h; } document.getElementById('manageQuotesModal').style.display='flex'; }
        async function deleteSupplierQuotes(name) { if(!confirm(`刪除 ${name}?`)) return; const qs = quotations.filter(q=>q.supplierName===name); const b = db.batch(); qs.forEach(q=>b.delete(db.collection('quotations').doc(q.id))); await b.commit(); await onTenderChange(selectedTender.id); openQuoteManager(); }
        function handleDeleteOrder() { openQuoteManager(); }
        function handleExportRFQ() { if (!selectedTender) return showAlert('請先選擇標單', 'warning'); if (detailItems.length === 0) return showAlert('目前沒有項目可匯出', 'warning'); try { if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件"); const exportData = []; majorItems.forEach(major => { const myDetails = detailItems.filter(d => d.majorItemId === major.id); if (myDetails.length > 0) { exportData.push({ '項次': `${major.sequence || ''} ${major.name || ''}`, '項目名稱': '', '說明(廠牌/型號)': '', '單位': '', '數量': '', '供應商報價(單價)': '', '小計(複價)': '', '備註': '' }); myDetails.forEach(item => { let qty = 0; if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity); else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity); else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty); exportData.push({ '項次': item.sequence || '', '項目名稱': item.name || '', '說明(廠牌/型號)': `${item.brand || ''} ${item.model || ''}`.trim(), '單位': item.unit || '', '數量': qty, '供應商報價(單價)': '', '小計(複價)': '', '備註': '' }); }); } }); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(exportData); ws['!cols'] = [ {wch: 15}, {wch: 30}, {wch: 25}, {wch: 8}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 20} ]; XLSX.utils.book_append_sheet(wb, ws, "詢價單"); const filename = `${selectedProject.name}_${selectedTender.name}_詢價單.xlsx`; XLSX.writeFile(wb, filename); } catch (error) { console.error("匯出失敗:", error); showAlert("匯出失敗: " + error.message, 'error'); } }
    });
}
