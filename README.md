# 🦊 MatugenFox

**Live, dynamic webpage theming for Firefox powered by Matugen.**

MatugenFox brings your system-wide [Matugen](https://github.com/InioAsman/matugen) colors directly into your browser. Unlike static CSS themes, MatugenFox injects your colors into every open tab in real-time. Change your wallpaper, and watch your browser colors update instantly with buttery-smooth transitions—without reloading a single page.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-Extension-orange.svg)

---

## ✨ Features

- **🚀 Real-Time Injection**: Updates colors instantly across all tabs as soon as Matugen generates new colors.
- **🔋 Eco Mode**: Pauses background broadcasts for inactive tabs to save battery. Tabs fetch the latest theme only when you switch to them.
- **🌊 Smooth Transitions**: Employs an intelligent DOM transition engine that smoothly interpolates colors between theme changes, accompanied by a satisfying glowing sync indicator.
- **🧊 Naked Mode**: Maximum performance mode that applies your theme instantly without any animations or effects.
- **🎨 Live CSS Editor & Site-Specific CSS**: Automatically applies custom CSS overrides for specific domains using your Matugen variables. Write these directly via the live in-extension CSS editor or local files.
- **⌨️ Command Palette**: A power-user command palette accessible via `Ctrl+Shift+P` to quickly toggle modes and manage states.
- **🚫 Intelligent Blocklist**: Instantly disable theming on broken sites from the popup or context menu.
- **🛡️ Crash-Proof & Lightweight**: Optimized with staggered updates, IPC filtering, and strict write serialization to ensure zero system lag, layout thrashing, or memory leaks.

For an in-depth dive into the architecture and all capabilities, see the [Full Documentation](DOCUMENTATION.md).

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

Once installed, point MatugenFox to your files:

1.  Click the **MatugenFox icon** (🦊) in your toolbar.
2.  Click the **⚙ Settings** button to open the Options page.
3.  Go to the **General** tab and enter the absolute paths to your files:
    - **Colors CSS Path**: e.g., `~/.config/matugen/colors.css`
    - **Websites CSS Directory**: e.g., `~/.config/matugen/websites`
4.  Click **Save Paths**.

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
*Note: MatugenFox will automatically detect the domain and apply the CSS using your Matugen variables.*

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for optimizations or new features, feel free to open an issue or a PR.

## 📄 License

MIT © [Ubaid](https://github.com/Ubaidullah-Web-Dev)
