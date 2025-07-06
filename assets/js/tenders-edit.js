/**
 * 編輯標單頁面 (tenders/edit.js) (SPA 版本) - 改為直接控制 style
 */
function initTenderEditPage() {
    let tenderId, currentTender, majorItems, detailItems, additionItems;
    let allMajorExpanded = false;

    async function init() {
        showLoading(true);
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            return navigateTo('/program/tenders/list');
        }

        try {
            const [tenderDoc, allDbItems, majorItemsDb] = await Promise.all([
                db.collection('tenders').doc(tenderId).get(),
                safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }]),
                safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }])
            ]);

            if (!tenderDoc.exists) throw new Error('找不到指定的標單');
            
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            majorItems = majorItemsDb.docs.sort(naturalSequenceSort);
            detailItems = allDbItems.docs.filter(item => !item.isAddition).sort(naturalSequenceSort);
            additionItems = allDbItems.docs.filter(item => item.isAddition).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            
            renderAll();
            setupEventListeners();
            showLoading(false);
        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    function renderAll() {
        const pageTitleEl = document.getElementById('pageTitle');
        if(pageTitleEl) pageTitleEl.textContent = `標單編輯: ${currentTender.name}`;
        renderTenderInfo();
        renderHierarchicalItems();
        renderAdditionTable();
        renderSummaryCards();
    }

    function renderHierarchicalItems() {
        const tbody = document.getElementById('hierarchicalItemsTbody');
        if(!tbody) return;
        let html = '';
        majorItems.forEach(major => {
            const itemsInMajor = detailItems.filter(detail => detail.majorItemId === major.id);
            html += `
                <tr class="major-item-header-row">
                    <td colspan="8">
                        <div class="major-item-header" onclick="window.exposedFuncs.toggle('${major.id}')">
                            <span>${major.name}</span>
                            <span>${itemsInMajor.length} 項 | ${formatCurrency(itemsInMajor.reduce((s, i) => s + (i.totalPrice||0), 0))}</span>
                        </div>
                    </td>
                </tr>
            `;
            itemsInMajor.forEach(item => {
                html += renderDetailItem(item, major.id);
            });
        });
        tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;padding:2rem;">無原始項目</td></tr>';
    }

    /**
     * 【關鍵修改 1】
     * 這裡我們不再使用 collapsed class，而是直接在 tr 元素上加上 inline-style `style="display: none;"`
     * 這樣可以確保它初始就是隱藏的。
     */
    function renderDetailItem(item, majorId) {
        const additionsForThisItem = additionItems.filter(add => add.relatedItemId === item.id);
        const additionalQty = additionsForThisItem.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
        const currentTotal = (item.totalQuantity || 0) + additionalQty;
        return `
            <tr class="detail-item-row" data-major-id="${majorId}" style="display: none;">
                <td>${item.sequence || ''}</td>
                <td style="text-align: left;">${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.totalQuantity || 0}</td>
                <td class="item-price">${formatCurrency(item.unitPrice)}</td>
                <td class="item-total">${formatCurrency(item.totalPrice)}</td>
                <td class="current-total ${additionalQty > 0 ? 'changed' : ''}">${currentTotal} ${additionalQty > 0 ? `(+${additionalQty})` : ''}</td>
                <td><button class="btn btn-sm btn-primary" onclick="window.exposedFuncs.showAdditionModal('${item.id}', '${escape(item.name)}')">追加</button></td>
            </tr>
        `;
    }
    
    // 其他 render 函數 (renderTenderInfo, renderAdditionTable, renderSummaryCards) 維持不變...
    function renderTenderInfo() {
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = additionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const infoGridEl = document.getElementById('infoGrid');
        if(infoGridEl) {
            infoGridEl.innerHTML = `
                <div class="info-item"><div class="info-label">原始金額</div><div class="info-value amount">${formatCurrency(originalAmount)}</div></div>
                <div class="info-item"><div class="info-label">追加金額</div><div class="info-value addition">${formatCurrency(additionAmount)}</div></div>
                <div class="info-item"><div class="info-label">目前總金額</div><div class="info-value total">${formatCurrency(originalAmount + additionAmount)}</div></div>
            `;
        }
    }
    
    function renderAdditionTable() {
        const tbody = document.querySelector('#additionTable tbody');
        if (!tbody) return;
        tbody.innerHTML = additionItems.map(add => {
            const relatedItem = detailItems.find(d => d.id === add.relatedItemId);
            return `
                <tr>
                    <td>${formatDate(add.createdAt)}</td>
                    <td>${relatedItem ? relatedItem.name : '未知項目'}</td>
                    <td>${add.totalQuantity || 0}</td>
                    <td>${formatCurrency(add.unitPrice)}</td>
                    <td>${add.reason || ''}</td>
                    <td>${add.status || '待核准'}</td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="window.exposedFuncs.editAddition('${add.id}')">編輯</button>
                        <button class="btn btn-sm btn-danger" onclick="window.exposedFuncs.deleteAddition('${add.id}')">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
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
                        name: originalItem.name, unit: originalItem.unit,
                        originalQty: originalItem.totalQuantity || 0, additionalQty: 0,
                    };
                }
            }
            if (summarizedItems[add.relatedItemId]) {
                summarizedItems[add.relatedItemId].additionalQty += (add.totalQuantity || 0);
            }
        });
        summaryContainer.innerHTML = Object.values(summarizedItems).map(summary => `
            <div class="summary-card">
                <div class="summary-item-name">${summary.name}</div>
                <div class="summary-detail"><span>原始數量</span><span>${summary.originalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail"><span>追加數量</span><span class="addition">+${summary.additionalQty} ${summary.unit || ''}</span></div>
                <div class="summary-detail total"><span>目前總數</span><span>${summary.originalQty + summary.additionalQty} ${summary.unit || ''}</span></div>
            </div>
        `).join('');
    }
    
    // setupEventListeners 和 handleAdditionSubmit 維持不變...
    function setupEventListeners() {
        const modal = document.getElementById('additionModal');
        if (!modal) return;
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancelAdditionBtn');
        const form = document.getElementById('additionForm');

        if(closeBtn) closeBtn.onclick = () => modal.style.display = "none";
        if(cancelBtn) cancelBtn.onclick = () => modal.style.display = "none";
        window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };
        if(form) form.onsubmit = handleAdditionSubmit;
    }

    async function handleAdditionSubmit(event) {
        event.preventDefault();
        const relatedItemId = document.getElementById('relatedItemId').value;
        const editId = document.getElementById('editAdditionId').value;
        const relatedItem = detailItems.find(d => d.id === relatedItemId);
        if (!relatedItem) return showAlert('關聯項目不存在', 'error');

        const quantity = parseFloat(document.getElementById('additionQuantity').value);
        const data = {
            tenderId: tenderId, majorItemId: relatedItem.majorItemId,
            relatedItemId: relatedItemId, isAddition: true,
            totalQuantity: quantity, reason: document.getElementById('additionReason').value,
            unitPrice: relatedItem.unitPrice, totalPrice: relatedItem.unitPrice * quantity,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(), status: '待核准',
        };

        try {
            if (editId) {
                await db.collection('detailItems').doc(editId).update(data);
            } else {
                data.createdBy = auth.currentUser.email;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('detailItems').add(data);
            }
            await init(); 
            document.getElementById('additionModal').style.display = "none";
        } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); }
    }
    
    function showLoading(isLoading) {
        const loadingEl = document.getElementById('loading');
        const contentEl = document.getElementById('editTenderContent');
        if(loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if(contentEl) contentEl.style.display = isLoading ? 'none' : 'block';
    }
    
    window.exposedFuncs = {
        /**
         * 【關鍵修改 2】
         * 單項收合/展開：直接修改 style.display。
         * 如果目前是 'none'，就改成 '' (恢復預設的 table-row)；反之亦然。
         */
        toggle: (majorId) => {
            document.querySelectorAll(`tr[data-major-id="${majorId}"]`).forEach(row => {
                const isCollapsed = row.style.display === 'none';
                row.style.display = isCollapsed ? '' : 'none';
            });
        },
        /**
         * 【關鍵修改 3】
         * 全部收合/展開：也是直接修改 style.display。
         * allMajorExpanded 為 true 時，全部展開 (display = '')
         * allMajorExpanded 為 false 時，全部收合 (display = 'none')
         */
        toggleAll: () => {
            allMajorExpanded = !allMajorExpanded;
            document.querySelectorAll('tr.detail-item-row').forEach(row => {
                row.style.display = allMajorExpanded ? '' : 'none';
            });
            const toggleBtn = document.getElementById('toggleAllBtnText');
            if (toggleBtn) {
                toggleBtn.textContent = allMajorExpanded ? '全部收合' : '全部展開';
            }
        },
        // 其他 exposedFuncs (showAdditionModal, editAddition, deleteAddition) 維持不變
        showAdditionModal: (itemId, itemName) => {
            const modal = document.getElementById('additionModal');
            if(modal) {
                document.getElementById('editAdditionId').value = '';
                document.getElementById('relatedItemId').value = itemId;
                document.getElementById('modalItemName').value = unescape(itemName);
                document.getElementById('additionQuantity').value = 1;
                document.getElementById('additionReason').value = '';
                document.getElementById('modalTitle').textContent = '追加項目數量';
                modal.style.display = 'block';
            }
        },
        editAddition: (additionId) => {
            const item = additionItems.find(a => a.id === additionId);
            const relatedItem = detailItems.find(d => d.id === item.relatedItemId);
            if (!item || !relatedItem) return showAlert('找不到要編輯的項目', 'error');
            
            const modal = document.getElementById('additionModal');
            if(modal) {
                document.getElementById('editAdditionId').value = item.id;
                document.getElementById('relatedItemId').value = item.relatedItemId;
                document.getElementById('modalItemName').value = relatedItem.name;
                document.getElementById('additionQuantity').value = item.totalQuantity;
                document.getElementById('additionReason').value = item.reason;
                document.getElementById('modalTitle').textContent = '編輯追加項目';
                modal.style.display = 'block';
            }
        },
        deleteAddition: async (additionId) => {
            if (!confirm('確定要刪除這筆追加項目嗎？此操作無法復原。')) return;
            try {
                await db.collection('detailItems').doc(additionId).delete();
                await init();
                showAlert('刪除成功', 'success');
            } catch (error) { showAlert('刪除失敗: ' + error.message, 'error'); }
        }
    };
    
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

    init();
}
