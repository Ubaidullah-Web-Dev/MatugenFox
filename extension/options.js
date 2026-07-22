/* ═══════════════════════════════════════════
   MatugenFox Options Page — v1.3.0
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

            document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.options-panel').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            panel.classList.add('active');
        });
    });
}
initNavigation();

// === Self-Theming ===
// Matugen generates variables with underscores (--on_background), not dashes
const THEME_MAP = {
    '--primary':               '--mg-accent',
    '--on_primary':            '--mg-on-accent',
    '--background':            '--mg-bg-0',
    '--surface':               '--mg-bg-1',
    '--surface_container':     '--mg-bg-2',
    '--surface_container_high':'--mg-bg-3',
    '--on_surface':            '--mg-text-0',
    '--on_surface_variant':    '--mg-text-1',
    '--outline':               '--mg-border',
    '--outline_variant':       '--mg-border',
    '--error':                 '--mg-error',
    '--secondary':             '--mg-accent',
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

    // General Settings
    document.getElementById('opt-smooth').checked = config.smoothTransitions !== false;
    document.getElementById('opt-eco').checked = config.ecoMode || false;
    document.getElementById('opt-fetch-startup').checked = config.fetchOnStartup || false;
    document.getElementById('opt-mute-errors').checked = config.nativeErrorMuted || false;
    
    // Paths
    const defaultColors = '~/.config/matugen/generated/firefox_websites.css';
    const defaultDirs = '~/.config/dusky_sites';
    document.getElementById('opt-colors-path').value = (config.colorsPath && config.colorsPath !== defaultColors) ? config.colorsPath : '';
    document.getElementById('opt-websites-dir').value = (config.websitesDir && config.websitesDir !== defaultDirs) ? config.websitesDir : '';
    const warningEl = document.getElementById('paths-warning-group');
    if (warningEl) warningEl.hidden = !(themeData?.status && themeData.status.some(s => s.includes('not found')));

    // Browser Theme
    document.getElementById('opt-browser-theme').checked = config.browserThemeEnabled !== false;
    renderBrowserTemplateForm();
    renderPaletteTemplateForm(themeData?.colors);

    // DuckDuckGo
    document.getElementById('opt-duckduckgo').checked = config.duckduckgoEnabled || false;

    // userChrome
    document.getElementById('opt-userchrome').checked = config.userChromeEnabled || false;
    document.getElementById('opt-usercontent').checked = config.userContentEnabled || false;
    document.getElementById('opt-font-size').value = config.fontSize || 13;
    loadProfilePaths();

    // Theme Behavior
    const ms = config.transitionMs || 300;
    document.getElementById('opt-transition-speed').value = ms;
    document.getElementById('transition-speed-value').textContent = ms + 'ms';
    document.getElementById('opt-auto-dark').checked = config.autoDisableDarkSites || false;
    document.getElementById('opt-naked').checked = config.nakedMode || false;
    
    // Auto Time
    const start = config.autoTimeStart || { stringFormat: "08:00" };
    const end = config.autoTimeEnd || { stringFormat: "19:00" };
    document.getElementById('opt-auto-start').value = start.stringFormat;
    document.getElementById('opt-auto-end').value = end.stringFormat;

    updateOptionsVisuals();
    renderBlocklist();
    updateSystemStatus(status);
    document.getElementById('raw-config').value = JSON.stringify(config, null, 2);
    loadFileList();
    renderPresets();

    browser.commands.getAll().then(cmds => {
        cmds.forEach(c => {
            if (c.name === "toggle-theming") document.getElementById('kb-toggle-theming').textContent = c.shortcut || 'Unset';
            if (c.name === "reapply-theme") document.getElementById('kb-reapply-theme').textContent = c.shortcut || 'Unset';
            if (c.name === "fetch-theme") document.getElementById('kb-fetch').textContent = c.shortcut || 'Unset';
        });
    });
}

// === General & Paths ===
['opt-smooth', 'opt-eco', 'opt-fetch-startup', 'opt-mute-errors'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        const partialUpdate = {
            smoothTransitions: document.getElementById('opt-smooth').checked,
            ecoMode: document.getElementById('opt-eco').checked,
            fetchOnStartup: document.getElementById('opt-fetch-startup').checked,
            nativeErrorMuted: document.getElementById('opt-mute-errors').checked
        };
        Object.assign(config, partialUpdate);
        browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate });
    });
});

document.getElementById('save-paths-btn').addEventListener('click', () => {
    const partialUpdate = {
        colorsPath: document.getElementById('opt-colors-path').value.trim() || '~/.config/matugen/generated/firefox_websites.css',
        websitesDir: document.getElementById('opt-websites-dir').value.trim() || '~/.config/dusky_sites'
    };
    Object.assign(config, partialUpdate);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate }).then(() => flashStatus('paths-status'));
});

// === Browser Theme (Palette & Browser Template) ===
const ROLES = [
    { key: 'background', label: 'Background' },
    { key: 'backgroundLight', label: 'Background Light' },
    { key: 'backgroundExtra', label: 'Background Extra' },
    { key: 'accentPrimary', label: 'Accent Primary' },
    { key: 'accentSecondary', label: 'Accent Secondary' },
    { key: 'text', label: 'Text' },
    { key: 'textFocus', label: 'Text Focus' }
];

const CHROME_ELEMENTS = [
    { key: 'toolbar', label: 'Toolbar' },
    { key: 'tab_selected', label: 'Active Tab' },
    { key: 'tab_line', label: 'Active Tab Line' },
    { key: 'toolbar_field', label: 'URL Bar' },
    { key: 'toolbar_field_focus', label: 'URL Bar (Focus)' },
    { key: 'popup', label: 'Menus & Popups' },
    { key: 'sidebar', label: 'Sidebar' }
];

function renderPaletteTemplateForm(colorsData) {
    const container = document.getElementById('palette-template-form');
    if (!container) return;
    container.replaceChildren();

    const tmpl = config.paletteTemplate || {};
    const colorKeys = colorsData ? Object.keys(colorsData).filter(k => !k.endsWith('_rgb')) : [];

    ROLES.forEach(role => {
        const row = document.createElement('div');
        row.className = 'template-row';
        
        const label = document.createElement('div');
        label.className = 'template-label';
        label.textContent = role.label;
        
        const select = document.createElement('select');
        select.className = 'mg-select';
        select.dataset.role = role.key;
        
        const val = tmpl[role.key] || '';
        
        // Add options based on live Matugen data
        if (colorKeys.length === 0) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val || 'Unset';
            select.appendChild(opt);
        } else {
            colorKeys.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = k;
                select.appendChild(opt);
            });
            if (val && !colorKeys.includes(val)) {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val + ' (missing)';
                select.appendChild(opt);
            }
        }
        select.value = val;
        
        select.addEventListener('change', (e) => {
            if (!config.paletteTemplate) config.paletteTemplate = {};
            config.paletteTemplate[e.target.dataset.role] = e.target.value;
            browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { paletteTemplate: config.paletteTemplate } });
        });
        
        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
    });
}

function renderBrowserTemplateForm() {
    const container = document.getElementById('browser-template-form');
    if (!container) return;
    container.replaceChildren();

    const tmpl = config.browserTemplate || {};

    CHROME_ELEMENTS.forEach(el => {
        const row = document.createElement('div');
        row.className = 'template-row';
        
        const label = document.createElement('div');
        label.className = 'template-label';
        label.textContent = el.label;
        
        const select = document.createElement('select');
        select.className = 'mg-select';
        select.dataset.element = el.key;
        
        ROLES.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.key;
            opt.textContent = r.label;
            select.appendChild(opt);
        });
        
        select.value = tmpl[el.key] || 'background';
        
        select.addEventListener('change', (e) => {
            if (!config.browserTemplate) config.browserTemplate = {};
            config.browserTemplate[e.target.dataset.element] = e.target.value;
            browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { browserTemplate: config.browserTemplate } });
        });
        
        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
    });
}

document.getElementById('opt-browser-theme').addEventListener('change', (e) => {
    config.browserThemeEnabled = e.target.checked;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { browserThemeEnabled: e.target.checked } });
});

// === DuckDuckGo ===
document.getElementById('opt-duckduckgo').addEventListener('change', (e) => {
    config.duckduckgoEnabled = e.target.checked;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { duckduckgoEnabled: e.target.checked } });
});

// === userChrome ===
let autoProfilePath = null;
let autoChromePath = null;

function loadProfilePaths() {
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "GET_PROFILE_PATHS" } });
}

document.getElementById('opt-userchrome').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    config.userChromeEnabled = enabled;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { userChromeEnabled: enabled } });
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "WRITE_USER_CHROME", enabled, fontSize: config.fontSize || 13 } });
});

document.getElementById('opt-usercontent').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    config.userContentEnabled = enabled;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { userContentEnabled: enabled } });
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "WRITE_USER_CONTENT", enabled, fontSize: config.fontSize || 13 } });
});

document.getElementById('opt-font-size').addEventListener('change', (e) => {
    const size = parseInt(e.target.value) || 13;
    config.fontSize = size;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { fontSize: size } });
    if (config.userChromeEnabled) {
        browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "SET_FONT_SIZE", fontSize: size } });
    }
});

// === Theme Behavior ===
document.getElementById('opt-transition-speed').addEventListener('input', (e) => {
    document.getElementById('transition-speed-value').textContent = e.target.value + 'ms';
});
document.getElementById('opt-transition-speed').addEventListener('change', (e) => {
    const ms = parseInt(e.target.value);
    config.transitionMs = ms;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { transitionMs: ms } });
});

document.getElementById('opt-auto-dark').addEventListener('change', (e) => {
    config.autoDisableDarkSites = e.target.checked;
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { autoDisableDarkSites: e.target.checked } });
});

document.getElementById('opt-naked').addEventListener('change', (e) => {
    config.nakedMode = e.target.checked;
    updateOptionsVisuals();
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { nakedMode: e.target.checked } });
});

function updateOptionsVisuals() {
    const isNaked = document.getElementById('opt-naked')?.checked;
    const smoothRow = document.getElementById('opt-smooth')?.closest('.setting-row');
    if (smoothRow) smoothRow.style.opacity = isNaked ? '0.5' : '1';
}

function parseTimeString(str) {
    const [h, m] = str.split(':');
    return { hour: parseInt(h), minute: parseInt(m), stringFormat: str };
}

document.getElementById('opt-auto-start').addEventListener('change', (e) => {
    config.autoTimeStart = parseTimeString(e.target.value);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { autoTimeStart: config.autoTimeStart } });
});

document.getElementById('opt-auto-end').addEventListener('change', (e) => {
    config.autoTimeEnd = parseTimeString(e.target.value);
    browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { autoTimeEnd: config.autoTimeEnd } });
});

// === Blocklist ===
function renderBlocklist(filter = '') {
    const container = document.getElementById('blocklist-items');
    if (!container) return;
    container.replaceChildren();
    const list = (config.blocklist || []).filter(d => d.includes(filter));

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'blocklist-empty';
        empty.textContent = filter ? 'No matches' : 'Everything is being themed ✨';
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
document.getElementById('blocklist-search')?.addEventListener('input', (e) => renderBlocklist(e.target.value.trim()));
document.getElementById('blocklist-add-btn')?.addEventListener('click', addBlocklistEntry);
document.getElementById('blocklist-add-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBlocklistEntry(); });

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

// === Host Response Listener ===
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MATUGEN_UPDATE" && msg.data?.colors) {
        if (!config.activePresetId) applySelfTheme(msg.data.colors);
        const warningEl = document.getElementById('paths-warning-group');
        if (warningEl) {
            warningEl.hidden = !(msg.data.status && msg.data.status.some(s => s.includes('not found')));
        }
        renderPaletteTemplateForm(msg.data.colors);
    } else if (msg.type === "CONFIG_RECOVERED") {
        config = msg.config;
        init();
    } else if (msg.type === "HOST_RESPONSE") {
        const data = msg.data;
        if (data.type === "WEBSITE_LIST") {
            const selector = document.getElementById('file-selector');
            if (!selector) return;
            selector.replaceChildren();
            for (const f of data.files) {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                selector.appendChild(opt);
            }
            if (data.files.length > 0) loadFileContent(data.files[0]);
        } else if (data.type === "WEBSITE_CSS") {
            const editor = document.getElementById('css-editor');
            if (editor) editor.value = data.content;
        } else if (data.type === "SAVE_SUCCESS") {
            flashStatus('editor-status');
        } else if (data.type === "PROFILE_PATHS") {
            const el = document.getElementById('profile-path-info');
            if (el) {
                if (data.autoChrome) {
                    el.textContent = `Auto-detected: ${data.autoChrome}`;
                    el.className = 'meta-text success';
                } else {
                    el.textContent = 'Could not auto-detect profile. Firefox restart required if not using standard path.';
                    el.className = 'meta-text error';
                }
            }
        }
    }
});

// === CSS Editor ===
function loadFileList() { browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "LIST_WEBSITES" } }); }
function loadFileContent(filename) { browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "READ_WEBSITE_CSS", filename } }); }
document.getElementById('refresh-files')?.addEventListener('click', loadFileList);
document.getElementById('file-selector')?.addEventListener('change', (e) => loadFileContent(e.target.value));
document.getElementById('save-css-btn')?.addEventListener('click', () => {
    const filename = document.getElementById('file-selector').value;
    const content = document.getElementById('css-editor').value;
    if (filename) browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "SAVE_WEBSITE_CSS", filename, content } });
});

// === System ===
function updateSystemStatus(status) {
    const dot = document.getElementById('host-dot');
    const text = document.getElementById('host-status-text');
    const sync = document.getElementById('host-sync-text');
    if (!dot) return;

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

// === Helpers ===
function flashStatus(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2000);
    }
}

// === Presets Logic (Slimmed down for options page) ===
function renderPresets() {
    const grid = document.getElementById('presets-grid');
    if (!grid) return;
    grid.replaceChildren();
    
    const presets = config.presets || [];
    presets.forEach(preset => {
        const card = document.createElement('div');
        card.className = `preset-card ${config.activePresetId === preset.id ? 'active' : ''}`;
        card.innerHTML = `<div class="preset-card-name">${preset.name}</div>`;
        grid.appendChild(card);
    });
}
