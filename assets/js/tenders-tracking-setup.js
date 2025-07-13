// assets/js/tenders-tracking-setup.js

/**
 * 初始化「標單追蹤項目設定」頁面
 * 這個函式只應該在 router.js 呼叫時執行
 */
function initTenderTrackingSetupPage() {
    // 檢查 Firebase 是否已初始化
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error("Firebase is not initialized.");
        return;
    }

    const db = firebase.firestore();
    let detailItems = []; 

    /**
     * 【修正#1】從 URL 的 search query 中獲取標單 ID
     * 您的新版路由器是基於路徑的，所以參數在 window.location.search 中
     */
    function getTenderIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // 渲染項目列表
    function renderItemsList() {
        const listContainer = document.getElementById('items-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = ''; 

        if (detailItems.length === 0) {
            listContainer.innerHTML = '<div class="alert alert-info">此標單尚無施工細項可供設定。</div>';
            return;
        }

        let currentMajorItemName = '';

        detailItems.forEach(item => {
            if (item.data.majorItemName && item.data.majorItemName !== currentMajorItemName) {
                currentMajorItemName = item.data.majorItemName;
                const majorItemHeader = document.createElement('h5');
                majorItemHeader.className = 'mt-3 mb-2 text-primary fw-bold';
                majorItemHeader.textContent = currentMajorItemName;
                listContainer.appendChild(majorItemHeader);
            }
            
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
                batch.update(docRef, { excludeFromProgress: !shouldBeTracked });
            });

            await batch.commit();
            alert('設定已成功儲存！');

            if (typeof navigateTo === 'function') {
                navigateTo('/tenders/list'); 
            } else {
                window.location.href = '/#/tenders/list';
            }

        } catch (error) {
            console.error("儲存設定時發生錯誤:", error);
            alert('儲存失敗，請檢查主控台錯誤訊息。');
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save me-1"></i> 儲存設定';
        }
    }
    
    // --- 頁面初始化的主邏輯 ---
    // 這段程式碼現在只會在 initTenderTrackingSetupPage 被呼叫時執行
    const currentTenderId = getTenderIdFromUrl();
    if (!currentTenderId) {
        // 這個錯誤現在只應該在直接訪問無效 URL 時出現，而不是在儀表板頁面
        console.error("在追蹤設定頁面中找不到標單 ID。");
        const listContainer = document.getElementById('items-list');
        if (listContainer) {
            listContainer.innerHTML = '<div class="alert alert-danger">無效的標單 ID，請從標單列表重新進入。</div>';
        }
        return;
    }

    (async () => {
        try {
            const tenderDoc = await db.collection('tenders').doc(currentTenderId).get();
            if (tenderDoc.exists) {
                document.getElementById('tender-name-header').textContent = `標單: ${tenderDoc.data().name}`;
            }

            const itemsSnapshot = await db.collection('detailItems')
                .where('tenderId', '==', currentTenderId)
                .orderBy('order')
                .get();
            
            detailItems = itemsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            renderItemsList();

        } catch (error) {
            console.error("讀取資料時發生錯誤:", error);
            document.getElementById('items-list').innerHTML = '<div class="alert alert-danger">讀取資料失敗。</div>';
        }

        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    })();
}
