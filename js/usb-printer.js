// WebUSB ESC/POS helper for direct thermal printing from Chromium PWAs.
(function () {
    const USB_PRINTER_FILTERS = [
        { classCode: 7 },
        { classCode: 255 }
    ];

    function isSupported() {
        return window.isSecureContext && typeof navigator !== 'undefined' && !!navigator.usb;
    }

    function hasSavedPrinter(settings = {}) {
        return !!(
            settings.usbVendorId ||
            settings.usbProductId ||
            settings.usbSerialNumber ||
            settings.usbProductName
        );
    }

    function matchesSavedPrinter(device, settings = {}) {
        if (!device || !settings) return false;

        const vendorId = Number(settings.usbVendorId) || null;
        const productId = Number(settings.usbProductId) || null;
        const serialNumber = settings.usbSerialNumber || '';

        if (serialNumber && device.serialNumber) {
            return device.serialNumber === serialNumber;
        }

        if (vendorId && device.vendorId !== vendorId) return false;
        if (productId && device.productId !== productId) return false;

        return !!(vendorId || productId);
    }

    function getPreferredMode(settings = {}) {
        return settings.printingMode || 'auto';
    }

    function shouldAttemptUsb(settings = {}) {
        const mode = getPreferredMode(settings);
        if (mode === 'usb') return true;
        if (mode === 'auto') return isSupported() && hasSavedPrinter(settings);
        return false;
    }

    function sanitizeForEscPos(text) {
        const replacements = {
            '\u2018': "'",
            '\u2019': "'",
            '\u201C': '"',
            '\u201D': '"',
            '\u2013': '-',
            '\u2014': '-',
            '\u2026': '...',
            '\u20B9': 'Rs.'
        };

        return String(text || '')
            .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20B9]/g, char => replacements[char] || char)
            .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
    }

    function buildPayload(text, options = {}) {
        const encoder = new TextEncoder();
        const sanitizedText = sanitizeForEscPos(text).replace(/\r\n/g, '\n');
        const init = options.initialize === false ? [] : [0x1B, 0x40];
        const feedLines = Number.isInteger(options.feedLines) ? options.feedLines : 4;
        const tail = [];

        for (let i = 0; i < feedLines; i += 1) {
            tail.push(0x0A);
        }

        if (options.cut !== false) {
            tail.push(0x1D, 0x56, 0x00);
        }

        return new Uint8Array([
            ...init,
            ...encoder.encode(sanitizedText),
            ...tail
        ]);
    }

    async function requestDevice() {
        if (!isSupported()) {
            throw new Error('WebUSB is only available in a secure Chromium-based browser or installed PWA.');
        }

        return navigator.usb.requestDevice({ filters: USB_PRINTER_FILTERS });
    }

    async function getAuthorizedDevice(settings = {}, options = {}) {
        if (!isSupported()) {
            throw new Error('USB printing is not supported on this device/browser.');
        }

        const devices = await navigator.usb.getDevices();
        let device = devices.find(candidate => matchesSavedPrinter(candidate, settings));

        if (!device && devices.length === 1 && !hasSavedPrinter(settings)) {
            device = devices[0];
        }

        if (!device && options.requestIfNeeded) {
            device = await requestDevice();
        }

        if (!device) {
            throw new Error('No authorized USB printer found. Pair it in Settings first.');
        }

        return device;
    }

    function getDeviceMeta(device) {
        return {
            usbVendorId: device?.vendorId || '',
            usbProductId: device?.productId || '',
            usbSerialNumber: device?.serialNumber || '',
            usbManufacturerName: device?.manufacturerName || '',
            usbProductName: device?.productName || ''
        };
    }

    async function openClaimedDevice(device) {
        if (!device.opened) {
            await device.open();
        }

        if (!device.configuration) {
            await device.selectConfiguration(1);
        }

        for (const iface of device.configuration.interfaces) {
            for (const alternate of iface.alternates) {
                const hasOutEndpoint = alternate.endpoints.some(endpoint => endpoint.direction === 'out');
                if (!hasOutEndpoint) continue;

                try {
                    if (iface.claimed !== true) {
                        await device.claimInterface(iface.interfaceNumber);
                    }
                } catch (error) {
                    continue;
                }

                const currentAlternate = iface.alternate ? iface.alternate.alternateSetting : alternate.alternateSetting;
                if (alternate.alternateSetting !== currentAlternate) {
                    try {
                        await device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
                    } catch (error) {
                        // Keep the current alternate if the browser/device rejects switching.
                    }
                }

                const outEndpoint = alternate.endpoints.find(endpoint => endpoint.direction === 'out');
                return {
                    interfaceNumber: iface.interfaceNumber,
                    endpointNumber: outEndpoint.endpointNumber
                };
            }
        }

        throw new Error('No writable USB interface was found on the selected printer.');
    }

    async function transferChunks(device, endpointNumber, payload, chunkSize = 64) {
        for (let offset = 0; offset < payload.length; offset += chunkSize) {
            const chunk = payload.slice(offset, offset + chunkSize);
            await device.transferOut(endpointNumber, chunk);
        }
    }

    async function safeClose(device) {
        if (device?.opened) {
            try {
                await device.close();
            } catch (error) {
                // Ignore close errors so printing success is not masked.
            }
        }
    }

    async function pairPrinter() {
        const device = await requestDevice();
        return getDeviceMeta(device);
    }

    async function printText(text, settings = {}, options = {}) {
        const device = await getAuthorizedDevice(settings, { requestIfNeeded: options.requestIfNeeded !== false });
        const payload = buildPayload(text, options);
        let connection;

        try {
            connection = await openClaimedDevice(device);
            await transferChunks(device, connection.endpointNumber, payload, options.chunkSize || 64);
        } finally {
            if (options.keepOpen !== true) {
                await safeClose(device);
            }
        }

        return {
            device: getDeviceMeta(device),
            connection
        };
    }

    window.UsbPrinter = {
        isSupported,
        hasSavedPrinter,
        matchesSavedPrinter,
        getPreferredMode,
        shouldAttemptUsb,
        sanitizeForEscPos,
        buildPayload,
        pairPrinter,
        requestDevice,
        getAuthorizedDevice,
        getDeviceMeta,
        printText
    };
})();
