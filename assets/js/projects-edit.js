/**
 * 編輯專案頁面 (projects-edit.js) - 超級除錯模式
 */
function initProjectEditPage() {
    console.log("[DEBUG] 1. initProjectEditPage 函數已啟動");
    let projectId = null;

    async function loadPageData() {
        console.log("[DEBUG] 2. 開始執行 loadPageData 函數");
        
        console.log("[DEBUG] 3. 準備顯示載入動畫...");
        showLoading(true);
        console.log("[DEBUG] 4. 載入動畫已顯示");

        const urlParams = new URLSearchParams(window.location.search);
        projectId = urlParams.get('id');
        console.log(`[DEBUG] 5. 從網址取得的專案 ID 為: ${projectId}`);

        if (!projectId) {
            showAlert('無效的專案ID', 'error');
            navigateTo('/program/tenders/list');
            return;
        }

        try {
            console.log("[DEBUG] 6. 進入 try 區塊，準備從 Firebase 讀取資料...");
            const projectDoc = await db.collection('projects').doc(projectId).get();
            console.log("[DEBUG] 7. Firebase 資料已成功返回");

            if (!projectDoc.exists || projectDoc.data().createdBy !== auth.currentUser.email) {
                console.log("[DEBUG] Error: 找不到專案或無權限");
                showAlert('找不到指定的專案或無權限', 'error');
                navigateTo('/program/tenders/list');
                return;
            }
            
            const project = projectDoc.data();
            console.log("[DEBUG] 8. 成功取得專案資料:", project);
            
            // 確保元素存在才賦值
            const projectNameEl = document.getElementById('projectName');
            const projectCodeEl = document.getElementById('projectCode');
            const projectStatusEl = document.getElementById('projectStatus');

            console.log("[DEBUG] 9. 準備將資料填入表單...");
            if (projectNameEl) projectNameEl.value = project.name || '';
            if (projectCodeEl) projectCodeEl.value = project.code || '';
            if (projectStatusEl) projectStatusEl.value = project.status || 'planning';
            console.log("[DEBUG] 10. 資料已成功填入表單");
            
            console.log("[DEBUG] 11. 準備隱藏載入動畫...");
            showLoading(false);
            console.log("[DEBUG] 12. 載入動畫已隱藏，流程正常結束");

        } catch (error) {
            console.error("❌ 載入專案資料失敗:", error);
            showAlert("載入專案資料失敗: " + error.message, "error");
            console.log("[DEBUG] Catched Error: 準備隱藏載入動畫...");
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
        console.log(`[DEBUG] showLoading 被呼叫，isLoading = ${isLoading}`);
        const loadingEl = document.getElementById('loadingProject');
        const formEl = document.getElementById('projectEditForm');
        
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
            if (loadingEl.querySelector('p')) {
                loadingEl.querySelector('p').textContent = message;
            }
        } else {
            console.log("[DEBUG] Warning: 找不到 'loadingProject' 元素");
        }
        
        if (formEl) {
            formEl.style.display = isLoading ? 'none' : 'block';
        } else {
            console.log("[DEBUG] Warning: 找不到 'projectEditForm' 元素");
        }
    }

    window.exposedProjectEditFuncs = { handleFormSubmit, cancelEdit };
    loadPageData();
}
