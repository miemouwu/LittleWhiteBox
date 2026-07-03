import test from 'node:test';
import assert from 'node:assert/strict';

test('TT log sink forwards LittleWhiteBox diagnostics without touching plugin storage', async () => {
    const { writeTtMobileLog, isTtMobileLogAvailable } = await import(`../core/tt-log-sink.js?test=${Date.now()}`);
    const calls = [];

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('localStorage should not be touched');
        },
    });
    Object.defineProperty(globalThis, 'chat_metadata', {
        configurable: true,
        get() {
            throw new Error('chat_metadata should not be touched');
        },
    });

    globalThis.window = {
        __TAURITAVERN__: {
            api: {
                dev: {
                    mobile: {
                        async logEntry(entry) {
                            calls.push(entry);
                            return { ok: true, timestampMs: 123 };
                        },
                    },
                },
            },
        },
    };

    assert.equal(isTtMobileLogAvailable(), true);
    const result = await writeTtMobileLog({
        level: 'warn',
        event: 'lwb.l0.failure',
        detail: { floor: 5, attempts: 2, reason: 'L0 API 429' },
    });

    assert.deepEqual(result, { ok: true, timestampMs: 123 });
    assert.deepEqual(calls, [{
        source: 'LittleWhiteBox',
        level: 'warn',
        event: 'lwb.l0.failure',
        detail: { floor: 5, attempts: 2, reason: 'L0 API 429' },
    }]);
});

test('TT log sink is a safe no-op when TauriTavern debug API is unavailable', async () => {
    const { writeTtMobileLog, isTtMobileLogAvailable } = await import(`../core/tt-log-sink.js?test=noop-${Date.now()}`);
    delete globalThis.window;

    assert.equal(isTtMobileLogAvailable(), false);
    const result = await writeTtMobileLog({
        level: 'info',
        event: 'lwb.ready',
        detail: { ok: true },
    });

    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});
