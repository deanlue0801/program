/**
 * 編輯標單頁面 (tenders/edit.js) (SPA 版本) - 功能完整移植版
 */
function initTenderEditPage() {
    let tenderId = null;
    let currentTender = null;
    let majorItems = [];
    let detailItems = [];

    // --- 主要初始化函數 ---
    async function init() {
        showLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        tenderId = urlParams.get('id');

        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            navigateTo('/program/tenders/list');
            return;
        }

        try {
            // 並行載入所有需要的資料
            const [tenderDoc, majorItemsResult, detailItemsResult] = await Promise.all([
                db.collection('tenders').doc(tenderId).get(),
                safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }], { field: 'sequence', direction: 'asc' }),
                safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }])
            ]);

            // 檢查標單是否存在
            if (!tenderDoc.exists) {
                throw new Error('找不到指定的標單');
            }
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            majorItems = majorItemsResult.docs;
            detailItems = detailItemsResult.docs.sort(naturalSequenceSort);

            // 渲染頁面
            renderTenderInfo();
            renderHierarchicalItems();
            
            showLoading(false);

        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    // --- 畫面渲染函數 ---

    function renderTenderInfo() {
        // 【修正處】使用 querySelector 來尋找 class，而不是 ID
        const pageTitleEl = document.querySelector('.page-title');
        const pageSubtitleEl = document.querySelector('.page-subtitle');
        
        if (pageTitleEl) pageTitleEl.textContent = `📋 標單編輯: ${currentTender.name}`;
        if (pageSubtitleEl) pageSubtitleEl.textContent = `專案: ${currentTender.projectName || '未指定'}`;
        
        // 以下使用 ID 的部分是正確的，因為 HTML 中有這些 ID
        document.getElementById('infoTenderName').textContent = currentTender.name || 'N/A';
        document.getElementById('infoContractorName').textContent = currentTender.contractorName || 'N/A';
        document.getElementById('infoOriginalAmount').textContent = formatCurrency(currentTender.totalAmount);
    }

    function renderHierarchicalItems() {
        const container = document.getElementById('hierarchicalItemsContainer');
        if (!container) return;

        if (majorItems.length === 0) {
            container.innerHTML = '<div style="padding: 2rem; text-align: center;">此標單沒有工程項目</div>';
            return;
        }

        let html = '';
        majorItems.forEach(major => {
            const itemsInMajor = detailItems.filter(detail => detail.majorItemId === major.id);
            html += `
                <div class="major-item-container">
                    <div class="major-item-header" onclick="toggleMajorItem('${major.id}')">
                        <div class="major-item-left">
                            <span id="toggle-${major.id}" class="major-item-toggle">▼</span>
                            <span>${major.name}</span>
                        </div>
                    </div>
                    <div class="detail-items-container" id="details-${major.id}">
                        ${itemsInMajor.map(detail => renderDetailItem(detail)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function renderDetailItem(item) {
        return `
            <div class="detail-item">
                <div class="item-status"></div>
                <div>${item.sequence || ''}</div>
                <div class="item-name">${item.name || ''}</div>
                <div>${item.unit || ''}</div>
                <div>${item.totalQuantity || 0}</div>
                <div class="item-price">${formatCurrency(item.unitPrice)}</div>
                <div class="item-total">${formatCurrency(item.totalPrice)}</div>
                <div></div>
                <div></div>
            </div>
        `;
    }

    // --- UI 互動與輔助函數 ---

    function showLoading(isLoading) {
        const loadingEl = document.getElementById('loading');
        const contentEl = document.getElementById('editTenderContent');
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (contentEl) contentEl.style.display = isLoading ? 'none' : 'block';
    }
    
    // 將需要在 HTML onclick 中呼叫的函數暴露到全局
    window.toggleMajorItem = (majorItemId) => {
        const container = document.getElementById('details-' + majorItemId);
        const icon = document.getElementById('toggle-' + majorItemId);
        if (container && icon) {
            container.classList.toggle('collapsed');
            icon.textContent = container.classList.contains('collapsed') ? '▶' : '▼';
        }
    };
    
    // --- 自然排序函數 ---
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

    // 啟動頁面邏輯
    init();
}
