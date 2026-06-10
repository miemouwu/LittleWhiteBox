// 测试入口：re-export 被测的兼容层 + shim 的 ctx 设置器。
// entry 直接 import shim，host-history.js 经 esbuild alias 也指向同一个 shim 文件，
// 两者解析到同一绝对路径 → 共享模块状态。
export * from '../../modules/story-summary/compat/host-history.js';
export { __setCtx } from './shim-extensions.mjs';
