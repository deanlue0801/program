



        // 顯示 Firebase 狀態
        function showFirebaseStatus(connected, message) {
            const indicator = document.getElementById('firebaseStatus');
            const text = document.getElementById('firebaseStatusText');
            
            if (indicator) {
                indicator.className = `status-indicator ${connected ? 'connected' : ''}`;
            }
            if (text) {
                text.textContent = message;
            }
        }

        // 切換標籤
        function switchTab(tab) {
            const loginTab = document.getElementById('loginTab');
            const registerTab = document.getElementById('registerTab');
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');

            // 移除所有 active 類別
            loginTab.classList.remove('active');
            registerTab.classList.remove('active');
            loginForm.classList.remove('active');
            registerForm.classList.remove('active');

            // 添加 active 到選中的標籤
            if (tab === 'login') {
                loginTab.classList.add('active');
                loginForm.classList.add('active');
            } else {
                registerTab.classList.add('active');
                registerForm.classList.add('active');
            }

            // 清除提示訊息
            hideAlert();
        }

        // 處理登入
        async function handleLogin(event) {
            event.preventDefault();
            
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                showAlert('請填寫完整資訊', 'error');
                return;
            }

            showLoading();
            hideAlert();

            try {
                await auth.signInWithEmailAndPassword(email, password);
                // 成功後會自動觸發 onAuthStateChanged
            } catch (error) {
                console.error('❌ 登入失敗:', error);
                hideLoading();
                
                let message = '登入失敗';
                switch (error.code) {
                    case 'auth/user-not-found':
                        message = '找不到此用戶，請先註冊或檢查電子郵件';
                        break;
                    case 'auth/wrong-password':
                        message = '密碼錯誤，請重新輸入';
                        break;
                    case 'auth/invalid-email':
                        message = '電子郵件格式不正確';
                        break;
                    case 'auth/too-many-requests':
                        message = '嘗試次數過多，請稍後再試';
                        break;
                    default:
                        message = error.message;
                }
                
                showAlert(message, 'error');
            }
        }

        // 處理註冊
        async function handleRegister(event) {
            event.preventDefault();
            
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!email || !password || !confirmPassword) {
                showAlert('請填寫完整資訊', 'error');
                return;
            }

            if (password !== confirmPassword) {
                showAlert('兩次密碼輸入不一致', 'error');
                return;
            }

            if (password.length < 6) {
                showAlert('密碼至少需要6位數', 'error');
                return;
            }

            showLoading();
            hideAlert();

            try {
                await auth.createUserWithEmailAndPassword(email, password);
                // 成功後會自動觸發 onAuthStateChanged
            } catch (error) {
                console.error('❌ 註冊失敗:', error);
                hideLoading();
                
                let message = '註冊失敗';
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        message = '此電子郵件已被使用，請使用其他郵件或嘗試登入';
                        break;
                    case 'auth/invalid-email':
                        message = '電子郵件格式不正確';
                        break;
                    case 'auth/weak-password':
                        message = '密碼強度不足，請使用更複雜的密碼';
                        break;
                    default:
                        message = error.message;
                }
                
                showAlert(message, 'error');
            }
        }

        // 快速測試登入
        async function quickLogin() {
            showLoading();
            hideAlert();

            try {
                // 先嘗試登入測試帳號
                try {
                    await auth.signInWithEmailAndPassword('test@example.com', 'test123456');
                    showAlert('測試帳號登入成功！', 'success');
                } catch (loginError) {
                    if (loginError.code === 'auth/user-not-found') {
                        // 如果測試帳號不存在，就建立一個
                        showAlert('建立測試帳號中...', 'info');
                        await auth.createUserWithEmailAndPassword('test@example.com', 'test123456');
                        showAlert('測試帳號建立並登入成功！', 'success');
                    } else {
                        throw loginError;
                    }
                }
            } catch (error) {
                console.error('❌ 快速登入失敗:', error);
                hideLoading();
                showAlert('快速登入失敗: ' + error.message, 'error');
            }
        }

        // 顯示載入狀態
        function showLoading() {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('tabs').style.display = 'none';
            
            // 禁用所有按鈕
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => btn.disabled = true);
        }

        // 隱藏載入狀態
        function hideLoading() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('tabs').style.display = 'flex';
            
            // 啟用所有按鈕
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => btn.disabled = false);
        }

        // 顯示提示訊息
        function showAlert(message, type = 'info') {
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = `alert ${type}`;
            alert.style.display = 'block';
            
            // 自動隱藏成功訊息
            if (type === 'success') {
                setTimeout(() => {
                    hideAlert();
                }, 3000);
            }
        }

        // 顯示目前登入用戶資訊
        function showCurrentUserInfo(user) {
            document.getElementById('currentUserInfo').style.display = 'block';
            document.getElementById('currentUserEmail').textContent = user.email;
            document.getElementById('tabs').style.display = 'none';
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'none';
            document.querySelector('.quick-login').style.display = 'none';
        }

        // 隱藏目前登入用戶資訊
        function hideCurrentUserInfo() {
            document.getElementById('currentUserInfo').style.display = 'none';
            document.getElementById('tabs').style.display = 'flex';
            document.getElementById('loginForm').style.display = 'block';
            document.querySelector('.quick-login').style.display = 'block';
        }

        // 繼續使用目前帳號
        function continueWithCurrentUser() {
            showAlert('跳轉到主控台...', 'success');
            window.location.href = 'dashboard.html';
        }

        // 登出並顯示登入表單
        async function logoutAndShowLogin() {
            try {
                showAlert('正在登出...', 'info');
                await auth.signOut();
                hideCurrentUserInfo();
                showAlert('已登出，請重新登入', 'success');
            } catch (error) {
                console.error('❌ 登出失敗:', error);
                showAlert('登出失敗: ' + error.message, 'error');
            }
        }
        function hideAlert() {
            const alert = document.getElementById('alert');
            alert.style.display = 'none';
        }

		// 【將這整段貼上】

		/**
		 * 當 Firebase 偵測到用戶「已經是登入狀態」時會執行此函數。
		 * 在登入頁面，這表示用戶可能剛刷新頁面或從別頁連過來，
		 * 我們應該顯示「歡迎回來」的畫面。
		 */
		function onLoginSuccess(user) {
			console.log(`登入頁：偵測到已登入用戶 ${user.email}`);
			// 呼叫您原有的函數，顯示用戶資訊和「繼續」或「切換帳號」的按鈕
			showCurrentUserInfo(user); 
		}

		/**
		 * 當 Firebase 偵測到用戶是「未登入狀態」時會執行此函數。
		 * 在登入頁面，這是最常見的正常情況，
		 * 我們確保載入動畫被隱藏，讓用戶可以看到登入/註冊表單。
		 */
		function onLoginFail() {
			console.log('登入頁：用戶未登入，顯示登入/註冊表單。');
			hideLoading(); // 調用您原有的函數
		}

		// 當頁面載入完成後，啟動所有邏輯
		document.addEventListener('DOMContentLoaded', () => {
			// 呼叫來自`firebase-config.js`的核心初始化函數，
			// 並告訴它在成功或失敗時，分別要執行上面哪兩個為本頁面客製化的函數。
			initFirebase(onLoginSuccess, onLoginFail);
		});