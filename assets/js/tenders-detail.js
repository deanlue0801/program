/**
 * 標單詳情頁面 (tenders/detail.js) (SPA 版本) - v2.0 階層式列表
 */
function initTenderDetailPage() {

    // --- 頁面狀態管理 ---
    let currentTender = null;
    let currentProject = null;
    let majorItems = [];
    let detailItems = [];
    let tenderId = null;

    const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

    // --- 初始化與資料讀取 ---
    async function init() {
        if (!getTenderIdFromUrl()) return;

        try {
            showLoading(true);
            const tenderDoc = await db.collection('tenders').doc(tenderId).get();
            if (!tenderDoc.exists || tenderDoc.data().createdBy !== currentUser.email) {
                showAlert('找不到指定的標單或無權限查看', 'error');
                return navigateTo('/program/tenders/list');
            }
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };

            const [projectData, majorItemsData, detailItemsData] = await Promise.all([
                loadProjectData(),
                loadMajorItems(),
                loadDetailItems()
            ]);
            
            currentProject = projectData;
            majorItems = majorItemsData;
            detailItems = detailItemsData;
            
            renderPageLayout();
            setupEventListeners();
            
        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
            showAlert('載入資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function getTenderIdFromUrl() {
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            navigateTo('/program/tenders/list');
            return false;
        }
        return true;
    }

    async function loadProjectData() {
        if (!currentTender.projectId) return null;
        const projectDoc = await db.collection('projects').doc(currentTender.projectId).get();
        return projectDoc.exists ? { id: projectDoc.id, ...projectDoc.data() } : null;
    }

    async function loadMajorItems() {
        const result = await safeFirestoreQuery('majorItems',
            [{ field: 'tenderId', operator: '==', value: tenderId }],
            { field: 'sequence', direction: 'asc' }
        );
        return result.docs;
    }

    async function loadDetailItems() {
        if (majorItems.length === 0) return [];
        const majorItemIds = majorItems.map(item => item.id);
        const detailPromises = [];
        for (let i = 0; i < majorItemIds.length; i += 10) {
            const chunk = majorItemIds.slice(i, i + 10);
            detailPromises.push(safeFirestoreQuery('detailItems', [{ field: 'majorItemId', operator: 'in', value: chunk }]));
        }
        const detailChunks = await Promise.all(detailPromises);
        const allDetails = detailChunks.flatMap(chunk => chunk.docs);
        allDetails.sort(naturalSequenceSort);
        return allDetails;
    }

    // --- 核心渲染函數 ---
    function renderPageLayout() {
        renderTenderHeader();
        renderItemsList();
    }

    function renderTenderHeader() {
        const container = document.getElementById('tender-header-container');
        const originalAmount = detailItems.filter(d => !d.isAddition).reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = detailItems.filter(d => d.isAddition).reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;
        
        container.innerHTML = `
            <div class="tender-header-card">
                <div class="tender-info-item">
                    <div class="label">標單名稱</div>
                    <div class="value large">${currentTender.name}</div>
                    <div class="sub-value">${currentProject ? currentProject.name : '未歸屬專案'}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">原始合約金額</div>
                    <div class="value">${formatCurrency(originalAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">追加金額</div>
                    <div class="value">${formatCurrency(additionAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">目前總金額</div>
                    <div class="value">${formatCurrency(totalAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">進度百分比</div>
                    <div class="value">0%</div>
                </div>
            </div>
        `;
    }

    function renderItemsList() {
        const container = document.getElementById('items-list-container');
        if (majorItems.length === 0) {
            container.innerHTML = '<p>此標單尚無工程主項目。</p>';
            return;
        }

        let listHtml = `
            <div class="list-actions">
                <h3>原始項目 (不可修改)</h3>
                <div>
                    <button id="expand-all-btn" class="btn btn-secondary">全部展開</button>
                    <a href="/program/tenders/edit?id=${tenderId}" data-route class="btn btn-primary">✏️ 編輯追加減</a>
                </div>
            </div>
        `;

        majorItems.forEach((majorItem, index) => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            const detailsCount = detailsInMajor.length;
            const majorAmount = detailsInMajor.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const itemNumber = romanNumerals[index + 1] || (index + 1);

            listHtml += `
                <div class="major-item-wrapper">
                    <div class="major-item-row" data-major-id="${majorItem.id}">
                        <div class="item-number-circle">${itemNumber}</div>
                        <div class="item-name">${majorItem.name}</div>
                        <div class="item-analysis">
                            <span>${detailsCount} 項</span>
                            <span class="amount">${formatCurrency(majorAmount)}</span>
                        </div>
                        <div class="item-expand-icon">▶</div>
                    </div>
                    <div class="detail-items-container" id="details-for-${majorItem.id}">
                        ${renderDetailTable(detailsInMajor)}
                    </div>
                </div>
            `;
        });

        container.innerHTML = listHtml;
    }

    function renderDetailTable(details) {
        if (details.length === 0) return '<p style="padding: 15px;">此項目無細項資料。</p>';
        
        let tableHtml = `
            <table class="detail-items-table">
                <thead>
                    <tr>
                        <th>項次</th>
                        <th>項目名稱</th>
                        <th>單位</th>
                        <th class="number-cell">數量</th>
                        <th class="number-cell">單價</th>
                        <th class="number-cell">小計</th>
                    </tr>
                </thead>
                <tbody>
        `;
        details.forEach(item => {
            tableHtml += `
                <tr>
                    <td>${item.sequence}</td>
                    <td>${item.name}</td>
                    <td>${item.unit}</td>
                    <td class="number-cell">${item.totalQuantity || 0}</td>
                    <td class="number-cell">${formatCurrency(item.unitPrice)}</td>
                    <td class="number-cell">${formatCurrency(item.totalPrice)}</td>
                </tr>
            `;
        });
        tableHtml += '</tbody></table>';
        return tableHtml;
    }

    // --- 事件監聽 ---
    function setupEventListeners() {
        const container = document.getElementById('items-list-container');
        if (!container) return;
        
        let allExpanded = false;

        container.addEventListener('click', (event) => {
            const majorRow = event.target.closest('.major-item-row');
            const expandAllBtn = event.target.closest('#expand-all-btn');

            if (majorRow) {
                const majorId = majorRow.dataset.majorId;
                majorRow.classList.toggle('expanded');
                document.getElementById(`details-for-${majorId}`).classList.toggle('expanded');
            }
            
            if (expandAllBtn) {
                allExpanded = !allExpanded;
                document.querySelectorAll('.major-item-row').forEach(row => row.classList.toggle('expanded', allExpanded));
                document.querySelectorAll('.detail-items-container').forEach(cont => cont.classList.toggle('expanded', allExpanded));
                expandAllBtn.textContent = allExpanded ? '全部收合' : '全部展開';
            }
        });
    }

    // --- 通用輔助函數 ---
    function showLoading(isLoading) {
        document.getElementById('loading').style.display = isLoading ? 'flex' : 'none';
        document.getElementById('mainContent').style.display = isLoading ? 'none' : 'block';
    }

    function naturalSequenceSort(a, b) {
        const re = /(\d+(\.\d+)?)|(\D+)/g;
        const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[];
        for(let i=0; i<Math.min(pA.length, pB.length); i++) {
            const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]);
            if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;}
            else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]);
        }
        return pA.length-pB.length;
    }
    
    // --- 啟動點 ---
    init();
}
