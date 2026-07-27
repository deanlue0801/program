/**
 * 標單採購管理 (tenders-procurement.js) - v35.0 (預算差異與選商實作版)
 */

// 1. 掛載到全域，確保 router.js 永遠找得到
window.initProcurementPage = function () {
    console.log("🚀 開始執行 initProcurementPage...");

    // 2. 【一勞永逸閘門】：檢查當前頁面是否有採購頁面專屬 DOM
    const isProcurementPage = !!document.getElementById('procurementTableBody') || !!document.getElementById('mainContent');
    
    // 如果不是採購頁面，直接退出！不註冊事件、不抓資料、不干涉其他頁面
    if (!isProcurementPage) {
        console.log("ℹ️ 當前非「標單採購頁面」，tenders-procurement.js 已自動停用。");
        return; 
    }

    console.log("✅ 確定為採購頁面，開始初始化 (v35.0)...");

    // 全域變數
    let statusChart = null;
    let currentBatchMajorId = null;
    let currentBatchType = null;
    let projects = [], tenders = [], majorItems = [], detailItems = [];
    let purchaseOrders = [], quotations = [];
    let selectedProject = null, selectedTender = null;

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

    const currentUser = firebase.auth().currentUser;
    const db = firebase.firestore();

    injectHiddenDateInputs();

    // 確保 Chart.js 有載入
    if (!document.querySelector('script[src*="chart.js"]')) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        document.head.appendChild(script);
    }

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
        
        if (majorItemSelect) {
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;
        }

        showLoading(true, '載入資料中...');

        try {
            const queryConditions = [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: selectedProject ? selectedProject.id : '' }
            ];

            let majorData, detailDataRaw;
            if (typeof safeFirestoreQuery === 'function') {
                const [majorRes, detailRes] = await Promise.all([
                    safeFirestoreQuery('majorItems', queryConditions),
                    safeFirestoreQuery('detailItems', queryConditions)
                ]);
                majorData = majorRes.docs;
                detailDataRaw = detailRes.docs;
            } else {
                const majorSnap = await db.collection('majorItems').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject ? selectedProject.id : '').get();
                const detailSnap = await db.collection('detailItems').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject ? selectedProject.id : '').get();
                majorData = majorSnap.docs.map(d => ({id: d.id, ...d.data()}));
                detailDataRaw = detailSnap.docs.map(d => ({id: d.id, ...d.data()}));
            }

            majorItems = majorData;
            detailItems = detailDataRaw.filter(item => !item.isAddition);
            majorItems.sort(naturalSequenceSort);
            detailItems.sort(naturalSequenceSort);
            
            if (majorItemSelect) {
                populateSelect(majorItemSelect, majorItems, '所有大項目');
            }

            try {
                let poData = [];
                if (typeof safeFirestoreQuery === 'function') {
                     const poRes = await safeFirestoreQuery('purchaseOrders', queryConditions);
                     poData = poRes.docs;
                } else {
                    const poSnap = await db.collection('purchaseOrders').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject ? selectedProject.id : '').get();
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
                    const quoteSnap = await db.collection('quotations').where('tenderId', '==', tenderId).where('projectId', '==', selectedProject ? selectedProject.id : '').get();
                    quoteData = quoteSnap.docs.map(d => ({id: d.id, ...d.data()}));
                }
                quotations = quoteData;
            } catch (quoteError) { quotations = []; }

            const mainContent = document.getElementById('mainContent');
            const emptyState = document.getElementById('emptyState');
            if (mainContent) mainContent.style.display = 'block';
            if (emptyState) emptyState.style.display = 'none';
            
            ensureDashboardSection();
            adjustTableHeader();      
            renderTable();            
            updateStats();            

        } catch (error) {
            console.error("資料載入失敗:", error);
            showAlert('載入失敗: ' + error.message, 'error');
            
            if (majorItemSelect) {
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        } finally {
            showLoading(false);
        }
    }

    function ensureDashboardSection() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;
        const oldDash = document.getElementById('procurement-dashboard');
        if (oldDash) oldDash.remove();

        const dashboard = document.createElement('div');
        dashboard.id = 'procurement-dashboard';
        dashboard.className = 'content-card'; 
        dashboard.style.marginBottom = '20px';

        dashboard.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: center;">
                <div style="flex: 1; min-width: 300px;">
                    <h3 class="content-subtitle" style="margin-bottom: 15px;">📊 採購狀態概覽</h3>
                    <div class="custom-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px;">
                        <div class="stat-card" style="background: #f8f9fa; border: 1px solid #eee;">
                            <div class="stat-number" id="dash-total" style="font-size: 1.5rem; font-weight: bold; color: #333;">-</div>
                            <div class="stat-label" style="font-size: 0.9rem; color: #666;">總項目</div>
                        </div>
                        <div class="stat-card" style="background: #fff; border-left: 4px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <div class="stat-number" id="dash-planning" style="font-size: 1.5rem; font-weight: bold; color: #495057;">-</div>
                            <div class="stat-label" style="font-size: 0.9rem; color: #666;">規劃中</div>
                        </div>
                        <div class="stat-card" style="background: #fff; border-left: 4px solid #4c6ef5; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <div class="stat-number" id="dash-inquiry" style="font-size: 1.5rem; font-weight: bold; color: #4c6ef5;">-</div>
                            <div class="stat-label" style="font-size: 0.9rem; color: #666;">詢價中</div>
                        </div>
                        <div class="stat-card" style="background: #fff; border-left: 4px solid #fcc419; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <div class="stat-number" id="dash-ordered" style="font-size: 1.5rem; font-weight: bold; color: #fcc419;">-</div>
                            <div class="stat-label" style="font-size: 0.9rem; color: #666;">已下單</div>
                        </div>
                        <div class="stat-card" style="background: #fff; border-left: 4px solid #40c057; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <div class="stat-number" id="dash-arrived" style="font-size: 1.5rem; font-weight: bold; color: #40c057;">-</div>
                            <div class="stat-label" style="font-size: 0.9rem; color: #666;">已到貨</div>
                        </div>
                    </div>
                </div>
                <div style="flex: 0 0 260px; height: 160px; display: flex; align-items: center; justify-content: center;">
                    <canvas id="procurementChart"></canvas>
                </div>
            </div>
        `;
        mainContent.insertBefore(dashboard, mainContent.firstChild);
    }

    function adjustTableHeader() {
        const tbody = document.getElementById('procurementTableBody');
        if (!tbody) return;
        const table = tbody.closest('table');
        if (!table) return;
        const thead = table.querySelector('thead tr');
        if (!thead) return;

        thead.innerHTML = `
            <th style="width: 4%">項次</th>
            <th style="width: 20%">項目名稱</th>
            <th style="width: 4%">單位</th>
            <th style="width: 10%; background-color: #f8f0fc;">需用日期</th>
            <th style="width: 10%; background-color: #fff4e6;">下單日期</th>
            <th class="text-right" style="width: 6%">數量</th>
            <th style="width: 9%">採購狀態</th>
            <th style="width: 18%">供應商報價 (點擊選定)</th>
            <th class="text-right" style="width: 8%">成本單價</th>
            <th class="text-right" style="width: 8%">預算差異</th>
            <th class="text-center" style="width: 3%">附件</th>
        `;
    }

    function renderTable() {
        const tbody = document.getElementById('procurementTableBody');
        const filterMajorSelect = document.getElementById('majorItemSelect');
        const filterMajorId = filterMajorSelect ? filterMajorSelect.value : '';
        
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
                    <td colspan="11" style="background-color: #f1f3f5; padding: 8px 15px; vertical-align: middle; border-bottom: 2px solid #dee2e6;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-weight: bold; font-size: 1.05rem;">
                                    ${major.sequence || ''} ${major.name || '未命名大項'} 
                                </span>
                                <span class="badge badge-secondary badge-pill">${myDetails.length} 項</span>
                            </div>
                            <div class="btn-group shadow-sm">
                                <button class="btn btn-sm btn-light border" onclick="window.triggerBatchDate('required', '${major.id}')" title="批次需用日">📅 需用</button>
                                <button class="btn btn-sm btn-light border" onclick="window.triggerBatchDate('ordered', '${major.id}')" title="批次下單日">📅 下單</button>
                                <button class="btn btn-sm btn-outline-dark border" onclick="window.batchUpdateStatus('${major.id}', '${major.name}')" title="批次變更狀態">⚡ 狀態</button>
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
                    headerRow.innerHTML = `<td colspan="11" style="font-weight: bold; background-color: #fff3cd; color: #856404; padding: 12px 15px;">⚠️ ${major.sequence || ''} ${major.name || ''} (廠商額外新增)</td>`;
                    tbody.appendChild(headerRow);
                    myExtraQuotes.forEach(quote => tbody.appendChild(createExtraQuoteRow(quote)));
                }
            });
        }

        if (!hasAnyData) tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding: 20px;">沒有符合的項目資料</td></tr>';
    }

    function createDetailRow(item) {
        const tr = document.createElement('tr');
        const itemPO = purchaseOrders.find(po => po.detailItemId === item.id);
        const itemQuotes = quotations.filter(q => q.detailItemId === item.id && !q.isExtra);
        
        let statusText = '規劃中', statusClass = 'status-planning', currentStatusCode = 'planning';
        let reqDate = '', ordDate = '';
        let confirmedPrice = 0; 

        if (itemPO) {
            currentStatusCode = itemPO.status;
            reqDate = itemPO.requiredDate || '';
            ordDate = itemPO.orderedDate || '';
            confirmedPrice = itemPO.confirmedPrice || 0;

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

        let quotesHtml = itemQuotes.length > 0 ? itemQuotes.map(q => {
            const isSelected = q.quotedUnitPrice === confirmedPrice && confirmedPrice > 0;
            const style = isSelected ? 'background-color: #d4edda; border-color: #c3e6cb; color: #155724; font-weight: bold;' : '';
            return `<span class="quote-chip" style="${style}" title="點擊選定此報價: ${q.supplierName}" onclick="window.selectQuote('${q.id}', '${q.supplierName}', ${q.quotedUnitPrice}, '${item.id}')">${(q.supplierName || '').substring(0,4)}.. $${q.quotedUnitPrice || 0}</span>`;
        }).join('') : '<span class="text-muted text-sm">-</span>';
        
        let qty = 0;
        if (item.totalQuantity !== undefined) qty = Number(item.totalQuantity);
        else if (item.quantity !== undefined) qty = Number(item.quantity);

        let unitPrice = item.unitPrice !== undefined ? item.unitPrice : (item.cost !== undefined ? item.cost : 0);
        let varianceHtml = '<span class="text-muted">-</span>';
        
        if (confirmedPrice > 0) {
            const varianceUnit = unitPrice - confirmedPrice;
            const varianceTotal = varianceUnit * qty;
            if (varianceTotal >= 0) {
                varianceHtml = `<span style="color: #28a745; font-weight: bold;">+${parseInt(varianceTotal).toLocaleString()}</span>`;
            } else {
                varianceHtml = `<span style="color: #dc3545; font-weight: bold;">${parseInt(varianceTotal).toLocaleString()}</span>`;
            }
        }

        tr.innerHTML = `
            <td>${item.sequence || '-'}</td>
            <td><div style="font-weight:bold;">${item.name || '未命名'}</div><div class="text-muted text-sm">${item.brand || ''} ${item.model || ''}</div></td>
            <td>${item.unit || '-'}</td>
            <td style="background-color: #fcf9fe;"><input type="date" class="form-control form-control-sm date-input" value="${reqDate}" style="${reqDateStyle}" onchange="window.updateDate('${item.id}', 'requiredDate', this.value)"></td>
            <td style="background-color: #fff9f2;"><input type="date" class="form-control form-control-sm date-input" value="${ordDate}" onchange="window.updateDate('${item.id}', 'orderedDate', this.value)"></td>
            <td class="text-right">${qty}</td>
            <td><span class="order-chip ${statusClass}" onclick="window.toggleStatus('${item.id}', '${currentStatusCode}')">${statusText}</span></td>
            <td>${quotesHtml}</td>
            <td class="text-right">${unitPrice ? parseInt(unitPrice).toLocaleString() : '-'}</td>
            <td class="text-right" style="background-color: #fdfdfd;">${varianceHtml}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-link text-muted" title="上傳附件 (尚未實作)" onclick="alert('附件上傳功能將在下一階段開放')"><i class="fas fa-paperclip"></i></button>
            </td>
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
            <td class="text-right">-</td>
            <td></td>
        `;
        return tr;
    }

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
        const colors = ['#e9ecef', '#4c6ef5', '#fcc419', '#40c057'];
        const borders = ['#dee2e6', '#bac8ff', '#ffe066', '#8ce99a'];

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
                    responsive: true, maintainAspectRatio: false, cutout: '65%',
                    plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } }
                }
            });
        }
    }

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
        if (!confirm(`將 ${targets.length} 項變更為 ${next}？`)) return;
        showLoading(true);
        const b = db.batch();
        const today = new Date().toISOString().split('T')[0];
        targets.forEach(item => {
            const po = purchaseOrders.find(p => p.detailItemId === item.id);
            let up = { status: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (next === 'ordered' && (!po || !po.orderedDate)) up.orderedDate = today;
            if (po) { if (next === 'planning') b.delete(db.collection('purchaseOrders').doc(po.id)); else b.update(db.collection('purchaseOrders').doc(po.id), up); }
            else if (next !== 'planning') b.set(db.collection('purchaseOrders').doc(), { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: item.id, majorItemId: majorId, createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...up });
        });
        await b.commit();
        await onTenderChange(selectedTender.id);
        showAlert('批次更新完成', 'success');
        showLoading(false);
    }

    async function handleSelectQuote(quoteId, supplierName, price, detailItemId) {
        if (!confirm(`確定要向【${supplierName}】採購？\n成交單價：$${price}\n\n這將會更新此項目的採購狀態為「已下單」並計算預算差異。`)) return;

        showLoading(true, '更新採購單...');
        try {
            const itemPO = purchaseOrders.find(po => po.detailItemId === detailItemId);
            const item = detailItems.find(i => i.id === detailItemId);
            
            const updateData = {
                status: 'ordered',
                confirmedPrice: Number(price),
                supplierName: supplierName,
                orderedDate: itemPO?.orderedDate || new Date().toISOString().split('T')[0],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (itemPO) {
                await db.collection('purchaseOrders').doc(itemPO.id).update(updateData);
            } else {
                await db.collection('purchaseOrders').add({
                    projectId: selectedProject.id,
                    tenderId: selectedTender.id,
                    detailItemId: detailItemId,
                    majorItemId: item.majorItemId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    ...updateData
                });
            }

            await onTenderChange(selectedTender.id);
            showAlert('✅ 已確認採購並更新預算分析！', 'success');

        } catch (error) {
            console.error(error);
            showAlert('更新失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
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

    function showLoading(show, msg) { const el = document.getElementById('loading'); if(el) { el.style.display = show ? 'flex' : 'none'; if(msg) el.querySelector('p').textContent = msg; } }
    function populateSelect(select, items, defaultText) { if(!select) return; select.innerHTML = `<option value="">${defaultText}</option>` + items.map(i => `<option value="${i.id}">${i.sequence ? i.sequence + '.' : ''} ${i.name || i.code}</option>`).join(''); select.disabled = items.length === 0; }
    function resetSelects(level) { 
        const tenderSelect = document.getElementById('tenderSelect');
        const majorItemSelect = document.getElementById('majorItemSelect') || document.getElementById('majorSelect');
        const mainContent = document.getElementById('mainContent');
        const emptyState = document.getElementById('emptyState');

        if (level === 'project') { 
            if (tenderSelect) {
                tenderSelect.innerHTML = '<option value="">請先選擇專案</option>'; 
                tenderSelect.disabled = true; 
            }
            if (majorItemSelect) {
                majorItemSelect.innerHTML = '<option value="">所有大項目</option>'; 
                majorItemSelect.disabled = true; 
            }
            if (mainContent) mainContent.style.display = 'none'; 
            if (emptyState) emptyState.style.display = 'flex'; 
        } else if (level === 'tender') { 
            if (majorItemSelect) {
                majorItemSelect.innerHTML = '<option value="">所有大項目</option>'; 
            }
        } 
    }
    function showAlert(msg, type) { alert(msg); }
    function naturalSequenceSort(a, b) { const MAP = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'壹':1,'貳':2,'參':3,'肆':4,'伍':5,'陸':6,'柒':7,'捌':8,'玖':9,'拾':10}; const sA = String(a.sequence||''), sB = String(b.sequence||''); const nA = parseFloat(MAP[sA]||sA), nB = parseFloat(MAP[sB]||sB); if(!isNaN(nA)&&!isNaN(nB)) return nA-nB; return sA.localeCompare(sB, undefined, {numeric:true}); }
    function normalizeString(str) { return String(str).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').trim().toLowerCase(); }
    async function handleImportQuotes(e) { const file = e.target.files[0]; if (!file) return; try { if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件"); const supplierName = prompt("請輸入此報價單的供應商名稱："); if (!supplierName || supplierName.trim() === "") return; showLoading(true); const data = await file.arrayBuffer(); const workbook = XLSX.read(data); const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); const batch = db.batch(); let cnt=0, ext=0, ops=0, batches=[], curBatch=db.batch(), curMajor=null; jsonData.forEach(row => { const seq=row['項次']?String(row['項次']).trim():'', name=row['項目名稱']?String(row['項目名稱']).trim():'', price=row['供應商報價(單價)']||row['單價']||0; const foundMajor = majorItems.find(m => { const k = `${m.sequence||''} ${m.name||''}`; return normalizeString(seq).includes(normalizeString(k)); }); if(foundMajor) { curMajor=foundMajor; return; } if(!curMajor || (!seq && !name)) return; const item = detailItems.find(i => i.majorItemId===curMajor.id && normalizeString(i.sequence)===normalizeString(seq) && normalizeString(i.name)===normalizeString(name)); if(price>0) { const ref = db.collection('quotations').doc(); let q = { projectId:selectedProject.id, tenderId:selectedTender.id, majorItemId:curMajor.id, supplierName:supplierName.trim(), quotedUnitPrice:Number(price), remark:row['備註']||'', createdAt:firebase.firestore.FieldValue.serverTimestamp() }; if(item) { q.detailItemId=item.id; q.isExtra=false; cnt++; } else { q.detailItemId=null; q.isExtra=true; q.itemName=name||'額外'; q.itemUnit=row['單位']||''; q.itemQty=row['數量']||1; ext++; } curBatch.set(ref, q); ops++; if(ops>=450) { batches.push(curBatch.commit()); curBatch=db.batch(); ops=0; } } }); if(ops>0) batches.push(curBatch.commit()); await Promise.all(batches); showAlert(`匯入完成！匹配 ${cnt} 筆，額外 ${ext} 筆`, 'success'); await onTenderChange(selectedTender.id); } catch(e) { console.error(e); showAlert(e.message, 'error'); } finally { e.target.value=''; showLoading(false); } }
    function openQuoteManager() { const mb = document.querySelector('#manageQuotesModal .modal-body'); if(!mb) return; if(!quotations.length) mb.innerHTML = '<div class="text-center p-4">無資料</div>'; else { let h = '<table class="table"><thead><tr><th>供應商</th><th>操作</th></tr></thead><tbody>'; const suppliers = [...new Set(quotations.map(q=>q.supplierName))]; suppliers.forEach(s => h+=`<tr><td>${s}</td><td><button class="btn btn-sm btn-danger" onclick="deleteSupplierQuotes('${s}')">刪除</button></td></tr>`); h+='</tbody></table>'; mb.innerHTML = h; } document.getElementById('manageQuotesModal').style.display='flex'; }
    async function deleteSupplierQuotes(name) { if(!confirm(`刪除 ${name}?`)) return; const qs = quotations.filter(q=>q.supplierName===name); const b = db.batch(); qs.forEach(q=>b.delete(db.collection('quotations').doc(q.id))); await b.commit(); await onTenderChange(selectedTender.id); openQuoteManager(); }
    function handleExportRFQ() { if (!selectedTender) return showAlert('請先選擇標單', 'warning'); if (detailItems.length === 0) return showAlert('目前沒有項目可匯出', 'warning'); try { if (typeof XLSX === 'undefined') throw new Error("缺少 XLSX 套件"); const exportData = []; majorItems.forEach(major => { const myDetails = detailItems.filter(d => d.majorItemId === major.id); if (myDetails.length > 0) { exportData.push({ '項次': `${major.sequence || ''} ${major.name || ''}`, '項目名稱': '', '說明(廠牌/型號)': '', '單位': '', '數量': '', '供應商報價(單價)': '', '小計(複價)': '', '備註': '' }); myDetails.forEach(item => { let qty = 0; if (item.totalQuantity !== undefined && item.totalQuantity !== null) qty = Number(item.totalQuantity); else if (item.quantity !== undefined && item.quantity !== null) qty = Number(item.quantity); else if (item.qty !== undefined && item.qty !== null) qty = Number(item.qty); exportData.push({ '項次': item.sequence || '', '項目名稱': item.name || '', '說明(廠牌/型號)': `${item.brand || ''} ${item.model || ''}`.trim(), '單位': item.unit || '', '數量': qty, '供應商報價(單價)': '', '小計(複價)': '', '備註': '' }); }); } }); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(exportData); ws['!cols'] = [ {wch: 15}, {wch: 30}, {wch: 25}, {wch: 8}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 20} ]; XLSX.utils.book_append_sheet(wb, ws, "詢價單"); const filename = `${selectedProject.name}_${selectedTender.name}_詢價單.xlsx`; XLSX.writeFile(wb, filename); } catch (error) { console.error("匯出失敗:", error); showAlert("匯出失敗: " + error.message, 'error'); } }
};
