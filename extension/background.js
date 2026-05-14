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
};

// === Config (from storage) ===
let config = {};
let configWritePromise = Promise.resolve();

browser.storage.local.get("config").then(res => { config = res.config || {}; });
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) {
        config = changes.config.newValue || {};
        sendConfigToHost();
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
    if (port) return; // Extra guard
    isConnecting = true;
    console.log("MatugenFox: Connecting to native host...");
    port = browser.runtime.connectNative("matugenfox");
    isConnecting = false;
    sendConfigToHost();

    port.onMessage.addListener((message) => {
        reconnectDelay = 5000;
        if (message.colors) {
            state.lastThemeData = message;
            state.lastSyncTime = Date.now() / 1000;
            browser.storage.local.set({ themeData: message });

            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                if (!isPaused()) broadcastToTabs(message);
                updateTimeout = null;
            }, 500);
        } else {
            browser.runtime.sendMessage({ type: "HOST_RESPONSE", data: message }).catch(() => {});
        }
    });

    port.onDisconnect.addListener((p) => {
        if (p.error) console.error("MatugenFox: Disconnected:", p.error.message);
        port = null;
        if (state.shouldConnect) {
            if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
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
    const isEcoMode = config.ecoMode || false;
    currentBroadcastToken++;
    const token = currentBroadcastToken;
    
    browser.tabs.query({ discarded: false, status: "complete" }).then((tabs) => {
        tabs.forEach((tab, index) => {
            if (isEcoMode) {
                if (tab.active) sendToTab(tab.id, themeData, tab.url);
            } else {
                setTimeout(() => {
                    if (currentBroadcastToken === token) sendToTab(tab.id, themeData, tab.url);
                }, index * 50);
            }
        });
    }).catch(() => {});
}

function sendToTab(tabId, themeData, url, force = false) {
    if (!themeData) return;
    // Track per-site application timestamp
    try {
        const hostname = new URL(url).hostname;
        if (hostname) {
            state.lastAppliedSites[hostname] = Date.now() / 1000;
            // LRU cap to prevent memory bloat
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
            colors: themeData.colors,
            websiteCss: filterWebsitesForTab(url, themeData.websites),
            timestamp: themeData.timestamp,
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
        case "CONFIG_UPDATED":
            sendConfigToHost();
            return Promise.resolve();
            
        case "UPDATE_CONFIG":
            config = { ...config, ...request.partialUpdate };
            configWritePromise = configWritePromise.then(() => browser.storage.local.set({ config }));
            return configWritePromise.then(() => {
                sendConfigToHost();
                return { ok: true };
            });

        case "SET_CONFIG":
            config = request.config;
            configWritePromise = configWritePromise.then(() => browser.storage.local.set({ config }));
            return configWritePromise.then(() => {
                sendConfigToHost();
                return { ok: true };
            });

        case "HOST_COMMAND":
            if (port) port.postMessage(request.command);
            return Promise.resolve();

        case "GET_THEME_DATA": {
            const data = state.lastThemeData;
            if (!data) {
                return browser.storage.local.get("themeData").then(res => {
                    state.lastThemeData = res.themeData;
                    if (!res.themeData) return null;
                    return {
                        colors: res.themeData.colors,
                        websiteCss: filterWebsitesForTab(sender.tab?.url, res.themeData.websites),
                        timestamp: res.themeData.timestamp,
                        status: res.themeData.status,
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
                // From popup — send to active tab
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
            configWritePromise = configWritePromise.then(() => browser.storage.local.set({ config }));
            return configWritePromise.then(() => {
                sendConfigToHost();
                return { ok: true, blocked: idx < 0 };
            });
        }
    }
});

// === Keyboard Shortcuts ===
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
            if (port) { port.disconnect(); port = null; }
            connect();
        }
    } else if (command === "toggle-pause") {
        if (isPaused()) {
            state.pauseUntil = null;
            if (state.lastThemeData) broadcastToTabs(state.lastThemeData);
        } else {
            state.pauseUntil = Date.now() + 600000; // 10 min default
            startPauseCheck();
            broadcastRollbackToTabs();
        }
    } else if (command === "reapply-theme") {
        if (state.lastThemeData) {
            browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab) sendToTab(tab.id, state.lastThemeData, tab.url, true);
            });
        }
    }
});

// === Context Menus ===
function setupContextMenus() {
    browser.menus.create({
        id: "matugenfox-toggle-site",
        title: "Disable MatugenFox on this site",
        contexts: ["page"],
    });
    browser.menus.create({
        id: "matugenfox-reapply",
        title: "Reapply MatugenFox theme",
        contexts: ["page"],
    });
}

function updateContextMenuTitle(tabId) {
    browser.tabs.get(tabId).then(tab => {
        try {
            const hostname = new URL(tab.url).hostname;
            const isBlocked = (config.blocklist || []).some(
                d => hostname === d || hostname.endsWith('.' + d)
            );
            browser.menus.update("matugenfox-toggle-site", {
                title: isBlocked
                    ? `Enable MatugenFox on ${hostname}`
                    : `Disable MatugenFox on ${hostname}`,
            });
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
        if (state.lastThemeData) {
            sendToTab(tab.id, state.lastThemeData, tab.url, true);
        }
    }
});

// === Startup ===
setupContextMenus();
connect();
