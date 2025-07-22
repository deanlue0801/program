/**
 * 標單詳情頁 (tenders-detail.js) (SPA 版本) - v4.3 (執行順序最終修正版)
 */
function initTenderDetailPage() {
    
    // --- 全域變數 ---
    let tenderId, projectId;
    let currentTender, currentProject;
    let majorItems = [], detailItems = [], allAdditionItems = [];
    let allMajorItemsExpanded = false; // 用於追蹤全部展開/收合的狀態

    // --- 初始化 ---
    async function initializePage() {
        console.log("🚀 初始化標單詳情頁面 (v4.3)...");
        ({ tenderId, projectId } = getUrlParams());
        
        if (!tenderId || !projectId) {
            showAlert('錯誤：URL 中缺少標單或專案 ID', 'error');
            return; 
        }
        await loadAllData();
    }
    
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            tenderId: params.get('tenderId'), 
            projectId: params.get('projectId')
        };
    }

    // --- 資料載入 ---
    async function loadAllData() {
        showLoading(true);
        try {
            // 【核心修正】將 Promise.all 拆開，確保執行順序
            // 步驟 1: 先載入主要的標單和專案資料
            await loadTenderAndProjectDetails();

            // 步驟 2: 成功載入後，再繼續載入依賴於專案ID的子集合
            await loadMajorAndDetailItems();
            
            // 步驟 3: 最後載入附加項，這不影響主要顯示
            await loadAllAdditionItems();

            // 所有資料都備妥後，才開始渲染畫面和綁定事件
            renderPage();
            setupEventListeners();

        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
            // 將錯誤訊息顯示在畫面上，而不是只用 alert
            const mainContent = document.getElementById('mainContent');
            if(mainContent) {
                mainContent.innerHTML = `<div class="empty-state"><div class="icon">🚫</div><h3>頁面載入失敗</h3><p>${error.message}</p><a href="/program/tenders/list" data-route class="btn btn-primary">返回列表</a></div>`;
                mainContent.style.display = 'block';
            }
        } finally {
            showLoading(false);
        }
    }

    async function loadTenderAndProjectDetails() {
        const [tenderDoc, projectDoc] = await Promise.all([
            db.collection("tenders").doc(tenderId).get(),
            db.collection("projects").doc(projectId).get()
        ]);
        if (!tenderDoc.exists || !projectDoc.exists) {
            throw new Error('找不到指定的標單或專案');
        }
        currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
        currentProject = { id: projectDoc.id, ...projectDoc.data() };
    }

    async function loadMajorAndDetailItems() {
        const [majorItemsResult, detailItemsResult] = await Promise.all([
            safeFirestoreQuery('majorItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id } // 此時 currentProject.id 必定存在
            ]),
            safeFirestoreQuery('detailItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id } // 此時 currentProject.id 必定存在
            ])
        ]);
        
        majorItems = majorItemsResult.docs.sort(naturalSequenceSort);
        detailItems = detailItemsResult.docs.sort(naturalSequenceSort);
    }
    
    async function loadAllAdditionItems() {
        try {
            const result = await safeFirestoreQuery('detailItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id },
                { field: 'isAddition', operator: '==', value: true }
            ]);
            allAdditionItems = result.docs;
        } catch (error) {
            console.error("載入所有附加項失敗:", error);
        }
    }

    // --- DOM 渲染 ---
    function renderPage() {
        renderHeader();
        renderStats();
        renderMajorItemsList();
        renderInfoTab();
    }

    function renderHeader() {
        document.getElementById('tenderName').textContent = currentTender.name;
        document.getElementById('tenderCode').textContent = `編號: ${currentTender.code || 'N/A'}`;
        document.getElementById('projectName').textContent = `專案: ${currentProject.name}`;
        document.getElementById('createdInfo').textContent = `建立於: ${formatDate(currentTender.createdAt)}`;
        
        const statusBadge = document.getElementById('statusBadge');
        statusBadge.textContent = getStatusText(currentTender.status);
        statusBadge.className = `status-badge status-${currentTender.status || 'planning'}`;

        // 設定按鈕連結
        document.getElementById('editBtn').href = `/program/tenders/edit?id=${tenderId}`;
        document.getElementById('importBtn').href = `/program/tenders/import?tenderId=${tenderId}&projectId=${projectId}`;
        document.getElementById('distributionBtn').href = `/program/tenders/distribution?tenderId=${tenderId}&projectId=${projectId}`;
    }
    
    function renderStats() {
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = allAdditionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        
        document.getElementById('totalAmount').textContent = formatCurrency(originalAmount + additionAmount);
        document.getElementById('majorItemsCount').textContent = majorItems.length;
        document.getElementById('detailItemsCount').textContent = detailItems.length;
        // 其他統計數據...
    }

    function renderMajorItemsList() {
        const container = document.getElementById('majorItemsList');
        const emptyState = document.getElementById('emptyMajorItemsState');
        if (majorItems.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        container.innerHTML = majorItems.map(majorItem => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            return `
                <div class="major-item-card">
                    <div class="major-item-header" data-major-id="${majorItem.id}">
                        <h4>${majorItem.sequence || ''}. ${majorItem.name}</h4>
                        <div class="major-item-meta">
                            <span>細項數: ${detailsInMajor.length}</span>
                            <span>合約金額: ${formatCurrency(detailsInMajor.reduce((s, i) => s + (i.totalPrice || 0), 0))}</span>
                        </div>
                    </div>
                    <div class="detail-items-summary" id="details-${majorItem.id}">
                        </div>
                </div>`;
        }).join('');
    }

    function renderInfoTab() {
        // ... 填充詳細資訊 Tab 的內容 ...
    }

    function buildDetailItemsTable(majorId) {
        const items = detailItems.filter(item => item.majorItemId === majorId);
        if (items.length === 0) {
            return '<p class="empty-state" style="padding: 20px;">此大項尚無細項</p>';
        }

        const rows = items.map(item => {
            const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id);
            const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
            const totalQuantity = (item.totalQuantity || 0) + additionalQuantity;
            return `
                <tr>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name || '未命名'}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                    <td class="text-right">${item.totalQuantity || 0}</td>
                    <td class="text-right ${additionalQuantity !== 0 ? (additionalQuantity > 0 ? 'text-success' : 'text-danger') : ''}">${additionalQuantity}</td>
                    <td class="text-right"><strong>${totalQuantity}</strong></td>
                </tr>`;
        }).join('');

        return `
            <table class="distribution-table detail-view-table">
                <thead>
                    <tr>
                        <th style="width: 80px;">項次</th>
                        <th>項目名稱</th>
                        <th>單位</th>
                        <th class="text-right">單價</th>
                        <th class="text-right">合約數量</th>
                        <th class="text-right">追加減數量</th>
                        <th class="text-right">總數量</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // --- 事件監聽與處理 ---
    function setupEventListeners() {
        const majorItemsList = document.getElementById('majorItemsList');
        if (majorItemsList) {
            majorItemsList.addEventListener('click', (event) => {
                const header = event.target.closest('.major-item-header');
                if (header) {
                    toggleMajorItemDetails(header.dataset.majorId);
                }
            });
        }
    }

    function toggleMajorItemDetails(majorId) {
        const detailsContainer = document.getElementById(`details-${majorId}`);
        if (!detailsContainer) return;
        
        const isExpanded = detailsContainer.classList.contains('expanded');
        if (isExpanded) {
            detailsContainer.innerHTML = '';
            detailsContainer.classList.remove('expanded');
        } else {
            detailsContainer.innerHTML = buildDetailItemsTable(majorId);
            detailsContainer.classList.add('expanded');
        }
    }
    
    // --- 輔助函式 ---
    function showLoading(isLoading) {
        document.getElementById('loading').style.display = isLoading ? 'flex' : 'none';
        document.getElementById('mainContent').style.display = isLoading ? 'none' : 'block';
    }
    function showAlert(message, type = 'info') { alert(`[${type.toUpperCase()}] ${message}`); }
    function getStatusText(status) { const map = { 'planning': '規劃中', 'bidding': '招標中', 'awarded': '得標', 'active': '進行中', 'completed': '已完成', 'paused': '暫停' }; return map[status] || '未設定'; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[]; const pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }

    // 將需要在 HTML 中呼叫的函數暴露到 window 物件
    window.exposedFunctions = {
        switchTab: (tabName) => {
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
            event.target.classList.add('active');
        },
        toggleAllMajorItems: () => {
            allMajorItemsExpanded = !allMajorItemsExpanded;
            document.getElementById('toggleMajorText').textContent = allMajorItemsExpanded ? '收合全部' : '展開全部';
            document.querySelectorAll('.major-item-header').forEach(header => {
                const detailsContainer = document.getElementById(`details-${header.dataset.majorId}`);
                if (allMajorItemsExpanded) {
                    if (!detailsContainer.classList.contains('expanded')) toggleMajorItemDetails(header.dataset.majorId);
                } else {
                    if (detailsContainer.classList.contains('expanded')) toggleMajorItemDetails(header.dataset.majorId);
                }
            });
        },
        refreshMajorItems: async () => {
            showLoading(true);
            try {
                await loadMajorAndDetailItems();
                await loadAllAdditionItems();
                renderMajorItemsList();
            } catch (error) {
                showAlert('重新載入失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    };

    initializePage();
}
