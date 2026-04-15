// PWA Installation Manager for MNRFoodBill v4.0.0
// IMPORTANT: This file does NOT register the service worker.
// SW registration is handled by the inline script in each HTML page
// to avoid duplicate registrations that cause iOS PWA crashes.

class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    this.updateAvailable = false;

    this.init();
  }

  init() {
    // Grab the existing SW registration (already done by the inline script)
    this._attachToExistingRegistration();

    // Listen for install prompt (Android/Chrome)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // App installed event
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      this.hideInstallButton();
      this.deferredPrompt = null;
      this.showNotification('App installed successfully!', 'success');
    });

    // Check if already installed
    this.checkIfInstalled();

    // Setup offline/online detection
    this.setupNetworkDetection();
  }

  /**
   * Attach to the SW registration that was already made by the inline <script>
   * in the HTML page. This avoids a second navigator.serviceWorker.register()
   * call which causes race conditions on iOS Safari.
   */
  _attachToExistingRegistration() {
    if (!('serviceWorker' in navigator)) return;

    // Use getRegistration() to find the one already registered
    navigator.serviceWorker.getRegistration()
      .then(reg => {
        if (reg) {
          this._onRegistration(reg);
        } else {
          // If somehow registration hasn't happened yet, wait for it
          navigator.serviceWorker.ready.then(r => this._onRegistration(r));
        }
      })
      .catch(err => {
        console.warn('[PWA] Could not get SW registration:', err);
      });
  }

  _onRegistration(reg) {
    this.serviceWorkerRegistration = reg;
    console.log('[PWA] Attached to SW scope:', reg.scope);

    // Setup update listeners
    this.setupUpdateListeners();

    // Check for updates every 2 hours
    setInterval(() => this.checkForUpdates(), 7200000);

    // Initial update check after a short delay
    setTimeout(() => this.checkForUpdates(), 10000);
  }

  setupUpdateListeners() {
    const reg = this.serviceWorkerRegistration;
    if (!reg) return;

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      console.log('[PWA] New Service Worker found:', newWorker.state);

      newWorker.addEventListener('statechange', () => {
        console.log('[PWA] New Service Worker state:', newWorker.state);

        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.updateAvailable = true;
          this.showUpdateNotification();
        }
      });
    });

    // Listen for controller change (after skipWaiting)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] Controller changed');
      if (this.updateAvailable) {
        // Small delay to let the new SW settle
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  }

  showInstallButton() {
    // Don't show if already installed
    if (this.isStandalone) return;

    let installBtn = document.getElementById('pwaInstallBtn');

    if (!installBtn) {
      installBtn = document.createElement('button');
      installBtn.id = 'pwaInstallBtn';
      installBtn.className = 'fixed bottom-6 right-6 bg-gradient-to-r from-red-500 to-orange-500 text-white px-6 py-3 rounded-full shadow-xl z-50 flex items-center space-x-3 hover:from-red-600 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 animate-pulse';
      installBtn.innerHTML = `
        <i class="fas fa-download text-lg"></i>
        <span class="font-bold">Install App</span>
      `;

      installBtn.addEventListener('click', () => this.promptInstall());
      document.body.appendChild(installBtn);
    }

    installBtn.classList.remove('hidden');
    installBtn.style.display = '';

    // Auto-hide after 30 seconds
    setTimeout(() => this.hideInstallButton(), 30000);
  }

  hideInstallButton() {
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
      installBtn.classList.add('hidden');
    }
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      this.showNotification('Install feature not available on this device', 'info');
      return;
    }

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    console.log(`[PWA] User response to install prompt: ${outcome}`);

    if (outcome === 'accepted') {
      this.showNotification('Installing app...', 'success');
    }

    this.deferredPrompt = null;
    this.hideInstallButton();
  }

  async checkForUpdates() {
    if (this.serviceWorkerRegistration) {
      try {
        await this.serviceWorkerRegistration.update();
      } catch (error) {
        // Silently fail — this is expected when offline
      }
    }
  }

  showUpdateNotification() {
    // Only show if app is installed (standalone mode)
    if (!this.isStandalone) return;

    // Remove existing notification
    const existing = document.getElementById('updateNotification');
    if (existing) existing.remove();

    const updateNotification = document.createElement('div');
    updateNotification.id = 'updateNotification';
    updateNotification.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 99999;
      background: #2563eb; color: white; padding: 16px 24px;
      border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      animation: pwaSlideIn 0.3s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;
    updateNotification.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-sync-alt" style="animation:spin 2s linear infinite;"></i>
        </div>
        <div>
          <p style="font-weight:700;margin:0;">Update Available!</p>
          <p style="font-size:13px;opacity:0.9;margin:4px 0 0;">New version is ready</p>
        </div>
        <button id="refreshAppBtn" style="margin-left:12px;background:white;color:#2563eb;padding:8px 16px;border-radius:8px;font-weight:700;border:none;cursor:pointer;">
          Update
        </button>
      </div>
    `;

    // Add animation keyframes if not already present
    if (!document.getElementById('pwaAnimationStyles')) {
      const style = document.createElement('style');
      style.id = 'pwaAnimationStyles';
      style.textContent = `
        @keyframes pwaSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(updateNotification);

    document.getElementById('refreshAppBtn').addEventListener('click', () => {
      this.refreshApp();
    });

    // Auto-refresh after 60 seconds if user doesn't click
    setTimeout(() => {
      if (document.getElementById('updateNotification')) {
        this.refreshApp();
      }
    }, 60000);
  }

  refreshApp() {
    const reg = this.serviceWorkerRegistration;
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    this.showNotification('Updating app...', 'info');

    // Reload after a short delay to let SW activate
    setTimeout(() => window.location.reload(), 800);
  }

  checkIfInstalled() {
    if (this.isStandalone) {
      console.log('[PWA] App is running in standalone mode');
    }
  }

  setupNetworkDetection() {
    window.addEventListener('offline', () => this.showOfflineIndicator());
    window.addEventListener('online', () => {
      this.hideOfflineIndicator();
      this.showNotification('Back online', 'success');
    });

    // Initial check
    if (!navigator.onLine) {
      this.showOfflineIndicator();
    }
  }

  showOfflineIndicator() {
    let indicator = document.getElementById('offlineIndicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'offlineIndicator';
      indicator.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0;
        background: #eab308; color: white; text-align: center;
        padding: 10px 16px; z-index: 99999; font-weight: 600;
        font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      indicator.innerHTML = `
        <i class="fas fa-wifi-slash" style="margin-right:8px;"></i>
        You are currently offline. Some features may be limited.
      `;
      document.body.appendChild(indicator);
    }

    indicator.classList.remove('hidden');
    indicator.style.display = '';
  }

  hideOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.pwa-notification').forEach(n => n.remove());

    const bgColor = {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#eab308',
      info: '#3b82f6',
    }[type] || '#3b82f6';

    const iconClass = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
    }[type] || 'fa-info-circle';

    const notification = document.createElement('div');
    notification.className = 'pwa-notification';
    notification.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      z-index: 99999; padding: 12px 24px; border-radius: 12px;
      color: white; font-weight: 500; font-size: 14px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      background: ${bgColor};
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      transition: all 0.3s ease;
    `;
    notification.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fas ${iconClass}"></i>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize on HTTPS or localhost
  if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
    window.pwaManager = new PWAInstallManager();
  } else {
    console.log('[PWA] Features require HTTPS or localhost');
  }
});
