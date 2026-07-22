# 🦊 MatugenFox

**Live, dynamic webpage theming for Firefox powered by Matugen.**

MatugenFox brings your system-wide [Matugen](https://github.com/InioAsman/matugen) colors directly into your browser. Unlike static CSS themes, MatugenFox injects your colors into every open tab in real-time. Change your wallpaper, and watch your browser colors update instantly with buttery-smooth transitions—without reloading a single page.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-Extension-orange.svg)

---

## ✨ Features

- **🚀 Real-Time Injection**: Updates colors instantly across all tabs as soon as Matugen generates new colors.
- **🦊 Full Browser Theming**: Dynamically themes your Firefox UI (tabs, toolbars, sidebars) and the extension's popup to perfectly match your Matugen colors.
- **✨ Beautiful Modern UI**: A fresh, sleek popup interface built specifically for Matugen's vibrant gradients.
- **⌨️ Command Palette**: A power-user command palette accessible via `Ctrl+Alt+C` to quickly manage sites, block theming, and access settings.
- **🌊 Smooth Transitions**: Employs an intelligent DOM transition engine that smoothly interpolates colors between theme changes, accompanied by a satisfying glowing sync indicator.
- **🎨 Live CSS Editor & Site-Specific CSS**: Automatically applies custom CSS overrides for specific domains using your Matugen variables.
- **🔋 Eco Mode**: Pauses background broadcasts for inactive tabs to save battery. Tabs fetch the latest theme only when you switch to them.
- **🧊 Naked Mode**: Maximum performance mode that applies your theme instantly without any animations or effects.
- **🛡️ Data Persistence**: Integrated with a Native Messaging Host to ensure your settings are stored safely on your disk and survive browser restarts.
- **🚫 Intelligent Blocklist**: Instantly disable theming on broken sites from the popup or context menu.
- **🛡️ Crash-Proof & Lightweight**: Optimized with staggered updates, IPC filtering, and strict write serialization to ensure zero system lag.

---

## 🛠️ Installation

### 1. Configure Matugen
Ensure your Matugen `config.toml` is set up to generate a CSS file specifically for MatugenFox to read.

Add the following to your `~/.config/matugen/config.toml`:
```toml
[templates.firefox_websites]
input_path = '~/.config/matugen/templates/firefox_websites.css'
output_path = '~/.config/matugen/generated/firefox_websites.css'
```
Run `matugen` at least once so the file is generated!

### 2. Setup the Native Host
The Native Host is a small Python bridge that watches your generated Matugen files and talks to Firefox.

```bash
git clone https://github.com/Ubaidullah-Web-Dev/MatugenFox.git
cd MatugenFox
./setup.sh
```
*Note: Python 3 must be installed on your system.*

### 3. Install the Extension
Get the official extension from the Firefox Add-ons store:
👉 **[Install MatugenFox on Firefox](https://addons.mozilla.org/en-US/firefox/addon/matugenfox/)**

---

## ⚙️ Configuration

Once installed, ensure MatugenFox knows where to find your files:

1.  Click the **MatugenFox icon** (🦊) in your toolbar.
2.  Click the **⚙ Settings** button to open the Options page.
3.  Go to the **General** tab and verify the absolute paths to your files:
    - **Colors CSS Path**: Default is `~/.config/matugen/generated/firefox_websites.css`
    - **Websites CSS Directory**: e.g., `~/.config/dusky_sites`
4.  Click **Save Paths** and hit **Fetch Colors** from the popup!

---

## 📂 Site-Specific Styles

To apply custom themes to specific websites, you can use the live **Website CSS Editor** in the extension's settings, or place `.css` files in your `websites` directory. 

Example: `github.css`
```css
@-moz-document domain("github.com") {
    body {
        background-color: var(--mg-bg-1) !important;
        color: var(--mg-text-0) !important;
    }
}
```

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for optimizations or new features, feel free to open an issue or a PR.

## 📄 License

MIT © [Ubaid](https://github.com/Ubaidullah-Web-Dev)
