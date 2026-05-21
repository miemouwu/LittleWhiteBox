import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_JSAPI_PERMISSION,
    normalizeAgentConfig,
    normalizeAgentSettings,
} from '../../agent-core/config.js';

test('assistant settings default jsApiPermission to deny', () => {
    const settings = normalizeAgentSettings({});
    const config = normalizeAgentConfig({});

    assert.equal(settings.jsApiPermission, DEFAULT_JSAPI_PERMISSION);
    assert.equal(config.jsApiPermission, DEFAULT_JSAPI_PERMISSION);
});

test('assistant config preserves explicit jsApiPermission', () => {
    const settings = normalizeAgentSettings({
        jsApiPermission: 'allow',
    });
    const config = normalizeAgentConfig({
        jsApiPermission: 'allow',
    });

    assert.equal(settings.jsApiPermission, 'allow');
    assert.equal(config.jsApiPermission, 'allow');
});
