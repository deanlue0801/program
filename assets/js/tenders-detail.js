/**
 * 標單詳情頁 (tenders-detail.js) (SPA 版本) - v4.1 (修正 safeFirestoreQuery 回傳格式)
 */
function initTenderDetailPage() {
    
    // --- 全域變數 ---
    let tenderId, projectId;
    let currentTender, currentProject;
    let majorItems = [], detailItems = [], allAdditionItems = [];

    // --- 初始化 ---
    async function initializePage() {
        console.log("🚀 初始化標單詳情頁面 (v4.1)...");
        ({ tenderId, projectId } = getUrlParams());
        if (!tenderId || !projectId) {
            return showAlert('錯誤：缺少標單或專案 ID', 'error');
        }
        await loadAllData();
    }
    
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            tenderId: params.get('tenderId'),
            projectId: params.get('projectId')
        };
    }

    // --- 資料載入 ---
    async function loadAllData() {
        showLoading(true);
        try {
            await Promise.all([
                loadTenderAndProjectDetails(),
                loadMajorAndDetailItems(),
            ]);
            
            // 在主要資料載入後，非同步載入附加項，不阻塞渲染
            loadAllAdditionItems().then(() => {
                // 附加項載入後，需要重新渲染一次表格，確保總量正確
                buildMajorItemsTables();
            });

            displayTenderDetails();
            buildMajorItemsTables();
            setupEventListeners();

        } catch (error) {
            console.error('❌ 載入標單詳情頁失敗:', error);
            showAlert(`載入頁面失敗: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function loadTenderAndProjectDetails() {
        const [tenderDoc, projectDoc] = await Promise.all([
            db.collection("tenders").doc(tenderId).get(),
            db.collection("projects").doc(projectId).get()
        ]);
        if (!tenderDoc.exists || !projectDoc.exists) {
            throw new Error('找不到指定的標單或專案');
        }
        currentTender = { id: tenderDoc.id, ...tenderDoc.data() };
        currentProject = { id: projectDoc.id, ...projectDoc.data() };
    }

    async function loadMajorAndDetailItems() {
        // 【核心修正】在查詢子集合時，必須同時傳入 projectId，以符合安全規則
        const [majorItemsResult, detailItemsResult] = await Promise.all([
            safeFirestoreQuery('majorItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id }
            ]),
            safeFirestoreQuery('detailItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id }
            ])
        ]);
        
        // 【v4.1 修正】safeFirestoreQuery 已經返回處理好的物件陣列，無需再呼叫 .data()
        majorItems = majorItemsResult.docs.sort(naturalSequenceSort);
        detailItems = detailItemsResult.docs.sort(naturalSequenceSort);
    }
    
    async function loadAllAdditionItems() {
        try {
            const result = await safeFirestoreQuery('detailItems', [
                { field: 'tenderId', operator: '==', value: tenderId },
                { field: 'projectId', operator: '==', value: currentProject.id },
                { field: 'isAddition', operator: '==', value: true }
            ]);
            allAdditionItems = result.docs;
        } catch (error) {
            console.error("載入所有附加項失敗:", error);
            // 這個載入失敗不應該阻擋整個頁面，所以只在 console 報錯
        }
    }

    // --- DOM 渲染 ---
    function displayTenderDetails() {
        document.getElementById('tender-name').textContent = currentTender.name || '未命名標單';
        document.getElementById('project-name').textContent = currentProject.name || '未命名專案';
        document.getElementById('tender-date').textContent = `開標日期：${currentTender.tenderDate || '未設定'}`;
        document.getElementById('tender-id').textContent = `標單號碼：${currentTender.tenderNumber || '未設定'}`;
    }

    function buildMajorItemsTables() {
        const container = document.getElementById('major-items-container');
        container.innerHTML = ''; // 清空舊內容

        if (majorItems.length === 0) {
            container.innerHTML = '<p class="empty-state">此標單尚無工程大項</p>';
            return;
        }

        majorItems.forEach(majorItem => {
            const section = document.createElement('section');
            section.className = 'major-item-section';
            section.innerHTML = `
                <div class="major-item-header">
                    <h2>${majorItem.name}</h2>
                    <p>合約金額：${formatCurrency(majorItem.contractAmount)}</p>
                    <button class="toggle-details-btn" data-major-id="${majorItem.id}">展開細項</button>
                </div>
                <div class="details-container" id="details-${majorItem.id}" style="display: none;"></div>
            `;
            container.appendChild(section);
        });
    }

    function buildDetailItemsTable(majorId) {
        const detailsContainer = document.getElementById(`details-${majorId}`);
        const items = detailItems.filter(item => item.majorItemId === majorId);

        if (items.length === 0) {
            detailsContainer.innerHTML = '<p>此大項尚無細項</p>';
            return;
        }

        let tableHTML = `
            <table class="distribution-table detail-view-table">
                <thead>
                    <tr>
                        <th style="width: 80px;">項次</th>
                        <th>項目名稱</th>
                        <th style="width: 100px;">單位</th>
                        <th style="width: 120px;">單價</th>
                        <th style="width: 120px;">合約數量</th>
                        <th style="width: 120px;">追加減數量</th>
                        <th style="width: 120px;">總數量</th>
                    </tr>
                </thead>
                <tbody>
        `;

        items.forEach(item => {
            const relatedAdditions = allAdditionItems.filter(add => add.relatedItemId === item.id);
            const additionalQuantity = relatedAdditions.reduce((sum, add) => sum + (add.totalQuantity || 0), 0);
            const totalQuantity = (item.totalQuantity || 0) + additionalQuantity;

            tableHTML += `
                <tr>
                    <td>${item.sequence || ''}</td>
                    <td>${item.name || '未命名'}</td>
                    <td>${item.unit || '-'}</td>
                    <td>${formatCurrency(item.unitPrice)}</td>
                    <td>${item.totalQuantity || 0}</td>
                    <td class="${additionalQuantity !== 0 ? (additionalQuantity > 0 ? 'text-success' : 'text-danger') : ''}">${additionalQuantity}</td>
                    <td><strong>${totalQuantity}</strong></td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        detailsContainer.innerHTML = tableHTML;
    }

    // --- 事件監聽 ---
    function setupEventListeners() {
        const container = document.getElementById('major-items-container');
        container.addEventListener('click', (event) => {
            if (event.target.classList.contains('toggle-details-btn')) {
                toggleDetails(event.target);
            }
        });
        
        document.getElementById('back-to-list-btn').addEventListener('click', () => {
            navigateTo('/tenders');
        });
    }

    function toggleDetails(button) {
        const majorId = button.dataset.majorId;
        const detailsContainer = document.getElementById(`details-${majorId}`);
        const isVisible = detailsContainer.style.display === 'block';

        if (isVisible) {
            detailsContainer.style.display = 'none';
            button.textContent = '展開細項';
        } else {
            buildDetailItemsTable(majorId); // 點擊時才建立表格
            detailsContainer.style.display = 'block';
            button.textContent = '收合細項';
        }
    }
    
    // --- 輔助函式 ---
    function showLoading(isLoading) {
        const loadingEl = document.querySelector('.loading-overlay');
        if (loadingEl) {
            loadingEl.style.display = isLoading ? 'flex' : 'none';
        }
    }
    
    function showAlert(message, type = 'info') {
        alert(`[${type.toUpperCase()}] ${message}`);
    }
    
    function formatCurrency(amount) {
        if (typeof amount !== 'number') return 'N/A';
        return `NT$ ${amount.toLocaleString()}`;
    }
    
    function naturalSequenceSort(a, b) {
        const re = /(\d+(\.\d+)?)|(\D+)/g;
        const pA = String(a.sequence||'').match(re)||[];
        const pB = String(b.sequence||'').match(re)||[];
        for(let i=0; i<Math.min(pA.length, pB.length); i++) {
            const nA=parseFloat(pA[i]), nB=parseFloat(pB[i]);
            if(!isNaN(nA)&&!isNaN(nB)){
                if(nA!==nB)return nA-nB;
            } else if(pA[i]!==pB[i]) {
                return pA[i].localeCompare(pB[i]);
            }
        }
        return pA.length - pB.length;
    }

    // --- 執行初始化 ---
    initializePage();
}
