/**
 * 編輯標單頁面 (tenders-edit.js) - v7.2 (新增 Owner 管理者刪除與維護功能)
 */
function initTenderEditPage() {
    // --- 頁面級別變數 ---
    let tenderId, currentTender, currentProject, majorItems = [], detailItems = [], additionItems = [];
    let allExpanded = true, currentUserRole = null, currentUserPermissions = {};

    // --- 頁面啟動點 ---
    async function init() {
        showLoading(true);
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            return navigateTo('/program/tenders/list');
        }
        try {
            // 【權限守衛】載入資料並執行權限檢查
            if (!await loadDataAndCheckPermissions()) {
                showAlert('您沒有權限編輯此標單', 'error');
                return navigateTo('/program/tenders/list');
            }
            
            renderPage();
            setupEventListeners();
        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    // --- 資料載入與權限檢查 ---
    async function loadDataAndCheckPermissions() {
        const tenderDoc = await db.collection('tenders').doc(tenderId).get();
        if (!tenderDoc.exists) throw new Error('找不到指定的標單');
        currentTender = { id: tenderDoc.id, ...tenderDoc.data() };

        if (!currentTender.projectId) return false;

        const projectDoc = await db.collection('projects').doc(currentTender.projectId).get();
        if (!projectDoc.exists) return false;
        
        currentProject = { id: projectDoc.id, ...projectDoc.data() };
        
        const userEmail = auth.currentUser.email;
        const memberInfo = currentProject.members[userEmail];

        if (!memberInfo) return false;

        currentUserRole = memberInfo.role;
        currentUserPermissions = memberInfo.permissions || {};

        // 只有 owner 或 有 canAccessTenders 權限的 editor 才能進入
        if (currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders)) {
            const [majorItemsData, allDetailItemsData] = await Promise.all([
                safeFirestoreQuery('majorItems', [
                    { field: 'tenderId', operator: '==', value: tenderId },
                    { field: 'projectId', operator: '==', value: currentProject.id }
                ]),
                safeFirestoreQuery('detailItems', [
                    { field: 'tenderId', operator: '==', value: tenderId },
                    { field: 'projectId', operator: '==', value: currentProject.id }
                ])
            ]);
            majorItems = majorItemsData.docs.sort(naturalSequenceSort);
            detailItems = allDetailItemsData.docs.filter(item => !item.isAddition).sort(naturalSequenceSort);
            additionItems = allDetailItemsData.docs.filter(item => item.isAddition).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            return true;
        }

        return false;
    }

    // --- 畫面渲染 ---
    function renderTenderHeader() {
        const container = document.getElementById('tender-header-container');
        if (!container) return;

        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || item.amount || 0), 0);
        const additionAmount = additionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;
        const increasePercentage = originalAmount > 0 ? ((additionAmount / originalAmount) * 100).toFixed(2) : 0;

        // 若為 Owner，呈現管理者專屬控制項（如：刪除整份標單）
        const ownerControls = currentUserRole === 'owner' 
            ? `<button class="btn btn-sm btn-danger" id="delete-whole-tender-btn" style="margin-top:10px;">🗑️ 刪除整份標單 (管理者專用)</button>` 
            : '';

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
            ${ownerControls}
        `;
    }

    function renderDetailTable(details) {
        if (details.length === 0) return '<div style="padding: 20px; text-align: center; color: #888;">此主項目下無細項資料。</div>';

        const rows = details.map(item => {
            const originalQuantity = item.totalQuantity || item.quantity || 0;
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

            // 管理者專屬刪除按鈕
            const ownerDeleteBtn = currentUserRole === 'owner' 
                ? `<button class="btn btn-sm btn-outline-danger" data-action="delete-detail-item" data-item-id="${item.id}">刪除</button>` 
                : '';

            return `
                <tr data-detail-item-id="${item.id}">
                    <td><div class="item-status-bar ${statusBarClass}"></div></td>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name}</td>
                    <td>${item.unit || ''}</td>
                    <td class="number-cell">${originalQuantity}</td>
                    <td class="number-cell">${formatCurrency(item.unitPrice || 0)}</td>
                    <td class="number-cell">${formatCurrency(item.totalPrice || item.amount || 0)}</td>
                    <td class="number-cell current-quantity-cell">${quantityDisplay}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-primary" data-action="add-addition" data-item-id="${item.id}">變更</button>
                        ${ownerDeleteBtn}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="detail-items-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>項次</th>
                        <th>項目名稱</th>
                        <th>單位</th>
                        <th class="number-cell">數量</th>
                        <th class="number-cell">單價</th>
                        <th class="number-cell">小計</th>
                        <th class="number-cell">目前總數</th>
                        <th class="action-cell">操作</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderMajorItemsList() {
        const container = document.getElementById('items-list-container');
        if (!container) return;

        let html = `
            <div class="list-actions">
                <h3>原始項目 (項次與明細)</h3>
                <button id="expand-all-btn" class="btn btn-secondary">${allExpanded ? '全部收合' : '全部展開'}</button>
            </div>
        `;

        majorItems.forEach((majorItem) => {
            const detailsInMajor = detailItems.filter(d => d.majorItemId === majorItem.id);
            const itemNumber = majorItem.sequence || 'N/A';

            const ownerMajorDeleteBtn = currentUserRole === 'owner' 
                ? `<button class="btn btn-sm btn-outline-danger" data-action="delete-major-item" data-major-id="${majorItem.id}" style="margin-left: 10px;">刪除大項</button>` 
                : '';

            html += `
                <div class="major-item-wrapper">
                    <div class="major-item-row ${allExpanded ? 'expanded' : ''}" data-major-id="${majorItem.id}">
                        <div class="item-number-circle">${itemNumber}</div>
                        <div class="item-name">${majorItem.name}</div>
                        <div class="item-analysis">
                            <span>${detailsInMajor.length} 項</span>
                            <span class="amount">${formatCurrency(detailsInMajor.reduce((s, i) => s + (i.totalPrice || i.amount || 0), 0))}</span>
                            ${ownerMajorDeleteBtn}
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

    function renderAdditionItemsTable() {
        const container = document.getElementById('addition-details-container');
        if (!container) return;

        let html = `<h3>追加/追減明細</h3>`;
        if (additionItems.length === 0) {
            html += '<div style="padding: 20px; text-align: center; color: #888;">目前尚無變更項目。</div>';
            container.innerHTML = html;
            return;
        }

        const rows = additionItems.map(add => {
            const relatedItem = detailItems.find(d => d.id === add.relatedItemId);
            const changeTypeClass = (add.totalQuantity || 0) >= 0 ? 'success' : 'danger';
            return `
                <tr>
                    <td>${add.additionDate || formatDate(add.createdAt)}</td>
                    <td>${relatedItem ? relatedItem.name : '未知項目'}</td>
                    <td class="number-cell" style="color:var(--${changeTypeClass}-color); font-weight:bold;">${add.totalQuantity || 0}</td>
                    <td class="number-cell">${formatCurrency(add.unitPrice || 0)}</td>
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
                <thead>
                    <tr>
                        <th>變更日期</th>
                        <th>關聯項目</th>
                        <th class="number-cell">變更數量</th>
                        <th class="number-cell">變更單價</th>
                        <th>變更原因</th>
                        <th>備註</th>
                        <th class="action-cell">操作</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
        container.innerHTML = html;
    }

    function renderSummaryCards() {
        const summaryContainer = document.getElementById('summaryGrid');
        if (!summaryContainer) return;

        const summarizedItems = {};
        additionItems.forEach(add => {
            if (!summarizedItems[add.relatedItemId]) {
                const originalItem = detailItems.find(d => d.id === add.relatedItemId);
                if (originalItem) {
                    summarizedItems[add.relatedItemId] = {
                        name: originalItem.name,
                        unit: originalItem.unit,
                        originalQty: originalItem.totalQuantity || originalItem.quantity || 0,
                        additionalQty: 0
                    };
                }
            }
            if (summarizedItems[add.relatedItemId]) {
                summarizedItems[add.relatedItemId].additionalQty += (add.totalQuantity || 0);
            }
        });

        if (Object.keys(summarizedItems).length === 0) {
            summaryContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">無變更項目可供統計。</div>';
            return;
        }

        summaryContainer.innerHTML = Object.values(summarizedItems).map(summary => `
            <div class="summary-card">
                <div class="summary-item-name">${summary.name}</div>
                <div class="summary-detail"><span>原始數量</span><span>${summary.originalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail"><span>變更數量</span><span class="${summary.additionalQty >= 0 ? 'success' : 'danger'}">${summary.additionalQty > 0 ? '+' : ''}${summary.additionalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail total"><span>目前總數</span><span>${summary.originalQty + summary.additionalQty} ${summary.unit || ''}</span></div>
            </div>
        `).join('');
    }

    function renderPage() {
        renderTenderHeader();
        renderMajorItemsList();
        renderAdditionItemsTable();
        renderSummaryCards();
    }

    // --- 管理者刪除處理 ---
    async function handleDeleteDetailItem(itemId) {
        if (!confirm('確定要刪除此細項嗎？此操作不可復原。')) return;

        showLoading(true);
        try {
            await db.collection('detailItems').doc(itemId).delete();
            detailItems = detailItems.filter(item => item.id !== itemId);
            renderPage();
            showAlert('細項已刪除！', 'success');
        } catch (error) {
            console.error('刪除細項失敗:', error);
            showAlert('刪除失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function handleDeleteMajorItem(majorId) {
        const detailsInMajor = detailItems.filter(d => d.majorItemId === majorId);
        const confirmMsg = detailsInMajor.length > 0 
            ? `確定要刪除此大項目嗎？其下的 ${detailsInMajor.length} 個細項也會一併被刪除！` 
            : '確定要刪除此大項目嗎？';

        if (!confirm(confirmMsg)) return;

        showLoading(true);
        try {
            const batch = db.batch();
            
            // 刪除大項
            batch.delete(db.collection('majorItems').doc(majorId));
            
            // 批次刪除底下細項
            detailsInMajor.forEach(detail => {
                batch.delete(db.collection('detailItems').doc(detail.id));
            });

            await batch.commit();

            // 更新本機 Cache
            majorItems = majorItems.filter(m => m.id !== majorId);
            detailItems = detailItems.filter(d => d.majorItemId !== majorId);

            renderPage();
            showAlert('大項目及其細項已成功刪除！', 'success');
        } catch (error) {
            console.error('刪除大項失敗:', error);
            showAlert('刪除大項失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function handleDeleteWholeTender() {
        if (!confirm(`⚠️ 警告！您確定要【完全刪除】這份標單「${currentTender.name}」嗎？\n此動作將一併清理所有大項與細項，且無法復原！`)) return;

        showLoading(true, '正在刪除整份標單與項目...');
        try {
            const batches = [];
            let currentBatch = db.batch();
            let opCount = 0;

            // 1. 標單主文件
            currentBatch.delete(db.collection('tenders').doc(tenderId));
            opCount++;

            // 2. 所有大項
            majorItems.forEach(m => {
                currentBatch.delete(db.collection('majorItems').doc(m.id));
                opCount++;
                if (opCount >= 450) {
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch();
                    opCount = 0;
                }
            });

            // 3. 所有細項 (含變更單)
            const allDetails = [...detailItems, ...additionItems];
            allDetails.forEach(d => {
                currentBatch.delete(db.collection('detailItems').doc(d.id));
                opCount++;
                if (opCount >= 450) {
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch();
                    opCount = 0;
                }
            });

            if (opCount > 0) batches.push(currentBatch.commit());
            await Promise.all(batches);

            showAlert('標單已完全清理完畢', 'success');
            setTimeout(() => navigateTo('/program/tenders/list'), 1000);
        } catch (error) {
            console.error('刪除整份標單失敗:', error);
            showAlert('刪除整份標單失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // --- 事件綁定 ---
    function setupEventListeners() {
        const content = document.getElementById('editTenderContent');
        if (!content) return;

        content.addEventListener('click', (event) => {
            const target = event.target;
            const majorRow = target.closest('.major-item-row');
            const actionButton = target.closest('button[data-action]');
            const expandAllBtn = target.closest('#expand-all-btn');
            const deleteWholeBtn = target.closest('#delete-whole-tender-btn');

            if (deleteWholeBtn) {
                handleDeleteWholeTender();
                return;
            }

            if (majorRow && !target.dataset.action) {
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
                const { action, itemId, majorId, additionId } = actionButton.dataset;
                if (action === 'add-addition') showAdditionModal(itemId);
                if (action === 'edit-addition') editAddition(additionId);
                if (action === 'delete-addition') deleteAddition(additionId);
                
                // 新增的管理操作
                if (action === 'delete-detail-item') handleDeleteDetailItem(itemId);
                if (action === 'delete-major-item') handleDeleteMajorItem(majorId);
            }
        });

        const modal = document.getElementById('additionModal');
        if (modal) {
            modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
                btn.onclick = () => { modal.style.display = "none"; };
            });
            document.getElementById('additionForm').onsubmit = handleAdditionSubmit;
        }
    }

    // --- 追加減與輔助函式 ---
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
            projectId: currentProject.id,
            tenderId, 
            relatedItemId, 
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
        showLoading(true);
        try {
            if (editId) {
                await db.collection('detailItems').doc(editId).update(data);
                const index = additionItems.findIndex(item => item.id === editId);
                if (index > -1) additionItems[index] = { ...additionItems[index], ...data };
            } else {
                data.createdBy = auth.currentUser.email;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const docRef = await db.collection('detailItems').add(data);
                additionItems.unshift({ id: docRef.id, ...data });
            }
            renderPage();
            showAlert('儲存成功！', 'success');
        } catch (error) { 
            console.error("❌ 儲存變更失敗:", error);
            showAlert('儲存失敗: ' + error.message, 'error'); 
        } finally { 
            showLoading(false); 
        }
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
        if (!modal) return;
        document.getElementById('additionForm').reset();
        document.getElementById('editAdditionId').value = '';
        document.getElementById('modalTitle').textContent = '新增項目數量變更';
        populateRelatedItemsDropdown(relatedItemId);
        const select = document.getElementById('relatedDetailItem');
        select.onchange = () => {
            const selectedOption = select.options[select.selectedIndex];
            document.getElementById('additionUnitPrice').value = selectedOption ? (selectedOption.dataset.unitPrice || 0) : 0;
        };
        if (relatedItemId) {
            select.value = relatedItemId;
            select.onchange();
        }
        document.getElementById('additionDate').value = new Date().toISOString().slice(0, 10);
        modal.style.display = 'block';
    }

    function editAddition(additionId) {
        const item = additionItems.find(a => a.id === additionId);
        if (!item) { showAlert('找不到要編輯的項目', 'error'); return; }
        const modal = document.getElementById('additionModal');
        if (!modal) return;
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

    async function deleteAddition(additionId) {
        if (!confirm('確定要刪除這筆變更項目嗎？此操作無法復原。')) return;
        showLoading(true);
        try {
            await db.collection('detailItems').doc(additionId).delete();
            additionItems = additionItems.filter(item => item.id !== additionId);
            renderPage();
            showAlert('刪除成功', 'success');
        } catch (error) {
            showAlert('刪除失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function showLoading(isLoading, msg = '讀取中...') {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            const txt = loadingEl.querySelector('p');
            if (txt && msg) txt.textContent = msg;
        }
        const content = document.getElementById('editTenderContent');
        if (content) content.style.display = isLoading ? 'none' : 'block';
    }

    function naturalSequenceSort(a, b) {
        const CHINESE_NUM_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5, '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10 };
        const re = /(\d+(\.\d+)?)|([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸])|(\D+)/g;
        const seqA = String(a.sequence || '');
        const seqB = String(b.sequence || '');
        const partsA = seqA.match(re) || [];
        const partsB = seqB.match(re) || [];
        const len = Math.min(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
            const partA = partsA[i];
            const partB = partsB[i];
            let numA = parseFloat(partA);
            let numB = parseFloat(partB);
            if (isNaN(numA)) numA = CHINESE_NUM_MAP[partA];
            if (isNaN(numB)) numB = CHINESE_NUM_MAP[partB];
            if (numA !== undefined && numB !== undefined) {
                if (numA !== numB) return numA - numB;
            } else {
                const comparison = partA.localeCompare(partB);
                if (comparison !== 0) return comparison;
            }
        }
        return partsA.length - partsB.length;
    }

    init();
}
