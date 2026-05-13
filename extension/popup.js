function updateStatus() {
    browser.runtime.sendMessage({ type: "GET_STATUS" }).then((res) => {
        const indicator = document.getElementById("status-indicator");
        const statusText = document.getElementById("status-text");
        const stopBtn = document.getElementById("stop-btn");
        
        if (res.connected) {
            browser.runtime.sendMessage({ type: "GET_THEME_DATA" }).then((data) => {
                if (data && data.status && data.status[0] !== "OK") {
                    indicator.className = "status offline";
                    statusText.textContent = data.status[0];
                } else {
                    indicator.className = "status online";
                    statusText.textContent = "Live Link Active";
                }
            });
            stopBtn.disabled = false;
        } else if (res.manuallyStopped) {
            indicator.className = "status offline";
            statusText.textContent = "Stopped Manually";
            stopBtn.disabled = true;
        } else {
            indicator.className = "status offline";
            statusText.textContent = "Host Disconnected";
            stopBtn.disabled = false;
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

document.getElementById("stop-btn").addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "DISCONNECT" }).then(() => {
        updateStatus();
    });
});

document.getElementById("github-btn").addEventListener("click", () => {
    browser.tabs.create({ url: "https://github.com/Ubaidullah-Web-Dev/MatugenFox" });
});

// Initial updates
updateStatus();
updatePalette();

// Poll status while popup is open
setInterval(updateStatus, 5000);
