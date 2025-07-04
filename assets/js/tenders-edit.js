/**
 * 編輯標單頁面 (tenders/edit.js) (SPA 版本)
 */
function initTenderEditPage() {

    let tenderId = null;
    let currentTender = null;
    let projects = [];

    // 【新增的輔助函數】用來安全地處理多種日期格式
    function safeFormatDateForInput(dateField) {
        if (!dateField) {
            return '';
        }
        // 如果是 Firestore Timestamp 物件，它會有 toDate 方法
        if (typeof dateField.toDate === 'function') {
            return dateField.toDate().toISOString().split('T')[0];
        }
        // 如果是字串或其他格式，嘗試用 new Date() 解析
        const date = new Date(dateField);
        // 檢查解析出來的是否為有效日期
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        // 如果都不是，返回空字串
        return '';
    }

    async function loadPageData() {
        showLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        tenderId = urlParams.get('id');

        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            navigateTo('/program/tenders/list');
            return;
        }

        try {
            const [projectDocs, tenderDoc] = await Promise.all([
                safeFirestoreQuery("projects", [{ field: "createdBy", operator: "==", value: currentUser.email }]),
                db.collection('tenders').doc(tenderId).get()
            ]);

            projects = projectDocs.docs;

            if (!tenderDoc.exists || tenderDoc.data().createdBy !== currentUser.email) {
                showAlert('找不到指定的標單或無權限查看', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            
            populateForm();
            showLoading(false);

        } catch (error) {
            console.error("載入編輯頁面資料失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    function populateForm() {
        // 填充專案下拉選單
        const projectSelect = document.getElementById('projectSelect');
        projectSelect.innerHTML = '';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            if (p.id === currentTender.projectId) {
                option.selected = true;
            }
            projectSelect.appendChild(option);
        });

        // 填充其他表單欄位
        document.getElementById('tenderName').value = currentTender.name || '';
        document.getElementById('tenderCode').value = currentTender.code || '';
        document.getElementById('statusSelect').value = currentTender.status || 'planning';
        
        // 【修正處】使用新的輔助函數來安全地設定日期
        document.getElementById('startDate').value = safeFormatDateForInput(currentTender.startDate);
        document.getElementById('endDate').value = safeFormatDateForInput(currentTender.endDate);
        
        document.getElementById('contractorName').value = currentTender.contractorName || '';
        document.getElementById('contractorContact').value = currentTender.contractorContact || '';
        document.getElementById('description').value = currentTender.description || '';
        document.getElementById('notes').value = currentTender.notes || '';
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const updatedData = {
            name: document.getElementById('tenderName').value.trim(),
            code: document.getElementById('tenderCode').value.trim(),
            projectId: document.getElementById('projectSelect').value,
            status: document.getElementById('statusSelect').value,
            startDate: document.getElementById('startDate').value ? new Date(document.getElementById('startDate').value) : null,
            endDate: document.getElementById('endDate').value ? new Date(document.getElementById('endDate').value) : null,
            contractorName: document.getElementById('contractorName').value.trim(),
            contractorContact: document.getElementById('contractorContact').value.trim(),
            description: document.getElementById('description').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!updatedData.name || !updatedData.projectId) {
            return showAlert("標單名稱和所屬專案為必填項", "error");
        }

        try {
            showLoading(true, '儲存中...');
            await db.collection('tenders').doc(tenderId).update(updatedData);
            showAlert("標單資料更新成功！", "success");
            navigateTo(`/program/tenders/detail?id=${tenderId}`);
        } catch (error) {
            console.error("更新標單失敗:", error);
            showAlert("更新失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    function cancelEdit() {
        if (confirm('您確定要取消編輯嗎？所有未儲存的變更將會遺失。')) {
            navigateTo(`/program/tenders/detail?id=${tenderId}`);
        }
    }

    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loading');
        const formEl = document.getElementById('editTenderForm');
        if (isLoading) {
            if (loadingEl) { loadingEl.style.display = 'flex'; if(loadingEl.querySelector('p')) loadingEl.querySelector('p').textContent = message; }
            if (formEl) formEl.style.display = 'none';
        } else {
            if (loadingEl) loadingEl.style.display = 'none';
            if (formEl) formEl.style.display = 'block';
        }
    }
    
    // 將函數暴露給 HTML
    window.exposedEditFuncs = {
        handleFormSubmit,
        cancelEdit
    };

    // 啟動頁面
    console.log("🚀 初始化編輯標單頁面...");
    loadPageData();
}
