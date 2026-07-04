import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldStopMessageEditPropagation } from './message-interaction-guard.js';

function targetMatching(selector) {
    return {
        closest(query) {
            return query.split(',').map(s => s.trim()).includes(selector) ? { matches: selector } : null;
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
