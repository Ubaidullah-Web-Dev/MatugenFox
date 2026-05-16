/* ═══════════════════════════════════════════
   MatugenFox Options Logic
   ═══════════════════════════════════════════ */

let config = {};

// === Tab Navigation ===
function initNavigation() {
    document.querySelectorAll('.sidebar-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = 'panel-' + btn.dataset.panel;
            const panel = document.getElementById(panelId);
            if (!panel) {
                console.error(`MatugenFox: Panel not found: ${panelId}`);
                return;
            }

            // Switch active classes
            document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.options-panel').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            panel.classList.add('active');
        });
    });
}
initNavigation();

// === Self-Theming ===
const THEME_MAP = {
    '--primary': '--mg-accent',
    '--on-primary': '--mg-on-accent',
    '--background': '--mg-bg-0',
    '--surface': '--mg-bg-1',
    '--surface-container': '--mg-bg-2',
    '--surface-container-high': '--mg-bg-3',
    '--on-surface': '--mg-text-0',
    '--on-surface-variant': '--mg-text-1',
    '--outline': '--mg-border',
    '--outline-variant': '--mg-border',
    '--error': '--mg-error',
};

function applySelfTheme(colors) {
    if (!colors) return;
    const root = document.documentElement;
    let accentSet = false;
    for (const [src, target] of Object.entries(THEME_MAP)) {
        if (colors[src]) {
            root.style.setProperty(target, colors[src]);
            if (target === '--mg-accent') accentSet = true;
        }
    }
    if (!accentSet) {
        for (const [key, value] of Object.entries(colors)) {
            if (key.includes('primary') && !key.includes('on-') && !key.includes('container') && !key.includes('inverse')) {
                root.style.setProperty('--mg-accent', value);
                break;
            }
        }
    }
}

// === Init ===
async function init() {
    const [stored, themeData, status] = await Promise.all([
        browser.storage.local.get("config"),
        browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).catch(() => null),
        browser.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => ({})),
    ]);

    config = stored.config || {};
    if (themeData?.colors) applySelfTheme(themeData.colors);

    // General
    document.getElementById('opt-smooth').checked = config.smoothTransitions !== false;
    document.getElementById('opt-eco').checked = config.ecoMode || false;
    document.getElementById('opt-sync-indicator').checked = config.showSyncIndicator !== false;
    
    // Paths default handling
    const defaultColors = '~/.config/matugen/generated/firefox_websites.css';
    const defaultDirs = '~/.config/dusky_sites';
    document.getElementById('opt-colors-path').value = (config.colorsPath && config.colorsPath !== defaultColors) ? config.colorsPath : '';
    document.getElementById('opt-websites-dir').value = (config.websitesDir && config.websitesDir !== defaultDirs) ? config.websitesDir : '';

    const warningEl = document.getElementById('paths-warning-group');
    if (warningEl) {
        warningEl.hidden = !(themeData?.status && themeData.status.some(s => s.includes('not found')));
    }

    // Theme
    const ms = config.transitionMs || 300;
    document.getElementById('opt-transition-speed').value = ms;
    document.getElementById('transition-speed-value').textContent = ms + 'ms';
    document.getElementById('opt-auto-dark').checked = config.autoDisableDarkSites || false;
    document.getElementById('opt-naked').checked = config.nakedMode || false;

    updateOptionsVisuals();

    // Blocklist
    renderBlocklist();

    // System
    updateSystemStatus(status);

    // Advanced — raw config
    document.getElementById('raw-config').value = JSON.stringify(config, null, 2);

    // CSS Editor
    loadFileList();

    // Presets
    renderPresets();
    updateShortcutsUI();

    // Browser shortcuts (read-only info)
    browser.commands.getAll().then(cmds => {
        cmds.forEach(c => {
            if (c.name === "toggle-theming") document.getElementById('kb-toggle-theming').textContent = c.shortcut || 'Unset';
            if (c.name === "reapply-theme") document.getElementById('kb-reapply-theme').textContent = c.shortcut || 'Unset';
        });
    });
}

// === General — Toggle handlers (immediate save) ===
['opt-smooth', 'opt-eco', 'opt-sync-indicator'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => saveToggles());
});

function saveToggles() {
    const partialUpdate = {
        smoothTransitions: document.getElementById('opt-smooth').checked,
        ecoMode: document.getElementById('opt-eco').checked,
        showSyncIndicator: document.getElementById('opt-sync-indicator').checked
    };
    Object.assign(config, partialUpdate);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate });
}

function updateOptionsVisuals() {
    const nakedEl = document.getElementById('opt-naked');
    if (!nakedEl) return;
    const isNaked = nakedEl.checked;

    const smoothRow = document.getElementById('opt-smooth')?.closest('.setting-row');
    const syncRow = document.getElementById('opt-sync-indicator')?.closest('.setting-row');
    const transitionsGroup = document.getElementById('group-transitions');
    
    if (smoothRow) smoothRow.style.opacity = isNaked ? '0.5' : '1';
    if (syncRow) syncRow.style.opacity = isNaked ? '0.5' : '1';
    if (transitionsGroup) transitionsGroup.style.opacity = isNaked ? '0.5' : '1';
}

// Save paths
document.getElementById('save-paths-btn').addEventListener('click', () => {
    const partialUpdate = {
        colorsPath: document.getElementById('opt-colors-path').value.trim() || '~/.config/matugen/generated/firefox_websites.css',
        websitesDir: document.getElementById('opt-websites-dir').value.trim() || '~/.config/dusky_sites'
    };
    Object.assign(config, partialUpdate);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate }).then(() => flashStatus('paths-status'));
});

// === Theme — Slider ===
document.getElementById('opt-transition-speed').addEventListener('input', (e) => {
    document.getElementById('transition-speed-value').textContent = e.target.value + 'ms';
});
document.getElementById('opt-transition-speed').addEventListener('change', (e) => {
    const ms = parseInt(e.target.value);
    config.transitionMs = ms;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { transitionMs: ms } });
});

// Auto-dark toggle
document.getElementById('opt-auto-dark').addEventListener('change', (e) => {
    config.autoDisableDarkSites = e.target.checked;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { autoDisableDarkSites: e.target.checked } });
});

// Naked mode toggle
document.getElementById('opt-naked').addEventListener('change', (e) => {
    config.nakedMode = e.target.checked;
    updateOptionsVisuals();
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { nakedMode: e.target.checked } });
});

// === Blocklist ===
function renderBlocklist(filter = '') {
    const container = document.getElementById('blocklist-items');
    container.replaceChildren();
    const list = (config.blocklist || []).filter(d => d.includes(filter));

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'blocklist-empty';
        if (filter) {
            empty.textContent = 'No matches';
        } else {
            const span = document.createElement('span');
            span.style.fontSize = '12px';
            span.style.opacity = '0.6';
            span.textContent = 'Everything is being themed ✨';
            empty.appendChild(document.createTextNode('No blocked sites'));
            empty.appendChild(document.createElement('br'));
            empty.appendChild(span);
        }
        container.appendChild(empty);
        return;
    }

    for (const domain of list) {
        const row = document.createElement('div');
        row.className = 'blocklist-item';
        const name = document.createElement('span');
        name.textContent = domain;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'blocklist-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove ' + domain;
        removeBtn.addEventListener('click', () => {
            const blocklist = (config.blocklist || []).filter(d => d !== domain);
            config.blocklist = blocklist;
            browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { blocklist } }).then(() => {
                renderBlocklist(document.getElementById('blocklist-search').value);
            });
        });
        row.appendChild(name);
        row.appendChild(removeBtn);
        container.appendChild(row);
    }
}

document.getElementById('blocklist-search').addEventListener('input', (e) => {
    renderBlocklist(e.target.value.trim());
});

document.getElementById('blocklist-add-btn').addEventListener('click', addBlocklistEntry);
document.getElementById('blocklist-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBlocklistEntry();
});

function addBlocklistEntry() {
    const input = document.getElementById('blocklist-add-input');
    const domain = input.value.trim().toLowerCase();
    if (!domain || domain.includes(' ')) return;
    if (!config.blocklist) config.blocklist = [];
    if (!config.blocklist.includes(domain)) {
        config.blocklist.push(domain);
        browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { blocklist: config.blocklist } }).then(() => {
            renderBlocklist();
            input.value = '';
        });
    }
}

// === CSS Editor ===
function loadFileList() {
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "LIST_WEBSITES" } });
}

function loadFileContent(filename) {
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "READ_WEBSITE_CSS", filename } });
}

document.getElementById('refresh-files').addEventListener('click', loadFileList);
document.getElementById('file-selector').addEventListener('change', (e) => loadFileContent(e.target.value));

document.getElementById('save-css-btn').addEventListener('click', () => {
    const filename = document.getElementById('file-selector').value;
    const content = document.getElementById('css-editor').value;
    if (!filename) return;
    browser.runtime.sendMessage({
        type: "HOST_COMMAND",
        command: { type: "SAVE_WEBSITE_CSS", filename, content },
    });
});

// Host response listener
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MATUGEN_UPDATE" && msg.data?.colors) {
        if (!config.activePresetId) applySelfTheme(msg.data.colors);
        const warningEl = document.getElementById('paths-warning-group');
        if (warningEl) {
            warningEl.hidden = !(msg.data.status && msg.data.status.some(s => s.includes('not found')));
        }
    } else if (msg.type === "CONFIG_RECOVERED") {
        config = msg.config;
        init(); // Refresh whole UI with recovered data
    } else if (msg.type === "HOST_RESPONSE") {
        const data = msg.data;
        if (data.type === "WEBSITE_LIST") {
            const selector = document.getElementById('file-selector');
            selector.replaceChildren();
            for (const f of data.files) {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                selector.appendChild(opt);
            }
            if (data.files.length > 0) loadFileContent(data.files[0]);
        } else if (data.type === "WEBSITE_CSS") {
            document.getElementById('css-editor').value = data.content;
        } else if (data.type === "SAVE_SUCCESS") {
            flashStatus('editor-status');
        }
    }
});

// === System ===
function updateSystemStatus(status) {
    const dot = document.getElementById('host-dot');
    const text = document.getElementById('host-status-text');
    const sync = document.getElementById('host-sync-text');

    if (status.connected) {
        dot.className = 'system-status-dot online';
        text.textContent = 'Connected';
    } else {
        dot.className = 'system-status-dot offline';
        text.textContent = status.manuallyStopped ? 'Stopped' : 'Disconnected';
    }

    if (status.lastSyncTime) {
        const ago = Math.round(Date.now() / 1000 - status.lastSyncTime);
        sync.textContent = ago < 60 ? `Last sync: ${ago}s ago` : `Last sync: ${Math.floor(ago / 60)}m ago`;
    } else {
        sync.textContent = 'No sync data';
    }
}

// Debug panel
let debugData = {};
document.getElementById('debug-toggle').addEventListener('click', () => {
    const content = document.getElementById('debug-content');
    const arrow = document.getElementById('debug-arrow');
    const actions = document.getElementById('debug-actions');
    content.hidden = !content.hidden;
    actions.hidden = content.hidden;
    arrow.textContent = content.hidden ? '▸' : '▾';

    if (!content.hidden) {
        Promise.all([
            browser.runtime.sendMessage({ type: "GET_STATUS" }),
            browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).catch(() => null),
        ]).then(([status, theme]) => {
            debugData = {
                status,
                config,
                themeColorCount: theme?.colors ? Object.keys(theme.colors).length : 0,
                themeTimestamp: theme?.timestamp,
                themeColors: theme?.colors || {},
            };
            content.textContent = JSON.stringify(debugData, null, 2);
        });
    }
});

// Copy buttons
function copyToClipboard(text, btnId) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById(btnId);
        const orig = btn.textContent;
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    });
}

document.getElementById('copy-config').addEventListener('click', () => {
    copyToClipboard(JSON.stringify(config, null, 2), 'copy-config');
});
document.getElementById('copy-theme').addEventListener('click', () => {
    copyToClipboard(JSON.stringify(debugData.themeColors || {}, null, 2), 'copy-theme');
});
document.getElementById('copy-state').addEventListener('click', () => {
    copyToClipboard(JSON.stringify(debugData.status || {}, null, 2), 'copy-state');
});

// === Advanced ===
// Raw config
document.getElementById('save-raw-btn').addEventListener('click', () => {
    try {
        const parsed = JSON.parse(document.getElementById('raw-config').value);
        config = parsed;
        browser.runtime.sendMessage({ type: "SET_CONFIG", config: parsed }).then(() => {
            flashStatus('raw-status');
        });
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
});

// Export
document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matugenfox-config.json';
    a.click();
    URL.revokeObjectURL(url);
});

// Import
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            config = JSON.parse(reader.result);
            browser.runtime.sendMessage({ type: "SET_CONFIG", config }).then(() => init());
        } catch (err) {
            alert('Invalid config file: ' + err.message);
        }
    };
    reader.readAsText(file);
});

// Reset
document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset all MatugenFox settings to defaults? This cannot be undone.')) {
        config = {};
        browser.runtime.sendMessage({ type: "SET_CONFIG", config: {} }).then(() => init());
    }
});

// === Helpers ===
function flashStatus(id) {
    const el = document.getElementById(id);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}

// === Command Palette ===
let COMMANDS = [];

function updateCommandList() {
    COMMANDS = [
        { label: 'General Settings', icon: '◉', action: () => switchPanel('general') },
        { label: 'Site Management', icon: '🌐', action: () => switchPanel('sites') },
        { label: 'Presets', icon: '🔖', action: () => switchPanel('presets') },
        { label: 'Theme Behavior', icon: '🎨', action: () => switchPanel('theme') },
        { label: 'System Status', icon: '⚙', action: () => switchPanel('system') },
        { label: 'Advanced Tools', icon: '🔧', action: () => switchPanel('advanced') },
        { label: '---', type: 'separator' },
        { label: 'Create New Preset', icon: '➕', action: () => { switchPanel('presets'); openEditor(); } },
        { label: 'Switch to Live Matugen', icon: '✨', action: () => applyPreset(null) },
    ];

    // Add dynamic preset commands
    if (config.presets) {
        config.presets.forEach(p => {
            COMMANDS.push({
                label: `Apply Preset: ${p.name}`,
                icon: '🔖',
                action: () => applyPreset(p.id)
            });
        });
    }

    COMMANDS.push(
        { label: '---', type: 'separator' },
        { label: 'Save Paths', icon: '💾', action: () => document.getElementById('save-paths-btn').click() },
        { label: 'Export Config', icon: '📤', action: () => document.getElementById('export-btn').click() },
        { label: 'Import Config', icon: '📥', action: () => document.getElementById('import-btn').click() },
        { label: 'Reset to Defaults', icon: '⚠', action: () => document.getElementById('reset-btn').click() }
    );
}

function switchPanel(name) {
    const btn = document.querySelector(`.sidebar-link[data-panel="${name}"]`);
    if (btn) btn.click();
}

function checkShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.toLowerCase().split('+').map(s => s.trim());
    const key = parts.pop();
    const ctrl = parts.includes('ctrl');
    const alt = parts.includes('alt');
    const shift = parts.includes('shift');
    const meta = parts.includes('meta');

    // Handle Space key naming
    const eKey = e.key === ' ' ? 'space' : e.key.toLowerCase();

    return eKey === key &&
           e.ctrlKey === ctrl &&
           e.altKey === alt &&
           e.shiftKey === shift &&
           e.metaKey === meta;
}

document.addEventListener('keydown', (e) => {
    const paletteShortcut = config.paletteShortcut || 'ctrl+alt+c';
    if (checkShortcut(e, paletteShortcut)) {
        e.preventDefault();
        const el = document.getElementById('command-palette');
        el.hidden = !el.hidden;
        if (!el.hidden) {
            updateCommandList();
            document.getElementById('cmd-input').value = '';
            document.getElementById('cmd-input').focus();
            renderCmds('');
        }
    }
    if (e.key === 'Escape') document.getElementById('command-palette').hidden = true;
});

function renderCmds(q) {
    const results = document.getElementById('cmd-results');
    results.replaceChildren();
    const filtered = q ? COMMANDS.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : COMMANDS;
    
    filtered.forEach((cmd, idx) => {
        if (cmd.type === 'separator') {
            const sep = document.createElement('div');
            sep.className = 'mg-cmd-separator';
            results.appendChild(sep);
            return;
        }

        const el = document.createElement('button');
        el.className = 'mg-cmd-item';
        
        const icon = document.createElement('span');
        icon.className = 'mg-cmd-icon';
        icon.textContent = cmd.icon;
        
        const label = document.createElement('span');
        label.className = 'mg-cmd-label';
        label.textContent = cmd.label;
        
        el.appendChild(icon);
        el.appendChild(label);
        
        el.addEventListener('click', () => { 
            document.getElementById('command-palette').hidden = true; 
            cmd.action(); 
        });
        results.appendChild(el);
    });
}

document.getElementById('cmd-input').addEventListener('input', (e) => renderCmds(e.target.value));
document.getElementById('command-palette').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

// === Presets Logic ===
const PRESET_VARS = [
    '--primary', '--on-primary', '--primary-container', '--on-primary-container',
    '--secondary', '--on-secondary', '--secondary-container', '--on-secondary-container',
    '--tertiary', '--on-tertiary', '--tertiary-container', '--on-tertiary-container',
    '--error', '--on-error', '--error-container', '--on-error-container',
    '--background', '--on-background',
    '--surface', '--on-surface', '--surface-variant', '--on-surface-variant',
    '--outline', '--outline-variant',
    '--inverse-surface', '--inverse-on-surface', '--inverse-primary'
];

let editingPresetId = null;

function renderPresets() {
    const grid = document.getElementById('presets-grid');
    if (!grid) return;
    grid.replaceChildren();
    
    const presets = config.presets || [];
    const activeId = config.activePresetId;

    // Update active source display
    const sourceLabel = document.getElementById('active-source-name');
    const backBtn = document.getElementById('back-to-live-btn');
    if (activeId) {
        const active = presets.find(p => p.id === activeId);
        sourceLabel.textContent = active ? active.name : 'Custom Preset';
        backBtn.hidden = false;
    } else {
        sourceLabel.textContent = 'Live Matugen';
        backBtn.hidden = true;
    }

    // Render cards
    presets.forEach(preset => {
        const card = document.createElement('div');
        card.className = `preset-card ${activeId === preset.id ? 'active' : ''}`;
        
        // Header
        const header = document.createElement('div');
        header.className = 'preset-card-header';
        
        const name = document.createElement('div');
        name.className = 'preset-card-name';
        name.textContent = preset.name;
        
        const preview = document.createElement('div');
        preview.className = 'preset-preview';
        ['--primary', '--secondary', '--background'].forEach(v => {
            const dot = document.createElement('div');
            dot.className = 'preview-dot';
            dot.style.background = preset.colors[v];
            preview.appendChild(dot);
        });
        
        header.appendChild(name);
        header.appendChild(preview);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'preset-card-actions';
        
        const createBtn = (cls, text, title, onClick) => {
            const b = document.createElement('button');
            b.className = `mg-btn mg-btn-sm ${cls}`;
            b.textContent = text;
            if (title) b.title = title;
            b.addEventListener('click', onClick);
            return b;
        };

        actions.appendChild(createBtn('apply-preset', activeId === preset.id ? 'Active' : 'Apply', null, () => applyPreset(preset.id)));
        actions.appendChild(createBtn('mg-btn-outline edit-preset', 'Edit', null, () => openEditor(preset.id)));
        actions.appendChild(createBtn('mg-btn-outline duplicate-preset', '📑', 'Duplicate', () => duplicatePreset(preset.id)));
        actions.appendChild(createBtn('mg-btn-outline export-preset', '📤', 'Export', () => exportPreset(preset.id)));
        actions.appendChild(createBtn('mg-btn-danger delete-preset', '🗑', 'Delete', () => deletePreset(preset.id)));

        card.appendChild(header);
        card.appendChild(actions);
        grid.appendChild(card);
    });

    // Disable create button if >= 10
    document.getElementById('create-preset-btn').disabled = presets.length >= 10;
}

function switchView(view) {
    document.getElementById('presets-list-view').hidden = view !== 'list';
    document.getElementById('presets-editor-view').hidden = view !== 'editor';
}

function openEditor(id = null) {
    editingPresetId = id;
    const presets = config.presets || [];
    const preset = id ? presets.find(p => p.id === id) : null;
    
    document.getElementById('editor-title').textContent = id ? 'Edit Preset' : 'Create Preset';
    document.getElementById('preset-name').value = preset ? preset.name : '';
    
    const colorsGrid = document.getElementById('editor-colors-grid');
    colorsGrid.replaceChildren();

    PRESET_VARS.forEach(variable => {
        const value = (preset && preset.colors[variable]) ? preset.colors[variable] : '#ffffff';
        const field = document.createElement('div');
        field.className = 'color-field';
        
        const label = document.createElement('div');
        label.className = 'color-field-label';
        label.textContent = variable.replace('--', '');
        
        const inputs = document.createElement('div');
        inputs.className = 'color-inputs';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'color-picker-wrapper';
        
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = value;
        picker.dataset.var = variable;
        
        const text = document.createElement('input');
        text.type = 'text';
        text.className = 'color-hex-input';
        text.value = value;
        text.dataset.var = variable;
        text.maxLength = 7;
        
        wrapper.appendChild(picker);
        inputs.appendChild(wrapper);
        inputs.appendChild(text);
        
        field.appendChild(label);
        field.appendChild(inputs);

        picker.addEventListener('input', (e) => {
            text.value = e.target.value;
            livePreview();
        });
        text.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                picker.value = e.target.value;
                livePreview();
            }
        });

        colorsGrid.appendChild(field);
    });

    switchView('editor');
}

function livePreview() {
    const colors = {};
    document.querySelectorAll('#editor-colors-grid input[type="color"]').forEach(input => {
        colors[input.dataset.var] = input.value;
    });
    applySelfTheme(colors);
    // Broadcast to tabs for real live preview
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { tempColors: colors } });
}

async function savePreset() {
    const name = document.getElementById('preset-name').value.trim() || 'Untitled Preset';
    const colors = {};
    document.querySelectorAll('#editor-colors-grid input[type="color"]').forEach(input => {
        colors[input.dataset.var] = input.value;
    });

    if (!config.presets) config.presets = [];

    if (editingPresetId) {
        const idx = config.presets.findIndex(p => p.id === editingPresetId);
        if (idx >= 0) config.presets[idx] = { id: editingPresetId, name, colors };
    } else {
        const id = 'preset-' + Date.now();
        config.presets.push({ id, name, colors });
    }

    await browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { presets: config.presets, tempColors: null } });
    flashStatus('editor-save-status');
    setTimeout(() => {
        switchView('list');
        renderPresets();
    }, 500);
}

function deletePreset(id) {
    if (!confirm('Delete this preset?')) return;
    config.presets = (config.presets || []).filter(p => p.id !== id);
    if (config.activePresetId === id) config.activePresetId = null;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { presets: config.presets, activePresetId: config.activePresetId } }).then(renderPresets);
}

function duplicatePreset(id) {
    if (config.presets.length >= 10) return alert('Limit of 10 presets reached.');
    const original = config.presets.find(p => p.id === id);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = 'preset-' + Date.now();
    copy.name += ' (Copy)';
    config.presets.push(copy);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { presets: config.presets } }).then(renderPresets);
}

function exportPreset(id) {
    const preset = config.presets.find(p => p.id === id);
    if (!preset) return;
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function applyPreset(id) {
    config.activePresetId = id;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { activePresetId: id } }).then(() => {
        renderPresets();
        // Force refresh theme data
        browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then(data => {
            if (data?.colors) applySelfTheme(data.colors);
        });
    });
}

// Generators
document.getElementById('gen-sync').addEventListener('click', async () => {
    const data = await browser.runtime.sendMessage({ type: "GET_THEME_DATA" });
    if (!data?.colors) return alert('No active Matugen theme to sync from.');
    document.querySelectorAll('#editor-colors-grid input[type="color"]').forEach(input => {
        const val = data.colors[input.dataset.var];
        if (val) {
            input.value = val;
            input.closest('.color-field').querySelector('input[type="text"]').value = val;
        }
    });
    livePreview();
});

document.getElementById('gen-random').addEventListener('click', () => {
    document.querySelectorAll('#editor-colors-grid input[type="color"]').forEach(input => {
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        input.value = randomColor;
        input.closest('.color-field').querySelector('input[type="text"]').value = randomColor;
    });
    livePreview();
});

document.getElementById('gen-auto').addEventListener('click', () => {
    const seed = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    const r = parseInt(seed.slice(1,3), 16), g = parseInt(seed.slice(3,5), 16), b = parseInt(seed.slice(5,7), 16);
    document.querySelectorAll('#editor-colors-grid input[type="color"]').forEach(input => {
        const factor = Math.random() * 0.6 + 0.2;
        const c = '#' + [r,g,b].map(x => Math.min(255, Math.floor(x * factor)).toString(16).padStart(2, '0')).join('');
        input.value = c;
        input.closest('.color-field').querySelector('input[type="text"]').value = c;
    });
    livePreview();
});

// Event Listeners
document.getElementById('create-preset-btn').addEventListener('click', () => openEditor());
document.getElementById('editor-back-btn').addEventListener('click', () => {
    switchView('list');
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { tempColors: null } });
    // Revert self-theme to actual active source
    browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then(data => {
        if (data?.colors) applySelfTheme(data.colors);
    });
});
document.getElementById('save-preset-btn').addEventListener('click', savePreset);
document.getElementById('back-to-live-btn').addEventListener('click', () => applyPreset(null));

document.getElementById('import-preset-btn').addEventListener('click', () => document.getElementById('import-preset-file').click());
document.getElementById('import-preset-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const preset = JSON.parse(reader.result);
            if (!preset.colors || !preset.name) throw new Error('Invalid preset format');
            if (!config.presets) config.presets = [];
            if (config.presets.length >= 10) return alert('Limit of 10 presets reached.');
            preset.id = 'preset-' + Date.now();
            config.presets.push(preset);
            browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { presets: config.presets } }).then(renderPresets);
        } catch (err) {
            alert('Error importing preset: ' + err.message);
        }
    };
    reader.readAsText(file);
});

// Shortcuts Management
function updateShortcutsUI() {
    const input = document.getElementById('opt-palette-shortcut');
    input.value = config.paletteShortcut || 'ctrl+alt+c';
}

document.getElementById('opt-palette-shortcut').addEventListener('keydown', (e) => {
    e.preventDefault();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    parts.push(key);

    const newShortcut = parts.join('+');
    config.paletteShortcut = newShortcut;
    e.target.value = newShortcut;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { paletteShortcut: newShortcut } });
});

document.getElementById('reset-shortcut-btn').addEventListener('click', () => {
    const def = 'ctrl+alt+c';
    config.paletteShortcut = def;
    document.getElementById('opt-palette-shortcut').value = def;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { paletteShortcut: def } });
});

// === Start ===
document.addEventListener('DOMContentLoaded', init);
