import {
    normalizeToolCalls,
    normalizeThoughtBlocks,
} from './protocol.js';

export function createStreamingMessageController(deps) {
    const {
        state,
        render,
        persistSession = () => {},
        createRequestId = (prefix = 'tool') => `${prefix}-${Date.now()}`,
        filterThoughtsForCurrentTurn = normalizeThoughtBlocks,
    } = deps;

    let streamRenderScheduled = false;
    let lastStreamPersistAt = 0;

    function normalizeStreamingToolCalls(toolCalls) {
        return normalizeToolCalls(toolCalls, {
            fallbackPrefix: 'tool',
            createId: (index) => createRequestId(`tool-${index + 1}`),
        });
    }

    function scheduleStreamRender({ persist = false } = {}) {
        const now = Date.now();
        if (persist || now - lastStreamPersistAt >= 1500) {
            persistSession();
            lastStreamPersistAt = now;
        }
        if (streamRenderScheduled) return;
        streamRenderScheduled = true;
        const flush = () => {
            streamRenderScheduled = false;
            render();
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(flush);
            return;
        }
        setTimeout(flush, 16);
    }

    function createStreamingAssistantMessage() {
        const message = {
            role: 'assistant',
            content: '',
            thoughts: [],
            streaming: true,
        };
        state.messages.push(message);
        render();
        return message;
    }

    function updateStreamingAssistantMessage(message, patch = {}) {
        if (!message) return;
        if (typeof patch.content === 'string') {
            message.content = patch.content;
        }
        if (patch.providerPayload && typeof patch.providerPayload === 'object') {
            message.providerPayload = patch.providerPayload;
        }
        if (Array.isArray(patch.thoughts)) {
            message.thoughts = filterThoughtsForCurrentTurn(patch.thoughts, message);
        }
        if (Array.isArray(patch.toolCalls)) {
            message.toolCalls = normalizeStreamingToolCalls(patch.toolCalls);
        }
        if (typeof patch.streaming === 'boolean') {
            message.streaming = patch.streaming;
        }
    }

    function finalizeStreamingAssistantMessage(message, patch = {}) {
        if (!message) return;
        updateStreamingAssistantMessage(message, {
            ...patch,
            streaming: false,
        });
        scheduleStreamRender({ persist: true });
    }

    return {
        createStreamingAssistantMessage,
        finalizeStreamingAssistantMessage,
        normalizeToolCalls: normalizeStreamingToolCalls,
        scheduleStreamRender,
        updateStreamingAssistantMessage,
    };
}
