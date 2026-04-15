// js/layout.js - Enhanced with RBAC
document.addEventListener('DOMContentLoaded', function() {
    let sidebarOpen = true;
    let currentUserData = null;
    
    auth.onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        
        // Load User Profile and check role/permissions
        db.collection('users').doc(user.uid).get()
            .then(doc => {
                if (doc.exists) {
                    currentUserData = doc.data();
                    
                    // RBAC: Check access for current page
                    checkPageAccess(currentUserData);
                    
                    // RBAC: Adjust sidebar visibility
                    adjustSidebarModules(currentUserData);
                    
                    // Load Restaurant Info
                    return db.collection('restaurants').doc(currentUserData.restaurantId).get();
                }
            })
            .then(doc => {
                if (doc && doc.exists) {
                    const data = doc.data();
                    const restaurantName = document.getElementById('restaurantName');
                    if (restaurantName) restaurantName.textContent = data.name;
                    
                    const mobileRestaurantName = document.querySelector('#mobileSidebar .text-xl');
                    if (mobileRestaurantName) mobileRestaurantName.textContent = data.name;
                }
            });
        
        const userEmail = document.getElementById('userEmail');
        if (userEmail) userEmail.textContent = user.email;
        
        loadQuickStats(user.uid);
    });
    
    loadHeader();
    loadSidebar();
    loadFooter();
    setupMobileSidebar();
    setupDesktopSidebarToggle();
    setupLogout();
    setupOfflineIndicator();
});

// ── Offline / Online indicator ────────────────────────────────────────────
function setupOfflineIndicator() {
    // Create the banner element once
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = `
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(80px);
        background: #1f2937; color: #fff; padding: 10px 20px; border-radius: 999px;
        font-size: 13px; font-weight: 600; z-index: 99999; display: flex;
        align-items: center; gap: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
        white-space: nowrap;
    `;
    banner.innerHTML = '<i class="fas fa-wifi-slash" style="color:#f87171"></i> You\'re offline — data from cache';
    document.body.appendChild(banner);

    function showOffline() {
        banner.innerHTML = '<i class="fas fa-wifi" style="color:#f87171"></i> You\'re offline — data from cache';
        banner.style.background = '#1f2937';
        banner.style.transform = 'translateX(-50%) translateY(0)';
    }

    function showBackOnline() {
        banner.innerHTML = '<i class="fas fa-wifi" style="color:#4ade80"></i> Back online — syncing data';
        banner.style.background = '#166534';
        banner.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            banner.style.transform = 'translateX(-50%) translateY(80px)';
        }, 2500);
    }

    if (!navigator.onLine) showOffline();

    window.addEventListener('offline', showOffline);
    window.addEventListener('online', showBackOnline);
}


function checkPageAccess(userData) {
    const page = window.location.pathname.split('/').pop();
    if (!page || page === 'index.html') return;

    const role = userData.role;
    const permissions = userData.permissions || [];

    // 1. STAFF LOGIC - Never force to settings
    if (role === 'staff') {
        // Staff should NEVER be forced to settings or allowed there without permission
        if (page === 'settings.html' && !permissions.includes('settings')) {
            redirectToPermittedArea(permissions);
            return;
        }
        
        // Check other page permissions
        const pagePermissionMap = {
            'billing.html': 'billing',
            'products.html': 'products',
            'orders.html': 'orders',
            'staff.html': 'staff-admin' 
        };

        const requiredPermission = pagePermissionMap[page];
        
        if (requiredPermission && !permissions.includes(requiredPermission)) {
            redirectToPermittedArea(permissions);
        }
        return; // Staff logic ends here
    }

    // 2. OWNER LOGIC - Only check setup on non-settings pages
    if (role === 'owner') {
        if (page !== 'settings.html') {
            db.collection('restaurants').doc(userData.restaurantId || auth.currentUser.uid).get().then(doc => {
                if (!doc.exists || !doc.data().name) {
                    window.location.href = 'settings.html?setup=required';
                }
            });
        }
        return; // Owner has access to everything
    }
}

function redirectToPermittedArea(permissions) {
    if (permissions.includes('billing')) {
        window.location.href = 'billing.html';
    } else if (permissions.includes('orders')) {
        window.location.href = 'orders.html';
    } else if (permissions.includes('products')) {
        window.location.href = 'products.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

function adjustSidebarModules(userData) {
    // Wait for sidebar to be injected
    const observer = new MutationObserver(() => {
        const sidebarNav = document.getElementById('sidebarNav');
        const mobileNav = document.querySelector('#mobileSidebar nav');
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        
        if (sidebarNav || mobileNav || bottomNav) {
            const role = userData.role;
            const permissions = userData.permissions || [];
            
            // List of restricted links and their permission requirement
            const restrictedLinks = [
                { href: 'billing.html', key: 'billing' },
                { href: 'products.html', key: 'products' },
                { href: 'orders.html', key: 'orders' },
                { href: 'settings.html', key: 'settings' },
                { href: 'staff.html', key: 'staff-admin' }
            ];

            const handleNav = (nav) => {
                if (!nav) return;
                const links = nav.querySelectorAll('a');
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    const config = restrictedLinks.find(l => l.href === href);
                    
                    if (config) {
                        // Only hide if it's staff AND they lack the specific permission
                        if (role === 'staff' && !permissions.includes(config.key)) {
                            link.style.display = 'none';
                        }
                        // Hide staff management from staff entirely
                        if (role === 'staff' && config.key === 'staff-admin') {
                            link.style.display = 'none';
                        }
                    }
                });
            };

            handleNav(sidebarNav);
            handleNav(mobileNav);
            if (bottomNav) handleNav(bottomNav);
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function loadHeader() {
    fetch('components/header.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('header').innerHTML = html;
            attachHeaderEvents();
        })
        .catch(err => {
            console.error('Error loading header:', err);
            document.getElementById('header').innerHTML = '<p>Error loading header</p>';
        });
}

function loadSidebar() {
    fetch('components/sidebar.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('sidebar').innerHTML = html;
            updateActiveLink();
            loadQuickStatsForSidebar();
            
            // Restore sidebar state from localStorage
            const savedState = localStorage.getItem('sidebarOpen');
            if (savedState !== null) {
                sidebarOpen = savedState === 'true';
                if (!sidebarOpen) {
                    collapseSidebar();
                }
            } else {
                // Default state: Ensure expanded classes are present
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.add('lg:col-span-1', 'lg:block');
            }
        })
        .catch(err => {
            console.error('Error loading sidebar:', err);
            document.getElementById('sidebar').innerHTML = '<p>Error loading sidebar</p>';
        });
}

function loadFooter() {
    fetch('components/footer.html')
        .then(response => {
            if (!response.ok) throw new Error('Footer not found');
            return response.text();
        })
        .then(html => {
            // Create footer container if it doesn't exist
            let footer = document.getElementById('appFooter');
            if (!footer) {
                footer = document.createElement('div');
                footer.id = 'appFooter';
                document.body.appendChild(footer);
            }
            footer.innerHTML = html;
        })
        .catch(err => console.error('Error loading footer:', err));
}

function updateMainContentGrid() {
    const mainContent = document.getElementById('mainContent') || 
                        document.querySelector('.lg\\:col-span-3') || 
                        document.querySelector('.lg\\:col-span-4');
                        
    if (!mainContent) return;
    
    const isBillingPage = window.location.pathname.includes('billing.html');
    
    if (sidebarOpen) {
        mainContent.classList.remove('lg:col-span-5');
        if (isBillingPage) {
            mainContent.classList.add('lg:col-span-4');
        } else {
            mainContent.classList.remove('lg:col-span-4');
            mainContent.classList.add('lg:col-span-3');
        }
    } else {
        // Keep content width when collapsed for now to avoid grid breaking
    }
}

function setupDesktopSidebarToggle() {
    // Desktop toggle in sidebar
    document.addEventListener('click', function(e) {
        if (e.target.closest('#sidebarToggleDesktop') || 
            e.target.closest('#sidebarToggleDesktopHeader')) {
            toggleDesktopSidebar();
        }
    });
}

function toggleDesktopSidebar() {
    if (sidebarOpen) {
        collapseSidebar();
    } else {
        expandSidebar();
    }
    sidebarOpen = !sidebarOpen;
    
    // Save state to localStorage
    localStorage.setItem('sidebarOpen', sidebarOpen);
}

function collapseSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarNav = document.querySelector('#sidebarNav');
    const sidebarStats = document.getElementById('sidebarStats');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    const mainContent = document.querySelector('.lg\\:col-span-3');
    const sidebarLinks = document.querySelectorAll('.sidebar-link span');
    
    if (sidebar && sidebarNav && sidebarStats && toggleIcon && mainContent) {
        // Collapse sidebar — fix: remove the old classes, do NOT add then immediately remove
        sidebar.classList.remove('lg:col-span-2', 'lg:col-span-3');
        sidebar.classList.add('lg:max-w-16');
        
        // Hide text in links
        sidebarLinks.forEach(link => {
            link.style.opacity = '0';
            link.style.width = '0';
            link.style.overflow = 'hidden';
            link.style.transition = 'all 0.3s ease';
        });
        
        // Hide stats section
        sidebarStats.style.opacity = '0';
        sidebarStats.style.height = '0';
        sidebarStats.style.overflow = 'hidden';
        sidebarStats.style.marginTop = '0';
        
        // Adjust toggle icon
        toggleIcon.classList.remove('fa-chevron-left');
        toggleIcon.classList.add('fa-chevron-right');
        
        // Expand main content
        if (mainContent) {
            mainContent.classList.remove('lg:col-span-3');
            mainContent.classList.add('lg:col-span-4');
        }

        // Update main content grid
        updateMainContentGrid();
        
        // Add collapsed class for styling
        sidebar.classList.add('sidebar-collapsed');
    }
}


function expandSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarNav = document.querySelector('#sidebarNav');
    const sidebarStats = document.getElementById('sidebarStats');
    const toggleIcon = document.getElementById('sidebarToggleIcon');
    const mainContent = document.querySelector('.lg\\:col-span-4, .lg\\:col-span-3');
    const sidebarLinks = document.querySelectorAll('.sidebar-link span');
    
    if (sidebar && sidebarNav && sidebarStats && toggleIcon && mainContent) {
        // Expand sidebar
        sidebar.classList.remove('lg:col-span-1', 'lg:max-w-16', 'sidebar-collapsed');
        sidebar.classList.add('lg:col-span-1');
        
        // Show text in links
        sidebarLinks.forEach(link => {
            link.style.opacity = '1';
            link.style.width = 'auto';
            link.style.overflow = 'visible';
        });
        
        // Show stats section
        sidebarStats.style.opacity = '1';
        sidebarStats.style.height = 'auto';
        sidebarStats.style.overflow = 'visible';
        sidebarStats.style.marginTop = '2rem';
        
        // Adjust toggle icon
        toggleIcon.classList.remove('fa-chevron-right');
        toggleIcon.classList.add('fa-chevron-left');

         // Update main content grid
         updateMainContentGrid();
        
        // Adjust main content
        mainContent.classList.remove('lg:col-span-4');
        mainContent.classList.add('lg:col-span-3');
    }
}

function attachHeaderEvents() {
    // This will be called after header is loaded
}

function setupMobileSidebar() {
    // Toggle mobile sidebar via click events
    document.addEventListener('click', function(e) {
        if (e.target.closest('#sidebarToggleMobile')) {
            document.getElementById('mobileSidebar').classList.remove('-translate-x-full');
            document.getElementById('mobileSidebarOverlay').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        
        if (e.target.closest('#closeSidebar') || e.target.closest('#mobileSidebarOverlay')) {
            document.getElementById('mobileSidebar').classList.add('-translate-x-full');
            document.getElementById('mobileSidebarOverlay').classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('mobileSidebarOverlay');
        
        if (sidebar && !sidebar.classList.contains('-translate-x-full') && 
            !sidebar.contains(e.target) && 
            !e.target.closest('#sidebarToggleMobile') && 
            e.target !== overlay) {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });

    // Escape key closes mobile sidebar (#15)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const sidebar = document.getElementById('mobileSidebar');
            const overlay = document.getElementById('mobileSidebarOverlay');
            if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.add('-translate-x-full');
                if (overlay) overlay.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }
    });
}

function setupLogout() {
    document.addEventListener('click', function(e) {
        // Trigger Logout Modal
        if (e.target.closest('#logoutBtn')) {
            e.preventDefault();
            const modal = document.getElementById('logoutModal');
            if (modal) {
                modal.classList.remove('hidden');
            } else {
                // Fallback if modal not loaded
                if (confirm('Are you sure you want to logout?')) {
                    performLogout();
                }
            }
        }

        // Confirm Logout Action
        if (e.target.closest('#confirmLogout')) {
            performLogout();
        }

        // Cancel Logout or Click Outside
        if (e.target.closest('#cancelLogout') || e.target.id === 'logoutModal') {
            const modal = document.getElementById('logoutModal');
            if (modal) modal.classList.add('hidden');
        }
    });
}

function performLogout() {
    // Clear auth state from localStorage
    localStorage.removeItem('mnrfoodbill_auth_state');
    localStorage.removeItem('cachedProducts');
    localStorage.removeItem('sidebarOpen');
    
    // Sign out from Firebase
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

function updateActiveLink() {
    const currentPage = window.location.pathname.split('/').pop();
    const sidebarLinks = document.querySelectorAll('#sidebar a');
    const mobileLinks = document.querySelectorAll('#mobileSidebar a');
    const bottomNavLinks = document.querySelectorAll('.mobile-bottom-nav a');
    
    sidebarLinks.forEach(link => {
        link.classList.remove('bg-red-50', 'text-red-600');
        link.classList.add('text-gray-600', 'hover:bg-gray-50');
        
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.remove('text-gray-600', 'hover:bg-gray-50');
            link.classList.add('bg-red-50', 'text-red-600');
        }
    });
    
    mobileLinks.forEach(link => {
        link.classList.remove('bg-red-50', 'text-red-600');
        
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('bg-red-50', 'text-red-600');
        }
    });

    bottomNavLinks.forEach(link => {
        link.classList.remove('active');
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('active');
        }
    });
}

function loadQuickStats(userId = null) {
    if (!userId) {
        const user = auth.currentUser;
        if (!user) return;
        userId = user.uid;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    db.collection('orders')
        .where('restaurantId', '==', userId)
        .where('createdAt', '>=', today)
        .where('createdAt', '<', tomorrow)
        .where('status', '==', 'completed')
        .get()
        .then(snapshot => {
            let todaySales = 0;
            let todayOrders = 0;
            
            snapshot.forEach(doc => {
                const order = doc.data();
                todaySales += order.total || 0;
                todayOrders++;
            });
            
            const todaySalesEl = document.getElementById('todaySales');
            if (todaySalesEl) todaySalesEl.textContent = `₹${todaySales.toFixed(2)}`;
            
            const mobileTodaySales = document.getElementById('mobileTodaySales');
            const mobileTodayOrders = document.getElementById('mobileTodayOrders');
            
            if (mobileTodaySales) mobileTodaySales.textContent = `₹${todaySales.toFixed(2)}`;
            if (mobileTodayOrders) mobileTodayOrders.textContent = todayOrders;
        });
}

function loadQuickStatsForSidebar() {
    const user = auth.currentUser;
    if (user) {
        loadQuickStats(user.uid);
    }
}

window.addEventListener('load', function() {
    setTimeout(() => {
        const savedState = localStorage.getItem('sidebarOpen');
        if (savedState === 'false') {
            collapseSidebar();
        }
    }, 100);
});

// Mobile table scroll hint
function showTableScrollHint() {
    if (window.innerWidth > 768) return; // Only on mobile
    
    // Check if hint was already shown
    if (localStorage.getItem('tableScrollHintShown')) return;
    
    const hint = document.createElement('div');
    hint.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50 animate-bounce';
    hint.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="fas fa-arrows-left-right"></i>
            <span>Swipe table to see more →</span>
        </div>
    `;
    
    document.body.appendChild(hint);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (hint.parentNode) {
            hint.remove();
        }
    }, 5000);
    
    // Mark as shown
    localStorage.setItem('tableScrollHintShown', 'true');
}

// Show hint after tables are loaded
setTimeout(showTableScrollHint, 1000);

// Prevent body scroll when table is being used
function preventBodyScroll() {
    const tableWrappers = document.querySelectorAll('.table-wrapper');
    
    tableWrappers.forEach(wrapper => {
        wrapper.addEventListener('touchstart', function() {
            // Add class to body to prevent scroll
            document.body.classList.add('table-scrolling');
        }, { passive: true });
        
        wrapper.addEventListener('touchend', function() {
            // Remove class after a delay
            setTimeout(() => {
                document.body.classList.remove('table-scrolling');
            }, 100);
        }, { passive: true });
    });
}

// Call this after tables are loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(preventBodyScroll, 1000);
});
