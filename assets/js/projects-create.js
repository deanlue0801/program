/**
 * 建立新專案頁面 (projects-create.js) - v3.1 (新增專案模式 mode 支援)
 */
function initProjectCreatePage() {
    console.log("🚀 [1/5] 初始化建立新專案頁面 (v3.1)...");

    const form = document.getElementById('createProjectForm');

    // 【核心修正】檢查 form 是否在第一時間就存在
    if (!form) {
        console.error("❌ [2/5] 錯誤：在初始化當下，找不到 #createProjectForm 表單元素。這不應該發生，請檢查 create.html 檔案的內容是否正確。");
        return;
    }
    
    console.log("✅ [2/5] 成功找到 #createProjectForm 表單元素。");

    // 為了避免重複綁定，先移除舊的監聽器
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    console.log("🔍 [3/5] 準備綁定 'submit' 事件監聽器...");

    newForm.addEventListener('submit', async (e) => {
        // 防止表單用傳統方式提交
        e.preventDefault(); 
        console.log("✅ [4/5] 'submit' 事件成功觸發！");

        const saveBtn = newForm.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = '儲存中...';

        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                throw new Error("使用者未登入");
            }

            const formData = new FormData(newForm);
            const projectData = {
                name: formData.get('projectName'),
                code: formData.get('projectCode'),
                budget: Number(formData.get('projectBudget')) || 0,
                status: formData.get('projectStatus') || 'planning',
                mode: formData.get('projectMode') || 'estimation', // 【新增】專案模式：'estimation' (業務估價) 或 'execution' (正式執行)
                startDate: formData.get('projectStartDate'),
                endDate: formData.get('projectEndDate'),
                description: formData.get('projectDescription'),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.email,
                members: {
                    [currentUser.email]: {
                        role: 'owner',
                        permissions: {} 
                    }
                },
                memberEmails: [currentUser.email]
            };
            
            if (!projectData.name) {
                throw new Error("專案名稱為必填欄位。");
            }
            
            console.log("💾 [5/5] 準備寫入資料到 Firestore...", projectData);
            await db.collection('projects').add(projectData);

            showAlert('✅ 專案建立成功！', 'success');
            navigateTo('/program/projects/list');

        } catch (error) {
            console.error("❌ 建立專案失敗:", error);
            showAlert(`建立專案失敗: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '建立專案';
        }
    });
    
    console.log("✅ [3/5] 已成功綁定 'submit' 事件監聽器。");
}
