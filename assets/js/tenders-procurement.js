/**
 * 標單採購管理 (tenders-procurement.js) - v3.3 (修正資料庫連線實例問題)
 */
function initProcurementPage() {
    console.log("🚀 [1/4] 初始化標單採購管理頁面...");

    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`✅ [2/4] 元素 "${selector}" 已找到，立即執行。`);
            callback();
            return;
        }
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

    waitForElement('#projectSelect', () => {
        
        let projects = [], tenders = [], majorItems = [], detailItems = [], purchaseOrders = [], quotations = [];
        let selectedProject = null, selectedTender = null;
        
        // 【核心修正】移除此處的 const db = firebase.firestore();
        // 讓此檔案使用 firebase-config.js 中已初始化的全域 db 變數
        const currentUser = firebase.auth().currentUser;

        async function runPageLogic() {
            console.log("🚀 [3/4] 核心邏輯啟動...");
            if (!currentUser) return showAlert("使用者未登入", "error");
            if (!db) return showAlert("資料庫尚未初始化，請重新整理頁面。", "error"); // 增加保護
            setupEventListeners();
            await loadProjectsWithPermission();
            console.log("✅ [4/4] 頁面初始化完成。");
        }
        
        function naturalSequenceSort(a, b) {
            const CHINESE_NUM_MAP = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'甲':1,'乙':2,'丙':3,'丁':4,'戊':5,'己':6,'庚':7,'辛':8,'壬':9,'癸':10};
            const re = /(\d+(\.\d+)?)|([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸])|(\D+)/g;
            const seqA = String(a.sequence || '');
            const seqB = String(b.sequence || '');
            const partsA = seqA.match(re) || [];
            const partsB = seqB.match(re) || [];
            const len = Math.min(partsA.length, partsB.length);
            for(let i=0; i<len; i++) {
                const partA = partsA[i];
                const partB = partsB[i];
                let numA = parseFloat(partA);
                let numB = parseFloat(partB);
                if(isNaN(numA)) numA = CHINESE_NUM_MAP[partA];
                if(isNaN(numB)) numB = CHINESE_NUM_MAP[partB];
                if(numA !== undefined && numB !== undefined) {
                    if(numA !== numB) return numA - numB;
                } else {
                    const comparison = partA.localeCompare(partB);
                    if(comparison !== 0) return comparison;
                }
            }
            return partsA.length - partsB.length;
        }

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
            safeAddEventListener('#manageQuotesBtn', 'click', openManageQuotesModal);
            
            document.body.addEventListener('click', (e) => {
                const compareBtn = e.target.closest('.btn-compare-price');
                const addBtn = e.target.closest('.btn-add-order');
                const selectQuoteBtn = e.target.closest('.btn-select-quote');
                const orderChip = e.target.closest('.order-chip');
                const closeModalBtn = e.target.closest('.modal-close, #cancelCompareModalBtn, #cancelOrderModalBtn');
                const deleteQuoteBtn = e.target.closest('.btn-delete-supplier-quotes');

                if (compareBtn) {
                    e.preventDefault();
                    showPriceComparisonModal(compareBtn.dataset.itemId);
                } else if (addBtn) {
                    e.preventDefault();
                    openOrderModal(null, addBtn.dataset.itemId);
                } else if (selectQuoteBtn) {
                    e.preventDefault();
                    const { itemId, supplier, price } = selectQuoteBtn.dataset;
                    selectQuote(itemId, supplier, parseFloat(price));
                } else if (orderChip) {
                    e.preventDefault();
                    const order = purchaseOrders.find(o => o.id === orderChip.dataset.orderId);
                    if (order) openOrderModal(order);
                } else if (closeModalBtn) {
                    e.preventDefault();
                    const modal = closeModalBtn.closest('.modal-overlay');
                    if(modal) closeModal(modal.id);
                } else if (deleteQuoteBtn) {
                    e.preventDefault();
                    deleteSupplierQuotes(deleteQuoteBtn.dataset.supplier);
                }
            });

            document.body.addEventListener('submit', (e) => {
                if (e.target.id === 'orderForm') {
                    handleFormSubmit(e);
                }
            });
            safeAddEventListener('#deleteOrderBtn', 'click', deleteOrder);
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
            if (!tableBody) return;
            const majorItemsToRender = filterMajorItemId 
                ? majorItems.filter(m => m.id === filterMajorItemId) 
                : majorItems;

            if (majorItemsToRender.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 2rem;">此標單 (或篩選條件) 下沒有大項目。</td></tr>`;
                return;
            }

            let bodyHTML = '';

            majorItemsToRender.forEach(majorItem => {
                bodyHTML += `<tr class="major-item-header"><td colspan="7">${majorItem.sequence || ''}. ${majorItem.name}</td></tr>`;
                
                const itemsToRender = detailItems.filter(item => item.majorItemId === majorItem.id);

                if (itemsToRender.length === 0) {
                    bodyHTML += `<tr><td colspan="7" class="text-center" style="padding: 1rem; font-style: italic;">此大項目下沒有細項。</td></tr>`;
                } else {
                    itemsToRender.forEach(item => {
                        const orders = purchaseOrders.filter(o => o.detailItemId === item.id);
                        const quotes = quotations.filter(q => q.detailItemId === item.id);
                        const totalPurchased = orders.reduce((sum, o) => sum + (o.purchaseQuantity || 0), 0);
                        const remainingQty = (item.totalQuantity || 0) - totalPurchased;
                        const statusClass = remainingQty <= 0 ? 'status-completed' : (totalPurchased > 0 ? 'status-active' : 'status-planning');
                        
                        bodyHTML += `<tr class="item-row ${statusClass}">
                            <td style="padding-left: 2em;">${item.sequence || ''}</td>
                            <td>${item.name}</td>
                            <td class="text-right">${item.totalQuantity || 0}</td>
                            <td class="text-right">${totalPurchased}</td>
                            <td class="text-right">${remainingQty}</td>
                            <td><div class="order-list">${orders.map(o => `<div class="order-chip status-${o.status || '草稿'}" data-order-id="${o.id}"><span>${o.supplier}: ${o.purchaseQuantity} (${o.status})</span></div>`).join('')}${quotes.map(q => `<div class="quote-chip" title="報價 by ${q.supplier}"><span>${q.supplier}: ${formatCurrency(q.quotedUnitPrice)}</span></div>`).join('')}</div></td>
                            <td><div class="action-buttons"><button class="btn btn-sm btn-info btn-compare-price" data-item-id="${item.id}" title="比價">📊</button><button class="btn btn-sm btn-success btn-add-order" data-item-id="${item.id}" title="新增採購">+</button></div></td>
                        </tr>`;
                    });
                }
            });
            tableBody.innerHTML = bodyHTML;
        }

        function exportRfqExcel() {
            if (!selectedTender || detailItems.length === 0) {
                return showAlert('請先選擇一個標單以匯出詢價單。', 'warning');
            }
            const filterMajorItemId = document.getElementById('majorItemSelect').value;
            const majorItemsToExport = filterMajorItemId ? majorItems.filter(m => m.id === filterMajorItemId) : majorItems;
            if (majorItemsToExport.length === 0) {
                return showAlert('沒有符合篩選條件的資料可匯出。', 'warning');
            }
            const data = [];
            const headers = ['項目', '單位', '預計數量', '報價單價', '備註'];
            data.push(headers);
            majorItemsToExport.forEach(majorItem => {
                data.push([ `${majorItem.sequence || ''}. ${majorItem.name}`, '', '', '', '' ]);
                const itemsInMajor = detailItems.filter(detail => detail.majorItemId === majorItem.id);
                itemsInMajor.forEach(item => {
                    data.push([ `  ${item.sequence || ''}. ${item.name}`, item.unit || '', item.totalQuantity || 0, '', '' ]);
                });
            });
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [ { wch: 60 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 30 } ];
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
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1, range: 1}); 
                    const batch = db.batch();
                    jsonData.forEach(row => {
                        const itemNameWithSeq = String(row[0] || '').trim();
                        const unitPrice = parseFloat(row[3]);
                        const notes = row[4] || '';
                        if (!itemNameWithSeq || isNaN(unitPrice)) return;
                        const targetItem = detailItems.find(item => `  ${item.sequence || ''}. ${item.name}`.trim() === itemNameWithSeq);
                        if (targetItem) {
                            const docRef = db.collection('quotations').doc();
                            batch.set(docRef, { projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: targetItem.id, supplier: supplier.trim(), quotedUnitPrice: unitPrice, notes: notes, quotedDate: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
            if (!item) return showAlert('找不到項目資料', 'error');
            const itemQuotes = quotations.filter(q => q.detailItemId === itemId);
            const modal = document.getElementById('priceCompareModal');
            const compareItemName = document.getElementById('compareItemName');
            const compareTableBody = document.getElementById('compareTableBody');
            if (!modal || !compareItemName || !compareTableBody) return showAlert('比價視窗元件缺失', 'error');
            compareItemName.textContent = `${item.sequence}. ${item.name}`;
            if (itemQuotes.length === 0) {
                compareTableBody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 1rem;">此項目尚無報價。</td></tr>`;
            } else {
                const minPrice = Math.min(...itemQuotes.map(q => q.quotedUnitPrice));
                compareTableBody.innerHTML = itemQuotes.map(quote => {
                    const isLowest = quote.quotedUnitPrice === minPrice;
                    return `<tr class="${isLowest ? 'table-success' : ''}"><td>${quote.supplier}</td><td class="text-right"><strong>${formatCurrency(quote.quotedUnitPrice)}</strong></td><td>${quote.notes || ''}</td><td><button class="btn btn-sm btn-success btn-select-quote" data-item-id="${item.id}" data-supplier="${quote.supplier}" data-price="${quote.quotedUnitPrice}">選用</button></td></tr>`;
                }).join('');
            }
            modal.style.display = 'flex';
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
            if (!form || !modal) return showAlert('訂單視窗元件缺失', 'error');
            form.reset();
            const item = orderData ? detailItems.find(i => i.id === orderData.detailItemId) : detailItems.find(i => i.id === detailItemId);
            if (!item) return showAlert('找不到關聯的細項資料', 'error');
            document.getElementById('itemNameDisplay').textContent = `${item.sequence}. ${item.name}`;
            document.getElementById('detailItemId').value = item.id;
            if (orderData) {
                document.getElementById('modalTitle').textContent = '編輯採購單';
                document.getElementById('orderId').value = orderData.id;
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
                if(deleteBtn) deleteBtn.style.display = 'none';
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
                projectId: selectedProject.id, tenderId: selectedTender.id, detailItemId: detailItemId, 
                supplier: document.getElementById('supplier').value.trim(), 
                purchaseQuantity: quantity, unitPrice: price, totalPrice: quantity * price, 
                status: document.getElementById('status').value, 
                orderDate: document.getElementById('orderDate').value, 
                notes: document.getElementById('notes').value.trim(), 
                updatedBy: currentUser.email, 
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (!data.supplier || isNaN(quantity) || isNaN(price)) {
                return showAlert('供應商、數量和單價為必填欄位。', 'warning');
            }
            showLoading(true, '儲存中...');
            try {
                if (orderId) {
                    await db.collection('purchaseOrders').doc(orderId).update(data);
                } else {
                    data.createdBy = currentUser.email;
                    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const item = detailItems.find(i => i.id === detailItemId);
                    if (item) {
                        data.itemName = item.name;
                        data.itemSequence = item.sequence;
                    }
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

        function openManageQuotesModal() {
            if (!selectedTender) {
                return showAlert('請先選擇一個標單。', 'warning');
            }
            const modal = document.getElementById('manageQuotesModal');
            const listEl = document.getElementById('supplierQuotesList');
            if (!modal || !listEl) return showAlert('管理視窗元件缺失', 'error');
            const suppliers = [...new Set(quotations.map(q => q.supplier))];
            if (suppliers.length === 0) {
                listEl.innerHTML = '<p class="text-center">目前沒有任何已匯入的供應商報價。</p>';
            } else {
                listEl.innerHTML = suppliers.map(supplier => `
                    <div class="supplier-quote-item">
                        <span>${supplier}</span>
                        <button class="btn btn-sm btn-danger btn-delete-supplier-quotes" data-supplier="${supplier}">刪除此供應商的所有報價</button>
                    </div>
                `).join('');
            }
            modal.style.display = 'flex';
        }

        async function deleteSupplierQuotes(supplierName) {
            if (!supplierName) return;
            if (!confirm(`您確定要刪除供應商「${supplierName}」在本標單的所有報價紀錄嗎？\n此操作無法復原。`)) return;
            showLoading(true, `正在刪除 ${supplierName} 的報價...`);
            try {
                const quotesToDelete = quotations.filter(q => q.supplier === supplierName && q.tenderId === selectedTender.id);
                if (quotesToDelete.length === 0) {
                    showAlert('找不到可刪除的報價紀錄。', 'info');
                    return;
                }
                const batch = db.batch();
                quotesToDelete.forEach(quote => {
                    const docRef = db.collection('quotations').doc(quote.id);
                    batch.delete(docRef);
                });
                await batch.commit();
                closeModal('manageQuotesModal');
                await onTenderChange(selectedTender.id);
                showAlert(`✅ 已成功刪除供應商「${supplierName}」的所有報價。`, 'success');
            } catch (error) {
                showAlert(`刪除失敗: ${error.message}`, 'error');
            } finally {
                showLoading(false);
            }
        }
        
        function showAlert(message, type = 'info') { alert(`[${type.toUpperCase()}] ${message}`); }
        function closeModal(modalId) { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; }
        function formatCurrency(amount) { if (amount === null || amount === undefined || isNaN(amount)) return 'N/A'; return `NT$ ${parseInt(amount, 10).toLocaleString()}`; }
        function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const p = loadingEl.querySelector('p'); if(p) p.textContent = message; } }
        function populateSelect(selectEl, options, defaultText, emptyText = '沒有可選項') { if(!selectEl) return; let html = `<option value="">${defaultText}</option>`; if (options.length === 0 && emptyText) { html += `<option value="" disabled>${emptyText}</option>`; } else { options.forEach(option => { html += `<option value="${option.id}">${option.sequence || ''}. ${option.name}</option>`; }); } selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
        function resetSelects(from = 'project') { const selects = ['tender', 'majorItem']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } showMainContent(false); }
        function showMainContent(shouldShow) { const main = document.getElementById('mainContent'); const empty = document.getElementById('emptyState'); if(main) main.style.display = shouldShow ? 'block' : 'none'; if(empty) empty.style.display = shouldShow ? 'none' : 'flex'; }

        runPageLogic();
    });
}
