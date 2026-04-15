// js/preload-auth.js - Load this BEFORE any other scripts
(function() {
    // Check if we should skip index.html
    const skipIndex = () => {
        try {
            const authState = localStorage.getItem('mnrfoodbill_auth_state');
            if (!authState) return false;
            
            const data = JSON.parse(authState);
            const isRecent = Date.now() - data.timestamp < 3600000; // 1 hour
            
            if (isRecent && window.location.pathname.includes('index.html')) {
                // We're on index.html but user appears to be logged in
                // Redirect immediately to a loading page or dashboard
                window.location.href = 'dashboard.html?from=preload';
                return true;
            }
        } catch (e) {
            console.error('Preload auth check error:', e);
        }
        return false;
    };
    
    // Run immediately
    if (!skipIndex()) {
        // User not logged in or not on index.html, continue normally
        console.log('Preload: No immediate redirect needed');
    }
})();
