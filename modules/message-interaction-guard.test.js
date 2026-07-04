import test from 'node:test';
import assert from 'node:assert/strict';

import {
    cleanupMessageInteractionCaptureGuard,
    installMessageInteractionCaptureGuard,
    shouldStopMessageEditPropagation,
} from './message-interaction-guard.js';

function targetWithAncestors(...selectors) {
    return {
        closest(query) {
            return query.split(',').map(s => s.trim()).some(selector => selectors.includes(selector))
                ? { matches: selectors[0] }
                : null;
        },
    };
}

test('message interaction guard stops native details summary clicks from opening host message edit', () => {
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('summary')), true);
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('details')), true);
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('span', 'summary', '.mes_text')), true);
});

test('message interaction guard leaves action buttons available for card generation flows', () => {
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('button')), false);
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('[role="button"]')), false);
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('a')), false);
    assert.equal(shouldStopMessageEditPropagation(targetWithAncestors('.plain-message-text')), false);
});

function makeEventRoot() {
    const listeners = [];
    return {
        listeners,
        addEventListener(type, handler, options) {
            listeners.push({ type, handler, options });
        },
        removeEventListener(type, handler, options) {
            const index = listeners.findIndex(item => item.type === type && item.handler === handler && item.options === options);
            if (index >= 0) listeners.splice(index, 1);
        },
        dispatch(type, event) {
            for (const item of listeners.filter(listener => listener.type === type)) {
                item.handler(event);
                if (event.immediateStopped) break;
            }
        },
    };
}

function makeEvent(target) {
    const calls = { stopPropagation: 0, stopImmediatePropagation: 0 };
    return {
        target,
        calls,
        immediateStopped: false,
        stopPropagation() {
            calls.stopPropagation++;
        },
        stopImmediatePropagation() {
            calls.stopImmediatePropagation++;
            this.immediateStopped = true;
        },
    };
}

test('message interaction capture guard stops summary taps before same-target host edit handlers', () => {
    cleanupMessageInteractionCaptureGuard();
    const win = makeEventRoot();
    const doc = makeEventRoot();
    installMessageInteractionCaptureGuard({ win, doc });
    let hostEditCalls = 0;
    win.addEventListener('pointerdown', () => { hostEditCalls++; }, { capture: true });

    const pointerdown = win.listeners.find(item => item.type === 'pointerdown');
    assert.equal(pointerdown?.options?.capture, true);
    const messageSummaryEvent = makeEvent(targetWithAncestors('summary', '.mes_text'));
    win.dispatch('pointerdown', messageSummaryEvent);
    assert.equal(messageSummaryEvent.calls.stopPropagation, 1);
    assert.equal(messageSummaryEvent.calls.stopImmediatePropagation, 1);
    assert.equal(hostEditCalls, 0);

    const settingsSummaryEvent = makeEvent(targetWithAncestors('summary'));
    win.dispatch('pointerdown', settingsSummaryEvent);
    assert.equal(settingsSummaryEvent.calls.stopPropagation, 0);
    assert.equal(hostEditCalls, 1);

    cleanupMessageInteractionCaptureGuard();
    assert.equal(win.listeners.length, 1);
    assert.equal(doc.listeners.length, 0);
});

test('message interaction capture guard does not block delegated action option buttons', () => {
    cleanupMessageInteractionCaptureGuard();
    const win = makeEventRoot();
    const doc = makeEventRoot();
    installMessageInteractionCaptureGuard({ win, doc });
    let cardActionCalls = 0;
    win.addEventListener('pointerdown', () => { cardActionCalls++; }, { capture: true });

    const actionButtonEvent = makeEvent(targetWithAncestors('button', '.mes_text'));
    win.dispatch('pointerdown', actionButtonEvent);
    assert.equal(actionButtonEvent.calls.stopPropagation, 0);
    assert.equal(actionButtonEvent.calls.stopImmediatePropagation, 0);
    assert.equal(cardActionCalls, 1);

    cleanupMessageInteractionCaptureGuard();
});
