// scripts/openai.js 桩：buildIncrementalSlice 不会调用它，仅满足模块加载期的具名导入。
export function getStreamingReply() { throw new Error('openai shim: not callable in test'); }
