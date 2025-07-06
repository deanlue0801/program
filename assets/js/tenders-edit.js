/**
 * 編輯標單頁面 (tenders-edit.js) - v4.3 修正追加後維持展開狀態
 */
function initTenderEditPage() {
    // --- 頁面級別變數 ---
    let tenderId, currentTender, majorItems = [], detailItems = [], additionItems = [];
    let allExpanded = false;

    // --- 主流程 ---
    async function init() {
        showLoading(true);
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            return navigateTo('/program/tenders/list');
        }

        try {
            await loadAllData();
            renderPage();
            setupEventListeners();
        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    // --- 資料載入 ---
    async function loadAllData() {
        const tenderDoc = await db.collection('tenders').doc(tenderId).get();
        if (!tenderDoc.exists) throw new Error('找不到指定的標單');
        currentTender = { id: tenderDoc.id, ...tenderDoc.data() };

        const [majorItemsData, allDetailItemsData] = await Promise.all([
            safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }]),
            safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }])
        ]);

        majorItems = majorItemsData.docs.sort(naturalSequenceSort);
        detailItems = allDetailItemsData.docs.filter(item => !item.isAddition).sort(naturalSequenceSort);
        additionItems = allDetailItemsData.docs.filter(item => item.isAddition).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
    }
    
    // --- 畫面渲染 ---
    function renderPage() {
        renderTenderHeader();
        renderMajorItemsList();
        renderAdditionItemsTable();
        renderSummaryCards();
    }

    function renderTenderHeader() {
        const container = document.getElementById('tender-header-container');
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = additionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;

        container.innerHTML = `
            <div class="tender-header-card">
                <div class="tender-info-item">
                    <div class="label">標單名稱</div>
                    <div class="value large">${currentTender.name}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">原始合約金額</div>
                    <div class="value">${formatCurrency(originalAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">追加金額</div>
                    <div class="value warning">${formatCurrency(additionAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">目前總金額</div>
                    <div class="value success">${formatCurrency(totalAmount)}</div>
                </div>
            </div>
        `;
    }

    function renderMajorItemsList() {
        const container = document.getElementById('items-list-container');
        let html = `
            <div class="list-actions">
                <h3>原始項目</h3>
                <button id="expand-all-btn" class="btn btn-secondary">全部展開</button>
            </div>
        `;
        majorItems.forEach((majorItem) => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            const itemNumber = majorItem.sequence || 'N/A';

            html += `
                <div class="major-item-wrapper">
                    <div class="major-item-row" data-major-id="${majorItem.id}">
                        <div class="item-number-circle">${itemNumber}</div>
                        <div class="item-name">${majorItem.name}</div>
                        <div class="item-analysis">
                            <span>${detailsInMajor.length} 項</span>
                            <span class="amount">${formatCurrency(detailsInMajor.reduce((s, i) => s + (i.totalPrice || 0), 0))}</span>
                        </div>
                        <div class="item-expand-icon">▶</div>
                    </div>
                    <div class="detail-items-container" id="details-for-${majorItem.id}">
                        ${renderDetailTable(detailsInMajor)}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    
    function renderDetailTable(details) {
        if (details.length === 0) return '<div style="padding: 20px; text-align: center; color: #888;">此主項目下無細項資料。</div>';
        const rows = details.map(item => {
            const originalQuantity = item.totalQuantity || 0;
            const additions = additionItems.filter(add => add.relatedItemId === item.id);
            const additionalQuantity = additions.reduce((s, a) => s + (a.totalQuantity || 0), 0);
            const currentTotal = originalQuantity + additionalQuantity;

            const quantityDisplay = additionalQuantity > 0 
                ? `${currentTotal} (+${additionalQuantity})`
                : originalQuantity;

            return `
                <tr>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name}</td>
                    <td>${item.unit}</td>
                    <td class="number-cell">${originalQuantity}</td>
                    <td class="number-cell">${formatCurrency(item.unitPrice)}</td>
                    <td class="number-cell">${formatCurrency(item.totalPrice)}</td>
                    <td class="number-cell">${quantityDisplay}</td>
                    <td class="action-cell"><button class="btn btn-sm btn-primary" data-action="add-addition" data-item-id="${item.id}" data-item-name="${escape(item.name)}">追加</button></td>
                </tr>
            `;
        }).join('');

        return `
            <table class="detail-items-table">
                <thead><tr><th>項次</th><th>項目名稱</th><th>單位</th><th class="number-cell">數量</th><th class="number-cell">單價</th><th class="number-cell">小計</th><th class="number-cell">目前總數</th><th class="action-cell">操作</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderAdditionItemsTable() {
        const container = document.getElementById('addition-details-container');
        let html = `<h3>追加項目明細</h3>`;
        if (additionItems.length === 0) {
            html += '<div style="padding: 20px; text-align: center; color: #888;">目前尚無追加項目。</div>';
            container.innerHTML = html;
            return;
        }
        const rows = additionItems.map(add => {
            const relatedItem = detailItems.find(d => d.id === add.relatedItemId);
            return `
                <tr>
                    <td>${formatDate(add.createdAt)}</td>
                    <td>${relatedItem ? relatedItem.name : '未知項目'}</td>
                    <td class="number-cell">${add.totalQuantity || 0}</td>
                    <td class="number-cell">${formatCurrency(add.unitPrice)}</td>
                    <td>${add.reason || ''}</td>
                    <td>${add.status || '待核准'}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-warning" data-action="edit-addition" data-addition-id="${add.id}">編輯</button>
                        <button class="btn btn-sm btn-danger" data-action="delete-addition" data-addition-id="${add.id}">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
        html += `
            <table class="detail-items-table">
                <thead><tr><th>追加日期</th><th>關聯項目</th><th class="number-cell">追加數量</th><th class="number-cell">追加單價</th><th>追加原因</th><th>狀態</th><th class="action-cell">操作</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        container.innerHTML = html;
    }
    
    function renderSummaryCards() {
        const summaryContainer = document.getElementById('summaryGrid');
        if(!summaryContainer) return;
        
        const summarizedItems = {};
        additionItems.forEach(add => {
            if (!summarizedItems[add.relatedItemId]) {
                const originalItem = detailItems.find(d => d.id === add.relatedItemId);
                if (originalItem) {
                    summarizedItems[add.relatedItemId] = {
                        name: originalItem.name,
                        unit: originalItem.unit,
                        originalQty: originalItem.totalQuantity || 0,
                        additionalQty: 0,
                    };
                }
            }
            if (summarizedItems[add.relatedItemId]) {
                summarizedItems[add.relatedItemId].additionalQty += (add.totalQuantity || 0);
            }
        });

        if (Object.keys(summarizedItems).length === 0) {
            summaryContainer.innerHTML = '<div style="color: #888;">無追加項目可供統計。</div>';
            return;
        }

        summaryContainer.innerHTML = Object.values(summarizedItems).map(summary => `
            <div class="summary-card">
                <div class="summary-item-name">${summary.name}</div>
                <div class="summary-detail"><span>原始數量</span><span>${summary.originalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail"><span>追加數量</span><span class="addition">+${summary.additionalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail total"><span>目前總數</span><span>${summary.originalQty + summary.additionalQty} ${summary.unit || ''}</span></div>
            </div>
        `).join('');
    }

    // --- 事件處理 ---
    function setupEventListeners() {
        const content = document.getElementById('editTenderContent');
        if (!content) return;

        content.addEventListener('click', (event) => {
            const target = event.target;
            const majorRow = target.closest('.major-item-row');
            const actionButton = target.closest('button[data-action]');
            const expandAllBtn = target.closest('#expand-all-btn');

            if (majorRow) {
                const container = majorRow.nextElementSibling;
                majorRow.classList.toggle('expanded');
                container.classList.toggle('expanded');
                return;
            }

            if (expandAllBtn) {
                allExpanded = !allExpanded;
                document.querySelectorAll('.major-item-row').forEach(row => row.classList.toggle('expanded', allExpanded));
                document.querySelectorAll('.detail-items-container').forEach(cont => cont.classList.toggle('expanded', allExpanded));
                expandAllBtn.textContent = allExpanded ? '全部收合' : '全部展開';
                return;
            }

            if (actionButton) {
                const { action, itemId, itemName, additionId } = actionButton.dataset;
                if (action === 'add-addition') showAdditionModal(itemId, itemName);
                if (action === 'edit-addition') editAddition(additionId);
                if (action === 'delete-addition') deleteAddition(additionId);
                return;
            }
        });
        
        const modal = document.getElementById('additionModal');
        if (modal) {
            modal.querySelector('.modal-close').onclick = () => { modal.style.display = "none"; };
            document.getElementById('cancelAdditionBtn').onclick = () => { modal.style.display = "none"; };
            document.getElementById('additionForm').onsubmit = handleAdditionSubmit;
            window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };
        }
    }

    // --- Modal 邏輯 ---
    function showAdditionModal(itemId, itemName) {
        const modal = document.getElementById('additionModal');
        if(!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = '';
        document.getElementById('relatedItemId').value = itemId;
        document.getElementById('modalItemName').value = unescape(itemName);
        document.getElementById('modalTitle').textContent = '追加項目數量';
        modal.style.display = 'block';
    }

    function editAddition(additionId) {
        const item = additionItems.find(a => a.id === additionId);
        if (!item) return showAlert('找不到要編輯的項目', 'error');
        
        const relatedItem = detailItems.find(d => d.id === item.relatedItemId);
        if (!relatedItem) return showAlert('找不到關聯的原始項目', 'error');
        
        const modal = document.getElementById('additionModal');
        if(!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = item.id;
        document.getElementById('relatedItemId').value = item.relatedItemId;
        document.getElementById('modalItemName').value = relatedItem.name;
        document.getElementById('additionQuantity').value = item.totalQuantity;
        document.getElementById('additionReason').value = item.reason;
        document.getElementById('modalTitle').textContent = '編輯追加項目';
        modal.style.display = 'block';
    }

    async function deleteAddition(additionId) {
        if (!confirm('確定要刪除這筆追加項目嗎？此操作無法復原。')) return;
        try {
            await db.collection('detailItems').doc(additionId).delete();
            await init();
            showAlert('刪除成功', 'success');
        } catch (error) { 
            showAlert('刪除失敗: ' + error.message, 'error'); 
        }
    }

    async function handleAdditionSubmit(event) {
        event.preventDefault();

        // 【關鍵修正 1】: 在儲存前，記下哪些項目是展開的
        const expandedMajorIds = new Set();
        document.querySelectorAll('.major-item-row.expanded').forEach(row => {
            if (row.dataset.majorId) {
                expandedMajorIds.add(row.dataset.majorId);
            }
        });

        const relatedItemId = document.getElementById('relatedItemId').value;
        const editId = document.getElementById('editAdditionId').value;
        const relatedItem = detailItems.find(d => d.id === relatedItemId);
        if (!relatedItem) { showAlert('關聯項目不存在', 'error'); return; }

        const quantity = parseFloat(document.getElementById('additionQuantity').value);
        if (isNaN(quantity) || quantity <= 0) { showAlert('請輸入有效的追加數量', 'error'); return; }
        
        const data = {
            tenderId,
            majorItemId: relatedItem.majorItemId,
            relatedItemId: relatedItem.id,
            isAddition: true,
            totalQuantity: quantity,
            reason: document.getElementById('additionReason').value.trim(),
            unitPrice: relatedItem.unitPrice,
            totalPrice: (relatedItem.unitPrice || 0) * quantity,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: '待核准',
        };

        try {
            if (editId) {
                await db.collection('detailItems').doc(editId).update(data);
            } else {
                data.createdBy = currentUser.email;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('detailItems').add(data);
            }
            document.getElementById('additionModal').style.display = "none";
            
            // 【關鍵修正 2】: 重新載入和渲染
            await init();
            
            // 【關鍵修正 3】: 恢復之前展開的項目
            if (expandedMajorIds.size > 0) {
                expandedMajorIds.forEach(id => {
                    const row = document.querySelector(`.major-item-row[data-major-id="${id}"]`);
                    const container = document.getElementById(`details-for-${id}`);
                    if (row && container) {
                        row.classList.add('expanded');
                        container.classList.add('expanded');
                    }
                });
            }

            showAlert('儲存成功！', 'success');
        } catch (error) { 
            showAlert('儲存失敗: ' + error.message, 'error'); 
        }
    }
    
    // --- 其他輔助函數 ---
    function showLoading(isLoading) {
        document.getElementById('loading').style.display = isLoading ? 'flex' : 'none';
        document.getElementById('editTenderContent').style.display = isLoading ? 'none' : 'block';
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

    // 啟動頁面
    init();
}
