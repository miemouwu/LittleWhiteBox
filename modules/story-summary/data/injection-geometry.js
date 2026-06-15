// ============================================================================
// injection-geometry.js — 记忆注入的「边界 / 深度」纯函数
// ----------------------------------------------------------------------------
// 抽出来单独成纯函数，是因为这两件事在 TauriTavern 窗口化下最易出错且最难就地测：
//
//   resolveInjectionBoundary  注入边界（取「向量楼层」与「已总结楼层」的较大者，
//                             保证向量滞后时记忆不旧于文本总结）
//   computeInjectionDepth     注入深度（从末尾往前数；必须用【全局】总楼层数，
//                             不能用被窗口截断的 getContext().chat.length）
//
// 约定：楼层号为 0-based 绝对索引；-1 表示「无」（无总结 / 无向量）。
// ============================================================================

/**
 * 解析记忆注入/隐藏边界。
 * - 关向量：用已总结楼层。
 * - 开向量：用「向量楼层」与「已总结楼层」的较大者——向量领先时跟向量，
 *   向量滞后（真机现象：lastChunkFloor 卡住而总结继续前进）时回落到总结，
 *   绝不让注入的记忆停留在比文本总结更旧的楼层。
 * @param {{ vectorEnabled: boolean, lastChunkFloor: number, lastSummarizedMesId: number }} args
 * @returns {number} 边界楼层（绝对索引），无可用边界时为 -1。
 */
export function resolveInjectionBoundary({ vectorEnabled, lastChunkFloor, lastSummarizedMesId }) {
    const summarized = Number.isFinite(lastSummarizedMesId) ? lastSummarizedMesId : -1;
    if (!vectorEnabled) {
        return summarized >= 0 ? summarized : -1;
    }
    const chunk = Number.isFinite(lastChunkFloor) ? lastChunkFloor : -1;
    const boundary = Math.max(chunk, summarized);
    return boundary >= 0 ? boundary : -1;
}

/**
 * 计算注入深度（IN_CHAT，从对话末尾往前数的条数）。
 *
 * depth 是「末尾相对」量：窗口与全量历史共享同一末楼，所以只要用【全局】总楼层数
 * 计算，无论生成时用的是窗口化 chat 还是全量 chat，记忆都会落在同一绝对位置
 * （边界楼层之后）。若用窗口长度计算，则 totalFloors 偏小、depth 被夹到 minDepth，
 * 记忆被错误地怼到对话最底部。
 *
 * 边界很旧（向量/总结尚未覆盖大量历史）时 depth 会大于窗口长度，宿主据此把记忆
 * 放到窗口顶端之上——这是正确的，因为其上的楼层都已被记忆覆盖。
 *
 * @param {{ totalFloors: number, boundary: number, minDepth: number }} args
 * @returns {number}
 */
export function computeInjectionDepth({ totalFloors, boundary, minDepth }) {
    const total = Number.isFinite(totalFloors) ? totalFloors : 0;
    const b = Number.isFinite(boundary) ? boundary : -1;
    const floor = Number.isFinite(minDepth) ? minDepth : 0;
    return Math.max(floor, total - b - 1);
}

/**
 * 把【全局楼层】隐藏区间换算成【窗口本地下标】区间。
 *
 * TauriTavern 窗口化下，getContext().chat 只含最近 windowLength 条消息，且 /hide、
 * /unhide、chat[i]、.mes[mesid] 全部走窗口本地下标（mesid==本地数组下标）。但 LWB 的
 * calcHideRange 给出的是全局楼层区间 [0, hideEnd]。若直接把全局区间喂给 /hide，本地下标
 * 0..hideEnd 会覆盖整个窗口，把最近楼层全部隐藏（真机 floor 65–124 消失即源于此）。
 *
 * windowStart = totalFloors - windowLength（窗口首楼的全局楼层号）。
 * 标准 ST 下 windowLength===totalFloors → windowStart=0 → 本地==全局（桌面端零回归）。
 *
 * @param {{ start: number, end: number } | null} globalRange calcHideRange 的全局区间
 * @param {number} totalFloors  全局总楼层数
 * @param {number} windowLength getContext().chat.length（窗口长度）
 * @returns {{ start: number, end: number } | null} 本地区间；窗口内无需隐藏时为 null
 */
export function toWindowLocalHideRange(globalRange, totalFloors, windowLength) {
    if (!globalRange) return null;
    const total = Number.isFinite(totalFloors) ? totalFloors : 0;
    const winLen = Number.isFinite(windowLength) ? windowLength : 0;
    if (winLen <= 0) return null;

    const windowStart = Math.max(0, total - winLen);
    const localEnd = globalRange.end - windowStart;
    // 整个隐藏区间都在窗口之前 → 窗口内全是要保留的近期楼层，无需隐藏。
    if (localEnd < 0) return null;

    const localStart = Math.max(0, globalRange.start - windowStart);
    const clampedEnd = Math.min(localEnd, winLen - 1);
    if (clampedEnd < localStart) return null;
    return { start: localStart, end: clampedEnd };
}

/**
 * 给出窗口内【每个本地下标应有的 is_system】，用于反「隐藏累积」。
 *
 * 生成时的隐藏过去是「只加不减」（只 set is_system=true），窗口滑动上百楼后旧的隐藏
 * 标记会把最近楼层也盖住，模型只剩旧内容 → 楼层漂移。修法是每次都按边界【对齐整个
 * 窗口】：本地下标 ≤ localRange.end 的隐藏，> end 的（最近 keep-visible 楼层）取消隐藏。
 * 调用方据此把 chat[i].is_system 双向同步（既补 hide，也还原最近楼层的可见）。
 *
 * @param {number} windowLength getContext().chat.length（窗口长度）
 * @param {{ start: number, end: number } | null} localRange 本地隐藏区间（来自 toWindowLocalHideRange）
 * @returns {boolean[]} 长度为 windowLength 的数组，true=应隐藏
 */
export function desiredWindowHideFlags(windowLength, localRange) {
    const n = Number.isFinite(windowLength) ? Math.max(0, windowLength) : 0;
    const flags = new Array(n).fill(false);
    if (!localRange) return flags;
    const start = Math.max(0, localRange.start | 0);
    const end = Math.min(n - 1, localRange.end | 0);
    for (let i = start; i <= end; i++) flags[i] = true;
    return flags;
}
