/**
 * 廠商詢價與成本管理 (quotes-import-cost.js)
 * 支援專案 -> 標單 -> 大項目三層選擇與 Excel 匯入匯出
 */
function initQuotesImportCostPage() {
    console.log("🚀 開始執行 initQuotesImportCostPage...");

    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
            return;
        }
        const interval = setInterval(() => {
            if (document.querySelector(selector)) {
                clearInterval(interval);
                callback();
            }
        }, 100);
    }

    waitForElement('#projectSelect', () => {
        console.log("✅ 廠商詢價頁面 HTML 已就緒，開始載入...");

        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let selectedProject = null, selectedTender = null, selectedMajorItem = null;

        const projectSelect = document.getElementById('projectSelect');
        const tenderSelect = document.getElementById('tenderSelect');
        const majorItemSelect = document.getElementById('majorItemSelect');
        const costTableBody = document.getElementById('costTableBody');
        const mainContent = document.getElementById('mainContent');
        const emptyState = document.getElementById('emptyState');
        const saveCostBtn = document.getElementById('saveCostBtn');
        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('exportBtn');
        const importInput = document.getElementById('importInput');

        async function initializePage() {
            if (!auth.currentUser) return;
            setupEventListeners();
            await loadProjectsData();
        }

        async function loadProjectsData() {
            try {
                const allProjects = await loadProjects();
                const userEmail = auth.currentUser.email;
                projects = allProjects.filter(p => {
                    const member = p.members && p.members[userEmail];
                    return p.createdBy === userEmail || (member && (member.role === 'owner' || member.role === 'editor'));
                });

                populateSelect(projectSelect, projects, '請選擇專案...');
            } catch (err) {
                console.error("載入專案失敗:", err);
                showAlert('載入專案失敗', 'error');
            }
        }

        async function onProjectChange(projectId) {
            resetSelects('tender');
            if (!projectId) {
                selectedProject = null;
                return;
            }
            selectedProject = projects.find(p => p.id === projectId);
            tenderSelect.innerHTML = '<option value="">載入中...</option>';
            tenderSelect.disabled = true;

            try {
                const snapshot = await db.collection('tenders')
                    .where('projectId', '==', projectId)
                    .get();
                tenders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (err) {
                console.error("載入標單失敗:", err);
                tenderSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            if (!tenderId) {
                selectedTender = null;
                return;
            }
            selectedTender = tenders.find(t => t.id === tenderId);
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            try {
                const snapshot = await db.collection('majorItems')
                    .where('tenderId', '==', tenderId)
                    .where('projectId', '==', selectedProject.id)
                    .get();
                majorItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
            } catch (err) {
                console.error("載入大項目失敗:", err);
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onMajorItemChange(majorItemId) {
            hideContent();
            if (!majorItemId) {
                selectedMajorItem = null;
                return;
            }
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);

            try {
                const snapshot = await db.collection('detailItems')
                    .where('majorItemId', '==', majorItemId)
                    .where('projectId', '==', selectedProject.id)
                    .get();

                detailItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                detailItems.sort(naturalSequenceSort);

                renderCostTable();
                showContent();
            } catch (err) {
                console.error("載入細項失敗:", err);
                showAlert('載入細項失敗: ' + err.message, 'error');
            }
        }

        // 自動格式化項次：遇第一個半形/全形左括號時換行
        function formatSequence(seq) {
            if (!seq) return '';
            const match = String(seq).match(/^([^(（]+)(.*)$/);
            if (match && match[2]) {
                return `${match[1]}<br><span class="text-muted" style="font-size: 0.9em;">${match[2]}</span>`;
            }
            return seq;
        }

        // 🎯 統整數量的判斷邏輯（與 tenders-procurement.js 保持一致）
        function getItemQuantity(item) {
            if (item.totalQuantity !== undefined && item.totalQuantity !== null) return Number(item.totalQuantity);
            if (item.quantity !== undefined && item.quantity !== null) return Number(item.quantity);
            if (item.qty !== undefined && item.qty !== null) return Number(item.qty);
            if (item.tenderQuantity !== undefined && item.tenderQuantity !== null) return Number(item.tenderQuantity);
            return 0;
        }

        // 🎯 統整預算單價的判斷邏輯
        function getItemUnitPrice(item) {
            if (item.unitPrice !== undefined && item.unitPrice !== null) return Number(item.unitPrice);
            if (item.cost !== undefined && item.cost !== null) return Number(item.cost);
            if (item.tenderUnitPrice !== undefined && item.tenderUnitPrice !== null) return Number(item.tenderUnitPrice);
            return 0;
        }

        function renderCostTable() {
            if (detailItems.length === 0) {
                costTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">此大項目下無細項資料</td></tr>';
                toggleButtons(false);
                return;
            }

            let html = '';
            detailItems.forEach(item => {
                const quotePrice = (item.quotePrice !== undefined && item.quotePrice !== null) ? item.quotePrice : '';
                const vendorName = item.vendorName || '';
                const costRemark = item.costRemark || '';

                const rawQuantity = getItemQuantity(item);
                const rawUnitPrice = getItemUnitPrice(item);

                html += `
                    <tr data-item-id="${item.id}">
                        <td class="text-center align-middle" style="line-height: 1.3;">${formatSequence(item.sequence)}</td>
                        <td>
                            <div class="fw-bold">${item.name || ''}</div>
                            ${item.spec ? `<small class="text-muted">${item.spec}</small>` : ''}
                        </td>
                        <td class="text-center">${item.unit || ''}</td>
                        <td class="text-end fw-bold">${rawQuantity.toLocaleString()}</td>
                        <td class="text-end text-muted">${rawUnitPrice.toLocaleString()}</td>
                        <td>
                            <input type="number" class="form-control form-control-sm text-end input-quote-price" 
                                value="${quotePrice}" placeholder="0" min="0" data-item-id="${item.id}">
                        </td>
                        <td>
                            <input type="text" class="form-control form-control-sm input-vendor-name" 
                                value="${vendorName}" placeholder="廠商名稱" data-item-id="${item.id}">
                        </td>
                        <td>
                            <input type="text" class="form-control form-control-sm input-cost-remark" 
                                value="${costRemark}" placeholder="備註" data-item-id="${item.id}">
                        </td>
                    </tr>
                `;
            });

            costTableBody.innerHTML = html;
            toggleButtons(true);
        }

        async function saveAllCosts() {
            if (!selectedMajorItem || detailItems.length === 0) return;
            toggleButtons(false, true);

            try {
                const batch = db.batch();
                const rows = costTableBody.querySelectorAll('tr[data-item-id]');

                rows.forEach(row => {
                    const itemId = row.dataset.itemId;
                    const quotePriceInput = row.querySelector('.input-quote-price');
                    const vendorNameInput = row.querySelector('.input-vendor-name');
                    const remarkInput = row.querySelector('.input-cost-remark');

                    const quotePrice = quotePriceInput && quotePriceInput.value !== '' ? parseFloat(quotePriceInput.value) : null;
                    const vendorName = vendorNameInput ? vendorNameInput.value.trim() : '';
                    const costRemark = remarkInput ? remarkInput.value.trim() : '';

                    const docRef = db.collection('detailItems').doc(itemId);
                    batch.update(docRef, {
                        quotePrice: quotePrice,
                        vendorName: vendorName,
                        costRemark: costRemark,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                showAlert('✅ 成本與詢價資料儲存成功！', 'success');
            } catch (err) {
                console.error("儲存失敗:", err);
                showAlert('儲存失敗: ' + err.message, 'error');
            } finally {
                toggleButtons(true);
            }
        }

        // --- Excel 匯出功能 ---
        function exportToExcel() {
            if (!selectedMajorItem || detailItems.length === 0) {
                return showAlert('沒有資料可匯出', 'error');
            }

            const header = ['項次', '細項名稱', '單位', '數量', '預算單價', '報價單價', '報價廠商', '備註'];
            const data = [header];

            detailItems.forEach(item => {
                const row = costTableBody.querySelector(`tr[data-item-id="${item.id}"]`);
                const quotePrice = row ? row.querySelector('.input-quote-price')?.value || '' : (item.quotePrice || '');
                const vendorName = row ? row.querySelector('.input-vendor-name')?.value || '' : (item.vendorName || '');
                const remark = row ? row.querySelector('.input-cost-remark')?.value || '' : (item.costRemark || '');

                const rawQuantity = getItemQuantity(item);
                const rawUnitPrice = getItemUnitPrice(item);

                data.push([
                    item.sequence || '',
                    item.name || '',
                    item.unit || '',
                    rawQuantity,
                    rawUnitPrice,
                    quotePrice,
                    vendorName,
                    remark
                ]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '廠商詢價表');

            const fileName = `${selectedProject.name}_${selectedTender.name}_${selectedMajorItem.name}_詢價表.xlsx`;
            XLSX.writeFile(workbook, fileName);
        }

        // --- Excel 匯入功能 ---
        function handleFileImport(event) {
            const file = event.target.files[0];
            if (!file || !selectedMajorItem) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (jsonData.length <= 1) {
                        return showAlert('Excel 檔案內無有效資料', 'warning');
                    }

                    let matchCount = 0;
                    jsonData.slice(1).forEach(row => {
                        const sequence = row[0];
                        const quotePrice = row[5] !== undefined ? row[5] : '';
                        const vendorName = row[6] || '';
                        const remark = row[7] || '';

                        const targetItem = detailItems.find(i => String(i.sequence) === String(sequence));
                        if (targetItem) {
                            const tr = costTableBody.querySelector(`tr[data-item-id="${targetItem.id}"]`);
                            if (tr) {
                                if (quotePrice !== '') tr.querySelector('.input-quote-price').value = quotePrice;
                                if (vendorName !== '') tr.querySelector('.input-vendor-name').value = vendorName;
                                if (remark !== '') tr.querySelector('.input-cost-remark').value = remark;
                                matchCount++;
                            }
                        }
                    });

                    showAlert(`✅ 成功比對並帶入 ${matchCount} 筆詢價資料！請確認後點擊「儲存成本詢價」。`, 'success');
                } catch (err) {
                    console.error("匯入失敗:", err);
                    showAlert('匯入失敗，請確認檔案結構是否符合規定格式', 'error');
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // --- 輔助函式 ---
        function setupEventListeners() {
            projectSelect?.addEventListener('change', (e) => onProjectChange(e.target.value));
            tenderSelect?.addEventListener('change', (e) => onTenderChange(e.target.value));
            majorItemSelect?.addEventListener('change', (e) => onMajorItemChange(e.target.value));
            saveCostBtn?.addEventListener('click', saveAllCosts);
            exportBtn?.addEventListener('click', exportToExcel);
            importBtn?.addEventListener('click', () => importInput.click());
            importInput?.addEventListener('change', handleFileImport);
        }

        function populateSelect(selectEl, options, defaultText) {
            let html = `<option value="">${defaultText}</option>`;
            options.forEach(opt => {
                html += `<option value="${opt.id}">${opt.name}</option>`;
            });
            selectEl.innerHTML = html;
            selectEl.disabled = options.length === 0;
        }

        function resetSelects(from = 'tender') {
            const list = [
                { id: 'tender', el: tenderSelect, defaultMsg: '請先選擇專案' },
                { id: 'majorItem', el: majorItemSelect, defaultMsg: '請先選擇標單' }
            ];
            const startIdx = list.findIndex(x => x.id === from);
            for (let i = startIdx; i < list.length; i++) {
                if (list[i].el) {
                    list[i].el.innerHTML = `<option value="">${list[i].defaultMsg}</option>`;
                    list[i].el.disabled = true;
                }
            }
            hideContent();
        }

        function showContent() {
            mainContent.style.display = 'block';
            emptyState.style.display = 'none';
        }

        function hideContent() {
            mainContent.style.display = 'none';
            emptyState.style.display = 'flex';
            toggleButtons(false);
        }

        function toggleButtons(enable, isSaving = false) {
            saveCostBtn.disabled = !enable || isSaving;
            importBtn.disabled = !enable || isSaving;
            exportBtn.disabled = !enable || isSaving;
        }

        function naturalSequenceSort(a, b) {
            const re = /(\d+(\.\d+)?)|(\D+)/g;
            const pA = String(a.sequence || '').match(re) || [];
            const pB = String(b.sequence || '').match(re) || [];
            for (let i = 0; i < Math.min(pA.length, pB.length); i++) {
                const nA = parseFloat(pA[i]), nB = parseFloat(pB[i]);
                if (!isNaN(nA) && !isNaN(nB)) { if (nA !== nB) return nA - nB; }
                else if (pA[i] !== pB[i]) return pA[i].localeCompare(pB[i]);
            }
            return pA.length - pB.length;
        }

        // 啟動頁面
        initializePage();
    });
}
