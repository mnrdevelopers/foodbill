// js/table-responsive.js - Mobile cards, Desktop tables
document.addEventListener('DOMContentLoaded', function() {
    initResponsiveTables();
    setupTouchScrolling();
    checkScreenSize();
    
    // Listen for screen size changes
    window.addEventListener('resize', checkScreenSize);
});

function initResponsiveTables() {
    const tableContainers = document.querySelectorAll('.table-container');
    
    tableContainers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;
        
        // Create cards container for mobile
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'cards-container hidden grid grid-cols-1 gap-4 p-4';
        container.appendChild(cardsContainer);
        
        // Store reference to original table
        const originalTable = table.cloneNode(true);
        
        // Function to convert table to cards
        function convertToCards() {
            if (window.innerWidth > 768) {
                // Desktop: Show table, hide cards
                table.classList.remove('hidden');
                cardsContainer.classList.add('hidden');
                
                // Restore original table if needed
                if (!table.parentNode) {
                    container.insertBefore(originalTable, cardsContainer);
                }
                return;
            }
            
            // Mobile: Convert to cards
            const thead = table.querySelector('thead');
            const tbody = table.querySelector('tbody');
            if (!thead || !tbody) return;
            
            // Get column headers
            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
            
            // Clear existing cards
            cardsContainer.innerHTML = '';
            
            // Store all rows data
            const rowsData = [];
            
            // Create cards from each row
            tbody.querySelectorAll('tr').forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('td');
                if (cells.length === 0) return;
                
                const card = document.createElement('div');
                card.className = 'bg-white rounded-xl shadow-sm border border-gray-100 p-4 card-item';
                
                let cardContent = '';
                let rowData = {
                    rowIndex: rowIndex,
                    id: row.id || null,
                    data: {}
                };
                
                cells.forEach((cell, cellIndex) => {
                    if (cellIndex >= headers.length) return;
                    
                    const header = headers[cellIndex];
                    let cellContent = cell.innerHTML.trim();
                    const cellText = cell.textContent.trim();
                    
                    // Store data from cell
                    if (cell.dataset.id) {
                        rowData.data[header] = cell.dataset.id;
                    }
                    
                    // Special handling for actions column
                    if (header.toLowerCase().includes('actions') || 
                        header.toLowerCase().includes('action')) {
                        
                        // Extract all buttons
                        const buttons = cell.querySelectorAll('button');
                        let actionButtonsHTML = '';
                        
                        buttons.forEach((button, btnIndex) => {
                            // Get button properties
                            const buttonClass = button.className;
                            const buttonText = button.textContent.trim();
                            const buttonTitle = button.title || '';
                            const iconHTML = button.querySelector('i')?.outerHTML || '';
                            const dataId = button.dataset.id || '';
                            
                            // Determine button type
                            let buttonType = 'action';
                            if (buttonClass.includes('view-table-order')) {
                                buttonType = 'view-table';
                            } else if (buttonClass.includes('add-to-table-order')) {
                                buttonType = 'add-table-item';
                            } else if (buttonClass.includes('view-order') || button.textContent.includes('View')) {
                                buttonType = 'view';
                            } else if (buttonClass.includes('print-order') || button.textContent.includes('Print')) {
                                buttonType = 'print';
                            } else if (buttonClass.includes('delete-order') || button.textContent.includes('Delete')) {
                                buttonType = 'delete';
                            } else if (buttonClass.includes('edit-product') || button.textContent.includes('Edit')) {
                                buttonType = 'edit';
                            } else if (buttonClass.includes('delete-product')) {
                                buttonType = 'delete-product';
                            }
                            
                            // Store row data for this button
                            if (dataId) {
                                rowData.data['action_' + buttonType] = dataId;
                            }
                            
                            // Create button with data attributes
                            actionButtonsHTML += `
                                <button class="${buttonClass} card-action-btn" 
                                        data-action-type="${buttonType}"
                                        data-action-id="${dataId}"
                                        data-row-index="${rowIndex}"
                                        title="${buttonTitle}">
                                    ${iconHTML} ${buttonText}
                                </button>
                            `;
                        });
                        
                        cardContent += `
                            <div class="action-buttons flex justify-end space-x-2 pt-3 border-t mt-3">
                                ${actionButtonsHTML}
                            </div>
                        `;
                        
                    } else if (header.toLowerCase().includes('status')) {
                        // Preserve status styling
                        const statusClasses = cell.className;
                        cardContent += `
                            <div class="status-item flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-500">${header}:</span>
                                <span class="${statusClasses}">${cellContent}</span>
                            </div>
                        `;
                    } else if (header.toLowerCase().includes('amount') || 
                              header.toLowerCase().includes('price') ||
                              header.toLowerCase().includes('total')) {
                        cardContent += `
                            <div class="amount-item flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-500">${header}:</span>
                                <span class="font-bold text-gray-800">${cellText}</span>
                            </div>
                        `;
                    } else {
                        cardContent += `
                            <div class="info-item flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-500">${header}:</span>
                                <span class="text-gray-800">${cellText}</span>
                            </div>
                        `;
                    }
                });
                
                card.innerHTML = cardContent;
                card.dataset.rowIndex = rowIndex;
                
                // Store any data-id from the row
                if (row.id) {
                    card.dataset.rowId = row.id;
                }
                
                cardsContainer.appendChild(card);
                rowsData.push(rowData);
            });
            
            // Store rows data in container
            cardsContainer.dataset.rowsData = JSON.stringify(rowsData);
            
            // Show cards, hide table
            table.classList.add('hidden');
            cardsContainer.classList.remove('hidden');
            
            // Setup event listeners for card buttons
            setupCardButtonListeners(cardsContainer);
        }
        
        // Initial conversion
        convertToCards();
        
        // Store function for resize events
        container.convertToCards = convertToCards;
    });
}

function setupCardButtonListeners(container) {
    // Remove any existing listeners
    container.removeEventListener('click', handleCardButtonClick);
    
    // Add new listener
    container.addEventListener('click', handleCardButtonClick);
}

function handleCardButtonClick(e) {
    const button = e.target.closest('.card-action-btn');
    if (!button) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const actionType = button.dataset.actionType;
    const actionId = button.dataset.actionId;
    const rowIndex = button.dataset.rowIndex;
    
    console.log('Card button clicked:', { actionType, actionId, rowIndex });
    
    // Handle different action types
    switch(actionType) {
        case 'view':
            handleViewAction(actionId, rowIndex);
            break;
        case 'view-table':
            handleViewTableAction(actionId, rowIndex);
            break;
        case 'add-table-item':
            handleAddTableItemAction(actionId, rowIndex);
            break;
        case 'print':
            handlePrintAction(actionId, rowIndex);
            break;
        case 'delete':
            handleDeleteAction(actionId, rowIndex);
            break;
        case 'edit':
            handleEditAction(actionId, rowIndex);
            break;
        case 'delete-product':
            handleDeleteProductAction(actionId, rowIndex);
            break;
    }
}

// Action handlers - will try to use existing functions
function handleViewAction(orderId, rowIndex) {
    console.log('View action for:', orderId);
    
    // Try different approaches to call the view function
    if (typeof viewOrderDetails === 'function') {
        viewOrderDetails(orderId);
    } else if (window.viewOrderDetails) {
        window.viewOrderDetails(orderId);
    } else {
        // Fallback: trigger the original button's event
        const originalButton = document.querySelector(`button.view-order[data-id="${orderId}"]`);
        if (originalButton) {
            originalButton.click();
        } else {
            alert('View function not available. Order ID: ' + orderId);
        }
    }
}

function handleViewTableAction(tableId, rowIndex) {
    const originalButton = document.querySelector(`button.view-table-order[data-id="${tableId}"]`);
    if (originalButton) {
        originalButton.click();
    }
}

function handleAddTableItemAction(tableId, rowIndex) {
    const originalButton = document.querySelector(`button.add-to-table-order[data-id="${tableId}"]`);
    if (originalButton) {
        originalButton.click();
    }
}

function handlePrintAction(orderId, rowIndex) {
    console.log('Print action for:', orderId);
    
    if (typeof printOrder === 'function') {
        printOrder(orderId);
    } else if (window.printOrder) {
        window.printOrder(orderId);
    } else {
        const originalButton = document.querySelector(`button.print-order[data-id="${orderId}"]`);
        if (originalButton) {
            originalButton.click();
        }
    }
}

function handleDeleteAction(orderId, rowIndex) {
    console.log('Delete action for:', orderId);
    
    if (typeof showDeleteOrderModal === 'function') {
        showDeleteOrderModal(orderId);
    } else if (window.showDeleteOrderModal) {
        window.showDeleteOrderModal(orderId);
    } else {
        const originalButton = document.querySelector(`button.delete-order[data-id="${orderId}"]`);
        if (originalButton) {
            originalButton.click();
        }
    }
}

function handleEditAction(productId, rowIndex) {
    console.log('Edit action for:', productId);
    
    if (typeof editProduct === 'function') {
        editProduct(productId);
    } else if (window.editProduct) {
        window.editProduct(productId);
    } else {
        const originalButton = document.querySelector(`button.edit-product[data-id="${productId}"]`);
        if (originalButton) {
            originalButton.click();
        }
    }
}

function handleDeleteProductAction(productId, rowIndex) {
    console.log('Delete product action for:', productId);
    
    if (typeof showDeleteModal === 'function') {
        showDeleteModal(productId);
    } else if (window.showDeleteModal) {
        window.showDeleteModal(productId);
    } else {
        const originalButton = document.querySelector(`button.delete-product[data-id="${productId}"]`);
        if (originalButton) {
            originalButton.click();
        }
    }
}

function checkScreenSize() {
    const tableContainers = document.querySelectorAll('.table-container');
    
    tableContainers.forEach(container => {
        if (container.convertToCards) {
            container.convertToCards();
        }
    });
}

function setupTouchScrolling() {
    const tableWrappers = document.querySelectorAll('.table-wrapper');
    
    tableWrappers.forEach(wrapper => {
        // Only apply touch scrolling on desktop (table view)
        if (window.innerWidth <= 768) return;
        
        let isDragging = false;
        let startX, scrollLeft;
        
        wrapper.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.pageX - wrapper.offsetLeft;
            scrollLeft = wrapper.scrollLeft;
            wrapper.style.cursor = 'grabbing';
        });
        
        wrapper.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - wrapper.offsetLeft;
            const walk = (x - startX) * 2;
            wrapper.scrollLeft = scrollLeft - walk;
        });
        
        wrapper.addEventListener('mouseup', () => {
            isDragging = false;
            wrapper.style.cursor = '';
        });
        
        wrapper.addEventListener('mouseleave', () => {
            isDragging = false;
            wrapper.style.cursor = '';
        });
    });
}

// Initialize responsive tables
window.ResponsiveTables = {
    refresh: function() {
        checkScreenSize();
        
        // Re-setup event listeners for all card containers
        document.querySelectorAll('.cards-container').forEach(container => {
            setupCardButtonListeners(container);
        });
    }
};

// Make action handlers globally available
window.handleViewAction = handleViewAction;
window.handlePrintAction = handlePrintAction;
window.handleDeleteAction = handleDeleteAction;
window.handleEditAction = handleEditAction;
window.handleDeleteProductAction = handleDeleteProductAction;
window.handleViewTableAction = handleViewTableAction;
window.handleAddTableItemAction = handleAddTableItemAction;
