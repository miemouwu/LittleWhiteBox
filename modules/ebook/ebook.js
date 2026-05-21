import { extensionFolderPath } from '../../core/constants.js';
import { isTrustedMessage, postToIframe } from '../../core/iframe-messaging.js';
import { buildEbookFrameConfig, saveEbookAgentConfig } from './host/assistant-config.js';
import { buildImportMaterial } from './host/import-materials.js';

const SOURCE_HOST = 'xb-ebook-host';
const SOURCE_APP = 'xb-ebook-app';
const OVERLAY_ID = 'xiaobaix-ebook-overlay';
const IFRAME_ID = 'xiaobaix-ebook-iframe';
const HTML_PATH = `${extensionFolderPath}/modules/ebook/ebook.html`;

let frameReady = false;
let pendingMessages = [];
let messageHandlerInstalled = false;
let pendingOpenSettings = false;

function getIframe() {
    return document.getElementById(IFRAME_ID);
}

function postToFrame(type, payload = {}) {
    const iframe = getIframe();
    if (!iframe?.contentWindow) return false;
    const message = { type, payload };
    if (!frameReady) {
        pendingMessages.push(message);
        return false;
    }
    return postToIframe(iframe, message, SOURCE_HOST);
}

function flushPendingMessages() {
    if (!frameReady) return;
    const iframe = getIframe();
    if (!iframe?.contentWindow) return;
    pendingMessages.forEach((message) => postToIframe(iframe, message, SOURCE_HOST));
    pendingMessages = [];
}

async function sendConfigToFrame() {
    postToFrame('xb-ebook:config', await buildEbookFrameConfig());
}

function revealEbookSettings() {
    if (!frameReady) return false;
    postToFrame('xb-ebook:open-settings', {});
    pendingOpenSettings = false;
    return true;
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        box-sizing: border-box;
        background: #fff9ed;
    `;

    const shell = document.createElement('div');
    shell.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 0;
        border-radius: 0;
        overflow: hidden;
        box-shadow: none;
        border: none;
        background: #fff9ed;
    `;

    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = HTML_PATH;
    iframe.style.cssText = `
        display: block;
        width: 100%;
        height: 100%;
        border: none;
        background: transparent;
    `;

    shell.appendChild(iframe);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);
    return overlay;
}

function openEbook() {
    pendingOpenSettings = false;
    if (document.getElementById(OVERLAY_ID)) return;
    frameReady = false;
    pendingMessages = [];
    createOverlay();
    installMessageHandler();
}

function openEbookSettings() {
    pendingOpenSettings = true;
    if (!document.getElementById(OVERLAY_ID)) {
        frameReady = false;
        pendingMessages = [];
        createOverlay();
        installMessageHandler();
    }
    if (frameReady) {
        revealEbookSettings();
    }
}

function closeEbook() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    frameReady = false;
    pendingMessages = [];
    pendingOpenSettings = false;
}

function replyHostResult(requestId = '', payload = {}) {
    postToFrame('xb-ebook:host-result', {
        requestId,
        ...payload,
    });
}

async function handleImportMaterial(payload = {}) {
    const requestId = String(payload.requestId || '');
    try {
        const material = await buildImportMaterial(payload.kind);
        replyHostResult(requestId, {
            ok: true,
            ...material,
        });
    } catch (error) {
        replyHostResult(requestId, {
            ok: false,
            error: error?.message || String(error || 'import_failed'),
        });
    }
}

async function handleSaveConfig(payload = {}) {
    const requestId = String(payload.requestId || '');
    const result = await saveEbookAgentConfig(payload, { silent: false });
    if (result.ok) {
        window.xiaobaixAssistant?.refreshConfig?.();
        replyHostResult(requestId, {
            ok: true,
            config: result.config,
        });
        return;
    }
    replyHostResult(requestId, {
        ok: false,
        error: result.error || 'save_config_failed',
        config: result.config,
    });
}

function handleFrameMessage(event) {
    const iframe = getIframe();
    if (!isTrustedMessage(event, iframe, SOURCE_APP)) return;
    const data = event.data || {};
    const payload = data.payload || {};
    switch (data.type) {
        case 'xb-ebook:frame-ready':
            frameReady = true;
            void sendConfigToFrame().then(() => {
                flushPendingMessages();
                if (pendingOpenSettings) {
                    revealEbookSettings();
                }
            });
            break;
        case 'xb-ebook:close':
            closeEbook();
            break;
        case 'xb-ebook:import-material':
            void handleImportMaterial(payload);
            break;
        case 'xb-ebook:save-config':
            void handleSaveConfig(payload);
            break;
        default:
            break;
    }
}

function installMessageHandler() {
    if (messageHandlerInstalled) return;
    // Guarded by isTrustedMessage in handleFrameMessage.
    // eslint-disable-next-line no-restricted-syntax
    window.addEventListener('message', handleFrameMessage);
    messageHandlerInstalled = true;
}

export async function initEbook() {
    installMessageHandler();
    window.xiaobaixEbook = {
        open: openEbook,
        openSettings: openEbookSettings,
        refreshConfig: () => void sendConfigToFrame(),
        close: closeEbook,
    };
}

export function cleanupEbook() {
    closeEbook();
}

export { openEbook, closeEbook };
