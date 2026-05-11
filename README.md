# 🦊 MatugenFox

**Live, dynamic webpage theming for Firefox powered by Matugen.**

MatugenFox brings your system-wide [Matugen](https://github.com/InioAsman/matugen) colors directly into your browser. Unlike static CSS themes, MatugenFox injects your colors into every open tab in real-time. Change your wallpaper, and watch your browser colors update instantly without a page refresh.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-Extension-orange.svg)

---

## ✨ Features

- **🚀 Real-Time Injection**: Updates colors instantly across all tabs as soon as Matugen generates new colors.
- **🛡️ Crash-Proof & Lightweight**: Optimized with staggered updates and IPC filtering to ensure zero system lag, even with 100+ tabs open.
- **🎨 Site-Specific CSS**: Automatically applies custom CSS overrides for specific domains (e.g., GitHub, YouTube) using your Matugen variables.
- **⚙️ Fully Configurable**: Easy-to-use Options page to set your own paths for `colors.css` and your custom website styles.
- **📦 Portable**: No hardcoded paths; works on any Linux or macOS system.

---

## 🛠️ Installation

### 1. Prerequisites
- **Firefox**
- **Python 3**
- **Matugen** (configured to output a CSS variables file)

### 2. Setup the Native Host
The Native Host is a small Python bridge that watches your files and talks to Firefox.

```bash
git clone https://github.com/Ubaidullah-Web-Dev/MatugenFox.git
cd MatugenFox
chmod +x setup.sh
./setup.sh
```

### 3. Install the Extension
Currently, you can load MatugenFox as a temporary extension:

1.  Open Firefox and go to `about:debugging`.
2.  Click **"This Firefox"** on the left.
3.  Click **"Load Temporary Add-on..."**.
4.  Select the `manifest.json` inside the `extension/` folder.

---

## ⚙️ Configuration

Once installed, you need to tell MatugenFox where your files are:

1.  Right-click the **MatugenFox icon** (🦊) in your toolbar.
2.  Select **Manage Extension**.
3.  Go to the **Options** tab.
4.  Enter the paths to your files:
    - **Colors CSS Path**: e.g., `~/.config/matugen/colors.css`
    - **Websites CSS Directory**: e.g., `~/.config/matugen/websites`
5.  Click **Save**.

---

## 📂 Site-Specific Styles

To apply custom themes to specific websites, place `.css` files in your `websites` directory. 

Example: `github.css`
```css
@-moz-document domain("github.com") {
    body {
        background-color: var(--base) !important;
        color: var(--text) !important;
    }
}
```
*Note: MatugenFox will automatically detect the domain and apply the CSS using your Matugen variables (e.g., `--base`, `--text`).*

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for optimizations or new features, feel free to open an issue or a PR.

## 📄 License

MIT © [Ubaid](https://github.com/ubaid)
