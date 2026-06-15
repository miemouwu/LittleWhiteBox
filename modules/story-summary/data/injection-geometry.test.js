// node --test
// ============================================================================
// injection-geometry — 注入几何（边界 / 深度）的纯函数单测
// ----------------------------------------------------------------------------
// 这两件事在 TauriTavern 窗口化下最容易出错：
//   1) 注入边界：向量滞后时不能让记忆停留在旧楼（应取「向量楼层」与「已总结楼层」
//      的较大者，记忆永远不旧于文本总结）。
//   2) 注入深度：depth 是「从末尾往前数」，必须用【全局总楼层数】计算，
//      绝不能用被窗口截断的 getContext().chat.length。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveInjectionBoundary, computeInjectionDepth, toWindowLocalHideRange, desiredWindowHideFlags } from './injection-geometry.js';

test('resolveInjectionBoundary: 关向量时用已总结楼层', () => {
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: false, lastChunkFloor: 200, lastSummarizedMesId: 116 }),
        116,
    );
});

test('resolveInjectionBoundary: 开向量且向量滞后 → 用较大者(已总结)，记忆不旧于总结', () => {
    // 真机现象：lastChunkFloor 卡在 48，文本总结已到 116。
    // 旧逻辑会取 48（记忆跳回过去）；修复后必须取 116。
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: true, lastChunkFloor: 48, lastSummarizedMesId: 116 }),
        116,
    );
});

test('resolveInjectionBoundary: 开向量且向量领先 → 用向量楼层', () => {
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: true, lastChunkFloor: 120, lastSummarizedMesId: 116 }),
        120,
    );
});

test('resolveInjectionBoundary: 开向量但尚无总结 → 退回向量楼层', () => {
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: true, lastChunkFloor: 48, lastSummarizedMesId: -1 }),
        48,
    );
});

test('resolveInjectionBoundary: 两者皆无 → -1（不注入）', () => {
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: true, lastChunkFloor: -1, lastSummarizedMesId: -1 }),
        -1,
    );
    assert.equal(
        resolveInjectionBoundary({ vectorEnabled: false, lastChunkFloor: 5, lastSummarizedMesId: -1 }),
        -1,
    );
});

test('computeInjectionDepth: 用全局总楼层数（非窗口长度）算 depth', () => {
    // 全局 123 楼，边界=116 → depth = 123 - 116 - 1 = 6（紧贴 keepVisible 尾部之上）。
    assert.equal(computeInjectionDepth({ totalFloors: 123, boundary: 116, minDepth: 2 }), 6);
});

test('computeInjectionDepth: 窗口长度若误入会塌成 minDepth —— 反例固化', () => {
    // 这是真机 bug：用窗口长度(50)算 → max(2, 50-116-1)=2，记忆被怼到最底部。
    // 此处只是固化「窗口长度是错的输入」：正确实现必须由调用方传【全局】总楼层数。
    const wrongWithWindow = computeInjectionDepth({ totalFloors: 50, boundary: 116, minDepth: 2 });
    assert.equal(wrongWithWindow, 2);
    const rightWithGlobal = computeInjectionDepth({ totalFloors: 123, boundary: 116, minDepth: 2 });
    assert.notEqual(rightWithGlobal, wrongWithWindow);
});

test('computeInjectionDepth: 边界很旧（向量未覆盖大量历史）→ depth 很大，记忆注到窗口顶之上', () => {
    // 边界=48、全局 123 → depth = 74。调用方/宿主据此把记忆放到窗口顶端（其上全是已覆盖楼层）。
    assert.equal(computeInjectionDepth({ totalFloors: 123, boundary: 48, minDepth: 2 }), 74);
});

test('computeInjectionDepth: 不低于 minDepth', () => {
    // 边界紧贴末楼 → 原始值 ≤ 0，必须夹到 minDepth。
    assert.equal(computeInjectionDepth({ totalFloors: 123, boundary: 122, minDepth: 2 }), 2);
    assert.equal(computeInjectionDepth({ totalFloors: 123, boundary: 130, minDepth: 2 }), 2);
});

// ── toWindowLocalHideRange ──────────────────────────────────────────────────
// calcHideRange 给的是【全局楼层】闭区间 [0, hideEnd]，但 TauriTavern 下 /hide 和
// chat[] 走【窗口本地下标】。必须按 windowStart = totalFloors - windowLength 换算，
// 否则全局区间会把整个窗口（=最近楼层）全部隐藏 —— 真机就是这么丢掉 floor 65–124 的。

test('toWindowLocalHideRange: 标准 ST（窗口=全量）→ 本地等于全局', () => {
    // windowLength === totalFloors → windowStart=0 → 不变（保证桌面端零回归）。
    assert.deepEqual(
        toWindowLocalHideRange({ start: 0, end: 110 }, 124, 124),
        { start: 0, end: 110 },
    );
});

test('toWindowLocalHideRange: TauriTavern 窗口化 → 平移到本地下标', () => {
    // 真机：124 楼，窗口只载入最近 60 楼（windowStart=64）。
    // 全局隐藏 [0,110] → 本地 [0,46]（= 全局 64–110 隐藏，本地 47–59=全局 111–123 保留可见）。
    // 旧逻辑直接把 [0,110] 喂给 /hide → 本地 0–110 覆盖整个 60 条窗口 → 最近楼层全隐藏。
    assert.deepEqual(
        toWindowLocalHideRange({ start: 0, end: 110 }, 124, 60),
        { start: 0, end: 46 },
    );
});

test('toWindowLocalHideRange: 隐藏区间整体在窗口之外 → null（窗口内无需隐藏任何楼层）', () => {
    // 窗口只载入最近 20 楼（windowStart=104），而隐藏边界只到 90 → 窗口内全是要保留的近期楼层。
    assert.equal(toWindowLocalHideRange({ start: 0, end: 90 }, 124, 20), null);
});

test('toWindowLocalHideRange: 本地末端夹到窗口长度内', () => {
    // 边界异常大（超过总楼层）也不能越界到 windowLength-1 之外。
    assert.deepEqual(
        toWindowLocalHideRange({ start: 0, end: 200 }, 124, 60),
        { start: 0, end: 59 },
    );
});

test('toWindowLocalHideRange: 隐藏边界正好落在窗口首楼 → 只隐藏本地 0', () => {
    // windowStart=64，hideEnd=64 → 本地 [0,0]。
    assert.deepEqual(
        toWindowLocalHideRange({ start: 0, end: 64 }, 124, 60),
        { start: 0, end: 0 },
    );
});

test('toWindowLocalHideRange: 空窗口 / 无 range → null（安全降级）', () => {
    assert.equal(toWindowLocalHideRange(null, 124, 60), null);
    assert.equal(toWindowLocalHideRange({ start: 0, end: 50 }, 124, 0), null);
});

// ── desiredWindowHideFlags ──────────────────────────────────────────────────
// 修「隐藏累积」：生成时的隐藏必须【对齐】整个窗口（≤边界隐藏、>边界取消隐藏），
// 而不是只加不减。否则窗口滑动上百楼后，旧的 is_system=true 会把最近楼层也盖住，
// 模型只剩旧内容 → 楼层漂移。这个纯函数给出窗口每个本地下标【应有】的 is_system。

test('desiredWindowHideFlags: 隐藏 ≤end，>end 必须可见（这才是反累积的关键）', () => {
    const flags = desiredWindowHideFlags(50, { start: 0, end: 41 });
    assert.equal(flags.length, 50);
    assert.equal(flags.slice(0, 42).every(x => x === true), true, '0-41 应隐藏');
    assert.equal(flags.slice(42).every(x => x === false), true, '42-49（最近楼层）必须可见');
});

test('desiredWindowHideFlags: 即使某些近期楼层之前被错误隐藏，期望状态也是可见', () => {
    // 真机现象：累积把 205-212（近期）也隐藏了。期望状态把它们标回可见，调用方据此取消隐藏。
    const flags = desiredWindowHideFlags(10, { start: 0, end: 3 });
    assert.deepEqual(flags, [true, true, true, true, false, false, false, false, false, false]);
});

test('desiredWindowHideFlags: 无 range → 全部可见（不隐藏任何楼层）', () => {
    assert.deepEqual(desiredWindowHideFlags(4, null), [false, false, false, false]);
});

test('desiredWindowHideFlags: end 超出窗口长度时夹紧', () => {
    assert.deepEqual(desiredWindowHideFlags(3, { start: 0, end: 99 }), [true, true, true]);
});

test('desiredWindowHideFlags: 空窗口 → 空数组', () => {
    assert.deepEqual(desiredWindowHideFlags(0, { start: 0, end: 5 }), []);
});
