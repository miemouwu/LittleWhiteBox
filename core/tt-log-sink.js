const DEFAULT_SOURCE = 'LittleWhiteBox';

function getTtMobileLogApi() {
    try {
        const host = globalThis.window?.__TAURITAVERN__;
        const logEntry = host?.api?.dev?.mobile?.logEntry;
        return typeof logEntry === 'function' ? logEntry.bind(host.api.dev.mobile) : null;
    } catch {
        return null;
    }
}

export function isTtMobileLogAvailable() {
    return !!getTtMobileLogApi();
}

export async function writeTtMobileLog(entry = {}) {
    const logEntry = getTtMobileLogApi();
    if (!logEntry) {
        return { ok: false, reason: 'unavailable' };
    }

    try {
        return await logEntry({
            source: DEFAULT_SOURCE,
            level: entry.level || 'info',
            event: entry.event || 'event',
            detail: entry.detail ?? null,
        });
    } catch (error) {
        return {
            ok: false,
            reason: String(error?.message || error || 'failed').slice(0, 160),
        };
    }
}
