#!/bin/bash

# MatugenFox Native Host Setup Script
# Automatically detects all supported Firefox-based browsers and installs
# the native messaging host manifest into each.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HOST_PATH="$SCRIPT_DIR/matugenfox_host.py"
MANIFEST_NAME="matugenfox.json"

echo "🦊 MatugenFox Setup"

# 1. Make host executable
echo "  > Making host script executable..."
chmod +x "$HOST_PATH"

# 2. Detect all supported browser environments (F5)
TARGETS=()

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Standard Firefox
    [ -d "$HOME/.mozilla" ] && TARGETS+=("$HOME/.mozilla/native-messaging-hosts")
    # LibreWolf
    [ -d "$HOME/.librewolf" ] && TARGETS+=("$HOME/.librewolf/native-messaging-hosts")
    # Flatpak Firefox
    [ -d "$HOME/.var/app/org.mozilla.firefox/.mozilla" ] && TARGETS+=("$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts")
    # Flatpak LibreWolf
    [ -d "$HOME/.var/app/io.gitlab.librewolf-community/.librewolf" ] && TARGETS+=("$HOME/.var/app/io.gitlab.librewolf-community/.librewolf/native-messaging-hosts")
    # Waterfox
    [ -d "$HOME/.waterfox" ] && TARGETS+=("$HOME/.waterfox/native-messaging-hosts")
    # Floorp
    [ -d "$HOME/.floorp" ] && TARGETS+=("$HOME/.floorp/native-messaging-hosts")
elif [[ "$OSTYPE" == "darwin"* ]]; then
    [ -d "$HOME/Library/Application Support/Mozilla" ] && TARGETS+=("$HOME/Library/Application Support/Mozilla/NativeMessagingHosts")
    [ -d "$HOME/Library/Application Support/LibreWolf" ] && TARGETS+=("$HOME/Library/Application Support/LibreWolf/NativeMessagingHosts")
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
    echo "❌ No supported Firefox-based browser detected."
    echo "   Install Firefox, LibreWolf, or another Gecko-based browser first."
    exit 1
fi

# 3. Install manifest into each detected browser
INSTALLED=0
for TARGET_DIR in "${TARGETS[@]}"; do
    mkdir -p "$TARGET_DIR"
    cat <<EOF > "$TARGET_DIR/$MANIFEST_NAME"
{
  "name": "matugenfox",
  "description": "MatugenFox Native Messaging Host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_extensions": [
    "matugenfox@ubaid.com"
  ]
}
EOF
    echo "  ✓ Installed: $TARGET_DIR"
    INSTALLED=$((INSTALLED + 1))
done

# 4. Initialize default config.json if missing
if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo "  > Initializing default config.json..."
    cat <<EOF > "$SCRIPT_DIR/config.json"
{
  "smoothTransitions": true,
  "ecoMode": false,
  "showSyncIndicator": true,
  "colorsPath": "~/.config/matugen/colors.css",
  "websitesDir": "~/.config/matugen/websites",
  "transitionMs": 300,
  "autoDisableDarkSites": false,
  "nakedMode": false,
  "paletteShortcut": "ctrl+alt+c",
  "presets": [],
  "blocklist": []
}
EOF
fi

echo ""
echo "✅ Setup Complete! Installed into $INSTALLED browser(s)."
echo "--------------------------------------------------"
echo "1. Load the extension in Firefox (about:debugging)."
echo "2. Open the extension Options to set your paths."
echo "3. Restart Firefox if the host doesn't connect."
echo "--------------------------------------------------"
