function toNonNegativeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function resolveVectorMaintenanceAfterRun(status = {}) {
    const l0Pending = toNonNegativeNumber(status.l0Pending);
    const l0RetryableFail = toNonNegativeNumber(status.l0RetryableFail);
    const l1Pending = toNonNegativeNumber(status.l1Pending);

    const hasL0Work = l0Pending > 0 || l0RetryableFail > 0;
    const hasL1Work = l1Pending > 0;
    const shouldContinue = hasL0Work || hasL1Work;

    return {
        hasL0Work,
        hasL1Work,
        shouldContinue,
        shouldClearQueue: !shouldContinue,
    };
}
