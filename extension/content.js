let matugenStyle = null;
let lastAppliedHash = null;

function applyTheme(data) {
    if (!data || !data.colors) return;

    // Optimized check to avoid redundant DOM writes
    const currentHash = data.timestamp || (JSON.stringify(data.colors).length + (data.websiteCss?.length || 0));
    if (currentHash === lastAppliedHash) return;
    lastAppliedHash = currentHash;

    console.log("MatugenFox: Applying optimized theme update");

    requestAnimationFrame(() => {
        if (!matugenStyle) {
            matugenStyle = document.getElementById("matugenfox-style") || document.createElement("style");
            matugenStyle.id = "matugenfox-style";
            document.documentElement.appendChild(matugenStyle);
        }

        browser.storage.local.get("config").then(res => {
            const smooth = res.config?.smoothTransitions !== false;

            // Combine CSS variables and site-specific CSS into ONE text content update
            let css = ":root {\n";
            for (const [name, value] of Object.entries(data.colors)) {
                css += `  ${name}: ${value} !important;\n`;
            }
            css += "}\n\n";

            if (smooth) {
                css += `
                * { 
                    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, fill 0.3s ease, stroke 0.3s ease !important; 
                }
                `;
            }

            if (data.websiteCss) {
                css += data.websiteCss;
            }

            matugenStyle.textContent = css;
        });
    });
}

function removeTheme() {
    if (matugenStyle) {
        matugenStyle.remove();
        matugenStyle = null;
        lastAppliedHash = null;
        console.log("MatugenFox: Theme removed (rolled back to default)");
    }
}

let isStopped = false;

// Initial load
browser.runtime.sendMessage({ type: "GET_STATUS" }).then((status) => {
    if (status && status.manuallyStopped) {
        isStopped = true;
        removeTheme();
    } else {
        browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then((data) => {
            if (data) applyTheme(data);
        });
    }
});

// Listen for updates
browser.runtime.onMessage.addListener((message) => {
    if (message.type === "MATUGEN_UPDATE") {
        isStopped = false;
        applyTheme(message.data);
    } else if (message.type === "MATUGEN_ROLLBACK") {
        isStopped = true;
        removeTheme();
    }
});

// Periodic check (every 5s) instead of aggressive MutationObserver
// This ensures our style tag stays at the bottom of <html> to override others
setInterval(() => {
    if (!isStopped && matugenStyle && document.documentElement) {
        if (!document.getElementById("matugenfox-style") || matugenStyle.nextSibling) {
            document.documentElement.appendChild(matugenStyle);
        }
    }
}, 5000);
