/**
 * 建立新專案頁面 (projects-create.js) - v1.0
 */
function initProjectCreatePage() {
    console.log("🚀 初始化建立新專案頁面 (v1.0)...");

    const form = document.getElementById('createProjectForm');
    if (!form) {
        console.error("Create Project Page: 找不到 #createProjectForm 元素。");
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = form.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = '儲存中...';

        try {
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                throw new Error("使用者未登入");
            }

            const formData = new FormData(form);
            const projectData = {
                name: formData.get('projectName'),
                code: formData.get('projectCode'),
                budget: Number(formData.get('projectBudget')) || 0,
                status: formData.get('projectStatus'),
                startDate: formData.get('projectStartDate'),
                endDate: formData.get('projectEndDate'),
                description: formData.get('projectDescription'),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.email,
                // 自動將建立者設為擁有者
                members: {
                    [currentUser.email]: {
                        role: 'owner',
                        permissions: {} 
                    }
                },
                memberEmails: [currentUser.email]
            };
            
            // 驗證必填欄位
            if (!projectData.name) {
                throw new Error("專案名稱為必填欄位。");
            }

            await db.collection('projects').add(projectData);

            showAlert('✅ 專案建立成功！', 'success');
            navigateTo('/program/projects/list'); // 導航回專案列表

        } catch (error) {
            console.error("❌ 建立專案失敗:", error);
            showAlert(`建立專案失敗: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '建立專案';
        }
    });
}
