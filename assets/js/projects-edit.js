/**
 * 編輯專案頁面 (projects-edit.js) - 最終匹配修正版
 */
function initProjectEditPage() {

    let projectId = null;

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
        projectId = urlParams.get('id');

        if (!projectId) {
            showAlert('無效的專案ID', 'error');
            navigateTo('/program/tenders/list');
            return;
        }

        try {
            const projectDoc = await db.collection('projects').doc(projectId).get();

            if (!projectDoc.exists || projectDoc.data().createdBy !== auth.currentUser.email) {
                showAlert('找不到指定的專案或無權限查看', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            const currentProject = projectDoc.data();
            
            populateForm(currentProject);
            setupEventListeners();
            showLoading(false);

        } catch (error) {
            console.error("載入專案資料失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    // 【修正處】這個函數現在會去操作您 HTML 中實際存在的 ID
    function populateForm(project) {
        // 動態更新 h1 標題
        const pageTitleEl = document.querySelector('.page-title');
        if(pageTitleEl) pageTitleEl.textContent = `✏️ 編輯專案：${project.name || ''}`;
        
        // 隱藏不需要的「所屬專案」下拉選單
        const projectSelectGroup = document.getElementById('projectSelect')?.parentElement;
        if(projectSelectGroup) projectSelectGroup.style.display = 'none';

        // 將專案資料填入對應的表單欄位
        document.getElementById('tenderName').value = project.name || '';
        document.getElementById('tenderCode').value = project.code || '';
        document.getElementById('statusSelect').value = project.status || 'planning';
        document.getElementById('startDate').value = safeFormatDateForInput(project.startDate);
        document.getElementById('endDate').value = safeFormatDateForInput(project.endDate);
        document.getElementById('contractorName').value = project.contractorName || '';
        document.getElementById('contractorContact').value = project.contractorContact || '';
        
        // 為了通用性，我們假設專案也有這些欄位，如果沒有則填入空值
        document.getElementById('description').value = project.description || '';
        document.getElementById('notes').value = project.notes || '';
    }
    
    function setupEventListeners() {
        // 這部分功能保留，即使專案頁面沒有金額欄位也沒關係
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const startDateValue = document.getElementById('startDate').value;
        const endDateValue = document.getElementById('endDate').value;

        // 從表單收集資料，準備更新到 projects 集合
        const updatedData = {
            name: document.getElementById('tenderName').value.trim(),
            code: document.getElementById('tenderCode').value.trim(),
            status: document.getElementById('statusSelect').value,
            startDate: startDateValue ? new Date(startDateValue) : null,
            endDate: endDateValue ? new Date(endDateValue) : null,
            contractorName: document.getElementById('contractorName').value.trim(),
            contractorContact: document.getElementById('contractorContact').value.trim(),
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
            navigateTo('/program/tenders/list');
        }
    }

    // 【修正處】操作您 HTML 中實際存在的 ID
    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        const formEl = document.getElementById('editTenderForm');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) loadingEl.querySelector('p').textContent = message;
        }
        if (formEl) {
            formEl.style.display = isLoading ? 'none' : 'block';
        }
    }
    
    // 【修正處】將暴露的函數名稱改回 exposedEditFuncs，以匹配您的 onsubmit
    window.exposedEditFuncs = {
        handleFormSubmit,
        cancelEdit
    };

    // 啟動頁面
    loadPageData();
}
