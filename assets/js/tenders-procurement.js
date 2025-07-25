/**
 * 標單採購管理 (tenders-procurement.js) - v1.3 (事件綁定最終修正版)
 */
function initProcurementPage() {
    console.log("🚀 初始化標單採購管理頁面 (v1.3)...");

    // 等待頁面主要元素出現後，才執行整個頁面的初始化邏輯
    waitForElement('#projectSelect', () => {
        console.log("✅ 採購頁面主要元素已載入，開始執行初始化...");

        let projects = [], tenders = [], majorItems = [], detailItems = [], purchaseOrders = [];
        let selectedProject = null, selectedTender = null;
        const currentUser = firebase.auth().currentUser;

        async function initializePage() {
            if (!currentUser) return showAlert("使用者未登入", "error");
            setupEventListeners(); // 現在這個函數是安全的
            await loadProjectsWithPermission();
        }

        // --- 【核心修正】重寫事件監聽函數，使其更穩固 ---
        function setupEventListeners() {
            // 使用一個安全的輔助函數來綁定事件
            const safeAddEventListener = (selector, event, handler) => {
                const element = document.querySelector(selector);
                if (element) {
                    element.addEventListener(event, handler);
                } else {
                    console.warn(`Event listener setup failed: Element with selector "${selector}" not found.`);
                }
            };

            // 綁定下拉選單
            safeAddEventListener('#projectSelect', 'change', (e) => onProjectChange(e.target.value));
            safeAddEventListener('#tenderSelect', 'change', (e) => onTenderChange(e.target.value));
            safeAddEventListener('#majorItemSelect', 'change', (e) => onMajorItemChange(e.target.value));

            // 對於動態產生的表格內容，使用「事件委派」是最好的方法
            // 我們將點擊事件綁定在一個固定的父層元素(mainContent)上
            const mainContent = document.getElementById('mainContent');
            if(mainContent) {
                mainContent.addEventListener('click', (e) => {
                    const addBtn = e.target.closest('.btn-add-order');
                    const orderChip = e.target.closest('.order-chip');
                    if (addBtn) {
                        openOrderModal(null, addBtn.dataset.itemId);
                    } else if (orderChip) {
                        const order = purchaseOrders.find(o => o.id === orderChip.dataset.orderId);
                        if (order) openOrderModal(order);
                    }
                });
            }

            // 綁定彈出視窗的事件
            safeAddEventListener('#orderForm', 'submit', handleFormSubmit);
            safeAddEventListener('#cancelModalBtn', 'click', () => document.getElementById('orderModal').style.display = 'none');
            safeAddEventListener('#deleteOrderBtn', 'click', deleteOrder);
        }
        
        // --- 其他所有函式維持不變 (為求完整，此處省略，您只需替換整個檔案即可) ---
        async function loadProjectsWithPermission() {
            showLoading(true);
            try {
                const allMyProjects = await loadProjects();
                projects = allMyProjects.filter(p => p.members[currentUser.email]);
                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) { showAlert('載入專案失敗', 'error'); } finally { showLoading(false); }
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
                majorItems = majorItemDocs.docs.sort(naturalSequenceSort);
                detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
                purchaseOrders = orderDocs.docs;
                populateSelect(document.getElementById('majorItemSelect'), majorItems, '所有大項目');
                renderProcurementTable();
                showMainContent(true);
            } catch(error) { showAlert('載入標單資料失敗: ' + error.message, 'error'); } finally { showLoading(false); }
        }
        function onMajorItemChange(majorItemId) { renderProcurementTable(majorItemId); }
        function renderProcurementTable(filterMajorItemId = '') {
            const tableBody = document.getElementById('tableBody');
            const itemsToRender = filterMajorItemId ? detailItems.filter(item => item.majorItemId === filterMajorItemId) : detailItems;
            if(itemsToRender.length === 0) { tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 2rem;">此標單 (或大項目) 下沒有細項。</td></tr>`; return; }
            let bodyHTML = '';
            itemsToRender.forEach(item => {
                const orders = purchaseOrders.filter(o => o.detailItemId === item.id);
                const totalPurchased = orders.reduce((sum, o) => sum + (o.purchaseQuantity || 0), 0);
                const remainingQty = (item.totalQuantity || 0) - totalPurchased;
                const statusClass = remainingQty <= 0 ? 'status-completed' : (totalPurchased > 0 ? 'status-active' : 'status-planning');
                bodyHTML += `<tr class="item-row ${statusClass}"><td>${item.sequence || ''}</td><td>${item.name}</td><td>${item.unit || '-'}</td><td class="text-right">${item.totalQuantity || 0}</td><td class="text-right">${totalPurchased}</td><td class="text-right">${remainingQty}</td><td><div class="order-list">${orders.map(o => `<div class="order-chip status-${o.status || '草稿'}" data-order-id="${o.id}"><span>${o.supplier}: ${o.purchaseQuantity} (${o.status})</span></div>`).join('') || '<span class="text-secondary">無採購單</span>'}</div></td><td><button class="btn btn-sm btn-success btn-add-order" data-item-id="${item.id}">+</button></td></tr>`;
            });
            tableBody.innerHTML = bodyHTML;
        }
        function openOrderModal(orderData = null, detailItemId = null) { const modal = document.getElementById('orderModal'); const form = document.getElementById('orderForm'); const deleteBtn = document.getElementById('deleteOrderBtn'); form.reset(); if (orderData) { document.getElementById('modalTitle').textContent = '編輯採購單'; document.getElementById('orderId').value = orderData.id; document.getElementById('detailItemId').value = orderData.detailItemId; const item = detailItems.find(i => i.id === orderData.detailItemId); document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`; document.getElementById('supplier').value = orderData.supplier; document.getElementById('purchaseQuantity').value = orderData.purchaseQuantity; document.getElementById('unitPrice').value = orderData.unitPrice; document.getElementById('status').value = orderData.status; document.getElementById('orderDate').value = orderData.orderDate || ''; document.getElementById('notes').value = orderData.notes || ''; deleteBtn.style.display = 'inline-block'; } else { document.getElementById('modalTitle').textContent = '新增採購單'; document.getElementById('orderId').value = ''; const item = detailItems.find(i => i.id === detailItemId); document.getElementById('detailItemId').value = item.id; document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`; deleteBtn.style.display = 'none'; } modal.style.display = 'flex'; }
        async function handleFormSubmit(e) { e.preventDefault(); const orderId = document.getElementById('orderId').value; const detailItemId = document.getElementById('detailItemId').value; const quantity = parseFloat(document.getElementById('purchaseQuantity').value); const price = parseFloat(document.getElementById('unitPrice').value); const data = { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: detailItemId, supplier: document.getElementById('supplier').value.trim(), purchaseQuantity: quantity, unitPrice: price, totalPrice: quantity * price, status: document.getElementById('status').value, orderDate: document.getElementById('orderDate').value, notes: document.getElementById('notes').value.trim(), updatedBy: currentUser.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; showLoading(true, '儲存中...'); try { if (orderId) { await db.collection('purchaseOrders').doc(orderId).update(data); } else { data.createdBy = currentUser.email; data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); const item = detailItems.find(i => i.id === detailItemId); data.itemName = item.name; data.itemSequence = item.sequence; await db.collection('purchaseOrders').add(data); } document.getElementById('orderModal').style.display = 'none'; await onTenderChange(selectedTender.id); showAlert('✅ 儲存成功！', 'success'); } catch (error) { showAlert('儲存失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
        async function deleteOrder() { const orderId = document.getElementById('orderId').value; if (!orderId) return; if (!confirm('您確定要刪除這筆採購單嗎？此操作無法復原。')) return; showLoading(true, '刪除中...'); try { await db.collection('purchaseOrders').doc(orderId).delete(); document.getElementById('orderModal').style.display = 'none'; await onTenderChange(selectedTender.id); showAlert('✅ 採購單已刪除！', 'success'); } catch (error) { showAlert('刪除失敗: ' + error.message, 'error'); } finally { showLoading(false); } }
        function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; loadingEl.querySelector('p').textContent = message; } }
        function populateSelect(selectEl, options, defaultText) { let html = `<option value="">${defaultText}</option>`; options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
        function resetSelects(from = 'project') { const selects = ['tender', 'majorItem']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } showMainContent(false); }
        function showMainContent(shouldShow) { document.getElementById('mainContent').style.display = shouldShow ? 'block' : 'none'; document.getElementById('emptyState').style.display = shouldShow ? 'none' : 'flex'; }
        function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }
        
        initializePage();
    });

    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
        } else {
            let interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    callback();
                }
            }, 100);
        }
    }
}
