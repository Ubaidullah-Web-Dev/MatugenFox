# 🦊 MatugenFox

**Live, dynamic webpage theming for Firefox powered by Matugen.**

MatugenFox brings your system-wide [Matugen](https://github.com/InioAsman/matugen) colors directly into your browser. Unlike static CSS themes, MatugenFox injects your colors into every open tab in real-time. Change your wallpaper, and watch your browser colors update instantly with buttery-smooth transitions—without reloading a single page.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-Extension-orange.svg)

---

## ✨ Features

- **🚀 Real-Time Injection**: Updates colors instantly across all tabs as soon as Matugen generates new colors.
- **🔖 Premium Preset System**: Create, edit, and save custom color presets. Perfect for switching between moods.
- **⌨️ Command Palette**: A power-user command palette accessible via `Ctrl+Alt+C` to quickly switch presets, manage sites, and access settings.
- **🌊 Smooth Transitions**: Employs an intelligent DOM transition engine that smoothly interpolates colors between theme changes, accompanied by a satisfying glowing sync indicator.
- **🎨 Live CSS Editor & Site-Specific CSS**: Automatically applies custom CSS overrides for specific domains using your Matugen variables.
- **🔋 Eco Mode**: Pauses background broadcasts for inactive tabs to save battery. Tabs fetch the latest theme only when you switch to them.
- **🧊 Naked Mode**: Maximum performance mode that applies your theme instantly without any animations or effects.
- **🛡️ Data Persistence**: Integrated with a Native Messaging Host to ensure your presets and settings are stored safely on your disk and survive browser restarts.
- **🚫 Intelligent Blocklist**: Instantly disable theming on broken sites from the popup or context menu.
- **🛡️ Crash-Proof & Lightweight**: Optimized with staggered updates, IPC filtering, and strict write serialization to ensure zero system lag.

---

## 🛠️ Installation

### 1. Install the Extension
Get the official extension from the Firefox Add-ons store:
👉 **[Install MatugenFox on Firefox](https://addons.mozilla.org/en-US/firefox/addon/matugenfox/)**

### 2. Setup the Native Host
The Native Host is a small Python bridge that watches your files and talks to Firefox.

```bash
git clone https://github.com/Ubaidullah-Web-Dev/MatugenFox.git
cd MatugenFox
chmod +x setup.sh
./setup.sh
```

---

## ⚙️ Configuration

Once installed, point MatugenFox to your files:

1.  Click the **MatugenFox icon** (🦊) in your toolbar.
2.  Click the **⚙ Settings** button to open the Options page.
3.  Go to the **General** tab and enter the absolute paths to your files:
    - **Colors CSS Path**: e.g., `/home/user/.config/matugen/colors.css`
    - **Websites CSS Directory**: e.g., `/home/user/MatugenFox/Website Templates`
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

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for optimizations or new features, feel free to open an issue or a PR.

## 📄 License

MIT © [Ubaid](https://github.com/Ubaidullah-Web-Dev)
