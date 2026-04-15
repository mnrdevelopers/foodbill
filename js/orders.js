document.addEventListener('DOMContentLoaded', function() {
    let orders = [];
    let filteredOrders = null; // null means "show all", array means "show filtered subset"
    let currentPage = 1;
    const ordersPerPage = 10;
    let selectedOrder = null;
    let orderToDelete = null;

    let isStaff = false;

    // Check auth
    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                isStaff = userData.role === 'staff';
            }
            await loadOrders();
            refreshOrdersTable();
            loadTodayStats();
            addSearchBarToOrders();
        }
    });

    function loadOrders(filters = {}) {
        return new Promise((resolve, reject) => {
            const user = auth.currentUser;
            let query = db.collection('orders')
                .where('restaurantId', '==', user.uid)
                .orderBy('createdAt', 'desc');

            if (filters.startDate && filters.endDate) {
                const start = new Date(filters.startDate);
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                query = query.where('createdAt', '>=', start)
                            .where('createdAt', '<=', end);
            }

            if (filters.status && filters.status !== 'all') {
                query = query.where('status', '==', filters.status);
            }

            query.get()
                .then(snapshot => {
                    orders = [];
                    filteredOrders = null; // Reset search filter on data reload
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        orders.push({
                            id: doc.id,
                            ...data,
                            createdAt: data.createdAt?.toDate() || new Date()
                        });
                    });
                    resolve(orders);
                })
                .catch(error => {
                    console.error("Error loading orders:", error);
                    // Compound queries require a Firestore composite index.
                    // If the query fails, show a helpful message and resolve empty.
                    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                        showNotification('Please create the required Firestore index to filter by both date and status. Check the browser console for the index link.', 'error');
                    } else {
                        showNotification('Error loading orders: ' + error.message, 'error');
                    }
                    orders = [];
                    resolve(orders); // Resolve empty rather than reject so UI still renders
                });
        });
    }

    // Load today's stats
    function loadTodayStats() {
        const user = auth.currentUser;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        db.collection('orders')
            .where('restaurantId', '==', user.uid)
            .where('createdAt', '>=', today)
            .where('createdAt', '<', tomorrow)
            .where('status', '==', 'completed')
            .get()
            .then(snapshot => {
                let todayRevenue = 0;
                let todayOrders = 0;
                
                snapshot.forEach(doc => {
                    const order = doc.data();
                    todayRevenue += order.total || 0;
                    todayOrders++;
                });

                document.getElementById('todayOrdersCount').textContent = todayOrders;
                document.getElementById('todayRevenue').textContent = `₹${todayRevenue.toFixed(2)}`;
                
                const avgOrderValue = todayOrders > 0 ? todayRevenue / todayOrders : 0;
                document.getElementById('avgOrderValue').textContent = `₹${avgOrderValue.toFixed(2)}`;
            });
    }

    function renderOrdersTable() {
        const tbody = document.getElementById('ordersTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Use filtered subset if search is active, otherwise full orders array
        const displayOrders = filteredOrders !== null ? filteredOrders : orders;

        if (displayOrders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-8 text-center text-gray-500">
                        <i class="fas fa-receipt text-3xl mb-2"></i>
                        <p>${filteredOrders !== null ? 'No orders match your search' : 'No orders found'}</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Calculate pagination from the display set
        const startIndex = (currentPage - 1) * ordersPerPage;
        const endIndex = startIndex + ordersPerPage;
        const pageOrders = displayOrders.slice(startIndex, endIndex);

        pageOrders.forEach(order => {
            const orderDate = order.createdAt.toLocaleDateString('en-IN');
            const orderTime = order.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const itemCount = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';
            row.innerHTML = `
                <td class="py-4 px-6">
                    <div class="font-mono text-sm">${order.orderId || order.id.substring(0, 8)}</div>
                </td>
                <td class="py-4 px-6">
                    <div>${orderDate}</div>
                    <div class="text-sm text-gray-500">${orderTime}</div>
                </td>
                <td class="py-4 px-6">
                    <div class="font-medium">${order.customerName}</div>
                    ${order.customerPhone ? `<div class="text-sm text-gray-500">${order.customerPhone}</div>` : ''}
                </td>
                <td class="py-4 px-6">${itemCount} items</td>
                <td class="py-4 px-6 font-bold">₹${order.total ? order.total.toFixed(2) : '0.00'}</td>
                <td class="py-4 px-6">
                    <span class="px-3 py-1 rounded-full text-sm ${getStatusClass(order.status)}">
                        ${order.status}
                    </span>
                </td>
                <td class="py-4 px-6">
                    <div class="flex space-x-2">
                        <button class="view-order text-blue-500 hover:text-blue-700" data-id="${order.id}" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="print-order text-orange-500 hover:text-orange-700" data-id="${order.id}" title="Print Receipt">
                            <i class="fas fa-print"></i>
                        </button>
                        ${!isStaff ? `
                            <button class="delete-order text-red-500 hover:text-red-700" data-id="${order.id}" title="Delete Order">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners
        document.querySelectorAll('.view-order').forEach(button => {
            button.addEventListener('click', function() {
                const orderId = this.dataset.id;
                viewOrderDetails(orderId);
            });
        });

        document.querySelectorAll('.print-order').forEach(button => {
            button.addEventListener('click', function() {
                const orderId = this.dataset.id;
                printOrder(orderId);
            });
        });

        document.querySelectorAll('.delete-order').forEach(button => {
            button.addEventListener('click', function() {
                const orderId = this.dataset.id;
                showDeleteOrderModal(orderId);
            });
        });
    }

    // Get status CSS class
    function getStatusClass(status) {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'saved':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    }

    // View order details
    function viewOrderDetails(orderId) {
        selectedOrder = orders.find(o => o.id === orderId);
        if (!selectedOrder) return;

        const modal = document.getElementById('orderModal');
        const details = document.getElementById('orderDetails');

        let itemsHtml = '';
        if (selectedOrder.items && selectedOrder.items.length > 0) {
            itemsHtml = `
                <h4 class="font-bold text-gray-700">Items:</h4>
                <div class="border rounded-lg overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="py-2 px-4 text-left">Item</th>
                                <th class="py-2 px-4 text-left">Qty</th>
                                <th class="py-2 px-4 text-left">Price</th>
                                <th class="py-2 px-4 text-left">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${selectedOrder.items.map(item => `
                                <tr class="border-t">
                                    <td class="py-2 px-4">${item.name}</td>
                                    <td class="py-2 px-4">${item.quantity}</td>
                                    <td class="py-2 px-4">₹${item.price.toFixed(2)}</td>
                                    <td class="py-2 px-4 font-bold">₹${(item.price * item.quantity).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const orderDate = selectedOrder.createdAt.toLocaleDateString('en-IN');
        const orderTime = selectedOrder.createdAt.toLocaleTimeString('en-IN');

        details.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-gray-600">Order ID</p>
                    <p class="font-bold">${selectedOrder.orderId || selectedOrder.id}</p>
                </div>
                <div>
                    <p class="text-gray-600">Date & Time</p>
                    <p class="font-bold">${orderDate} ${orderTime}</p>
                </div>
                <div>
                    <p class="text-gray-600">Customer Name</p>
                    <p class="font-bold">${selectedOrder.customerName}</p>
                </div>
                <div>
                    <p class="text-gray-600">Phone</p>
                    <p class="font-bold">${selectedOrder.customerPhone || 'N/A'}</p>
                </div>
                <div>
                    <p class="text-gray-600">Status</p>
                    <span class="px-3 py-1 rounded-full text-sm ${getStatusClass(selectedOrder.status)}">
                        ${selectedOrder.status}
                    </span>
                </div>
            </div>
            ${itemsHtml}
            <div class="border-t pt-4">
                <div class="flex justify-between mb-2">
                    <span>Subtotal:</span>
                    <span>₹${selectedOrder.subtotal ? selectedOrder.subtotal.toFixed(2) : '0.00'}</span>
                </div>
                <div class="flex justify-between mb-2">
                    <span>GST (${selectedOrder.gstRate || 0}%):</span>
                    <span>₹${selectedOrder.gstAmount ? selectedOrder.gstAmount.toFixed(2) : '0.00'}</span>
                </div>
                <div class="flex justify-between mb-2">
                    <span>Service Charge (${selectedOrder.serviceChargeRate || 0}%):</span>
                    <span>₹${selectedOrder.serviceCharge ? selectedOrder.serviceCharge.toFixed(2) : '0.00'}</span>
                </div>
                <div class="flex justify-between text-xl font-bold pt-2 border-t">
                    <span>Total:</span>
                    <span>₹${selectedOrder.total ? selectedOrder.total.toFixed(2) : '0.00'}</span>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    // Print order receipt
   window.printOrderReceipt = async function() {
    if (!selectedOrder) return;

    try {
        // Fetch restaurant details first
        const user = auth.currentUser;
        const resDoc = await db.collection('restaurants').doc(user.uid).get();
        
        if (!resDoc.exists) {
            throw new Error('Restaurant settings not found');
        }
        
        const restaurantData = resDoc.data();
        const settings = restaurantData.settings || {};
        
        const restaurant = {
            name: restaurantData.name || 'Restaurant Name',
            ownerName: restaurantData.ownerName || '',
            ownerPhone: restaurantData.ownerPhone || '',
            ownerPhone2: restaurantData.ownerPhone2 || '',
            address: settings.address || restaurantData.address || '',
            phone: settings.phone || restaurantData.phone || '',
            upiId: settings.upiId || '',
            gstin: settings.gstin || '',
            fssai: settings.fssai || ''
        };

        const printerSize = settings.printerSize || '58mm';
        const MAX_WIDTH = printerSize === '80mm' ? 64 : 32;

        // Prepare receipt for printing
        let receipt = `
${'='.repeat(32)}
        ${restaurant.name.toUpperCase()}
${'='.repeat(32)}
${restaurant.address ? `Address: ${restaurant.address}\n` : ''}
${restaurant.phone ? `Phone: ${restaurant.phone}\n` : ''}
${restaurant.gstin ? `GSTIN: ${restaurant.gstin}\n` : ''}
${restaurant.fssai ? `FSSAI: ${restaurant.fssai}\n` : ''}
${'-'.repeat(32)}
Date: ${selectedOrder.createdAt.toLocaleDateString('en-IN')}
Time: ${selectedOrder.createdAt.toLocaleTimeString('en-IN', {hour12: true})}
${'-'.repeat(32)}
Order ID: ${selectedOrder.orderId || selectedOrder.id}
Customer: ${selectedOrder.customerName}
Phone: ${selectedOrder.customerPhone || 'N/A'}
${'-'.repeat(32)}
ITEM            QTY   AMOUNT
${'-'.repeat(32)}
`;
        
        if (selectedOrder.items) {
            selectedOrder.items.forEach(item => {
                const itemTotal = item.price * item.quantity;
                receipt += `${item.name.substring(0, 16).padEnd(16)} ${item.quantity.toString().padStart(3)}   ₹${itemTotal.toFixed(2).padStart(7)}\n`;
            });
        }
        
        // Calculate taxes based on saved rates or use defaults
        const gstRate = selectedOrder.gstRate || settings.gstRate || 0;
        const serviceRate = selectedOrder.serviceChargeRate || settings.serviceCharge || 0;
        
        receipt += `
${'-'.repeat(32)}
Subtotal:        ₹${selectedOrder.subtotal ? selectedOrder.subtotal.toFixed(2).padStart(10) : '0.00'.padStart(10)}
${gstRate > 0 ? `GST (${gstRate}%):       ₹${selectedOrder.gstAmount ? selectedOrder.gstAmount.toFixed(2).padStart(10) : '0.00'.padStart(10)}\n` : ''}
${serviceRate > 0 ? `Service (${serviceRate}%):    ₹${selectedOrder.serviceCharge ? selectedOrder.serviceCharge.toFixed(2).padStart(10) : '0.00'.padStart(10)}\n` : ''}
${'-'.repeat(32)}
TOTAL:          ₹${selectedOrder.total ? selectedOrder.total.toFixed(2).padStart(10) : '0.00'.padStart(10)}
${'='.repeat(32)}
Status: ${selectedOrder.status}
${'='.repeat(32)}
${(restaurant.ownerPhone || restaurant.ownerPhone2) ? `\nContact Owner:\n${restaurant.ownerPhone ? restaurant.ownerPhone + '\n' : ''}${restaurant.ownerPhone2 ? restaurant.ownerPhone2 + '\n' : ''}` : ''}
*** DUPLICATE COPY ***
`;
        
        // Mobile Printing Logic (RawBT)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            const billNo = selectedOrder.orderId || selectedOrder.id;
            const fileName = `receipt_${billNo}.txt`;
            const file = new File([receipt], fileName, { type: 'text/plain' });
            
            try {
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `${restaurant.name} - Bill ${billNo}`,
                        text: `Receipt ${billNo}`,
                        files: [file]
                    });
                    closeOrderModal();
                    return;
                }
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Share failed:', error);
            }

            // Fallback: Download file
            const blob = new Blob([receipt], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            closeOrderModal();
            return;
        }

        const printContentEl = document.getElementById('printContent');
        
        // Store receipt text for printing
        printContentEl.setAttribute('data-receipt-text', receipt);
        if (restaurant.upiId) printContentEl.setAttribute('data-upi-id', restaurant.upiId);
        if (selectedOrder.total) printContentEl.setAttribute('data-total-amount', selectedOrder.total);
        printContentEl.setAttribute('data-printer-size', printerSize);
        
        // Prepare display content with QR for preview
        let displayContent = receipt;
        if (restaurant.upiId && selectedOrder.total) {
            const upiUrl = `upi://pay?pa=${restaurant.upiId}&pn=Restaurant&am=${selectedOrder.total}&cu=INR`;
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUrl)}`;
            
            displayContent += `\n\n<div style="text-align:center; margin-top:10px; border-top: 1px dashed #ccc; padding-top: 10px;">
                <img src="${qrApiUrl}" style="width:100px; height:100px; margin: 0 auto;" alt="QR Code">
                <div style="font-weight:bold; margin-top:5px;">Scan to Pay: ₹${parseFloat(selectedOrder.total).toFixed(2)}</div>
            </div>`;
        }
        
        printContentEl.innerHTML = displayContent;
        
        closeOrderModal();
        document.getElementById('printModal').classList.remove('hidden');
        
    } catch (error) {
        console.error("Error printing receipt:", error);
        showNotification('Error loading restaurant details: ' + error.message, 'error');
    }
};
    
    // Delete logic
    function showDeleteOrderModal(orderId) {
        orderToDelete = orderId;
        document.getElementById('deleteOrderModal').classList.remove('hidden');
    }

    window.closeDeleteOrderModal = function() {
        orderToDelete = null;
        document.getElementById('deleteOrderModal').classList.add('hidden');
    };

    document.getElementById('confirmDeleteOrder').addEventListener('click', async function() {
        if (!orderToDelete) return;
        
        try {
            await db.collection('orders').doc(orderToDelete).delete();
            showNotification('Order deleted successfully', 'success');
            orders = orders.filter(o => o.id !== orderToDelete);
            refreshOrdersTable();
            updatePagination();
            loadTodayStats(); // Refresh stats in case a today's order was deleted
            closeDeleteOrderModal();
        } catch (error) {
            showNotification('Error deleting order: ' + error.message, 'error');
        }
    });

    // Print order directly
    function printOrder(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        selectedOrder = order;
        printOrderReceipt();
    }

    // Close order modal
    window.closeOrderModal = function() {
        document.getElementById('orderModal').classList.add('hidden');
    };

    // Apply filters
    document.getElementById('applyFilter')?.addEventListener('click', async function() {
        const filters = {
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            status: document.getElementById('statusFilter').value
        };
        
        currentPage = 1;
        await loadOrders(filters);
        refreshOrdersTable();
    });

    // Reset filters
    document.getElementById('resetFilter')?.addEventListener('click', async function() {
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('statusFilter').value = 'all';
        
        currentPage = 1;
        await loadOrders({});
        refreshOrdersTable();
    });

    // Pagination
    document.getElementById('prevPage')?.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            refreshOrdersTable();
            updatePagination();
        }
    });

    document.getElementById('nextPage')?.addEventListener('click', function() {
        const totalPages = Math.ceil(orders.length / ordersPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            refreshOrdersTable();
            updatePagination();
        }
    });

    function updatePagination() {
        const displayOrders = filteredOrders !== null ? filteredOrders : orders;
        const totalPages = Math.max(1, Math.ceil(displayOrders.length / ordersPerPage));
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white font-semibold`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Refresh orders table with responsive tables
    function refreshOrdersTable() {
        renderOrdersTable();
        if (window.ResponsiveTables && window.ResponsiveTables.refresh) {
            setTimeout(() => {
                window.ResponsiveTables.refresh();
            }, 100);
        }
    }

    // Make functions globally accessible if needed
    window.loadOrders = loadOrders;
    window.refreshOrdersTable = refreshOrdersTable;

// Global print function for orders page (renamed to avoid conflict)
window.printHistoryOrder = function() {
    const contentEl = document.getElementById('printContent');
    const receiptText = contentEl.getAttribute('data-receipt-text') || contentEl.textContent;
    const upiId = contentEl.getAttribute('data-upi-id');
    const totalAmount = contentEl.getAttribute('data-total-amount');
    const printerSize = contentEl.getAttribute('data-printer-size') || '58mm';
    const fontSize = printerSize === '80mm' ? '11px' : '9px';
    
    if (!receiptText) {
        showNotification('No receipt to print', 'error');
        return;
    }
    
    // Create a print window with thermal printer styling
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
                .receipt-content {
                    max-width: 42ch;
                    margin: 0 auto;
                }
            </style>
        </head>
        <body>
            <div class="receipt-content">
                ${receiptText.replace(/\n/g, '<br>')}${qrCodeHtml}
            </div>
            <script>
                // Auto-print
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

// Close print modal (for orders page)
window.closePrintModal = function() {
    const modal = document.getElementById('printModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

    function exportOrdersToCSV() {
        if (!orders || orders.length === 0) {
            showNotification('No orders to export', 'warning');
            return;
        }

        // CSV Headers
        const headers = [
            'Order ID',
            'Date',
            'Time',
            'Customer Name',
            'Phone',
            'Items',
            'Total Items',
            'Subtotal',
            'GST',
            'Service Charge',
            'Grand Total',
            'Payment Mode',
            'Status'
        ];

        // Process data
        const csvRows = [headers.join(',')];

        orders.forEach(order => {
            let date = '';
            let time = '';
            if (order.createdAt) {
                const dateObj = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
                if (!isNaN(dateObj.getTime())) {
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const year = dateObj.getFullYear();
                    date = `${day}/${month}/${year}`;
                    time = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                }
            }
            
            // Format items: "Item1 xQty; Item2 xQty"
            const itemsList = (order.items || []).map(item => {
                return `${item.name} x${item.quantity}`;
            }).join('; ');
            
            const totalItems = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

            // Escape fields for CSV (handle quotes, commas, newlines)
            const escapeCsv = (field) => {
                if (field === null || field === undefined) return '';
                const stringField = String(field);
                if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            };

            const row = [
                escapeCsv(order.orderId || order.id),
                `"\t${date}"`, // Force text format to prevent ######## in Excel
                `"\t${time}"`,
                escapeCsv(order.customerName),
                escapeCsv(order.customerPhone),
                escapeCsv(itemsList),
                totalItems,
                (order.subtotal || 0).toFixed(2),
                (order.gstAmount || 0).toFixed(2),
                (order.serviceCharge || 0).toFixed(2),
                (order.total || 0).toFixed(2),
                escapeCsv(order.paymentMode),
                escapeCsv(order.status)
            ];

            csvRows.push(row.join(','));
        });

        // Create download
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Orders_Export_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Orders exported successfully', 'success');
    }

function addSearchBarToOrders() {
    const filtersDiv = document.querySelector('.bg-white.rounded-xl.shadow.p-4.mb-6');
    if (!filtersDiv) return;

    // Check if search/export already exists to prevent duplicates
    if (document.getElementById('orderSearch')) return;

    const controlsHTML = `
        <div class="mt-4 flex flex-col md:flex-row gap-4 items-end">
            <div class="flex-grow w-full">
                <label class="block text-gray-700 mb-2">Search Orders</label>
                <div class="relative">
                    <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input type="text" id="orderSearch" 
                           class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="Search by customer name, phone, order ID...">
                </div>
            </div>
            <button id="exportOrdersBtn" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center whitespace-nowrap h-[42px] shadow-sm">
                <i class="fas fa-file-csv mr-2"></i> Export CSV
            </button>
        </div>
    `;

    filtersDiv.insertAdjacentHTML('beforeend', controlsHTML);

    // Add search functionality
    document.getElementById('orderSearch')?.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        filterOrdersBySearch(searchTerm);
    });

    // Add export functionality
    document.getElementById('exportOrdersBtn')?.addEventListener('click', exportOrdersToCSV);
}

// Filter displayed orders by search term without mutating the canonical orders array
function filterOrdersBySearch(searchTerm) {
    if (!searchTerm) {
        filteredOrders = null; // Clear filter — show all
    } else {
        filteredOrders = orders.filter(order => (
            order.orderId?.toLowerCase().includes(searchTerm) ||
            order.customerName?.toLowerCase().includes(searchTerm) ||
            order.customerPhone?.includes(searchTerm) ||
            order.id.toLowerCase().includes(searchTerm)
        ));
    }
    currentPage = 1; // Reset to first page on new search
    refreshOrdersTable();
    updatePagination();
}

    // Make functions globally accessible
    window.viewOrderDetails = viewOrderDetails;
    window.printOrder = printOrder;
    window.showDeleteOrderModal = showDeleteOrderModal;
    
    // Also expose the functions as properties of the global window object
    if (!window.OrdersManager) {
        window.OrdersManager = {};
    }
    window.OrdersManager.viewOrderDetails = viewOrderDetails;
    window.OrdersManager.printOrder = printOrder;
    window.OrdersManager.showDeleteOrderModal = showDeleteOrderModal;
});
