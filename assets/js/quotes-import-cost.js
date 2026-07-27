/**
 * 業務報價 - 廠商詢價管理 (quotes-import-cost.js)
 * 對應路由: /quotes/import-cost
 */

// 1. 掛載到全域，確保 router.js 永遠找得到
window.initQuotesImportCostPage = function () {
    console.log("🚀 開始執行 initQuotesImportCostPage...");

    // 2. 【一勞永逸閘門】：檢查當前頁面是否有「詢價頁面專屬」的 DOM (例如 costTableBody)
    const costTableBody = document.getElementById('costTableBody');
    if (!costTableBody) {
        console.log("ℹ️ 當前非「廠商詢價頁面」，quotes-import-cost.js 已自動停用。");
        return;
    }

    console.log("✅ 確定為廠商詢價頁面，開始初始化...");

    const db = firebase.firestore();
    const currentUser = firebase.auth().currentUser;

    const projectSelect = document.getElementById('projectSelect');
    const tenderSelect = document.getElementById('tenderSelect');
    const saveCostBtn = document.getElementById('saveCostBtn');

    let currentItems = []; // 儲存當前標單細項

    loadProjects();
    setupEventListeners();

    function setupEventListeners() {
        if (projectSelect) {
            projectSelect.addEventListener('change', (e) => loadTenders(e.target.value));
        }
        if (tenderSelect) {
            tenderSelect.addEventListener('change', (e) => loadDetailItems(e.target.value));
        }
        if (saveCostBtn) {
            saveCostBtn.addEventListener('click', saveCostData);
        }
    }

    // 1. 載入可存取的專案
    async function loadProjects() {
        try {
            const userEmail = currentUser ? currentUser.email : null;
            if (!userEmail) {
                console.warn("⚠️ 未取得當前使用者 Email");
                return;
            }

            const snapshot = await db.collection('projects').get();
            if (projectSelect) {
                projectSelect.innerHTML = '<option value="">請選擇專案...</option>';
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                
                // 相容兩種結構：判斷 memberEmails 陣列 或 members 物件
                const hasAccessByArray = Array.isArray(data.memberEmails) && data.memberEmails.includes(userEmail);
                const hasAccessByObject = data.members && data.members[userEmail];

                if ((hasAccessByArray || hasAccessByObject) && projectSelect) {
                    projectSelect.innerHTML += `<option value="${doc.id}">${data.name || '未命名專案'}</option>`;
                }
            });
        } catch (err) {
            console.error("❌ 載入專案失敗:", err);
            if (typeof showAlert === 'function') {
                showAlert("載入專案失敗: " + err.message, "error");
            }
        }
    }

    // 2. 載入專案對應的標單
    async function loadTenders(projectId) {
        if (!tenderSelect) return;

        if (!projectId) {
            tenderSelect.innerHTML = '<option value="">請先選擇專案</option>';
            tenderSelect.disabled = true;
            return;
        }

        tenderSelect.innerHTML = '<option value="">標單載入中...</option>';
        tenderSelect.disabled = true;

        try {
            const snapshot = await db.collection('tenders').where('projectId', '==', projectId).get();
            
            if (snapshot.empty) {
                tenderSelect.innerHTML = '<option value="">此專案尚無標單</option>';
                tenderSelect.disabled = true;
                return;
            }

            tenderSelect.innerHTML = '<option value="">請選擇標單...</option>';
            snapshot.forEach(doc => {
                const data = doc.data();
                tenderSelect.innerHTML += `<option value="${doc.id}">${data.name || '未命名標單'}</option>`;
            });

            tenderSelect.disabled = false;
        } catch (err) {
            console.error("❌ 載入標單失敗:", err);
            tenderSelect.innerHTML = '<option value="">載入標單失敗</option>';
        }
    }

    // 3. 載入標單細項資料
    async function loadDetailItems(tenderId) {
        if (!tenderId) {
            if (costTableBody) {
                costTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">請選擇標單</td></tr>';
            }
            if (saveCostBtn) saveCostBtn.disabled = true;
            return;
        }

        try {
            const snapshot = await db.collection('detailItems').where('tenderId', '==', tenderId).get();
            currentItems = [];
            snapshot.forEach(doc => {
                currentItems.push({ id: doc.id, ...doc.data() });
            });

            renderCostTable();
            if (saveCostBtn) saveCostBtn.disabled = false;
        } catch (err) {
            console.error("載入細項失敗:", err);
        }
    }

    // 4. 渲染表格
    function renderCostTable() {
        if (!costTableBody) return;

        if (currentItems.length === 0) {
            costTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">該標單尚無細項資料</td></tr>';
            return;
        }

        let html = '';
        currentItems.forEach((item, index) => {
            const costPrice = item.costUnitPrice !== undefined ? item.costUnitPrice : (item.unitPrice || 0);
            const costTotal = (item.totalQuantity || 0) * costPrice;
            const vendor = item.vendorName || '';

            html += `
                <tr>
                    <td>${item.sequence || '-'}</td>
                    <td>${item.name || ''}</td>
                    <td><small class="text-muted">${item.spec || '-'}</small></td>
                    <td class="text-center">${item.unit || ''}</td>
                    <td class="text-end">${(item.totalQuantity || 0).toLocaleString()}</td>
                    <td>
                        <input type="number" class="form-control form-control-sm text-end cost-input" 
                               data-index="${index}" value="${costPrice}" step="any" min="0">
                    </td>
                    <td class="text-end fw-bold cost-total" id="costTotal_${index}">
                        NT$ ${Math.round(costTotal).toLocaleString()}
                    </td>
                    <td>
                        <input type="text" class="form-control form-control-sm vendor-input" 
                               data-index="${index}" value="${vendor}" placeholder="廠商或備註">
                    </td>
                </tr>
            `;
        });

        costTableBody.innerHTML = html;

        // 綁定動態試算事件
        document.querySelectorAll('.cost-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = e.target.dataset.index;
                const newPrice = parseFloat(e.target.value) || 0;
                currentItems[idx].costUnitPrice = newPrice;
                
                const qty = currentItems[idx].totalQuantity || 0;
                const totalCell = document.getElementById(`costTotal_${idx}`);
                if (totalCell) {
                    totalCell.textContent = `NT$ ${Math.round(qty * newPrice).toLocaleString()}`;
                }
            });
        });

        document.querySelectorAll('.vendor-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = e.target.dataset.index;
                currentItems[idx].vendorName = e.target.value;
            });
        });
    }

    // 5. 批次寫入 Firestore
    async function saveCostData() {
        if (currentItems.length === 0) return;

        if (saveCostBtn) {
            saveCostBtn.disabled = true;
            saveCostBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>儲存中...';
        }

        try {
            let batch = db.batch();
            let count = 0;

            for (const item of currentItems) {
                const itemRef = db.collection('detailItems').doc(item.id);
                const costPrice = item.costUnitPrice !== undefined ? item.costUnitPrice : (item.unitPrice || 0);
                const costTotal = (item.totalQuantity || 0) * costPrice;

                batch.update(itemRef, {
                    costUnitPrice: costPrice,
                    costTotalPrice: costTotal,
                    vendorName: item.vendorName || '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }

            if (count > 0) {
                await batch.commit();
            }

            alert('🎉 廠商詢價成本已成功儲存！');
        } catch (err) {
            console.error("儲存失敗:", err);
            alert('儲存失敗: ' + err.message);
        } finally {
            if (saveCostBtn) {
                saveCostBtn.disabled = false;
                saveCostBtn.innerHTML = '<i class="fas fa-save me-1"></i>儲存成本詢價';
            }
        }
    }
};
