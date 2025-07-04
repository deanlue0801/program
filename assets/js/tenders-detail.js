/**
 * 標單詳情頁面 (tenders/detail.js) (SPA 版本) - 超級除錯模式
 * 由 router.js 呼叫 initTenderDetailPage() 函數來啟動
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

    window.detailItems = detailItems;
    window.distributionData = distributionData;

    const statusText = {
        'planning': '規劃中', 'active': '進行中', 'completed': '已完成',
        'paused': '暫停', 'bidding': '招標中', 'awarded': '得標'
    };

    // --- 資料讀取 ---

    function getTenderIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        tenderId = urlParams.get('id');
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
            console.log('✅ 標單詳情頁面載入完成');
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
        } catch (error) { console.warn('載入專案資料失敗:', error); currentProject = null; }
    }

    async function loadMajorAndDetailItems() {
        const majorItemsResult = await safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }]);
        majorItems = majorItemsResult.docs;
        if (majorItems.length === 0) { detailItems = []; window.detailItems = []; return; }
        const majorItemIds = majorItems.map(item => item.id);
        const detailPromises = [];
        for (let i = 0; i < majorItemIds.length; i += 10) {
            detailPromises.push(safeFirestoreQuery('detailItems', [{ field: 'majorItemId', operator: 'in', value: majorItemIds.slice(i, i + 10) }]));
        }
        const detailChunks = await Promise.all(detailPromises);
        detailItems = detailChunks.flatMap(chunk => chunk.docs).sort(naturalSequenceSort);
        window.detailItems = detailItems;
    }

    async function loadDistributionData() {
        if (detailItems.length === 0) { distributionData = []; window.distributionData = []; return; }
        const detailItemIds = detailItems.map(item => item.id);
        const distPromises = [];
        for (let i = 0; i < detailItemIds.length; i += 10) {
            distPromises.push(safeFirestoreQuery('distributionTable', [{ field: 'detailItemId', operator: 'in', value: detailItemIds.slice(i, i + 10) }]));
        }
        const distChunks = await Promise.all(distPromises);
        distributionData = distChunks.flatMap(chunk => chunk.docs);
        window.distributionData = distributionData;
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
        if(editBtn) editBtn.href = `/program/tenders/edit?id=${tenderId}`;
        if(importBtn) importBtn.href = `/program/tenders/import?tenderId=${tenderId}`;
        if(distBtn) distBtn.href = `/program/tenders/distribution?tenderId=${tenderId}`;
    }

    function renderStatistics() {
        const totalAmount = currentTender.totalAmount || 0;
        const majorItemsCount = majorItems.length;
        const detailItemsCount = detailItems.length;
        const distributedMajorItems = calculateDistributedMajorItems();
        const distributionProgress = majorItemsCount > 0 ? (distributedMajorItems / majorItemsCount) * 100 : 0;
        const overallProgress = 0;
        const billingAmount = totalAmount * (overallProgress / 100);
        document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
        document.getElementById('majorItemsCount').textContent = majorItemsCount;
        document.getElementById('detailItemsCount').textContent = detailItemsCount;
        document.getElementById('overallProgress').textContent = `${Math.round(overallProgress)}%`;
        document.getElementById('distributionProgress').textContent = `${Math.round(distributionProgress)}%`;
        document.getElementById('billingAmount').textContent = formatCurrency(billingAmount);
    }

    function renderOverviewTab() {
        const distributedMajorItems = calculateDistributedMajorItems();
        const undistributedMajorItems = majorItems.length - distributedMajorItems;
        const distributionAreas = calculateDistributionAreas();
        document.getElementById('executionProgress').textContent = '0%';
        document.getElementById('billingProgress').textContent = '0%';
        document.getElementById('equipmentCount').textContent = '0';
        document.getElementById('completedEquipment').textContent = '0';
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
        // 【修正處】傳入整個 majorItem 物件
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
                            <span>🔧 ${new Set(relatedDistributions.map(d=>d.detailItemId)).size} 已分配細項</span>
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
                </div>
            </div>
            <div class="detail-items-summary" id="summary-${majorItem.id}">${createDetailItemsSummary(relatedDetails, relatedDistributions)}</div>`;
        return majorItemDiv;
    }

    function createDetailItemsSummary(details, distributions) {
        if (details.length === 0) return '<div class="empty-state" style="padding:1rem"><p>此大項目尚無細項</p></div>';
        const totalQuantity = details.reduce((sum, item) => sum + (parseFloat(item.totalQuantity) || 0), 0);
        const totalAmount = details.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
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
        const tax = currentTender.tax || 0;
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

    // 【修正處】加入大量除錯日誌
    function calculateMajorItemDistributionProgress(majorItem) {
        const majorItemId = majorItem.id;
        const majorItemName = majorItem.name;

        console.group(`[DEBUG] Calculating progress for: "${majorItemName}"`);
        console.log(`Major Item ID: ${majorItemId}`);

        const relatedDetails = detailItems.filter(item => String(item.majorItemId).trim() === String(majorItemId).trim());
        if (relatedDetails.length === 0) {
            console.log("-> Step 1: No related detail items found. Progress is 0%.");
            console.groupEnd();
            return 0;
        }
        console.log(`-> Step 1: Found ${relatedDetails.length} related detail items.`);

        const totalQuantity = relatedDetails.reduce((sum, item) => sum + (parseFloat(item.totalQuantity) || 0), 0);
        console.log(`-> Step 2: Calculated Total Quantity = ${totalQuantity}`);

        if (totalQuantity === 0) {
            console.log("-> Total quantity is 0. Progress is 100%.");
            console.groupEnd();
            return 100;
        }

        const relatedDetailIds = new Set(relatedDetails.map(item => item.id));
        const relatedDistributions = distributionData.filter(dist => relatedDetailIds.has(String(dist.detailItemId).trim()));
        console.log(`-> Step 3: Found ${relatedDistributions.length} related distribution entries.`);

        if (relatedDistributions.length === 0) {
            console.log("-> No distribution entries found. Progress is 0%.");
            console.groupEnd();
            return 0;
        }

        const distributedQuantity = relatedDistributions.reduce((sum, dist) => sum + (parseFloat(dist.quantity) || 0), 0);
        console.log(`-> Step 4: Calculated Distributed Quantity = ${distributedQuantity}`);

        const progress = (distributedQuantity / totalQuantity) * 100;
        console.log(`-> Step 5: Final Progress = (${distributedQuantity} / ${totalQuantity}) * 100 = ${progress.toFixed(2)}%`);

        console.groupEnd();
        return progress;
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

    // --- 頁面跳轉 ---
    function goToDistribution(majorItemId) {
        navigateTo(`/program/tenders/distribution?tenderId=${tenderId}&majorItemId=${majorItemId}`);
    }

    function showLoading(message = '載入中...') {
        const el = document.getElementById('loading');
        if (el) el.style.display = 'flex';
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
        toggleMajorItemSummary
    };

    console.log("🚀 初始化標單詳情頁面...");
    loadAllData();
}

function naturalSequenceSort(a, b) {
    const seqA = String(a.sequence || '');
    const seqB = String(b.sequence || '');
    const re = /(\d+(\.\d+)?)|(\D+)/g;
    const partsA = seqA.match(re) || [];
    const partsB = seqB.match(re) || [];
    const len = Math.min(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const partA = partsA[i];
        const partB = partsB[i];
        const numA = parseFloat(partA);
        const numB = parseFloat(partB);
        if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) return numA - numB;
        } else {
            if (partA !== partB) return partA.localeCompare(partB);
        }
    }
    return partsA.length - partsB.length;
}

initTenderDetailPage();
