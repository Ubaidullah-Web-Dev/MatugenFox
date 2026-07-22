/* ═══════════════════════════════════════════
   MatugenFox — DuckDuckGo Content Script v2.0
   ═══════════════════════════════════════════ */

'use strict';

function applyTheme(theme) {
    if (!theme?.k7) return;
    const existing = document.getElementById('mf-ddg-theme');
    if (existing) existing.remove();

    const bg = theme.k7 ? `#${theme.k7}` : '';
    const header = theme.kj ? `#${theme.kj}` : bg;
    const text = theme.k8 ? `#${theme.k8}` : '';
    const link = theme.kx ? `#${theme.kx}` : '';
    const accent = theme.k9 ? `#${theme.k9}` : '';
    const hover = theme.k21 ? `#${theme.k21}` : '';

    const css = [
        `body, html { background-color: ${bg} !important; }`,
        `.header--aside, .header__search-wrap, #header_wrapper, .header--home { background-color: ${header} !important; }`,
        text ? `.result__snippet, .result__extras__url, .c-base__sub { color: ${text} !important; }` : '',
        link ? `.result__url, .result__a { color: ${link} !important; }` : '',
        accent ? `.result__title a, .result__title { color: ${accent} !important; }` : '',
        hover ? `.result:hover, .result--highlighted { background-color: #${theme.k21}22 !important; }` : '',
    ].join('\n');

    const style = document.createElement('style');
    style.id = 'mf-ddg-theme';
    style.textContent = css;
    document.head.appendChild(style);

    try {
        if (window.wrappedJSObject?.DDG?.settings) {
            const s = window.wrappedJSObject.DDG.settings;
            s.set('kae', 'matugenfox');
            if (theme.k7) s.set('k7', theme.k7);
            if (theme.kj) s.set('kj', theme.kj);
            if (theme.k9) s.set('k9', theme.k9);
            if (theme.k8) s.set('k8', theme.k8);
            if (theme.kx) s.set('kx', theme.kx);
            if (theme.kaa) s.set('kaa', theme.kaa);
            if (theme.k21) s.set('k21', theme.k21);
        }
    } catch { }
}

function resetTheme() {
    const el = document.getElementById('mf-ddg-theme');
    if (el) el.remove();
    try {
        if (window.wrappedJSObject?.DDG?.settings) {
            window.wrappedJSObject.DDG.settings.set('kae', 'default');
        }
    } catch { }
}

browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'MATUGEN_DDG_THEME') applyTheme(msg.theme);
    else if (msg.type === 'MATUGEN_DDG_RESET') resetTheme();
});

browser.runtime.sendMessage({ type: 'APPLY_DDG_THEME' }).catch(() => { });