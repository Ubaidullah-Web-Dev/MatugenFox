function saveOptions(e) {
    e.preventDefault();
    const colorsPath = document.querySelector("#colors-path").value || "~/.config/matugen/colors.css";
    const websitesDir = document.querySelector("#websites-dir").value || "~/.config/matugen/websites";

    browser.storage.local.set({
        config: {
            colorsPath: colorsPath,
            websitesDir: websitesDir
        }
    }).then(() => {
        const status = document.querySelector("#status");
        status.className = "show";
        setTimeout(() => {
            status.className = "";
        }, 2000);
    });
}

function restoreOptions() {
    browser.storage.local.get("config").then((res) => {
        if (res.config) {
            document.querySelector("#colors-path").value = res.config.colorsPath || "";
            document.querySelector("#websites-dir").value = res.config.websitesDir || "";
        }
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#save").addEventListener("click", saveOptions);
