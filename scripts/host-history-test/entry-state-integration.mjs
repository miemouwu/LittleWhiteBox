// 端到端入口：导出真实 L0 state integration + 测试 shim 的状态控制器。
export {
    clearAllAtomsAndVectors,
    incrementalExtractAtoms,
} from '../../modules/story-summary/vector/pipeline/state-integration.js';
export {
    getL0FloorStatus,
    getStateAtoms,
} from '../../modules/story-summary/vector/storage/state-store.js';
export { __setCtx } from './shim-extensions.mjs';
export { __setChatMetadata } from '../story-summary-replay/shims/script.js';
export { getLastExtractionInput, resetExtractionShim } from './shim-atom-extraction.mjs';
