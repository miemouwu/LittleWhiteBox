// ============================================================================
// host-history.js — 宿主历史访问兼容层（标准 SillyTavern + TauriTavern）
// ----------------------------------------------------------------------------
// 背景：TauriTavern 采用 windowed payload，getContext().chat 只含最近 N 条消息。
// 记忆/总结链路里凡是“读全量正文 / 读总楼层数”的地方都会被窗口截断。
//
// 本模块把这两件事收口成两端兼容的异步接口：
//   - getGlobalChatLength()      → 全局总楼层数（绝对，含被窗口排除的历史）
//   - getMessageRange(start,end) → 按【绝对索引】闭区间取消息（不受窗口边界影响）
//   - forEachMessage(cb, opts)   → 从尾部向前分页遍历全量历史（移动端友好）
//
// 标准 ST 下：直接走 getContext().chat（同步语义，立即 resolve）。
// TauriTavern 下：走 window.__TAURITAVERN__.api.chat 的 windowInfo()/history.*，
//                由 Rust 后端穿越窗口边界访问完整历史。
//
// ⚠️ 绝对索引约定：TauriTavern 全程使用绝对索引（windowInfo.totalCount /
//    history.*.startIndex / findLastMessage().index 均为 0-based 绝对索引），
//    与本扩展用 mesId(=楼层号=全局 chat 下标) 作主键的语义天然对齐，无需重映射。
// ============================================================================

import { getContext } from "../../../../../../extensions.js";

const PAGE_LIMIT = 200; // 单页拉取条数；移动端用 history.beforePages 可进一步降 IPC

// ---- 环境探测 --------------------------------------------------------------

export function isTauriTavern() {
    return typeof window !== "undefined" && !!window.__TAURITAVERN__;
}

function hostChatApi() {
    return window.__TAURITAVERN__?.api?.chat ?? null;
}

// 不缓存 handle：current.handle() 是轻量访问器，切换聊天后旧 handle 可能失效，
// 每次取最新的最稳妥。
async function getHandle() {
    if (!isTauriTavern()) return null;
    await (window.__TAURITAVERN__.ready ?? window.__TAURITAVERN_MAIN_READY__);
    const api = hostChatApi();
    return api?.current?.handle?.() ?? null;
}

// ---- 全局总楼层数 ----------------------------------------------------------

// 临时诊断：把真机 windowInfo() / 宿主 API 的真实结构弹出来一次，便于定位
// （确认无误后可移除）。
let _diagShown = false;
async function diagOnce() {
    if (_diagShown) return;
    _diagShown = true;
    const report = {};
    try {
        const tt = window.__TAURITAVERN__;
        report.ttKeys = tt ? Object.keys(tt) : null;
        report.apiKeys = tt?.api ? Object.keys(tt.api) : null;
        report.chatKeys = tt?.api?.chat ? Object.keys(tt.api.chat) : null;
        report.currentKeys = tt?.api?.chat?.current ? Object.keys(tt.api.chat.current) : null;
        report.windowInfo = await tt?.api?.chat?.current?.windowInfo?.();
    } catch (e) {
        report.error = String(e?.message || e);
    }
    const msg = "host-history 诊断: " + JSON.stringify(report);
    try { (globalThis.toastr || window.toastr)?.info?.(msg, "host-history", { timeOut: 30000 }); } catch { /* noop */ }
    try { console.warn("[host-history diag]", msg); } catch { /* noop */ }
}

/**
 * 返回全局总楼层数（绝对）。
 * 标准 ST：等于 getContext().chat.length。
 * TauriTavern：等于 windowInfo().totalCount（只要拿得到合法值，不依赖 mode 字段名）。
 * @returns {Promise<number>}
 */
export async function getGlobalChatLength() {
    if (!isTauriTavern()) {
        return getContext()?.chat?.length ?? 0;
    }
    diagOnce();
    try {
        const info = await hostChatApi()?.current?.windowInfo?.();
        // 不再依赖 info.mode 的具体字符串：只要 totalCount 是合法正数就用它。
        // 这样 mode 取值与文档不一致时也能正确拿到全局总数。
        const total = Number(info?.totalCount);
        if (Number.isFinite(total) && total > 0) {
            return total;
        }
        // 兜底：windowLength / 当前窗口长度
        const wlen = Number(info?.windowLength);
        if (Number.isFinite(wlen) && wlen > 0) return wlen;
        return getContext()?.chat?.length ?? 0;
    } catch {
        // 宿主 API 异常时退化为窗口长度，避免硬崩
        return getContext()?.chat?.length ?? 0;
    }
}

// ---- 按绝对索引区间取消息 --------------------------------------------------

/**
 * 取绝对索引闭区间 [start, end] 的消息。
 * 返回数组按区间对齐：result[0] 是绝对索引 start 的消息，依此类推；
 * 窗口/历史中确实缺失的位置为 undefined（与 chat.slice 的越界行为一致）。
 *
 * @param {number} start 绝对起始索引（含）
 * @param {number} end   绝对结束索引（含）
 * @returns {Promise<Array>}
 */
export async function getMessageRange(start, end) {
    start = Math.max(0, start | 0);
    end = end | 0;
    if (start > end) return [];

    if (!isTauriTavern()) {
        const chat = getContext()?.chat ?? [];
        return chat.slice(start, end + 1);
    }

    const handle = await getHandle();
    if (!handle?.history?.tail) {
        // 宿主无 history API（理论不应发生）→ 退化为窗口切片
        const chat = getContext()?.chat ?? [];
        return chat.slice(start, end + 1);
    }

    const out = new Array(end - start + 1);
    let filled = 0;

    // history.tail 拿最新一页，再用 before 向前翻，直到覆盖到 start 或没有更早消息。
    let page = await handle.history.tail({ limit: PAGE_LIMIT });
    while (page && Array.isArray(page.messages) && page.messages.length) {
        const pageStart = page.startIndex;
        const pageEnd = pageStart + page.messages.length - 1;

        const lo = Math.max(start, pageStart);
        const hi = Math.min(end, pageEnd);
        for (let abs = lo; abs <= hi; abs++) {
            out[abs - start] = page.messages[abs - pageStart];
            filled++;
        }

        // 已翻到比 start 更早，或已填满，或没有更早的历史 → 收工
        if (pageStart <= start || filled >= out.length || !page.hasMoreBefore) break;
        page = await handle.history.before(page, { limit: PAGE_LIMIT });
    }

    return out;
}

// ---- 从尾部向前分页遍历全量历史 --------------------------------------------

/**
 * 从最新消息向前分页遍历全部历史。回调按【从新到旧】的页序、页内从旧到新触发。
 * 适合“枚举所有 AI 楼层 / 统计”这类需要走全量但不必一次性载入的场景。
 *
 * @param {(msg: any, absIndex: number) => void | boolean} cb
 *        返回 false 可提前终止遍历。
 * @param {{ limit?: number, maxScan?: number }} [opts]
 *        limit: 单页条数；maxScan: 最多扫描多少条（保护移动端，0/未设=无上限）。
 */
export async function forEachMessage(cb, opts = {}) {
    const limit = opts.limit || PAGE_LIMIT;
    const maxScan = opts.maxScan || 0;
    let scanned = 0;

    if (!isTauriTavern()) {
        const chat = getContext()?.chat ?? [];
        for (let i = chat.length - 1; i >= 0; i--) {
            if (cb(chat[i], i) === false) return;
            if (maxScan && ++scanned >= maxScan) return;
        }
        return;
    }

    const handle = await getHandle();
    if (!handle?.history?.tail) {
        const chat = getContext()?.chat ?? [];
        for (let i = chat.length - 1; i >= 0; i--) {
            if (cb(chat[i], i) === false) return;
            if (maxScan && ++scanned >= maxScan) return;
        }
        return;
    }

    let page = await handle.history.tail({ limit });
    while (page && Array.isArray(page.messages) && page.messages.length) {
        for (let i = 0; i < page.messages.length; i++) {
            const abs = page.startIndex + i;
            if (cb(page.messages[i], abs) === false) return;
            if (maxScan && ++scanned >= maxScan) return;
        }
        if (!page.hasMoreBefore) break;
        page = await handle.history.before(page, { limit });
    }
}
