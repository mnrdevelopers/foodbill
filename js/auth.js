// auth.js - Authentication with Role-Based Redirection
document.addEventListener('DOMContentLoaded', function() {
    function isLoginPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop();
        return page === 'index.html' || page === '' || path.endsWith('/');
    }

    function redirectToTarget(target) {
        if (isLoginPage() && window.MNRAppShell && typeof window.MNRAppShell.openApp === 'function') {
            window.MNRAppShell.openApp(target);
            return;
        }

        window.location.href = target;
    }

    function resolvePreferredTarget(fallbackTarget, userData, options = {}) {
        const requestedTarget = window.MNRAppShell &&
            typeof window.MNRAppShell.getRequestedPage === 'function'
            ? window.MNRAppShell.getRequestedPage()
            : '';

        if (!requestedTarget || requestedTarget === fallbackTarget) {
            return fallbackTarget;
        }

        const requestedPage = requestedTarget.split('?')[0];

        if (userData.role === 'owner') {
            return options.restaurantConfigured ? requestedTarget : fallbackTarget;
        }

        if (userData.role === 'staff') {
            const permissions = userData.permissions || [];
            const staffPagePermissions = {
                'billing.html': 'billing',
                'orders.html': 'orders',
                'products.html': 'products',
                'settings.html': 'settings',
                'staff.html': 'staff-admin'
            };

            const requiredPermission = staffPagePermissions[requestedPage];

            if (!requiredPermission || permissions.includes(requiredPermission)) {
                return requestedTarget;
            }
        }

        return fallbackTarget;
    }

    // Check if user is already logged in
    auth.onAuthStateChanged(async user => {
        if (!user) {
            if (isLoginPage() && window.MNRAppShell && typeof window.MNRAppShell.showLogin === 'function') {
                window.MNRAppShell.showLogin();
            }
            return;
        }

        if (isLoginPage()) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    
                    // ROLE-BASED REDIRECTION LOGIC
                    if (userData.role === 'staff') {
                        // Staff: NEVER redirect to settings, go directly to permitted area
                        const permissions = userData.permissions || [];
                        let redirectUrl = 'dashboard.html';

                        if (permissions.includes('billing')) {
                            redirectUrl = 'billing.html';
                        } else if (permissions.includes('orders')) {
                            redirectUrl = 'orders.html';
                        }

                        redirectToTarget(resolvePreferredTarget(redirectUrl, userData));
                    } else if (userData.role === 'owner') {
                        // Owner: Check if restaurant is configured
                        const restaurantDoc = await db.collection('restaurants')
                            .doc(userData.restaurantId || user.uid).get();
                        const restaurantConfigured = restaurantDoc.exists && !!restaurantDoc.data().name;
                        const redirectUrl = restaurantConfigured ? 'dashboard.html' : 'settings.html?setup=true';
                        
                        redirectToTarget(resolvePreferredTarget(redirectUrl, userData, { restaurantConfigured }));
                    } else {
                        redirectToTarget('dashboard.html');
                    }
                } else {
                    // Fallback for missing user profile
                    redirectToTarget('dashboard.html');
                }
            } catch (error) {
                console.error("Auto-redirect error:", error);
                redirectToTarget('dashboard.html');
            }
        }
    });

    // Toggle password visibility
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            const password = document.getElementById('password');
            const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
            password.setAttribute('type', type);
            this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        });
    }

    // Toggle forms
    const registerBtn = document.getElementById('registerBtn');
    const backToLogin = document.getElementById('backToLogin');
    
    if (registerBtn) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            document.getElementById('loginTypeTitle').textContent = 'Register as Owner';
        });
    }

    if (backToLogin) {
        backToLogin.addEventListener('click', () => {
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('loginTypeTitle').textContent = 'Owner Login';
        });
    }

    // Login logic with role-based redirection
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Signing in...';
            showMessage('Signing in...', 'info');

            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                const user = userCredential.user;

                // Fetch user role and restaurant info immediately after login
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (!userDoc.exists) {
                    throw new Error("User profile not found. Please contact support.");
                }

                const userData = userDoc.data();
                
                // ROLE-BASED REDIRECTION LOGIC
                let redirectUrl = 'dashboard.html';
                
                if (userData.role === 'staff') {
                    // Staff logic: Never check for restaurant configuration, go to permissioned area
                    const permissions = userData.permissions || [];
                    if (permissions.includes('billing')) {
                        redirectUrl = 'billing.html';
                    } else if (permissions.includes('orders')) {
                        redirectUrl = 'orders.html';
                    }

                    redirectUrl = resolvePreferredTarget(redirectUrl, userData);
                } else if (userData.role === 'owner') {
                    // Owner logic: Only force setup if business details are missing
                    const restaurantDoc = await db.collection('restaurants').doc(userData.restaurantId || user.uid).get();
                    const restaurantConfigured = restaurantDoc.exists && !!restaurantDoc.data().name;
                    
                    if (!restaurantConfigured) {
                        redirectUrl = 'settings.html?setup=true';
                    } else {
                        redirectUrl = resolvePreferredTarget(redirectUrl, userData, { restaurantConfigured: true });
                    }
                } else {
                    redirectUrl = resolvePreferredTarget(redirectUrl, userData);
                }

                showMessage('Login successful! Redirecting...', 'success');
                setTimeout(() => redirectToTarget(redirectUrl), 1000);
                
            } catch (error) {
                console.error("Login error:", error);
                showMessage(error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Sign In';
            }
        });
    }

    // Registration logic (for owners only)
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const resName = document.getElementById('restaurantName').value.trim();
            const ownerName = document.getElementById('regOwnerName').value.trim();
            const ownerPhone = document.getElementById('regOwnerPhone').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            
            showMessage('Creating account...', 'info');
            const joinCode = generateJoinCode();
            
            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    
                    return Promise.all([
                        db.collection('restaurants').doc(user.uid).set({
                            name: resName,
                            ownerName: ownerName,
                            phone: ownerPhone,
                            email: email,
                            ownerId: user.uid,
                            joinCode: joinCode,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            settings: {
                                gstRate: 18,
                                serviceCharge: 5,
                                currency: '₹'
                            }
                        }),
                        db.collection('users').doc(user.uid).set({
                            email: email,
                            name: ownerName,
                            phone: ownerPhone,
                            role: 'owner',
                            restaurantId: user.uid,
                            joinCode: joinCode,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        })
                    ]);
                })
                .then(() => {
                    showMessage(`Account created! Your staff join code: ${joinCode}`, 'success');
                    setTimeout(() => redirectToTarget('settings.html?setup=true'), 2500);
                })
                .catch(error => {
                    showMessage(error.message, 'error');
                    const submitBtn = registerForm.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Register';
                    }
                });
        });
    }

    // Forgot Password Logic
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const closeForgotModal = document.getElementById('closeForgotModal');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (forgotPasswordModal) forgotPasswordModal.classList.remove('hidden');
        });
    }

    if (closeForgotModal) {
        closeForgotModal.addEventListener('click', () => {
            if (forgotPasswordModal) forgotPasswordModal.classList.add('hidden');
        });
    }
    
    // Close on outside click
    if (forgotPasswordModal) {
        forgotPasswordModal.addEventListener('click', (e) => {
            if (e.target === forgotPasswordModal) {
                forgotPasswordModal.classList.add('hidden');
            }
        });
    }

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;
            const btn = forgotPasswordForm.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
            
            try {
                await auth.sendPasswordResetEmail(email);
                showMessage('Password reset email sent! Check your inbox.', 'success');
                forgotPasswordModal.classList.add('hidden');
                forgotPasswordForm.reset();
            } catch (error) {
                console.error("Reset password error:", error);
                showMessage(error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        });
    }

    function generateJoinCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    function showMessage(text, type) {
        const messageDiv = document.getElementById('message');
        if (!messageDiv) return;
        messageDiv.textContent = text;
        messageDiv.className = `mt-4 p-3 rounded-lg text-sm font-medium ${
            type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 
            type === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 
            'bg-blue-100 text-blue-700 border border-blue-200'
        }`;
        messageDiv.classList.remove('hidden');
        setTimeout(() => messageDiv.classList.add('hidden'), 5000);
    }
});

// Offline Detection
window.addEventListener('online', () => {
  const indicator = document.getElementById('offlineIndicator');
  if (indicator) indicator.classList.add('hidden');
  showNotification('Back online', 'success');
});

window.addEventListener('offline', () => {
  const indicator = document.getElementById('offlineIndicator');
  if (indicator) indicator.classList.remove('hidden');
  showNotification('You are offline', 'warning');
});

// Check initial status
if (!navigator.onLine) {
  const indicator = document.getElementById('offlineIndicator');
  if (indicator) indicator.classList.remove('hidden');
}

function showNotification(message, type) {
  const n = document.createElement('div');
  n.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 text-white ${type === 'success' ? 'bg-green-500' : 'bg-yellow-500'}`;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3000);
}
