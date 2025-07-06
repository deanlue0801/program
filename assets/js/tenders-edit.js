/**
 * 編輯標單頁面 (tenders/edit.js) (SPA 版本) - 完整功能重建版
 */
function initTenderEditPage() {
    let tenderId, currentTender, majorItems, detailItems, additionItems;

    async function init() {
        showLoading(true);
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            return navigateTo('/program/tenders/list');
        }

        try {
            const [tenderDoc, allItemsResult] = await Promise.all([
                db.collection('tenders').doc(tenderId).get(),
                safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }]),
            ]);

            if (!tenderDoc.exists) throw new Error('找不到指定的標單');
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            
            majorItems = allItemsResult.docs.filter(item => !item.isMajorItem); // 假設大項沒有 isMajorItem 欄位
            detailItems = allItemsResult.docs.filter(item => item.majorItemId && !item.isAddition).sort(naturalSequenceSort);
            additionItems = allItemsResult.docs.filter(item => item.isAddition).sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());

            const majorItemsResultFromDb = await safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }]);
            majorItems = majorItemsResultFromDb.docs.sort(naturalSequenceSort);

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
        document.getElementById('pageTitle').textContent = `標單編輯: ${currentTender.name}`;
        renderTenderInfo();
        renderHierarchicalItems();
        renderAdditionTable();
        renderSummaryCards();
    }

    function renderTenderInfo() {
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = additionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;
        document.getElementById('infoGrid').innerHTML = `
            <div class="info-item"><div class="info-label">原始金額</div><div class="info-value amount">${formatCurrency(originalAmount)}</div></div>
            <div class="info-item"><div class="info-label">追加金額</div><div class="info-value addition">${formatCurrency(additionAmount)}</div></div>
            <div class="info-item"><div class="info-label">目前總金額</div><div class="info-value total">${formatCurrency(totalAmount)}</div></div>
        `;
    }

    function renderHierarchicalItems() {
        const container = document.getElementById('hierarchicalItemsContainer');
        container.innerHTML = majorItems.map(major => {
            const itemsInMajor = detailItems.filter(detail => detail.majorItemId === major.id);
            return `
                <div class="major-item-container">
                    <div class="major-item-header" onclick="window.exposedFuncs.toggle('${major.id}')">
                        <span>${major.name}</span>
                        <span>${itemsInMajor.length} 項 | ${formatCurrency(itemsInMajor.reduce((s, i) => s + i.totalPrice, 0))}</span>
                    </div>
                    <div class="detail-items-container" id="details-${major.id}">
                        ${itemsInMajor.map(renderDetailItem).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderDetailItem(item) {
        const additionsForThisItem = additionItems.filter(add => add.relatedItemId === item.id);
        const additionalQty = additionsForThisItem.reduce((sum, add) => sum + add.totalQuantity, 0);
        const currentTotal = item.totalQuantity + additionalQty;
        return `
            <div class="detail-item">
                <div>${item.sequence}</div>
                <div>${item.name}</div>
                <div>${item.unit}</div>
                <div>${item.totalQuantity}</div>
                <div class="item-price">${formatCurrency(item.unitPrice)}</div>
                <div class="item-total">${formatCurrency(item.totalPrice)}</div>
                <div class="current-total ${additionalQty > 0 ? 'changed' : ''}">${currentTotal} ${additionalQty > 0 ? `(+${additionalQty})` : ''}</div>
                <div><button class="btn btn-sm btn-primary" onclick="window.exposedFuncs.showAdditionModal('${item.id}', '${escape(item.name)}')">追加</button></div>
            </div>
        `;
    }

    function renderAdditionTable() {
        const tbody = document.querySelector('#additionTable tbody');
        tbody.innerHTML = additionItems.map(add => {
            const relatedItem = detailItems.find(d => d.id === add.relatedItemId);
            return `
                <tr>
                    <td>${formatDate(add.createdAt)}</td>
                    <td>${relatedItem ? relatedItem.name : '未知項目'}</td>
                    <td>${add.totalQuantity}</td>
                    <td>${formatCurrency(add.unitPrice)}</td>
                    <td>${add.reason || ''}</td>
                    <td>${add.status || '已核准'}</td>
                </tr>
            `;
        }).join('');
    }

    function renderSummaryCards() {
        const summaryContainer = document.getElementById('summaryGrid');
        const summarizedItems = {};
        additionItems.forEach(add => {
            if (!summarizedItems[add.relatedItemId]) {
                const originalItem = detailItems.find(d => d.id === add.relatedItemId);
                if (originalItem) {
                    summarizedItems[add.relatedItemId] = {
                        name: originalItem.name,
                        originalQty: originalItem.totalQuantity,
                        additionalQty: 0,
                    };
                }
            }
            if (summarizedItems[add.relatedItemId]) {
                summarizedItems[add.relatedItemId].additionalQty += add.totalQuantity;
            }
        });

        summaryContainer.innerHTML = Object.values(summarizedItems).map(summary => `
            <div class="summary-card">
                <div class="summary-item-name">${summary.name}</div>
                <div class="summary-detail"><span>原始數量</span><span>${summary.originalQty}</span></div>
                <div class="summary-detail"><span>追加數量</span><span class="addition">+${summary.additionalQty}</span></div>
                <div class="summary-detail"><span>目前總數</span><span class="total">${summary.originalQty + summary.additionalQty}</span></div>
            </div>
        `).join('');
    }

    function setupEventListeners() {
        const modal = document.getElementById('additionModal');
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = document.getElementById('cancelAdditionBtn');
        const form = document.getElementById('additionForm');

        closeBtn.onclick = () => modal.style.display = "none";
        cancelBtn.onclick = () => modal.style.display = "none";
        window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };
        form.onsubmit = handleAdditionSubmit;
    }

    async function handleAdditionSubmit(event) {
        event.preventDefault();
        const relatedItemId = document.getElementById('relatedItemId').value;
        const relatedItem = detailItems.find(d => d.id === relatedItemId);
        if (!relatedItem) return showAlert('關聯項目不存在', 'error');

        const newAddition = {
            tenderId: tenderId,
            majorItemId: relatedItem.majorItemId,
            relatedItemId: relatedItemId,
            isAddition: true,
            totalQuantity: parseFloat(document.getElementById('additionQuantity').value),
            reason: document.getElementById('additionReason').value,
            unitPrice: relatedItem.unitPrice,
            totalPrice: relatedItem.unitPrice * parseFloat(document.getElementById('additionQuantity').value),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: '待核准',
        };

        try {
            const docRef = await db.collection('detailItems').add(newAddition);
            newAddition.id = docRef.id;
            additionItems.unshift(newAddition); // 加到最前面
            renderAll(); // 重新渲染整個頁面
            document.getElementById('additionModal').style.display = "none";
        } catch (error) {
            showAlert('追加失敗: ' + error.message, 'error');
        }
    }

    function showLoading(isLoading) {
        document.getElementById('loading').style.display = isLoading ? 'flex' : 'none';
        document.getElementById('editTenderContent').style.display = isLoading ? 'none' : 'block';
    }

    window.exposedFuncs = {
        toggle: (majorId) => document.getElementById(`details-${majorId}`).classList.toggle('collapsed'),
        showAdditionModal: (itemId, itemName) => {
            const modal = document.getElementById('additionModal');
            document.getElementById('relatedItemId').value = itemId;
            document.getElementById('modalItemName').value = unescape(itemName);
            document.getElementById('additionQuantity').value = 1;
            document.getElementById('additionReason').value = '';
            modal.style.display = 'block';
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
