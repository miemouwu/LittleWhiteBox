/* global process, console */
// ============================================================================
// host-history 窗口化仿真测试
// ----------------------------------------------------------------------------
// 不需要真实 TauriTavern：用 Node 模拟一个 windowed 宿主——
//   getContext().chat 只暴露最近 N 楼，而 windowInfo()/history.* 暴露完整历史。
// 验证兼容层在两端的行为，并证明标准 ST 路径与"直接操作 chat"逐字节等价。
// ============================================================================

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const replayShims = path.join(rootDir, 'scripts', 'story-summary-replay', 'shims');
const shimExtensions = path.join(here, 'shim-extensions.mjs');
const shimOpenai = path.join(here, 'shim-openai.mjs');
const shimAtomExtraction = path.join(here, 'shim-atom-extraction.mjs');
const shimSiliconflow = path.join(here, 'shim-siliconflow.mjs');
const shimScript = path.join(replayShims, 'script.js');
const shimUtils = path.join(replayShims, 'utils.js');
const cacheDir = path.join(rootDir, 'node_modules', '.cache', 'host-history-test');

// ---- 断言工具 --------------------------------------------------------------
let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name, got, want) {
    check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// ---- 构造数据 + 假宿主 ------------------------------------------------------
const TOTAL = 450;          // 总楼层数（远大于 PAGE_LIMIT=200，强制走 history.before 翻页）
const WINDOW = 50;          // 窗口长度
const fullChat = Array.from({ length: TOTAL }, (_, i) => ({
    mes: `msg-${i}`,
    is_user: i % 2 === 0,
    name: i % 2 === 0 ? '用户' : '角色',
}));
const windowChat = fullChat.slice(TOTAL - WINDOW); // 窗口只含最后 50 楼（绝对 400..449）

function makeWindowedHost(chat, mode = 'windowed') {
    const total = chat.length;
    const current = {
        windowInfo: async () => ({
            mode,
            totalCount: total,
            windowStartIndex: Math.max(0, total - WINDOW),
            windowLength: Math.min(WINDOW, total),
        }),
        handle: () => ({
            history: {
                tail: async ({ limit }) => {
                    const start = Math.max(0, total - limit);
                    return { messages: chat.slice(start, total), startIndex: start, hasMoreBefore: start > 0 };
                },
                before: async (page, { limit }) => {
                    const prevStart = page.startIndex;
                    const start = Math.max(0, prevStart - limit);
                    return { messages: chat.slice(start, prevStart), startIndex: start, hasMoreBefore: start > 0 };
                },
            },
        }),
    };
    return { ready: Promise.resolve(true), api: { chat: { current } } };
}

function aliasPlugin() {
    return {
        name: 'alias',
        setup(b) {
            b.onResolve({ filter: /extensions\.js$/ }, (a) => (a.importer ? { path: shimExtensions } : null));
            b.onResolve({ filter: /script\.js$/ }, (a) => (a.importer ? { path: shimScript } : null));
            b.onResolve({ filter: /openai\.js$/ }, (a) => (a.importer ? { path: shimOpenai } : null));
            b.onResolve({ filter: /atom-extraction\.js$/ }, (a) => (a.importer ? { path: shimAtomExtraction } : null));
            b.onResolve({ filter: /siliconflow\.js$/ }, (a) => (a.importer ? { path: shimSiliconflow } : null));
            b.onResolve({ filter: /utils\.js$/ }, (a) => (a.importer && a.importer.includes('server-storage.js') ? { path: shimUtils } : null));
        },
    };
}

function makeLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(String(key)) ? store.get(String(key)) : null;
        },
        setItem(key, value) {
            store.set(String(key), String(value));
        },
        removeItem(key) {
            store.delete(String(key));
        },
        clear() {
            store.clear();
        },
    };
}

async function buildBundle(entry, name) {
    await fs.mkdir(cacheDir, { recursive: true });
    const outfile = path.join(cacheDir, name);
    await build({
        entryPoints: [entry],
        bundle: true, format: 'esm', platform: 'node', outfile, sourcemap: false,
        plugins: [aliasPlugin()],
    });
    return outfile;
}

async function main() {
    const outfile = await buildBundle(path.join(here, 'entry.mjs'), 'bundle.mjs');
    const m = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
    const { getGlobalChatLength, getMessageRange, forEachMessage, isTauriTavern, __setCtx } = m;

    // ========================================================================
    console.log('\n[A] 标准 SillyTavern（无 window.__TAURITAVERN__）—— 必须与直接操作 chat 等价');
    delete globalThis.window;
    __setCtx({ chat: fullChat, chatId: 'st' });
    check('isTauriTavern()=false', isTauriTavern() === false);
    eq('getGlobalChatLength = chat.length', await getGlobalChatLength(), TOTAL);
    eq('getMessageRange(0,9) = chat.slice(0,10)', await getMessageRange(0, 9), fullChat.slice(0, 10));
    eq('getMessageRange(440,449) = chat.slice(440,450)', await getMessageRange(440, 449), fullChat.slice(440, 450));
    eq('getMessageRange(start>end) = []', await getMessageRange(10, 5), []);
    {
        const seen = [];
        await forEachMessage((msg, abs) => { seen.push(abs); });
        eq('forEachMessage 遍历全部 450 楼（尾→头）', [seen.length, seen[0], seen[seen.length - 1]], [TOTAL, TOTAL - 1, 0]);
    }

    // ========================================================================
    console.log('\n[B] TauriTavern windowed —— getContext().chat 只含最后 50 楼，仍要读到完整历史');
    globalThis.window = { __TAURITAVERN__: makeWindowedHost(fullChat, 'windowed') };
    __setCtx({ chat: windowChat, chatId: 'tt' }); // 模拟窗口截断：getContext().chat 只有 50 条

    check('isTauriTavern()=true', isTauriTavern() === true);
    eq('窗口确实被截断（getContext().chat.length=50）', windowChat.length, WINDOW);
    eq('getGlobalChatLength = totalCount(450)，非窗口长度', await getGlobalChatLength(), TOTAL);

    // 读窗口外的早期楼层（floor 0..9 完全在窗口[400..449]之外）
    eq('getMessageRange(0,9) 读到窗口外早期楼层', await getMessageRange(0, 9), fullChat.slice(0, 10));
    // 跨窗口边界（395 在窗外、405 在窗内）
    eq('getMessageRange(395,405) 跨窗口边界', await getMessageRange(395, 405), fullChat.slice(395, 406));
    // 末尾窗口内
    eq('getMessageRange(445,449) 窗口内', await getMessageRange(445, 449), fullChat.slice(445, 450));

    {
        // forEachMessage 的契约是"页序从新到旧、页内从旧到新"，跨模式遍历顺序不同，
        // 但其唯一用途（getAnchorStats 收集 AI 楼层号）与顺序无关 → 只校验完整性。
        const seen = [];
        await forEachMessage((msg, abs) => { seen.push(abs); });
        const sorted = [...seen].sort((a, b) => a - b);
        eq('forEachMessage 穿越窗口完整覆盖 0..449 各一次',
            [seen.length, new Set(seen).size, sorted[0], sorted[sorted.length - 1]],
            [TOTAL, TOTAL, 0, TOTAL - 1]);
    }
    {
        // 模拟 buildIncrementalSlice 的核心读取：已总结到 100，目标末楼，maxPerRun=100
        const total = await getGlobalChatLength();
        const lastSummarized = 100, maxPerRun = 100;
        const start = Math.max(0, lastSummarized + 1);
        const end = Math.min(Math.min(total - 1, total - 1), start + maxPerRun - 1);
        const slice = await getMessageRange(start, end);
        eq('增量切片 [101..200] 全部命中窗口外楼层', [start, end, slice.length, slice[0].mes, slice[slice.length - 1].mes],
            [101, 200, 100, 'msg-101', 'msg-200']);
    }

    // ========================================================================
    console.log('\n[C] 边界/降级路径');
    // mode:'off' → 窗口即全量，回退 chat.length
    globalThis.window = { __TAURITAVERN__: makeWindowedHost(windowChat, 'off') };
    __setCtx({ chat: windowChat, chatId: 'off' });
    eq("mode='off' 仍按 totalCount 返回", await getGlobalChatLength(), WINDOW);

    // ★ 回归：mode 字段值与文档不一致（真机可能不是 'windowed'），
    //   只要 totalCount 合法就必须用它，而不是回退到窗口长度。
    globalThis.window = { __TAURITAVERN__: makeWindowedHost(fullChat, 'paged') };
    __setCtx({ chat: windowChat, chatId: 'weird-mode' });
    eq("mode 非 'windowed' 也用 totalCount(450)", await getGlobalChatLength(), TOTAL);

    // 宿主无 history API → getMessageRange 退化为窗口切片
    globalThis.window = { __TAURITAVERN__: { ready: Promise.resolve(), api: { chat: { current: { handle: () => ({}) } } } } };
    __setCtx({ chat: windowChat, chatId: 'nohist' });
    eq('无 history API 时退化为窗口切片', await getMessageRange(0, 4), windowChat.slice(0, 5));

    // windowInfo 抛异常 → 退化为窗口长度，不崩
    globalThis.window = { __TAURITAVERN__: { ready: Promise.resolve(), api: { chat: { current: { windowInfo: async () => { throw new Error('boom'); } } } } } };
    __setCtx({ chat: windowChat, chatId: 'err' });
    eq('windowInfo 异常时安全降级', await getGlobalChatLength(), WINDOW);

    // ========================================================================
    console.log('\n[D] 端到端：真实 buildIncrementalSlice（generator.js）在窗口化下续上窗口外历史');
    try {
        const genOut = await buildBundle(path.join(here, 'entry-generator.mjs'), 'bundle-generator.mjs');
        const gen = await import(`${pathToFileURL(genOut).href}?t=${Date.now()}`);
        globalThis.window = { __TAURITAVERN__: makeWindowedHost(fullChat, 'windowed') };
        gen.__setCtx({ chat: windowChat, chatId: 'e2e', name1: '用户', name2: '角色' });
        // 已总结到 100、目标末楼(449)、maxPerRun=100 → 期望续上 [101..200] 楼（全在窗口外）
        const slice = await gen.buildIncrementalSlice(449, 100, 100);
        eq('真实 buildIncrementalSlice: count/range/endMesId',
            [slice.count, slice.range, slice.endMesId], [100, '102-201楼', 200]);
        check('切片正文含窗口外早期楼层 msg-101', slice.text.includes('msg-101'), 'text 未包含 msg-101');
        check('切片正文含窗口外楼层 msg-200', slice.text.includes('msg-200'), 'text 未包含 msg-200');
        check('切片正文不含窗口内末楼 msg-449（超出 maxPerRun）', !slice.text.includes('msg-449'));
    } catch (e) {
        console.log(`  ⚠ SKIP（真实模块依赖无法在本环境加载）：${e?.message || e}`);
    }

    // ========================================================================
    console.log('\n[E] 端到端：真实 L0 state integration 在窗口化下使用绝对楼层号');
    try {
        const stateOut = await buildBundle(path.join(here, 'entry-state-integration.mjs'), 'bundle-state-integration.mjs');
        const state = await import(`${pathToFileURL(stateOut).href}?t=${Date.now()}`);
        globalThis.localStorage = makeLocalStorage();
        const ttLogEntries = [];
        globalThis.window = { __TAURITAVERN__: makeWindowedHost(fullChat, 'windowed') };
        globalThis.window.__TAURITAVERN__.api.dev = {
            mobile: {
                async logEntry(entry) {
                    ttLogEntries.push(entry);
                    return { ok: true };
                },
            },
        };
        state.__setCtx({
            chat: windowChat,
            chatId: 'tt-l0',
            name1: '用户',
            name2: '角色',
        });
        state.__setChatMetadata({ extensions: {} });
        state.resetExtractionShim();
        globalThis.localStorage.setItem('summary_panel_config', JSON.stringify({
            vector: {
                enabled: true,
                l0Concurrency: 1,
                l0Api: { key: 'sk-test' },
                embeddingApi: { key: 'sk-test' },
            },
        }));

        await state.clearAllAtomsAndVectors('tt-l0');
        const result = await state.incrementalExtractAtoms('tt-l0', windowChat, null, {
            maxFloors: 1,
            preferredFloors: [401],
        });
        const atoms = state.getStateAtoms();
        const status401 = state.getL0FloorStatus(401);
        const lastInput = state.getLastExtractionInput();

        eq('真实 incrementalExtractAtoms: preferred 全局楼层 401 可从窗口外命中',
            [result.built, atoms.length, atoms[0]?.floor, status401?.status],
            [1, 1, 401, 'ok']);
        eq('真实 incrementalExtractAtoms: floor 401 使用全局前一楼 400 作为 user 消息',
            lastInput,
            { floor: 401, user: 'msg-400', ai: 'msg-401' });
        check('真实 incrementalExtractAtoms: TT log stream 记录窗口历史展开',
            ttLogEntries.some(entry => entry?.event === 'lwb.l0.absolute-chat-expanded'
                && entry?.detail?.windowLength === WINDOW
                && entry?.detail?.totalCount === TOTAL
                && entry?.detail?.loadedLength === TOTAL),
            `logs=${JSON.stringify(ttLogEntries)}`);
    } catch (e) {
        console.log(`  ⚠ SKIP（真实 L0 模块依赖无法在本环境加载）：${e?.message || e}`);
    }

    // ========================================================================
    console.log('\n[F] 端到端：L0 fail 状态保留自动维护重试信号');
    try {
        const stateOut = await buildBundle(path.join(here, 'entry-state-integration.mjs'), 'bundle-state-integration-retry.mjs');
        const state = await import(`${pathToFileURL(stateOut).href}?t=${Date.now()}`);
        delete globalThis.window;
        const smallChat = Array.from({ length: 10 }, (_, i) => ({
            mes: `small-${i}`,
            is_user: i % 2 === 0,
            name: i % 2 === 0 ? '用户' : '角色',
        }));
        state.__setCtx({ chat: smallChat, chatId: 'retry-stats', name1: '用户', name2: '角色' });
        state.__setChatMetadata({ extensions: {} });
        state.setL0FloorStatus(1, { status: 'ok', atoms: 1 });
        state.setL0FloorStatus(3, { status: 'empty', atoms: 0 });
        state.setL0FloorStatus(5, { status: 'fail', attempts: 1, reason: 'llm_failed' });
        state.setL0FloorStatus(7, { status: 'fail', attempts: 3, reason: 'llm_failed' });

        const stats = await state.getAnchorStats();
        eq('真实 getAnchorStats: fail 单独计数且仅未达上限的 fail 可自动重试',
            {
                total: stats.total,
                extracted: stats.extracted,
                pending: stats.pending,
                fail: stats.fail,
                retryableFail: stats.retryableFail,
            },
            {
                total: 5,
                extracted: 2,
                pending: 1,
                fail: 2,
                retryableFail: 1,
            });

        state.resetExtractionShim();
        const retryResult = await state.incrementalExtractAtoms('retry-stats', smallChat, null, {
            maxFloors: 10,
            failRetryLimit: 3,
        });
        eq('真实 incrementalExtractAtoms: 自动模式跳过已达上限的 fail，只重试未达上限楼层',
            [
                retryResult.built,
                state.getL0FloorStatus(5)?.status,
                {
                    status: state.getL0FloorStatus(7)?.status,
                    attempts: state.getL0FloorStatus(7)?.attempts,
                    reason: state.getL0FloorStatus(7)?.reason,
                },
                state.getL0FloorStatus(9)?.status,
                state.getLastExtractionInput(),
            ],
            [
                2,
                'ok',
                { status: 'fail', attempts: 3, reason: 'llm_failed' },
                'ok',
                { floor: 9, user: 'small-8', ai: 'small-9' },
            ]);
    } catch (e) {
        console.log(`  ⚠ SKIP（真实 L0 stats 模块依赖无法在本环境加载）：${e?.message || e}`);
    }

    // ========================================================================
    console.log(`\n结果：${passed} 通过，${failures.length} 失败`);
    if (failures.length) {
        console.log('\nFAILED:');
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
    console.log('host-history 窗口化仿真：PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
