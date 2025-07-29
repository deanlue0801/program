/**
 * 成本控管分析頁面 (tenders-cost-management.js) - v1.3 (修正初始化錯誤)
 */
function initCostManagementPage() {
    console.log("🚀 初始化成本控管分析頁面 (v1.3)...");

    let projects = [], tenders = [], detailItems = [], allAdditionItems = [];
    let selectedProject = null, selectedTender = null;
    
    // 【核心修正】移除此處的 const currentUser = firebase.auth().currentUser;
    // 讓此檔案使用由 firebase-config.js 提供的全域 currentUser 變數

    async function initializePage() {
        // 直接使用全域的 currentUser 變數，這個變數在 router 載入此頁面前就已由 initFirebase() 準備好
        if (!currentUser) {
            showAlert("使用者驗證資訊載入中或已失效，請重新整理頁面。", "error");
            return;
        }
        
        // 使用 waitForElement 確保所有 HTML 元素都已載入
        waitForElement('#projectSelect', () => {
            console.log("✅ 成本控管頁面主要元素已載入，開始執行初始化...");
            setupEventListeners();
            loadProjectsWithPermission();
            
            // 檢查 URL 中是否直接帶入了 tenderId
            const params = new URLSearchParams(window.location.search);
            const tenderId = params.get('tenderId');
            const projectId = params.get('projectId');
            if (tenderId && projectId) {
                selectInitialTender(projectId, tenderId);
            }
        });
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
            // 在此處使用全域的 currentUser
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
            const allItemsResult = await safeFirestoreQuery("detailItems", [
                { field: "tenderId", operator: "==", value: tenderId }, 
                { field: "projectId", operator: "==", value: selectedProject.id }
            ]);
            const allItems = allItemsResult.docs;

            detailItems = allItems.filter(item => !item.isAddition).sort(naturalSequenceSort);
            allAdditionItems = allItems.filter(item => item.isAddition === true).sort(naturalSequenceSort);
            
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
        
    function showLoading(isLoading, message='載入中...') { const loadingEl = document.getElementById('loading'); if(loadingEl) { loadingEl.style.display = isLoading ? 'flex' : 'none'; const p = loadingEl.querySelector('p'); if(p) p.textContent = message; } }
    function populateSelect(selectEl, options, defaultText) { let html = `<option value="">${defaultText}</option>`; options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; }); selectEl.innerHTML = html; selectEl.disabled = options.length === 0; }
    function resetSelects(from = 'project') { const selects = ['tender']; const startIdx = selects.indexOf(from); for (let i = startIdx; i < selects.length; i++) { const select = document.getElementById(`${selects[i]}Select`); if(select) { select.innerHTML = `<option value="">請先選擇上一個選項</option>`; select.disabled = true; } } showMainContent(false); }
    function showMainContent(shouldShow) { document.getElementById('mainContent').style.display = shouldShow ? 'block' : 'none'; document.getElementById('emptyState').style.display = shouldShow ? 'none' : 'flex'; }
    function naturalSequenceSort(a, b) { const re = /(\d+(\.\d+)?)|(\D+)/g; const pA = String(a.sequence||'').match(re)||[], pB = String(b.sequence||'').match(re)||[]; for(let i=0; i<Math.min(pA.length, pB.length); i++) { const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]); if(!isNaN(nA)&&!isNaN(nB)){if(nA!==nB)return nA-nB;} else if(pA[i]!==pB[i])return pA[i].localeCompare(pB[i]); } return pA.length - pB.length; }
    function formatCurrency(amount) { if (amount === null || amount === undefined || isNaN(amount)) return 'NT$ 0'; return 'NT$ ' + parseInt(amount, 10).toLocaleString(); }
    
    initializePage();
}
