const MESSAGE_INLINE_INTERACTIVE_SELECTOR = [
    'summary',
    'details',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    'a',
    '[role="button"]',
    '[contenteditable="true"]',
    '.xiaobaix-iframe-wrapper',
    '.xiaobaix-iframe',
].join(', ');

const GUARDED_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click'];

export function shouldStopMessageEditPropagation(target) {
    return !!target?.closest?.(MESSAGE_INLINE_INTERACTIVE_SELECTOR);
}

function stopMessageEditPropagation(event) {
    if (!shouldStopMessageEditPropagation(event?.target)) return;
    event.stopPropagation?.();
}

export function protectMessageInlineInteractions(messageElement) {
    if (!messageElement || messageElement.dataset?.xbInteractionGuardBound === 'true') return;
    messageElement.dataset.xbInteractionGuardBound = 'true';
    for (const type of GUARDED_EVENTS) {
        messageElement.addEventListener(type, stopMessageEditPropagation, { passive: true });
    }
}
