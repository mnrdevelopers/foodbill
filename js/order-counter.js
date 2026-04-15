// order-counter.js - Sequential order ID generator
class OrderCounter {
    constructor() {
        this.countersRef = null;
        this.currentCount = 0;
        this.restaurantId = null;
        this.initialized = false;
    }

    async initialize(userId) {
        if (!userId) {
            console.error('OrderCounter: No user ID provided for initialization');
            return false;
        }
        
        this.restaurantId = userId;
        this.countersRef = db.collection('orderCounters').doc(userId);
        
        try {
            const doc = await this.countersRef.get();
            if (!doc.exists) {
                // Initialize with count 0
                await this.countersRef.set({
                    count: 0,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                this.currentCount = 0;
            } else {
                this.currentCount = doc.data().count || 0;
            }
            this.initialized = true;
            console.log('OrderCounter initialized for restaurant:', userId);
            return true;
        } catch (error) {
            console.error('Error initializing order counter:', error);
            this.currentCount = 0;
            return false;
        }
    }

    async getNextOrderId() {
        // If not initialized, try to initialize first
        if (!this.initialized && auth.currentUser) {
            await this.initialize(auth.currentUser.uid);
        }
        
        // If still not initialized, return timestamp-based ID
        if (!this.initialized) {
            console.warn('OrderCounter not initialized, using timestamp ID');
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const timestamp = Date.now().toString().substr(-6);
            return `ORD${year}${month}${day}${timestamp}`;
        }

        try {
            // Increment counter
            const batch = db.batch();
            const counterDoc = await this.countersRef.get();
            
            let newCount = 1;
            if (counterDoc.exists) {
                newCount = (counterDoc.data().count || 0) + 1;
            }
            
            // Update counter
            batch.set(this.countersRef, {
                count: newCount,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            await batch.commit();
            
            // Generate order ID
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const sequential = newCount.toString().padStart(4, '0');
            
            return `ORD${year}${month}${day}${sequential}`;
            
        } catch (error) {
            console.error('Error generating order ID:', error);
            // Fallback to timestamp-based ID
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const timestamp = Date.now().toString().substr(-6);
            return `ORD${year}${month}${day}${timestamp}`;
        }
    }

    getCurrentCount() {
        return this.currentCount;
    }

    // Alternative method that doesn't increment, just generates ID from count
    async generateOrderIdFromCount() {
        if (!this.initialized && auth.currentUser) {
            await this.initialize(auth.currentUser.uid);
        }
        
        if (!this.initialized) {
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const timestamp = Date.now().toString().substr(-6);
            return `ORD${year}${month}${day}${timestamp}`;
        }

        try {
            const counterDoc = await this.countersRef.get();
            let count = 1;
            if (counterDoc.exists) {
                count = (counterDoc.data().count || 0) + 1;
            }
            
            // Update the counter
            await this.countersRef.set({
                count: count,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const sequential = count.toString().padStart(4, '0');
            
            return `ORD${year}${month}${day}${sequential}`;
            
        } catch (error) {
            console.error('Error generating order ID:', error);
            const date = new Date();
            const year = date.getFullYear().toString().substr(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const timestamp = Date.now().toString().substr(-6);
            return `ORD${year}${month}${day}${timestamp}`;
        }
    }
}

// Create global instance
window.OrderCounter = new OrderCounter();