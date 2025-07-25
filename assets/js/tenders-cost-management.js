/**
 * 成本控管分析頁面 (tenders-cost-management.js) - v1.0
 */
function initCostManagementPage() {
    console.log("🚀 初始化成本控管分析頁面 (v1.0)...");

    let projects = [], tenders = [], detailItems = [], allAdditionItems = [];
    let selectedProject = null, selectedTender = null;
    const currentUser = firebase.auth().currentUser;

    async function initializePage() {
        if (!currentUser) return showAlert("使用者未登入", "error");
        setupEventListeners();
        await loadProjectsWithPermission();
        
        // 檢查 URL 中是否直接帶入了 tenderId
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
        await onProjectChange(projectId, false); // 傳入 false 避免重複載入
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
        if (!tenderId) { resetSelects('majorItem'); return; }
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
        // 計算金額
        const originalAmount = detailItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const additionAmount = allAdditionItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalAmount = originalAmount + additionAmount;
        const increasePercentage = originalAmount > 0 ? ((additionAmount / originalAmount) * 100).toFixed(2) : 0;
        
        // 更新卡片數據
        document.getElementById('originalAmount').textContent = formatCurrency(originalAmount);
        document.getElementById('additionAmount').textContent = formatCurrency(additionAmount);
        document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
        document.getElementById('increasePercentage').textContent = `${increasePercentage}%`;
        
        // 更新統計數據
        document.getElementById('majorItemsCount').textContent = new Set(detailItems.map(item => item.majorItemId)).size;
        document.getElementById('detailItemsCount').textContent = detailItems.length;
        document.getElementById('additionItemsCount').textContent = allAdditionItems.length;

        // 渲染追加項目表格
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
    
    function showLoading(isLoading, message='載入中...') { /* ... */ }
    function populateSelect(selectEl, options, defaultText) { /* ... */ }
    function resetSelects(from = 'project') { /* ... */ }
    function showMainContent(shouldShow) { /* ... */ }
    function naturalSequenceSort(a, b) { /* ... */ }
    function formatCurrency(amount) { /* ... */ }
    
    initializePage();
}
