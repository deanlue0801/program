/**
 * 標單採購管理 (tenders-procurement.js) - v2.0 (詢價比價功能版)
 */
function initProcurementPage() {
    console.log("🚀 初始化標單採購管理頁面 (v2.0)...");

    let projects = [], tenders = [], majorItems = [], detailItems = [], purchaseOrders = [], quotations = [];
    let selectedProject = null, selectedTender = null;
    const currentUser = firebase.auth().currentUser;

    async function initializePage() { /* ...維持不變... */ }
    async function loadProjectsWithPermission() { /* ...維持不變... */ }
    async function onProjectChange(projectId) { /* ...維持不變... */ }

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
                safeFirestoreQuery("quotations", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }]) // <-- 載入報價
            ]);
            majorItems = majorItemDocs.docs.sort(naturalSequenceSort);
            detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
            purchaseOrders = orderDocs.docs;
            quotations = quoteDocs.docs; // <-- 儲存報價
            populateSelect(document.getElementById('majorItemSelect'), majorItems, '所有大項目');
            renderProcurementTable();
            showMainContent(true);
        } catch(error) {
            showAlert('載入標單資料失敗: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function onMajorItemChange(majorItemId) { /* ...維持不變... */ }
    
    function renderProcurementTable(filterMajorItemId = '') {
        const tableBody = document.getElementById('tableBody');
        const itemsToRender = filterMajorItemId ? detailItems.filter(item => item.majorItemId === filterMajorItemId) : detailItems;
        /* ... (前半段維持不變) ... */
        let bodyHTML = '';
        itemsToRender.forEach(item => {
            const orders = purchaseOrders.filter(o => o.detailItemId === item.id);
            const quotes = quotations.filter(q => q.detailItemId === item.id);
            const totalPurchased = orders.reduce((sum, o) => sum + (o.purchaseQuantity || 0), 0);
            const remainingQty = (item.totalQuantity || 0) - totalPurchased;
            const statusClass = remainingQty <= 0 ? 'status-completed' : (totalPurchased > 0 ? 'status-active' : 'status-planning');

            bodyHTML += `
                <tr class="item-row ${statusClass}">
                    <td>${item.sequence || ''}</td>
                    <td>${item.name}</td>
                    <td class="text-right">${item.totalQuantity || 0}</td>
                    <td class="text-right">${totalPurchased}</td>
                    <td class="text-right">${remainingQty}</td>
                    <td>
                        <div class="order-list">
                            ${orders.map(o => `...`).join('')}
                            ${quotes.map(q => `
                                <div class="quote-chip" title="報價 by ${q.supplier}">
                                    <span>${q.supplier}: ${formatCurrency(q.quotedUnitPrice)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-info btn-compare-price" data-item-id="${item.id}" title="比價">📊</button>
                        <button class="btn btn-sm btn-success btn-add-order" data-item-id="${item.id}" title="新增採購">+</button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = bodyHTML;
    }
    
    // --- 【全新】詢價與比價功能 ---

    function exportRfqExcel() {
        if (!selectedTender || detailItems.length === 0) {
            return showAlert('請先選擇一個標單以匯出詢價單。', 'warning');
        }
        const data = detailItems.map(item => ({
            '項次': item.sequence || '',
            '項目名稱': item.name || '',
            '單位': item.unit || '',
            '預計數量': item.totalQuantity || 0,
            '報價單價': '', // 留空給廠商填寫
            '備註': ''      // 留空給廠商填寫
        }));
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
                        batch.set(docRef, {
                            projectId: selectedProject.id,
                            tenderId: selectedTender.id,
                            detailItemId: targetItem.id,
                            supplier: supplier,
                            quotedUnitPrice: unitPrice,
                            notes: notes,
                            quotedDate: firebase.firestore.FieldValue.serverTimestamp(),
                            createdBy: currentUser.email,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                await batch.commit();
                await onTenderChange(selectedTender.id); // 重新載入
                showAlert('✅ 報價單匯入成功！', 'success');
            } catch (error) {
                showAlert('匯入失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
                event.target.value = '';
            }
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
            // 找出最低價
            const minPrice = Math.min(...itemQuotes.map(q => q.quotedUnitPrice));
            compareTableBody.innerHTML = itemQuotes.map(quote => {
                const isLowest = quote.quotedUnitPrice === minPrice;
                return `
                    <tr class="${isLowest ? 'table-success' : ''}">
                        <td>${quote.supplier}</td>
                        <td class="text-right"><strong>${formatCurrency(quote.quotedUnitPrice)}</strong></td>
                        <td>${quote.notes || ''}</td>
                        <td>
                            <button class="btn btn-sm btn-success btn-select-quote" data-item-id="${item.id}" data-supplier="${quote.supplier}" data-price="${quote.quotedUnitPrice}">選用</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        document.getElementById('priceCompareModal').style.display = 'flex';
    }

    function selectQuote(itemId, supplier, price) {
        closeModal('priceCompareModal');
        openOrderModal(null, itemId); // 開啟新增採購單視窗
        // 自動填入選中的供應商和價格
        setTimeout(() => {
            document.getElementById('supplier').value = supplier;
            document.getElementById('unitPrice').value = price;
        }, 100);
    }

    function setupEventListeners() {
        /* ... (既有的事件監聽) ... */
        document.getElementById('exportRfqBtn').addEventListener('click', exportRfqExcel);
        document.getElementById('importQuotesBtn').addEventListener('click', () => document.getElementById('importQuotesInput').click());
        document.getElementById('importQuotesInput').addEventListener('change', handleQuoteImport);
        document.getElementById('cancelCompareModalBtn').addEventListener('click', () => closeModal('priceCompareModal'));
        
        // 使用事件委派來處理比價按鈕和選用按鈕
        document.body.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-compare-price')) {
                showPriceComparisonModal(e.target.dataset.itemId);
            }
            if (e.target.classList.contains('btn-select-quote')) {
                const { itemId, supplier, price } = e.target.dataset;
                selectQuote(itemId, supplier, parseFloat(price));
            }
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
