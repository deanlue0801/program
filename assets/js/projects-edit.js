/**
 * 編輯專案頁面 (projects-edit.js) - 修正函數命名
 */
// 【修正處】將函數名稱改為 initProjectEditPage，以符合 router.js 的呼叫
function initProjectEditPage() {

    let projectId = null; // 在這個檔案中，我們處理的是 projectId
    let projects = []; // 雖然用不到，但保留以防未來擴充

    // 安全地格式化日期，無論來源是 Timestamp 物件還是字串
    function safeFormatDateForInput(dateField) {
        if (!dateField) return '';
        if (typeof dateField.toDate === 'function') {
            return dateField.toDate().toISOString().split('T')[0];
        }
        const date = new Date(dateField);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        return '';
    }

    async function loadPageData() {
        showLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        // 在這個頁面，我們是編輯專案，所以取得 'id' 作為 projectId
        projectId = urlParams.get('id');

        if (!projectId) {
            showAlert('無效的專案ID', 'error');
            navigateTo('/program/tenders/list');
            return;
        }

        try {
            // 直接讀取 projects 集合
            const projectDoc = await db.collection('projects').doc(projectId).get();

            if (!projectDoc.exists || projectDoc.data().createdBy !== auth.currentUser.email) {
                showAlert('找不到指定的專案或無權限查看', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            const currentProject = projectDoc.data();
            
            // 將專案資料填入表單
            populateForm(currentProject);
            setupEventListeners();
            showLoading(false);

        } catch (error) {
            console.error("載入編輯頁面資料失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    // 這個函數現在用來填充專案資料
    function populateForm(project) {
        document.getElementById('pageTitle').textContent = `✏️ 編輯專案：${project.name || ''}`;
        
        // 專案編輯頁不需要專案下拉選單，可以將其隱藏或移除
        const projectSelectGroup = document.getElementById('projectSelect')?.parentElement;
        if(projectSelectGroup) projectSelectGroup.style.display = 'none';

        // 填充所有表單欄位
        document.getElementById('tenderName').value = project.name || ''; // HTML ID 仍為 tenderName
        document.getElementById('tenderCode').value = project.code || ''; // HTML ID 仍為 tenderCode
        document.getElementById('statusSelect').value = project.status || 'planning';
        document.getElementById('startDate').value = safeFormatDateForInput(project.startDate);
        document.getElementById('endDate').value = safeFormatDateForInput(project.endDate);
        document.getElementById('contractorName').value = project.contractorName || '';
        document.getElementById('amount').value = project.amount || 0;
        document.getElementById('tax').value = project.tax || 0;
        document.getElementById('totalAmount').value = project.totalAmount || 0;
        document.getElementById('description').value = project.description || '';
        document.getElementById('notes').value = project.notes || '';
    }
    
    function setupEventListeners() {
        const amountInput = document.getElementById('amount');
        const taxInput = document.getElementById('tax');
        const totalAmountInput = document.getElementById('totalAmount');

        function calculateTotal() {
            const amount = parseFloat(amountInput.value) || 0;
            const tax = parseFloat(taxInput.value) || 0;
            totalAmountInput.value = amount + tax;
        }

        amountInput.addEventListener('input', calculateTotal);
        taxInput.addEventListener('input', calculateTotal);
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const startDateValue = document.getElementById('startDate').value;
        const endDateValue = document.getElementById('endDate').value;

        // 更新 projects 集合
        const updatedData = {
            name: document.getElementById('tenderName').value.trim(),
            code: document.getElementById('tenderCode').value.trim(),
            status: document.getElementById('statusSelect').value,
            startDate: startDateValue ? new Date(startDateValue) : null,
            endDate: endDateValue ? new Date(endDateValue) : null,
            contractorName: document.getElementById('contractorName').value.trim(),
            amount: parseFloat(document.getElementById('amount').value) || 0,
            tax: parseFloat(document.getElementById('tax').value) || 0,
            totalAmount: parseFloat(document.getElementById('totalAmount').value) || 0,
            description: document.getElementById('description').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!updatedData.name) {
            return showAlert("專案名稱為必填項", "error");
        }

        try {
            showLoading(true, '儲存中...');
            await db.collection('projects').doc(projectId).update(updatedData);
            showAlert("專案資料更新成功！", "success");
            navigateTo(`/program/tenders/list`);
        } catch (error) {
            console.error("更新專案失敗:", error);
            showAlert("更新失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    function cancelEdit() {
        if (confirm('您確定要取消編輯嗎？所有未儲存的變更將會遺失。')) {
            history.back();
        }
    }

    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        const formEl = document.getElementById('tenderEditForm'); // HTML ID 仍為 tenderEditForm
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) loadingEl.querySelector('p').textContent = message;
        }
        if (formEl) {
            formEl.style.display = isLoading ? 'none' : 'block';
        }
    }
    
    // 將函數暴露給 HTML
    window.exposedProjectEditFuncs = { // 使用新的暴露名稱以避免衝突
        handleFormSubmit,
        cancelEdit
    };

    // 啟動頁面
    loadPageData();
}
