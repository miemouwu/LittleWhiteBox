function escapeHtml(text = '') {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getAgentConfigSaveButtonState(configSave = {}) {
    const status = String(configSave?.status || 'idle');
    if (status === 'saving') {
        return {
            className: 'xb-assistant-save-button is-saving',
            title: '正在保存配置',
            html: '<span class="xb-assistant-save-spinner" aria-hidden="true"></span>保存中...',
        };
    }
    if (status === 'success') {
        return {
            className: 'xb-assistant-save-button is-success',
            title: '配置已保存',
            html: '已保存',
        };
    }
    if (status === 'error') {
        return {
            className: 'xb-assistant-save-button is-error',
            title: escapeHtml(configSave?.error || '保存失败'),
            html: '保存失败',
        };
    }
    return {
        className: 'xb-assistant-save-button',
        title: '保存配置',
        html: '保存配置',
    };
}

export function buildAgentSettingsPanelMarkup(options = {}) {
    const {
        configSave = {},
        runtimeText = '',
        inlineToastText = '',
        showInlineToast = true,
        isBusy = false,
        canDeletePreset = true,
    } = options;
    const saveButton = getAgentConfigSaveButtonState(configSave);
    const saveDisabled = isBusy || String(configSave?.status || '') === 'saving' ? 'disabled' : '';
    const deleteDisabled = isBusy || !canDeletePreset ? 'disabled' : '';

    return `
        <section class="xb-assistant-config">
            <label>
                <span>已存预设</span>
                <select id="xb-assistant-preset-select"></select>
            </label>
            <label>
                <span>预设名称</span>
                <input id="xb-assistant-preset-name" type="text" placeholder="例如：OpenAI 测试号" />
            </label>
            <label>
                <span>Provider</span>
                <select id="xb-assistant-provider">
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="openai-compatible">OpenAI-compatible</option>
                    <option value="sillytavern-openai-compatible">SillyTavern OpenAI-compatible</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google AI</option>
                </select>
            </label>
            <label>
                <span>Base URL</span>
                <input id="xb-assistant-base-url" type="text" />
            </label>
            <label>
                <span>API Key</span>
                <div class="xb-assistant-inline-input">
                    <input id="xb-assistant-api-key" type="password" />
                    <button id="xb-assistant-toggle-key" type="button" class="secondary ghost">显示</button>
                </div>
            </label>
            <label>
                <span>Model</span>
                <input id="xb-assistant-model" type="text" />
            </label>
            <div class="xb-assistant-inline-input xb-assistant-model-row">
                <label class="xb-assistant-grow">
                    <span>已拉取模型</span>
                    <select id="xb-assistant-model-pulled">
                        <option value="">手动填写</option>
                    </select>
                </label>
                <button id="xb-assistant-pull-models" type="button" class="secondary" ${isBusy ? 'disabled' : ''}>拉取模型</button>
            </div>
            <label id="xb-assistant-tool-mode-wrap">
                <span>Tool 调用格式</span>
                <select id="xb-assistant-tool-mode"></select>
            </label>
            <label>
                <span>斜杠命令权限</span>
                <select id="xb-assistant-permission-mode"></select>
            </label>
            <label>
                <span>JavaScript API 权限</span>
                <select id="xb-assistant-jsapi-permission"></select>
            </label>
            <label class="xb-assistant-checkbox-row">
                <span>
                    Reasoning参数
                    <small>需 API 支持，否则报错</small>
                </span>
                <span class="xb-assistant-checkbox-control">
                    <input id="xb-assistant-reasoning-enabled" type="checkbox" />
                    <span>开启</span>
                </span>
            </label>
            <label id="xb-assistant-reasoning-effort-wrap">
                <span>思考强度</span>
                <select id="xb-assistant-reasoning-effort"></select>
            </label>
            <div class="xb-assistant-actions">
                <button id="xb-assistant-save" type="button" class="${saveButton.className}" title="${saveButton.title}" ${saveDisabled}>${saveButton.html}</button>
                <button id="xb-assistant-delete-preset" type="button" class="secondary" ${deleteDisabled}>删除配置</button>
            </div>
            <div class="xb-assistant-runtime" id="xb-assistant-runtime">${escapeHtml(runtimeText)}</div>
            ${showInlineToast ? `<div class="xb-assistant-toast xb-assistant-toast-inline" id="xb-assistant-toast" aria-live="polite">${escapeHtml(inlineToastText)}</div>` : ''}
        </section>
    `;
}
