/**
 * 空間分配管理系統 (space-distribution.js) - v3.5 (最終執行時機修正版)
 * 基於您提供的 v3.4 版本，修正 SPA 路由下的初始化問題。
 */
function initSpaceDistributionPage() {
    console.log("🚀 初始化獨立空間分配頁面 (v3.5)...");

    // 【新增】等待函數，確保 DOM 載入完成
    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback();
            return;
        }
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback();
            }
        }, 100);
    }

    // 【修改】將您所有的程式碼包裹在 waitForElement 中
    waitForElement('#projectSelect', () => {
        
        console.log("✅ DOM 元素已就緒，開始執行 v3.4 核心邏輯...");

        // --- 您 v3.4 版本的所有變數和函式，原封不動地放在這裡 ---
        let projects = [], tenders = [], majorItems = [], tenderFloors = [];
        let selectedProject = null, selectedTender = null, selectedMajorItem = null, selectedFloor = null;
        let currentUserRole = null, currentUserPermissions = {};
        let detailItems = [], floorDistributions = [], spaceDistributions = [], spaces = []; 

        async function initializePage() {
            // 這個函式現在在 DOM 載入後才會被呼叫
            if (!auth.currentUser) return showAlert("無法獲取用戶資訊", "error");
            setupEventListeners();
            await loadProjectsWithPermission();
        }
        
        async function loadProjectsWithPermission() {
            showLoading(true, '載入專案中...');
            try {
                const allMyProjects = await loadProjects();
                const userEmail = auth.currentUser.email;
                projects = allMyProjects.filter(project => {
                    const memberInfo = project.members[userEmail];
                    return memberInfo && (memberInfo.role === 'owner' || (memberInfo.role === 'editor' && memberInfo.permissions.canAccessDistribution));
                });
                populateSelect(document.getElementById('projectSelect'), projects, '請選擇專案...');
            } catch (error) {
                showAlert('載入專案失敗', 'error');
            } finally {
                showLoading(false);
            }
        }

        async function onProjectChange(projectId) {
            resetSelects('tender');
            hideContent();
            if (!projectId) {
                selectedProject = null;
                return;
            }
            selectedProject = projects.find(p => p.id === projectId);
            const tenderSelect = document.getElementById('tenderSelect');
            tenderSelect.innerHTML = '<option value="">載入中...</option>';
            tenderSelect.disabled = true;
            try {
                const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
                tenders = tenderDocs.docs;
                populateSelect(tenderSelect, tenders, '請選擇標單...');
            } catch (error) {
                showAlert('載入標單失敗', 'error');
                tenderSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onTenderChange(tenderId) {
            resetSelects('majorItem');
            hideContent();
            if (!tenderId) {
                selectedTender = null;
                return;
            }
            selectedTender = tenders.find(t => t.id === tenderId);
            const majorItemSelect = document.getElementById('majorItemSelect');
            majorItemSelect.innerHTML = '<option value="">載入中...</option>';
            majorItemSelect.disabled = true;

            try {
                const [majorItemDocs, floorSettingsDoc] = await Promise.all([
                    safeFirestoreQuery("majorItems", [
                        { field: "tenderId", operator: "==", value: tenderId },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("floorSettings", [
                        { field: "tenderId", operator: "==", value: tenderId },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ])
                ]);

                majorItems = majorItemDocs.docs;
                populateSelect(majorItemSelect, majorItems, '請選擇大項目...');
                
                tenderFloors = floorSettingsDoc.docs.length > 0 ? (floorSettingsDoc.docs[0].floors || []) : [];
                tenderFloors.sort(sortFloors);

            } catch (error) {
                showAlert('載入大項目或樓層失敗: ' + error.message, 'error');
                majorItemSelect.innerHTML = '<option value="">載入失敗</option>';
            }
        }

        async function onMajorItemChange(majorItemId) {
            resetSelects('floor');
            hideContent();
            if(!majorItemId) return;
            selectedMajorItem = majorItems.find(m => m.id === majorItemId);

            const memberInfo = selectedProject.members[auth.currentUser.email];
            currentUserRole = memberInfo.role;
            currentUserPermissions = memberInfo.permissions || {};
            const canAccess = currentUserRole === 'owner' || (currentUserRole === 'editor' && currentUserPermissions.canAccessDistribution);

            if (!canAccess) {
                showAlert('您沒有權限設定此專案的空間分配', 'error');
                hideContent();
                return;
            }

            showLoading(true, '載入細項資料...');
            try {
                const detailItemsResult = await safeFirestoreQuery("detailItems", [
                    { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                    { field: "projectId", operator: "==", value: selectedProject.id }
                ]);
                detailItems = detailItemsResult.docs.sort(naturalSequenceSort);
                
                const floorSelect = document.getElementById('floorSelect');
                populateSelect(floorSelect, tenderFloors.map(f => ({id:f, name:f})), '請選擇樓層...', '此標單無樓層設定');
            } catch (error) {
                showAlert('載入細項資料失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }

        async function onFloorChange(floorName) {
            hideContent();
            if(!floorName) {
                selectedFloor = null;
                return;
            }
            selectedFloor = floorName;
            showLoading(true, '載入分配資料...');
            try {
                const [ floorDistributionsResult, spaceSettingsResult, spaceDistributionsResult ] = await Promise.all([
                    safeFirestoreQuery("distributionTable", [
                        { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                        { field: "areaName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("spaceSettings", [
                        { field: "tenderId", operator: "==", value: selectedTender.id },
                        { field: "floorName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ]),
                    safeFirestoreQuery("spaceDistribution", [
                        { field: "majorItemId", operator: "==", value: selectedMajorItem.id },
                        { field: "floorName", operator: "==", value: selectedFloor },
                        { field: "projectId", operator: "==", value: selectedProject.id }
                    ])
                ]);
                floorDistributions = floorDistributionsResult.docs;
                spaces = spaceSettingsResult.docs.length > 0 ? (spaceSettingsResult.docs[0].spaces || []) : [];
                spaceDistributions = spaceDistributionsResult.docs;
                
                document.getElementById('currentLocation').textContent = `樓層: ${selectedFloor}`;
                buildSpaceDistributionTable();
                showContent();
            } catch (error) {
                showAlert('載入樓層資料失敗: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
        
        function buildSpaceDistributionTable() {
            const tableHeader = document.getElementById('tableHeader');
            const tableBody = document.getElementById('tableBody');
            const noSpacesState = document.getElementById('noSpacesState');
            const tableContainer = document.querySelector('.table-container');

            if (!tableHeader || !tableBody) return;
            
            const itemsForThisFloor = detailItems.filter(item => {
                const floorDist = floorDistributions.find(d => d.detailItemId === item.id);
                return floorDist && floorDist.quantity > 0;
            });

            if (itemsForThisFloor.length === 0) {
                noSpacesState.querySelector('p').textContent = '此樓層無任何已設定數量的細項。';
                noSpacesState.style.display = 'flex';
                tableContainer.style.display = 'none';
                return;
            }

            tableContainer.style.display = '';
            if (spaces.length === 0) {
                noSpacesState.querySelector('p').textContent = '尚未建立任何空間。請點擊「管理空間」按鈕來新增。';
                noSpacesState.style.display = 'flex';
            } else {
                noSpacesState.style.display = 'none';
            }

            let headerHTML = '<tr><th style="width: 80px;">項次</th><th style="width: 250px;">細項名稱</th><th class="total-column">樓層總量</th>';
            if (spaces.length > 0) {
                spaces.forEach(space => headerHTML += `<th class="floor-header">${space}</th>`);
                headerHTML += '<th class="total-column">已分配(空間)</th>';
            }
            headerHTML += '</tr>';
            tableHeader.innerHTML = headerHTML;
            
            let bodyHTML = '';
            itemsForThisFloor.forEach(item => {
                const floorDist = floorDistributions.find(d => d.detailItemId === item.id);
                const floorTotalQuantity = floorDist ? floorDist.quantity : 0;
                
                let rowHTML = `<tr class="item-row" data-total-quantity="${floorTotalQuantity}" data-item-id="${item.id}">`;
                
                rowHTML += `<td>${item.sequence || ''}</td>`;
                rowHTML += `<td><div class="item-info"><div class="item-name">${item.name || '未命名'}</div><div class="item-details">單位: ${item.unit || '-'}</div></div></td>`;
                rowHTML += `<td class="total-column" id="total-qty-${item.id}"><strong>${floorTotalQuantity}</strong></td>`;
                
                if (spaces.length > 0) {
                    let distributedInSpaces = 0;
                    spaces.forEach(space => {
                        const spaceDist = spaceDistributions.find(d => d.detailItemId === item.id && d.spaceName === space);
                        const quantity = spaceDist ? spaceDist.quantity : 0;
                        distributedInSpaces += quantity;
                        rowHTML += `<td><input type="number" class="quantity-input ${quantity > 0 ? 'has-value' : ''}" value="${quantity || ''}" min="0" data-item-id="${item.id}" data-space="${space}" placeholder="0"></td>`;
                    });
                    const errorClass = distributedInSpaces > floorTotalQuantity ? 'error' : '';
                    rowHTML += `<td class="total-column ${errorClass}" id="distributed-${item.id}"><strong>${distributedInSpaces}</strong></td>`;
                }
                rowHTML += '</tr>';
                bodyHTML += rowHTML;
            });
            tableBody.innerHTML = bodyHTML;

            if (spaces.length > 0) {
                tableBody.querySelectorAll('.quantity-input').forEach(input => input.addEventListener('input', () => onQuantityChange(input)));
            }
        }
        
        async function saveAllSpaceDistributions() { /* ...您 v3.4 的程式碼... */ }
        function onQuantityChange(inputElement) { /* ...您 v3.4 的程式碼... */ }
        function setupEventListeners() { /* ...您 v3.4 的程式碼... */ }
        function exportToExcel() { /* ...您 v3.4 的程式碼... */ }
        async function handleFileImport(event) { /* ...您 v3.4 的程式碼... */ }
        function showSpaceManager() { /* ...您 v3.4 的程式碼... */ }
        function displayCurrentSpaces() { /* ...您 v3.4 的程式碼... */ }
        function addCustomSpace() { /* ...您 v3.4 的程式碼... */ }
        function clearAllSpaces() { /* ...您 v3.4 的程式碼... */ }
        async function _performSaveSpaceSettings() { /* ...您 v3.4 的程式碼... */ }
        function saveSpaceSettings() { /* ...您 v3.4 的程式碼... */ }
        function resetSelects(from = 'project') { /* ...您 v3.4 的程式碼... */ }
        function hideContent() { /* ...您 v3.4 的程式碼... */ }
        function showContent() { /* ...您 v3.4 的程式碼... */ }
        function closeModal(modalId) { /* ...您 v3.4 的程式碼... */ }
        function showLoading(isLoading, message='載入中...') { /* ...您 v3.4 的程式碼... */ }
        function naturalSequenceSort(a, b) { /* ...您 v3.4 的程式碼... */ }
        function populateSelect(selectEl, options, defaultText, emptyText) { /* ...您 v3.4 的程式碼... */ }
        function sortFloors(a, b) { /* ...您 v3.4 的程式碼... */ }
        
        // --- 啟動頁面 ---
        initializePage();

    }); // waitForElement 結束
}
