// assets/js/tenders-tracking-setup.js
(async function() {
    // 檢查 Firebase 是否已初始化
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error("Firebase is not initialized. Make sure firebase-config.js is loaded.");
        return;
    }

    const db = firebase.firestore();
    let currentTenderId = null;
    let detailItems = []; // 用於存放所有細項的原始資料

    // 從 URL 獲取標單 ID
    function getTenderIdFromUrl() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        return params.get('id');
    }

    // 渲染項目列表
    function renderItemsList() {
        const listContainer = document.getElementById('items-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = ''; // 清空載入動畫

        if (detailItems.length === 0) {
            listContainer.innerHTML = '<div class="alert alert-info">此標單尚無施工細項可供設定。</div>';
            return;
        }

        let currentMajorItemName = '';

        detailItems.forEach(item => {
            // 如果是大項，顯示標題
            if (item.data.majorItemName && item.data.majorItemName !== currentMajorItemName) {
                currentMajorItemName = item.data.majorItemName;
                const majorItemHeader = document.createElement('h5');
                majorItemHeader.className = 'mt-3 mb-2 text-primary fw-bold';
                majorItemHeader.textContent = currentMajorItemName;
                listContainer.appendChild(majorItemHeader);
            }
            
            // 建立每個細項的列表項目
            const listItem = document.createElement('label');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';

            const itemText = document.createElement('span');
            itemText.textContent = `${item.data.name} (${item.data.unit})`;
            
            const switchContainer = document.createElement('div');
            switchContainer.className = 'form-check form-switch';
            
            const input = document.createElement('input');
            input.className = 'form-check-input';
            input.type = 'checkbox';
            input.role = 'switch';
            input.id = `switch-${item.id}`;
            input.dataset.itemId = item.id;
            // 如果 excludeFromProgress 是 false 或 undefined，則表示需要追蹤，應勾選
            input.checked = !item.data.excludeFromProgress;
            
            switchContainer.appendChild(input);
            listItem.appendChild(itemText);
            listItem.appendChild(switchContainer);
            listContainer.appendChild(listItem);
        });
    }

    // 儲存設定
    async function saveSettings() {
        const saveButton = document.getElementById('save-settings-btn');
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 儲存中...';

        try {
            const batch = db.batch();
            const switches = document.querySelectorAll('.form-check-input[data-item-id]');
            
            switches.forEach(switchEl => {
                const itemId = switchEl.dataset.itemId;
                const shouldBeTracked = switchEl.checked;
                const docRef = db.collection('detailItems').doc(itemId);
                
                // 如果勾選，則 excludeFromProgress 應為 false 或直接刪除該欄位
                // 如果未勾選，則 excludeFromProgress 應為 true
                batch.update(docRef, { excludeFromProgress: !shouldBeTracked });
            });

            await batch.commit();
            
            alert('設定已成功儲存！');
            window.location.hash = `#/tenders/list`; // 操作成功後返回列表頁

        } catch (error) {
            console.error("儲存設定時發生錯誤:", error);
            alert('儲存失敗，請檢查主控台錯誤訊息。');
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save me-1"></i> 儲存設定';
        }
    }

    // 頁面初始化函式
    async function initializePage() {
        currentTenderId = getTenderIdFromUrl();
        if (!currentTenderId) {
            console.error("找不到標單 ID");
            document.getElementById('page-title').textContent = '錯誤';
            document.getElementById('items-list').innerHTML = '<div class="alert alert-danger">無效的標單 ID。</div>';
            return;
        }

        try {
            // 獲取標單名稱
            const tenderDoc = await db.collection('tenders').doc(currentTenderId).get();
            if (tenderDoc.exists) {
                document.getElementById('tender-name-header').textContent = `標單: ${tenderDoc.data().name}`;
            }

            // 獲取所有相關的施工細項
            const itemsSnapshot = await db.collection('detailItems')
                .where('tenderId', '==', currentTenderId)
                .orderBy('order')
                .get();
            
            detailItems = itemsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            
            renderItemsList();

        } catch (error) {
            console.error("讀取資料時發生錯誤:", error);
            document.getElementById('items-list').innerHTML = '<div class="alert alert-danger">讀取資料失敗，請檢查主控台錯誤訊息。</div>';
        }

        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    }

    // 當 DOM 載入完成後執行初始化
    document.addEventListener('DOMContentLoaded', initializePage);
    
    // 如果是 SPA 環境，我們可能需要手動觸發初始化
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(initializePage, 0);
    }

})();
