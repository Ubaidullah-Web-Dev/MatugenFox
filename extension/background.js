/* ═══════════════════════════════════════════
   MatugenFox Background — Central State v2.0
   ═══════════════════════════════════════════ */

'use strict';

// ─── Constants ───
const NATIVE_NAME = 'matugenfox';
const RECONNECT_BASE = 2000;
const RECONNECT_MAX = 300000;

const DEFAULT_CONFIG = {
    colorsPath: '~/.config/matugen/generated/firefox_websites.css',
    websitesDir: '~/.config/dusky_sites',
    ecoMode: true,
    smoothTransitions: true,
    showSyncIndicator: true,
    transitionMs: 300,
    autoDisableDarkSites: false,
    nakedMode: false,
    presets: [],
    blocklist: [],
    tempColors: null,
    activePresetId: null,
    browserThemeEnabled: true,
    themeMode: 'dark',
    autoTimeStart: { hour: 8, minute: 0, stringFormat: '08:00' },
    autoTimeEnd: { hour: 19, minute: 0, stringFormat: '19:00' },
    paletteTemplate: {
        background: '--background',
        backgroundLight: '--surface',
        backgroundExtra: '--surface_container',
        accentPrimary: '--primary',
        accentSecondary: '--secondary',
        text: '--on_background',
        textFocus: '--on_surface',
    },
    browserTemplate: {
        frame: 'background',
        frame_inactive: 'background',
        tab_text: 'textFocus',
        tab_background_text: 'text',
        tab_selected: 'backgroundLight',
        tab_line: 'accentPrimary',
        tab_loading: 'accentPrimary',
        toolbar: 'backgroundLight',
        toolbar_text: 'textFocus',
        toolbar_field: 'backgroundExtra',
        toolbar_field_text: 'textFocus',
        toolbar_field_border: 'backgroundExtra',
        toolbar_field_focus: 'backgroundLight',
        toolbar_field_text_focus: 'textFocus',
        toolbar_field_border_focus: 'accentPrimary',
        toolbar_field_highlight: 'accentPrimary',
        toolbar_field_highlight_text: 'background',
        icons: 'text',
        icons_attention: 'accentPrimary',
        sidebar: 'backgroundLight',
        sidebar_text: 'textFocus',
        sidebar_border: 'backgroundExtra',
        sidebar_highlight: 'accentPrimary',
        sidebar_highlight_text: 'background',
        popup: 'backgroundLight',
        popup_text: 'textFocus',
        popup_border: 'backgroundExtra',
        popup_highlight: 'accentPrimary',
        popup_highlight_text: 'background',
        ntp_background: 'background',
        ntp_text: 'text',
        button_background_hover: 'backgroundExtra',
        button_background_active: 'backgroundExtra',
    },
    duckduckgoEnabled: false,
    userChromeEnabled: false,
    userContentEnabled: false,
    fontSize: 13,
    fetchOnStartup: false,
    updateMuted: false,
    nativeErrorMuted: false,
    paletteShortcut: 'ctrl+alt+c',
};

// ─── State ───
const state = {
    port: null,
    shouldConnect: true,
    isConnecting: false,
    reconnectTimer: null,
    reconnectDelay: RECONNECT_BASE,
    lastThemeData: null,
    lastHash: null,
    pauseUntil: null,
    isApplied: false,
    autoModeTimer: null,
    lastEffectiveMode: null,
    config: { ...DEFAULT_CONFIG },
    blocklistSet: new Set(),
    lastAppliedSites: {},
    hasPromptedPaths: false,
    configWritePromise: Promise.resolve(),
};

let broadcastToken = 0;
const broadcastQueue = new Map();

// ─── Utilities ───
function notifyUI(msg) {
    browser.runtime.sendMessage(msg).catch(() => { });
}

function isPaused() {
    if (!state.pauseUntil) return false;
    if (state.pauseUntil === -1) return true;
    return Date.now() < state.pauseUntil;
}

function getEffectiveMode() {
    if (state.config.themeMode !== 'auto') return state.config.themeMode || 'dark';
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const s = state.config.autoTimeStart || { hour: 8, minute: 0 };
    const e = state.config.autoTimeEnd || { hour: 19, minute: 0 };
    const sMin = s.hour * 60 + s.minute;
    const eMin = e.hour * 60 + e.minute;
    if (sMin <= eMin) return (mins >= sMin && mins < eMin) ? 'light' : 'dark';
    return (mins >= sMin || mins < eMin) ? 'light' : 'dark';
}

function mergeConfig(updates) {
    const m = { ...DEFAULT_CONFIG, ...updates };
    if (updates.paletteTemplate) m.paletteTemplate = { ...DEFAULT_CONFIG.paletteTemplate, ...updates.paletteTemplate };
    if (updates.browserTemplate) m.browserTemplate = { ...DEFAULT_CONFIG.browserTemplate, ...updates.browserTemplate };
    return m;
}

function updateBlocklistSet() {
    state.blocklistSet = new Set(state.config.blocklist || []);
}

function stripConfigForHost(cfg) {
    const { presets, blocklist, tempColors, ...hostCfg } = cfg;
    return hostCfg;
}

// ─── Native Host ───
function connectNative() {
    if (!state.shouldConnect || state.isConnecting || state.port) return;
    state.isConnecting = true;
    try {
        const port = browser.runtime.connectNative(NATIVE_NAME);
        state.port = port;
        state.reconnectDelay = RECONNECT_BASE;

        port.onMessage.addListener(handleHostMessage);
        port.onDisconnect.addListener(handleHostDisconnect);

        safePostMessage({ type: 'GET_CONFIG' });
        safePostMessage({ type: 'SET_CONFIG', config: stripConfigForHost(state.config) });
        safePostMessage({ type: 'FETCH_NOW' });

        notifyUI({ type: 'HOST_STATUS', connected: true });
    } catch (err) {
        console.error('MatugenFox: connectNative error:', err);
        scheduleReconnect();
    } finally {
        state.isConnecting = false;
    }
}

function safePostMessage(msg) {
    if (!state.port) return false;
    try {
        state.port.postMessage(msg);
        return true;
    } catch (e) {
        console.warn('MatugenFox: postMessage failed:', e);
        state.port = null;
        scheduleReconnect();
        return false;
    }
}

function handleHostDisconnect(p) {
    const err = p.error?.message || 'unknown';
    console.error('MatugenFox: host disconnected:', err);
    state.port = null;
    notifyUI({ type: 'HOST_STATUS', connected: false, error: err, manuallyStopped: !state.shouldConnect });
    if (state.shouldConnect) scheduleReconnect();
}

function scheduleReconnect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        connectNative();
    }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, RECONNECT_MAX);
}

function disconnectNative() {
    state.shouldConnect = false;
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    if (state.port) { try { state.port.disconnect(); } catch { } state.port = null; }
    broadcastRollback();
    resetBrowserTheme();
    resetDDGTheme();
    state.isApplied = false;
}

// ─── Theme Resolution ───
function resolveThemeData() {
    if (!state.lastThemeData) return null;
    const data = {
        ...state.lastThemeData,
        colors: { ...state.lastThemeData.colors },
    };
    let modified = false;

    if (state.config.activePresetId && state.config.presets) {
        const preset = state.config.presets.find(p => p.id === state.config.activePresetId);
        if (preset?.colors) {
            Object.assign(data.colors, preset.colors);
            modified = true;
        }
    }
    if (state.config.tempColors) {
        Object.assign(data.colors, state.config.tempColors);
        modified = true;
    }
    if (modified) data.timestamp = Date.now() / 1000;
    return data;
}

// ─── Palette & Browser Theme ───
function buildPalette(colors) {
    const tmpl = state.config.paletteTemplate || DEFAULT_CONFIG.paletteTemplate;
    const palette = {};
    for (const [role, varName] of Object.entries(tmpl)) {
        palette[role] = colors[varName] || colors[varName.replace(/^--/, '')] || null;
    }
    return palette;
}

function buildBrowserThemeColors(colors) {
    const palette = buildPalette(colors);
    const tmpl = state.config.browserTemplate || DEFAULT_CONFIG.browserTemplate;
    const out = {};
    for (const [element, role] of Object.entries(tmpl)) {
        const c = palette[role];
        if (c) out[element] = c;
    }
    return out;
}

function applyBrowserTheme(colors) {
    if (!colors || !state.config.browserThemeEnabled) return;
    const mode = getEffectiveMode();
    const themeColors = buildBrowserThemeColors(colors);
    if (!Object.keys(themeColors).length) return;
    browser.theme.update({
        colors: themeColors,
        properties: { color_scheme: mode, content_color_scheme: mode },
    }).catch(() => { });
    state.isApplied = true;
}

function resetBrowserTheme() {
    browser.theme.reset().catch(() => { });
    state.isApplied = false;
}

// ─── DuckDuckGo ───
function applyDDGTheme(colors) {
    if (!state.config.duckduckgoEnabled || !colors) return;
    const palette = buildPalette(colors);
    const strip = c => (c ? c.replace('#', '') : '');
    const theme = {
        k7: strip(palette.background),
        kj: strip(palette.backgroundLight),
        k9: strip(palette.accentPrimary),
        k8: strip(palette.text),
        kx: strip(palette.accentSecondary),
        kaa: strip(palette.accentPrimary),
        k21: strip(palette.backgroundExtra),
    };
    browser.tabs.query({ url: '*://*.duckduckgo.com/*' }).then(tabs => {
        for (const t of tabs) {
            browser.tabs.sendMessage(t.id, { type: 'MATUGEN_DDG_THEME', theme }).catch(() => { });
        }
    }).catch(() => { });
}

function resetDDGTheme() {
    browser.tabs.query({ url: '*://*.duckduckgo.com/*' }).then(tabs => {
        for (const t of tabs) {
            browser.tabs.sendMessage(t.id, { type: 'MATUGEN_DDG_RESET' }).catch(() => { });
        }
    }).catch(() => { });
}

// ─── Tab Broadcasting ───
function filterWebsiteCss(url, websites) {
    if (!url || !websites) return '';
    try {
        const hostname = new URL(url).hostname;
        let css = '';
        for (const [domain, siteCss] of Object.entries(websites)) {
            if (hostname === domain || hostname.endsWith('.' + domain)) {
                css += `/* ${domain} */\n${siteCss}\n`;
            }
        }
        return css;
    } catch { return ''; }
}

function isUrlBlocked(url) {
    if (!state.blocklistSet.size) return false;
    try {
        const hostname = new URL(url).hostname;
        for (const d of state.blocklistSet) {
            if (hostname === d || hostname.endsWith('.' + d)) return true;
        }
    } catch { }
    return false;
}

function broadcastToTabs(force = false) {
    const data = resolveThemeData();
    if (!data?.colors || !Object.keys(data.colors).length) return;
    const isEco = state.config.ecoMode;
    const token = ++broadcastToken;

    browser.tabs.query({}).then(tabs => {
        if (isEco) {
            const active = tabs.find(t => t.active && !t.discarded);
            if (active) sendToTab(active.id, data, active.url, force);
        } else {
            const targets = tabs.filter(t => t.status === 'complete' && !t.discarded);
            targets.forEach((tab, i) => {
                setTimeout(() => {
                    if (token === broadcastToken) sendToTab(tab.id, data, tab.url, force);
                }, i * 40);
            });
        }
    }).catch(() => { });
}

function sendToTab(tabId, data, url, force = false) {
    if (!url || isUrlBlocked(url)) return;
    try {
        const hostname = new URL(url).hostname;
        state.lastAppliedSites[hostname] = Date.now() / 1000;
        const keys = Object.keys(state.lastAppliedSites);
        if (keys.length > 500) {
            const oldest = keys.sort((a, b) => state.lastAppliedSites[a] - state.lastAppliedSites[b])[0];
            delete state.lastAppliedSites[oldest];
        }
    } catch { }

    if (broadcastQueue.has(tabId)) clearTimeout(broadcastQueue.get(tabId));
    broadcastQueue.set(tabId, setTimeout(() => {
        broadcastQueue.delete(tabId);
        browser.tabs.sendMessage(tabId, {
            type: 'MATUGEN_UPDATE',
            data: {
                colors: data.colors,
                websiteCss: filterWebsiteCss(url, data.websites),
                timestamp: data.timestamp,
                force,
            },
        }).catch(() => { });
    }, 16));
}

function broadcastRollback() {
    browser.tabs.query({}).then(tabs => {
        for (const t of tabs) {
            browser.tabs.sendMessage(t.id, { type: 'MATUGEN_ROLLBACK' }).catch(() => { });
        }
    }).catch(() => { });
}

// ─── Auto Mode ───
function startAutoMode() {
    stopAutoMode();
    state.lastEffectiveMode = getEffectiveMode();
    state.autoModeTimer = setInterval(() => {
        const prev = state.lastEffectiveMode;
        const curr = getEffectiveMode();
        state.lastEffectiveMode = curr;
        if (prev && prev !== curr && state.lastThemeData) {
            const data = resolveThemeData();
            if (state.config.browserThemeEnabled) applyBrowserTheme(data?.colors);
            notifyUI({ type: 'THEME_MODE_CHANGED', effectiveMode: curr });
        }
    }, 30000);
}

function stopAutoMode() {
    if (state.autoModeTimer) { clearInterval(state.autoModeTimer); state.autoModeTimer = null; }
}

// ─── Config Management ───
function loadConfig() {
    browser.storage.local.get(['config', 'themeData']).then(res => {
        if (res.config) state.config = mergeConfig(res.config);
        if (res.themeData) state.lastThemeData = res.themeData;
        updateBlocklistSet();
        if (state.config.themeMode === 'auto') startAutoMode();
        connectNative();
        if (state.config.fetchOnStartup) safePostMessage({ type: 'FETCH_NOW' });
    }).catch(err => console.error('MatugenFox: loadConfig error:', err));
}

function saveConfig(partial = null) {
    if (partial) Object.assign(state.config, partial);
    state.configWritePromise = state.configWritePromise
        .then(() => browser.storage.local.set({ config: state.config }))
        .then(() => {
            safePostMessage({ type: 'SAVE_CONFIG', config: stripConfigForHost(state.config) });
            updateBlocklistSet();
        })
        .catch(err => console.error('MatugenFox: saveConfig error:', err));
    return state.configWritePromise;
}

// ─── Host Message Handler ───
function handleHostMessage(msg) {
    switch (msg.type) {
        case 'MATUGEN_UPDATE': {
            if (!msg.data?.colors) return;
            state.lastThemeData = msg.data;
            state.lastHash = msg.data._hash || JSON.stringify(msg.data.colors);
            browser.storage.local.set({ themeData: msg.data });

            const hasErrors = msg.data.status?.some(s => s.includes('not found'));
            if (hasErrors && !state.hasPromptedPaths) {
                state.hasPromptedPaths = true;
                browser.runtime.openOptionsPage();
            } else if (!hasErrors) {
                state.hasPromptedPaths = false;
            }

            if (!isPaused()) broadcastToTabs();
            if (state.config.browserThemeEnabled) applyBrowserTheme(resolveThemeData()?.colors);
            if (state.config.duckduckgoEnabled) applyDDGTheme(resolveThemeData()?.colors);
            notifyUI({ type: 'THEME_APPLIED', colors: msg.data.colors });
            break;
        }
        case 'STORED_CONFIG': {
            if (msg.config) {
                state.config = mergeConfig({ ...state.config, ...msg.config });
                browser.storage.local.set({ config: state.config });
                notifyUI({ type: 'CONFIG_RECOVERED', config: state.config });
            }
            break;
        }
        case 'SAVE_CONFIG_SUCCESS':
            break;
        default:
            notifyUI({ type: 'HOST_RESPONSE', data: msg });
    }
}

// ─── Message Router ───
browser.runtime.onMessage.addListener((req, sender) => {
    switch (req.type) {
        case 'UPDATE_CONFIG': {
            const oldPreset = state.config.activePresetId;
            const oldMode = state.config.themeMode;
            const oldBrowser = state.config.browserThemeEnabled;
            const oldDDG = state.config.duckduckgoEnabled;
            Object.assign(state.config, req.partialUpdate);
            return saveConfig().then(() => {
                const data = resolveThemeData();
                if ('activePresetId' in req.partialUpdate || 'tempColors' in req.partialUpdate) {
                    broadcastToTabs(true);
                    if (state.config.browserThemeEnabled) applyBrowserTheme(data?.colors);
                }
                if ('themeMode' in req.partialUpdate && oldMode !== state.config.themeMode) handleModeChange();
                if ('browserThemeEnabled' in req.partialUpdate && oldBrowser !== state.config.browserThemeEnabled) {
                    state.config.browserThemeEnabled ? applyBrowserTheme(data?.colors) : resetBrowserTheme();
                }
                if ('duckduckgoEnabled' in req.partialUpdate && oldDDG !== state.config.duckduckgoEnabled) {
                    state.config.duckduckgoEnabled ? applyDDGTheme(data?.colors) : resetDDGTheme();
                }
                if ('paletteTemplate' in req.partialUpdate || 'browserTemplate' in req.partialUpdate) {
                    if (state.config.browserThemeEnabled) applyBrowserTheme(data?.colors);
                }
                return { ok: true };
            });
        }
        case 'SET_CONFIG':
            state.config = mergeConfig(req.config);
            return saveConfig().then(() => {
                broadcastToTabs(true);
                if (state.config.browserThemeEnabled) applyBrowserTheme(resolveThemeData()?.colors);
                return { ok: true };
            });
        case 'GET_THEME_DATA': {
            const data = resolveThemeData();
            if (!data) {
                return browser.storage.local.get('themeData').then(res => {
                    if (!res.themeData) return null;
                    return {
                        colors: res.themeData.colors,
                        websiteCss: filterWebsiteCss(sender.tab?.url, res.themeData.websites),
                        timestamp: res.themeData.timestamp,
                        status: res.themeData.status,
                    };
                });
            }
            return Promise.resolve({
                colors: data.colors,
                websiteCss: filterWebsiteCss(sender.tab?.url, data.websites),
                timestamp: data.timestamp,
                status: data.status,
            });
        }
        case 'GET_STATUS':
            return Promise.resolve({
                connected: !!state.port,
                manuallyStopped: !state.shouldConnect,
                paused: isPaused(),
                pauseUntil: state.pauseUntil,
                lastSyncTime: state.lastThemeData?.timestamp || null,
                lastAppliedSites: state.lastAppliedSites,
                isApplied: state.isApplied,
                effectiveMode: getEffectiveMode(),
            });
        case 'RECONNECT':
            state.shouldConnect = true;
            state.reconnectDelay = RECONNECT_BASE;
            if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
            if (state.port) { try { state.port.disconnect(); } catch { } state.port = null; }
            connectNative();
            return Promise.resolve({ status: 'reconnecting' });
        case 'DISCONNECT':
            disconnectNative();
            return Promise.resolve({ status: 'disconnected' });
        case 'PAUSE':
            state.pauseUntil = req.duration === -1 ? -1 : Date.now() + req.duration;
            startPauseCheck();
            broadcastRollback();
            return Promise.resolve({ status: 'paused' });
        case 'RESUME':
            state.pauseUntil = null;
            stopPauseCheck();
            broadcastToTabs(true);
            return Promise.resolve({ status: 'resumed' });
        case 'REAPPLY_THEME': {
            const tabId = sender.tab?.id;
            if (tabId && state.lastThemeData) sendToTab(tabId, resolveThemeData(), sender.tab.url, true);
            else if (state.lastThemeData) {
                browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                    if (tab) sendToTab(tab.id, resolveThemeData(), tab.url, true);
                });
            }
            return Promise.resolve({ status: 'reapplied' });
        }
        case 'FETCH_THEME':
            if (safePostMessage({ type: 'FETCH_NOW' })) return Promise.resolve({ status: 'fetching' });
            return Promise.resolve({ status: 'error', message: 'Not connected' });
        case 'SET_THEME_MODE':
            state.config.themeMode = req.mode;
            return saveConfig().then(() => {
                handleModeChange();
                return { ok: true, effectiveMode: getEffectiveMode() };
            });
        case 'GET_PALETTE':
            return Promise.resolve({ palette: buildPalette(resolveThemeData()?.colors), colors: resolveThemeData()?.colors });
        case 'APPLY_DDG_THEME':
            if (state.config.duckduckgoEnabled) applyDDGTheme(resolveThemeData()?.colors);
            return Promise.resolve({ ok: true });
        case 'TOGGLE_SITE_BLOCK': {
            const hostname = req.hostname;
            if (!hostname) return Promise.resolve({ ok: false, blocked: false });
            const list = [...(state.config.blocklist || [])];
            const idx = list.indexOf(hostname);
            if (idx >= 0) list.splice(idx, 1); else list.push(hostname);
            state.config.blocklist = list;
            return saveConfig().then(() => {
                browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                    if (!tab) return;
                    if (idx < 0) {
                        browser.tabs.sendMessage(tab.id, { type: 'MATUGEN_ROLLBACK' }).catch(() => { });
                    } else if (state.lastThemeData) {
                        sendToTab(tab.id, resolveThemeData(), tab.url, true);
                    }
                });
                return { ok: true, blocked: idx < 0 };
            });
        }
        case 'HOST_COMMAND':
            safePostMessage(req.command);
            return Promise.resolve({ ok: !!state.port });
        default:
            return false;
    }
});

// ─── Pause Logic ───
let pauseCheckTimer = null;
function startPauseCheck() {
    stopPauseCheck();
    if (state.pauseUntil && state.pauseUntil !== -1) {
        pauseCheckTimer = setInterval(() => {
            if (Date.now() >= state.pauseUntil) {
                state.pauseUntil = null;
                stopPauseCheck();
                broadcastToTabs(true);
            }
        }, 5000);
    }
}
function stopPauseCheck() {
    if (pauseCheckTimer) { clearInterval(pauseCheckTimer); pauseCheckTimer = null; }
}

// ─── Mode Change ───
function handleModeChange() {
    if (state.config.themeMode === 'auto') startAutoMode(); else stopAutoMode();
    const data = resolveThemeData();
    if (state.config.browserThemeEnabled && data) applyBrowserTheme(data.colors);
    notifyUI({ type: 'THEME_MODE_CHANGED', effectiveMode: getEffectiveMode() });
}

// ─── Tab Events ───
browser.tabs.onActivated.addListener((activeInfo) => {
    if (state.config.ecoMode && !isPaused() && state.lastThemeData) {
        browser.tabs.get(activeInfo.tabId).then(tab => {
            sendToTab(tab.id, resolveThemeData(), tab.url);
        }).catch(() => { });
    }
    updateContextMenu(activeInfo.tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active && state.config.ecoMode && !isPaused() && state.lastThemeData) {
        sendToTab(tabId, resolveThemeData(), tab.url);
    }
    if (tab.active) updateContextMenu(tabId);
});

// ─── Context Menu ───
function setupContextMenu() {
    browser.menus.create({ id: 'mf-toggle-site', title: 'Disable on this site', contexts: ['page'] });
    browser.menus.create({ id: 'mf-reapply', title: 'Reapply theme', contexts: ['page'] });
}
function updateContextMenu(tabId) {
    browser.tabs.get(tabId).then(tab => {
        try {
            const hostname = new URL(tab.url).hostname;
            const blocked = state.blocklistSet.has(hostname) || Array.from(state.blocklistSet).some(d => hostname.endsWith('.' + d));
            browser.menus.update('mf-toggle-site', { title: blocked ? `Enable on ${hostname}` : `Disable on ${hostname}` });
        } catch { }
    }).catch(() => { });
}
browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'mf-toggle-site') {
        try { browser.runtime.sendMessage({ type: 'TOGGLE_SITE_BLOCK', hostname: new URL(tab.url).hostname }); } catch { }
    } else if (info.menuItemId === 'mf-reapply') {
        if (state.lastThemeData) sendToTab(tab.id, resolveThemeData(), tab.url, true);
    }
});

// ─── Commands ───
browser.commands.onCommand.addListener(cmd => {
    switch (cmd) {
        case 'toggle-theming':
            state.shouldConnect && state.port ? disconnectNative() : (state.shouldConnect = true, connectNative());
            break;
        case 'toggle-pause':
            isPaused() ? browser.runtime.sendMessage({ type: 'RESUME' }) : browser.runtime.sendMessage({ type: 'PAUSE', duration: 600000 });
            break;
        case 'fetch-theme': safePostMessage({ type: 'FETCH_NOW' }); break;
        case 'disable-theme': disconnectNative(); break;
        case 'enable-dark-mode': browser.runtime.sendMessage({ type: 'SET_THEME_MODE', mode: 'dark' }); break;
        case 'enable-light-mode': browser.runtime.sendMessage({ type: 'SET_THEME_MODE', mode: 'light' }); break;
        case 'enable-auto-mode': browser.runtime.sendMessage({ type: 'SET_THEME_MODE', mode: 'auto' }); break;
    }
});

// ─── Init ───
setupContextMenu();
loadConfig();