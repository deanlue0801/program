/**
 * 標單詳情頁面 (tenders-detail.js) - v3.0 (權限守衛)
 */
function initTenderDetailPage() {

    // --- 頁面狀態管理 ---
    let currentTender = null;
    let currentProject = null;
    let currentUserPermissions = {};
    let currentUserRole = null;
    let majorItems = [];
    let detailItems = [];
    let distributionData = [];
    let tenderId = null;
    let allMajorExpanded = false;

    const statusText = {
        'planning': '規劃中', 'active': '進行中', 'completed': '已完成',
        'paused': '暫停', 'bidding': '招標中', 'awarded': '得標'
    };

    // --- 資料讀取與權限檢查 ---

    function getTenderIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        tenderId = urlParams.get('id') || urlParams.get('tenderId');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            navigateTo('/program/tenders/list');
            return false;
        }
        return true;
    }

    async function loadAllData() {
        if (!getTenderIdFromUrl()) return;
        try {
            showLoading('載入標單資料...');
            const tenderDoc = await db.collection('tenders').doc(tenderId).get();
            if (!tenderDoc.exists) {
                showAlert('找不到指定的標單', 'error');
                return navigateTo('/program/tenders/list');
            }
            currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
            
            // 【權限守衛】載入專案資料並檢查權限
            if (!await loadProjectAndCheckPermissions()) {
                showAlert('您沒有權限查看此標單所屬的專案', 'error');
                return navigateTo('/program/tenders/list');
            }

            await loadMajorAndDetailItems();
            await loadDistributionData();
            renderAllData();
            showMainContent();
        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
            showAlert('載入資料失敗: ' + error.message, 'error');
            showMainContent();
        }
    }

    async function loadProjectAndCheckPermissions() {
        if (!currentTender.projectId) { 
            currentProject = null; 
            return false; // 沒有關聯專案，視為無權限
        }
        try {
            const projectDoc = await db.collection('projects').doc(currentTender.projectId).get();
            if (!projectDoc.exists) {
                currentProject = null;
                return false; // 專案不存在，視為無權限
            }
            currentProject = { id: projectDoc.id, ...projectDoc.data() };

            // 檢查使用者是否為成員
            const userEmail = auth.currentUser.email;
            if (!currentProject.memberEmails.includes(userEmail)) {
                return false; // 不是成員，無權限
            }

            // 存儲使用者的角色與權限
            const memberInfo = currentProject.members.find(m => m.email === userEmail);
            currentUserRole = memberInfo ? memberInfo.role : null;
            currentUserPermissions = (memberInfo && memberInfo.permissions) ? memberInfo.permissions : {};
            
            return true; // 是成員，有權限查看

        } catch (error) {
            console.warn('載入專案資料失敗:', error);
            currentProject = null;
            return false;
        }
    }
    
    async function loadMajorAndDetailItems() {
        // ... (此函數內容不變)
        const majorItemsResult = await safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }]);
        majorItems = majorItemsResult.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(naturalSequenceSort);
        if (majorItems.length === 0) { detailItems = []; return; }
        const majorItemIds = majorItems.map(item => item.id);
        const detailPromises = [];
        for (let i = 0; i < majorItemIds.length; i += 10) {
            const chunk = majorItemIds.slice(i, i + 10);
            detailPromises.push(safeFirestoreQuery('detailItems', [{ field: 'majorItemId', operator: 'in', value: chunk }]));
        }
        const detailChunks = await Promise.all(detailPromises);
        detailItems = detailChunks.flatMap(chunk => chunk.docs.map(doc => ({ id: doc.id, ...doc.data() }))).sort(naturalSequenceSort);
    }

    async function loadDistributionData() {
        // ... (此函數內容不變)
        if (detailItems.length === 0) { distributionData = []; return; }
        const detailItemIds = detailItems.map(item => item.id);
        const distPromises = [];
        for (let i = 0; i < detailItemIds.length; i += 10) {
            const chunk = detailItemIds.slice(i, i + 10);
            distPromises.push(safeFirestoreQuery('distributionTable', [{ field: 'detailItemId', operator: 'in', value: chunk }]));
        }
        const distChunks = await Promise.all(distPromises);
        distributionData = distChunks.flatMap(chunk => chunk.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }

    // --- 畫面渲染與計算 ---
    function renderAllData() {
        renderTenderHeader();
        renderStatistics();
        renderOverviewTab();
        renderMajorItemsTab();
        renderInfoTab();
    }

    function renderTenderHeader() {
        // ... (部分內容不變)
        const projectName = currentProject ? currentProject.name : '未知專案';
        document.getElementById('tenderName').textContent = currentTender.name || '未命名標單';
        document.getElementById('projectName').textContent = projectName;
        // ...

        // 【權限守衛】根據權限顯示或隱藏按鈕
        const canEditTenders = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders);
        const canAccessDistribution = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);

        const editBtn = document.getElementById('editBtn');
        const importBtn = document.getElementById('importBtn');
        const distBtn = document.getElementById('distributionBtn');

        if (editBtn) {
            editBtn.href = `/program/tenders/edit?id=${tenderId}`;
            editBtn.style.display = canEditTenders ? 'inline-flex' : 'none';
        }
        if (importBtn) {
            importBtn.href = `/program/tenders/import?tenderId=${tenderId}`;
            importBtn.style.display = canEditTenders ? 'inline-flex' : 'none';
        }
        if (distBtn) {
            distBtn.href = `/program/tenders/distribution?tenderId=${tenderId}`;
            distBtn.style.display = canAccessDistribution ? 'inline-flex' : 'none';
        }
    }

    // ... (其他 render, calculate, UI 互動函數維持原樣)
    // The rest of the functions (renderStatistics, renderOverviewTab, etc.) remain unchanged.
    // I will omit them for brevity but they should be kept in the final file.
    function renderStatistics(){/*...omitted...*/};
    function renderOverviewTab(){/*...omitted...*/};
    function renderMajorItemsTab(){/*...omitted...*/};
    function createMajorItemCard(majorItem){/*...omitted...*/};
    async function toggleDetailItemsTable(button, majorItemId){/*...omitted...*/};
    function createDetailItemsTable(details){/*...omitted...*/};
    async function handleProgressTrackingToggle(event){/*...omitted...*/};
    function createDetailItemsSummary(details, distributions){/*...omitted...*/};
    function renderInfoTab(){/*...omitted...*/};
    function calculateDistributedMajorItems(){/*...omitted...*/};
    function calculateDistributionAreas(){/*...omitted...*/};
    function calculateMajorItemDistributionProgress(majorItem){/*...omitted...*/};
    function calculateExecutedDays(){/*...omitted...*/};
    function calculateRemainingDays(){/*...omitted...*/};
    function switchTab(tabName){/*...omitted...*/};
    function toggleMajorItemSummary(majorItemId){/*...omitted...*/};
    function toggleAllMajorItems(){/*...omitted...*/};
    async function refreshMajorItems(){/*...omitted...*/};
    function goToDistribution(majorItemId){/*...omitted...*/};
    function showLoading(message){/*...omitted...*/};
    function showMainContent(){/*...omitted...*/};
    
    window.exposedFunctions = { switchTab, toggleAllMajorItems, refreshMajorItems, goToDistribution, toggleMajorItemSummary, toggleDetailItemsTable };
    loadAllData();
}

function naturalSequenceSort(a, b) { /*...omitted...*/ };
