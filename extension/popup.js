function updateStatus() {
    browser.runtime.sendMessage({ type: "GET_STATUS" }).then((res) => {
        const indicator = document.getElementById("status-indicator");
        const statusText = document.getElementById("status-text");
        
        if (res.connected) {
            indicator.className = "status online";
            statusText.textContent = "Live Link Active";
        } else {
            indicator.className = "status offline";
            statusText.textContent = "Host Disconnected";
        }
    });
}

function updatePalette() {
    browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then((data) => {
        if (!data || !data.colors) return;
        
        const palette = document.getElementById("palette-preview");
        palette.innerHTML = "";
        
        // Show the first 16 colors as a preview
        const colorNames = Object.keys(data.colors).filter(n => !n.endsWith("_rgb")).slice(0, 16);
        
        for (const name of colorNames) {
            const dot = document.createElement("div");
            dot.className = "color-dot";
            dot.style.backgroundColor = data.colors[name];
            dot.title = name;
            palette.appendChild(dot);
        }
    });
}

document.getElementById("reconnect-btn").addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "RECONNECT" }).then(() => {
        setTimeout(updateStatus, 500);
    });
});

// Initial updates
updateStatus();
updatePalette();

// Poll status while popup is open
setInterval(updateStatus, 5000);
