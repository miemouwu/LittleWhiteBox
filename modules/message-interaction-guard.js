const MESSAGE_INLINE_INTERACTIVE_SELECTOR = [
    'summary',
    'details',
    '.xiaobaix-iframe-wrapper',
    '.xiaobaix-iframe',
].join(', ');

const GUARDED_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click'];
const EARLY_DETAILS_SELECTOR = 'summary, details';

let captureGuardTargets = [];

export function shouldStopMessageEditPropagation(target) {
    return !!target?.closest?.(MESSAGE_INLINE_INTERACTIVE_SELECTOR);
}

function isMessageDetailsInteraction(target) {
    return !!target?.closest?.('.mes_text') && !!target?.closest?.(EARLY_DETAILS_SELECTOR);
}

function stopMessageEditPropagation(event) {
    if (!shouldStopMessageEditPropagation(event?.target)) return;
    event.stopPropagation?.();
}

function stopMessageDetailsEditPropagationEarly(event) {
    if (!isMessageDetailsInteraction(event?.target)) return;
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
}

export function protectMessageInlineInteractions(messageElement) {
    if (!messageElement || messageElement.dataset?.xbInteractionGuardBound === 'true') return;
    messageElement.dataset.xbInteractionGuardBound = 'true';
    for (const type of GUARDED_EVENTS) {
        messageElement.addEventListener(type, stopMessageEditPropagation, { passive: true });
    }
}

export function installMessageInteractionCaptureGuard({
    win = typeof window !== 'undefined' ? window : null,
    doc = typeof document !== 'undefined' ? document : null,
} = {}) {
    if (captureGuardTargets.length) return;
    const targets = [win, doc].filter(Boolean);
    const options = { capture: true, passive: true };
    for (const target of targets) {
        for (const type of GUARDED_EVENTS) {
            target.addEventListener(type, stopMessageDetailsEditPropagationEarly, options);
            captureGuardTargets.push({ target, type, options });
        }
    }
}

export function cleanupMessageInteractionCaptureGuard() {
    for (const { target, type, options } of captureGuardTargets) {
        target.removeEventListener?.(type, stopMessageDetailsEditPropagationEarly, options);
    }
    captureGuardTargets = [];
}
