/* ═══════════════════════════════════════════
   MatugenFox Content Script v2.0
   ═══════════════════════════════════════════ */

'use strict';

// ─── Anti-FOUC ───
(function initFOUC() {
    try {
        const bg = localStorage.getItem('mf-bg');
        const fg = localStorage.getItem('mf-fg');
        if (bg) {
            const style = document.createElement('style');
            style.id = 'mf-fouc';
            style.textContent = `* { transition: none !important; animation: none !important; } html, body { background-color: ${bg} !important; color: ${fg || 'inherit'} !important; }`;
            const inject = () => {
                if (document.documentElement) {
                    document.documentElement.appendChild(style);
                    setTimeout(() => style.remove(), 1500);
                } else {
                    requestAnimationFrame(inject);
                }
            };
            inject();
        }
    } catch { }
})();

// ─── State ───
let styleEl = null;
let transitionEl = null;
let transitionTimer = null;
let lastHash = null;
let isStopped = false;
let cachedConfig = null;
let cachedData = null;
let darkCheckCache = null;

// ─── Config & Theme Load ───
browser.storage.local.get(['config', 'themeData']).then(res => {
    if (res.config) cachedConfig = res.config;
    if (res.themeData && !isStopped && !isBlocked()) {
        applyTheme(res.themeData, true);
    }
    cleanupFOUC();
}).catch(cleanupFOUC);

function cleanupFOUC() {
    const el = document.getElementById('mf-fouc');
    if (el) setTimeout(() => el.remove(), 100);
}

// ─── Storage Listener ───
browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.config) {
        const old = cachedConfig || {};
        cachedConfig = changes.config.newValue || {};
        const wasBlocked = isBlocked(old.blocklist);
        const nowBlocked = isBlocked();
        if (!wasBlocked && nowBlocked) { isStopped = true; removeTheme(); }
        else if (wasBlocked && !nowBlocked) { isStopped = false; initTheme(); }
        else if (cachedData && !isStopped) applyTheme(cachedData, true);
    }
});

// ─── Blocklist ───
function isBlocked(list = null) {
    const blocklist = list || cachedConfig?.blocklist;
    if (!blocklist?.length) return false;
    const host = location.hostname;
    return blocklist.some(d => host === d || host.endsWith('.' + d));
}

// ─── Dark Site Detection ───
function isDarkSite() {
    if (!cachedConfig?.autoDisableDarkSites) return false;
    if (darkCheckCache !== null) return darkCheckCache;
    try {
        const samples = [document.documentElement, document.body, document.querySelector('main')].filter(Boolean);
        let dark = 0;
        for (const el of samples) {
            const bg = getComputedStyle(el).backgroundColor;
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) {
                const [r, g, b] = [+m[1], +m[2], +m[3]];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (lum < 80) dark++;
            }
        }
        darkCheckCache = dark >= 2;
        return darkCheckCache;
    } catch { return false; }
}

// ─── Transitions ───
function setTransitions(enabled, ms = 300) {
    if (transitionTimer) { clearTimeout(transitionTimer); transitionTimer = null; }
    if (!enabled || !ms) { if (transitionEl) { transitionEl.remove(); transitionEl = null; } return; }
    if (!transitionEl) {
        transitionEl = document.createElement('style');
        transitionEl.id = 'mf-transitions';
    }
    transitionEl.textContent = `*, *::before, *::after { transition: background-color ${ms}ms ease, color ${ms}ms ease, border-color ${ms}ms ease, fill ${ms}ms ease, stroke ${ms}ms ease !important; }`;
    if (!transitionEl.parentNode) document.documentElement.appendChild(transitionEl);
    transitionTimer = setTimeout(() => {
        if (transitionEl) { transitionEl.remove(); transitionEl = null; }
    }, ms + 50);
}

// ─── Sync Indicator ───
function showIndicator(color) {
    if (!cachedConfig?.showSyncIndicator || cachedConfig?.nakedMode) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const existing = document.getElementById('mf-indicator');
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = 'mf-indicator';
    bar.style.cssText = `position:fixed;top:0;left:0;right:0;height:2px;background:${color || '#8bd5ca'};z-index:2147483647;pointer-events:none;animation:mf-ind-fade 600ms ease-out forwards;`;
    if (!document.getElementById('mf-ind-style')) {
        const s = document.createElement('style');
        s.id = 'mf-ind-style';
        s.textContent = `@keyframes mf-ind-fade {0%{opacity:1}100%{opacity:0}}`;
        document.documentElement.appendChild(s);
    }
    document.documentElement.appendChild(bar);
    setTimeout(() => bar.remove(), 650);
}

// ─── Theme Application ───
function applyTheme(data, force = false) {
    if (!data?.colors || isBlocked()) return;
    cachedData = data;
    if (isStopped) return;

    const naked = !!cachedConfig?.nakedMode;
    const smooth = !naked && (cachedConfig?.smoothTransitions !== false);
    const ms = cachedConfig?.transitionMs || 300;

    const hash = naked ? JSON.stringify(data.colors) : (data.timestamp + (data.websiteCss || ''));
    if (!force && hash === lastHash) return;
    lastHash = hash;

    if (!force && isDarkSite()) return;

    let css = ':root {\n';
    for (const [k, v] of Object.entries(data.colors)) css += `  ${k}: ${v} !important;\n`;
    css += '}\n';
    if (data.websiteCss) css += data.websiteCss;

    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'mf-theme';
    }
    styleEl.textContent = css;

    const apply = () => {
        if (!styleEl.parentNode) {
            if (document.head) document.head.appendChild(styleEl);
            else document.documentElement.appendChild(styleEl);
        }
        if (smooth && !force) setTransitions(true, ms);
        if (!force) showIndicator(data.colors['--primary'] || data.colors['--accent'] || '#8bd5ca');
        saveColorsForFOUC();
    };

    if (document.documentElement) apply();
    else requestAnimationFrame(apply);
}

function removeTheme() {
    if (styleEl) { styleEl.remove(); styleEl = null; }
    lastHash = null;
    if (transitionTimer) clearTimeout(transitionTimer);
    if (transitionEl) { transitionEl.remove(); transitionEl = null; }
    const ind = document.getElementById('mf-indicator');
    if (ind) ind.remove();
}

function saveColorsForFOUC() {
    requestAnimationFrame(() => {
        try {
            const body = document.body;
            if (!body) return;
            const cs = getComputedStyle(body);
            const bg = cs.backgroundColor;
            const fg = cs.color;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') localStorage.setItem('mf-bg', bg);
            if (fg && fg !== 'rgba(0, 0, 0, 0)' && fg !== 'transparent') localStorage.setItem('mf-fg', fg);
        } catch { }
    });
}

// ─── Init ───
function initTheme(retries = 3) {
    if (isBlocked()) return;
    browser.runtime.sendMessage({ type: 'GET_STATUS' }).then(status => {
        if (status?.manuallyStopped || status?.paused) {
            isStopped = true;
            removeTheme();
        } else {
            isStopped = false;
            browser.runtime.sendMessage({ type: 'GET_THEME_DATA' }).then(data => {
                if (data) applyTheme(data, true);
            }).catch(() => { });
        }
    }).catch(() => {
        if (retries > 0) setTimeout(() => initTheme(retries - 1), 800);
    });
}
initTheme();

// ─── Message Listener ───
browser.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== browser.runtime.id) return;
    if (msg.type === 'MATUGEN_UPDATE') {
        isStopped = false;
        applyTheme(msg.data, msg.data?.force);
    } else if (msg.type === 'MATUGEN_ROLLBACK') {
        isStopped = true;
        removeTheme();
    }
});

// ─── Persistence Observer ───
const observer = new MutationObserver(() => {
    if (!isStopped && styleEl && !document.getElementById('mf-theme')) {
        if (document.head) document.head.appendChild(styleEl);
        else document.documentElement.appendChild(styleEl);
    }
});
if (document.documentElement) observer.observe(document.documentElement, { childList: true });