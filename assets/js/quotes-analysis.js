/**
 * 對業主報價與利潤分析 (quotes-analysis.js)
 * 支援全專案/各大項目之對業主單價調整、預估毛利與毛利率即時計算與 Excel 報價單匯出
 */
function initQuotesAnalysisPage() {
    console.log("🚀 開始執行 initQuotesAnalysisPage...");

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

    waitForElement('#analysisProjectSelect', () => {
        console.log("✅ 對業主報價頁面 HTML 已就緒...");

        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let selectedProject = null, selectedTender = null, selectedMajorItemId = "ALL";

        const projectSelect = document.getElementById('analysisProjectSelect');
        const tenderSelect = document.getElementById('analysisTenderSelect');
        const majorItemSelect = document.getElementById('analysisMajorItemSelect');
        const tableBody = document.getElementById('analysisTableBody');
        const mainContent = document.getElementById('analysisMainContent');
        const emptyState = document.getElementById('analysisEmptyState');
        const summaryCards = document.getElementById('summaryCardsSection');
        const saveBtn = document.getElementById('saveOwnerQuoteBtn');
        const exportBtn = document.getElementById('exportQuoteBtn');

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
            if (!projectId) { selectedProject = null; return; }
            selectedProject = projects.find(p => p.id === projectId);
            tenderSelect.innerHTML = '<option value="">載入中...</option>';
            tenderSelect.disabled = true;

            try {
                const snapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
                tenders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (err) {
                console.error("載入標單失敗:", err);
            }
        }

        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            if (!tenderId) { selectedTender = null; return; }
            selectedTender = tenders.find(t => t.id === tenderId);
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            try {
                const snapshot = await db.collection('majorItems')
                    .where('tenderId', '==', tenderId)
                    .where('projectId', '==', selectedProject.id)
                    .get();
                majorItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                let html = '<option value="ALL">全專案 (全部大項目)</option>';
                majorItems.forEach(m => html += `<option value="${m.id}">${m.name}</option>`);
                majorItemSelect.innerHTML = html;
                majorItemSelect.disabled = false;

                await fetchDetailItems();
            } catch (err) {
                console.error("載入大項目失敗:", err);
            }
        }

        async function fetchDetailItems() {
            try {
                const snapshot = await db.collection('detailItems')
                    .where('tenderId', '==', selectedTender.id)
                    .where('projectId', '==', selectedProject.id)
                    .get();

                detailItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                detailItems.sort(naturalSequenceSort);

                renderAnalysisTable();
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

        function getItemQuantity(item) {
            if (item.totalQuantity !== undefined && item.totalQuantity !== null) return Number(item.totalQuantity);
            if (item.quantity !== undefined && item.quantity !== null) return Number(item.quantity);
            if (item.qty !== undefined && item.qty !== null) return Number(item.qty);
            if (item.tenderQuantity !== undefined && item.tenderQuantity !== null) return Number(item.tenderQuantity);
            return 0;
        }

        function getItemUnitPrice(item) {
            if (item.unitPrice !== undefined && item.unitPrice !== null) return Number(item.unitPrice);
            if (item.cost !== undefined && item.cost !== null) return Number(item.cost);
            if (item.tenderUnitPrice !== undefined && item.tenderUnitPrice !== null) return Number(item.tenderUnitPrice);
            return 0;
        }

        function renderAnalysisTable() {
            selectedMajorItemId = majorItemSelect.value || "ALL";
            const filteredItems = selectedMajorItemId === "ALL" 
                ? detailItems 
                : detailItems.filter(i => i.majorItemId === selectedMajorItemId);

            if (filteredItems.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">無細項資料</td></tr>';
                toggleButtons(false);
                calculateSummary(filteredItems);
                return;
            }

            let html = '';
            filteredItems.forEach(item => {
                const qty = getItemQuantity(item);
                const costPrice = (item.quotePrice !== undefined && item.quotePrice !== null) ? Number(item.quotePrice) : 0;
                const ownerPrice = (item.ownerPrice !== undefined && item.ownerPrice !== null) ? item.ownerPrice : (item.tenderUnitPrice || getItemUnitPrice(item));

                html += `
                    <tr data-item-id="${item.id}">
                        <td class="text-center align-middle" style="line-height: 1.3; min-width: 110px;">${formatSequence(item.sequence)}</td>
                        <td class="align-middle">
                            <div class="fw-bold">${item.name || ''}</div>
                            ${item.spec ? `<small class="text-muted">${item.spec}</small>` : ''}
                        </td>
                        <td class="text-center align-middle">${item.unit || ''}</td>
                        <td class="text-end fw-bold align-middle col-qty">${qty.toLocaleString()}</td>
                        <td class="text-end text-muted align-middle col-cost-price">${costPrice.toLocaleString()}</td>
                        <td class="align-middle">
                            <input type="number" class="form-control form-control-sm text-end input-owner-price" 
                                value="${ownerPrice}" placeholder="0" min="0" data-item-id="${item.id}">
                        </td>
                        <td class="text-end fw-bold align-middle col-owner-subtotal">0</td>
                        <td class="text-end align-middle col-margin">0</td>
                        <td class="text-end align-middle col-margin-rate">0%</td>
                    </tr>
                `;
            });

            tableBody.innerHTML = html;
            toggleButtons(true);

            // 綁定動態試算事件
            tableBody.querySelectorAll('.input-owner-price').forEach(input => {
                input.addEventListener('input', updateRowCalculations);
            });

            updateRowCalculations();
        }

        function updateRowCalculations() {
            let totalCost = 0, totalBudget = 0, totalOwner = 0;

            const rows = tableBody.querySelectorAll('tr[data-item-id]');
            rows.forEach(row => {
                const itemId = row.dataset.itemId;
                const item = detailItems.find(i => i.id === itemId);
                if (!item) return;

                const qty = getItemQuantity(item);
                const budgetPrice = getItemUnitPrice(item);
                const costPrice = (item.quotePrice !== undefined && item.quotePrice !== null) ? Number(item.quotePrice) : 0;

                const ownerInput = row.querySelector('.input-owner-price');
                const ownerPrice = ownerInput && ownerInput.value !== '' ? parseFloat(ownerInput.value) : 0;

                const ownerSubtotal = qty * ownerPrice;
                const costSubtotal = qty * costPrice;
                const budgetSubtotal = qty * budgetPrice;

                const profit = ownerSubtotal - costSubtotal;
                const marginRate = ownerSubtotal > 0 ? ((profit / ownerSubtotal) * 100).toFixed(1) : 0;

                row.querySelector('.col-owner-subtotal').textContent = 'NT$ ' + Math.round(ownerSubtotal).toLocaleString();
                
                const marginTd = row.querySelector('.col-margin');
                marginTd.textContent = 'NT$ ' + Math.round(profit).toLocaleString();
                marginTd.className = `text-end align-middle col-margin ${profit >= 0 ? 'text-success' : 'text-danger'}`;

                const rateTd = row.querySelector('.col-margin-rate');
                rateTd.textContent = marginRate + '%';
                rateTd.className = `text-end align-middle col-margin-rate ${profit >= 0 ? 'text-success' : 'text-danger'}`;

                totalCost += costSubtotal;
                totalBudget += budgetSubtotal;
                totalOwner += ownerSubtotal;
            });

            const totalProfit = totalOwner - totalCost;
            const totalMarginRate = totalOwner > 0 ? ((totalProfit / totalOwner) * 100).toFixed(1) : 0;

            document.getElementById('totalCostVal').textContent = 'NT$ ' + Math.round(totalCost).toLocaleString();
            document.getElementById('totalBudgetVal').textContent = 'NT$ ' + Math.round(totalBudget).toLocaleString();
            document.getElementById('totalOwnerVal').textContent = 'NT$ ' + Math.round(totalOwner).toLocaleString();
            
            const marginValEl = document.getElementById('totalMarginVal');
            marginValEl.textContent = `NT$ ${Math.round(totalProfit).toLocaleString()} (${totalMarginRate}%)`;
            marginValEl.className = `stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`;
        }

        async function saveOwnerQuotes() {
            if (!selectedTender || detailItems.length === 0) return;
            toggleButtons(false, true);

            try {
                const batch = db.batch();
                const rows = tableBody.querySelectorAll('tr[data-item-id]');

                rows.forEach(row => {
                    const itemId = row.dataset.itemId;
                    const input = row.querySelector('.input-owner-price');
                    const ownerPrice = input && input.value !== '' ? parseFloat(input.value) : null;

                    const docRef = db.collection('detailItems').doc(itemId);
                    batch.update(docRef, {
                        ownerPrice: ownerPrice,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                showAlert('✅ 對業主報價資料儲存成功！', 'success');
            } catch (err) {
                console.error("儲存失敗:", err);
                showAlert('儲存失敗: ' + err.message, 'error');
            } finally {
                toggleButtons(true);
            }
        }

        function exportQuoteToExcel() {
            if (!selectedTender || detailItems.length === 0) return showAlert('沒有資料可匯出', 'error');

            const header = ['項次', '細項名稱', '單位', '數量', '對業主報價單價', '報價複價'];
            const data = [header];

            const filteredItems = selectedMajorItemId === "ALL" 
                ? detailItems 
                : detailItems.filter(i => i.majorItemId === selectedMajorItemId);

            filteredItems.forEach(item => {
                const row = tableBody.querySelector(`tr[data-item-id="${item.id}"]`);
                const ownerPrice = row ? parseFloat(row.querySelector('.input-owner-price')?.value || 0) : (item.ownerPrice || 0);
                const qty = getItemQuantity(item);

                data.push([
                    item.sequence || '',
                    item.name || '',
                    item.unit || '',
                    qty,
                    ownerPrice,
                    qty * ownerPrice
                ]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, '對業主報價單');

            const majorName = selectedMajorItemId === "ALL" ? "全專案" : majorItems.find(m => m.id === selectedMajorItemId)?.name || '';
            const fileName = `${selectedProject.name}_${selectedTender.name}_${majorName}_對業主報價單.xlsx`;
            XLSX.writeFile(workbook, fileName);
        }

        function setupEventListeners() {
            projectSelect?.addEventListener('change', (e) => onProjectChange(e.target.value));
            tenderSelect?.addEventListener('change', (e) => onTenderChange(e.target.value));
            majorItemSelect?.addEventListener('change', renderAnalysisTable);
            saveBtn?.addEventListener('click', saveOwnerQuotes);
            exportBtn?.addEventListener('click', exportQuoteToExcel);
        }

        function populateSelect(selectEl, options, defaultText) {
            let html = `<option value="">${defaultText}</option>`;
            options.forEach(opt => html += `<option value="${opt.id}">${opt.name}</option>`);
            selectEl.innerHTML = html;
            selectEl.disabled = options.length === 0;
        }

        function resetSelects(from = 'tender') {
            tenderSelect.innerHTML = '<option value="">請先選擇專案</option>';
            tenderSelect.disabled = true;
            majorItemSelect.innerHTML = '<option value="">請先選擇標單</option>';
            majorItemSelect.disabled = true;
            hideContent();
        }

        function showContent() {
            mainContent.style.display = 'block';
            summaryCards.style.display = 'flex';
            emptyState.style.display = 'none';
        }

        function hideContent() {
            mainContent.style.display = 'none';
            summaryCards.style.display = 'none';
            emptyState.style.display = 'flex';
            toggleButtons(false);
        }

        function toggleButtons(enable, isSaving = false) {
            saveBtn.disabled = !enable || isSaving;
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

        initializePage();
    });
}
