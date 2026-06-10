// 最小 getContext shim：host-history.js 只依赖 getContext。
// esbuild 会把所有 `*/extensions.js` 导入重定向到本文件（见 run.mjs 的 alias 插件），
// 因此 host-history.js 与本测试入口共享同一份 ctx 状态。

let ctx = { chat: [], chatId: null, name1: '用户', name2: '角色' };

export let extension_settings = {};

export function getContext() {
    return ctx;
}

export function saveMetadataDebounced() {}

export function __setCtx(next) {
    ctx = { ...ctx, ...(next || {}) };
}
