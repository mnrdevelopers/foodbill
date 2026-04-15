// Local storage manager
class LocalStorageManager {
  constructor() {
    this.offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];
    this.localProducts = JSON.parse(localStorage.getItem('products')) || [];
    this.localOrders = JSON.parse(localStorage.getItem('orders')) || [];
  }

  // Save product locally
  saveProduct(product) {
    this.localProducts.push(product);
    localStorage.setItem('products', JSON.stringify(this.localProducts));
    
    // Queue for sync when online
    this.offlineQueue.push({
      type: 'product',
      action: 'create',
      data: product,
      timestamp: Date.now()
    });
    this.saveQueue();
  }

  // Save order locally
  saveOrder(order) {
    order.id = 'offline_' + Date.now();
    order.status = 'offline_saved';
    this.localOrders.push(order);
    localStorage.setItem('orders', JSON.stringify(this.localOrders));
    
    this.offlineQueue.push({
      type: 'order',
      action: 'create',
      data: order,
      timestamp: Date.now()
    });
    this.saveQueue();
    
    return order.id;
  }

  // Get all products
  getProducts() {
    return this.localProducts;
  }

  // Get all orders
  getOrders() {
    return this.localOrders;
  }

  // Save queue
  saveQueue() {
    localStorage.setItem('offlineQueue', JSON.stringify(this.offlineQueue));
  }

  // Sync when online
  async syncWithFirebase() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;
    
    for (const item of this.offlineQueue) {
      try {
        if (item.type === 'order') {
          await db.collection('orders').add(item.data);
        } else if (item.type === 'product') {
          await db.collection('products').add(item.data);
        }
      } catch (error) {
        console.error('Sync error:', error);
        // Keep in queue for retry
      }
    }
    
    // Clear successful items
    this.offlineQueue = this.offlineQueue.filter(item => 
      !item.synced
    );
    this.saveQueue();
  }
}

// Initialize
const storageManager = new LocalStorageManager();

// Network status detection
window.addEventListener('online', () => {
  storageManager.syncWithFirebase();
  showNotification('Back online - Syncing data...', 'success');
});

window.addEventListener('offline', () => {
  showNotification('Offline mode - Working locally', 'warning');
});
