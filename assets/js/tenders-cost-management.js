/**
 * 成本控管分析頁面 (tenders-cost-management.js) - v1.1 (執行時機最終修正版)
 */
function initCostManagementPage() {
    console.log("🚀 初始化成本控管分析頁面 (v1.1)...");

    // 【核心修正】使用一個可靠的函數來等待頁面主要元素出現
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

    // 等待選擇專案的下拉選單出現後，才執行整個頁面的初始化邏輯
    waitForElement('#projectSelect', () => {
        console.log("✅ 成本控管頁面主要元素已載入，開始執行初始化...");

        let projects = [], tenders = [], detailItems = [], allAdditionItems = [];
        let selectedProject = null, selectedTender = null;
        const currentUser = firebase.auth().currentUser;

        async function initializePage() {
            if (!currentUser) return showAlert("使用者未登入", "error");
            setupEventListeners();
            await loadProjectsWithPermission();
            
            const params = new URLSearchParams(window.location.search);
            const tenderId = params.get('tenderId');
            const projectId = params.get('projectId');
            if (tenderId && projectId) {
                await selectInitialTender(projectId, tenderId);
            }
        }

        async function selectInitialTender(projectId, tenderId) {
            showLoading(true, '載入指定標單...');
            document.getElementById('projectSelect').value = projectId;
            await onProjectChange(projectId, false);
            document.getElementById('tenderSelect').value = tenderId;
            await onTenderChange(tenderId);
            showLoading(false);
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

        async function onProjectChange(projectId, reset = true) {
            if (reset) resetSelects('tender');
            if (!projectId) { selectedProject = null; return; }
            selectedProject = projects.find(p => p.id === projectId);
            try {
                const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
                tenders = tenderDocs.docs;
                populateSelect(document.getElementById('tenderSelect'), tenders, '請選擇標單...');
            } catch (error) { showAlert('載入標單失敗', 'error'); }
        }

        async function onTenderChange(tenderId) {
            if (!tenderId) { 
                showMainContent(false);
                return;
            }
            selectedTender = tenders.find(t => t.id === tenderId);
            showLoading(true, '載入成本資料中...');
            try {
                const [detailItemDocs, additionItemDocs] = await Promise.all([
                    safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }, { field: "isAddition", operator: "!=", value: true }]),
                    safeFirestoreQuery("detailItems", [{ field: "tenderId", operator: "==", value: tenderId }, { field: "projectId", operator: "==", value: selectedProject.id }, { field: "isAddition", operator: "==", value: true }])
                ]);
                detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
                allAdditionItems = additionItemDocs.docs.sort(naturalSequenceSort);
                
                renderCostReport();
                showMainContent(true);
            } catch(error) {
                showAlert('載入成本資料失敗: ' + error.message, 'error');
                showMainContent(false);
            } finally {
                showLoading(false);
            }
        }
        
        function renderCostReport() {
            const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const additionAmount = allAdditionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const totalAmount = originalAmount + additionAmount;
            const increasePercentage = originalAmount > 0 ? ((additionAmount / originalAmount) * 100).toFixed(2) : 0;
            
            document.getElementById('originalAmount').textContent = formatCurrency(originalAmount);
            document.getElementById('additionAmount').textContent = formatCurrency(additionAmount);
            document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
            document.getElementById('increasePercentage').textContent = `${increasePercentage}%`;
            
            document.getElementById('majorItemsCount').textContent = new Set(detailItems.map(item => item.majorItemId)).size;
            document.getElementById('detailItemsCount').textContent = detailItems.length;
            document.getElementById('additionItemsCount').textContent = allAdditionItems.length;

            const tableBody = document.getElementById('additionItemsTableBody');
            if (allAdditionItems.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 2rem;">無追加/追減項目。</td></tr>';
            } else {
                tableBody.innerHTML = allAdditionItems.map(item => `
                    <tr class="${(item.totalPrice || 0) >= 0 ? '' : 'text-danger'}">
                        <td>${item.sequence || ''}</td>
                        <td>${item.name}</td>
                        <td class="text-right">${item.totalQuantity || 0}</td>
                        <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                        <td class="text-right">${formatCurrency(item.totalPrice)}</td>
                        <td>${item.reason || '-'}</td>
                    </tr>
                `).join('');
            }
        }

        function setupEventListeners() {
            document.getElementById('projectSelect').addEventListener('change', (e) => onProjectChange(e.target.value));
            document.getElementById('tenderSelect').addEventListener('change', (e) => onTenderChange(e.target.value));
        }
        
        function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; loadingEl.querySelector('p').textContent = message; } }
        function populateSelect(selectEl, options, defaultText) { let html = `<option value="">${defaultText}</option>`; options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
        function resetSelects(from = 'project') { const selects = ['tender']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } showMainContent(false); }
        function showMainContent(shouldShow) { document.getElementById('mainContent').style.display = shouldShow ? 'block' : 'none'; document.getElementById('emptyState').style.display = shouldShow ? 'none' : 'flex'; }
        function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }
        function formatCurrency(amount) { if (amount === null || amount === undefined || isNaN(amount)) return 'NT$ 0'; return 'NT$ ' + parseInt(amount, 10).toLocaleString(); }
        
        initializePage();
    });
}
