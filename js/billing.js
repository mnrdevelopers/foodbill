let cart = [];
let currentView = 'grid';
let products = [];
// Module-level restaurantId — may differ from user.uid for staff members
let currentRestaurantId = null;
let restaurantSettings = {
    gstRate: 0,
    serviceCharge: 0,
    currency: ''
};

// Global functions
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
        console.error("Product not found in local state:", productId);
        return;
    }

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            quantity: 1,
            imageUrl: product.imageUrl,
            category: product.category
        });
    }

    renderCart();
    updateTotals();
    showNotification(`${product.name} added to cart!`, 'success');
}

function renderProductsInGridView(productsToShow) {
    const container = document.getElementById('productsGrid');
    if (!container) return;
    container.innerHTML = '';

    const currency = restaurantSettings.currency || '₹';

    if (productsToShow.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-8 text-center text-gray-400">
                <i class="fas fa-search text-2xl mb-2"></i>
                <p class="text-sm">No products found</p>
            </div>
        `;
        return;
    }

    productsToShow.forEach(product => {
        const imageUrl = product.imageUrl || (typeof getProductImage === 'function' ? getProductImage(product.name) : null);
        const foodTypeColor = product.foodType === 'veg' ? 'bg-green-500' : 'bg-red-500';
        const foodTypeIcon = product.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
        
        const card = document.createElement('div');
        card.className = 'compact-card bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer';
        
        card.innerHTML = `
            <div class="h-20 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                ${imageUrl 
                    ? `<img src="${imageUrl}" alt="${product.name}" 
                          class="w-full h-full object-cover product-image"
                          loading="lazy"
                          onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                    : ''
                }
                <div class="w-full h-full flex items-center justify-center ${imageUrl ? 'hidden' : ''}">
                    <i class="fas fa-${foodTypeIcon} ${foodTypeColor === 'bg-green-500' ? 'text-green-400' : 'text-red-400'} text-xl"></i>
                </div>
                
                <!-- Food Type Badge -->
                <div class="absolute top-1 left-1 ${foodTypeColor} text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    <i class="fas fa-${foodTypeIcon} text-xs"></i>
                </div>
                
                <!-- Price Badge -->
                <div class="absolute bottom-1 right-1 bg-red-500 text-white text-xs px-2 py-1 rounded">
                    ₹${Number(product.price || 0).toFixed(0)}
                </div>
            </div>
            <div class="p-2">
                <h3 class="product-name font-medium text-gray-800 mb-1">${product.name}</h3>
                <div class="flex items-center justify-between mb-1">
                    <span class="product-category text-xs text-gray-500">${product.category}</span>
                    <span class="quantity-type text-xs font-medium text-gray-700">
                        ${product.baseQuantity || 1} ${product.quantityType || 'plate'}
                    </span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-xs text-gray-600">
                        ${product.description ? product.description.substring(0, 15) + '...' : ''}
                    </span>
                    <button class="add-to-cart bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition" 
                            data-id="${product.id}"
                            title="Add to cart">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.add-to-cart')) {
                addToCart(product.id);
            }
        });
        
        container.appendChild(card);
    });
    
    // Add event listeners
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            addToCart(this.dataset.id);
        });
    });
}

function renderProductsInListView(productsToShow) {
    const container = document.getElementById('productsList');
    if (!container) return;
    container.innerHTML = '';

    const currency = restaurantSettings.currency || '₹';

    if (productsToShow.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-gray-400">
                <i class="fas fa-search text-xl mb-2"></i>
                <p class="text-sm">No products found</p>
            </div>
        `;
        return;
    }

    productsToShow.forEach(product => {
        const imageUrl = product.imageUrl || (typeof getProductImage === 'function' ? getProductImage(product.name) : null);
        const foodTypeColor = product.foodType === 'veg' ? 'bg-green-500' : 'bg-red-500';
        const foodTypeIcon = product.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
        
        const listItem = document.createElement('div');
        listItem.className = 'list-item bg-white';
        
        listItem.innerHTML = `
            <div class="flex-shrink-0 relative">
                ${imageUrl 
                    ? `<img src="${imageUrl}" alt="${product.name}" 
                          class="list-image"
                          loading="lazy"
                          onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                    : ''
                }
                <div class="w-12 h-12 bg-gray-100 rounded flex items-center justify-center ${imageUrl ? 'hidden' : ''}">
                    <i class="fas fa-${foodTypeIcon} ${foodTypeColor === 'bg-green-500' ? 'text-green-400' : 'text-red-400'}"></i>
                </div>
                <div class="absolute -top-1 -right-1 ${foodTypeColor} text-white text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                    <i class="fas fa-${foodTypeIcon} text-xs"></i>
                </div>
            </div>
            <div class="list-details">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="list-name">${product.name}</h4>
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="list-category">${product.category}</span>
                            <span class="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                ${product.baseQuantity || 1} ${product.quantityType || 'plate'}
                            </span>
                        </div>
                    </div>
                    <span class="list-price">${currency}${Number(product.price || 0).toFixed(2)}</span>
                </div>
                ${product.description ? `<p class="list-description">${product.description}</p>` : ''}
            </div>
            <button class="add-to-cart-list bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center ml-2 hover:bg-red-600 transition" 
                    data-id="${product.id}"
                    title="Add to cart">
                <i class="fas fa-plus text-xs"></i>
            </button>
        `;
        
        listItem.addEventListener('click', (e) => {
            if (!e.target.closest('.add-to-cart-list')) {
                addToCart(product.id);
            }
        });
        
        container.appendChild(listItem);
    });
    
    document.querySelectorAll('.add-to-cart-list').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            addToCart(this.dataset.id);
        });
    });
}

function setupViewToggle() {
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const productsGrid = document.getElementById('productsGrid');
    const productsList = document.getElementById('productsList');
    
    if (!gridViewBtn || !listViewBtn) return;
    
    gridViewBtn.addEventListener('click', () => {
        if (currentView === 'list') {
            currentView = 'grid';
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            productsGrid.classList.remove('hidden');
            productsList.classList.add('hidden');
            
            // Re-render products in grid view
            const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
            const activeTab = document.querySelector('.category-tab.active');
            const category = activeTab ? activeTab.dataset.category : 'all';
            
            let filtered = products;
            
            if (category !== 'all') {
                filtered = filtered.filter(p => p.category === category);
            }
            
            if (searchTerm) {
                filtered = filtered.filter(p => 
                    p.name.toLowerCase().includes(searchTerm) ||
                    (p.description && p.description.toLowerCase().includes(searchTerm)) ||
                    (p.category && p.category.toLowerCase().includes(searchTerm))
                );
            }
            
            renderProductsInGridView(filtered);
        }
    });
    
    listViewBtn.addEventListener('click', () => {
        if (currentView === 'grid') {
            currentView = 'list';
            listViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
            productsList.classList.remove('hidden');
            productsGrid.classList.add('hidden');
            
            // Re-render products in list view
            const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
            const activeTab = document.querySelector('.category-tab.active');
            const category = activeTab ? activeTab.dataset.category : 'all';
            
            let filtered = products;
            
            if (category !== 'all') {
                filtered = filtered.filter(p => p.category === category);
            }
            
            if (searchTerm) {
                filtered = filtered.filter(p => 
                    p.name.toLowerCase().includes(searchTerm) ||
                    (p.description && p.description.toLowerCase().includes(searchTerm)) ||
                    (p.category && p.category.toLowerCase().includes(searchTerm))
                );
            }
            
            renderProductsInListView(filtered);
        }
    });
}

function showNotification(message, type) {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'} text-white text-sm font-medium`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        n.style.transform = 'translateX(20px)';
        setTimeout(() => n.remove(), 300);
    }, 3000);
}

// Main DOMContentLoaded event handler
document.addEventListener('DOMContentLoaded', function() {
    // Check auth
    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Fetch user doc to resolve restaurantId (staff != owner uid)
            const userDoc = await db.collection('users').doc(user.uid).get();
            currentRestaurantId = userDoc.exists
                ? (userDoc.data().restaurantId || user.uid)
                : user.uid;

            if (window.OrderCounter) {
                await window.OrderCounter.initialize(currentRestaurantId);
            }
            loadRestaurantSettings();
            loadProducts();
            setupViewToggle();
            setupPaymentHandlers();
        }
    });

    // Load restaurant settings from Firestore
    function loadRestaurantSettings() {
        db.collection('restaurants').doc(currentRestaurantId || auth.currentUser.uid).get()
            .then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    const fetchedSettings = data.settings || {};
                    
                    restaurantSettings = {
                        gstRate: Number(fetchedSettings.gstRate) || 0,
                        serviceCharge: Number(fetchedSettings.serviceCharge) || 0,
                        currency: fetchedSettings.currency || '₹'
                    };
                    
                    if (data.name) {
                        const navName = document.getElementById('restaurantName');
                        if (navName) navName.textContent = data.name;
                    }

                    renderCart();
                    updateTotals();
                    setupPaymentHandlers();
                } else {
                    showNotification('Please configure your settings first.', 'info');
                    setTimeout(() => {
                        window.location.href = 'settings.html';
                    }, 2000);
                }
            })
            .catch(err => {
                console.error("Error loading settings:", err);
                updateTotals();
                setupPaymentHandlers();
            });
    }

    function isOnline() {
        return navigator.onLine;
    }

    function setupPaymentHandlers() {
        const paymentMode = document.getElementById('paymentMode');
        const cashReceived = document.getElementById('cashReceived');
        
        if (paymentMode) {
            paymentMode.addEventListener('change', function() {
                const mode = this.value;
                const cashFields = document.getElementById('cashPaymentFields');
                const nonCashFields = document.getElementById('nonCashPaymentFields');
                
                if (mode === 'cash') {
                    cashFields.classList.remove('hidden');
                    nonCashFields.classList.add('hidden');
                    cashReceived.required = true;
                } else {
                    cashFields.classList.add('hidden');
                    nonCashFields.classList.remove('hidden');
                    cashReceived.required = false;
                    document.getElementById('changeAmount').textContent = `${restaurantSettings.currency}0.00`;
                }
                cashReceived.value = '';
            });
        }
        
        if (cashReceived) {
            cashReceived.addEventListener('input', calculateChange);
        }
    }

    function calculateChange() {
        const cashReceived = parseFloat(document.getElementById('cashReceived').value) || 0;
        const totalText = document.getElementById('totalAmount').textContent;
        const currency = restaurantSettings.currency || '';
        const total = parseFloat(totalText.replace(currency, '')) || 0;
        
        let change = 0;
        if (cashReceived >= total) {
            change = cashReceived - total;
        }
        
        const changeEl = document.getElementById('changeAmount');
        changeEl.textContent = `${currency}${change.toFixed(2)}`;
        
        if (cashReceived < total) {
            changeEl.classList.remove('text-green-600');
            changeEl.classList.add('text-red-600');
            changeEl.textContent = `${currency}${(cashReceived - total).toFixed(2)}`;
        } else {
            changeEl.classList.remove('text-red-600');
            changeEl.classList.add('text-green-600');
        }
    }

    async function saveOrderToFirebase(orderData) {
        try {
            // Only generate a new order ID if one wasn't already provided
            // (prevents duplicate ID consumption when Save + Print are both used)
            if (!orderData.orderId) {
                const orderId = await window.OrderCounter.getNextOrderId();
                orderData.orderId = orderId;
                orderData.billNo = orderId;
            }
            
            const docRef = await db.collection('orders').add(orderData);
            return { success: true, id: docRef.id, orderId: orderData.orderId };
        } catch (error) {
            console.error('Error saving order:', error);
            throw error;
        }
    }

    function loadProducts() {
        const resId = currentRestaurantId || auth.currentUser?.uid;
        if (!resId) return;

        if (isOnline()) {
            db.collection('products')
                .where('restaurantId', '==', resId)
                .get()
                .then(snapshot => {
                    const productsData = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        productsData.push({ 
                            id: doc.id, 
                            name: data.name,
                            price: data.price,
                            category: data.category,
                            description: data.description,
                            imageUrl: data.imageUrl,
                            ...data 
                        });
                    });
                    
                    products = productsData;
                    
                    localStorage.setItem('cachedProducts', JSON.stringify(productsData));
                    
                    const categories = [...new Set(productsData.map(p => p.category))];
                    renderCategories(categories);
                    renderProducts(productsData);
                })
                .catch(err => {
                    console.error("Firestore product load failed:", err);
                    const cached = JSON.parse(localStorage.getItem('cachedProducts')) || [];
                    products = cached;
                    renderProducts(cached);
                });
        } else {
            const cached = JSON.parse(localStorage.getItem('cachedProducts')) || [];
            products = cached;
            renderProducts(cached);
        }
    }
    
    function renderCategories(categories) {
        const container = document.querySelector('.category-tab')?.parentElement;
        if (!container) return;
        
        container.innerHTML = `
            <button class="category-tab active px-4 py-2 bg-red-500 text-white rounded-lg whitespace-nowrap" data-category="all">All Items</button>
        `;

        categories.forEach(category => {
            if (category && category !== 'all') {
                container.innerHTML += `
                    <button class="category-tab px-4 py-2 bg-gray-100 text-gray-700 rounded-lg whitespace-nowrap hover:bg-gray-200" data-category="${category}">
                        ${category}
                    </button>
                `;
            }
        });

        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.category-tab').forEach(t => {
                    t.classList.remove('active', 'bg-red-500', 'text-white');
                    t.classList.add('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
                });
                
                this.classList.remove('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
                this.classList.add('active', 'bg-red-500', 'text-white');
                
                filterProducts(this.dataset.category);
            });
        });
    }

    function filterProducts(category) {
        const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
        let filtered = products;
        
        if (category !== 'all') {
            filtered = filtered.filter(p => p.category === category);
        }
        
        if (searchTerm) {
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(searchTerm) ||
                (p.description && p.description.toLowerCase().includes(searchTerm)) ||
                (p.category && p.category.toLowerCase().includes(searchTerm))
            );
        }
        
        if (currentView === 'grid') {
            renderProductsInGridView(filtered);
        } else {
            renderProductsInListView(filtered);
        }
    }

    function renderProducts(productsToShow) {
        if (currentView === 'grid') {
            renderProductsInGridView(productsToShow);
        } else {
            renderProductsInListView(productsToShow);
        }
    }
    
    function renderCart() {
        const container = document.getElementById('cartItems');
        const emptyCart = document.getElementById('emptyCart');
        if (!container) return;

        if (cart.length === 0) {
            container.innerHTML = '';
            if (emptyCart) {
                container.appendChild(emptyCart);
                emptyCart.classList.remove('hidden');
            }
            return;
        }

        if (emptyCart) emptyCart.classList.add('hidden');
        container.innerHTML = '';

        const currency = restaurantSettings.currency || '₹';

        cart.forEach((item, index) => {
            const productDetails = products.find(p => p.id === item.id);
            const imageUrl = productDetails?.imageUrl || (typeof getProductImage === 'function' ? getProductImage(item.name) : null);
            const foodTypeColor = productDetails?.foodType === 'veg' ? 'bg-green-500' : 'bg-red-500';
            const foodTypeIcon = productDetails?.foodType === 'veg' ? 'leaf' : 'drumstick-bite';
            
            const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
            
            const itemElement = document.createElement('div');
            itemElement.className = 'flex items-center justify-between py-2 border-b last:border-0';
            itemElement.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="relative">
                        <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                            ${imageUrl 
                                ? `<img src="${imageUrl}" alt="${item.name}" 
                                      class="w-full h-full object-cover"
                                      loading="lazy"
                                      onerror="this.onerror=null; this.outerHTML='<i class=\'fas fa-utensils text-gray-400\'></i>'">`
                                : `<i class="fas fa-${foodTypeIcon} ${foodTypeColor === 'bg-green-500' ? 'text-green-400' : 'text-red-400'}"></i>`
                            }
                        </div>
                        <div class="absolute -top-1 -right-1 ${foodTypeColor} text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                            <i class="fas fa-${foodTypeIcon} text-[8px]"></i>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-medium text-sm text-gray-800">${item.name}</h4>
                        <div class="flex items-center space-x-2 text-xs text-gray-500">
                            <span>${productDetails?.baseQuantity || 1} ${productDetails?.quantityType || 'plate'}</span>
                            <span>•</span>
                            <span>${currency}${Number(item.price || 0).toFixed(2)} × ${item.quantity}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-3">
                    <span class="font-bold text-sm">${currency}${itemTotal.toFixed(2)}</span>
                    <button class="remove-item text-red-400 hover:text-red-600 p-1" data-index="${index}">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            `;
            container.appendChild(itemElement);
        });

        document.querySelectorAll('.remove-item').forEach(button => {
            button.addEventListener('click', function() {
                removeFromCart(parseInt(this.dataset.index));
            });
        });
    }

    function removeFromCart(index) {
        const item = cart[index];
        cart.splice(index, 1);
        renderCart();
        updateTotals();
        showNotification(`${item.name} removed from cart`, 'info');
    }

    function updateTotals() {
        const subtotalElem = document.getElementById('subtotal');
        if (!subtotalElem) return;

        const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
        
        const gstRate = Number(restaurantSettings.gstRate) || 0;
        const serviceRate = Number(restaurantSettings.serviceCharge) || 0;
        const currency = restaurantSettings.currency || '₹';

        const gstAmount = subtotal * (gstRate / 100);
        const serviceCharge = subtotal * (serviceRate / 100);
        const total = subtotal + gstAmount + serviceCharge;

        subtotalElem.textContent = `${currency}${subtotal.toFixed(2)}`;
        document.getElementById('gstAmount').textContent = `${currency}${gstAmount.toFixed(2)}`;
        document.getElementById('serviceCharge').textContent = `${currency}${serviceCharge.toFixed(2)}`;
        document.getElementById('totalAmount').textContent = `${currency}${total.toFixed(2)}`;
        
        // Update labels directly by ID instead of scanning all spans
        const gstLabel = document.getElementById('gstLabel');
        if (gstLabel) gstLabel.textContent = `GST (${gstRate}%)`;
        const serviceLabel = document.getElementById('serviceLabel');
        if (serviceLabel) serviceLabel.textContent = `Service Charge (${serviceRate}%)`;
        
        if (document.getElementById('paymentMode')?.value === 'cash') {
            calculateChange();
        }
    }

    const clearCartBtn = document.getElementById('clearCart');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', function() {
            if (cart.length === 0) return;
            if (confirm('Clear all items?')) {
                cart = [];
                renderCart();
                updateTotals();
                showNotification('Cart cleared', 'info');
            }
        });
    }

    const saveOrderBtn = document.getElementById('saveOrder');
    if (saveOrderBtn) {
    saveOrderBtn.addEventListener('click', async function() {
        if (cart.length === 0) {
            showNotification('Cart is empty', 'error');
            return;
        }

        const user = auth.currentUser;
        const currency = restaurantSettings.currency || '₹';
        const totalText = document.getElementById('totalAmount').textContent;
        const total = parseFloat(totalText.replace(currency, '')) || 0;
        const paymentMode = document.getElementById('paymentMode').value;
        
        if (paymentMode === 'cash') {
            const cashReceived = parseFloat(document.getElementById('cashReceived').value) || 0;
            if (cashReceived < total) {
                showNotification('Insufficient cash received', 'error');
                return;
            }
        }
        
        // Generate order ID
        const orderId = await window.OrderCounter.getNextOrderId();
        
        const orderData = {
            restaurantId: currentRestaurantId || user.uid,
            items: JSON.parse(JSON.stringify(cart)), 
            customerName: document.getElementById('customerName').value || 'Walk-in Customer',
            customerPhone: document.getElementById('customerPhone').value || '',
            subtotal: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            gstRate: restaurantSettings.gstRate,
            gstAmount: parseFloat(document.getElementById('gstAmount').textContent.replace(currency, '')),
            serviceChargeRate: restaurantSettings.serviceCharge,
            serviceCharge: parseFloat(document.getElementById('serviceCharge').textContent.replace(currency, '')),
            total: total,
            paymentMode: paymentMode,
            orderId: orderId,
            billNo: orderId,
            status: 'saved',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const result = await saveOrderToFirebase(orderData);
            showNotification(`Order ${orderId} saved!`, 'success');
            cart = [];
            renderCart();
            updateTotals();
            document.getElementById('customerName').value = '';
            document.getElementById('customerPhone').value = '';
        } catch (error) {
            showNotification('Failed to save order', 'error');
        }
    });
}
    
    const printBillBtn = document.getElementById('printBill');
    if (printBillBtn) {
        printBillBtn.addEventListener('click', function() {
            if (cart.length === 0) {
                showNotification('Cart is empty', 'error');
                return;
            }
            if (typeof prepareReceipt === 'function') {
                prepareReceipt();
            }
        });
    }

    const productSearchInput = document.getElementById('productSearch');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', function() {
            const activeTab = document.querySelector('.category-tab.active');
            filterProducts(activeTab ? activeTab.dataset.category : 'all');
        });
    }

    window.renderCart = renderCart;
    window.updateTotals = updateTotals;
});
