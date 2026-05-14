/* ═══════════════════════════════════════════
   MatugenFox Content Script
   ═══════════════════════════════════════════ */

// === Sync Anti-FOUC ===
try {
    // Use localStorage to persist across tabs of the same domain
    const savedBg = localStorage.getItem('matugenfox_bg');
    const savedFg = localStorage.getItem('matugenfox_fg');
    if (savedBg) {
        const foucStyle = document.createElement("style");
        foucStyle.id = "matugenfox-fouc";
        foucStyle.textContent = `
            * { transition: none !important; animation: none !important; }
            html, body { background-color: ${savedBg} !important; color: ${savedFg || 'inherit'} !important; }
        `;
        if (document.documentElement) document.documentElement.appendChild(foucStyle);
        
        // Failsafe increased to 2000ms
        setTimeout(() => {
            if (foucStyle.parentNode) foucStyle.remove();
        }, 2000);
    }
} catch (e) {}

// === State ===
let matugenStyle = null;
let transitionStyle = null;
let transitionTimeout = null;
let lastAppliedHash = null;
let isStopped = false;
let expectedGeneration = 0;
let cachedThemeData = null;

// === Config Cache ===
let cachedConfig = { smoothTransitions: true, blocklist: [], transitionMs: 300, showSyncIndicator: true, autoDisableDarkSites: false, nakedMode: false };

browser.storage.local.get(["config", "themeData"]).then(res => {
    if (res.config) cachedConfig = res.config;
    
    // Immediate optimistic theme injection to prevent FOUC on reload
    if (res.themeData && !isStopped && !isSiteBlocked()) {
        const data = res.themeData;
        const hostname = location.hostname;
        let siteCss = "";
        if (data.websites) {
            for (const [domain, css] of Object.entries(data.websites)) {
                if (hostname === domain || hostname.endsWith("." + domain)) {
                    siteCss += `/* MatugenFox: ${domain} */\n${css}\n`;
                }
            }
        }
        applyTheme({ colors: data.colors, websiteCss: siteCss, timestamp: data.timestamp });
        
        // Clean up FOUC block
        const fouc = document.getElementById("matugenfox-fouc");
        if (fouc) fouc.remove();
    } else {
        const fouc = document.getElementById("matugenfox-fouc");
        if (fouc) fouc.remove();
    }
}).catch(() => {
    const fouc = document.getElementById("matugenfox-fouc");
    if (fouc) fouc.remove();
});

// === Mode Logic ===
function getEffectiveMode(config) {
    return {
        naked: !!config.nakedMode,
        smooth: config.smoothTransitions !== false && !config.nakedMode,
        indicators: config.showSyncIndicator !== false && !config.nakedMode,
    };
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) {
        const oldBlocklist = cachedConfig.blocklist || [];
        const oldNaked = cachedConfig.nakedMode;
        const oldSmooth = cachedConfig.smoothTransitions;

        cachedConfig = changes.config.newValue || cachedConfig;

        const newBlocklist = cachedConfig.blocklist || [];
        const newNaked = cachedConfig.nakedMode;
        const newSmooth = cachedConfig.smoothTransitions;

        // Blocklist reactivity
        const wasBlocked = oldBlocklist.some(d => location.hostname === d || location.hostname.endsWith('.' + d));
        const nowBlocked = newBlocklist.some(d => location.hostname === d || location.hostname.endsWith('.' + d));

        if (!wasBlocked && nowBlocked) {
            isStopped = true;
            removeTheme();
        } else if (wasBlocked && !nowBlocked) {
            isStopped = false;
            initTheme();
        } else if (oldNaked !== newNaked || oldSmooth !== newSmooth) {
            if (cachedThemeData && !isStopped) applyTheme({ ...cachedThemeData, force: true });
        }
    }
});

// === Blocklist Check ===
function isSiteBlocked() {
    const list = cachedConfig.blocklist;
    if (!list || !list.length) return false;
    const hostname = location.hostname;
    return list.some(d => hostname === d || hostname.endsWith("." + d));
}

// === Dark Mode Detection ===
let cachedDarkModeResult = null;

function isSiteLikelyDark() {
    if (!cachedConfig.autoDisableDarkSites) return false;
    if (cachedDarkModeResult !== null) return cachedDarkModeResult;
    try {
        const samples = [document.documentElement, document.body, document.querySelector('main')];
        let darkCount = 0;
        for (const el of samples) {
            if (!el) continue;
            const bg = getComputedStyle(el).backgroundColor;
            const match = bg.match(/\d+/g);
            if (match) {
                const [r, g, b] = match.map(Number);
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                if (luminance < 80) darkCount++;
            }
        }
        cachedDarkModeResult = darkCount >= 2;
        return cachedDarkModeResult;
    } catch { return false; }
}

// === One-Shot Transitions ===
function injectTransitions() {
    const ms = cachedConfig.transitionMs || 300;
    if (!transitionStyle) {
        transitionStyle = document.createElement("style");
        transitionStyle.id = "matugenfox-transitions";
    }
    transitionStyle.textContent = `
        html, body, main, header, footer, nav, aside, section, article,
        div, span, p, a, h1, h2, h3, h4, h5, h6, li, ul, ol,
        button, input, textarea, select, table, th, td {
            transition: background-color ${ms}ms ease, color ${ms}ms ease,
                        border-color ${ms}ms ease !important;
        }
    `;
    document.documentElement.appendChild(transitionStyle);
}

function removeTransitions() {
    if (transitionStyle && transitionStyle.parentNode) {
        transitionStyle.remove();
    }
    transitionStyle = null;
}

function scheduleTransitionCleanup(ms) {
    if (transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => {
        removeTransitions();
        transitionTimeout = null;
    }, ms + 100);
}

// === Sync Indicator ===
function showSyncIndicator(accentColor) {
    const mode = getEffectiveMode(cachedConfig);
    if (!mode.indicators) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const existing = document.getElementById('matugenfox-sync-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'matugenfox-sync-bar';
    bar.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; height: 2px;
        background: linear-gradient(90deg, transparent, ${accentColor || '#8bd5b5'}, transparent);
        z-index: 2147483647; pointer-events: none;
        animation: matugenfox-fade 600ms ease-out forwards;
    `;

    // Inject keyframe if not present
    if (!document.getElementById('matugenfox-sync-keyframes')) {
        const style = document.createElement('style');
        style.id = 'matugenfox-sync-keyframes';
        style.textContent = `@keyframes matugenfox-fade { 0% { opacity: 1; } 100% { opacity: 0; } }`;
        document.documentElement.appendChild(style);
    }

    document.documentElement.appendChild(bar);
    setTimeout(() => bar.remove(), 700);
}

// === Theme Builders ===
function buildNakedTheme(data) {
    let css = ":root {\n";
    for (const [name, value] of Object.entries(data.colors)) {
        css += `  ${name}: ${value} !important;\n`;
    }
    css += "}\n";
    return css;
}

function buildFullTheme(data) {
    let css = buildNakedTheme(data);
    if (data.websiteCss) css += "\n" + data.websiteCss;
    return css;
}

// === Theme Application ===
function applyTheme(data) {
    if (!data || !data.colors) return;
    cachedThemeData = data;
    if (isSiteBlocked()) return;

    const mode = getEffectiveMode(cachedConfig);

    // Hash stability: in naked mode, we only care about colors.
    const currentHash = mode.naked
        ? JSON.stringify(data.colors)
        : (data.timestamp || JSON.stringify(data.colors) + (data.websiteCss || ""));

    if (currentHash === lastAppliedHash && !data.force) return;
    lastAppliedHash = currentHash;

    expectedGeneration++;
    const generation = expectedGeneration;

    const isFirstPaint = !matugenStyle || !matugenStyle.textContent;

    const executeTheme = () => {
        // Enforce singleton style tag identity
        matugenStyle = document.getElementById("matugenfox-style");
        if (!matugenStyle) {
            matugenStyle = document.createElement("style");
            matugenStyle.id = "matugenfox-style";
            if (document.head) document.head.appendChild(matugenStyle);
            else document.documentElement.appendChild(matugenStyle);
        }

        // Switching to naked mode dynamically: clean up transitions
        if (mode.naked) {
            document.getElementById("matugenfox-transitions")?.remove();
            transitionStyle = null;
            document.getElementById('matugenfox-sync-keyframes')?.remove();
        }

        const css = buildFullTheme(data);

        if (mode.smooth && !isFirstPaint) {
            injectTransitions();
            requestAnimationFrame(() => {
                if (generation !== expectedGeneration) return;
                matugenStyle.textContent = css;
                scheduleTransitionCleanup(cachedConfig.transitionMs || 300);
            });
        } else {
            matugenStyle.textContent = css;
        }

        // Show sync indicator on non-first updates
        if (!isFirstPaint && mode.indicators) {
            const accent = data.colors['--primary'] || data.colors['--accent'] || '#8bd5b5';
            showSyncIndicator(accent);
        }

        // Save computed colors for absolute Anti-FOUC precision
        requestAnimationFrame(() => {
            try {
                if (document.body) {
                    const bg = window.getComputedStyle(document.body).backgroundColor;
                    const fg = window.getComputedStyle(document.body).color;
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        localStorage.setItem('matugenfox_bg', bg);
                    }
                    if (fg && fg !== 'rgba(0, 0, 0, 0)' && fg !== 'transparent') {
                        localStorage.setItem('matugenfox_fg', fg);
                    }
                }
            } catch (e) {}
        });
    };

    if (isFirstPaint) {
        executeTheme();
    } else {
        requestAnimationFrame(() => {
            if (generation !== expectedGeneration) return;
            // Dark mode detection (run after DOM is somewhat ready)
            if (isSiteLikelyDark()) return;
            executeTheme();
        });
    }
}

function removeTheme() {
    if (matugenStyle) {
        matugenStyle.remove();
        matugenStyle = null;
        lastAppliedHash = null;
    }
    if (transitionTimeout) {
        clearTimeout(transitionTimeout);
        transitionTimeout = null;
    }
    removeTransitions();
    const keyframes = document.getElementById('matugenfox-sync-keyframes');
    if (keyframes) keyframes.remove();
}

// === Initialization with Retry ===
function initTheme(retries = 3) {
    if (isSiteBlocked()) return;

    browser.runtime.sendMessage({ type: "GET_STATUS" }).then((status) => {
        if (status?.manuallyStopped || status?.paused) {
            isStopped = true;
            removeTheme();
        } else {
            browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then((data) => {
                if (data) applyTheme(data);
            }).catch(() => { });
        }
    }).catch(() => {
        if (retries > 0) setTimeout(() => initTheme(retries - 1), 1000);
    });
}

initTheme();

// === Message Listener ===
browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id) return;

    if (message.type === "MATUGEN_UPDATE") {
        isStopped = false;
        applyTheme(message.data);
    } else if (message.type === "MATUGEN_ROLLBACK") {
        isStopped = true;
        removeTheme();
    }
});

// === Style Persistence (MutationObserver) ===
const styleObserver = new MutationObserver(() => {
    if (isStopped || !matugenStyle) return;
    if (!document.getElementById("matugenfox-style")) {
        document.documentElement.appendChild(matugenStyle);
    }
});

if (document.documentElement) {
    styleObserver.observe(document.documentElement, { childList: true });
}
