/* ═══════════════════════════════════════════
   MatugenFox Popup Logic
   ═══════════════════════════════════════════ */

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
    // Auto-detect: fuzzy match unknown variables
    if (!accentSet) {
        for (const [key, value] of Object.entries(colors)) {
            if (key.includes('primary') && !key.includes('on-') && !key.includes('container') && !key.includes('inverse')) {
                root.style.setProperty('--mg-accent', value);
                break;
            }
        }
    }
}

// === State ===
let currentStatus = {};
let currentConfig = {};
let currentHostname = '';

// === Init ===
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

        if (!stored.firstRunDone) {
            document.getElementById('first-run').hidden = false;
        }
    } catch (e) {
        console.error('MatugenFox popup init:', e);
    }
}

// === Status ===
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

// === Palette ===
function updatePalette(data) {
    const palette = document.getElementById('palette-preview');
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

// === Sync Info ===
function updateSyncInfo() {
    const el = document.getElementById('sync-info');
    const t = currentStatus.lastSyncTime;
    if (!t) { el.textContent = 'Waiting for first sync…'; return; }
    const ago = Math.round(Date.now() / 1000 - t);
    if (ago < 5) el.textContent = 'Synced just now';
    else if (ago < 60) el.textContent = `Synced ${ago}s ago`;
    else if (ago < 3600) el.textContent = `Synced ${Math.floor(ago / 60)}m ago`;
    else el.textContent = `Synced ${Math.floor(ago / 3600)}h ago`;
}

// === Site Card ===
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

    // Last-applied-site timestamp
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

// === Controls ===
function updateControls() {
    document.getElementById('toggle-eco').checked = currentConfig.ecoMode || false;
    document.getElementById('toggle-smooth').checked = currentConfig.smoothTransitions !== false;
    document.getElementById('toggle-naked').checked = currentConfig.nakedMode || false;

    // Visual hierarchy: dim smooth if naked is on
    const smoothRow = document.getElementById('row-smooth');
    if (smoothRow) {
        smoothRow.classList.toggle('dimmed', !!currentConfig.nakedMode);
    }

    const pauseSelect = document.getElementById('pause-select');
    if (currentStatus.paused) {
        pauseSelect.classList.add('pause-active');
        pauseSelect.value = currentStatus.pauseUntil === -1 ? '-1' : '0';
    } else {
        pauseSelect.classList.remove('pause-active');
        pauseSelect.value = '0';
    }
}

// === Event Handlers ===

// Toggle site blocklist — OPTIMISTIC UI
document.getElementById('toggle-site-btn').addEventListener('click', async () => {
    const btn = document.getElementById('toggle-site-btn');
    btn.classList.add('mg-click');
    setTimeout(() => btn.classList.remove('mg-click'), 150);

    // Optimistic: toggle blocklist in local state immediately
    const blocklist = currentConfig.blocklist || [];
    const idx = blocklist.indexOf(currentHostname);
    if (idx >= 0) {
        currentConfig.blocklist = blocklist.filter(d => d !== currentHostname);
    } else {
        currentConfig.blocklist = [...blocklist, currentHostname];
    }
    updateSiteCard(); // instant UI update

    // Then confirm with background
    try {
        const res = await browser.runtime.sendMessage({ type: "TOGGLE_SITE_BLOCK", hostname: currentHostname });
        if (!res?.ok) throw new Error();
        const stored = await browser.storage.local.get("config");
        currentConfig = stored.config || {};
        updateSiteCard(); // reconcile
    } catch {
        // Rollback on error
        currentConfig.blocklist = blocklist;
        updateSiteCard();
    }
});

// Quick toggles — optimistic UI with rollback
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

document.getElementById('toggle-eco').addEventListener('change', (e) => {
    updateConfigOptimistically({ ecoMode: e.target.checked }, { ecoMode: !e.target.checked });
});

document.getElementById('toggle-smooth').addEventListener('change', (e) => {
    updateConfigOptimistically({ smoothTransitions: e.target.checked }, { smoothTransitions: !e.target.checked });
});

document.getElementById('toggle-naked').addEventListener('change', (e) => {
    updateConfigOptimistically({ nakedMode: e.target.checked }, { nakedMode: !e.target.checked });
});

// Pause — OPTIMISTIC UI
document.getElementById('pause-select').addEventListener('change', async (e) => {
    const val = parseInt(e.target.value);
    // Optimistic: update status UI immediately
    currentStatus.paused = val !== 0;
    currentStatus.pauseUntil = val === -1 ? -1 : (val > 0 ? Date.now() + val : null);
    updateStatusUI();
    updateControls();

    if (val === 0) {
        await browser.runtime.sendMessage({ type: "RESUME" });
    } else {
        await browser.runtime.sendMessage({ type: "PAUSE", duration: val });
    }
    // Reconcile
    currentStatus = await browser.runtime.sendMessage({ type: "GET_STATUS" }).catch(() => ({}));
    updateStatusUI();
    updateControls();
});

// Reapply
document.getElementById('reapply-btn').addEventListener('click', async () => {
    const btn = document.getElementById('reapply-btn');
    btn.classList.add('mg-click');
    await browser.runtime.sendMessage({ type: "REAPPLY_THEME" });
    // Flash palette to indicate reapply
    const palette = document.getElementById('palette-preview');
    palette.style.borderColor = 'var(--mg-accent)';
    setTimeout(() => { palette.style.borderColor = ''; btn.classList.remove('mg-click'); }, 300);
});

// Settings
document.getElementById('settings-btn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
});

// First run dismiss
document.getElementById('dismiss-firstrun').addEventListener('click', async () => {
    await browser.storage.local.set({ firstRunDone: true });
    document.getElementById('first-run').hidden = true;
});

// === Command Palette ===
const COMMANDS = [
    { label: 'Toggle Theming', icon: '⚡', action: () => browser.runtime.sendMessage({ type: currentStatus.connected ? "DISCONNECT" : "RECONNECT" }).then(init) },
    { label: 'Reapply Theme', icon: '⟳', action: () => browser.runtime.sendMessage({ type: "REAPPLY_THEME" }) },
    { label: 'Toggle Eco Mode', icon: '🔋', action: () => document.getElementById('toggle-eco').click() },
    { label: 'Toggle Naked Mode', icon: '🧊', action: () => document.getElementById('toggle-naked').click() },
    { label: 'Pause 10 Minutes', icon: '⏸', action: () => browser.runtime.sendMessage({ type: "PAUSE", duration: 600000 }).then(init) },
    { label: 'Pause 1 Hour', icon: '⏸', action: () => browser.runtime.sendMessage({ type: "PAUSE", duration: 3600000 }).then(init) },
    { label: 'Resume Theming', icon: '▶', action: () => browser.runtime.sendMessage({ type: "RESUME" }).then(init) },
    { label: 'Toggle Site Block', icon: '🚫', action: () => document.getElementById('toggle-site-btn').click() },
    { label: 'Open Settings', icon: '⚙', action: () => browser.runtime.openOptionsPage() },
];

function toggleCommandPalette() {
    const el = document.getElementById('command-palette');
    el.hidden = !el.hidden;
    if (!el.hidden) {
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

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
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

// Close palette on backdrop click
document.getElementById('command-palette').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

// === Message Listener ===
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MATUGEN_UPDATE" && msg.data) {
        if (msg.data.colors) applySelfTheme(msg.data.colors);
        updatePalette(msg.data);
        if (currentStatus) currentStatus.lastSyncTime = Math.floor(Date.now() / 1000);
        updateSyncInfo();
    }
});

// === Init ===
init();
