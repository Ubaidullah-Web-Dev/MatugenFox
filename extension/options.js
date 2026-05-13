function saveOptions(e) {
    e.preventDefault();
    const config = {
        colorsPath: document.querySelector("#colors-path").value || "~/.config/matugen/colors.css",
        websitesDir: document.querySelector("#websites-dir").value || "~/.config/matugen/websites",
        ecoMode: document.querySelector("#eco-mode").checked,
        smoothTransitions: document.querySelector("#smooth-transitions").checked
    };

    browser.storage.local.set({ config }).then(() => {
        showStatus("#status");
        // Update background script immediately
        browser.runtime.sendMessage({ type: "CONFIG_UPDATED" });
    });
}

function restoreOptions() {
    browser.storage.local.get("config").then((res) => {
        if (res.config) {
            document.querySelector("#colors-path").value = res.config.colorsPath || "";
            document.querySelector("#websites-dir").value = res.config.websitesDir || "";
            document.querySelector("#eco-mode").checked = res.config.ecoMode || false;
            document.querySelector("#smooth-transitions").checked = res.config.smoothTransitions !== false;
            
            // Load file list for editor
            loadFileList();
        }
    });
}

function showStatus(id) {
    const status = document.querySelector(id);
    status.className = "show";
    setTimeout(() => { status.className = ""; }, 2000);
}

// Editor Logic
function loadFileList() {
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "LIST_WEBSITES" } });
}

function loadFileContent(filename) {
    browser.runtime.sendMessage({ type: "HOST_COMMAND", command: { type: "READ_WEBSITE_CSS", filename } });
}

function saveFileContent() {
    const filename = document.querySelector("#file-selector").value;
    const content = document.querySelector("#css-editor").value;
    if (!filename) return;
    
    browser.runtime.sendMessage({ 
        type: "HOST_COMMAND", 
        command: { type: "SAVE_WEBSITE_CSS", filename, content } 
    });
}

// Listen for messages from background (host responses)
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "HOST_RESPONSE") {
        const data = msg.data;
        if (data.type === "WEBSITE_LIST") {
            const selector = document.querySelector("#file-selector");
            selector.innerHTML = data.files.map(f => `<option value="${f}">${f}</option>`).join("");
            if (data.files.length > 0) loadFileContent(data.files[0]);
        }
        else if (data.type === "WEBSITE_CSS") {
            document.querySelector("#css-editor").value = data.content;
        }
        else if (data.type === "SAVE_SUCCESS") {
            showStatus("#editor-status");
        }
    }
});

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#save").addEventListener("click", saveOptions);
document.querySelector("#refresh-files").addEventListener("click", loadFileList);
document.querySelector("#file-selector").addEventListener("change", (e) => loadFileContent(e.target.value));
document.querySelector("#save-css").addEventListener("click", saveFileContent);
