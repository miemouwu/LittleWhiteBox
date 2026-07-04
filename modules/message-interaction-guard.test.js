import test from 'node:test';
import assert from 'node:assert/strict';

import {
    cleanupMessageInteractionCaptureGuard,
    installMessageInteractionCaptureGuard,
    shouldStopMessageEditPropagation,
} from './message-interaction-guard.js';

function targetMatching(...selectors) {
    return {
        closest(query) {
            return query.split(',').map(s => s.trim()).some(selector => selectors.includes(selector))
                ? { matches: selectors[0] }
                : null;
        },
    };
}

test('message interaction guard stops native details summary clicks from opening host message edit', () => {
    assert.equal(shouldStopMessageEditPropagation(targetMatching('summary')), true);
    assert.equal(shouldStopMessageEditPropagation(targetMatching('details')), true);
});

test('message interaction guard stops form control clicks but leaves plain message text alone', () => {
    assert.equal(shouldStopMessageEditPropagation(targetMatching('button')), true);
    assert.equal(shouldStopMessageEditPropagation(targetMatching('textarea')), true);
    assert.equal(shouldStopMessageEditPropagation(targetMatching('.plain-message-text')), false);
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
    };
}

function makeEvent(target) {
    const calls = { stopPropagation: 0, stopImmediatePropagation: 0 };
    return {
        target,
        calls,
        stopPropagation() {
            calls.stopPropagation++;
        },
        stopImmediatePropagation() {
            calls.stopImmediatePropagation++;
        },
    };
}

test('message interaction capture guard stops summary taps before host message edit handlers', () => {
    cleanupMessageInteractionCaptureGuard();
    const win = makeEventRoot();
    const doc = makeEventRoot();
    installMessageInteractionCaptureGuard({ win, doc });

    const pointerdown = win.listeners.find(item => item.type === 'pointerdown');
    assert.equal(pointerdown?.options?.capture, true);
    const messageSummaryEvent = makeEvent(targetMatching('summary', '.mes_text'));
    pointerdown.handler(messageSummaryEvent);
    assert.equal(messageSummaryEvent.calls.stopPropagation, 1);
    assert.equal(messageSummaryEvent.calls.stopImmediatePropagation, 1);

    const settingsSummaryEvent = makeEvent(targetMatching('summary'));
    pointerdown.handler(settingsSummaryEvent);
    assert.equal(settingsSummaryEvent.calls.stopPropagation, 0);

    cleanupMessageInteractionCaptureGuard();
    assert.equal(win.listeners.length, 0);
    assert.equal(doc.listeners.length, 0);
});
