/**
 * 編輯標單頁面 (tenders-edit.js) - v6.2 修正 init 啟動錯誤
 */
function initTenderEditPage() {
    // --- 頁面級別變數 ---
    let tenderId, currentTender, majorItems = [], detailItems = [], additionItems = [];
    let allExpanded = true;

    // --- 渲染輔助函數 (*** 所有小功能先在這裡定義好 ***) ---
    function renderTenderHeader() {
        const container = document.getElementById('tender-header-container');
        if (!container) return;
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = additionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;
        const increasePercentage = originalAmount > 0 ? ((additionAmount / originalAmount) * 100).toFixed(2) : 0;
        container.innerHTML = `
            <div class="tender-header-card">
                <div class="tender-info-item"><div class="label">標單名稱</div><div class="value large">${currentTender.name}</div></div>
                <div class="tender-info-item"><div class="label">原始合約金額</div><div class="value">${formatCurrency(originalAmount)}</div></div>
                <div class="tender-info-item"><div class="label">追加總金額</div><div class="value warning">${formatCurrency(additionAmount)}</div></div>
                <div class="tender-info-item"><div class="label">目前總金額</div><div class="value success">${formatCurrency(totalAmount)}</div></div>
                 <div class="tender-info-item">
                    <div class="label">增幅百分比</div>
                    <div class="value">${increasePercentage}%</div>
                </div>
            </div>
        `;
    }

    function renderDetailTable(details) {
        if (details.length === 0) return '<div style="padding: 20px; text-align: center; color: #888;">此主項目下無細項資料。</div>';
        
        const rows = details.map(item => {
            const originalQuantity = item.totalQuantity || 0;
            const additions = additionItems.filter(add => add.relatedItemId === item.id);
            const additionalQuantity = additions.reduce((s, a) => s + (a.totalQuantity || 0), 0);
            
            let quantityDisplay;
            if (additionalQuantity > 0) {
                quantityDisplay = `${originalQuantity + additionalQuantity} <span style="color:var(--success-color); font-size:12px;">(+${additionalQuantity})</span>`;
            } else if (additionalQuantity < 0) {
                quantityDisplay = `${originalQuantity + additionalQuantity} <span style="color:var(--danger-color); font-size:12px;">(${additionalQuantity})</span>`;
            } else {
                quantityDisplay = originalQuantity;
            }

            let statusBarClass = '';
            if (additions.length > 0) statusBarClass = 'has-change';
            else if (originalQuantity === 0) statusBarClass = 'is-zero';

            return `
                <tr data-detail-item-id="${item.id}">
                    <td><div class="item-status-bar ${statusBarClass}"></div></td>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name}</td>
                    <td>${item.unit}</td>
                    <td class="number-cell">${originalQuantity}</td>
                    <td class="number-cell">${formatCurrency(item.unitPrice)}</td>
                    <td class="number-cell">${formatCurrency(item.totalPrice)}</td>
                    <td class="number-cell current-quantity-cell">${quantityDisplay}</td>
                    <td class="action-cell"><button class="btn btn-sm btn-primary" data-action="add-addition" data-item-id="${item.id}">變更</button></td>
                </tr>
            `;
        }).join('');

        return `
            <table class="detail-items-table">
                <thead><tr><th></th><th>項次</th><th>項目名稱</th><th>單位</th><th class="number-cell">數量</th><th class="number-cell">單價</th><th class="number-cell">小計</th><th class="number-cell">目前總數</th><th class="action-cell">操作</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderMajorItemsList() {
        const container = document.getElementById('items-list-container');
        if (!container) return;
        let html = `<div class="list-actions"><h3>原始項目 (不可修改)</h3><button id="expand-all-btn" class="btn btn-secondary">${allExpanded ? '全部收合' : '全部展開'}</button></div>`;
        majorItems.forEach((majorItem) => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            const itemNumber = majorItem.sequence || 'N/A';
            html += `<div class="major-item-wrapper"><div class="major-item-row ${allExpanded ? 'expanded' : ''}" data-major-id="${majorItem.id}"><div class="item-number-circle">${itemNumber}</div><div class="item-name">${majorItem.name}</div><div class="item-analysis"><span>${detailsInMajor.length} 項</span><span class="amount">${formatCurrency(detailsInMajor.reduce((s, i) => s + (i.totalPrice || 0), 0))}</span></div><div class="item-expand-icon">▶</div></div><div class="detail-items-container ${allExpanded ? 'expanded' : ''}" id="details-for-${majorItem.id}">${renderDetailTable(detailsInMajor)}</div></div>`;
        });
        container.innerHTML = html;
    }

    function renderAdditionItemsTable() {
        const container = document.getElementById('addition-details-container');
        if (!container) return;
        let html = `<h3>追加/追減明細</h3>`;
        if (additionItems.length === 0) { html += '<div style="padding: 20px; text-align: center; color: #888;">目前尚無變更項目。</div>'; container.innerHTML = html; return; }
        const rows = additionItems.map(add => {
            const relatedItem = detailItems.find(d => d.id === add.relatedItemId);
            const changeTypeClass = (add.totalQuantity || 0) >= 0 ? 'success' : 'danger';
            return `<tr><td>${add.additionDate || formatDate(add.createdAt)}</td><td>${relatedItem ? relatedItem.name : '未知項目'}</td><td class="number-cell" style="color:var(--${changeTypeClass}-color); font-weight:bold;">${add.totalQuantity || 0}</td><td class="number-cell">${formatCurrency(add.unitPrice)}</td><td>${add.reason || ''}</td><td>${add.notes || ''}</td><td class="action-cell"><button class="btn btn-sm btn-warning" data-action="edit-addition" data-addition-id="${add.id}">編輯</button><button class="btn btn-sm btn-danger" data-action="delete-addition" data-addition-id="${add.id}">刪除</button></td></tr>`;
        }).join('');
        html += `<table class="detail-items-table"><thead><tr><th>變更日期</th><th>關聯項目</th><th class="number-cell">變更數量</th><th class="number-cell">變更單價</th><th>變更原因</th><th>備註</th><th class="action-cell">操作</th></tr></thead><tbody>${rows}</tbody></table>`;
        container.innerHTML = html;
    }

    function renderSummaryCards() {
        const summaryContainer = document.getElementById('summaryGrid');
        if(!summaryContainer) return;
        const summarizedItems = {};
        additionItems.forEach(add => {
            if (!summarizedItems[add.relatedItemId]) {
                const originalItem = detailItems.find(d => d.id === add.relatedItemId);
                if (originalItem) summarizedItems[add.relatedItemId] = { name: originalItem.name, unit: originalItem.unit, originalQty: originalItem.totalQuantity || 0, additionalQty: 0 };
            }
            if (summarizedItems[add.relatedItemId]) summarizedItems[add.relatedItemId].additionalQty += (add.totalQuantity || 0);
        });
        if (Object.keys(summarizedItems).length === 0) { summaryContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">無變更項目可供統計。</div>'; return; }
        summaryContainer.innerHTML = Object.values(summarizedItems).map(summary => `<div class="summary-card"><div class="summary-item-name">${summary.name}</div><div class="summary-detail"><span>原始數量</span><span>${summary.originalQty} ${summary.unit || ''}</span></div><div class="summary-detail"><span>變更數量</span><span class="${summary.additionalQty >= 0 ? 'success' : 'danger'}">${summary.additionalQty > 0 ? '+' : ''}${summary.additionalQty} ${summary.unit || ''}</span></div><div class="summary-detail total"><span>目前總數</span><span>${summary.originalQty + summary.additionalQty} ${summary.unit || ''}</span></div></div>`).join('');
    }

    function renderPage() {
        renderTenderHeader();
        renderMajorItemsList();
        renderAdditionItemsTable();
        renderSummaryCards();
    }

    function updatePageAfterAction(relatedItemIdToUpdate = null) {
        renderTenderHeader();
        renderAdditionItemsTable();
        renderSummaryCards();
        if (relatedItemIdToUpdate) updateSingleDetailItemRow(relatedItemIdToUpdate);
    }

    function updateSingleDetailItemRow(detailItemId) {
        const item = detailItems.find(d => d.id === detailItemId);
        if (!item) return;
        const originalQuantity = item.totalQuantity || 0;
        const additions = additionItems.filter(add => add.relatedItemId === item.id);
        const additionalQuantity = additions.reduce((s, a) => s + (a.totalQuantity || 0), 0);
        let quantityDisplay = (additionalQuantity > 0) ? `${originalQuantity + additionalQuantity} <span style="color:var(--success-color); font-size:12px;">(+${additionalQuantity})</span>` : (additionalQuantity < 0) ? `${originalQuantity + additionalQuantity} <span style="color:var(--danger-color); font-size:12px;">(${additionalQuantity})</span>` : originalQuantity;
        const row = document.querySelector(`tr[data-detail-item-id="${item.id}"]`);
        if(!row) return;
        const statusBar = row.querySelector('.item-status-bar');
        const quantityCell = row.querySelector('.current-quantity-cell');
        if (statusBar) {
            statusBar.className = 'item-status-bar';
            if(additions.length > 0) statusBar.classList.add('has-change');
            else if(originalQuantity === 0) statusBar.classList.add('is-zero');
        }
        if (quantityCell) quantityCell.innerHTML = quantityDisplay;
    }
    
    function populateRelatedItemsDropdown(selectedId = null) {
        const select = document.getElementById('relatedDetailItem');
        select.innerHTML = '<option value="">請選擇...</option>';
        majorItems.forEach(major => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `--- ${major.name} ---`;
            const detailsInMajor = detailItems.filter(d => d.majorItemId === major.id);
            detailsInMajor.forEach(detail => {
                const option = document.createElement('option');
                option.value = detail.id;
                option.textContent = `${detail.sequence}. ${detail.name}`;
                option.dataset.unitPrice = detail.unitPrice || 0;
                if (detail.id === selectedId) option.selected = true;
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
        document.getElementById('modalTitle').textContent = '新增項目數量變更';
        populateRelatedItemsDropdown(relatedItemId);
        const select = document.getElementById('relatedDetailItem');
        select.onchange = () => {
            const selectedOption = select.options[select.selectedIndex];
            document.getElementById('additionUnitPrice').value = selectedOption.dataset.unitPrice || 0;
        };
        if (relatedItemId) { select.value = relatedItemId; select.onchange(); }
        document.getElementById('additionDate').value = new Date().toISOString().slice(0, 10);
        modal.style.display = 'block';
    }

    function editAddition(additionId) {
        const item = additionItems.find(a => a.id === additionId);
        if (!item) { showAlert('找不到要編輯的項目', 'error'); return; }
        const modal = document.getElementById('additionModal');
        if(!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = item.id;
        document.getElementById('modalTitle').textContent = '編輯項目數量變更';
        populateRelatedItemsDropdown(item.relatedItemId);
        document.getElementById('additionDate').value = item.additionDate || '';
        document.getElementById('additionQuantity').value = item.totalQuantity || '';
        document.getElementById('additionUnitPrice').value = item.unitPrice || '';
        document.getElementById('additionReason').value = item.reason || '';
        document.getElementById('additionNotes').value = item.notes || '';
        modal.style.display = 'block';
    }
    
    async function handleAdditionSubmit(event) {
        event.preventDefault();
        const editId = document.getElementById('editAdditionId').value;
        const relatedItemId = document.getElementById('relatedDetailItem').value;
        if (!relatedItemId) { showAlert('請選擇一個關聯項目', 'error'); return; }
        const quantity = parseFloat(document.getElementById('additionQuantity').value);
        if (isNaN(quantity)) { showAlert('請輸入有效的變更數量', 'error'); return; }
        const unitPrice = parseFloat(document.getElementById('additionUnitPrice').value);
        if (isNaN(unitPrice) || unitPrice < 0) { showAlert('請輸入有效的單價', 'error'); return; }
        const data = {
            tenderId, relatedItemId, isAddition: true, totalQuantity: quantity, unitPrice,
            totalPrice: quantity * unitPrice,
            additionDate: document.getElementById('additionDate').value,
            reason: document.getElementById('additionReason').value.trim(),
            notes: document.getElementById('additionNotes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        document.getElementById('additionModal').style.display = "none";
        showLoading(true);
        try {
            if (editId) {
                await db.collection('detailItems').doc(editId).update(data);
                const index = additionItems.findIndex(item => item.id === editId);
                if (index > -1) additionItems[index] = { ...additionItems[index], ...data };
            } else {
                data.createdBy = currentUser.email;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const docRef = await db.collection('detailItems').add(data);
                additionItems.unshift({ id: docRef.id, ...data });
            }
            updatePageAfterAction(relatedItemId);
            showAlert('儲存成功！', 'success');
        } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } 
        finally { showLoading(false); }
    }
    
    async function deleteAddition(additionId) {
        if (!confirm('確定要刪除這筆變更項目嗎？此操作無法復原。')) return;
        const deletedItem = additionItems.find(item => item.id === additionId);
        if (!deletedItem) return;
        showLoading(true);
        try {
            await db.collection('detailItems').doc(additionId).delete();
            additionItems = additionItems.filter(item => item.id !== additionId);
            updatePageAfterAction(deletedItem.relatedItemId);
            showAlert('刪除成功', 'success');
        } catch (error) { showAlert('刪除失敗: ' + error.message, 'error'); }
        finally { showLoading(false); }
    }
    
    function setupEventListeners() {
        const content = document.getElementById('editTenderContent');
        if (!content) return;
        content.addEventListener('click', (event) => {
            const target = event.target;
            const majorRow = target.closest('.major-item-row');
            const actionButton = target.closest('button[data-action]');
            const expandAllBtn = target.closest('#expand-all-btn');
            if (majorRow) { majorRow.classList.toggle('expanded'); majorRow.nextElementSibling.classList.toggle('expanded'); return; }
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
            modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => { btn.onclick = () => { modal.style.display = "none"; }; });
            document.getElementById('additionForm').onsubmit = handleAdditionSubmit;
        }
    }

    function showLoading(isLoading) { document.getElementById('loading').style.display = isLoading ? 'flex' : 'none'; document.getElementById('editTenderContent').style.display = isLoading ? 'none' : 'block'; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length-pB.length; }
    
    // --- 頁面啟動點 (*** 將所有啟動邏輯都包在 init 函數中 ***) ---
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
    
    // *** 最終執行啟動點 ***
    init();
}
