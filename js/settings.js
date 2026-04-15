document.addEventListener('DOMContentLoaded', function() {
    const settingsForm = document.getElementById('settingsForm');
    const passwordForm = document.getElementById('passwordForm');
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const reauthForm = document.getElementById('reauthForm');
    
    let pendingAction = null;

    auth.onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            loadSettings();
        }
    });

    // Helper function to safely get input values
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    // Helper function to safely set input values
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    // Load existing logo on page load
    if (typeof LogoUpload !== 'undefined' && LogoUpload.setLogoForEdit) {
        const logoUrlInput = document.getElementById('restaurantLogoUrl');
        if (logoUrlInput && logoUrlInput.value) {
            LogoUpload.setLogoForEdit(logoUrlInput.value);
        }
    }

    async function loadSettings() {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const resDoc = await db.collection('restaurants').doc(user.uid).get();
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (resDoc.exists) {
                const data = resDoc.data();
                const settings = data.settings || {};
                
                // Restaurant info
                setVal('resName', data.name);
                setVal('resAddress', data.address);
                setVal('resPhone', data.phone);
                
                // Tax settings
                setVal('resGst', settings.gstRate);
                setVal('resService', settings.serviceCharge);
                setVal('resGSTIN', settings.gstin);
                setVal('resFSSAI', settings.fssai);
                setVal('resUpiId', settings.upiId);

                // Inject Printer Settings if not exists
                if (!document.getElementById('printerSize')) {
                    const upiInput = document.getElementById('resUpiId');
                    if (upiInput) {
                        const printerDiv = document.createElement('div');
                        printerDiv.className = 'mb-4';
                        printerDiv.innerHTML = `
                            <label class="block text-gray-700 text-sm font-bold mb-2">Printer Paper Size</label>
                            <select id="printerSize" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"><option value="58mm">58mm (Standard)</option><option value="80mm">80mm (Wide)</option></select>
                        `;
                        upiInput.parentElement.insertAdjacentElement('afterend', printerDiv);
                    }
                }
                setVal('printerSize', settings.printerSize || '58mm');
                
                // Owner info
                setVal('ownerName', data.ownerName);
                setVal('ownerPhone', data.ownerPhone || data.phone);
                setVal('ownerPhone2', data.ownerPhone2);
                
                // Logo (load from settings or root level)
                const logoUrl = settings.logoUrl || data.logoUrl;
                if (logoUrl) {
                    setVal('restaurantLogoUrl', logoUrl);
                    // Set logo preview if LogoUpload is available
                    if (typeof LogoUpload !== 'undefined' && LogoUpload.setLogoForEdit) {
                        LogoUpload.setLogoForEdit(logoUrl);
                    }
                }
            }
            
            // Fallback owner info check from users collection
            if (userDoc.exists && !getVal('ownerName')) {
                const userData = userDoc.data();
                setVal('ownerName', userData.name);
                setVal('ownerPhone', userData.phone);
            }

        } catch (error) {
            console.error("Error loading settings:", error);
            showNotification('Failed to load settings', 'error');
        }
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const user = auth.currentUser;
            const submitBtn = settingsForm.querySelector('button[type="submit"]');
            
            submitBtn.disabled = true;
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';

            const ownerName = getVal('ownerName');
            const ownerPhone = getVal('ownerPhone');
            const ownerPhone2 = getVal('ownerPhone2');
            const logoUrl = getVal('restaurantLogoUrl');

            const updatedData = {
                name: getVal('resName'),
                ownerName: ownerName,
                ownerPhone: ownerPhone,
                ownerPhone2: ownerPhone2,
                address: getVal('resAddress'),
                phone: getVal('resPhone'),
                settings: {
                    currency: '₹',
                    gstRate: parseFloat(getVal('resGst')) || 0,
                    serviceCharge: parseFloat(getVal('resService')) || 0,
                    gstin: getVal('resGSTIN'),
                    fssai: getVal('resFSSAI'),
                    upiId: getVal('resUpiId'),
                    printerSize: getVal('printerSize') || '58mm',
                    logoUrl: logoUrl // Add logo URL to settings
                },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Also store logo at root level for easy access
            if (logoUrl) {
                updatedData.logoUrl = logoUrl;
            }

            try {
                // Update both restaurant and user docs
                await Promise.all([
                    db.collection('restaurants').doc(user.uid).set(updatedData, { merge: true }),
                    db.collection('users').doc(user.uid).update({
                        name: ownerName,
                        phone: ownerPhone
                    })
                ]);
                
                showNotification('All settings updated successfully', 'success');
                const navName = document.getElementById('restaurantName');
                if (navName) navName.textContent = updatedData.name;
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (getVal('newPassword') !== getVal('confirmPassword')) {
                return showNotification('Passwords do not match', 'error');
            }
            pendingAction = 'password';
            openReauthModal();
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            pendingAction = 'delete';
            openReauthModal();
        });
    }

    if (reauthForm) {
        reauthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = getVal('reauthPassword');
            const user = auth.currentUser;
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
            
            try {
                await user.reauthenticateWithCredential(credential);
                if (pendingAction === 'password') {
                    await user.updatePassword(getVal('newPassword'));
                    showNotification('Password updated!', 'success');
                    passwordForm.reset();
                } else if (pendingAction === 'delete') {
                    await db.collection('restaurants').doc(user.uid).delete();
                    await db.collection('users').doc(user.uid).delete();
                    await user.delete();
                    window.location.href = 'index.html';
                }
                closeReauthModal();
            } catch (error) {
                showNotification('Auth failed: ' + error.message, 'error');
            }
        });
    }

    function openReauthModal() { 
        const modal = document.getElementById('reauthModal');
        if (modal) modal.classList.remove('hidden'); 
    }
    
    window.closeReauthModal = function() { 
        const modal = document.getElementById('reauthModal');
        if (modal) modal.classList.add('hidden');
        if (reauthForm) reauthForm.reset();
        pendingAction = null;
    };

    function showNotification(message, type) {
        const n = document.createElement('div');
        n.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-[9999] text-white text-sm font-medium transition-all duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
        n.textContent = message;
        document.body.appendChild(n);
        setTimeout(() => {
            n.style.opacity = '0';
            n.style.transform = 'translateY(-20px)';
            setTimeout(() => n.remove(), 300);
        }, 3000);
    }
});
