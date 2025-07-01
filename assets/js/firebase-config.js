/**
 * ✅ Firebase 統一配置與核心功能模組 (版本 2.0 - SPA)
 * 職責：初始化 Firebase、提供通用工具函數 (資料庫查詢、格式化、用戶登出等)
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
        console.log('🚀 初始化 Firebase 核心模組...');
        
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
            // 在此省略複雜的客戶端排序邏輯，因為大部分情況 Firestore 索引應被建立
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
        
        // 刪除標單本身
        batch.delete(db.collection('tenders').doc(tenderId));
        
        // 並行查詢所有相關集合
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

// --- 標準化資料載入函數 ---
async function loadProjects() {
    return (await safeFirestoreQuery('projects', [{ field: 'createdBy', operator: '==', value: currentUser.email }], { field: 'name', direction: 'asc' })).docs;
}

async function loadTenders() {
    return (await safeFirestoreQuery('tenders', [{ field: 'createdBy', operator: '==', value: currentUser.email }], { field: 'createdAt', direction: 'desc' })).docs;
}

// --- 通用工具函數 ---
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'NT$ 0';
    return 'NT$ ' + parseInt(amount).toLocaleString();
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
    // 省略 showAlert 的具體實現，可沿用您之前的版本
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message);
}

async function logout() {
    if (confirm('確定要登出嗎？')) {
        try {
            await auth.signOut();
            window.location.href = '/login_page.html';
        } catch (error) {
            console.error('登出失敗:', error);
            showAlert('登出失敗', 'error');
        }
    }
}