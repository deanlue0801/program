/**
 * ✅ Firebase 統一配置與核心功能模組 (版本 3.0 - 權限管理第一階段)
 * 職責：初始化 Firebase、提供具備權限檢查的通用資料庫查詢、格式化、用戶登出等
 */

// --- Firebase 配置 ---
const firebaseConfig = {
    apiKey: "AIzaSyDV26PsFl_nH9SkfQAYgbCPjbanDluFrvo",
    authDomain: "project-management-syste-4c9ce.firebaseapp.com",
    projectId: "project-management-syste-4c9ce",
    storageBucket: "project-management-syste-4c9ce.firebasestorage.app",
    messagingSenderId: "153223609209",
    appId: "1:153223609209:web:f4504f7ac52fc76b910da8",
    measurementId: "G-P57N5Y5BE2"
};

// --- 全域變數 ---
let app, auth, db, currentUser;

/**
 * 初始化 Firebase，並根據認證狀態執行回調
 * @param {Function} onAuthSuccess - 登入成功後的回調函數
 * @param {Function} onAuthFail - 登出或未登入時的回調函數
 */
function initFirebase(onAuthSuccess, onAuthFail) {
    try {
        console.log('🚀 初始化 Firebase 核心模組 (v3.0)...');
        
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                console.log('✅ Firebase 核心：用戶已登入', user.email);
                if (onAuthSuccess) await onAuthSuccess(user);
            } else {
                currentUser = null;
                console.log('❌ Firebase 核心：用戶未登入');
                if (onAuthFail) onAuthFail();
            }
        });
    } catch (error) {
        console.error('❌ Firebase 初始化失敗:', error);
        showAlert('系統初始化失敗，請重新整理頁面', 'error');
    }
}

/**
 * 安全的 Firestore 查詢 - 自動處理索引問題並降級為客戶端排序
 */
async function safeFirestoreQuery(collection, whereConditions = [], orderBy = null, limit = null) {
    try {
        let query = db.collection(collection);
        whereConditions.forEach(condition => {
            query = query.where(condition.field, condition.operator, condition.value);
        });
        if (orderBy) {
            query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
        }
        if (limit) {
            query = query.limit(limit);
        }
        const snapshot = await query.get();
        return {
            docs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            serverSorted: true
        };
    } catch (indexError) {
        if (indexError.message.includes('index')) {
            console.warn('⚠️ 索引問題，切換到客戶端排序:', indexError.message);
            let fallbackQuery = db.collection(collection);
            whereConditions.forEach(condition => {
                fallbackQuery = fallbackQuery.where(condition.field, condition.operator, condition.value);
            });
            const snapshot = await fallbackQuery.get();
            let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { docs, serverSorted: false };
        } else {
            throw indexError;
        }
    }
}

/**
 * 批次刪除標單及所有相關資料
 */
async function deleteTenderAndRelatedData(tenderId) {
    try {
        console.log(`🗑️ 開始批次刪除標單 ${tenderId} 及相關資料...`);
        const batch = db.batch();
        const collectionsToDelete = ['majorItems', 'detailItems', 'distributionTable', 'floorSettings'];
        
        batch.delete(db.collection('tenders').doc(tenderId));
        
        const promises = collectionsToDelete.map(coll => 
            db.collection(coll).where('tenderId', '==', tenderId).get()
        );
        const snapshots = await Promise.all(promises);
        
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => batch.delete(doc.ref));
        });
        
        await batch.commit();
        console.log('✅ 批次刪除成功');
        return true;
    } catch (error) {
        console.error('❌ 批次刪除失敗:', error);
        throw error;
    }
}

// --- 標準化資料載入函數 (具備權限管理) ---

/**
 * 【第一階段權限修改】
 * 載入當前使用者有權限存取的專案。
 * 舊邏輯：只載入 createdBy 是自己的專案。
 * 新邏輯：載入 memberEmails 陣列中包含自己的專案。
 */
async function loadProjects() {
    if (!auth.currentUser) {
        console.error("loadProjects: 用戶未登入，無法載入專案。");
        return [];
    }
    console.log(`[權限] 正在為 ${auth.currentUser.email} 載入專案...`);
    
    // 核心修改：從 'createdBy' 查詢改為 'memberEmails' 的 'array-contains' 查詢
    const whereCondition = {
        field: 'memberEmails',
        operator: 'array-contains',
        value: auth.currentUser.email
    };
    
    const result = await safeFirestoreQuery('projects', [whereCondition], { field: 'name', direction: 'asc' });
    console.log(`[權限] 成功載入 ${result.docs.length} 個專案。`);
    return result.docs;
}

/**
 * 【第一階段權限修改】
 * 載入隸屬於使用者有權限專案的所有標單。
 * 舊邏輯：只載入 createdBy 是自己的標單。
 * 新邏輯：先取得有權限的專案列表，再根據專案ID載入對應的標單。
 */
async function loadTenders() {
    if (!auth.currentUser) {
        console.error("loadTenders: 用戶未登入，無法載入標單。");
        return [];
    }
    console.log(`[權限] 正在為 ${auth.currentUser.email} 載入標單...`);

    // 步驟 1: 取得使用者有權限的所有專案
    const authorizedProjects = await loadProjects();

    // 步驟 2: 如果沒有任何專案權限，直接返回空陣列
    if (authorizedProjects.length === 0) {
        console.log("[權限] 使用者沒有任何專案的權限，無需載入標單。");
        return [];
    }

    // 步驟 3: 提取所有專案的 ID
    const authorizedProjectIds = authorizedProjects.map(p => p.id);
    
    // 步驟 4: 使用 'in' 查詢來取得所有相關標單
    // 注意：Firestore 的 'in' 查詢一次最多支援 30 個 ID。如果未來專案數超過此限制，需要分批查詢。
    const whereCondition = {
        field: 'projectId',
        operator: 'in',
        value: authorizedProjectIds
    };

    const result = await safeFirestoreQuery('tenders', [whereCondition], { field: 'createdAt', direction: 'desc' });
    console.log(`[權限] 成功載入 ${result.docs.length} 個標單。`);
    return result.docs;
}


// --- 通用工具函數 (維持不變) ---
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'NT$ 0';
    return 'NT$ ' + parseInt(amount, 10).toLocaleString();
}

function formatDate(timestamp) {
    if (!timestamp) return '未設定';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '無效日期';
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '未設定';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '無效日期';
    return date.toLocaleString('zh-TW');
}

function showAlert(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

async function logout() {
    if (confirm('確定要登出嗎？')) {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('登出失敗:', error);
            showAlert('登出失敗', 'error');
        }
    }
}
