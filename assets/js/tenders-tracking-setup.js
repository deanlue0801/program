/**
 * 追蹤項目設定 (tenders-tracking-setup.js) - v3.0 (最終執行時機修正版)
 * 確保 init 函數在全域可見，並等待 DOM 載入後才執行內部邏輯
 */
function initTenderTrackingSetupPage() {
    console.log("🚀 初始化「施工追蹤項目設定」頁面 (v3.0)...");

    // 【步驟一】定義一個等待函數
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

    // 【步驟二】等待頁面關鍵元素'#projectSelect'出現後，才執行所有頁面邏輯
    waitForElement('#projectSelect', () => {
        
        console.log("✅ DOM 元素已就緒，開始執行追蹤項目設定頁面的核心邏輯...");

        // --- 將所有變數和 UI 元件的定義移到此處 ---
        const db = firebase.firestore();
        const currentUser = firebase.auth().currentUser;

        const ui = {
            projectSelect: document.getElementById('projectSelect'),
            tenderSelect: document.getElementById('tenderSelect'),
            majorItemSelect: document.getElementById('majorItemSelect'),
            tableBody: document.getElementById('tableBody'),
            saveBtn: document.getElementById('saveTrackingItemsBtn'), // 現在保證能找到
            loading: document.getElementById('loading'),
            mainContent: document.getElementById('mainContent'),
            emptyState: document.getElementById('emptyState')
        };
        
        let projects = [], tenders = [], majorItems = [], detailItems = [];
        let trackingItemChanges = new Set();
        
        if (!currentUser) {
            showAlert("錯誤：您的登入狀態已失效，請重新整理頁面或登入。", "error");
            return;
        }

        // --- 將所有原本的函式定義都放在這裡 ---

        function setupEventListeners() {
            // 現在 ui.saveBtn 絕對不會是 null
            ui.saveBtn.addEventListener('click', saveTrackingItems);
            ui.projectSelect.addEventListener('change', onProjectChange);
            ui.tenderSelect.addEventListener('change', onTenderChange);
            ui.majorItemSelect.addEventListener('change', onMajorItemChange);

            ui.tableBody.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox' && e.target.dataset.itemId) {
                    const itemId = e.target.dataset.itemId;
                    if (trackingItemChanges.has(itemId)) {
                        trackingItemChanges.delete(itemId);
                    } else {
                        trackingItemChanges.add(itemId);
                    }
                    ui.saveBtn.disabled = trackingItemChanges.size === 0;
                    ui.saveBtn.textContent = trackingItemChanges.size > 0 ? `💾 儲存 ${trackingItemChanges.size} 項變更` : '💾 儲存設定';
                }
            });
        }

        async function loadProjectsWithPermission() {
            try {
                const allProjects = await loadProjects(); 
                projects = allProjects.filter(p => p.members && p.members[currentUser.email]);
                populateSelect(ui.projectSelect, projects, '請選擇專案...');
            } catch (error) {
                showAlert('載入專案失敗', 'error');
            }
        }

        async function onProjectChange(e) {
            const projectId = e.target ? e.target.value : e;
            resetSelects('tender');
            if (!projectId) return;
            loadTenders(projectId);
        }

        async function onTenderChange(e) {
            const tenderId = e.target ? e.target.value : e;
            resetSelects('majorItem');
            if (!tenderId) return;
            loadMajorItems(tenderId);
        }
        
        async function onMajorItemChange(e) {
             const majorItemId = e.target ? e.target.value : e;
             if (!majorItemId) {
                showMainContent(false);
                return;
             }
             showLoading(true, '載入細項中...');
             try {
                await loadDetailItems(majorItemId);
                renderItemsTable();
                showMainContent(true);
             } catch(error) {
                showAlert('載入細項資料失敗', 'error');
             } finally {
                showLoading(false);
             }
        }

        async function loadTenders(projectId) {
            try {
                const tenderDocs = await safeFirestoreQuery("tenders", [{ field: "projectId", operator: "==", value: projectId }]);
                tenders = tenderDocs.docs;
                populateSelect(ui.tenderSelect, tenders, '請選擇標單...');
            } catch (error) {
                showAlert('載入標單失敗', 'error');
            }
        }
        
        async function loadMajorItems(tenderId) {
            try {
                 const majorItemDocs = await safeFirestoreQuery("majorItems", [{ field: "tenderId", operator: "==", value: tenderId }]);
                 majorItems = majorItemDocs.docs.sort(naturalSequenceSort);
                 populateSelect(ui.majorItemSelect, majorItems, '所有大項目');
            } catch (error) {
                showAlert('載入大項目失敗', 'error');
            }
        }

        async function loadDetailItems(majorItemId) {
            const queryConstraints = [{ field: "tenderId", operator: "==", value: ui.tenderSelect.value }];
            if(majorItemId !== 'all') {
                queryConstraints.push({ field: "majorItemId", operator: "==", value: majorItemId });
            }
            const detailItemDocs = await safeFirestoreQuery("detailItems", queryConstraints);
            detailItems = detailItemDocs.docs.sort(naturalSequenceSort);
        }

        async function saveTrackingItems() {
            ui.saveBtn.disabled = true;
            ui.saveBtn.textContent = '儲存中...';
            const batch = db.batch();
            trackingItemChanges.forEach(itemId => {
                const checkbox = ui.tableBody.querySelector(`input[data-item-id="${itemId}"]`);
                if (checkbox) {
                    const docRef = db.collection('detailItems').doc(itemId);
                    batch.update(docRef, { isTracking: checkbox.checked });
                }
            });
            try {
                await batch.commit();
                showAlert('✅ 設定儲存成功！', 'success');
                trackingItemChanges.clear();
                ui.saveBtn.textContent = '💾 儲存設定';
            } catch (error) {
                showAlert('儲存失敗', 'error');
                ui.saveBtn.disabled = false;
                ui.saveBtn.textContent = `💾 儲存 ${trackingItemChanges.size} 項變更`;
            }
        }

        function renderItemsTable() {
            let html = '';
            if (detailItems.length === 0) {
                html = '<tr><td colspan="5" class="text-center" style="padding: 2rem;">此篩選條件下無項目。</td></tr>';
            } else {
                 detailItems.forEach(item => {
                    html += `
                        <tr>
                            <td class="text-center">
                                <label class="toggle-switch">
                                    <input type="checkbox" data-item-id="${item.id}" ${item.isTracking !== false ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </td>
                            <td class="text-center">${item.sequence || ''}</td>
                            <td>${item.name}</td>
                            <td class="text-center">${item.unit || ''}</td>
                            <td class="text-right">${item.totalQuantity || 0}</td>
                        </tr>`;
                });
            }
            ui.tableBody.innerHTML = html;
        }
        
        function populateSelect(selectEl, options, defaultText) {
            let html = `<option value="">${defaultText}</option>`;
            if(selectEl.id === 'majorItemSelect') {
                 html += `<option value="all">所有大項目</option>`;
            }
            options.forEach(option => { html += `<option value="${option.id}">${option.name}</option>`; });
            selectEl.innerHTML = html;
            selectEl.disabled = false;
        }
        
        function resetSelects(from = 'project') {
             const selects = ['tender', 'majorItem'];
             const startIdx = selects.indexOf(from);
             for (let i = startIdx; i < selects.length; i++) {
                const select = document.getElementById(`${selects[i]}Select`);
                if(select) {
                    select.innerHTML = `<option value="">請先選擇上個選項</option>`;
                    select.disabled = true;
                }
             }
             showMainContent(false);
        }

        function showLoading(isLoading, message = '載入中...') {
            if (ui.loading) {
                ui.loading.style.display = isLoading ? 'flex' : 'none';
                ui.loading.querySelector('p').textContent = message;
            }
        }
        
        function showMainContent(shouldShow) {
             ui.mainContent.style.display = shouldShow ? 'block' : 'none';
             ui.emptyState.style.display = shouldShow ? 'none' : 'flex';
        }

        function showAlert(message, type = 'info') {
            alert(`[${type.toUpperCase()}] ${message}`);
        }
        
        function naturalSequenceSort(a, b) {
            const re = /(\d+(\.\d+)?)|(\D+)/g;
            const pA = String(a.sequence || '').match(re) || [];
            const pB = String(b.sequence || '').match(re) || [];
            for (let i = 0; i < Math.min(pA.length, pB.length); i++) {
                const nA = parseFloat(pA[i]), nB = parseFloat(pB[i]);
                if (!isNaN(nA) && !isNaN(nB)) { if (nA !== nB) return nA - nB; } 
                else if (pA[i] !== pB[i]) return pA[i].localeCompare(pB[i]);
            }
            return pA.length - pB.length;
        }

        // --- 啟動頁面 ---
        loadProjectsWithPermission();
        setupEventListeners();
    });
}
