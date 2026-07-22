/* ═══════════════════════════════════════════
   MatugenFox Popup Logic — v2.0.0
   ═══════════════════════════════════════════ */

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
            if (key.includes('primary') && !key.includes('on_') && !key.includes('on-') && !key.includes('container') && !key.includes('inverse')) {
                root.style.setProperty('--mg-accent', value);
                break;
            }
        }
    }
}

// ═══════════════════════════════════════════
// === Notification System (Disabled) ===
// ═══════════════════════════════════════════

function showNotification(title, message, isError = false) {
    // Toasts disabled per user request
}

// ═══════════════════════════════════════════
// === State ===
// ═══════════════════════════════════════════
let currentStatus = {};
let currentConfig = {};
let currentHostname = '';
let isFetching = false;

// ═══════════════════════════════════════════
// === Init ===
// ═══════════════════════════════════════════
async function init() {
    try {
        const [statusRes, themeData, tabs, stored] = await Promise.all([
            browser.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => ({})),
            browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).catch(() => null),
            browser.tabs.query({ active: true, currentWindow: true }),
            browser.storage.local.get(["config", "firstRunDone"]),
        ]);

        currentStatus = statusRes || {};
        currentConfig = stored.config || {};

        try { currentHostname = new URL(tabs[0]?.url || '').hostname; }
        catch { currentHostname = ''; }

        if (themeData?.colors) applySelfTheme(themeData.colors);

        updateStatusUI();
        updatePalette(themeData);
        updateSyncInfo();
        updateSiteCard();
        updateControls();
        updateThemeSource();
        updateModeButtons();
        updateModeInfo();

        if (!stored.firstRunDone) {
            document.getElementById('first-run').hidden = false;
        }
    } catch (e) {
        console.error('MatugenFox popup init:', e);
    }
}

// ═══════════════════════════════════════════
// === Status Badge ===
// ═══════════════════════════════════════════
function updateStatusUI() {
    const badge = document.getElementById('status-badge');
    const label = document.getElementById('status-label');
    const dot = badge.querySelector('.mg-badge-dot');
    dot.classList.remove('mg-pulse');

    if (currentStatus.paused) {
        badge.className = 'mg-badge mg-badge-warning';
        label.textContent = 'Paused';
    } else if (currentStatus.connected) {
        badge.className = 'mg-badge mg-badge-success';
        label.textContent = 'Connected';
        dot.classList.add('mg-pulse');
    } else if (currentStatus.manuallyStopped) {
        badge.className = 'mg-badge mg-badge-error';
        label.textContent = 'Stopped';
    } else {
        badge.className = 'mg-badge mg-badge-muted';
        label.textContent = 'Disconnected';
    }
}

// ═══════════════════════════════════════════
// === Theme Mode Switcher ===
// ═══════════════════════════════════════════
function updateModeButtons() {
    const mode = currentConfig.themeMode || 'dark';
    document.querySelectorAll('.popup-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

function updateModeInfo() {
    const el = document.getElementById('mode-info');
    if (!el) return;
    const mode = currentConfig.themeMode || 'dark';
    const effectiveMode = currentStatus.effectiveMode || mode;

    if (mode === 'auto') {
        const start = currentConfig.autoTimeStart || { stringFormat: '08:00' };
        const end = currentConfig.autoTimeEnd || { stringFormat: '19:00' };
        el.textContent = `Auto: light ${start.stringFormat}–${end.stringFormat} · now ${effectiveMode}`;
    } else {
        el.textContent = '';
    }
}

document.querySelectorAll('.popup-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        btn.classList.add('mg-click');
        setTimeout(() => btn.classList.remove('mg-click'), 150);
        currentConfig.themeMode = mode;
        updateModeButtons();
        const res = await browser.runtime.sendMessage({ type: "SET_THEME_MODE", mode }).catch(() => ({}));
        if (res?.effectiveMode) currentStatus.effectiveMode = res.effectiveMode;
        updateModeInfo();
        showNotification(`${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`, `Switched to ${mode} theme mode`);
    });
});

// ═══════════════════════════════════════════
// === Fetch / Disable Buttons ===
// ═══════════════════════════════════════════
document.getElementById('fetch-btn').addEventListener('click', async () => {
    if (isFetching) return;
    const btn = document.getElementById('fetch-btn');
    isFetching = true;
    btn.classList.add('mg-btn-loading');
    btn.querySelector('span:first-child').textContent = '⏳';

    try {
        const res = await browser.runtime.sendMessage({ type: "FETCH_THEME" }).catch(() => ({}));
        if (!currentStatus.connected) {
            showNotification('Not Connected', 'Native host is not connected', true);
        } else {
            showNotification('Fetching Colors', 'Re-reading Matugen color files…');
        }
    } finally {
        setTimeout(() => {
            isFetching = false;
            btn.classList.remove('mg-btn-loading');
            btn.querySelector('span:first-child').textContent = '↻';
        }, 1500);
    }
});

document.getElementById('disable-btn').addEventListener('click', async () => {
    const btn = document.getElementById('disable-btn');
    btn.classList.add('mg-click');
    setTimeout(() => btn.classList.remove('mg-click'), 150);

    await browser.runtime.sendMessage({ type: "DISCONNECT" }).catch(() => {});
    currentStatus.manuallyStopped = true;
    currentStatus.connected = false;
    updateStatusUI();
    showNotification('Theme Disabled', 'Theming has been disabled on all pages');
});

// ═══════════════════════════════════════════
// === Palette Preview ===
// ═══════════════════════════════════════════
function updatePalette(data) {
    const palette = document.getElementById('palette-preview');
    if (!palette) return;
    palette.replaceChildren();

    if (!data?.colors) {
        const empty = document.createElement('div');
        empty.className = 'popup-palette-empty';
        empty.innerHTML = 'No theme yet<br><span style="font-size:11px;color:var(--mg-text-2)">Start Matugen to generate one</span>';
        palette.appendChild(empty);
        return;
    }

    const colorNames = Object.keys(data.colors)
        .filter(n => !n.endsWith('_rgb'))
        .slice(0, 16);

    for (const name of colorNames) {
        const swatch = document.createElement('div');
        swatch.className = 'popup-swatch';
        swatch.style.backgroundColor = data.colors[name];
        swatch.title = `${name}: ${data.colors[name]}`;
        palette.appendChild(swatch);
    }
}

// ═══════════════════════════════════════════
// === Sync Info ===
// ═══════════════════════════════════════════
function updateSyncInfo() {
    const el = document.getElementById('sync-info');
    if (!el) return;
    const t = currentStatus.lastSyncTime;
    if (!t) { el.textContent = 'Waiting for first sync…'; return; }
    const ago = Math.round(Date.now() / 1000 - t);
    if (ago < 5) el.textContent = 'Synced just now';
    else if (ago < 60) el.textContent = `Synced ${ago}s ago`;
    else if (ago < 3600) el.textContent = `Synced ${Math.floor(ago / 60)}m ago`;
    else el.textContent = `Synced ${Math.floor(ago / 3600)}h ago`;
}

// ═══════════════════════════════════════════
// === Site Card ===
// ═══════════════════════════════════════════
function updateSiteCard() {
    const card = document.getElementById('site-card');
    const hostnameEl = document.getElementById('site-hostname');
    const statusEl = document.getElementById('site-status');
    const toggleBtn = document.getElementById('toggle-site-btn');

    if (!currentHostname) { card.hidden = true; return; }
    card.hidden = false;
    hostnameEl.textContent = currentHostname;

    const isBlocked = (currentConfig.blocklist || []).some(
        d => currentHostname === d || currentHostname.endsWith('.' + d)
    );

    if (isBlocked) {
        statusEl.textContent = 'Blocked';
        statusEl.className = 'mg-badge mg-badge-sm mg-badge-error';
        toggleBtn.textContent = `Enable on ${currentHostname}`;
        toggleBtn.className = 'mg-btn mg-btn-outline mg-btn-full mg-btn-sm mg-btn-success';
    } else {
        statusEl.textContent = 'Themed';
        statusEl.className = 'mg-badge mg-badge-sm mg-badge-success';
        toggleBtn.textContent = `Disable on ${currentHostname}`;
        toggleBtn.className = 'mg-btn mg-btn-outline mg-btn-full mg-btn-sm';
    }

    const siteTime = currentStatus.lastAppliedSites?.[currentHostname];
    let siteMetaEl = document.getElementById('site-meta');
    if (!siteMetaEl) {
        siteMetaEl = document.createElement('div');
        siteMetaEl.id = 'site-meta';
        siteMetaEl.style.cssText = 'font-size:11px;color:var(--mg-text-2);margin-top:2px;';
        card.appendChild(siteMetaEl);
    }
    if (siteTime && !isBlocked) {
        const ago = Math.round(Date.now() / 1000 - siteTime);
        if (ago < 5) siteMetaEl.textContent = 'Last themed just now';
        else if (ago < 60) siteMetaEl.textContent = `Last themed ${ago}s ago`;
        else if (ago < 3600) siteMetaEl.textContent = `Last themed ${Math.floor(ago / 60)}m ago`;
        else siteMetaEl.textContent = `Last themed ${Math.floor(ago / 3600)}h ago`;
    } else {
        siteMetaEl.textContent = '';
    }
}

// ═══════════════════════════════════════════
// === Controls ===
// ═══════════════════════════════════════════
function updateControls() {
    document.getElementById('toggle-browser-theme').checked = currentConfig.browserThemeEnabled !== false;
    document.getElementById('toggle-ddg').checked = currentConfig.duckduckgoEnabled || false;
    document.getElementById('toggle-eco').checked = currentConfig.ecoMode || false;
    document.getElementById('toggle-smooth').checked = currentConfig.smoothTransitions !== false;
    document.getElementById('toggle-naked').checked = currentConfig.nakedMode || false;

    const smoothRow = document.getElementById('row-smooth');
    if (smoothRow) smoothRow.classList.toggle('dimmed', !!currentConfig.nakedMode);

    const pauseSelect = document.getElementById('pause-select');
    if (currentStatus.paused) {
        pauseSelect.classList.add('pause-active');
        pauseSelect.value = currentStatus.pauseUntil === -1 ? '-1' : '0';
    } else {
        pauseSelect.classList.remove('pause-active');
        pauseSelect.value = '0';
    }
}

// ═══════════════════════════════════════════
// === Theme Source ===
// ═══════════════════════════════════════════
function updateThemeSource() {
    const select = document.getElementById('theme-source-select');
    if (!select) return;
    const firstOption = select.options[0];
    select.replaceChildren();
    select.appendChild(firstOption);
    const presets = currentConfig.presets || [];
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
    select.value = currentConfig.activePresetId || "";
}

// ═══════════════════════════════════════════
// === Event Handlers ===
// ═══════════════════════════════════════════

document.getElementById('theme-source-select').addEventListener('change', async (e) => {
    const activePresetId = e.target.value || null;
    await browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { activePresetId } });
    const themeData = await browser.runtime.sendMessage({ type: "GET_THEME_DATA" });
    if (themeData?.colors) applySelfTheme(themeData.colors);
    updatePalette(themeData);
});

document.getElementById('toggle-site-btn').addEventListener('click', async () => {
    const btn = document.getElementById('toggle-site-btn');
    btn.classList.add('mg-click');
    setTimeout(() => btn.classList.remove('mg-click'), 150);

    const blocklist = currentConfig.blocklist || [];
    const idx = blocklist.indexOf(currentHostname);
    if (idx >= 0) {
        currentConfig.blocklist = blocklist.filter(d => d !== currentHostname);
    } else {
        currentConfig.blocklist = [...blocklist, currentHostname];
    }
    updateSiteCard();

    try {
        const res = await browser.runtime.sendMessage({ type: "TOGGLE_SITE_BLOCK", hostname: currentHostname });
        if (!res?.ok) throw new Error();
        const stored = await browser.storage.local.get("config");
        currentConfig = stored.config || {};
        updateSiteCard();
        showNotification(
            idx >= 0 ? 'Site Unblocked' : 'Site Blocked',
            `${currentHostname} is now ${idx >= 0 ? 'themed' : 'blocked'}`
        );
    } catch {
        currentConfig.blocklist = blocklist;
        updateSiteCard();
    }
});

async function updateConfigOptimistically(partialUpdate, rollbackState) {
    Object.assign(currentConfig, partialUpdate);
    updateControls();
    try {
        const res = await browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate });
        if (!res?.ok) throw new Error();
    } catch {
        Object.assign(currentConfig, rollbackState);
        updateControls();
    }
}

document.getElementById('toggle-browser-theme').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateConfigOptimistically({ browserThemeEnabled: enabled }, { browserThemeEnabled: !enabled });
    showNotification('Browser Theme', enabled ? 'Firefox chrome theming enabled' : 'Firefox chrome theming disabled');
});

document.getElementById('toggle-ddg').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateConfigOptimistically({ duckduckgoEnabled: enabled }, { duckduckgoEnabled: !enabled });
    showNotification('DuckDuckGo', enabled ? 'DDG theme integration enabled' : 'DDG theme integration disabled');
});

document.getElementById('toggle-eco').addEventListener('change', (e) => {
    updateConfigOptimistically({ ecoMode: e.target.checked }, { ecoMode: !e.target.checked });
});

document.getElementById('toggle-smooth').addEventListener('change', (e) => {
    updateConfigOptimistically({ smoothTransitions: e.target.checked }, { smoothTransitions: !e.target.checked });
});

document.getElementById('toggle-naked').addEventListener('change', (e) => {
    updateConfigOptimistically({ nakedMode: e.target.checked }, { nakedMode: !e.target.checked });
});

document.getElementById('pause-select').addEventListener('change', async (e) => {
    const val = parseInt(e.target.value);
    currentStatus.paused = val !== 0;
    currentStatus.pauseUntil = val === -1 ? -1 : (val > 0 ? Date.now() + val : null);
    updateStatusUI();
    updateControls();

    if (val === 0) {
        await browser.runtime.sendMessage({ type: "RESUME" });
        showNotification('Resumed', 'Theming has been resumed');
    } else {
        await browser.runtime.sendMessage({ type: "PAUSE", duration: val });
        const label = val === -1 ? 'until restart' : val === 600000 ? '10 min' : '1 hour';
        showNotification('Paused', `Theming paused for ${label}`);
    }
    currentStatus = await browser.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => ({}));
    updateStatusUI();
    updateControls();
});

document.getElementById('reapply-btn').addEventListener('click', async () => {
    const btn = document.getElementById('reapply-btn');
    btn.classList.add('mg-click');
    await browser.runtime.sendMessage({ type: "REAPPLY_THEME" });
    const palette = document.getElementById('palette-preview');
    if (palette) {
        palette.style.borderColor = 'var(--mg-accent)';
        setTimeout(() => { palette.style.borderColor = ''; btn.classList.remove('mg-click'); }, 300);
    }
    showNotification('Reapplied', 'Theme reapplied to current tab');
});

document.getElementById('settings-btn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

document.getElementById('dismiss-firstrun').addEventListener('click', async () => {
    await browser.storage.local.set({ firstRunDone: true });
    document.getElementById('first-run').hidden = true;
});

// ═══════════════════════════════════════════
// === Command Palette ===
// ═══════════════════════════════════════════
let COMMANDS = [];

function updateCommandList() {
    COMMANDS = [
        { label: 'Fetch Matugen Colors', icon: '↻', action: () => document.getElementById('fetch-btn').click() },
        { label: 'Toggle Theming', icon: '⚡', action: () => browser.runtime.sendMessage({ type: currentStatus.connected ? "DISCONNECT" : "RECONNECT" }).then(init) },
        { label: 'Disable Theme', icon: '✕', action: () => document.getElementById('disable-btn').click() },
        { label: 'Reapply Theme', icon: '⟳', action: () => browser.runtime.sendMessage({ type: "REAPPLY_THEME" }) },
        { label: '---', type: 'separator' },
        { label: 'Dark Mode', icon: '🌙', action: () => browser.runtime.sendMessage({ type: "SET_THEME_MODE", mode: "dark" }).then(init) },
        { label: 'Light Mode', icon: '☀️', action: () => browser.runtime.sendMessage({ type: "SET_THEME_MODE", mode: "light" }).then(init) },
        { label: 'Auto Mode', icon: '🔄', action: () => browser.runtime.sendMessage({ type: "SET_THEME_MODE", mode: "auto" }).then(init) },
        { label: '---', type: 'separator' },
        { label: 'Live Matugen', icon: '✨', action: () => {
            browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { activePresetId: null } }).then(init);
        }},
    ];

    const presets = currentConfig.presets || [];
    presets.forEach(p => {
        COMMANDS.push({
            label: `Apply Preset: ${p.name}`,
            icon: '🔖',
            action: () => browser.runtime.sendMessage({ type: "UPDATE_CONFIG", partialUpdate: { activePresetId: p.id } }).then(init),
        });
    });

    COMMANDS.push(
        { label: '---', type: 'separator' },
        { label: 'Toggle Browser Theme', icon: '🌐', action: () => document.getElementById('toggle-browser-theme').click() },
        { label: 'Toggle DuckDuckGo Theme', icon: '🦆', action: () => document.getElementById('toggle-ddg').click() },
        { label: 'Toggle Eco Mode', icon: '🔋', action: () => document.getElementById('toggle-eco').click() },
        { label: 'Toggle Naked Mode', icon: '🧊', action: () => document.getElementById('toggle-naked').click() },
        { label: 'Pause 10 Minutes', icon: '⏸', action: () => browser.runtime.sendMessage({ type: "PAUSE", duration: 600000 }).then(init) },
        { label: 'Resume Theming', icon: '▶', action: () => browser.runtime.sendMessage({ type: "RESUME" }).then(init) },
        { label: 'Toggle Site Block', icon: '🚫', action: () => document.getElementById('toggle-site-btn').click() },
        { label: 'Open Settings', icon: '⚙', action: () => browser.runtime.openOptionsPage() }
    );
}

function toggleCommandPalette() {
    const el = document.getElementById('command-palette');
    el.hidden = !el.hidden;
    if (!el.hidden) {
        updateCommandList();
        const input = document.getElementById('cmd-input');
        input.value = '';
        input.focus();
        renderCommands('');
    }
}

function renderCommands(query) {
    const results = document.getElementById('cmd-results');
    results.replaceChildren();
    const q = query.toLowerCase();
    const filtered = q ? COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : COMMANDS;

    filtered.forEach((cmd) => {
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
            toggleCommandPalette();
            cmd.action();
        });
        results.appendChild(el);
    });
}

function checkShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.toLowerCase().split('+').map(s => s.trim());
    const key = parts.pop();
    const ctrl = parts.includes('ctrl');
    const alt = parts.includes('alt');
    const shift = parts.includes('shift');
    const meta = parts.includes('meta');
    const eKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return eKey === key && e.ctrlKey === ctrl && e.altKey === alt && e.shiftKey === shift && e.metaKey === meta;
}

document.addEventListener('keydown', (e) => {
    const paletteShortcut = currentConfig.paletteShortcut || 'ctrl+alt+c';
    if (checkShortcut(e, paletteShortcut)) {
        e.preventDefault();
        toggleCommandPalette();
    }
    if (e.key === 'Escape') {
        document.getElementById('command-palette').hidden = true;
    }
});

document.getElementById('cmd-input').addEventListener('input', (e) => {
    renderCommands(e.target.value);
});

document.getElementById('command-palette').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

// ═══════════════════════════════════════════
// === Message Listener ===
// ═══════════════════════════════════════════
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MATUGEN_UPDATE" && msg.data) {
        if (msg.data.colors) applySelfTheme(msg.data.colors);
        updatePalette(msg.data);
        if (currentStatus) currentStatus.lastSyncTime = Math.floor(Date.now() / 1000);
        updateSyncInfo();
    } else if (msg.type === "NOTIFICATION") {
        showNotification(msg.title, msg.message, msg.error);
    } else if (msg.type === "THEME_APPLIED") {
        if (msg.colors) applySelfTheme(msg.colors);
    } else if (msg.type === "HOST_DISCONNECTED") {
        currentStatus.connected = false;
        updateStatusUI();
    } else if (msg.type === "THEME_MODE_CHANGED") {
        currentStatus.effectiveMode = msg.effectiveMode;
        updateModeInfo();
    }
});

// ═══════════════════════════════════════════
// === Init ===
// ═══════════════════════════════════════════
init();
