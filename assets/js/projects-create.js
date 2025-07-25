/**
 * 建立新專案頁面 (projects-create.js) - v2.0 (帶等待機制的最終修正版)
 */
function initProjectCreatePage() {
    console.log("🚀 初始化建立新專案頁面 (v2.0)...");

    // 【核心修正】使用一個可靠的函數來等待元素出現
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            // 如果元素已經存在，立刻執行回呼函數
            callback(element);
        } else {
            // 如果元素不存在，設定一個短暫的計時器，每 100 毫秒檢查一次
            let interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    // 找到元素後，清除計時器，並執行回呼函數
                    clearInterval(interval);
                    callback(element);
                }
            }, 100);
        }
    }

    // 使用上面的等待函數來確保 #createProjectForm 存在後，才執行後續操作
    waitForElement('#createProjectForm', (form) => {
        console.log("✅ 成功找到 #createProjectForm 元素，開始綁定事件...");

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
    });
}
