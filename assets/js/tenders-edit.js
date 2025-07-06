/**
 * 編輯標單頁面 (tenders/edit.js) (SPA 版本) - 恢復追加項目功能
 */
function initTenderEditPage() {
    let tenderId = null;
    let currentTender = null;
    let allItems = []; // 包含原始項目和追加項目

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
            const [tenderDoc, itemsResult] = await Promise.all([
                db.collection('tenders').doc(tenderId).get(),
                // 一次性獲取所有相關項目
                safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }])
            ]);

            if (!tenderDoc.exists) throw new Error('找不到指定的標單');
            
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            allItems = itemsResult.docs.sort(naturalSequenceSort);

            renderPage();
            setupEventListeners();
            showLoading(false);

        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    // --- 畫面渲染函數 ---

    function renderPage() {
        renderTenderInfo();
        renderItems();
    }

    function renderTenderInfo() {
        const originalItems = allItems.filter(item => !item.isAddition);
        const additionalItems = allItems.filter(item => item.isAddition);

        const originalAmount = originalItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = additionalItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;

        document.querySelector('.page-title').textContent = `📋 標單編輯: ${currentTender.name}`;
        document.querySelector('.page-subtitle').textContent = `專案: ${currentTender.projectName || '未指定'}`;
        
        document.getElementById('infoTenderName').textContent = currentTender.name || 'N/A';
        document.getElementById('infoContractorName').textContent = currentTender.contractorName || 'N/A';
        document.getElementById('infoOriginalAmount').textContent = formatCurrency(originalAmount);
        document.getElementById('infoAdditionAmount').textContent = formatCurrency(additionAmount);
        document.getElementById('infoTotalAmount').textContent = formatCurrency(totalAmount);
    }

    function renderItems() {
        const originalContainer = document.getElementById('hierarchicalItemsContainer');
        const additionalContainer = document.getElementById('additionalItemsContainer');
        if (!originalContainer || !additionalContainer) return;

        const originalItems = allItems.filter(item => !item.isAddition);
        const additionalItems = allItems.filter(item => item.isAddition);

        originalContainer.innerHTML = originalItems.map(item => renderDetailItem(item, false)).join('') || '<div style="padding: 1rem; text-align: center;">無原始項目</div>';
        additionalContainer.innerHTML = additionalItems.map(item => renderDetailItem(item, true)).join('') || '<div style="padding: 1rem; text-align: center;">無追加項目</div>';
    }

    function renderDetailItem(item, isAddition) {
        return `
            <div class="detail-item">
                <div class="item-status ${isAddition ? 'addition' : ''}"></div>
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

    // --- 事件處理函數 ---
    function setupEventListeners() {
        const modal = document.getElementById('addItemModal');
        const showBtn = document.getElementById('showAddItemModalBtn');
        const closeBtn = document.getElementById('closeModalBtn');
        const cancelBtn = document.getElementById('cancelAddItemBtn');
        const addItemForm = document.getElementById('addItemForm');

        showBtn.onclick = () => { modal.style.display = 'block'; };
        closeBtn.onclick = () => { modal.style.display = 'none'; };
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
        window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };
        
        addItemForm.onsubmit = handleAddItemSubmit;

        // 計算總價
        const quantityInput = document.getElementById('itemQuantity');
        const unitPriceInput = document.getElementById('itemUnitPrice');
        const totalPriceInput = document.getElementById('itemTotalPrice');
        const calculateTotal = () => {
            const quantity = parseFloat(quantityInput.value) || 0;
            const unitPrice = parseFloat(unitPriceInput.value) || 0;
            totalPriceInput.value = quantity * unitPrice;
        };
        quantityInput.addEventListener('input', calculateTotal);
        unitPriceInput.addEventListener('input', calculateTotal);
    }

    async function handleAddItemSubmit(event) {
        event.preventDefault();
        const newItem = {
            tenderId: tenderId,
            isAddition: true, // 標記為追加項目
            sequence: document.getElementById('itemSequence').value,
            name: document.getElementById('itemName').value,
            unit: document.getElementById('itemUnit').value,
            totalQuantity: parseFloat(document.getElementById('itemQuantity').value) || 0,
            unitPrice: parseFloat(document.getElementById('itemUnitPrice').value) || 0,
            totalPrice: parseFloat(document.getElementById('itemTotalPrice').value) || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!newItem.name) {
            showAlert('項目名稱為必填欄位', 'error');
            return;
        }

        try {
            const docRef = await db.collection('detailItems').add(newItem);
            newItem.id = docRef.id;
            allItems.push(newItem);
            allItems.sort(naturalSequenceSort);
            renderPage(); // 重新渲染整個頁面
            document.getElementById('addItemModal').style.display = 'none';
            document.getElementById('addItemForm').reset();
            showAlert('追加項目新增成功！', 'success');
        } catch (error) {
            console.error("新增追加項目失敗:", error);
            showAlert("儲存失敗: " + error.message, "error");
        }
    }

    // --- UI 互動與輔助函數 ---
    function showLoading(isLoading) {
        const loadingEl = document.getElementById('loading');
        const contentEl = document.getElementById('editTenderContent');
        if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
        if (contentEl) contentEl.style.display = isLoading ? 'none' : 'block';
    }
    
    function naturalSequenceSort(a, b) {
        const seqA = String(a.sequence || '');
        const seqB = String(b.sequence || '');
        const re = /(\d+(\.\d+)?)|(\D+)/g;
        const partsA = seqA.match(re) || [];
        const partsB = seqB.match(re) || [];
        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            const numA = parseFloat(partsA[i]);
            const numB = parseFloat(partsB[i]);
            if (!isNaN(numA) && !isNaN(numB)) {
                if (numA !== numB) return numA - numB;
            } else if (partsA[i] !== partsB[i]) {
                return partsA[i].localeCompare(partsB[i]);
            }
        }
        return partsA.length - partsB.length;
    }

    // 啟動頁面邏輯
    init();
}
