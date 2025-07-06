/**
 * 編輯專案頁面 (projects-edit.js)
 */
function initProjectEditPage() {
    let projectId = null;

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
                showAlert('找不到指定的專案或無權限', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            
            const project = projectDoc.data();
            
            // 確保元素存在才賦值
            const projectNameEl = document.getElementById('projectName');
            const projectCodeEl = document.getElementById('projectCode');
            const projectStatusEl = document.getElementById('projectStatus');

            if (projectNameEl) projectNameEl.value = project.name || '';
            if (projectCodeEl) projectCodeEl.value = project.code || '';
            if (projectStatusEl) projectStatusEl.value = project.status || 'planning';
            
            showLoading(false);

        } catch (error) {
            console.error("載入專案資料失敗:", error);
            showAlert("載入專案資料失敗: " + error.message, "error");
            showLoading(false);
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        const updatedData = {
            name: document.getElementById('projectName').value.trim(),
            code: document.getElementById('projectCode').value.trim(),
            status: document.getElementById('projectStatus').value,
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
        navigateTo('/program/tenders/list');
    }

    function showLoading(isLoading, message = '處理中...') {
        const loadingEl = document.getElementById('loadingProject');
        const formEl = document.getElementById('projectEditForm');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) {
                loadingEl.querySelector('p').textContent = message;
            }
        }
        if (formEl) {
            formEl.style.display = isLoading ? 'none' : 'block';
        }
    }

    // 將需要在 HTML onsubmit/onclick 中呼叫的函數，暴露到一個全局物件下
    window.exposedProjectEditFuncs = { handleFormSubmit, cancelEdit };

    // 啟動頁面邏輯
    loadPageData();
}
