import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnthropicMessages } from '../../agent-core/adapters/anthropic.js';

test('Anthropic adapter groups consecutive tool results into one user message', () => {
    const messages = buildAnthropicMessages([
        { role: 'user', content: 'read two files' },
        {
            role: 'assistant',
            content: 'I will read them.',
            providerPayload: {
                anthropicContent: [
                    { type: 'text', text: 'I will read them.' },
                    { type: 'tool_use', id: 'call-1', name: 'Read', input: { filePath: 'book/one.md' } },
                    { type: 'tool_use', id: 'call-2', name: 'Read', input: { filePath: 'book/two.md' } },
                ],
            },
            tool_calls: [
                {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'Read', arguments: '{"filePath":"book/one.md"}' },
                },
                {
                    id: 'call-2',
                    type: 'function',
                    function: { name: 'Read', arguments: '{"filePath":"book/two.md"}' },
                },
            ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true,"content":"one"}' },
        { role: 'tool', tool_call_id: 'call-2', content: '{"ok":true,"content":"two"}' },
    ]);

    assert.equal(messages.length, 3);
    assert.equal(messages[1].role, 'assistant');
    assert.equal(messages[1].content.filter((block) => block.type === 'tool_use').length, 2);
    assert.deepEqual(messages[2], {
        role: 'user',
        content: [
            { type: 'tool_result', tool_use_id: 'call-1', content: '{"ok":true,"content":"one"}' },
            { type: 'tool_result', tool_use_id: 'call-2', content: '{"ok":true,"content":"two"}' },
        ],
    });
});

test('Anthropic adapter keeps a single tool result immediately after the tool use message', () => {
    const messages = buildAnthropicMessages([
        { role: 'user', content: 'read file' },
        {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: { name: 'Read', arguments: '{"filePath":"book/one.md"}' },
            }],
        },
        { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true,"content":"one"}' },
        { role: 'assistant', content: 'Done.' },
    ]);

    assert.equal(messages.length, 4);
    assert.equal(messages[1].role, 'assistant');
    assert.equal(messages[2].role, 'user');
    assert.deepEqual(messages[2].content, [
        { type: 'tool_result', tool_use_id: 'call-1', content: '{"ok":true,"content":"one"}' },
    ]);
    assert.equal(messages[3].content[0].text, 'Done.');
});
