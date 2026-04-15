// Thermal printing functions - Professional Restaurant Bill Style
// Mobile: Uses RawBT | Desktop: Uses print dialog

async function prepareReceipt() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        // Fetch restaurant details from Firestore
        const doc = await db.collection('restaurants').doc(user.uid).get();
        if (!doc.exists) {
            throw new Error('Restaurant settings not found');
        }
        
        const restaurantData = doc.data();
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
        const MAX_WIDTH = printerSize === '80mm' ? 64 : 42;
        const currency = settings.currency || '₹';
        const gstRate = parseFloat(settings.gstRate) || 0;
        const serviceRate = parseFloat(settings.serviceCharge) || 0;
        
        const subtotal = parseFloat(document.getElementById('subtotal')?.textContent.replace(currency, '') || 0);
        const gstAmount = parseFloat(document.getElementById('gstAmount')?.textContent.replace(currency, '') || 0);
        const serviceCharge = parseFloat(document.getElementById('serviceCharge')?.textContent.replace(currency, '') || 0);
        const total = parseFloat(document.getElementById('totalAmount')?.textContent.replace(currency, '') || 0);
        
        const customerName = document.getElementById('customerName')?.value || 'Walk-in Customer';
        const customerPhone = document.getElementById('customerPhone')?.value || '';
        const paymentMode = document.getElementById('paymentMode')?.value || 'cash';
        const cashReceived = parseFloat(document.getElementById('cashReceived')?.value || 0);
        const changeAmount = parseFloat(document.getElementById('changeAmount')?.textContent.replace(currency, '') || 0);
        
        const cgstAmount = gstRate > 0 ? gstAmount / 2 : 0;
        const sgstAmount = gstRate > 0 ? gstAmount / 2 : 0;
        
        const now = new Date();
        const billNo = await window.OrderCounter?.getNextOrderId() || generateOrderId();
        
        // Build receipt
        let receipt = buildReceipt(
            restaurant, 
            customerName, 
            customerPhone,
            subtotal, gstRate, gstAmount, serviceRate, serviceCharge, total,
            paymentMode, cashReceived, changeAmount,
            billNo, now, currency,
            cgstAmount, sgstAmount, MAX_WIDTH
        );
        
        const usbPrinted = await tryUsbReceiptPrint(receipt, settings);
        if (usbPrinted) {
            await saveOrderAndClearCart(billNo);
            return;
        }

        const fallbackMode = getReceiptFallbackMode(settings);
        if (fallbackMode === 'rawbt') {
            await shareToRawBT(receipt, billNo, restaurant.name);
            return;
        }

        showDesktopPrintModal(receipt, restaurant.name, billNo, restaurant.upiId, total, printerSize);
        
    } catch (error) {
        console.error("Error preparing receipt:", error);
        showNotification('Error: ' + error.message, 'error');
    }
}

function buildReceipt(restaurant, customerName, customerPhone, 
                     subtotal, gstRate, gstAmount, serviceRate, serviceCharge, total,
                     paymentMode, cashReceived, changeAmount,
                     billNo, now, currency, cgstAmount, sgstAmount, MAX_WIDTH = 42) {
    
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
    receipt += centerText(restaurant.name.toUpperCase()) + '\n';
    receipt += '='.repeat(MAX_WIDTH) + '\n';
    
    if (restaurant.address) {
        receipt += centerText(restaurant.address) + '\n';
    }
    if (restaurant.phone) {
        receipt += centerText('Ph: ' + restaurant.phone) + '\n';
    }
    if (restaurant.gstin) {
        receipt += centerText('GSTIN: ' + restaurant.gstin) + '\n';
    }
    if (restaurant.fssai) {
        receipt += centerText('FSSAI: ' + restaurant.fssai) + '\n';
    }
    
    receipt += '-'.repeat(MAX_WIDTH) + '\n';
    
    // BILL DETAILS
    receipt += `Date    : ${now.toLocaleDateString('en-IN')}\n`;
    receipt += `Time    : ${now.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}\n`;
    receipt += `Bill No : ${billNo}\n`;
    receipt += '-'.repeat(MAX_WIDTH) + '\n';
    
    receipt += `Customer: ${customerName}\n`;
    if (customerPhone) {
        receipt += `Phone   : ${customerPhone}\n`;
    }
    
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
    cart.forEach(item => {
        const itemName = item.name;
        const qty = item.quantity;
        const rate = item.price.toFixed(2);
        const amount = (item.price * item.quantity).toFixed(2);
        
        const nameWidth = MAX_WIDTH > 42 ? 28 : 13;
        let displayName = itemName;
        if (itemName.length > nameWidth + 2) {
            displayName = itemName.substring(0, nameWidth) + '..';
        }
        
        const line = `${slNo.toString().padStart(2)}. ${displayName.padEnd(MAX_WIDTH > 42 ? 30 : 15)} ${qty.toString().padStart(3)} ${currency}${rate.padStart(MAX_WIDTH > 42 ? 10 : 6)} ${currency}${amount.padStart(MAX_WIDTH > 42 ? 12 : 7)}`;
        receipt += line + '\n';
        slNo++;
    });
    
    // BILL SUMMARY
    receipt += '-'.repeat(MAX_WIDTH) + '\n';
    receipt += centerText('BILL SUMMARY') + '\n';
    receipt += '-'.repeat(MAX_WIDTH) + '\n';
    
    receipt += formatLine('Sub Total', `${currency}${subtotal.toFixed(2)}`) + '\n';
    
    if (serviceCharge > 0) {
        receipt += formatLine(`Service Charge ${serviceRate}%`, `${currency}${serviceCharge.toFixed(2)}`) + '\n';
    }
    
    if (gstRate > 0) {
        receipt += formatLine(`CGST ${(gstRate/2).toFixed(1)}%`, `${currency}${cgstAmount.toFixed(2)}`) + '\n';
        receipt += formatLine(`SGST ${(gstRate/2).toFixed(1)}%`, `${currency}${sgstAmount.toFixed(2)}`) + '\n';
    }
    
    receipt += '-'.repeat(MAX_WIDTH) + '\n';
    receipt += formatLine('GRAND TOTAL', `${currency}${total.toFixed(2)}`) + '\n';
    receipt += '='.repeat(MAX_WIDTH) + '\n';
    
    // PAYMENT DETAILS
    const paymentModeDisplay = paymentMode.toUpperCase();
    receipt += `Payment Mode: ${paymentModeDisplay}\n`;
    
    if (paymentMode === 'cash') {
        receipt += `Cash Received: ${currency}${cashReceived.toFixed(2)}\n`;
        receipt += `Change       : ${currency}${changeAmount.toFixed(2)}\n`;
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
    
    if (restaurant.ownerPhone || restaurant.ownerPhone2) {
        receipt += '-'.repeat(MAX_WIDTH) + '\n';
        receipt += centerText('For feedback/complaints:') + '\n';
        if (restaurant.ownerPhone) receipt += centerText(restaurant.ownerPhone) + '\n';
        if (restaurant.ownerPhone2) receipt += centerText(restaurant.ownerPhone2) + '\n';
    }
    
    receipt += '='.repeat(MAX_WIDTH) + '\n';
    
    // Add extra line feeds for thermal printer
    receipt += '\n\n';
    
    return receipt;
}

function getReceiptPrintMode(settings = {}) {
    return window.UsbPrinter?.getPreferredMode(settings) || 'auto';
}

function getReceiptFallbackMode(settings = {}) {
    const mode = getReceiptPrintMode(settings);

    if (mode === 'rawbt') return 'rawbt';
    if (mode === 'browser') return 'browser';

    return isMobileDevice() ? 'rawbt' : 'browser';
}

async function tryUsbReceiptPrint(receiptText, settings, successMessage = 'Receipt sent to USB printer!') {
    if (!window.UsbPrinter?.shouldAttemptUsb(settings)) {
        return false;
    }

    try {
        await window.UsbPrinter.printText(receiptText, settings, { requestIfNeeded: false });
        showNotification(successMessage, 'success');
        return true;
    } catch (error) {
        console.error('USB print failed:', error);
        showNotification(`USB print failed: ${error.message}`, 'error');
        return false;
    }
}

// MOBILE: RawBT Functions
async function shareToRawBT(receiptText, billNo, restaurantName) {
    try {
        // First, save the order (do this BEFORE sharing)
        await saveOrderAndClearCart(billNo);
        
        // Create file for sharing
        const fileName = `receipt_${billNo}.txt`;
        const file = new File([receiptText], fileName, { type: 'text/plain' });
        
        // Check if Web Share API is available
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            // Share with Web Share API (this will open RawBT)
            await navigator.share({
                title: `${restaurantName} - Bill ${billNo}`,
                text: `Receipt ${billNo}\nTotal: ₹${getTotalAmount()}`,
                files: [file]
            });
            
            showNotification('Receipt sent to printer!', 'success');
            
        } else {
            // Fallback: Download file (which should open RawBT)
            downloadFile(receiptText, fileName);
            showNotification('Downloading receipt... Opening RawBT', 'info');
        }
        
    } catch (error) {
        console.error('Share failed:', error);
        
        // Fallback methods
        if (error.name !== 'AbortError') {
            // Try download method
            downloadFile(receiptText, `receipt_${billNo}.txt`);
            showNotification('Opening RawBT...', 'info');
        }
    }
}

function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getTotalAmount() {
    const currency = '₹';
    const totalText = document.getElementById('totalAmount')?.textContent || '₹0.00';
    return parseFloat(totalText.replace(currency, '')).toFixed(2);
}

// DESKTOP: Print Functions
function showDesktopPrintModal(receipt, restaurantName, billNo, upiId = null, totalAmount = 0, printerSize = '58mm') {
    const printContent = document.getElementById('printContent');
    const modal = document.getElementById('printModal');
    
    // Store receipt
    printContent.setAttribute('data-receipt-text', receipt);
    printContent.setAttribute('data-bill-no', billNo);
    if (upiId) printContent.setAttribute('data-upi-id', upiId);
    if (totalAmount) printContent.setAttribute('data-total-amount', totalAmount);
    printContent.setAttribute('data-printer-size', printerSize);
    
    // Prepare display content with QR for preview
    let displayContent = receipt;
    if (upiId && totalAmount) {
        const upiUrl = `upi://pay?pa=${upiId}&pn=Restaurant&am=${totalAmount}&cu=INR`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUrl)}`;
        
        displayContent += `\n\n<div style="text-align:center; margin-top:10px; border-top: 1px dashed #ccc; padding-top: 10px;">
            <img src="${qrApiUrl}" style="width:100px; height:100px; margin: 0 auto;" alt="QR Code">
            <div style="font-weight:bold; margin-top:5px;">Scan to Pay: ₹${parseFloat(totalAmount).toFixed(2)}</div>
        </div>`;
    }
    
    printContent.innerHTML = displayContent;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
}

function printReceipt() {
    const printContentEl = document.getElementById('printContent');
    const printContent = printContentEl.getAttribute('data-receipt-text') || printContentEl.textContent;
    const billNo = printContentEl.getAttribute('data-bill-no');
    const upiId = printContentEl.getAttribute('data-upi-id');
    const totalAmount = printContentEl.getAttribute('data-total-amount');
    const printerSize = printContentEl.getAttribute('data-printer-size') || '58mm';
    
    // Optimized font sizes for thermal printing
    // 58mm with 42 chars needs ~9-10px font
    // 80mm with 64 chars needs ~10-11px font
    const fontSize = printerSize === '80mm' ? '11px' : '9px';
    
    // Create a print-friendly window
    const printWindow = window.open('', '_blank', 'width=240,height=600');
    if (!printWindow) {
        // Fallback to browser print
        printViaBrowser(printContent, billNo);
        return;
    }

    let qrCodeHtml = '';
    if (upiId && totalAmount) {
        const upiUrl = `upi://pay?pa=${upiId}&pn=Restaurant&am=${totalAmount}&cu=INR`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiUrl)}`;
        qrCodeHtml = `<div style="text-align:center; margin-top:5px;"><img src="${qrApiUrl}" style="width:80px;height:80px;"/><br><span style="font-size: 0.8em">Scan to Pay</span></div>`;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                @media print {
                    body { 
                        margin: 0 !important;
                        padding: 0 !important;
                        width: ${printerSize} !important;
                        font-size: ${fontSize} !important;
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
                    width: ${printerSize};
                    margin: 0 auto;
                    padding: 0;
                    line-height: 1;
                    white-space: pre;
                }
            </style>
        </head>
        <body>
            <pre>${printContent}</pre>${qrCodeHtml}
            <script>
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                        setTimeout(() => {
                            window.close();
                        }, 500);
                    }, 100);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    // Save order
    saveOrderAndClearCart(billNo);
}

function printViaBrowser(printContent, billNo) {
    // Create hidden div for printing
    const printDiv = document.createElement('div');
    printDiv.id = 'printableReceipt';
    printDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        width: 58mm;
        font-family: 'Courier New', monospace;
        font-size: 9pt;
        white-space: pre;
        line-height: 1;
        padding: 2mm;
        background: white;
    `;
    printDiv.textContent = printContent;
    document.body.appendChild(printDiv);
    
    // Trigger print
    window.print();
    
    // Clean up
    setTimeout(() => {
        if (printDiv.parentNode) {
            printDiv.parentNode.removeChild(printDiv);
        }
    }, 100);
    
    // Save order
    saveOrderAndClearCart(billNo);
    closePrintModal();
}

function closePrintModal() {
    const modal = document.getElementById('printModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Common Functions
async function saveOrderAndClearCart(billNo = null) {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        const doc = await db.collection('restaurants').doc(user.uid).get();
        const settings = doc.data()?.settings || {};
        const currency = settings.currency || '₹';
        
        const paymentMode = document.getElementById('paymentMode')?.value || 'cash';
        const cashReceived = parseFloat(document.getElementById('cashReceived')?.value || 0);
        const changeAmount = parseFloat(document.getElementById('changeAmount')?.textContent.replace(currency, '') || 0);
        
        const finalBillNo = billNo || await window.OrderCounter?.getNextOrderId() || generateOrderId();

        const orderData = {
            restaurantId: user.uid,
            items: [...cart],
            customerName: document.getElementById('customerName')?.value || 'Walk-in Customer',
            customerPhone: document.getElementById('customerPhone')?.value || '',
            subtotal: parseFloat(document.getElementById('subtotal')?.textContent.replace(currency, '') || 0),
            gstRate: parseFloat(settings.gstRate) || 0,
            gstAmount: parseFloat(document.getElementById('gstAmount')?.textContent.replace(currency, '') || 0),
            serviceChargeRate: parseFloat(settings.serviceCharge) || 0,
            serviceCharge: parseFloat(document.getElementById('serviceCharge')?.textContent.replace(currency, '') || 0),
            total: parseFloat(document.getElementById('totalAmount')?.textContent.replace(currency, '') || 0),
            paymentMode: paymentMode,
            cashReceived: paymentMode === 'cash' ? cashReceived : 0,
            changeAmount: paymentMode === 'cash' ? changeAmount : 0,
            status: 'completed',
            orderId: finalBillNo,
            billNo: finalBillNo,
            printedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('orders').add(orderData);
        
        // Clear cart
        cart = [];
        if (typeof renderCart === 'function') renderCart();
        if (typeof updateTotals === 'function') updateTotals();
        
        // Reset form
        document.getElementById('customerName').value = '';
        document.getElementById('customerPhone').value = '';
        document.getElementById('paymentMode').value = 'cash';
        document.getElementById('cashReceived').value = '';
        document.getElementById('changeAmount').textContent = `${currency}0.00`;
        
        // Reset UI
        document.getElementById('cashPaymentFields').classList.remove('hidden');
        document.getElementById('nonCashPaymentFields').classList.add('hidden');
        
    } catch (error) {
        console.error('Error saving order:', error);
        // Don't show error to user - just log it
    }
}

function generateOrderId() {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `BILL${year}${month}${day}${random}`;
}

// Utility Functions
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Helper for notifications
function showNotification(message, type) {
    // Remove any existing notifications
    document.querySelectorAll('.notification-temp').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification-temp fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-[10000] text-white font-medium ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Override the printBill button click handler
    const printBillBtn = document.getElementById('printBill');
    if (printBillBtn) {
        // Remove any existing event listeners
        const newPrintBillBtn = printBillBtn.cloneNode(true);
        printBillBtn.parentNode.replaceChild(newPrintBillBtn, printBillBtn);
        
        // Add new event listener
        newPrintBillBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            if (cart.length === 0) {
                showNotification('Cart is empty', 'error');
                return;
            }
            
            // Validate cash payment if cash mode
            const paymentMode = document.getElementById('paymentMode').value;
            if (paymentMode === 'cash') {
                const cashReceived = parseFloat(document.getElementById('cashReceived').value) || 0;
                const totalText = document.getElementById('totalAmount').textContent;
                const total = parseFloat(totalText.replace('₹', '')) || 0;
                
                if (cashReceived < total) {
                    showNotification('Insufficient cash received', 'error');
                    return;
                }
            }
            
            // Show printing notification
            showNotification('Processing receipt...', 'info');
            
            // Call prepareReceipt which will:
            // - On mobile: Trigger RawBT via Web Share API
            // - On desktop: Show print modal
            await prepareReceipt();
        });
    }
    
    // Close print modal when clicking outside or on close button
    document.getElementById('printModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'printModal' || e.target.id === 'closePrintModal') {
            closePrintModal();
        }
    });
    
    // Add print modal if not exists
    if (!document.getElementById('printModal')) {
        addPrintModalToDOM();
    }
});

// Add print modal HTML if not already in DOM
function addPrintModalToDOM() {
    const modalHTML = `
        <div id="printModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center">
            <div class="bg-white rounded-lg shadow-xl w-11/12 max-w-md mx-4">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-gray-900">Receipt Preview</h3>
                        <button id="closePrintModal" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="border rounded p-4 bg-gray-50 mb-4">
                        <pre id="printContent" class="text-xs font-mono whitespace-pre-wrap"></pre>
                    </div>
                    <div class="flex space-x-3">
                        <button onclick="closePrintModal()" class="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                            Cancel
                        </button>
                        <button onclick="printReceipt()" class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                            Print Receipt
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
}

// Make functions available globally
window.prepareReceipt = prepareReceipt;
window.printReceipt = printReceipt;
window.closePrintModal = closePrintModal;
