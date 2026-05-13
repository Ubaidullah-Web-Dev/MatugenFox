let port = null;
let lastThemeData = null;
let updateTimeout = null;
let shouldConnect = true;

function connect() {
    if (!shouldConnect) return;

    console.log("Connecting to matugenfox native host...");
    port = browser.runtime.connectNative("matugenfox");

    // Send initial config
    sendConfigToHost();

    port.onMessage.addListener((message) => {
        console.log("Received message from host:", message);

        // If it's a theme update
        if (message.colors) {
            lastThemeData = message;
            browser.storage.local.set({ themeData: message });

            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                broadcastToTabs(message);
                updateTimeout = null;
            }, 500);
        } else {
            // Relay other messages (like file management) to the options page
            browser.runtime.sendMessage({ type: "HOST_RESPONSE", data: message }).catch(() => { });
        }
    });

    port.onDisconnect.addListener((p) => {
        if (p.error) console.error("Disconnected:", p.error.message);
        port = null;
        if (shouldConnect) {
            setTimeout(connect, 5000);
        }
    });
}

function sendConfigToHost() {
    if (!port) return;
    browser.storage.local.get("config").then(res => {
        if (res.config) {
            port.postMessage({
                type: "SET_CONFIG",
                config: res.config
            });
        }
    });
}

// Watch for config changes
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) {
        sendConfigToHost();
    }
});

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
    } catch (e) {
        return "";
    }
}

function broadcastToTabs(themeData) {
    browser.storage.local.get("config").then(res => {
        const isEcoMode = res.config?.ecoMode || false;

        browser.tabs.query({ discarded: false, status: "complete" }).then((tabs) => {
            tabs.forEach((tab, index) => {
                if (isEcoMode) {
                    // Only update active tab immediately in Eco Mode
                    if (tab.active) {
                        sendToTab(tab.id, themeData, tab.url);
                    }
                } else {
                    // Stagger updates for all tabs
                    setTimeout(() => {
                        sendToTab(tab.id, themeData, tab.url);
                    }, index * 50);
                }
            });
        });
    });
}

function sendToTab(tabId, themeData, url) {
    if (!themeData) return;

    // Create an optimized payload for this specific tab
    const payload = {
        colors: themeData.colors,
        websiteCss: filterWebsitesForTab(url, themeData.websites),
        timestamp: themeData.timestamp
    };

    browser.tabs.sendMessage(tabId, {
        type: "MATUGEN_UPDATE",
        data: payload
    }).catch(() => {
        // Content script might not be ready
    });
}

browser.tabs.onActivated.addListener((activeInfo) => {
    browser.storage.local.get(["config", "themeData"]).then(res => {
        // If Eco Mode is on, we update the tab when it becomes active
        if (res.config?.ecoMode && (lastThemeData || res.themeData)) {
            browser.tabs.get(activeInfo.tabId).then(tab => {
                sendToTab(activeInfo.tabId, lastThemeData || res.themeData, tab.url);
            });
        }
    });
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CONFIG_UPDATED") {
        sendConfigToHost();
        return Promise.resolve();
    }
    if (request.type === "HOST_COMMAND") {
        if (port) port.postMessage(request.command);
        return Promise.resolve();
    }
    if (request.type === "GET_THEME_DATA") {
        const p = lastThemeData ? Promise.resolve(lastThemeData) : browser.storage.local.get("themeData").then(res => {
            lastThemeData = res.themeData;
            return lastThemeData;
        });

        return p.then(data => {
            if (!data) return null;
            // When a tab requests data, give it only what it needs
            return {
                colors: data.colors,
                websiteCss: filterWebsitesForTab(sender.tab?.url, data.websites),
                timestamp: data.timestamp
            };
        });
    }
    if (request.type === "RECONNECT") {
        shouldConnect = true;
        if (port) {
            port.disconnect();
            port = null;
        }
        connect();
        return Promise.resolve({ status: "reconnecting" });
    }
    if (request.type === "DISCONNECT") {
        shouldConnect = false;
        if (port) {
            port.disconnect();
            port = null;
        }
        broadcastRollbackToTabs();
        return Promise.resolve({ status: "disconnected" });
    }
    if (request.type === "GET_STATUS") {
        return Promise.resolve({ connected: !!port, manuallyStopped: !shouldConnect });
    }
});

function broadcastRollbackToTabs() {
    browser.tabs.query({ discarded: false, status: "complete" }).then((tabs) => {
        tabs.forEach((tab) => {
            browser.tabs.sendMessage(tab.id, { type: "MATUGEN_ROLLBACK" }).catch(() => { });
        });
    });
}

connect();
