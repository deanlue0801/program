/**
 * 編輯標單頁面 (tenders-edit.js) - v5.0 最終修正版
 */
function initTenderEditPage() {
    // --- 頁面級別變數 ---
    let tenderId, currentTender, majorItems = [], detailItems = [], additionItems = [];
    let allExpanded = true; 

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
        const increasePercentage = originalAmount > 0 ? ((additionAmount / originalAmount) * 100).toFixed(2) : 0;

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
                    <div class="label">追加總金額</div>
                    <div class="value warning">${formatCurrency(additionAmount)}</div>
                </div>
                <div class="tender-info-item">
                    <div class="label">目前總金額</div>
                    <div class="value success">${formatCurrency(totalAmount)}</div>
                </div>
                 <div class="tender-info-item">
                    <div class="label">增幅百分比</div>
                    <div class="value">${increasePercentage}%</div>
                </div>
            </div>
        `;
    }

    function renderMajorItemsList() {
        const container = document.getElementById('items-list-container');
        let html = `
            <div class="list-actions">
                <h3>原始項目 (不可修改)</h3>
                <button id="expand-all-btn" class="btn btn-secondary">${allExpanded ? '全部收合' : '全部展開'}</button>
            </div>
        `;
        majorItems.forEach((majorItem) => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            const itemNumber = majorItem.sequence || 'N/A';
            html += `
                <div class="major-item-wrapper">
                    <div class="major-item-row ${allExpanded ? 'expanded' : ''}" data-major-id="${majorItem.id}">
                        <div class="item-number-circle">${itemNumber}</div>
                        <div class="item-name">${majorItem.name}</div>
                        <div class="item-analysis">
                            <span>${detailsInMajor.length} 項</span>
                            <span class="amount">${formatCurrency(detailsInMajor.reduce((s, i) => s + (i.totalPrice || 0), 0))}</span>
                        </div>
                        <div class="item-expand-icon">▶</div>
                    </div>
                    <div class="detail-items-container ${allExpanded ? 'expanded' : ''}" id="details-for-${majorItem.id}">
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
            
            const quantityDisplay = additionalQuantity > 0 
                ? `${originalQuantity + additionalQuantity} <span class="addition-info-text">(+${additionalQuantity})</span>`
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
                    <td class="action-cell"><button class="btn btn-sm btn-primary" data-action="add-addition" data-item-id="${item.id}">追加</button></td>
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
                    <td>${add.additionDate || formatDate(add.createdAt)}</td>
                    <td>${relatedItem ? relatedItem.name : '未知項目'}</td>
                    <td class="number-cell">${add.totalQuantity || 0}</td>
                    <td class="number-cell">${formatCurrency(add.unitPrice)}</td>
                    <td>${add.reason || ''}</td>
                    <td>${add.notes || ''}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-warning" data-action="edit-addition" data-addition-id="${add.id}">編輯</button>
                        <button class="btn btn-sm btn-danger" data-action="delete-addition" data-addition-id="${add.id}">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
        html += `
            <table class="detail-items-table">
                <thead><tr><th>追加日期</th><th>關聯項目</th><th class="number-cell">追加數量</th><th class="number-cell">追加單價</th><th>追加原因</th><th>備註</th><th class="action-cell">操作</th></tr></thead>
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
                    summarizedItems[add.relatedItemId] = { name: originalItem.name, unit: originalItem.unit, originalQty: originalItem.totalQuantity || 0, additionalQty: 0 };
                }
            }
            if (summarizedItems[add.relatedItemId]) {
                summarizedItems[add.relatedItemId].additionalQty += (add.totalQuantity || 0);
            }
        });

        if (Object.keys(summarizedItems).length === 0) {
            summaryContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">無追加項目可供統計。</div>';
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
                majorRow.classList.toggle('expanded');
                majorRow.nextElementSibling.classList.toggle('expanded');
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
                const { action, itemId, additionId } = actionButton.dataset;
                if (action === 'add-addition') showAdditionModal(itemId);
                if (action === 'edit-addition') editAddition(additionId);
                if (action === 'delete-addition') deleteAddition(additionId);
            }
        });
        
        const modal = document.getElementById('additionModal');
        if (modal) {
            modal.querySelector('[data-action="close-modal"]').onclick = () => { modal.style.display = "none"; };
            document.getElementById('additionForm').onsubmit = handleAdditionSubmit;
        }
    }
    
    // --- Modal 邏輯 ---
    function populateRelatedItemsDropdown(selectedId = null) {
        const select = document.getElementById('relatedDetailItem');
        select.innerHTML = '<option value="">請選擇...</option>';
        majorItems.forEach(major => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = major.name;
            const detailsInMajor = detailItems.filter(d => d.majorItemId === major.id);
            detailsInMajor.forEach(detail => {
                const option = document.createElement('option');
                option.value = detail.id;
                option.textContent = `${detail.sequence}. ${detail.name}`;
                option.dataset.unitPrice = detail.unitPrice || 0;
                if (detail.id === selectedId) {
                    option.selected = true;
                }
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        });
    }

    function showAdditionModal(relatedItemId = null) {
        const modal = document.getElementById('additionModal');
        if(!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = '';
        document.getElementById('modalTitle').textContent = '新增追加項目';
        
        populateRelatedItemsDropdown(relatedItemId);
        
        const select = document.getElementById('relatedDetailItem');
        select.onchange = () => {
            const selectedOption = select.options[select.selectedIndex];
            document.getElementById('additionUnitPrice').value = selectedOption.dataset.unitPrice || 0;
        };
        if (relatedItemId) {
            select.onchange(); // 觸發一次以填入單價
        }
        
        document.getElementById('additionDate').value = new Date().toISOString().slice(0, 10);
        modal.style.display = 'block';
    }

    function editAddition(additionId) {
        const item = additionItems.find(a => a.id === additionId);
        if (!item) return showAlert('找不到要編輯的項目', 'error');
        
        const modal = document.getElementById('additionModal');
        if(!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = item.id;
        document.getElementById('modalTitle').textContent = '編輯追加項目';

        populateRelatedItemsDropdown(item.relatedItemId);
        document.getElementById('additionDate').value = item.additionDate || '';
        document.getElementById('additionQuantity').value = item.totalQuantity || '';
        document.getElementById('additionUnitPrice').value = item.unitPrice || '';
        document.getElementById('additionReason').value = item.reason || '';
        document.getElementById('additionNotes').value = item.notes || '';
        
        modal.style.display = 'block';
    }

    async function performDbAction(action, data = null) {
        const expandedIds = getExpandedState();
        try {
            await action(data);
            await init(); // 重新載入所有資料並渲染
            restoreExpandedState(expandedIds); // 恢復展開狀態
            showAlert('操作成功！', 'success');
        } catch (error) {
            showAlert(`操作失敗: ${error.message}`, 'error');
        }
    }

    async function deleteAddition(additionId) {
        if (!confirm('確定要刪除這筆追加項目嗎？此操作無法復原。')) return;
        await performDbAction(() => db.collection('detailItems').doc(additionId).delete());
    }

    async function handleAdditionSubmit(event) {
        event.preventDefault();
        const editId = document.getElementById('editAdditionId').value;
        const relatedItemId = document.getElementById('relatedDetailItem').value;
        if (!relatedItemId) { showAlert('請選擇一個關聯項目', 'error'); return; }

        const quantity = parseFloat(document.getElementById('additionQuantity').value);
        const unitPrice = parseFloat(document.getElementById('additionUnitPrice').value);
        if (isNaN(quantity) || isNaN(unitPrice)) { showAlert('請輸入有效的數量和單價', 'error'); return; }
        
        const data = {
            tenderId,
            relatedItemId,
            majorItemId: detailItems.find(d => d.id === relatedItemId)?.majorItemId || null,
            isAddition: true,
            totalQuantity: quantity,
            unitPrice,
            totalPrice: quantity * unitPrice,
            additionDate: document.getElementById('additionDate').value,
            reason: document.getElementById('additionReason').value.trim(),
            notes: document.getElementById('additionNotes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        document.getElementById('additionModal').style.display = "none";

        if (editId) {
            await performDbAction(() => db.collection('detailItems').doc(editId).update(data));
        } else {
            data.createdBy = currentUser.email;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await performDbAction(() => db.collection('detailItems').add(data));
        }
    }
    
    // --- 輔助函數 ---
    function getExpandedState() {
        const ids = new Set();
        document.querySelectorAll('.major-item-row.expanded').forEach(r => ids.add(r.dataset.majorId));
        return ids;
    }

    function restoreExpandedState(ids) {
        ids.forEach(id => {
            const row = document.querySelector(`.major-item-row[data-major-id="${id}"]`);
            if (row) {
                row.classList.add('expanded');
                row.nextElementSibling.classList.add('expanded');
            }
        });
    }
    
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
