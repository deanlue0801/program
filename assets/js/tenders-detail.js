/**
 * 標單詳情頁 (tenders-detail.js) (SPA 版本) - v4.4 (表格欄位最終修正版)
 */
function initTenderDetailPage() {
    
    // --- 全域變數 ---
    let tenderId, projectId;
    let currentTender, currentProject;
    let majorItems = [], detailItems = [], allAdditionItems = [];
    let allMajorItemsExpanded = false;

    // --- 初始化 ---
    async function initializePage() {
        console.log("🚀 初始化標單詳情頁面 (v4.4)...");
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
            await loadTenderAndProjectDetails();
            await loadMajorAndDetailItems();
            await loadAllAdditionItems();

            renderPage();
            setupEventListeners();

        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
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
                { field: 'projectId', operator: '==', value: currentProject.id }
            ]),
            safeFirestoreQuery('detailItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id }
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
                    <div class="detail-items-summary" id="details-${majorItem.id}"></div>
                </div>`;
        }).join('');
    }

    function renderInfoTab() { /* ... */ }

    // --- 【核心修正】重寫此函數，以符合您要的欄位順序 ---
    function buildDetailItemsTable(majorId) {
        const items = detailItems.filter(item => item.majorItemId === majorId);
        if (items.length === 0) {
            return '<p class="empty-state" style="padding: 20px;">此大項尚無細項</p>';
        }

        const rows = items.map(item => {
            // 計算總數量 (合約數量 + 追加減數量)
            const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id);
            const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
            const totalQuantity = (item.totalQuantity || 0) + additionalQuantity;
            
            // 按照您指定的順序排列欄位
            return `
                <tr>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name || '未命名'}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                    <td class="text-right"><strong>${totalQuantity}</strong></td>
                </tr>`;
        }).join('');

        // 產生符合您要求的表頭
        return `
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 10%;">項次</th>
                        <th style="width: 50%;">項目名稱</th>
                        <th style="width: 10%;">單位</th>
                        <th class="text-right" style="width: 15%;">單價</th>
                        <th class="text-right" style="width: 15%;">數量</th>
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
        refreshMajorItems: async () => { /* ... */ }
    };

    initializePage();
}
