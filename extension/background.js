/* ═══════════════════════════════════════════
   MatugenFox Background — Central State
   ═══════════════════════════════════════════ */

// === Central State ===
let port = null;
let reconnectDelay = 5000;
const MAX_RECONNECT_DELAY = 300000;
let reconnectTimeoutId = null;
let isConnecting = false;

const state = {
    shouldConnect: true,
    lastThemeData: null,
    lastSyncTime: null,
    pauseUntil: null,      // null = not paused, -1 = until restart, timestamp = timed pause
    lastAppliedSites: {},  // { "github.com": 1712345678 } — per-site theme timestamps
    hasPromptedForPaths: false,
};

// === Config (from storage) ===
const DEFAULT_CONFIG = {
    colorsPath: "~/.config/matugen/generated/firefox_websites.css",
    websitesDir: "~/.config/dusky_sites",
    ecoMode: true,
    smoothTransitions: false,
    showSyncIndicator: true,
    transitionMs: 300,
    autoDisableDarkSites: false,
    nakedMode: false,
    presets: [],
    blocklist: [],
    tempColors: null,
    activePresetId: null
};

let config = { ...DEFAULT_CONFIG };
let configWritePromise = Promise.resolve();

browser.storage.local.get("config").then(res => { 
    if (res.config) {
        config = { ...DEFAULT_CONFIG, ...res.config }; 
    } else {
        browser.storage.local.set({ config });
    }
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.config) {
        const oldActiveId = config.activePresetId;
        config = changes.config.newValue || {};
        
        // React to preset changes
        if (oldActiveId !== config.activePresetId || changes.config.newValue.tempColors) {
            broadcastToTabs(state.lastThemeData);
        }
        
        sendConfigToHost();
        // Save to native host for ultra-persistence
        if (port) port.postMessage({ type: "SAVE_CONFIG", config });
    }
});

let updateTimeout = null;
let pauseCheckInterval = null;

// === Pause Logic ===
function isPaused() {
    if (!state.pauseUntil) return false;
    if (state.pauseUntil === -1) return true; // until restart
    return Date.now() < state.pauseUntil;
}

function startPauseCheck() {
    if (pauseCheckInterval) clearInterval(pauseCheckInterval);
    pauseCheckInterval = setInterval(() => {
        if (state.pauseUntil && state.pauseUntil !== -1 && Date.now() >= state.pauseUntil) {
            state.pauseUntil = null;
            clearInterval(pauseCheckInterval);
            pauseCheckInterval = null;
            // Resume: broadcast latest theme
            if (state.lastThemeData) broadcastToTabs(state.lastThemeData);
        }
    }, 30000);
}

// === Native Host Connection ===
function connect() {
    if (!state.shouldConnect || isConnecting) return;
    if (port) return; 
    isConnecting = true;
    console.log("MatugenFox: Connecting to native host...");
    port = browser.runtime.connectNative("matugenfox");
    isConnecting = false;
    
    // Request permanent config from host immediately on connection
    port.postMessage({ type: "GET_CONFIG" });
    
    sendConfigToHost();

    port.onMessage.addListener((message) => {
        reconnectDelay = 5000;
        if (message.colors) {
            state.lastThemeData = message;
            state.lastSyncTime = Date.now() / 1000;
            browser.storage.local.set({ themeData: message });

            if (message.status && message.status.some(s => s.includes("not found"))) {
                if (!state.hasPromptedForPaths) {
                    state.hasPromptedForPaths = true;
                    browser.runtime.openOptionsPage();
                }
            } else {
                state.hasPromptedForPaths = false;
            }

            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                if (!isPaused()) broadcastToTabs(message);
                updateTimeout = null;
            }, 500);
        } else if (message.type === "STORED_CONFIG") {
            if (message.config && Object.keys(message.config).length > 0) {
                // Host config overrides if newer or if storage was wiped
                config = { ...config, ...message.config };
                browser.storage.local.set({ config });
                // Broadcast to options page so it refreshes the UI
                browser.runtime.sendMessage({ type: "CONFIG_RECOVERED", config }).catch(() => {});
            }
        } else {
            browser.runtime.sendMessage({ type: "HOST_RESPONSE", data: message }).catch(() => {});
        }
    });

    port.onDisconnect.addListener((p) => {
        if (p.error) console.error("MatugenFox: Disconnected:", p.error.message);
        port = null;
        if (state.shouldConnect) {
            if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
            reconnectTimeoutId = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
    });
}

function sendConfigToHost() {
    if (!port) return;
    if (Object.keys(config).length > 0) {
        port.postMessage({ type: "SET_CONFIG", config });
    }
}

// === Theme Resolution ===
function resolveThemeData(baseThemeData) {
    // If we have no base theme, we still want presets to work
    let resolved = baseThemeData ? { ...baseThemeData } : { colors: {}, websites: {}, timestamp: Date.now() / 1000 };
    let colors = { ...resolved.colors };
    let isPresetActive = false;
    
    // 1. Check for active preset
    if (config.activePresetId && config.presets) {
        const preset = config.presets.find(p => p.id === config.activePresetId);
        if (preset) {
            colors = { ...colors, ...preset.colors };
            isPresetActive = true;
        }
    }

    // 2. Overwrite with tempColors (Live Preview) - highest priority
    if (config.tempColors) {
        colors = { ...colors, ...config.tempColors };
        isPresetActive = true;
    }
    
    // If a preset is active, we must ensure the timestamp is fresh so content scripts don't cache
    if (isPresetActive) {
        resolved.timestamp = Date.now() / 1000;
    }

    resolved.colors = colors;
    return resolved;
}

// === Tab Communication ===
function filterWebsitesForTab(url, websites) {
    if (!url || !websites) return "";
    try {
        const hostname = new URL(url).hostname;
        let siteCss = "";
        for (const [domain, css] of Object.entries(websites)) {
            if (hostname === domain || hostname.endsWith("." + domain)) {
                siteCss += `/* MatugenFox: ${domain} */\n${css}\n`;
            }
        }
        return siteCss;
    } catch { return ""; }
}

let currentBroadcastToken = 0;

function broadcastToTabs(themeData) {
    const resolved = resolveThemeData(themeData);
    if (!resolved || Object.keys(resolved.colors).length === 0) return;

    const isEcoMode = config.ecoMode || false;
    currentBroadcastToken++;
    const token = currentBroadcastToken;
    
    browser.tabs.query({ discarded: false, status: "complete" }).then((tabs) => {
        tabs.forEach((tab, index) => {
            if (isEcoMode) {
                if (tab.active) sendToTab(tab.id, resolved, tab.url);
            } else {
                setTimeout(() => {
                    if (currentBroadcastToken === token) sendToTab(tab.id, resolved, tab.url);
                }, index * 50);
            }
        });
    }).catch(() => {});
}

function sendToTab(tabId, themeData, url, force = false) {
    const resolved = resolveThemeData(themeData);
    if (!resolved || Object.keys(resolved.colors).length === 0) return;

    try {
        const hostname = new URL(url).hostname;
        if (hostname) {
            state.lastAppliedSites[hostname] = Date.now() / 1000;
            const keys = Object.keys(state.lastAppliedSites);
            if (keys.length > 500) {
                const oldest = keys.sort((a, b) => state.lastAppliedSites[a] - state.lastAppliedSites[b])[0];
                delete state.lastAppliedSites[oldest];
            }
        }
    } catch {}

    browser.tabs.sendMessage(tabId, {
        type: "MATUGEN_UPDATE",
        data: {
            colors: resolved.colors,
            websiteCss: filterWebsitesForTab(url, resolved.websites),
            timestamp: resolved.timestamp,
            force: force,
        },
    }).catch(() => {});
}

function broadcastRollbackToTabs() {
    browser.tabs.query({ discarded: false, status: "complete" }).then((tabs) => {
        tabs.forEach((tab) => {
            browser.tabs.sendMessage(tab.id, { type: "MATUGEN_ROLLBACK" }).catch(() => {});
        });
    }).catch(() => {});
}

// === Tab Events ===
browser.tabs.onActivated.addListener((activeInfo) => {
    if (config.ecoMode && !isPaused()) {
        const themeData = state.lastThemeData;
        if (themeData) {
            browser.tabs.get(activeInfo.tabId).then(tab => {
                sendToTab(activeInfo.tabId, themeData, tab.url);
            }).catch(() => {});
        }
    }
    updateContextMenuTitle(activeInfo.tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
        if (config.ecoMode && !isPaused() && state.lastThemeData) {
            sendToTab(tabId, state.lastThemeData, tab.url);
        }
        updateContextMenuTitle(tabId);
    }
});

// === Message Handler ===
browser.runtime.onMessage.addListener((request, sender) => {
    switch (request.type) {
        case "UPDATE_CONFIG":
            config = { ...config, ...request.partialUpdate };
            return browser.storage.local.set({ config }).then(() => {
                sendConfigToHost();
                // Save to native host
                try {
                    if (port) port.postMessage({ type: "SAVE_CONFIG", config });
                } catch (e) { console.error("Host save failed:", e); }
                
                // Force broadcast when these keys change
                if ('activePresetId' in request.partialUpdate || 'tempColors' in request.partialUpdate) {
                    broadcastToTabs(state.lastThemeData);
                }
                return { ok: true };
            });

        case "SET_CONFIG":
            config = request.config;
            return browser.storage.local.set({ config }).then(() => {
                sendConfigToHost();
                try {
                    if (port) port.postMessage({ type: "SAVE_CONFIG", config });
                } catch (e) { console.error("Host save failed:", e); }
                broadcastToTabs(state.lastThemeData);
                return { ok: true };
            });

        case "GET_THEME_DATA": {
            const data = resolveThemeData(state.lastThemeData);
            // If resolved data has no colors, try to pull from storage
            if (!data || !data.colors || Object.keys(data.colors).length === 0) {
                return browser.storage.local.get("themeData").then(res => {
                    if (res.themeData) state.lastThemeData = res.themeData;
                    const resolved = resolveThemeData(res.themeData);
                    if (!resolved || !resolved.colors || Object.keys(resolved.colors).length === 0) return null;
                    return {
                        colors: resolved.colors,
                        websiteCss: filterWebsitesForTab(sender.tab?.url, resolved.websites),
                        timestamp: resolved.timestamp,
                        status: resolved.status,
                    };
                });
            }
            return Promise.resolve({
                colors: data.colors,
                websiteCss: filterWebsitesForTab(sender.tab?.url, data.websites),
                timestamp: data.timestamp,
                status: data.status,
            });
        }

        case "GET_STATUS":
            return Promise.resolve({
                connected: !!port,
                manuallyStopped: !state.shouldConnect,
                paused: isPaused(),
                pauseUntil: state.pauseUntil,
                lastSyncTime: state.lastSyncTime,
                lastAppliedSites: state.lastAppliedSites,
            });

        case "RECONNECT":
            state.shouldConnect = true;
            reconnectDelay = 5000;
            if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
            if (port) { port.disconnect(); port = null; }
            connect();
            return Promise.resolve({ status: "reconnecting" });

        case "DISCONNECT":
            state.shouldConnect = false;
            if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
            if (port) { port.disconnect(); port = null; }
            broadcastRollbackToTabs();
            return Promise.resolve({ status: "disconnected" });

        case "PAUSE":
            if (request.duration === -1) {
                state.pauseUntil = -1;
            } else {
                state.pauseUntil = Date.now() + request.duration;
                startPauseCheck();
            }
            broadcastRollbackToTabs();
            return Promise.resolve({ status: "paused" });

        case "RESUME":
            state.pauseUntil = null;
            if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null; }
            if (state.lastThemeData) broadcastToTabs(state.lastThemeData);
            return Promise.resolve({ status: "resumed" });

        case "REAPPLY_THEME": {
            const tabUrl = sender.tab?.url;
            if (state.lastThemeData && sender.tab) {
                sendToTab(sender.tab.id, state.lastThemeData, tabUrl, true);
            } else if (state.lastThemeData) {
                browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                    if (tab) sendToTab(tab.id, state.lastThemeData, tab.url, true);
                });
            }
            return Promise.resolve({ status: "reapplied" });
        }

        case "TOGGLE_SITE_BLOCK": {
            const hostname = request.hostname;
            if (!hostname) return Promise.resolve({ ok: false, blocked: false });
            const blocklist = [...(config.blocklist || [])];
            const idx = blocklist.indexOf(hostname);
            if (idx >= 0) blocklist.splice(idx, 1);
            else blocklist.push(hostname);
            config = { ...config, blocklist };
            configWritePromise = configWritePromise.then(() => browser.storage.sync.set({ config }));
            return configWritePromise.then(() => {
                sendConfigToHost();
                return { ok: true, blocked: idx < 0 };
            });
        }
    }
});

// === Shortcuts & Menus ===
browser.commands.onCommand.addListener((command) => {
    if (command === "toggle-theming") {
        if (state.shouldConnect && port) {
            state.shouldConnect = false;
            if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
            if (port) { port.disconnect(); port = null; }
            broadcastRollbackToTabs();
        } else {
            state.shouldConnect = true;
            reconnectDelay = 5000;
            if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
            connect();
        }
    } else if (command === "toggle-pause") {
        if (isPaused()) {
            state.pauseUntil = null;
            if (state.lastThemeData) broadcastToTabs(state.lastThemeData);
        } else {
            state.pauseUntil = Date.now() + 600000;
            startPauseCheck();
            broadcastRollbackToTabs();
        }
    }
});

function setupContextMenus() {
    browser.menus.create({ id: "matugenfox-toggle-site", title: "Disable on this site", contexts: ["page"] });
    browser.menus.create({ id: "matugenfox-reapply", title: "Reapply theme", contexts: ["page"] });
}

function updateContextMenuTitle(tabId) {
    browser.tabs.get(tabId).then(tab => {
        try {
            const hostname = new URL(tab.url).hostname;
            const isBlocked = (config.blocklist || []).some(d => hostname === d || hostname.endsWith('.' + d));
            browser.menus.update("matugenfox-toggle-site", { title: isBlocked ? `Enable on ${hostname}` : `Disable on ${hostname}` });
        } catch {}
    }).catch(() => {});
}

browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "matugenfox-toggle-site") {
        try {
            const hostname = new URL(tab.url).hostname;
            browser.runtime.sendMessage({ type: "TOGGLE_SITE_BLOCK", hostname });
        } catch {}
    } else if (info.menuItemId === "matugenfox-reapply") {
        if (state.lastThemeData) sendToTab(tab.id, state.lastThemeData, tab.url, true);
    }
});

setupContextMenus();
connect();
