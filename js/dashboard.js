// Module-level restaurantId — populated after auth, used by all query functions
let dashboardRestaurantId = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loading...');
    
    // Check auth with timeout
    let authTimeout = setTimeout(() => {
        console.warn('Auth check timeout, showing login');
        window.location.href = 'index.html';
    }, 15000);
    
    auth.onAuthStateChanged(user => {
        clearTimeout(authTimeout);
        
        if (!user) {
            console.log('No user, redirecting to login');
            window.location.href = 'index.html';
        } else {
            console.log('User authenticated:', user.email);
            loadDashboardData(user);
            initPWA();
            checkOnlineStatus();
            checkForUpdates();
        }
    });
});

// PWA Logic: Install Prompt handling only
// NOTE: Service Worker registration is handled by the inline script in the HTML page.
// Do NOT register SW here — duplicate registrations cause iOS PWA crashes.
function initPWA() {
    // Handle Install Prompt (Android/Chrome only)
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        setTimeout(() => {
            const installBtn = document.getElementById('pwaInstallBtn');
            if (installBtn) {
                installBtn.classList.remove('hidden');
                installBtn.addEventListener('click', () => {
                    if (deferredPrompt) {
                        deferredPrompt.prompt();
                        deferredPrompt.userChoice.then((choiceResult) => {
                            if (choiceResult.outcome === 'accepted') {
                                showNotification('App installed successfully!', 'success');
                            }
                            deferredPrompt = null;
                            installBtn.classList.add('hidden');
                        });
                    }
                });
            }
        }, 3000);
    });

    window.addEventListener('appinstalled', () => {
        showNotification('App installed successfully!', 'success');
    });
}

// Smoothly hide the loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 0.4s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
}

// Load dashboard data with error handling
async function loadDashboardData(user) {
    try {
        const greetingEl = document.getElementById('welcomeGreeting');
        if (greetingEl) greetingEl.textContent = 'Loading...';

        // Fetch user doc first to get restaurantId and the user's own display name
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        dashboardRestaurantId = userData.restaurantId || user.uid;
        const displayName = userData.name || null;
        
        // Load all data in parallel
        const loadPromises = [
            loadRestaurantAndUserInfo(dashboardRestaurantId, displayName),
            loadDashboardStats(dashboardRestaurantId, {}),
            loadRecentOrders(dashboardRestaurantId),
            loadMostOrderedProducts(dashboardRestaurantId, {})
        ];
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Data loading timeout')), 20000);
        });
        
        await Promise.race([Promise.all(loadPromises), timeoutPromise]);

        addDashboardFilters();
        console.log('Dashboard data loaded successfully');
        setTimeout(refreshResponsiveTables, 200);

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Dashboard loaded with limited data', 'warning');
        const greetingEl = document.getElementById('welcomeGreeting');
        if (greetingEl) greetingEl.textContent = 'Welcome!';
        refreshResponsiveTables();
    } finally {
        // Always hide the overlay after load attempt (success or failure)
        hideLoadingOverlay();
    }
}

// Update greeting based on time and name
function updateGreeting(name = null) {
    const greetingEl = document.getElementById('welcomeGreeting');
    const dateTimeEl = document.getElementById('currentDateTime');
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let greeting = "";
    
    if (hour < 12) greeting = "Good Morning";
    else if (hour < 17) greeting = "Good Afternoon";
    else greeting = "Good Evening";

    const displayName = name || "Admin";
    greetingEl.textContent = `${greeting}, ${displayName}!`;

    // Update date time
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (dateTimeEl) dateTimeEl.textContent = new Date().toLocaleDateString('en-IN', options);
}

// Load restaurant and user info
// restaurantId — the restaurant doc id (may differ from user.uid for staff)
// displayName  — the logged-in user's own name fetched from the users collection
function loadRestaurantAndUserInfo(restaurantId, displayName) {
    return new Promise((resolve, reject) => {
        if (!restaurantId) { resolve(); return; }
        
        db.collection('restaurants').doc(restaurantId).get()
            .then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    const nameEl = document.getElementById('dashboardRestaurantName');
                    if (nameEl) nameEl.textContent = data.name;
                    // Show the *logged-in user's* own name, not always the owner's
                    updateGreeting(displayName || data.ownerName);
                } else {
                    updateGreeting(displayName);
                }
                resolve();
            })
            .catch(reject);
    });
}

// Load dashboard stats
// restaurantId — use the correct restaurant doc id (not always user.uid)
function loadDashboardStats(restaurantId, filters = {}) {
    return new Promise((resolve, reject) => {
        if (!restaurantId) { reject(new Error('No restaurantId')); return; }

        let query = db.collection('orders').where('restaurantId', '==', restaurantId);

        if (filters.startDate && filters.endDate) {
            const start = new Date(filters.startDate);
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query = query.where('createdAt', '>=', start).where('createdAt', '<=', end);
        }

        if (filters.status && filters.status !== 'all') {
            query = query.where('status', '==', filters.status);
        }

        // Revenue and orders
        query.get()
            .then(snapshot => {
                let totalRevenue = 0;
                let totalOrders = 0;
                snapshot.forEach(doc => {
                    const order = doc.data();
                    if (order.status === 'completed') {
                        totalRevenue += order.total || 0;
                        totalOrders++;
                    }
                });
                const revEl = document.getElementById('totalRevenue');
                const ordEl = document.getElementById('totalOrders');
                if (revEl) revEl.textContent = `₹${totalRevenue.toFixed(2)}`;
                if (ordEl) ordEl.textContent = totalOrders;
            })
            .catch(err => console.warn('Could not load revenue stats:', err));

        // Total products (unfiltered)
        const productsPromise = db.collection('products')
            .where('restaurantId', '==', restaurantId)
            .get()
            .then(snapshot => {
                const prodEl = document.getElementById('totalProducts');
                if (prodEl) prodEl.textContent = snapshot.size;
            })
            .catch(err => console.warn('Could not load product count:', err));

        Promise.all([productsPromise]).then(resolve).catch(reject);
    });
}

// Add filters to dashboard.html (add this after welcome section)
function addDashboardFilters() {
    const welcomeSection = document.querySelector('.bg-white.rounded-xl.shadow.p-6.mb-6');
    if (!welcomeSection) return;

    // Check if filters already exist to prevent duplicates
    if (document.getElementById('dashboardFiltersCard')) return;

    const filtersHTML = `
        <div id="dashboardFiltersCard" class="bg-white rounded-xl shadow p-4 mb-6">
            <div class="flex flex-wrap gap-4 items-end">
                <div>
                    <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date Range</label>
                    <div class="flex items-center bg-gray-50 rounded-lg border border-gray-200 p-1">
                        <input type="date" id="dashboardStartDate" class="bg-transparent border-none text-sm focus:ring-0 px-2 py-1 outline-none">
                        <span class="text-gray-400 mx-1">-</span>
                        <input type="date" id="dashboardEndDate" class="bg-transparent border-none text-sm focus:ring-0 px-2 py-1 outline-none">
                    </div>
                </div>
                
                <div>
                    <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                    <select id="dashboardStatusFilter" class="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-red-500 focus:border-red-500 block w-full p-2 outline-none">
                        <option value="all">All Orders</option>
                        <option value="completed">Completed Only</option>
                    </select>
                </div>
                
                <div class="flex gap-2">
                    <button id="applyDashboardFilter" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm font-medium transition-colors shadow-sm">
                        <i class="fas fa-filter mr-1"></i> Apply
                    </button>
                    
                    <button id="resetDashboardFilter" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
                        Reset
                    </button>
                </div>
            </div>
        </div>
    `;

    welcomeSection.insertAdjacentHTML('afterend', filtersHTML);

    // Add event listeners
    document.getElementById('applyDashboardFilter')?.addEventListener('click', () => {
        const filters = {
            startDate: document.getElementById('dashboardStartDate').value,
            endDate: document.getElementById('dashboardEndDate').value,
            status: document.getElementById('dashboardStatusFilter').value
        };
        const resId = dashboardRestaurantId || auth.currentUser?.uid;
        if (!resId) return;
        loadDashboardStats(resId, filters);
        loadRecentOrders(resId);
        loadMostOrderedProducts(resId, filters);
    });

    document.getElementById('resetDashboardFilter')?.addEventListener('click', () => {
        document.getElementById('dashboardStartDate').value = '';
        document.getElementById('dashboardEndDate').value = '';
        document.getElementById('dashboardStatusFilter').value = 'all';
        const resId = dashboardRestaurantId || auth.currentUser?.uid;
        if (!resId) return;
        loadDashboardStats(resId, {});
        loadRecentOrders(resId);
        loadMostOrderedProducts(resId, {});
    });
}

// Load recent orders
function loadRecentOrders(restaurantId) {
    return new Promise((resolve, reject) => {
        if (!restaurantId) { reject(new Error('No restaurantId')); return; }
        
        const tbody = document.getElementById('recentOrders');
        if (!tbody) { resolve(); return; }
        
        db.collection('orders')
            .where('restaurantId', '==', restaurantId)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get()
            .then(snapshot => {
                tbody.innerHTML = '';
                
                if (snapshot.empty) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-4 text-center text-gray-500">
                                No orders yet
                            </td>
                        </tr>
                    `;
                    // Call refresh for responsive tables
                    refreshResponsiveTables();
                    resolve();
                    return;
                }
                
                snapshot.forEach(doc => {
                    const order = doc.data();
                    const orderDate = order.createdAt?.toDate() || new Date();
                    const itemCount = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
                    
                    const row = document.createElement('tr');
                    row.className = 'border-b hover:bg-gray-50';
                    row.innerHTML = `
                        <td class="py-3 px-4">
                            <div class="font-mono text-sm">${order.orderId || doc.id.substring(0, 8)}</div>
                        </td>
                        <td class="py-3 px-4 text-sm text-gray-600">
                            ${orderDate.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'})}
                        </td>
                        <td class="py-3 px-4 text-sm">${itemCount} items</td>
                        <td class="py-3 px-4 font-bold text-gray-800">₹${order.total ? order.total.toFixed(2) : '0.00'}</td>
                        <td class="py-3 px-4">
                            <span class="px-2 py-1 text-xs font-medium rounded-full ${
                                order.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 
                                'bg-yellow-100 text-yellow-700'
                            }">
                                ${order.status}
                            </span>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
                
                // Call refresh for responsive tables after loading
                refreshResponsiveTables();
                resolve();
            })
            .catch(err => {
                console.error('Error loading recent orders:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-4 text-center text-gray-500">
                            Error loading orders
                        </td>
                    </tr>
                `;
                // Still call refresh even on error
                refreshResponsiveTables();
                reject(err);
            });
    });
}

// Add this helper function to dashboard.js
function refreshResponsiveTables() {
    if (window.ResponsiveTables && window.ResponsiveTables.refresh) {
        setTimeout(() => {
            window.ResponsiveTables.refresh();
        }, 100);
    }
}

// Fallback function if PWA fails
function disablePWAFeatures() {
    console.log('PWA features disabled, using standard web app');
    // Remove any PWA-specific UI elements
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) installBtn.remove();
}

// Add offline detection
function checkOnlineStatus() {
    if (!navigator.onLine) {
        showNotification('You are offline. Some features may be limited.', 'warning');
        document.body.classList.add('offline');
    }
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        showNotification('You are back online!', 'success');
        document.body.classList.remove('offline');
    });
    
    window.addEventListener('offline', () => {
        showNotification('You are offline. Some features may be limited.', 'warning');
        document.body.classList.add('offline');
    });
}

// Add service worker update check
function checkForUpdates() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
        
        // Listen for update messages
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'UPDATE_AVAILABLE') {
                showUpdateNotification();
            }
        });
    }
}

// Show update notification
function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse';
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <i class="fas fa-sync-alt animate-spin"></i>
                <div>
                    <p class="font-bold">Update Available</p>
                    <p class="text-sm">New version ready. Refresh to update.</p>
                </div>
            </div>
            <button onclick="window.location.reload()" class="ml-4 bg-white text-blue-500 px-4 py-1 rounded font-bold hover:bg-gray-100">
                Refresh
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 10000);
}

// Helper function for notifications (you need to implement this based on your UI)
function showNotification(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    // Add your notification UI implementation here
    // Example: toast notification, alert, etc.
}

// Add a force refresh button for testing
function addDebugButtons() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const debugDiv = document.createElement('div');
        debugDiv.className = 'fixed bottom-4 left-4 z-50';
        debugDiv.innerHTML = `
            <button onclick="clearCacheAndReload()" class="bg-red-500 text-white px-4 py-2 rounded text-sm">
                Clear Cache
            </button>
            <button onclick="unregisterSW()" class="bg-yellow-500 text-white px-4 py-2 rounded text-sm ml-2">
                Unregister SW
            </button>
        `;
        document.body.appendChild(debugDiv);
    }
}

// Debug functions
function clearCacheAndReload() {
    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
            });
        }).then(() => {
            window.location.reload();
        });
    }
}

function unregisterSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                registration.unregister();
            });
        }).then(() => {
            window.location.reload();
        });
    }
}

// Initialize debug in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.addEventListener('DOMContentLoaded', addDebugButtons);
}

// Function to load most ordered products
function loadMostOrderedProducts(restaurantId, filters = {}) {
    return new Promise((resolve, reject) => {
        if (!restaurantId) { reject(new Error('No restaurantId')); return; }

        // First, get all completed orders
        let query = db.collection('orders')
            .where('restaurantId', '==', restaurantId)
            .where('status', '==', 'completed');

        // Apply date filters if provided
        if (filters.startDate && filters.endDate) {
            const start = new Date(filters.startDate);
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            
            query = query.where('createdAt', '>=', start)
                        .where('createdAt', '<=', end);
        }

        query.get()
            .then(snapshot => {
                const productStats = {};
                
                // Process all orders
                snapshot.forEach(doc => {
                    const order = doc.data();
                    if (order.items && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            const productId = item.id || item.name;
                            if (!productStats[productId]) {
                                productStats[productId] = {
                                    name: item.name,
                                    category: item.category || 'Uncategorized',
                                    totalQuantity: 0,
                                    totalRevenue: 0,
                                    orderCount: 0
                                };
                            }
                            
                            productStats[productId].totalQuantity += item.quantity || 0;
                            productStats[productId].totalRevenue += (item.price || 0) * (item.quantity || 0);
                            productStats[productId].orderCount += 1;
                        });
                    }
                });

                // Convert to array and sort by quantity
                const sortedProducts = Object.values(productStats)
                    .sort((a, b) => b.totalQuantity - a.totalQuantity)
                    .slice(0, 10); // Top 10

                // Render in table
                const tbody = document.getElementById('mostOrderedProducts');
                if (tbody) {
                    tbody.innerHTML = '';
                    
                    if (sortedProducts.length === 0) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="5" class="py-4 text-center text-gray-500">
                                    No product data available
                                </td>
                            </tr>
                        `;
                    } else {
                        sortedProducts.forEach((product, index) => {
                            const row = document.createElement('tr');
                            row.className = 'border-b hover:bg-gray-50';
                            row.innerHTML = `
                                <td class="py-3 px-4">
                                    <div class="w-6 h-6 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-sm font-bold">
                                        ${index + 1}
                                    </div>
                                </td>
                                <td class="py-3 px-4 font-medium">${product.name}</td>
                                <td class="py-3 px-4 text-gray-600">
                                    <span class="px-2 py-1 bg-gray-100 rounded text-xs">${product.category}</span>
                                </td>
                                <td class="py-3 px-4 font-bold">${product.totalQuantity}</td>
                                <td class="py-3 px-4 font-bold text-green-600">₹${product.totalRevenue.toFixed(2)}</td>
                            `;
                            tbody.appendChild(row);
                        });
                    }
                    
                    // Refresh responsive tables
                    refreshResponsiveTables();
                }
                
                resolve(sortedProducts);
            })
            .catch(err => {
                console.error('Error loading product analytics:', err);
                const tbody = document.getElementById('mostOrderedProducts');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-4 text-center text-gray-500">
                                Error loading product analytics
                            </td>
                        </tr>
                    `;
                }
                reject(err);
            });
    });
}
