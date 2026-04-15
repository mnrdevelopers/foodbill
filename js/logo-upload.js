// js/logo-upload.js - Logo upload using ImgBB
let imgbbApiKey = null;
const LOGO_MAX_SIZE = 50 * 1024; // 50KB for logos (smaller)
const LOGO_QUALITY = 0.8; // 80% quality for logos
const LOGO_MAX_WIDTH = 150; // Smaller width
const LOGO_MAX_HEIGHT = 100; // Smaller height (for horizontal logos)

// Initialize ImgBB API key
async function initImgBB() {
    try {
        // Try to get from Firebase Remote Config
        if (typeof firebase !== 'undefined' && firebase.remoteConfig) {
            await firebase.remoteConfig().fetchAndActivate();
            imgbbApiKey = firebase.remoteConfig().getString('imgbb_api_key');
        }
        
        // If not available via Remote Config, try to get from a secure endpoint
        if (!imgbbApiKey) {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                imgbbApiKey = config.imgbbApiKey;
            }
        }
        
        console.log('ImgBB initialized for logo upload:', imgbbApiKey ? 'Key loaded' : 'No key');
    } catch (error) {
        console.error('Failed to load ImgBB API key:', error);
    }
}

// Compress logo image
async function compressLogoImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions maintaining aspect ratio - smaller size
                const maxWidth = LOGO_MAX_WIDTH;
                const maxHeight = LOGO_MAX_HEIGHT;
                
                if (width > height) {
                    // Landscape image
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    // Portrait or square image
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                
                // Ensure minimum dimensions
                width = Math.max(width, 80);
                height = Math.max(height, 60);
                
                console.log(`Logo resized to: ${width}x${height}`);
                
                // Set canvas dimensions
                canvas.width = width;
                canvas.height = height;
                
                // Draw with white background
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                
                // Draw logo with smooth scaling
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to WebP for better compression
                let format = 'image/jpeg';
                let quality = LOGO_QUALITY;
                
                // Try WebP first, fallback to JPEG
                if (canvas.toDataURL('image/webp').includes('webp')) {
                    format = 'image/webp';
                }
                
                const compressedDataUrl = canvas.toDataURL(format, quality);
                
                // Convert data URL to Blob
                const byteString = atob(compressedDataUrl.split(',')[1]);
                const mimeString = format;
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                
                const compressedBlob = new Blob([ab], { type: mimeString });
                
                // Create compressed file
                const compressedFile = new File([compressedBlob], 'logo.' + (format === 'image/webp' ? 'webp' : 'jpg'), {
                    type: mimeString,
                    lastModified: Date.now()
                });
                
                console.log(`Logo compressed: ${(file.size / 1024).toFixed(2)}KB -> ${(compressedFile.size / 1024).toFixed(2)}KB`);
                
                resolve({
                    file: compressedFile,
                    originalSize: file.size,
                    compressedSize: compressedFile.size,
                    width: width,
                    height: height,
                    dataUrl: compressedDataUrl,
                    format: format
                });
            };
            
            img.onerror = reject;
        };
        
        reader.onerror = reject;
    });
}

// Upload logo to ImgBB
async function uploadLogoToImgBB(file) {
    if (!imgbbApiKey) {
        await initImgBB();
        if (!imgbbApiKey) {
            throw new Error('Image upload service not configured. Please contact administrator.');
        }
    }

    // Get UI elements
    const progressBar = document.getElementById('logoUploadProgress');
    const uploadStatus = document.getElementById('logoUploadStatus');
    const progressContainer = document.getElementById('logoProgressSection');
    
    // Show progress
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
    }
    
    if (uploadStatus) {
        uploadStatus.textContent = 'Compressing logo...';
    }

    // Compress logo first
    let compressed;
    try {
        compressed = await compressLogoImage(file);
        
        // Update status
        if (uploadStatus) {
            uploadStatus.textContent = 'Uploading...';
        }
        
        // Show preview
        const logoPreview = document.getElementById('logoPreview');
        if (logoPreview && compressed.dataUrl) {
            logoPreview.src = compressed.dataUrl;
        }
        
    } catch (error) {
        console.error('Logo compression error:', error);
        compressed = { file: file, compressedSize: file.size, originalSize: file.size };
    }

    // Prepare for upload
    const formData = new FormData();
    formData.append('image', compressed.file);
    
    if (uploadStatus) {
        uploadStatus.textContent = 'Uploading... 0%';
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                
                // Update progress bar
                if (progressBar) {
                    progressBar.style.width = `${percentComplete}%`;
                }
                
                // Update status text
                if (uploadStatus) {
                    uploadStatus.textContent = `Uploading... ${Math.round(percentComplete)}%`;
                }
            }
        };
        
        xhr.onload = () => {
            // Hide progress container
            if (progressContainer) {
                setTimeout(() => {
                    progressContainer.classList.add('hidden');
                }, 1000);
            }
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        // Update final status
                        if (uploadStatus) {
                            uploadStatus.textContent = 'Upload complete!';
                            uploadStatus.className = 'text-xs text-green-600 mt-1 text-center';
                        }
                        
                        console.log('Logo uploaded successfully:', {
                            size: (compressed.compressedSize / 1024).toFixed(2) + 'KB',
                            dimensions: `${compressed.width}x${compressed.height}`,
                            url: response.data.url
                        });
                        
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error?.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid response from server'));
                }
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        };
        
        xhr.onerror = () => {
            if (progressContainer) {
                progressContainer.classList.add('hidden');
            }
            
            if (uploadStatus) {
                uploadStatus.textContent = 'Upload failed - Network error';
                uploadStatus.className = 'text-xs text-red-600 mt-1 text-center';
            }
            
            reject(new Error('Network error occurred'));
        };
        
        xhr.open('POST', `https://api.imgbb.com/1/upload?key=${imgbbApiKey}`);
        xhr.send(formData);
    });
}

// Setup logo upload UI
function setupLogoUpload() {
    const uploadArea = document.getElementById('logoUploadArea');
    const fileInput = document.getElementById('logoImageInput');
    const uploadContent = document.getElementById('logoUploadContent');
    const previewContainer = document.getElementById('logoPreviewContainer');
    const logoPreview = document.getElementById('logoPreview');
    const removeLogoBtn = document.getElementById('removeLogo');
    const logoUrlInput = document.getElementById('restaurantLogoUrl');
    
    if (!uploadArea || !fileInput) return;
    
    // Click to upload
    uploadArea.addEventListener('click', (e) => {
        if (!e.target.closest('#removeLogo')) {
            fileInput.click();
        }
    });
    
    // File input change
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validate file
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showLogoNotification('Please upload a valid image file (JPG, PNG, SVG, WebP)', 'error');
            return;
        }
        
        // Check file size (limit to 5MB original)
        if (file.size > 5 * 1024 * 1024) {
            showLogoNotification('Logo size must be less than 5MB. The logo will be compressed.', 'warning');
        }
        
        // Show preview of original
        const reader = new FileReader();
        reader.onload = (e) => {
            if (logoPreview) {
                logoPreview.src = e.target.result;
            }
            if (uploadContent && previewContainer) {
                uploadContent.classList.add('hidden');
                previewContainer.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(file);
        
        try {
            // Upload and compress
            const result = await uploadLogoToImgBB(file);
            
            // Store the logo URL
            if (logoUrlInput) {
                logoUrlInput.value = result.url;
                logoUrlInput.setAttribute('data-thumb', result.thumb?.url || result.url);
                logoUrlInput.setAttribute('data-delete', result.delete_url || '');
            }
            
            showLogoNotification(`Logo uploaded (${(result.size || 0) / 1024}KB)`, 'success');
            
        } catch (error) {
            console.error('Logo upload error:', error);
            showLogoNotification(`Upload failed: ${error.message}`, 'error');
            resetLogoUpload();
        }
    });
    
    // Remove logo
    if (removeLogoBtn) {
        removeLogoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetLogoUpload();
        });
    }
}

// Reset logo upload UI
function resetLogoUpload() {
    const fileInput = document.getElementById('logoImageInput');
    const uploadContent = document.getElementById('logoUploadContent');
    const previewContainer = document.getElementById('logoPreviewContainer');
    const logoPreview = document.getElementById('logoPreview');
    const logoUrlInput = document.getElementById('restaurantLogoUrl');
    
    if (fileInput) fileInput.value = '';
    if (logoPreview) logoPreview.src = '';
    if (uploadContent) uploadContent.classList.remove('hidden');
    if (previewContainer) previewContainer.classList.add('hidden');
    if (logoUrlInput) {
        logoUrlInput.value = '';
        logoUrlInput.removeAttribute('data-thumb');
        logoUrlInput.removeAttribute('data-delete');
    }
    
    const progressContainer = document.getElementById('logoProgressSection');
    if (progressContainer) progressContainer.classList.add('hidden');
}

// Set existing logo for editing
function setLogoForEdit(logoUrl) {
    const uploadContent = document.getElementById('logoUploadContent');
    const previewContainer = document.getElementById('logoPreviewContainer');
    const logoPreview = document.getElementById('logoPreview');
    const logoUrlInput = document.getElementById('restaurantLogoUrl');
    
    if (logoUrl) {
        if (logoUrlInput) {
            logoUrlInput.value = logoUrl;
            logoUrlInput.setAttribute('data-thumb', logoUrl);
        }
        
        if (logoPreview) logoPreview.src = logoUrl;
        if (uploadContent) uploadContent.classList.add('hidden');
        if (previewContainer) previewContainer.classList.remove('hidden');
    } else {
        resetLogoUpload();
    }
}

// Get uploaded logo
function getUploadedLogo() {
    const logoUrlInput = document.getElementById('restaurantLogoUrl');
    return logoUrlInput ? {
        url: logoUrlInput.value,
        thumb: logoUrlInput.getAttribute('data-thumb') || logoUrlInput.value,
        deleteUrl: logoUrlInput.getAttribute('data-delete') || ''
    } : null;
}

// Show notification for logo upload
function showLogoNotification(message, type) {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 text-white text-sm font-medium transition-all duration-300 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        n.style.transform = 'translateY(-20px)';
        setTimeout(() => n.remove(), 300);
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupLogoUpload();
    initImgBB();
});

// Export functions
window.LogoUpload = {
    uploadLogoToImgBB,
    getUploadedLogo,
    setLogoForEdit,
    resetLogoUpload,
    compressLogoImage
};
