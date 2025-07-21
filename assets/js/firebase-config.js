/**
 * ✅ Firebase 統一配置與核心功能模組 (版本 5.0 - 穩定版)
 * 職責：初始化 Firebase、提供具備權限檢查的通用資料庫查詢、格式化、用戶登出等
 */

const firebaseConfig = {
    apiKey: "AIzaSyDV26PsFl_nH9SkfQAYgbCPjbanDluFrvo",
    authDomain: "project-management-syste-4c9ce.firebaseapp.com",
    projectId: "project-management-syste-4c9ce",
    storageBucket: "project-management-syste-4c9ce.appspot.com",
    messagingSenderId: "153223609209",
    appId: "1:153223609209:web:f4504f7ac52fc76b910da8",
    measurementId: "G-P57N5Y5BE2"
};

let app, auth, db, currentUser;

function initFirebase(onAuthSuccess, onAuthFail) {
    try {
        console.log('🚀 初始化 Firebase 核心模組 (v5.0)...');
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
            console.warn(`⚠️ 索引問題，切換到客戶端排序: ${collection}`, indexError.message);
            let fallbackQuery = db.collection(collection);
            whereConditions.forEach(condition => {
                fallbackQuery = fallbackQuery.where(condition.field, condition.operator, condition.value);
            });
            if (limit) {
                fallbackQuery = fallbackQuery.limit(limit);
            }
            const snapshot = await fallbackQuery.get();
            let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (orderBy) {
                docs.sort((a, b) => {
                    const fieldA = a[orderBy.field];
                    const fieldB = b[orderBy.field];
                    if (fieldA < fieldB) return orderBy.direction === 'desc' ? 1 : -1;
                    if (fieldA > fieldB) return orderBy.direction === 'desc' ? -1 : 1;
                    return 0;
                });
            }
            return { docs, serverSorted: false };
        } else {
            console.error(`Firestore 查詢失敗 (${collection}):`, indexError);
            throw indexError;
        }
    }
}

async function deleteTenderAndRelatedData(tenderId) {
    try {
        console.log(`🗑️ 開始批次刪除標單 ${tenderId} 及相關資料...`);
        const batch = db.batch();
        const collectionsToDelete = ['majorItems', 'detailItems', 'distributionTable', 'floorSettings', 'spaceSettings', 'progressItems', 'inspectionPhotos'];
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

async function loadProjects() {
    if (!auth.currentUser) return [];
    const whereCondition = {
        field: 'memberEmails',
        operator: 'array-contains',
        value: auth.currentUser.email
    };
    const result = await safeFirestoreQuery('projects', [whereCondition], { field: 'createdAt', direction: 'desc' });
    return result.docs;
}

async function loadTenders() {
    if (!auth.currentUser) return [];
    const authorizedProjects = await loadProjects();
    if (authorizedProjects.length === 0) return [];

    const projectIds = authorizedProjects.map(p => p.id);
    // 使用 'in' 查詢，一次最多查詢 10 個 projectId 的標單
    const tenderPromises = [];
    for (let i = 0; i < projectIds.length; i += 10) {
        const chunk = projectIds.slice(i, i + 10);
        tenderPromises.push(db.collection('tenders').where('projectId', 'in', chunk).get());
    }

    const tenderSnapshots = await Promise.all(tenderPromises);
    let allTenders = [];
    tenderSnapshots.forEach(snapshot => {
        snapshot.forEach(doc => {
            allTenders.push({ id: doc.id, ...doc.data() });
        });
    });
    
    allTenders.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
    return allTenders;
}

// --- 通用工具函數 ---
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
    // 這裡可以替換成更美觀的提示框方案
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(`[${type.toUpperCase()}] ${message}`);
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
