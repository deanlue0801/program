/**
 * 標單詳情頁面 (tenders-detail.js) - v2.3 修正數量與總價為0的問題
 */
function initTenderDetailPage() {

    // --- 頁面狀態管理 ---
    let currentTender = null;
    let currentProject = null;
    let majorItems = [];
    let detailItems = [];
    let distributionData = [];
    let tenderId = null;
    let allMajorExpanded = false;

    const statusText = {
        'planning': '規劃中', 'active': '進行中', 'completed': '已完成',
        'paused': '暫停', 'bidding': '招標中', 'awarded': '得標'
    };

    // --- 資料讀取 ---

    function getTenderIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        tenderId = urlParams.get('id') || urlParams.get('tenderId');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            navigateTo('/program/tenders/list');
            return false;
        }
        return true;
    }

    async function loadAllData() {
        if (!getTenderIdFromUrl()) return;
        try {
            showLoading('載入標單資料...');
            const tenderDoc = await db.collection('tenders').doc(tenderId).get();
            if (!tenderDoc.exists || tenderDoc.data().createdBy !== currentUser.email) {
                showAlert('找不到指定的標單或無權限查看', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            await loadProjectData();
            await loadMajorAndDetailItems();
            await loadDistributionData();
            renderAllData();
            showMainContent();
        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
            showAlert('載入資料失敗: ' + error.message, 'error');
            showMainContent();
        }
    }

    async function loadProjectData() {
        if (!currentTender.projectId) { currentProject = null; return; }
        try {
            const projectDoc = await db.collection('projects').doc(currentTender.projectId).get();
            currentProject = projectDoc.exists ? { id: projectDoc.id, ...projectDoc.data() } : null;
        } catch (error) {
            console.warn('載入專案資料失敗:', error);
            currentProject = null;
        }
    }
    
    /**
     * 【核心修正】
     * 修正 majorItems 和 detailItems 的資料處理，
     * 從 Firestore 的 DocumentSnapshot 中正確提取資料。
     */
    async function loadMajorAndDetailItems() {
        const majorItemsResult = await safeFirestoreQuery('majorItems',
            [{ field: 'tenderId', operator: '==', value: tenderId }]
        );
        // 【修正】使用 .map(doc => ({...})) 來解包資料
        majorItems = majorItemsResult.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        majorItems.sort(naturalSequenceSort);

        if (majorItems.length === 0) { detailItems = []; return; }
        const majorItemIds = majorItems.map(item => item.id);
        const detailPromises = [];
        // Firestore 'in' 查詢每次最多10個
        for (let i = 0; i < majorItemIds.length; i += 10) {
            const chunk = majorItemIds.slice(i, i + 10);
            detailPromises.push(safeFirestoreQuery('detailItems', [{ field: 'majorItemId', operator: 'in', value: chunk }]));
        }
        const detailChunks = await Promise.all(detailPromises);
        // 【修正】使用 .flatMap(chunk => chunk.docs.map(...)) 來解包所有細項資料
        detailItems = detailChunks.flatMap(chunk => chunk.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        detailItems.sort(naturalSequenceSort);
    }

    /**
     * 【核心修正】
     * 修正 distributionData 的資料處理，確保能正確讀取分配數量。
     */
    async function loadDistributionData() {
        if (detailItems.length === 0) { distributionData = []; return; }
        const detailItemIds = detailItems.map(item => item.id);
        const distPromises = [];
        // Firestore 'in' 查詢每次最多10個
        for (let i = 0; i < detailItemIds.length; i += 10) {
            const chunk = detailItemIds.slice(i, i + 10);
            distPromises.push(safeFirestoreQuery('distributionTable', [{ field: 'detailItemId', operator: 'in', value: chunk }]));
        }
        const distChunks = await Promise.all(distPromises);
         // 【修正】使用 .flatMap(chunk => chunk.docs.map(...)) 來解包所有分配資料
        distributionData = distChunks.flatMap(chunk => chunk.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }

    // --- 畫面渲染與計算 ---
    function renderAllData() {
        renderTenderHeader();
        renderStatistics();
        renderOverviewTab();
        renderMajorItemsTab();
        renderInfoTab();
    }

    function renderTenderHeader() {
        const projectName = currentProject ? currentProject.name : '未知專案';
        const statusClass = `status-${currentTender.status || 'planning'}`;
        const statusLabel = statusText[currentTender.status] || currentTender.status;
        document.getElementById('tenderName').textContent = currentTender.name || '未命名標單';
        document.getElementById('tenderCode').textContent = currentTender.code || '-';
        document.getElementById('projectName').textContent = projectName;
        document.getElementById('createdInfo').textContent = `建立於 ${formatDate(currentTender.createdAt)} by ${currentTender.createdBy || '未知'}`;
        const statusBadge = document.getElementById('statusBadge');
        statusBadge.textContent = statusLabel;
        statusBadge.className = `status-badge ${statusClass}`;
        const editBtn = document.getElementById('editBtn');
        const importBtn = document.getElementById('importBtn');
        const distBtn = document.getElementById('distributionBtn');
        if (editBtn) editBtn.href = `/program/tenders/edit?id=${tenderId}`;
        if (importBtn) importBtn.href = `/program/tenders/import?tenderId=${tenderId}`;
        if (distBtn) distBtn.href = `/program/tenders/distribution?tenderId=${tenderId}`;
    }

    function renderStatistics() {
        const totalAmount = currentTender.totalAmount || 0;
        const majorItemsCount = majorItems.length;
        const detailItemsCount = detailItems.length;
        const distributedMajorItems = calculateDistributedMajorItems();
        const distributionProgress = majorItemsCount > 0 ? (distributedMajorItems / majorItemsCount) * 100 : 0;
        document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
        document.getElementById('majorItemsCount').textContent = majorItemsCount;
        document.getElementById('detailItemsCount').textContent = detailItemsCount;
        document.getElementById('overallProgress').textContent = `0%`; // 暫不計算
        document.getElementById('distributionProgress').textContent = `${Math.round(distributionProgress)}%`;
        document.getElementById('billingAmount').textContent = formatCurrency(0); // 暫不計算
    }

    function renderOverviewTab() {
        const distributedMajorItems = calculateDistributedMajorItems();
        const undistributedMajorItems = majorItems.length - distributedMajorItems;
        const distributionAreas = calculateDistributionAreas();
        document.getElementById('distributedMajorItems').textContent = distributedMajorItems;
        document.getElementById('undistributedMajorItems').textContent = undistributedMajorItems;
        document.getElementById('distributionAreas').textContent = distributionAreas;
        document.getElementById('overviewStartDate').textContent = formatDate(currentTender.startDate);
        document.getElementById('overviewEndDate').textContent = formatDate(currentTender.endDate);
        document.getElementById('executedDays').textContent = calculateExecutedDays();
        document.getElementById('remainingDays').textContent = calculateRemainingDays();
    }
    
    function renderMajorItemsTab() {
        const container = document.getElementById('majorItemsList');
        const emptyState = document.getElementById('emptyMajorItemsState');
        if (majorItems.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        container.innerHTML = '';
        majorItems.forEach(majorItem => container.appendChild(createMajorItemCard(majorItem)));
    }

    function createMajorItemCard(majorItem) {
        const relatedDetails = detailItems.filter(item => item.majorItemId === majorItem.id);
        const relatedDistributions = distributionData.filter(dist => relatedDetails.some(detail => detail.id === dist.detailItemId));
        const distributionProgress = calculateMajorItemDistributionProgress(majorItem);
        const totalDetails = relatedDetails.length;
        const majorItemDiv = document.createElement('div');
        majorItemDiv.className = 'major-item-card';
        majorItemDiv.id = `major-item-${majorItem.id}`;
        majorItemDiv.innerHTML = `
            <div class="major-item-header">
                <div class="major-item-title">
                    <div class="major-item-info">
                        <h4>${majorItem.sequence || 'N/A'}. ${majorItem.name || '未命名大項目'}</h4>
                        <div class="major-item-meta">
                            <span>📋 ${totalDetails} 個細項</span>
                            <span>🔧 ${new Set(relatedDistributions.map(d => d.detailItemId)).size} 已分配細項</span>
                            <span>📊 狀態: ${statusText[majorItem.status] || majorItem.status || '未設定'}</span>
                        </div>
                    </div>
                    <div class="major-item-amount">${formatCurrency(majorItem.amount || 0)}</div>
                </div>
                <div class="major-item-progress">
                    <div class="progress-item"><div class="progress-value">${Math.round(distributionProgress)}%</div><div class="progress-label">分配進度</div></div>
                    <div class="progress-item"><div class="progress-value">0%</div><div class="progress-label">執行進度</div></div>
                    <div class="progress-item"><div class="progress-value">0%</div><div class="progress-label">完成進度</div></div>
                </div>
                <div class="major-item-actions">
                    <button class="btn btn-warning" onclick="window.exposedFunctions.goToDistribution('${majorItem.id}')">🔧 設定分配</button>
                    <button class="btn btn-secondary" onclick="window.exposedFunctions.toggleMajorItemSummary('${majorItem.id}')">👁️ 細項預覽</button>
                    <button class="btn btn-info" onclick="window.exposedFunctions.toggleDetailItemsTable(this, '${majorItem.id}')">📄 展開細項</button>
                </div>
            </div>
            <div class="detail-items-summary" id="summary-${majorItem.id}">${createDetailItemsSummary(relatedDetails, relatedDistributions)}</div>
            <div class="detail-items-table-container" id="table-container-${majorItem.id}" style="display:none;"></div>`;
        return majorItemDiv;
    }

    async function toggleDetailItemsTable(button, majorItemId) {
        const tableContainer = document.getElementById(`table-container-${majorItemId}`);
        const isOpening = tableContainer.style.display === 'none';
        
        button.textContent = isOpening ? '收合細項' : '展開細項';
        tableContainer.style.display = isOpening ? 'block' : 'none';

        if (isOpening && !tableContainer.dataset.loaded) {
            tableContainer.innerHTML = '<div class="loading-small" style="padding: 2rem; text-align: center;">載入細項表格中...</div>';
            const relatedDetails = detailItems.filter(item => item.majorItemId === majorItemId);
            const table = createDetailItemsTable(relatedDetails);
            tableContainer.innerHTML = '';
            tableContainer.appendChild(table);
            tableContainer.dataset.loaded = 'true';
        }
    }

    function createDetailItemsTable(details) {
        const table = document.createElement('table');
        table.className = 'distribution-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 5%;">項次</th>
                    <th style="width: 40%;">項目名稱</th>
                    <th style="width: 10%;">單位</th>
                    <th style="width: 10%;">數量</th>
                    <th style="width: 15%;">單價</th>
                    <th style="width: 15%;">總價</th>
                    <th style="width: 10%;">進度追蹤</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        if (details.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">無細項資料</td></tr>';
        } else {
            details.forEach(item => {
                const row = tbody.insertRow();
                row.dataset.id = item.id;
                // 【第 253 行：修正】將 item.quantity 改為 item.totalQuantity
                const quantity = parseFloat(item.totalQuantity) || 0;
                const unitPrice = parseFloat(item.unitPrice) || 0;
                row.innerHTML = `
                    <td>${item.sequence || ''}</td>
                    <td>${item.name || ''}</td>
                    <td>${item.unit || ''}</td>
                    <td>${quantity}</td>
                    <td>${unitPrice.toLocaleString()}</td>
                    <td>${(quantity * unitPrice).toLocaleString()}</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" class="progress-tracking-toggle">
                            <span class="slider"></span>
                        </label>
                    </td>
                `;
                const toggle = row.querySelector('.progress-tracking-toggle');
                toggle.checked = !item.excludeFromProgress;
                toggle.addEventListener('change', handleProgressTrackingToggle);
            });
        }
        return table;
    }

    async function handleProgressTrackingToggle(event) {
        const toggle = event.target;
        const row = toggle.closest('tr');
        if (!row) return;
        const detailItemId = row.dataset.id;
        const exclude = !toggle.checked;
        toggle.disabled = true;
        try {
            await db.collection('detailItems').doc(detailItemId).update({ excludeFromProgress: exclude });
            const itemInModel = detailItems.find(item => item.id === detailItemId);
            if(itemInModel) itemInModel.excludeFromProgress = exclude;
        } catch (error) {
            showAlert(`更新追蹤狀態失敗: ${error.message}`, 'error');
            toggle.checked = !exclude;
        } finally {
            toggle.disabled = false;
        }
    }

    function createDetailItemsSummary(details, distributions) {
        if (details.length === 0) return '<div class="empty-state" style="padding:1rem"><p>此大項目尚無細項</p></div>';
        
        // 【第 303 行：修正】將 item.quantity 改為 item.totalQuantity
        const totalQuantity = details.reduce((sum, item) => sum + (parseFloat(item.totalQuantity) || 0), 0);
        const totalAmount = details.reduce((sum, item) => sum + ((parseFloat(item.totalQuantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);
        
        const distributedQuantity = distributions.reduce((sum, dist) => sum + (parseFloat(dist.quantity) || 0), 0);
        const distributedAmount = distributions.reduce((sum, dist) => {
             const detail = details.find(d => d.id === dist.detailItemId);
             const unitPrice = detail ? (parseFloat(detail.unitPrice) || 0) : 0;
             return sum + ((parseFloat(dist.quantity) || 0) * unitPrice);
        }, 0);

        return `<div class="summary-grid">
             <div><div>${details.length}</div><div>細項總數</div></div>
             <div><div>${totalQuantity}</div><div>總數量</div></div>
             <div><div>${formatCurrency(totalAmount)}</div><div>總金額</div></div>
             <div><div>${distributedQuantity}</div><div>已分配數量</div></div>
             <div><div>${formatCurrency(distributedAmount)}</div><div>已分配金額</div></div>
             <div><div>${Math.round((distributedQuantity / (totalQuantity || 1)) * 100)}%</div><div>分配進度</div></div>
         </div>`;
    }

    function renderInfoTab() {
        document.getElementById('infoTenderCode').textContent = currentTender.code || '-';
        document.getElementById('infoProjectName').textContent = currentProject ? currentProject.name : '未知專案';
        document.getElementById('infoStatus').textContent = statusText[currentTender.status] || currentTender.status;
        document.getElementById('infoStartDate').textContent = formatDate(currentTender.startDate);
        document.getElementById('infoEndDate').textContent = formatDate(currentTender.endDate);
        document.getElementById('infoContractorName').textContent = currentTender.contractorName || '-';
        document.getElementById('infoContractorContact').textContent = currentTender.contractorContact || '-';
        document.getElementById('infoCreatedBy').textContent = currentTender.createdBy || '-';
        document.getElementById('infoCreatedAt').textContent = formatDateTime(currentTender.createdAt);
        document.getElementById('infoUpdatedAt').textContent = formatDateTime(currentTender.updatedAt);
        const amount = currentTender.totalAmount || 0;
        const tax = amount * 0.05; 
        const subtotal = amount - tax;
        document.getElementById('infoAmount').textContent = formatCurrency(subtotal);
        document.getElementById('infoTax').textContent = formatCurrency(tax);
        document.getElementById('infoTotalAmount').textContent = formatCurrency(amount);
        document.getElementById('infoDescription').textContent = currentTender.description || '-';
        document.getElementById('infoNotes').textContent = currentTender.notes || '-';
    }

    function calculateDistributedMajorItems() {
        const distributedMajorItemIds = new Set(distributionData.map(dist => {
            const detail = detailItems.find(item => item.id === dist.detailItemId);
            return detail ? detail.majorItemId : null;
        }).filter(Boolean));
        return distributedMajorItemIds.size;
    }

    function calculateDistributionAreas() {
        return new Set(distributionData.map(dist => dist.areaName).filter(Boolean)).size;
    }

    function calculateMajorItemDistributionProgress(majorItem) {
        const majorItemId = majorItem.id;
        const relatedDetails = detailItems.filter(item => item.majorItemId === majorItemId);
        if (relatedDetails.length === 0) return 0;

        const totalQuantity = relatedDetails.reduce((sum, item) => sum + (parseFloat(item.totalQuantity) || 0), 0);
        if (totalQuantity === 0) return 100;

        const relatedDetailIds = new Set(relatedDetails.map(item => item.id));
        const relatedDistributions = distributionData.filter(dist => relatedDetailIds.has(dist.detailItemId));
        const distributedQuantity = relatedDistributions.reduce((sum, dist) => sum + (parseFloat(dist.quantity) || 0), 0);

        return (distributedQuantity / totalQuantity) * 100;
    }

    function calculateExecutedDays() {
        if (!currentTender.startDate) return 0;
        const startDate = currentTender.startDate.toDate ? currentTender.startDate.toDate() : new Date(currentTender.startDate);
        const today = new Date();
        if (startDate > today) return 0;
        return Math.ceil(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
    }

    function calculateRemainingDays() {
        if (!currentTender.endDate) return '-';
        const endDate = currentTender.endDate.toDate ? currentTender.endDate.toDate() : new Date(currentTender.endDate);
        const diffDays = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }

    // --- UI 互動事件 ---
    function switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector(`.tab-btn[onclick*="'${tabName}'"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
    }

    function toggleMajorItemSummary(majorItemId) {
        document.getElementById(`summary-${majorItemId}`)?.classList.toggle('expanded');
    }

    function toggleAllMajorItems() {
        allMajorExpanded = !allMajorExpanded;
        document.querySelectorAll('.detail-items-summary').forEach(summary => summary.classList.toggle('expanded', allMajorExpanded));
        document.getElementById('toggleMajorText').textContent = allMajorExpanded ? '收合全部' : '展開全部';
    }

    async function refreshMajorItems() {
        showAlert('重新載入中...', 'info');
        try {
            await loadMajorAndDetailItems();
            await loadDistributionData();
            renderMajorItemsTab();
            renderStatistics();
            showAlert('資料已更新', 'success');
        } catch (error) {
            console.error('重新載入失敗:', error);
            showAlert('重新載入失敗', 'error');
        }
    }

    function goToDistribution(majorItemId) {
        navigateTo(`/program/tenders/distribution?tenderId=${tenderId}&majorItemId=${majorItemId}`);
    }

    function showLoading(message = '載入中...') {
        const el = document.getElementById('loading');
        if (el) {
            el.style.display = 'flex';
            el.querySelector('p').textContent = message;
        }
    }

    function showMainContent() {
        const el = document.getElementById('mainContent');
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        if (el) el.style.display = 'block';
    }
    
    window.exposedFunctions = {
        switchTab,
        toggleAllMajorItems,
        refreshMajorItems,
        goToDistribution,
        toggleMajorItemSummary,
        toggleDetailItemsTable
    };

    loadAllData();
}

/**
 * 自然排序函式，能夠正確處理中文數字與天干地支。
 */
function naturalSequenceSort(a, b) {
    const CHINESE_NUM_MAP = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10
    };

    const re = /(\d+(\.\d+)?)|([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸])|(\D+)/g;
    const seqA = String(a.sequence || '');
    const seqB = String(b.sequence || '');
    const partsA = seqA.match(re) || [];
    const partsB = seqB.match(re) || [];
    const len = Math.min(partsA.length, partsB.length);

    for (let i = 0; i < len; i++) {
        const partA = partsA[i];
        const partB = partsB[i];

        // 嘗試解析為阿拉伯數字
        let numA = parseFloat(partA);
        let numB = parseFloat(partB);

        // 如果不是阿拉伯數字，嘗試解析為中文數字
        if (isNaN(numA)) numA = CHINESE_NUM_MAP[partA];
        if (isNaN(numB)) numB = CHINESE_NUM_MAP[partB];

        // 如果兩者都是數字 (無論是阿拉伯還是中文轉換的)
        if (numA !== undefined && numB !== undefined) {
            if (numA !== numB) return numA - numB;
        } else {
            // 如果其中一個不是數字，或兩者都不是，則進行文字比較
            const comparison = partA.localeCompare(partB);
            if (comparison !== 0) return comparison;
        }
    }
    return partsA.length - partsB.length;
}
