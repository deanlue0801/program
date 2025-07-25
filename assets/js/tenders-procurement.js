/**
 * 標單採購管理 (tenders-procurement.js) - v1.0
 */
function initProcurementPage() {
    console.log("🚀 初始化標單採購管理頁面 (v1.0)...");

    let projects = [], tenders = [], majorItems = [], detailItems = [], purchaseOrders = [];
    let selectedProject = null, selectedTender = null;
    const currentUser = firebase.auth().currentUser;

    async function initializePage() {
        if (!currentUser) return showAlert("使用者未登入", "error");
        setupEventListeners();
        await loadProjectsWithPermission();
    }

    async function loadProjectsWithPermission() {
        showLoading(true);
        try {
            const allMyProjects = await loadProjects();
            projects = allMyProjects.filter(p => p.members[currentUser.email]);
            populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
        } catch (error) {
            showAlert('載入專案失敗', 'error');
        } finally {
            showLoading(false);
        }
    }

    async function onProjectChange(projectId) {
        resetSelects('tender');
        if (!projectId) { selectedProject = null; return; }
        selectedProject = projects.find(p => p.id === projectId);
        try {
            const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
            tenders = tenderDocs.docs;
            populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
        } catch (error) { showAlert('載入標單失敗', 'error'); }
    }

    async function onTenderChange(tenderId) {
        resetSelects('majorItem');
        if (!tenderId) { selectedTender = null; return; }
        selectedTender = tenders.find(t => t.id === tenderId);
        showLoading(true, '載入標單資料中...');
        try {
            const [majorItemDocs, detailItemDocs, orderDocs] = await Promise.all([
                safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                safeFirestoreQuery("purchaseOrders", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }])
            ]);
            majorItems = majorItemDocs.docs.sort((a,b) => (a.sequence || '').localeCompare(b.sequence || ''));
            detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
            purchaseOrders = orderDocs.docs;
            populateSelect(document.getElementById('majorItemSelect'), majorItems, '所有大項目');
            renderProcurementTable();
            showMainContent(true);
        } catch(error) {
            showAlert('載入標單資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function onMajorItemChange(majorItemId) {
        renderProcurementTable(majorItemId);
    }
    
    function renderProcurementTable(filterMajorItemId = '') {
        const tableBody = document.getElementById('tableBody');
        const itemsToRender = filterMajorItemId ? detailItems.filter(item => item.majorItemId === filterMajorItemId) : detailItems;
        
        if(itemsToRender.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 2rem;">此標單 (或大項目) 下沒有細項。</td></tr>`;
            return;
        }

        let bodyHTML = '';
        itemsToRender.forEach(item => {
            const orders = purchaseOrders.filter(o => o.detailItemId === item.id);
            const totalPurchased = orders.reduce((sum, o) => sum + (o.purchaseQuantity || 0), 0);
            const remainingQty = (item.totalQuantity || 0) - totalPurchased;
            const statusClass = remainingQty <= 0 ? 'status-completed' : (totalPurchased > 0 ? 'status-active' : 'status-planning');

            bodyHTML += `
                <tr class="item-row ${statusClass}">
                    <td>${item.sequence || ''}</td>
                    <td>${item.name}</td>
                    <td>${item.unit || '-'}</td>
                    <td class="text-right">${item.totalQuantity || 0}</td>
                    <td class="text-right">${totalPurchased}</td>
                    <td class="text-right">${remainingQty}</td>
                    <td>
                        <div class="order-list">
                            ${orders.map(o => `
                                <div class="order-chip status-${o.status || '草稿'}">
                                    <span>${o.supplier}: ${o.purchaseQuantity} (${o.status})</span>
                                    <button class="btn-edit-order" data-order-id="${o.id}">✏️</button>
                                </div>
                            `).join('') || '<span class="text-secondary">無採購單</span>'}
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-success btn-add-order" data-item-id="${item.id}">+</button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = bodyHTML;
    }

    function openOrderModal(orderData = null) {
        const modal = document.getElementById('orderModal');
        const form = document.getElementById('orderForm');
        form.reset();
        
        if (orderData) { // 編輯模式
            document.getElementById('modalTitle').textContent = '編輯採購單';
            document.getElementById('orderId').value = orderData.id;
            document.getElementById('detailItemId').value = orderData.detailItemId;
            const item = detailItems.find(i => i.id === orderData.detailItemId);
            document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`;
            document.getElementById('supplier').value = orderData.supplier;
            document.getElementById('purchaseQuantity').value = orderData.purchaseQuantity;
            document.getElementById('unitPrice').value = orderData.unitPrice;
            document.getElementById('status').value = orderData.status;
            document.getElementById('orderDate').value = orderData.orderDate || '';
            document.getElementById('notes').value = orderData.notes || '';
        } else { // 新增模式 (需要 detailItemId)
            document.getElementById('modalTitle').textContent = '新增採購單';
            document.getElementById('orderId').value = '';
            const item = detailItems.find(i => i.id === event.target.dataset.itemId);
            document.getElementById('detailItemId').value = item.id;
            document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`;
        }
        modal.style.display = 'flex';
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const orderId = document.getElementById('orderId').value;
        const detailItemId = document.getElementById('detailItemId').value;
        const quantity = parseFloat(document.getElementById('purchaseQuantity').value);
        const price = parseFloat(document.getElementById('unitPrice').value);

        const data = {
            projectId: selectedProject.id,
            tenderId: selectedTender.id,
            detailItemId: detailItemId,
            supplier: document.getElementById('supplier').value.trim(),
            purchaseQuantity: quantity,
            unitPrice: price,
            totalPrice: quantity * price,
            status: document.getElementById('status').value,
            orderDate: document.getElementById('orderDate').value,
            notes: document.getElementById('notes').value.trim(),
            createdBy: currentUser.email
        };
        
        showLoading(true, '儲存中...');
        try {
            if (orderId) { // 更新
                await db.collection('purchaseOrders').doc(orderId).update(data);
            } else { // 新增
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                const item = detailItems.find(i => i.id === detailItemId);
                data.itemName = item.name;
                data.itemSequence = item.sequence;
                await db.collection('purchaseOrders').add(data);
            }
            document.getElementById('orderModal').style.display = 'none';
            await onTenderChange(selectedTender.id); // 重新載入資料
            showAlert('✅ 儲存成功！', 'success');
        } catch (error) {
            showAlert('儲存失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    function setupEventListeners() {
        document.getElementById('projectSelect').addEventListener('change', (e) => onProjectChange(e.target.value));
        document.getElementById('tenderSelect').addEventListener('change', (e) => onTenderChange(e.target.value));
        document.getElementById('majorItemSelect').addEventListener('change', (e) => onMajorItemChange(e.target.value));
        document.getElementById('tableBody').addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-add-order')) {
                openOrderModal();
            } else if (e.target.classList.contains('btn-edit-order')) {
                const order = purchaseOrders.find(o => o.id === e.target.dataset.orderId);
                openOrderModal(order);
            }
        });
        document.getElementById('orderForm').addEventListener('submit', handleFormSubmit);
        document.getElementById('cancelModalBtn').addEventListener('click', () => document.getElementById('orderModal').style.display = 'none');
    }
    
    // --- Helper Functions ---
    function showLoading(isLoading, message='載入中...') { /* ... */ }
    function populateSelect(selectEl, options, defaultText) { /* ... */ }
    function resetSelects(from = 'project') { /* ... */ }
    function showMainContent(shouldShow) { /* ... */ }
    function naturalSequenceSort(a, b) { /* ... */ }
    
    initializePage();
}
