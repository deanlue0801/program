/**
 * 標單採購管理 (tenders-procurement.js) - v2.6 (修正匯出排序)
 */
function initProcurementPage() {
    console.log("🚀 [1/4] 初始化標單採購管理頁面...");

    // 將等待函數放在最前面，確保它最先被定義
    function waitForElement(selector, callback) {
        // 先嘗試立即尋找元素
        const element = document.querySelector(selector);
        if (element) {
            console.log(`✅ [2/4] 元素 "${selector}" 已找到，立即執行。`);
            callback();
            return;
        }
        // 如果找不到，則啟動計時器持續檢查
        console.log(`🔍 [2/4] 元素 "${selector}" 尚未出現，開始等待...`);
        let interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                console.log(`✅ [2/4] 元素 "${selector}" 已出現，執行回呼。`);
                callback();
            }
        }, 100);
    }

    // 等待頁面最關鍵的元素'#projectSelect'出現後，才執行整個頁面的核心邏輯
    waitForElement('#projectSelect', () => {
        
        let projects = [], tenders = [], majorItems = [], detailItems = [], purchaseOrders = [], quotations = [];
        let selectedProject = null, selectedTender = null;
        const db = firebase.firestore();
        const currentUser = firebase.auth().currentUser;

        // --- 核心邏輯函數 ---
        async function runPageLogic() {
            console.log("🚀 [3/4] 核心邏輯啟動...");
            if (!currentUser) return showAlert("使用者未登入", "error");
            setupEventListeners();
            await loadProjectsWithPermission();
            console.log("✅ [4/4] 頁面初始化完成。");
        }

        // ===================================================================
        // 以下是所有函數的完整定義
        // ===================================================================

        function setupEventListeners() {
            const safeAddEventListener = (selector, event, handler) => {
                const element = document.querySelector(selector);
                if (element) {
                    element.addEventListener(event, handler);
                } else {
                    console.warn(`Event listener setup failed: Element with selector "${selector}" not found.`);
                }
            };
            safeAddEventListener('#projectSelect', 'change', (e) => onProjectChange(e.target.value));
            safeAddEventListener('#tenderSelect', 'change', (e) => onTenderChange(e.target.value));
            safeAddEventListener('#majorItemSelect', 'change', (e) => onMajorItemChange(e.target.value));
            safeAddEventListener('#exportRfqBtn', 'click', exportRfqExcel);
            safeAddEventListener('#importQuotesBtn', 'click', () => document.getElementById('importQuotesInput').click());
            safeAddEventListener('#importQuotesInput', 'change', handleQuoteImport);
            
            // 由於 modal 是動態載入的，改用事件代理
            document.body.addEventListener('click', (e) => {
                if (e.target.matches('.btn-compare-price')) {
                    showPriceComparisonModal(e.target.dataset.itemId);
                } else if (e.target.matches('.btn-select-quote')) {
                    const { itemId, supplier, price } = e.target.dataset;
                    selectQuote(itemId, supplier, parseFloat(price));
                } else if (e.target.closest('.order-chip')) {
                    const orderChip = e.target.closest('.order-chip');
                    const order = purchaseOrders.find(o => o.id === orderChip.dataset.orderId);
                    if (order) openOrderModal(order);
                } else if (e.target.matches('.btn-add-order')) {
                    openOrderModal(null, e.target.dataset.itemId);
                } else if(e.target.id === 'cancelCompareModalBtn') {
                    closeModal('priceCompareModal');
                }
            });

            // 表單提交也使用事件代理
            document.body.addEventListener('submit', (e) => {
                if (e.target.id === 'orderForm') {
                    handleFormSubmit(e);
                }
            });
        }
        
        async function loadProjectsWithPermission() {
            showLoading(true);
            try {
                const allMyProjects = await loadProjects();
                projects = allMyProjects.filter(p => p.members && p.members[currentUser.email]);
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
                const [majorItemDocs, detailItemDocs, orderDocs, quoteDocs] = await Promise.all([
                    safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                    safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                    safeFirestoreQuery("purchaseOrders", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]),
                    safeFirestoreQuery("quotations", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }])
                ]);
                majorItems = majorItemDocs.docs.sort(naturalSequenceSort);
                detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
                purchaseOrders = orderDocs.docs;
                quotations = quoteDocs.docs;
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
            const majorItemsToRender = filterMajorItemId 
                ? majorItems.filter(m => m.id === filterMajorItemId) 
                : majorItems;

            if (majorItemsToRender.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 2rem;">此標單 (或篩選條件) 下沒有大項目。</td></tr>`;
                return;
            }

            let bodyHTML = '';
            let groupIndex = 0;

            majorItemsToRender.forEach(majorItem => {
                bodyHTML += `<tr class="major-item-header"><td colspan="7">${majorItem.sequence || ''}. ${majorItem.name}</td></tr>`;
                
                const itemsToRender = detailItems.filter(item => item.majorItemId === majorItem.id);

                if (itemsToRender.length === 0) {
                    bodyHTML += `<tr><td colspan="7" class="text-center" style="padding: 1rem; font-style: italic;">此大項目下沒有細項。</td></tr>`;
                } else {
                    const groupClass = (groupIndex % 2 === 0) ? 'group-even' : 'group-odd';

                    itemsToRender.forEach(item => {
                        const orders = purchaseOrders.filter(o => o.detailItemId === item.id);
                        const quotes = quotations.filter(q => q.detailItemId === item.id);
                        const totalPurchased = orders.reduce((sum, o) => sum + (o.purchaseQuantity || 0), 0);
                        const remainingQty = (item.totalQuantity || 0) - totalPurchased;
                        const statusClass = remainingQty <= 0 ? 'status-completed' : (totalPurchased > 0 ? 'status-active' : 'status-planning');
                        
                        bodyHTML += `<tr class="item-row ${statusClass} ${groupClass}">
                            <td style="padding-left: 2em;">${item.sequence || ''}</td>
                            <td>${item.name}</td>
                            <td class="text-right">${item.totalQuantity || 0}</td>
                            <td class="text-right">${totalPurchased}</td>
                            <td class="text-right">${remainingQty}</td>
                            <td><div class="order-list">${orders.map(o => `<div class="order-chip status-${o.status || '草稿'}" data-order-id="${o.id}"><span>${o.supplier}: ${o.purchaseQuantity} (${o.status})</span></div>`).join('')}${quotes.map(q => `<div class="quote-chip" title="報價 by ${q.supplier}"><span>${q.supplier}: ${formatCurrency(q.quotedUnitPrice)}</span></div>`).join('')}</div></td>
                            <td><button class="btn btn-sm btn-info btn-compare-price" data-item-id="${item.id}" title="比價">📊</button><button class="btn btn-sm btn-success btn-add-order" data-item-id="${item.id}" title="新增採購">+</button></td>
                        </tr>`;
                    });
                    groupIndex++;
                }
            });
            tableBody.innerHTML = bodyHTML;
        }

        /**
         * 【核心修正】修正匯出 Excel 的排序邏輯
         */
        function exportRfqExcel() {
            if (!selectedTender || detailItems.length === 0) {
                return showAlert('請先選擇一個標單以匯出詢價單。', 'warning');
            }
            
            // 建立一個空的 data 陣列來存放最終結果
            const data = [];
            // 建立大項目的 Map 供快速查找名稱
            const majorItemMap = new Map(majorItems.map(item => [item.id, `${item.sequence || ''}. ${item.name}`]));

            // 1. 先遍歷已經排序好的 majorItems
            majorItems.forEach(majorItem => {
                // 2. 對於每個大項，從所有細項中篩選出屬於該大項的細項
                // 因為 detailItems 本身已經排序過，所以篩選出來的 itemsInMajor 會維持正確的項次順序
                const itemsInMajor = detailItems.filter(detail => detail.majorItemId === majorItem.id);
                
                // 3. 遍歷屬於這個大項的細項，並將它們推入 data 陣列
                itemsInMajor.forEach(item => {
                    data.push({
                        '大項目': majorItemMap.get(item.majorItemId) || '未分類',
                        '項次': item.sequence || '',
                        '項目名稱': item.name || '',
                        '單位': item.unit || '',
                        '預計數量': item.totalQuantity || 0,
                        '報價單價': '', // 留空給廠商填寫
                        '備註': ''      // 留空給廠商填寫
                    });
                });
            });

            // 4. 使用重新排序好的 data 陣列來產生 Excel
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "詢價單");
            XLSX.writeFile(wb, `${selectedTender.name}_詢價單.xlsx`);
        }

        function handleQuoteImport(event) {
            const file = event.target.files[0];
            if (!file || !selectedTender) return;
            const supplier = prompt("請輸入此報價單的「供應商名稱」：");
            if (!supplier) {
                showAlert('已取消匯入。', 'info');
                event.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = async (e) => {
                showLoading(true, '正在匯入報價單...');
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    const batch = db.batch();
                    jsonData.forEach(row => {
                        const sequence = row['項次'];
                        const unitPrice = parseFloat(row['報價單價']);
                        const notes = row['備註'] || '';
                        const targetItem = detailItems.find(item => String(item.sequence) === String(sequence));
                        if (targetItem && !isNaN(unitPrice)) {
                            const docRef = db.collection('quotations').doc();
                            batch.set(docRef, { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: targetItem.id, supplier: supplier, quotedUnitPrice: unitPrice, notes: notes, quotedDate: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                        }
                    });
                    await batch.commit();
                    await onTenderChange(selectedTender.id);
                    showAlert('✅ 報價單匯入成功！', 'success');
                } catch (error) { showAlert('匯入失敗: ' + error.message, 'error'); } finally { showLoading(false); event.target.value = ''; }
            };
            reader.readAsArrayBuffer(file);
        }

        function showPriceComparisonModal(itemId) {
            const item = detailItems.find(i => i.id === itemId);
            const itemQuotes = quotations.filter(q => q.detailItemId === itemId);
            document.getElementById('compareItemName').textContent = `${item.sequence}. ${item.name}`;
            const compareTableBody = document.getElementById('compareTableBody');
            if (itemQuotes.length === 0) {
                compareTableBody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 1rem;">此項目尚無報價。</td></tr>`;
            } else {
                const minPrice = Math.min(...itemQuotes.map(q => q.quotedUnitPrice));
                compareTableBody.innerHTML = itemQuotes.map(quote => {
                    const isLowest = quote.quotedUnitPrice === minPrice;
                    return `<tr class="${isLowest ? 'table-success' : ''}"><td>${quote.supplier}</td><td class="text-right"><strong>${formatCurrency(quote.quotedUnitPrice)}</strong></td><td>${quote.notes || ''}</td><td><button class="btn btn-sm btn-success btn-select-quote" data-item-id="${item.id}" data-supplier="${quote.supplier}" data-price="${quote.quotedUnitPrice}">選用</button></td></tr>`;
                }).join('');
            }
            document.getElementById('priceCompareModal').style.display = 'flex';
        }

        function selectQuote(itemId, supplier, price) {
            closeModal('priceCompareModal');
            openOrderModal(null, itemId);
            setTimeout(() => {
                const supplierEl = document.getElementById('supplier');
                const unitPriceEl = document.getElementById('unitPrice');
                if (supplierEl) supplierEl.value = supplier;
                if (unitPriceEl) unitPriceEl.value = price;
            }, 100);
        }
        
        function openOrderModal(orderData = null, detailItemId = null) {
            const modal = document.getElementById('orderModal');
            const form = document.getElementById('orderForm');
            const deleteBtn = document.getElementById('deleteOrderBtn');
            if (!form) return;
            form.reset();
            if (orderData) {
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
                if(deleteBtn) deleteBtn.style.display = 'inline-block';
            } else {
                document.getElementById('modalTitle').textContent = '新增採購單';
                document.getElementById('orderId').value = '';
                const item = detailItems.find(i => i.id === detailItemId);
                document.getElementById('detailItemId').value = item.id;
                document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`;
                if(deleteBtn) deleteBtn.style.display = 'none';
            }
            if(modal) modal.style.display = 'flex';
        }

        async function handleFormSubmit(e) {
            e.preventDefault();
            const orderId = document.getElementById('orderId').value;
            const detailItemId = document.getElementById('detailItemId').value;
            const quantity = parseFloat(document.getElementById('purchaseQuantity').value);
            const price = parseFloat(document.getElementById('unitPrice').value);
            const data = { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: detailItemId, supplier: document.getElementById('supplier').value.trim(), purchaseQuantity: quantity, unitPrice: price, totalPrice: quantity * price, status: document.getElementById('status').value, orderDate: document.getElementById('orderDate').value, notes: document.getElementById('notes').value.trim(), updatedBy: currentUser.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            showLoading(true, '儲存中...');
            try {
                if (orderId) {
                    await db.collection('purchaseOrders').doc(orderId).update(data);
                } else {
                    data.createdBy = currentUser.email;
                    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const item = detailItems.find(i => i.id === detailItemId);
                    data.itemName = item.name;
                    data.itemSequence = item.sequence;
                    await db.collection('purchaseOrders').add(data);
                }
                closeModal('orderModal');
                await onTenderChange(selectedTender.id);
                showAlert('✅ 儲存成功！', 'success');
            } catch (error) {
                showAlert('儲存失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }

        async function deleteOrder() {
            const orderId = document.getElementById('orderId').value;
            if (!orderId) return;
            if (!confirm('您確定要刪除這筆採購單嗎？此操作無法復原。')) return;
            showLoading(true, '刪除中...');
            try {
                await db.collection('purchaseOrders').doc(orderId).delete();
                closeModal('orderModal');
                await onTenderChange(selectedTender.id);
                showAlert('✅ 採購單已刪除！', 'success');
            } catch (error) {
                showAlert('刪除失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
        
        function showAlert(message, type = 'info') { alert(`[${type.toUpperCase()}] ${message}`); }
        function closeModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; }
        function formatCurrency(amount) { if (amount === null || amount === undefined || isNaN(amount)) return 'N/A'; return `NT$ ${parseInt(amount, 10).toLocaleString()}`; }
        function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const p = loadingEl.querySelector('p'); if(p) p.textContent = message; } }
        function populateSelect(selectEl, options, defaultText, emptyText = '沒有可選項') { let html = `<option value="">${defaultText}</option>`; if (options.length === 0 && emptyText) { html += `<option value="" disabled>${emptyText}</option>`; } else { options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); } selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
        function resetSelects(from = 'project') { const selects = ['tender', 'majorItem']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } showMainContent(false); }
        function showMainContent(shouldShow) { document.getElementById('mainContent').style.display = shouldShow ? 'block' : 'none'; document.getElementById('emptyState').style.display = shouldShow ? 'none' : 'flex'; }
        function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }

        // --- 執行核心邏輯 ---
        runPageLogic();
    });
}
