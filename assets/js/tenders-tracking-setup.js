// assets/js/tracking-setup.js (Ultimate Debugging Version)

function initTrackingSetupPage() {
    console.log("========================================");
    console.log("🚀 1. 執行 initTrackingSetupPage() - 偵錯模式啟動");
    console.log("========================================");

    // --- 【偵錯點 A】檢查相依的變數和函式是否存在 ---
    if (typeof currentUser === 'undefined' || !currentUser) {
        console.error("❌【偵錯失敗】: `currentUser` 變數不存在或為空！這是最優先要解決的問題。");
        alert("錯誤：無法獲取用戶資訊，頁面初始化失敗。");
        return;
    }
    console.log("✅【偵錯點 A】: `currentUser` 變數存在，使用者 Email:", currentUser.email);

    if (typeof safeFirestoreQuery !== 'function') {
        console.error("❌【偵錯失敗】: `safeFirestoreQuery` 函式不存在！請確認相關的 JS 檔案已載入。");
        alert("錯誤：缺少核心查詢函式，頁面初始化失敗。");
        return;
    }
    console.log("✅【偵錯點 A】: `safeFirestoreQuery` 函式存在。");

    // --- 頁面元素集中管理 ---
    const ui = {
        projectSelect: document.getElementById('projectSelect'),
        tenderSelect: document.getElementById('tenderSelect'),
        majorItemSelect: document.getElementById('majorItemSelect')
        // ... 其他元素
    };
    if (!ui.projectSelect) {
         console.error("❌【偵錯失敗】: 找不到 ID 為 'projectSelect' 的 HTML 元素！");
         return;
    }
    console.log("✅【偵錯點 A】: 所有 HTML 元素都已成功抓取。");

    // --- 頁面級別變數 ---
    let projects = [];

    // --- 【移植區塊】---
    async function loadProjects() {
        console.log("🔄 2. 執行 loadProjects() - 開始從 Firestore 讀取專案...");
        try {
            const queryConditions = [{ field: "createdBy", operator: "==", value: currentUser.email }];
            const orderByCondition = { field: "name", direction: "asc" };
            
            console.log("    - 查詢條件:", JSON.stringify(queryConditions));
            console.log("    - 排序條件:", JSON.stringify(orderByCondition));

            const projectDocs = await safeFirestoreQuery("projects", queryConditions, orderByCondition);

            // --- 【偵錯點 B】檢查查詢結果 ---
            if (!projectDocs || typeof projectDocs.docs === 'undefined') {
                 console.error("❌【偵錯失敗】: `safeFirestoreQuery` 回傳的結果格式不正確！它沒有 'docs' 屬性。回傳內容:", projectDocs);
                 return;
            }
            console.log(`✅【偵錯點 B】: safeFirestoreQuery 成功回傳，共找到 ${projectDocs.docs.length} 個文件。`);

            if (projectDocs.docs.length === 0) {
                console.warn("⚠️ 警告: 找不到任何符合條件的專案。請檢查 Firestore 中的 'projects' 集合，確認 'createdBy' 欄位的值是否為 " + currentUser.email);
            }

            projects = projectDocs.docs;
            
            // --- 【偵錯點 C】填充下拉選單 ---
            console.log("🔄 3. 準備填充『專案』下拉選單...");
            ui.projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            projects.forEach((project, index) => {
                const projectData = project.data();
                if (!projectData || typeof projectData.name === 'undefined') {
                    console.warn(`    - 第 ${index + 1} 個專案文件 (ID: ${project.id}) 格式不正確或缺少 'name' 欄位。`, projectData);
                } else {
                    console.log(`    - 正在新增選項: ID=${project.id}, 名稱=${projectData.name}`);
                    ui.projectSelect.innerHTML += `<option value="${project.id}">${projectData.name}</option>`;
                }
            });

            console.log("✅ 4. 填充完成！");

        } catch (error) {
            console.error("❌【偵錯失敗】: 在執行 `loadProjects` 函式時發生了無法預期的錯誤:", error);
            ui.projectSelect.innerHTML = '<option value="">讀取專案時發生嚴重錯誤</option>';
        }
    }

    // --- 主流程啟動點 ---
    async function initializePage() {
        console.log("🚀 1.1. 執行 initializePage() - 準備呼叫 loadProjects()...");
        await loadProjects();
    }
    
    // 延遲一小段時間執行，確保所有前置作業 (如 currentUser 初始化) 已完成
    setTimeout(initializePage, 100); 
}

// 確保在呼叫 initTrackingSetupPage 之前，相關依賴已準備好
// 這個檢查是為了防止在 router.js 中過早觸發
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 如果頁面已經載入完成，直接執行
    // initTrackingSetupPage(); // 這行通常由 router.js 控制，我們暫時不用
} else {
    // 否則，等待 DOMContentLoaded 事件
    // document.addEventListener('DOMContentLoaded', initTrackingSetupPage); // 同上
}
