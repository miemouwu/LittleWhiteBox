import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVectorMaintenanceAfterRun } from './vector-maintenance-policy.js';

test('continues automatic vector maintenance when capped L0 backfill leaves pending floors', () => {
    const decision = resolveVectorMaintenanceAfterRun({
        l0Pending: 221,
        l0RetryableFail: 0,
        l1Pending: 0,
    });

    assert.equal(decision.hasL0Work, true);
    assert.equal(decision.hasL1Work, false);
    assert.equal(decision.shouldContinue, true);
    assert.equal(decision.shouldClearQueue, false);
});

test('continues automatic vector maintenance when retryable L0 failures remain', () => {
    const decision = resolveVectorMaintenanceAfterRun({
        l0Pending: 0,
        l0RetryableFail: 2,
        l1Pending: 0,
    });

    assert.equal(decision.hasL0Work, true);
    assert.equal(decision.shouldContinue, true);
});

test('clears vector maintenance queue when no L0 or L1 work remains', () => {
    const decision = resolveVectorMaintenanceAfterRun({
        l0Pending: 0,
        l0RetryableFail: 0,
        l1Pending: 0,
    });

    assert.equal(decision.hasL0Work, false);
    assert.equal(decision.hasL1Work, false);
    assert.equal(decision.shouldContinue, false);
    assert.equal(decision.shouldClearQueue, true);
});
