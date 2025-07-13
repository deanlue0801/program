// assets/js/tracking-setup.js (v7.0 - Minimal Test Version)

function initTrackingSetupPage() {
    console.log("🚀【v7.0 測試版】初始化頁面...");

    // 1. 檢查核心函式庫與變數是否存在
    if (typeof firebase === 'undefined') {
        return console.error("❌ Firebase 核心 (firebase.js) 未載入！");
    }
    if (typeof safeFirestoreQuery !== 'function') {
        return console.error("❌ 核心查詢函式 (safeFirestoreQuery) 未載入！");
    }
    // 【重要】我們直接使用您 distribution.js 也依賴的全域 currentUser
    if (typeof currentUser === 'undefined' || !currentUser) {
        return console.error("❌ 全域使用者變數 (currentUser) 未定義！這是最關鍵的問題。");
    }
    console.log("✅ 核心依賴檢查完畢，使用者:", currentUser.email);


    // 2. 定義頁面元素
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) {
        return console.error("❌ 找不到 ID 為 'projectSelect' 的 HTML 下拉選單！");
    }


    // 3. 【一對一複製】這個函式完全比照您 distribution.js 的 loadProjects() 寫法
    async function loadProjects() {
        console.log("🔄 準備使用 safeFirestoreQuery 載入專案...");
        try {
            const queryConditions = [{ field: "createdBy", operator: "==", value: currentUser.email }];
            const orderByCondition = { field: "name", direction: "asc" };
            
            console.log("    - 查詢條件:", JSON.stringify(queryConditions));

            const projectDocs = await safeFirestoreQuery("projects", queryConditions, orderByCondition);

            console.log("✅ safeFirestoreQuery 執行完畢。");
            console.log("    - 回傳的物件:", projectDocs);
            
            if (!projectDocs || typeof projectDocs.docs === 'undefined') {
                 console.error("❌ 回傳的物件格式不正確，它沒有 'docs' 屬性。");
                 return;
            }

            const projects = projectDocs.docs;
            console.log(`    - 共找到 ${projects.length} 個專案文件。`);

            // 開始填充 HTML
            projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            if (projects.length > 0) {
                projects.forEach(project => {
                    projectSelect.innerHTML += `<option value="${project.id}">${project.data().name}</option>`;
                });
                console.log("✅ 下拉選單已填充完畢。");
            } else {
                 console.warn("⚠️ 未找到任何專案，下拉選單將維持空的狀態。");
            }

        } catch (error) {
            console.error("❌ 在執行 loadProjects 時發生了無法預期的錯誤:", error);
            projectSelect.innerHTML = '<option value="">讀取時發生錯誤</option>';
        }
    }


    // 4. 【一對一複製】使用您 distribution.js 的啟動流程
    async function initializePage() {
        console.log("🚀 準備執行核心函式 loadProjects()...");
        await loadProjects();
    }

    initializePage();
}
