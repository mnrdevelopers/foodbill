// js/tables.js
let tables = [];
let activeTable = null;
let tableCart = [];
let tableProducts = [];
let currentTableOrder = null;
let activeTableOrders = [];
// Module-level restaurantId — may differ from user.uid for staff
let tableRestaurantId = null;
let tableRestaurantSettings = {
    gstRate: 0,
    serviceCharge: 0,
    currency: '₹',
    restaurantName: '',
    address: '',
    phone: '',
    gstin: '',
    fssai: '',
    printingMode: 'auto',
    printerSize: '58mm',
    usbVendorId: '',
    usbProductId: '',
    usbSerialNumber: '',
    usbManufacturerName: '',
    usbProductName: ''
};

class TableOrder {
    constructor(tableId, tableName) {
        this.tableId = tableId;
        this.tableName = tableName;
        this.orders = []; // Array to store multiple orders
        this.currentOrder = {
            id: this.generateOrderId(),
            items: [],
            customerName: '',
            customerPhone: '',
            persons: 2,
            createdAt: new Date(),
            status: 'open'
        };
        this.totalAmount = 0;
        this.paidAmount = 0;
        this.paymentMethod = null;
        this.firebaseDocId = null;
        this.isNewOrder = true;
    }

    generateOrderId() {
        return `TBL${Date.now().toString().substr(-6)}`;
    }

    addItem(product) {
        const existingItem = this.currentOrder.items.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.currentOrder.items.push({
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                imageUrl: product.imageUrl,
                category: product.category,
                foodType: product.foodType || 'veg'
            });
        }
        return this.calculateCurrentTotal();
    }

    removeItem(itemId) {
        this.currentOrder.items = this.currentOrder.items.filter(item => item.id !== itemId);
        return this.calculateCurrentTotal();
    }

    calculateCurrentTotal() {
        const subtotal = this.currentOrder.items.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0);
        
        const gstAmount = subtotal * (tableRestaurantSettings.gstRate / 100);
        const serviceCharge = subtotal * (tableRestaurantSettings.serviceCharge / 100);
        
        return {
            subtotal: subtotal,
            gstAmount: gstAmount,
            serviceCharge: serviceCharge,
            total: subtotal + gstAmount + serviceCharge
        };
    }

    saveOrder() {
        const totals = this.calculateCurrentTotal();
        const orderToSave = {
            ...this.currentOrder,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            serviceCharge: totals.serviceCharge,
            total: totals.total,
            savedAt: new Date()
        };

        this.orders.push(orderToSave);
        this.totalAmount += totals.total;
        
        // Start a new order for the same table
        this.currentOrder = {
            id: this.generateOrderId(),
            items: [],
            customerName: this.currentOrder.customerName, // Keep customer info
            customerPhone: this.currentOrder.customerPhone,
            persons: this.currentOrder.persons,
            createdAt: new Date(),
            status: 'open'
        };

        return orderToSave;
    }

    finalizeBill(paymentMethod, cashReceived = 0) {
        const totals = this.calculateCurrentTotal();
        const finalOrder = {
            ...this.currentOrder,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            serviceCharge: totals.serviceCharge,
            total: totals.total,
            paymentMethod: paymentMethod,
            cashReceived: cashReceived,
            changeAmount: paymentMethod === 'cash' ? Math.max(0, cashReceived - totals.total) : 0,
            closedAt: new Date(),
            status: 'closed'
        };

        // Add current order if it has items
        if (this.currentOrder.items.length > 0) {
            this.orders.push(finalOrder);
            this.totalAmount += totals.total;
        }

        this.paidAmount = this.totalAmount;
        this.paymentMethod = paymentMethod;

        return {
            orders: this.orders,
            grandTotal: this.totalAmount,
            totalOrders: this.orders.length,
            paymentMethod: paymentMethod,
            cashReceived: cashReceived,
            changeAmount: finalOrder.changeAmount
        };
    }

    getOrderSummary() {
        const currentTotals = this.calculateCurrentTotal();
        const grandTotal = this.totalAmount + currentTotals.total;
        
        return {
            tableId: this.tableId,
            tableName: this.tableName,
            totalOrders: this.orders.length + (this.currentOrder.items.length > 0 ? 1 : 0),
            grandTotal: grandTotal,
            paidAmount: this.paidAmount,
            balance: grandTotal - this.paidAmount,
            status: this.paidAmount >= grandTotal ? 'paid' : 'pending'
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Resolve restaurantId — staff users have a different restaurantId than their uid
            const userDoc = await db.collection('users').doc(user.uid).get();
            tableRestaurantId = userDoc.exists
                ? (userDoc.data().restaurantId || user.uid)
                : user.uid;

            if (window.OrderCounter) {
                await window.OrderCounter.initialize(tableRestaurantId);
            }
            loadRestaurantSettings();
            loadTables();
            loadProducts();
            loadActiveOrders();
            updateStats();

            // Hide loading overlay after auth and initial load
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.style.transition = 'opacity 0.4s ease';
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 400);
            }
        }
    });

    // Load restaurant settings with GST, service charge, and restaurant info
    function loadRestaurantSettings() {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) return;
        db.collection('restaurants').doc(resId).get()
            .then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    const settings = data.settings || {};
                    
                    tableRestaurantSettings = {
                        gstRate: Number(settings.gstRate) || 0,
                        serviceCharge: Number(settings.serviceCharge) || 0,
                        currency: settings.currency || '₹',
                        restaurantName: data.name || 'Restaurant',
                        address: settings.address || data.address || '',
                        phone: settings.phone || data.phone || '',
                        gstin: settings.gstin || '',
                        fssai: settings.fssai || '',
                        ownerPhone: data.ownerPhone || data.phone || '',
                        ownerPhone2: data.ownerPhone2 || '',
                        upiId: settings.upiId || '',
                        printerSize: settings.printerSize || '58mm',
                        printingMode: settings.printingMode || 'auto',
                        usbVendorId: settings.usbVendorId || '',
                        usbProductId: settings.usbProductId || '',
                        usbSerialNumber: settings.usbSerialNumber || '',
                        usbManufacturerName: settings.usbManufacturerName || '',
                        usbProductName: settings.usbProductName || ''
                    };
                    
                    console.log("Loaded restaurant settings:", tableRestaurantSettings);
                }
            })
            .catch(err => {
                console.error("Error loading settings:", err);
            });
    }

    function loadTables() {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) return;
        db.collection('tables')
            .where('restaurantId', '==', resId)
            .orderBy('tableNumber')
            .get()
            .then(snapshot => {
                tables = [];
                snapshot.forEach(doc => {
                    tables.push({ id: doc.id, ...doc.data() });
                });
                
                renderTables();
            })
            .catch(err => {
                console.error("Error loading tables:", err);
            });
    }

    function renderTables() {
        const container = document.getElementById('tablesGrid');
        if (!container) return;

        container.innerHTML = '';
        
        if (tables.length === 0) {
            container.innerHTML = `
                <div class="col-span-full py-8 text-center">
                    <i class="fas fa-chair text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500">No tables found. Please add tables manually.</p>
                </div>
            `;
            return;
        }

        tables.forEach(table => {
            // Check if table has active orders
            const hasActiveOrders = activeTableOrders.some(order => order.tableId === table.id && !order.closed);
            const effectiveStatus = hasActiveOrders
                ? 'occupied'
                : (table.status === 'occupied' ? 'available' : table.status);

            const tableElement = document.createElement('div');
            tableElement.className = `table-card rounded-xl shadow-lg p-4 cursor-pointer transition-all duration-300 hover:shadow-xl ${getTableStatusClass(effectiveStatus)}`;
            
            tableElement.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-bold text-lg">${table.tableNumber}</h3>
                        <p class="text-sm text-gray-600">${table.capacity} persons</p>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="status-badge px-2 py-1 rounded-full text-xs font-medium mb-2 ${getTableStatusColor(effectiveStatus)}">
                            ${effectiveStatus}
                        </span>
                        ${hasActiveOrders ? `
                            <span class="active-order-badge px-2 py-1 bg-orange-500 text-white rounded-full text-xs font-medium">
                                <i class="fas fa-clock mr-1"></i> Active
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center">
                        <i class="fas fa-${table.type === 'outdoor' ? 'sun' : table.type === 'private' ? 'door-closed' : 'home'} text-gray-400 mr-1"></i>
                        <span class="text-gray-600">${table.type}</span>
                    </div>
                    ${hasActiveOrders ? `
                        <button class="view-order-btn text-blue-600 hover:text-blue-800 text-sm font-medium" data-id="${table.id}">
                            View Order
                        </button>
                    ` : `
                        <button class="start-order-btn text-green-600 hover:text-green-800 text-sm font-medium" data-id="${table.id}">
                            Start Order
                        </button>
                    `}
                </div>
            `;

            tableElement.addEventListener('click', function(e) {
                if (!e.target.closest('button')) {
                    openTableOrderModal(table);
                }
            });

            container.appendChild(tableElement);
        });

        // Single delegated listener on grid container — safe for multiple renderTables() calls
        container.onclick = function(e) {
            const startBtn = e.target.closest('.start-order-btn');
            const viewBtn  = e.target.closest('.view-order-btn');
            const card     = e.target.closest('.table-card');

            if (startBtn || viewBtn) {
                e.stopPropagation();
                const tableId = (startBtn || viewBtn).dataset.id;
                const table = tables.find(t => t.id === tableId);
                if (table) openTableOrderModal(table);
            } else if (card && !e.target.closest('button')) {
                // Clicking on the card body (not a button)
                const tableId = card.querySelector('[data-id]')?.dataset.id;
                const table = tables.find(t => t.id === tableId);
                if (table) openTableOrderModal(table);
            }
        };

        updateStats();
    }

    function getTableStatusClass(status) {
        switch(status) {
            case 'available': return 'bg-white border-2 border-green-200 hover:border-green-300';
            case 'occupied': return 'bg-white border-2 border-red-200 hover:border-red-300';
            case 'reserved': return 'bg-white border-2 border-yellow-200 hover:border-yellow-300';
            case 'cleaning': return 'bg-gray-50 border-2 border-gray-300';
            default: return 'bg-white border-2 border-gray-200';
        }
    }

    function getTableStatusColor(status) {
        switch(status) {
            case 'available': return 'bg-green-100 text-green-800';
            case 'occupied': return 'bg-red-100 text-red-800';
            case 'reserved': return 'bg-yellow-100 text-yellow-800';
            case 'cleaning': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function loadProducts() {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) return;
        db.collection('products')
            .where('restaurantId', '==', resId)
            .get()
            .then(snapshot => {
                tableProducts = [];
                snapshot.forEach(doc => {
                    tableProducts.push({ id: doc.id, ...doc.data() });
                });
            })
            .catch(err => {
                console.error("Error loading products:", err);
            });
    }

    // Open table order modal
    async function openTableOrderModal(table) {
        activeTable = table;
        
        // Check if table already has active order
        const existingOrder = await loadTableOrder(table.id);
        
        if (existingOrder) {
            currentTableOrder = existingOrder;
            currentTableOrder.isNewOrder = false;
        } else {
            currentTableOrder = new TableOrder(table.id, table.tableNumber);
            currentTableOrder.isNewOrder = true;
        }
        
        // Update modal UI
        document.getElementById('currentTableName').textContent = table.tableNumber;
        document.getElementById('tableOrderTitle').textContent = `Order - ${table.tableNumber}`;
        document.getElementById('tableProductsSection').classList.remove('hidden');
        
        // Load products grid
        renderTableProducts();
        
        // Update customer info
        document.getElementById('tableCustomerName').value = currentTableOrder.currentOrder.customerName;
        document.getElementById('tableCustomerPhone').value = currentTableOrder.currentOrder.customerPhone;
        document.getElementById('tablePersons').value = currentTableOrder.currentOrder.persons;
        
        // Show modal
        document.getElementById('tableOrderModal').classList.remove('hidden');
        
        // Update order summary
        updateTableOrderSummary();
        renderTableOrderItems();
        loadTableOrderHistory(currentTableOrder.tableId);
        
        // Update UI based on whether there are existing orders
        const addMoreBtn = document.getElementById('addMoreItemsBtn');
        if (currentTableOrder.orders.length > 0) {
            addMoreBtn.classList.remove('hidden');
        } else {
            addMoreBtn.classList.add('hidden');
        }
    }

    function renderTableProducts() {
        const container = document.getElementById('tableProductsGrid');
        if (!container) return;

        container.innerHTML = '';
        
        if (tableProducts.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-4 text-gray-500">
                    <i class="fas fa-box-open text-xl mb-2"></i>
                    <p>No products available</p>
                </div>
            `;
            return;
        }

        tableProducts.forEach(product => {
            const imageUrl = product.imageUrl;
            const foodTypeColor = product.foodType === 'veg' ? 'bg-green-500' : 'bg-red-500';
            const foodTypeIcon = product.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
            
            const card = document.createElement('div');
            card.className = 'product-card bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow';
            
            card.innerHTML = `
                <div class="h-20 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                    ${imageUrl ? 
                        `<img src="${imageUrl}" alt="${product.name}" 
                              class="w-full h-full object-cover"
                              loading="lazy"
                              onerror="this.style.display='none'">` : 
                        `<i class="fas fa-${foodTypeIcon} ${foodTypeColor === 'bg-green-500' ? 'text-green-400' : 'text-red-400'} text-xl"></i>`
                    }
                    <div class="absolute top-1 left-1 ${foodTypeColor} text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        <i class="fas fa-${foodTypeIcon} text-xs"></i>
                    </div>
                    <div class="absolute bottom-1 right-1 bg-red-500 text-white text-xs px-2 py-1 rounded">
                        ₹${product.price.toFixed(0)}
                    </div>
                </div>
                <div class="p-2">
                    <h3 class="font-medium text-sm text-gray-800 mb-1 truncate">${product.name}</h3>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-gray-500">${product.category}</span>
                        <button class="add-to-table-btn bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-600" 
                                data-id="${product.id}">
                            <i class="fas fa-plus text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
            
            card.addEventListener('click', function(e) {
                if (!e.target.closest('.add-to-table-btn')) {
                    addProductToTableOrder(product.id);
                }
            });

            container.appendChild(card);
        });

        // Single delegated listener on the grid container — avoids
        // re-attaching to ALL .add-to-table-btn elements on the page every render
        const grid = document.getElementById('tableProductsGrid');
        if (grid) {
            grid.onclick = function(e) {
                const btn = e.target.closest('.add-to-table-btn');
                const card = e.target.closest('.product-card');
                if (btn) {
                    e.stopPropagation();
                    addProductToTableOrder(btn.dataset.id);
                } else if (card && !e.target.closest('.add-to-table-btn')) {
                    const productId = card.querySelector('.add-to-table-btn')?.dataset.id;
                    if (productId) addProductToTableOrder(productId);
                }
            };
        }
    }
    function addProductToTableOrder(productId) {
        if (!currentTableOrder) return;
        
        const product = tableProducts.find(p => p.id === productId);
        if (!product) return;
        
        currentTableOrder.addItem(product);
        renderTableOrderItems();
        updateTableOrderSummary();
        showNotification(`${product.name} added to order`, 'success');
    }

    // Render ALL order items — saved batches + current unsaved items
    function renderTableOrderItems() {
        if (!currentTableOrder) return;
        
        const container = document.getElementById('tableOrderItems');
        if (!container) return;
        
        container.innerHTML = '';
        
        const hasSavedOrders = currentTableOrder.orders.length > 0;
        const hasCurrentItems = currentTableOrder.currentOrder.items.length > 0;
        
        if (!hasSavedOrders && !hasCurrentItems) {
            container.innerHTML = `
                <div class="text-center py-4 text-gray-400">
                    <i class="fas fa-shopping-cart text-lg mb-2"></i>
                    <p class="text-sm">No items in current order</p>
                </div>
            `;
            return;
        }
        
        // --- Show saved order batches (read-only, with collapse) ---
        currentTableOrder.orders.forEach((order, idx) => {
            const batchHeader = document.createElement('div');
            batchHeader.className = 'text-xs font-bold text-blue-600 bg-blue-50 rounded px-2 py-1 mb-1 mt-2 flex justify-between items-center';
            const orderTime = order.savedAt
                ? (order.savedAt.seconds
                    ? new Date(order.savedAt.seconds * 1000)   // Firestore Timestamp
                    : new Date(order.savedAt))                  // plain Date/string
                : new Date();
            batchHeader.innerHTML = `
                <span>✓ Order ${idx + 1} &mdash; ${order.items.length} item(s)</span>
                <span>₹${(order.total || 0).toFixed(2)} &nbsp; ${orderTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            `;
            container.appendChild(batchHeader);
            
            order.items.forEach(item => {
                const foodTypeIcon  = item.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
                const foodTypeColor = item.foodType === 'veg' ? 'text-green-500' : 'text-red-500';
                const itemEl = document.createElement('div');
                itemEl.className = 'flex items-center justify-between bg-blue-50 border border-blue-100 p-2 rounded-lg mb-1 opacity-80';
                itemEl.innerHTML = `
                    <div class="flex items-center space-x-2">
                        <i class="fas fa-${foodTypeIcon} ${foodTypeColor} text-xs"></i>
                        <span class="text-sm">${item.name}</span>
                        <span class="text-xs text-gray-500">×${item.quantity}</span>
                    </div>
                    <span class="text-sm font-medium">₹${(item.price * item.quantity).toFixed(2)}</span>
                `;
                container.appendChild(itemEl);
            });
        });

        // --- Show current unsaved items (editable) ---
        if (hasCurrentItems) {
            const newBatchHeader = document.createElement('div');
            newBatchHeader.className = 'text-xs font-bold text-orange-600 bg-orange-50 rounded px-2 py-1 mb-1 mt-2 flex justify-between';
            newBatchHeader.innerHTML = `<span>✏ New Items (unsaved)</span><span>${currentTableOrder.currentOrder.items.length} item(s)</span>`;
            container.appendChild(newBatchHeader);

            currentTableOrder.currentOrder.items.forEach(item => {
                const foodTypeIcon  = item.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
                const foodTypeColor = item.foodType === 'veg' ? 'text-green-500' : 'text-red-500';
                
                const itemElement = document.createElement('div');
                itemElement.className = 'flex items-center justify-between bg-gray-50 p-3 rounded-lg mb-2';
                itemElement.dataset.itemId = item.id;
                itemElement.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <button class="remove-item-btn text-red-400 hover:text-red-600" data-id="${item.id}">
                            <i class="fas fa-times"></i>
                        </button>
                        <div>
                            <p class="font-medium text-sm flex items-center">
                                <i class="fas fa-${foodTypeIcon} ${foodTypeColor} mr-2 text-xs"></i>
                                ${item.name}
                            </p>
                            <p class="text-xs text-gray-500">₹${item.price} × ${item.quantity}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="font-bold text-sm">₹${(item.price * item.quantity).toFixed(2)}</span>
                        <div class="flex items-center space-x-1">
                            <button class="decrease-qty text-gray-500 hover:text-red-500 px-1" data-id="${item.id}">
                                <i class="fas fa-minus text-xs"></i>
                            </button>
                            <span class="text-sm w-6 text-center qty-display">${item.quantity}</span>
                            <button class="increase-qty text-gray-500 hover:text-green-500 px-1" data-id="${item.id}">
                                <i class="fas fa-plus text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(itemElement);
            });
        }

        // Single delegated event listener on the container — avoids stacking
        container.onclick = function(e) {
            const removeBtn  = e.target.closest('.remove-item-btn');
            const decreaseBtn = e.target.closest('.decrease-qty');
            const increaseBtn = e.target.closest('.increase-qty');

            if (removeBtn)   removeItemFromTableOrder(removeBtn.dataset.id);
            else if (decreaseBtn) adjustItemQuantity(decreaseBtn.dataset.id, -1);
            else if (increaseBtn) adjustItemQuantity(increaseBtn.dataset.id, 1);
        };
    }

    function removeItemFromTableOrder(itemId) {
        if (!currentTableOrder) return;
        
        currentTableOrder.removeItem(itemId);
        renderTableOrderItems();
        updateTableOrderSummary();
        showNotification('Item removed', 'info');
    }

    function adjustItemQuantity(itemId, change) {
        if (!currentTableOrder) return;
        
        const item = currentTableOrder.currentOrder.items.find(item => item.id === itemId);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                removeItemFromTableOrder(itemId);
            } else {
                renderTableOrderItems();
                updateTableOrderSummary();
            }
        }
    }

    function updateTableOrderSummary() {
        if (!currentTableOrder) return;
        
        // Use getOrderSummary() which includes ALL saved orders + current unsaved items
        const summary = currentTableOrder.getOrderSummary();
        const currentTotals = currentTableOrder.calculateCurrentTotal();
        const currency = tableRestaurantSettings.currency || '₹';
        
        // Subtotal = all saved batches subtotal + current batch subtotal
        const savedSubtotal = currentTableOrder.orders.reduce((sum, o) =>
            sum + (o.subtotal || o.total || 0), 0);
        const totalSubtotal = savedSubtotal + currentTotals.subtotal;
        const totalGst = (currentTableOrder.orders.reduce((sum, o) => sum + (o.gstAmount || 0), 0))
            + currentTotals.gstAmount;
        const totalService = (currentTableOrder.orders.reduce((sum, o) => sum + (o.serviceCharge || 0), 0))
            + currentTotals.serviceCharge;
        
        document.getElementById('tableSubtotal').textContent      = `${currency}${totalSubtotal.toFixed(2)}`;
        document.getElementById('tableGstAmount').textContent      = `${currency}${totalGst.toFixed(2)}`;
        document.getElementById('tableServiceCharge').textContent  = `${currency}${totalService.toFixed(2)}`;
        document.getElementById('tableTotalAmount').textContent    = `${currency}${summary.grandTotal.toFixed(2)}`;
        
        // Update rate labels
        const gstLabel     = document.getElementById('tableGstAmount')?.previousElementSibling;
        const serviceLabel = document.getElementById('tableServiceCharge')?.previousElementSibling;
        if (gstLabel)     gstLabel.textContent     = `GST (${tableRestaurantSettings.gstRate}%)`;
        if (serviceLabel) serviceLabel.textContent = `Service Charge (${tableRestaurantSettings.serviceCharge}%)`;
    }

    function syncTableOrderPartyDetailsFromForm() {
        if (!currentTableOrder) return;

        const personsInput = parseInt(document.getElementById('tablePersons')?.value, 10);
        currentTableOrder.currentOrder.customerName =
            document.getElementById('tableCustomerName')?.value || 'Guest';
        currentTableOrder.currentOrder.customerPhone =
            document.getElementById('tableCustomerPhone')?.value || '';
        currentTableOrder.currentOrder.persons =
            Number.isFinite(personsInput) && personsInput > 0 ? personsInput : 2;
    }

    // Load table order from Firebase
    async function loadTableOrder(tableId) {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        try {
            const snapshot = await db.collection('tableOrders')
                .where('restaurantId', '==', resId)
                .where('tableId', '==', tableId)
                .where('closed', '==', false)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                const orderData = doc.data();
                
                // Reconstruct TableOrder object
                let tableName = 'Unknown Table';
                if (activeTable && activeTable.id === tableId) {
                    tableName = activeTable.tableNumber;
                } else {
                    const table = tables.find(t => t.id === tableId);
                    if (table) tableName = table.tableNumber;
                    else if (orderData.tableName) tableName = orderData.tableName;
                }

                const tableOrder = new TableOrder(tableId, tableName);
                tableOrder.orders = orderData.orders || [];
                tableOrder.currentOrder = orderData.currentOrder || {
                    id: tableOrder.generateOrderId(),
                    items: [],
                    customerName: '',
                    customerPhone: '',
                    persons: 2,
                    createdAt: new Date(),
                    status: 'open'
                };
                tableOrder.totalAmount = orderData.totalAmount || 0;
                tableOrder.paidAmount = orderData.paidAmount || 0;
                tableOrder.firebaseDocId = doc.id;
                
                return tableOrder;
            }
        } catch (error) {
            console.error('Error loading table order:', error);
        }
        
        return null;
    }

    // Save table order
    document.getElementById('saveTableOrderBtn')?.addEventListener('click', async function() {
        if (!currentTableOrder || currentTableOrder.currentOrder.items.length === 0) {
            showNotification('Add items before saving', 'error');
            return;
        }

        syncTableOrderPartyDetailsFromForm();

        // Save the current order
        const savedOrder = currentTableOrder.saveOrder();
        
        // Save to Firebase
        await saveTableOrderToFirebase(currentTableOrder);
        
        const tableName = activeTable ? activeTable.tableNumber : currentTableOrder.tableName;
        showNotification(`Order saved! You can add more items for ${tableName}`, 'success');
        
        // Update UI
        renderTableOrderItems();
        updateTableOrderSummary();
        loadTableOrderHistory(currentTableOrder.tableId);
        loadActiveOrders();
        
        // Show add more button
        document.getElementById('addMoreItemsBtn').classList.remove('hidden');
    });

    // Add more items button
    document.getElementById('addMoreItemsBtn')?.addEventListener('click', function() {
        // This button just focuses on the product selection
        document.getElementById('tableProductSearch')?.focus();
        showNotification('Add more items to the order', 'info');
    });

    // Print bill and close table
    document.getElementById('printTableBillBtn')?.addEventListener('click', async function() {
        if (!currentTableOrder) return;
        syncTableOrderPartyDetailsFromForm();
        
        // Check if there's an unsaved current order
        if (currentTableOrder.currentOrder.items.length > 0) {
            const confirmSave = confirm('You have unsaved items. Save them before printing bill?');
            if (confirmSave) {
                // Save current order first
                currentTableOrder.saveOrder();
                await saveTableOrderToFirebase(currentTableOrder);
            }
        }

        // Show payment modal
        showPaymentModalForTable();
    });

    async function saveTableOrderToFirebase(tableOrder) {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) throw new Error('No restaurantId');
        const shouldMarkOccupied = (tableOrder.orders?.length || 0) > 0 || (tableOrder.currentOrder?.items?.length || 0) > 0;
        
        const orderData = {
            restaurantId: resId,
            tableId: tableOrder.tableId,
            tableName: tableOrder.tableName,
            orders: tableOrder.orders,
            currentOrder: tableOrder.currentOrder,
            totalAmount: tableOrder.totalAmount,
            paidAmount: tableOrder.paidAmount,
            closed: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (!tableOrder.firebaseDocId) {
            orderData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('tableOrders').add(orderData);
            tableOrder.firebaseDocId = docRef.id;
        } else {
            await db.collection('tableOrders').doc(tableOrder.firebaseDocId).update(orderData);
        }

        if (shouldMarkOccupied) {
            await updateTableStatus(tableOrder.tableId, 'occupied');
        }
        
        return tableOrder.firebaseDocId;
    }

    // Load active table orders
    function loadActiveOrders() {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        db.collection('tableOrders')
            .where('restaurantId', '==', resId)
            .where('closed', '==', false)
            .get()
            .then(snapshot => {
                activeTableOrders = [];
                const tbody = document.getElementById('activeOrdersTable');
                if (tbody) tbody.innerHTML = '';

                if (snapshot.empty) {
                    if (tbody) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="7" class="text-center py-4 text-gray-500">
                                    No active table orders
                                </td>
                            </tr>
                        `;
                    }
                    renderTables();
                    return;
                }
                
                snapshot.forEach(doc => {
                    const order = doc.data();
                    order.id = doc.id;
                    activeTableOrders.push(order);
                    
                    const table = tables.find(t => t.id === order.tableId);
                    
                    if (tbody) {
                        const row = document.createElement('tr');
                        row.className = 'border-b hover:bg-gray-50';
                        
                        // Calculate total items
                        const totalItems = (order.orders || []).reduce((acc, o) => acc + (o.items?.length || 0), 0) + 
                                         (order.currentOrder?.items?.length || 0);
                        
                        row.innerHTML = `
                            <td class="py-3 px-4">
                                <div class="font-bold">${table?.tableNumber || order.tableName || 'Unknown'}</div>
                            </td>
                            <td class="py-3 px-4">${order.currentOrder?.customerName || 'Guest'}</td>
                            <td class="py-3 px-4">
                                <div class="font-mono text-sm">${doc.id.substring(0, 8)}</div>
                            </td>
                            <td class="py-3 px-4">
                                ${totalItems} items
                            </td>
                            <td class="py-3 px-4 font-bold">
                                ₹${(order.totalAmount || 0).toFixed(2)}
                            </td>
                            <td class="py-3 px-4">
                                <span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                    Active
                                </span>
                            </td>
                            <td class="py-3 px-4">
                                <div class="flex space-x-2">
                                    <button class="view-table-order text-blue-500 hover:text-blue-700" data-id="${order.tableId}">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="add-to-table-order text-green-500 hover:text-green-700" data-id="${order.tableId}">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(row);
                    }
                });

                // Delegated listener on tbody — avoids stacking on each reload
                if (tbody) {
                    tbody.onclick = function(e) {
                        const viewBtn  = e.target.closest('.view-table-order');
                        const addBtn   = e.target.closest('.add-to-table-order');

                        if (viewBtn || addBtn) {
                            const tableId = (viewBtn || addBtn).dataset.id;
                            const table = tables.find(t => t.id === tableId);
                            if (table) openTableOrderModal(table);
                        }
                    };
                }
                
                renderTables();
                updateStats();

                // Refresh responsive tables to ensure mobile cards work
                if (window.ResponsiveTables && window.ResponsiveTables.refresh) {
                    setTimeout(() => {
                        window.ResponsiveTables.refresh();
                    }, 100);
                }
            })
            .catch(err => {
                console.error("Error loading active orders:", err);
            });
    }

    function updateStats() {
        if (!tables.length) return;
        
        const occupiedTables = new Set(activeTableOrders.map(order => order.tableId));
        const occupied = occupiedTables.size;
        const available = tables.length - occupied;
        
        document.getElementById('occupiedTables').textContent = occupied;
        document.getElementById('availableTables').textContent = available;
        document.getElementById('activeOrders').textContent = activeTableOrders.length;
        
        // Calculate today's dine-in revenue
        let todayRevenue = 0;
        activeTableOrders.forEach(order => {
            todayRevenue += order.totalAmount || 0;
        });
        document.getElementById('todayDinein').textContent = `₹${todayRevenue.toFixed(2)}`;
    }

    function loadTableOrderHistory(tableId) {
        const container = document.getElementById('tableOrderHistory');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!currentTableOrder || currentTableOrder.orders.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">No previous orders</p>';
            return;
        }
        
        currentTableOrder.orders.forEach((order, index) => {
            // Handle both Firestore Timestamp and plain JS Date/string
            const orderDate = order.savedAt
                ? (order.savedAt.seconds
                    ? new Date(order.savedAt.seconds * 1000)
                    : new Date(order.savedAt))
                : new Date();
            
            // Build item list
            const itemLines = (order.items || []).map(item =>
                `<div class="flex justify-between text-xs text-gray-500 pl-2">
                    <span>${item.name} ×${item.quantity}</span>
                    <span>₹${(item.price * item.quantity).toFixed(2)}</span>
                </div>`
            ).join('');

            const orderElement = document.createElement('div');
            orderElement.className = 'border-l-2 border-blue-400 pl-2 mb-3';
            orderElement.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-bold text-blue-700">Order ${index + 1}</span>
                    <span class="text-xs text-gray-400">${orderDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                ${itemLines}
                <div class="flex justify-between text-xs font-semibold text-gray-700 border-t border-blue-100 mt-1 pt-1">
                    <span>${(order.items || []).length} item(s)</span>
                    <span>₹${(order.total || 0).toFixed(2)}</span>
                </div>
            `;
            container.appendChild(orderElement);
        });
    }

    function showPaymentModalForTable() {
        const paymentModal = document.createElement('div');
        paymentModal.id = 'tablePaymentModal';
        paymentModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        
        const totals = currentTableOrder.getOrderSummary();
        const pendingAmount = totals.balance;
        
        const tableName = activeTable ? activeTable.tableNumber : (currentTableOrder ? currentTableOrder.tableName : 'Table');

        paymentModal.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg w-full max-w-md mx-4">
                <div class="p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Finalize Bill - ${tableName}</h3>
                    
                    <div class="space-y-4 mb-6">
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Total Orders:</span>
                                <span class="font-bold">${totals.totalOrders}</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Grand Total:</span>
                                <span class="font-bold text-xl">₹${totals.grandTotal.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Amount Due:</span>
                                <span class="font-bold text-xl ${pendingAmount > 0 ? 'text-red-600' : 'text-green-600'}">
                                    ₹${pendingAmount.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-gray-700 mb-2">Payment Method</label>
                            <select id="tablePaymentMethod" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="upi">UPI</option>
                                <option value="split">Split Payment</option>
                            </select>
                        </div>
                        
                        <div id="cashPaymentSection">
                            <label class="block text-gray-700 mb-2">Cash Received</label>
                            <input type="number" id="tableCashReceived" 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                   placeholder="Enter amount"
                                   value="${pendingAmount}">
                            <div class="mt-2 p-2 bg-green-50 rounded-lg">
                                <div class="flex justify-between">
                                    <span class="font-medium">Change:</span>
                                    <span id="tableChangeAmount" class="font-bold">₹0.00</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button id="finalizePaymentBtn" class="flex-1 bg-red-500 text-white py-3 rounded-lg font-bold hover:bg-red-600">
                            <i class="fas fa-check mr-2"></i> Complete Payment
                        </button>
                        <button onclick="closePaymentModal()" class="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(paymentModal);
        
        // Add event listeners
        document.getElementById('tableCashReceived')?.addEventListener('input', function() {
            const cashReceived = parseFloat(this.value) || 0;
            const change = cashReceived - pendingAmount;
            document.getElementById('tableChangeAmount').textContent = 
                `₹${Math.max(0, change).toFixed(2)}`;
        });
        
        document.getElementById('tablePaymentMethod')?.addEventListener('change', function() {
            const isCash = this.value === 'cash';
            document.getElementById('cashPaymentSection').style.display = isCash ? 'block' : 'none';
        });
        
        document.getElementById('finalizePaymentBtn')?.addEventListener('click', async function() {
            const paymentMethod = document.getElementById('tablePaymentMethod').value;
            const cashReceived = parseFloat(document.getElementById('tableCashReceived')?.value || 0);
            
            if (paymentMethod === 'cash' && cashReceived < pendingAmount) {
                showNotification('Insufficient cash received', 'error');
                return;
            }
            
            try {
                syncTableOrderPartyDetailsFromForm();

                // Generate Bill No
                const billNo = await window.OrderCounter?.getNextOrderId() || `TBL${Date.now().toString().substr(-8)}`;

                // Finalize the bill
                const result = currentTableOrder.finalizeBill(paymentMethod, cashReceived);
                
                // Update in Firebase
                await finalizeTableOrderInFirebase(currentTableOrder, result, billNo);
                
                // Update table status
                await updateTableStatus(currentTableOrder.tableId, 'available');
                
                // Print receipt using the professional format
                printTableReceipt(currentTableOrder, result, paymentMethod, cashReceived, billNo);
                
                // Close modals
                closePaymentModal();
                closeTableOrderModal();
                
                // Refresh tables
                loadTables();
                loadActiveOrders();
                
                showNotification(`Bill finalized for ${tableName}!`, 'success');
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        });
    }

    async function finalizeTableOrderInFirebase(tableOrder, result, billNo) {
        const user = auth.currentUser;
        
        // Update the table order document with closed status
        const finalData = {
            orders: tableOrder.orders,
            totalAmount: tableOrder.totalAmount,
            paidAmount: tableOrder.paidAmount,
            paymentMethod: result.paymentMethod,
            cashReceived: result.cashReceived || 0,
            changeAmount: result.changeAmount || 0,
            closed: true,
            closedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('tableOrders').doc(tableOrder.firebaseDocId).update(finalData);
        
        // Also create a record in the main orders collection
        await createMainOrderRecord(tableOrder, result, billNo);
    }

    async function createMainOrderRecord(tableOrder, result, billNo) {
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) throw new Error('No restaurantId');
        
        // Flatten all items from all orders
        const allItems = tableOrder.orders.flatMap(order => order.items);
        const subtotal = tableOrder.orders.reduce((sum, order) => {
            if (typeof order.subtotal === 'number') return sum + order.subtotal;
            return sum + (order.items || []).reduce((itemSum, item) => itemSum + ((item.price || 0) * (item.quantity || 0)), 0);
        }, 0);
        const gstAmount = tableOrder.orders.reduce((sum, order) => sum + (Number(order.gstAmount) || 0), 0);
        const serviceCharge = tableOrder.orders.reduce((sum, order) => sum + (Number(order.serviceCharge) || 0), 0);
        const grandTotal = Number(result?.grandTotal) || Number(tableOrder.totalAmount) || subtotal + gstAmount + serviceCharge;
        
        // Use the provided billNo for both orderId and billNo to ensure consistency
        const finalOrderId = billNo || `TBL${Date.now().toString().substr(-8)}`;

        const orderData = {
            restaurantId: resId,
            tableId: tableOrder.tableId,
            tableName: tableOrder.tableName,
            items: allItems,
            customerName: tableOrder.currentOrder.customerName,
            customerPhone: tableOrder.currentOrder.customerPhone,
            persons: tableOrder.currentOrder.persons,
            subtotal: subtotal,
            gstRate: tableRestaurantSettings.gstRate,
            gstAmount: gstAmount,
            serviceChargeRate: tableRestaurantSettings.serviceCharge,
            serviceCharge: serviceCharge,
            total: grandTotal,
            paymentMethod: result.paymentMethod,
            cashReceived: result.cashReceived || 0,
            changeAmount: result.changeAmount || 0,
            orderType: 'dine-in',
            orderId: finalOrderId,
            billNo: finalOrderId,
            status: 'completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('orders').add(orderData);
    }

    async function printTableReceipt(tableOrder, result, paymentMethod, cashReceived, billNo) {
        // Generate professional receipt
        const receipt = generateProfessionalReceipt(tableOrder, result, paymentMethod, cashReceived, billNo);
        const printSettings = {
            printingMode: tableRestaurantSettings.printingMode || 'auto',
            printerSize: tableRestaurantSettings.printerSize || '58mm',
            usbVendorId: tableRestaurantSettings.usbVendorId || '',
            usbProductId: tableRestaurantSettings.usbProductId || '',
            usbSerialNumber: tableRestaurantSettings.usbSerialNumber || '',
            usbManufacturerName: tableRestaurantSettings.usbManufacturerName || '',
            usbProductName: tableRestaurantSettings.usbProductName || ''
        };

        if (window.UsbPrinter?.shouldAttemptUsb(printSettings)) {
            try {
                await window.UsbPrinter.printText(receipt, printSettings, { requestIfNeeded: false });
                showNotification('Receipt sent to USB printer!', 'success');
                return;
            } catch (error) {
                console.error('USB print failed:', error);
                showNotification(`USB print failed: ${error.message}`, 'error');
            }
        }

        const fallbackMode = printSettings.printingMode === 'rawbt' || (printSettings.printingMode !== 'browser' && isMobileDevice())
            ? 'rawbt'
            : 'browser';

        if (fallbackMode === 'rawbt') {
            await shareToRawBT(receipt, billNo, tableRestaurantSettings.restaurantName);
            return;
        }

        // Show print modal
        showPrintModal(receipt, tableRestaurantSettings.upiId, result.grandTotal || tableOrder.totalAmount, tableRestaurantSettings.printerSize);
    }

    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    async function shareToRawBT(receiptText, billNo, restaurantName) {
        try {
            const fileName = `receipt_${billNo}.txt`;
            const file = new File([receiptText], fileName, { type: 'text/plain' });
            
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `${restaurantName} - Bill ${billNo}`,
                    text: `Receipt ${billNo}`,
                    files: [file]
                });
                showNotification('Receipt sent to printer!', 'success');
            } else {
                const blob = new Blob([receiptText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showNotification('Downloading receipt... Opening RawBT', 'info');
            }
        } catch (error) {
            console.error('Share failed:', error);
            if (error.name !== 'AbortError') {
                showNotification('Error sharing receipt', 'error');
            }
        }
    }

    function generateProfessionalReceipt(tableOrder, result, paymentMethod, cashReceived, billNo) {
        const MAX_WIDTH = tableRestaurantSettings.printerSize === '80mm' ? 64 : 42;
        const currency = tableRestaurantSettings.currency;
        const now = new Date();
        
        function centerText(text) {
            const padding = Math.max(0, Math.floor((MAX_WIDTH - text.length) / 2));
            return ' '.repeat(padding) + text;
        }
        
        function formatLine(label, value) {
            const availableSpace = MAX_WIDTH - label.length - value.length;
            const dots = '.'.repeat(Math.max(3, availableSpace));
            return label + dots + value;
        }
        
        // Build receipt text
        let receipt = '';
        
        // HEADER
        receipt += '='.repeat(MAX_WIDTH) + '\n';
        receipt += centerText(tableRestaurantSettings.restaurantName.toUpperCase()) + '\n';
        receipt += '='.repeat(MAX_WIDTH) + '\n';
        
        if (tableRestaurantSettings.address) {
            receipt += centerText(tableRestaurantSettings.address) + '\n';
        }
        if (tableRestaurantSettings.phone) {
            receipt += centerText('Ph: ' + tableRestaurantSettings.phone) + '\n';
        }
        if (tableRestaurantSettings.gstin) {
            receipt += centerText('GSTIN: ' + tableRestaurantSettings.gstin) + '\n';
        }
        if (tableRestaurantSettings.fssai) {
            receipt += centerText('FSSAI: ' + tableRestaurantSettings.fssai) + '\n';
        }
        
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        
        // BILL DETAILS
        receipt += `Date    : ${now.toLocaleDateString('en-IN')}\n`;
        receipt += `Time    : ${now.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}\n`;
        receipt += `Bill No : ${billNo || `TBL${Date.now().toString().substr(-8)}`}\n`;
        receipt += `Table   : ${tableOrder.tableName}\n`;
        receipt += `Customer: ${tableOrder.currentOrder.customerName}\n`;
        if (tableOrder.currentOrder.customerPhone) {
            receipt += `Phone   : ${tableOrder.currentOrder.customerPhone}\n`;
        }
        receipt += `Persons : ${tableOrder.currentOrder.persons}\n`;
        
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        
        // ITEMS HEADER
        if (MAX_WIDTH > 42) {
            receipt += 'Sl  Item'.padEnd(30) + 'Qty  Price'.padStart(16) + 'Amount'.padStart(16) + '\n';
        } else {
            receipt += 'Sl  Item'.padEnd(18) + 'Qty  Price'.padStart(10) + 'Amount'.padStart(10) + '\n';
        }
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        
        // ITEMS LIST
        let slNo = 1;
        let itemCount = 0;
        
        // List all orders
        tableOrder.orders.forEach((order, orderIndex) => {
            if (orderIndex > 0) {
                receipt += `--- Order ${orderIndex + 1} ---\n`;
            }
            
            order.items.forEach(item => {
                const foodTypeIcon = item.foodType === 'veg' ? '🥬' : '🍗';
                let displayName = foodTypeIcon + ' ' + item.name;
                const nameWidth = MAX_WIDTH > 42 ? 28 : 13;
                if (displayName.length > nameWidth + 2) {
                    displayName = displayName.substring(0, nameWidth) + '..';
                }
                
                const qty = item.quantity;
                const rate = item.price.toFixed(2);
                const amount = (item.price * item.quantity).toFixed(2);
                
                const line = `${slNo.toString().padStart(2)}. ${displayName.padEnd(MAX_WIDTH > 42 ? 30 : 15)} ${qty.toString().padStart(3)} ${currency}${rate.padStart(MAX_WIDTH > 42 ? 10 : 6)} ${currency}${amount.padStart(MAX_WIDTH > 42 ? 12 : 7)}`;
                receipt += line + '\n';
                slNo++;
                itemCount += qty;
            });
        });
        
        // BILL SUMMARY
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        receipt += centerText('BILL SUMMARY') + '\n';
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        
        const subtotal = tableOrder.orders.reduce((sum, order) => {
            if (typeof order.subtotal === 'number') return sum + order.subtotal;
            return sum + (order.items || []).reduce((itemSum, item) => itemSum + ((item.price || 0) * (item.quantity || 0)), 0);
        }, 0);
        const gstRate = tableRestaurantSettings.gstRate;
        const serviceRate = tableRestaurantSettings.serviceCharge;
        const gstAmount = tableOrder.orders.reduce((sum, order) => sum + (Number(order.gstAmount) || 0), 0);
        const serviceCharge = tableOrder.orders.reduce((sum, order) => sum + (Number(order.serviceCharge) || 0), 0);
        const total = Number(result?.grandTotal) || Number(tableOrder.totalAmount) || subtotal + gstAmount + serviceCharge;
        
        receipt += formatLine('Sub Total', `${currency}${subtotal.toFixed(2)}`) + '\n';
        
        if (serviceCharge > 0) {
            receipt += formatLine(`Service Charge ${serviceRate}%`, `${currency}${serviceCharge.toFixed(2)}`) + '\n';
        }
        
        if (gstRate > 0) {
            const cgstAmount = gstAmount / 2;
            const sgstAmount = gstAmount / 2;
            receipt += formatLine(`CGST ${(gstRate/2).toFixed(1)}%`, `${currency}${cgstAmount.toFixed(2)}`) + '\n';
            receipt += formatLine(`SGST ${(gstRate/2).toFixed(1)}%`, `${currency}${sgstAmount.toFixed(2)}`) + '\n';
        }
        
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        receipt += formatLine('GRAND TOTAL', `${currency}${total.toFixed(2)}`) + '\n';
        receipt += '='.repeat(MAX_WIDTH) + '\n';
        
        // PAYMENT DETAILS
        const paymentModeDisplay = paymentMethod.toUpperCase();
        receipt += `Payment Mode: ${paymentModeDisplay}\n`;
        
        if (paymentMethod === 'cash') {
            receipt += `Cash Received: ${currency}${cashReceived.toFixed(2)}\n`;
            const change = Number(result?.changeAmount) || Math.max(0, cashReceived - total);
            receipt += `Change       : ${currency}${change.toFixed(2)}\n`;
        } else {
            receipt += `Paid Amount  : ${currency}${total.toFixed(2)}\n`;
        }
        
        receipt += '='.repeat(MAX_WIDTH) + '\n';
        
        // FOOTER
        receipt += centerText('Thank you for dining with us!') + '\n';
        receipt += centerText('Please visit again.') + '\n';
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        receipt += centerText('** Computer Generated Bill **') + '\n';
        receipt += centerText('** No Signature Required **') + '\n';
        
        if (tableRestaurantSettings.ownerPhone || tableRestaurantSettings.ownerPhone2) {
            receipt += '-'.repeat(MAX_WIDTH) + '\n';
            receipt += centerText('For feedback/complaints:') + '\n';
            if (tableRestaurantSettings.ownerPhone) receipt += centerText(tableRestaurantSettings.ownerPhone) + '\n';
            if (tableRestaurantSettings.ownerPhone2) receipt += centerText(tableRestaurantSettings.ownerPhone2) + '\n';
        }
        
        receipt += '='.repeat(MAX_WIDTH) + '\n';
        
        // Add extra line feeds for thermal printer
        receipt += '\n\n';
        
        return receipt;
    }

    function showPrintModal(receiptText, upiId = null, totalAmount = 0, printerSize = '58mm') {
        // Create or update print modal
        let printModal = document.getElementById('tablePrintModal');
        
        if (!printModal) {
            printModal = document.createElement('div');
            printModal.id = 'tablePrintModal';
            printModal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center p-4';
            printModal.innerHTML = `
                <div class="bg-white rounded-xl shadow-lg w-full max-w-md">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xl font-bold text-gray-800">Print Receipt</h3>
                            <button onclick="window.closeTablePrintModal()" class="text-gray-500 hover:text-gray-700">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <div id="tablePrintContent" class="font-mono text-sm whitespace-pre-line mb-6 p-4 bg-gray-50 rounded-lg overflow-y-auto max-h-96">
                        </div>
                        <div class="flex space-x-3">
                            <button onclick="window.printTableReceiptNow()" class="flex-1 bg-red-500 text-white py-3 rounded-lg font-bold hover:bg-red-600">
                                <i class="fas fa-print mr-2"></i> Print Now
                            </button>
                            <button onclick="window.closeTablePrintModal()" class="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(printModal);
            
            // Add global print function
            window.printTableReceiptNow = function() {
                const printContentEl = document.getElementById('tablePrintContent');
                const printContent = printContentEl.getAttribute('data-receipt-text') || printContentEl.textContent;
                const upiId = printContentEl.getAttribute('data-upi-id');
                const totalAmount = printContentEl.getAttribute('data-total-amount');
                const printerSize = printContentEl.getAttribute('data-printer-size') || '58mm';
                const fontSize = printerSize === '80mm' ? '11px' : '9px';
                const printWindow = window.open('', '_blank');

                let qrCodeHtml = '';
                if (upiId && totalAmount) {
                    const upiUrl = `upi://pay?pa=${upiId}&pn=Restaurant&am=${totalAmount}&cu=INR`;
                    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUrl)}`;
                    qrCodeHtml = `<div style="text-align:center; margin-top:5px;"><img src="${qrApiUrl}" style="width:80px;height:80px;"/><br><span style="font-size: 0.8em">Scan to Pay</span></div>`;
                }
                
                const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Print Receipt</title>
                        <style>
                            @media print {
                                body, html {
                                    margin: 0 !important;
                                    padding: 0 !important;
                                    width: ${printerSize} !important;
                                    font-family: 'Courier New', monospace !important;
                                    font-size: ${fontSize} !important;
                                    line-height: 1.1 !important;
                                }
                                @page {
                                    margin: 0 !important;
                                    size: ${printerSize} auto !important;
                                }
                                * {
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                            }
                            body {
                                font-family: 'Courier New', monospace;
                                font-size: ${fontSize};
                                line-height: 1.1;
                                width: ${printerSize};
                                margin: 0 auto;
                                padding: 0;
                                white-space: pre;
                                word-wrap: break-word;
                            }
                        </style>
                    </head>
                    <body>
                        ${printContent.replace(/\n/g, '<br>')}${qrCodeHtml}
                        <script>
                            setTimeout(function() {
                                window.print();
                                setTimeout(function() {
                                    window.close();
                                }, 500);
                            }, 100);
                        </script>
                    </body>
                    </html>
                `;
                
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            };
            
            window.closeTablePrintModal = function() {
                const modal = document.getElementById('tablePrintModal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            };
        }
        
        // Set receipt content
        const contentEl = document.getElementById('tablePrintContent');
        contentEl.setAttribute('data-receipt-text', receiptText);
        if (upiId) contentEl.setAttribute('data-upi-id', upiId);
        if (totalAmount) contentEl.setAttribute('data-total-amount', totalAmount);
        contentEl.setAttribute('data-printer-size', printerSize);
        
        // Prepare display content with QR for preview
        let displayContent = receiptText;
        if (upiId && totalAmount) {
            const upiUrl = `upi://pay?pa=${upiId}&pn=Restaurant&am=${totalAmount}&cu=INR`;
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUrl)}`;
            
            displayContent += `\n\n<div style="text-align:center; margin-top:10px; border-top: 1px dashed #ccc; padding-top: 10px;">
                <img src="${qrApiUrl}" style="width:100px; height:100px; margin: 0 auto;" alt="QR Code">
                <div style="font-weight:bold; margin-top:5px;">Scan to Pay: ₹${parseFloat(totalAmount).toFixed(2)}</div>
            </div>`;
        }
        
        contentEl.innerHTML = displayContent;
        
        // Show modal
        printModal.classList.remove('hidden');
    }

    function updateTableStatus(tableId, status) {
        const user = auth.currentUser;
        return db.collection('tables').doc(tableId).update({
            status: status,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            // Update local table data
            const tableIndex = tables.findIndex(t => t.id === tableId);
            if (tableIndex !== -1) {
                tables[tableIndex].status = status;
                renderTables();
            }
        })
        .catch(err => {
            console.error("Error updating table status:", err);
        });
    }

    // Modal close functions
    window.closeTableOrderModal = function() {
        document.getElementById('tableOrderModal').classList.add('hidden');
        activeTable = null;
        currentTableOrder = null;
    };

    window.closePaymentModal = function() {
        const modal = document.getElementById('tablePaymentModal');
        if (modal) {
            modal.remove();
        }
    };

    // Split bill functionality
    document.getElementById('splitBillBtn')?.addEventListener('click', function() {
        if (!currentTableOrder) return;
        
        openSplitBillModal();
    });

    function openSplitBillModal() {
        document.getElementById('splitBillModal').classList.remove('hidden');
        
        // Initialize split inputs
        const splitCount = document.getElementById('splitCount');
        splitCount.addEventListener('input', function() {
            generateCustomSplitInputs(parseInt(this.value));
        });
        
        generateCustomSplitInputs(2);
    }

    function generateCustomSplitInputs(count) {
        const container = document.getElementById('customSplitInputs');
        container.innerHTML = '';
        
        const total = currentTableOrder.getOrderSummary().balance;
        const equalAmount = (total / count).toFixed(2);
        
        for (let i = 0; i < count; i++) {
            const input = document.createElement('div');
            input.className = 'mb-2';
            input.innerHTML = `
                <label class="block text-gray-600 text-sm mb-1">Person ${i + 1}</label>
                <input type="number" class="split-amount-input w-full px-3 py-1 border border-gray-300 rounded text-sm" 
                       value="${equalAmount}" min="0" step="0.01">
            `;
            container.appendChild(input);
        }
    }

    window.calculateSplit = function() {
        const method = document.getElementById('splitMethod').value;
        const count = parseInt(document.getElementById('splitCount').value);
        const total = currentTableOrder.getOrderSummary().balance;
        
        const resultsContainer = document.getElementById('splitAmounts');
        resultsContainer.innerHTML = '';
        
        if (method === 'equal') {
            const splitAmount = total / count;
            
            for (let i = 0; i < count; i++) {
                const result = document.createElement('div');
                result.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
                result.innerHTML = `
                    <span class="text-sm">Person ${i + 1}:</span>
                    <span class="font-bold">₹${splitAmount.toFixed(2)}</span>
                `;
                resultsContainer.appendChild(result);
            }
        } else {
            // Custom split
            const inputs = document.querySelectorAll('.split-amount-input');
            let enteredTotal = 0;
            inputs.forEach(input => {
                enteredTotal += parseFloat(input.value) || 0;
            });
            
            if (Math.abs(enteredTotal - total) > 0.01) {
                resultsContainer.innerHTML = `
                    <div class="text-red-500 text-sm text-center">
                        Total entered (₹${enteredTotal.toFixed(2)}) doesn't match bill total (₹${total.toFixed(2)})
                    </div>
                `;
                return;
            }
            
            inputs.forEach((input, i) => {
                const amount = parseFloat(input.value) || 0;
                const result = document.createElement('div');
                result.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
                result.innerHTML = `
                    <span class="text-sm">Person ${i + 1}:</span>
                    <span class="font-bold">₹${amount.toFixed(2)}</span>
                `;
                resultsContainer.appendChild(result);
            });
        }
        
        document.getElementById('splitResults').classList.remove('hidden');
    };

    window.closeSplitModal = function() {
        document.getElementById('splitBillModal').classList.add('hidden');
    };

    // Table management modal
    document.getElementById('addTableBtn')?.addEventListener('click', function() {
        openTableModal();
    });

    function openTableModal(table = null) {
        const modal = document.getElementById('tableModal');
        const form = document.getElementById('tableForm');
        const title = document.getElementById('tableModalTitle');
        
        form.reset();
        
        if (table) {
            title.textContent = 'Edit Table';
            document.getElementById('tableId').value = table.id;
            document.getElementById('tableName').value = table.tableNumber;
            document.getElementById('tableCapacity').value = table.capacity;
            document.getElementById('tableType').value = table.type;
            document.getElementById('tableDescription').value = table.description || '';
        } else {
            title.textContent = 'Add New Table';
            document.getElementById('tableId').value = '';
        }
        
        modal.classList.remove('hidden');
    }

    window.closeTableModal = function() {
        document.getElementById('tableModal').classList.add('hidden');
    };

    // Table form submission
    document.getElementById('tableForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const resId = tableRestaurantId || auth.currentUser?.uid;
        if (!resId) {
            showNotification('Unable to determine restaurant for this table', 'error');
            return;
        }
        const tableId = document.getElementById('tableId').value;
        const tableNumber = document.getElementById('tableName').value;
        const capacity = parseInt(document.getElementById('tableCapacity').value);
        const type = document.getElementById('tableType').value;
        const description = document.getElementById('tableDescription').value;
        
        const tableData = {
            tableNumber: tableNumber,
            capacity: capacity,
            type: type,
            description: description,
            status: 'available',
            restaurantId: resId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            if (tableId) {
                // Update existing table
                await db.collection('tables').doc(tableId).update(tableData);
                showNotification('Table updated', 'success');
            } else {
                // Add new table
                tableData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('tables').add(tableData);
                showNotification('Table added', 'success');
            }
            
            closeTableModal();
            loadTables();
            
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Takeaway button
    document.getElementById('takeawayBtn')?.addEventListener('click', function() {
        window.location.href = 'billing.html';
    });

    // Utility function for notifications
    function showNotification(message, type) {
        // Remove existing notifications
        document.querySelectorAll('.table-notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `table-notification fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 text-white font-medium transition-all duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Make functions available globally
    window.openTableOrderModal = openTableOrderModal;
    window.closeTableOrderModal = closeTableOrderModal;
    window.closeSplitModal = closeSplitModal;
    window.calculateSplit = calculateSplit;
    window.closePaymentModal = closePaymentModal;
});
