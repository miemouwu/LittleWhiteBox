let lastExtractionInput = null;

export function resetExtractionShim() {
    lastExtractionInput = null;
}

export function getLastExtractionInput() {
    return lastExtractionInput;
}

export function cancelBatchExtraction() {}

export function resetBatchExtractionCancel() {}

export async function extractAtomsForRound(userMsg, aiMsg, floor) {
    lastExtractionInput = {
        floor,
        user: userMsg?.mes || null,
        ai: aiMsg?.mes || null,
    };

    return [{
        atomId: `atom-${floor}-0`,
        floor,
        source: 'ai',
        semantic: `state atom for floor ${floor}`,
        edges: [{ s: '用户', t: '角色', r: '测试互动' }],
        where: '',
        quality: 1,
    }];
}
