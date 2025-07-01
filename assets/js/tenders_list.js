/**
 * 標單列表頁面 (tenders-list.js)
 * 功能：顯示、篩選、搜尋和管理標單列表。
 * 依賴：firebase-config.js, tenders-list.html
 */

// =================================================================
//  頁面狀態變數
// =================================================================
let allTenders = [];
let allProjects = [];
let filteredTenders = [];

// =================================================================
//  主要資料處理與載入
// =================================================================

/**
 * 載入所有頁面需要的資料 (優化版本)
 * - 使用了 firebase-config.js 的標準函數
 */
async function loadAllData() {
    try {
        console.log('📊 載入標單和專案資料...');
        showLoading('載入資料中...');

        const [tenders, projects] = await Promise.all([
            loadTenders(),   // << 使用 firebase-config.js 的標準函數
            loadProjects()   // << 使用 firebase-config.js 的標準函數
        ]);

        allProjects = projects;
        
        // 將專案名稱合併到標單資料中，方便顯示
        allTenders = tenders.map(tender => {
            const project = allProjects.find(p => p.id === tender.projectId);
            return {
                ...tender,
                projectName: project ? project.name : '未歸屬專案'
            };
        });

        console.log(`✅ 載入完成：${allTenders.length} 個標單，${allProjects.length} 個專案`);
        
        updateProjectFilter();
        updateSummary();
        applyFilters(); // 初始應用一次篩選（即顯示全部）
        showMainContent();

    } catch (error) {
        console.error('❌ 載入資料失敗:', error);
        showAlert('載入資料失敗，請重新整理頁面', 'error');
        showMainContent(); // 即使失敗也要顯示主體，避免一直卡在載入畫面
    }
}

// =================================================================
//  篩選與渲染
// =================================================================

// 更新專案篩選下拉選單
function updateProjectFilter() {
    const projectFilter = document.getElementById('projectFilter');
    if (!projectFilter) return;

    projectFilter.innerHTML = '<option value="">所有專案</option>';
    allProjects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectFilter.appendChild(option);
    });
}

// 更新統計摘要
function updateSummary() {
    document.getElementById('totalTenders').textContent = allTenders.length;
    const totalAmount = allTenders.reduce((sum, tender) => sum + (tender.totalAmount || 0), 0);
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    // ... 其他統計可以照樣加入
}

// 應用篩選條件
function applyFilters() {
    const projectFilter = document.getElementById('projectFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();

    filteredTenders = allTenders.filter(tender => {
        if (projectFilter && tender.projectId !== projectFilter) return false;
        if (statusFilter && tender.status !== statusFilter) return false;
        if (searchInput && !(tender.name || '').toLowerCase().includes(searchInput) && !(tender.projectName || '').toLowerCase().includes(searchInput)) {
            return false;
        }
        return true;
    });

    renderTenders();
}

// 渲染標單表格
function renderTenders() {
    const tbody = document.getElementById('tendersTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tbody || !emptyState) return;

    if (filteredTenders.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        tbody.innerHTML = filteredTenders.map(tender => `
            <tr>
                <td>${escapeHtml(tender.name || '未命名標單')}</td>
                <td><code>${escapeHtml(tender.code || 'N/A')}</code></td>
                <td>${escapeHtml(tender.projectName)}</td>
                <td><strong>${formatCurrency(tender.totalAmount || 0)}</strong></td>
                <td><span class="status-badge ${tender.status || 'planning'}">${getStatusText(tender.status)}</span></td>
                <td>${formatDate(tender.createdAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-view" onclick="viewTender('${tender.id}')">查看</button>
                        <button class="btn btn-sm btn-edit" onclick="editTender('${tender.id}')">編輯</button>
                        <button class="btn btn-sm btn-delete" onclick="deleteTenderWrapper('${tender.id}', '${escapeHtml(tender.name)}')">刪除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// 清除所有篩選
function clearFilters() {
    document.getElementById('projectFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('searchInput').value = '';
    applyFilters();
}

// =================================================================
//  操作與事件處理
// =================================================================

// 查看標單詳情
function viewTender(tenderId) {
    window.location.href = `detail.html?id=${tenderId}`;
}

// 編輯標單
function editTender(tenderId) {
    window.location.href = `edit.html?id=${tenderId}`;
}

/**
 * 刪除標單的包裝函數 (優化版本)
 * - 大幅簡化！現在呼叫 firebase-config.js 中更強大的批次刪除函數
 */
async function deleteTenderWrapper(tenderId, tenderName) {
    if (!confirm(`確定要刪除標單「${tenderName}」嗎？\n此操作將一併刪除所有相關資料且無法復原！`)) {
        return;
    }
    try {
        showLoading('刪除中...');
        // << 呼叫核心模組的函數，處理所有複雜的刪除邏輯
        const success = await deleteTenderAndRelatedData(tenderId);
        if (success) {
            showAlert('標單已成功刪除！', 'success');
            // 直接在前端移除資料並重新渲染，比重新從伺服器載入更快
            allTenders = allTenders.filter(t => t.id !== tenderId);
            applyFilters();
            updateSummary();
        }
    } catch (error) {
        console.error('刪除標單失敗:', error);
        showAlert('刪除失敗：' + error.message, 'error');
    } finally {
        showMainContent();
    }
}

// =================================================================
//  頁面專用輔助函數
// =================================================================

function getStatusText(status) {
    const statusMap = { 'planning': '規劃中', 'active': '進行中', 'completed': '已完成', 'paused': '暫停' };
    return statusMap[status] || '未設定';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showMainContent() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

function showLoading(message = '載入中...') {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    const msgElement = document.querySelector('#loading p');
    if (msgElement) msgElement.textContent = message;
}

// =================================================================
//  應用程式初始化流程
// =================================================================

function onLoginSuccess(user) {
    console.log(`標單列表：歡迎 ${user.email}！`);
    loadAllData();
}

function onLoginFail() {
    console.log('標單列表：用戶未登入，將由核心模組處理跳轉...');
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebase(onLoginSuccess, onLoginFail);
});