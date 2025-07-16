/**
 * 編輯標單頁面 (tenders-edit.js) - v7.0 (權限守衛)
 */
function initTenderEditPage() {
    // --- 頁面級別變數 ---
    let tenderId, currentTender, currentProject, majorItems = [], detailItems = [], additionItems = [];
    let allExpanded = true;
    let currentUserRole = null;
    let currentUserPermissions = {};

    // --- 頁面啟動點 ---
    async function init() {
        showLoading(true);
        tenderId = new URLSearchParams(window.location.search).get('id');
        if (!tenderId) {
            showAlert('無效的標單ID', 'error');
            return navigateTo('/program/tenders/list');
        }
        try {
            // 【權限守衛】載入資料並執行權限檢查
            if (!await loadDataAndCheckPermissions()) {
                showAlert('您沒有權限編輯此標單', 'error');
                return navigateTo('/program/tenders/list');
            }
            
            renderPage();
            setupEventListeners();
        } catch (error) {
            console.error("載入標單編輯頁面失敗:", error);
            showAlert("載入資料失敗: " + error.message, "error");
        } finally {
            showLoading(false);
        }
    }

    // --- 資料載入與權限檢查 ---
    async function loadDataAndCheckPermissions() {
        const tenderDoc = await db.collection('tenders').doc(tenderId).get();
        if (!tenderDoc.exists) throw new Error('找不到指定的標單');
        currentTender = { id: tenderDoc.id, ...tenderDoc.data() };

        if (!currentTender.projectId) return false; // 無專案關聯，無法檢查權限

        const projectDoc = await db.collection('projects').doc(currentTender.projectId).get();
        if (!projectDoc.exists) return false; // 專案不存在
        
        currentProject = { id: projectDoc.id, ...projectDoc.data() };
        
        const userEmail = auth.currentUser.email;
        const memberInfo = currentProject.members.find(m => m.email === userEmail);

        if (!memberInfo) return false; // 不是成員

        currentUserRole = memberInfo.role;
        currentUserPermissions = memberInfo.permissions || {};

        // 只有 owner 或 有 canAccessTenders 權限的 editor 才能進入
        if (currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessTenders)) {
            // 權限足夠，繼續載入其他資料
            const [majorItemsData, allDetailItemsData] = await Promise.all([
                safeFirestoreQuery('majorItems', [{ field: 'tenderId', operator: '==', value: tenderId }]),
                safeFirestoreQuery('detailItems', [{ field: 'tenderId', operator: '==', value: tenderId }])
            ]);
            majorItems = majorItemsData.docs.sort(naturalSequenceSort);
            detailItems = allDetailItemsData.docs.filter(item => !item.isAddition).sort(naturalSequenceSort);
            additionItems = allDetailItemsData.docs.filter(item => item.isAddition).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            return true;
        }

        return false; // 權限不足
    }
    
    // ... (其他所有 render, event handler, helper 函數維持原樣)
    // The rest of the functions (renderTenderHeader, renderDetailTable, etc.) remain unchanged.
    // I will omit them for brevity but they should be kept in the final file.
    function renderTenderHeader(){/*...omitted...*/};
    function renderDetailTable(details){/*...omitted...*/};
    function renderMajorItemsList(){/*...omitted...*/};
    function renderAdditionItemsTable(){/*...omitted...*/};
    function renderSummaryCards(){/*...omitted...*/};
    function renderPage(){/*...omitted...*/};
    function updatePageAfterAction(relatedItemIdToUpdate){/*...omitted...*/};
    function updateSingleDetailItemRow(detailItemId){/*...omitted...*/};
    function populateRelatedItemsDropdown(selectedId){/*...omitted...*/};
    function showAdditionModal(relatedItemId){/*...omitted...*/};
    function editAddition(additionId){/*...omitted...*/};
    async function handleAdditionSubmit(event){/*...omitted...*/};
    async function deleteAddition(additionId){/*...omitted...*/};
    function setupEventListeners(){/*...omitted...*/};
    function showLoading(isLoading){/*...omitted...*/};
    
    init();
}

function naturalSequenceSort(a, b) { /*...omitted...*/ };
