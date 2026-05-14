/* ═══════════════════════════════════════════
   MatugenFox Options Logic
   ═══════════════════════════════════════════ */

let config = {};

// === Tab Navigation ===
document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.options-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    });
});

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
    document.getElementById('opt-colors-path').value = config.colorsPath || '';
    document.getElementById('opt-websites-dir').value = config.websitesDir || '';

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
    const isNaked = document.getElementById('opt-naked').checked;
    const smoothRow = document.getElementById('opt-smooth').closest('.setting-row');
    const syncRow = document.getElementById('opt-sync-indicator').closest('.setting-row');
    const transitionsGroup = document.getElementById('group-transitions');
    
    if (smoothRow) smoothRow.style.opacity = isNaked ? '0.5' : '1';
    if (syncRow) syncRow.style.opacity = isNaked ? '0.5' : '1';
    if (transitionsGroup) transitionsGroup.style.opacity = isNaked ? '0.5' : '1';
}

// Save paths
document.getElementById('save-paths-btn').addEventListener('click', () => {
    const partialUpdate = {
        colorsPath: document.getElementById('opt-colors-path').value || '~/.config/matugen/colors.css',
        websitesDir: document.getElementById('opt-websites-dir').value || '~/.config/matugen/websites'
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
        empty.innerHTML = filter
            ? 'No matches'
            : 'No blocked sites<br><span style="font-size:12px;opacity:0.6">Everything is being themed ✨</span>';
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
        applySelfTheme(msg.data.colors);
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
const COMMANDS = [
    { label: 'General Settings', icon: '◉', action: () => switchPanel('general') },
    { label: 'Site Management', icon: '🌐', action: () => switchPanel('sites') },
    { label: 'Theme Behavior', icon: '🎨', action: () => switchPanel('theme') },
    { label: 'System Status', icon: '⚙', action: () => switchPanel('system') },
    { label: 'Advanced Tools', icon: '🔧', action: () => switchPanel('advanced') },
    { label: 'Save Paths', icon: '💾', action: () => document.getElementById('save-paths-btn').click() },
    { label: 'Export Config', icon: '📤', action: () => document.getElementById('export-btn').click() },
    { label: 'Import Config', icon: '📥', action: () => document.getElementById('import-btn').click() },
    { label: 'Reset to Defaults', icon: '⚠', action: () => document.getElementById('reset-btn').click() },
];

function switchPanel(name) {
    document.querySelectorAll('.sidebar-link').forEach(b => {
        b.classList.toggle('active', b.dataset.panel === name);
    });
    document.querySelectorAll('.options-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'panel-' + name);
    });
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        const el = document.getElementById('command-palette');
        el.hidden = !el.hidden;
        if (!el.hidden) {
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
    for (const cmd of filtered) {
        const el = document.createElement('button');
        el.className = 'mg-cmd-item';
        const icon = document.createElement('span');
        icon.className = 'mg-cmd-icon';
        icon.textContent = cmd.icon;
        el.appendChild(icon);
        el.appendChild(document.createTextNode(cmd.label));
        el.addEventListener('click', () => { document.getElementById('command-palette').hidden = true; cmd.action(); });
        results.appendChild(el);
    }
}

document.getElementById('cmd-input').addEventListener('input', (e) => renderCmds(e.target.value));
document.getElementById('command-palette').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

// === Start ===
document.addEventListener('DOMContentLoaded', init);
