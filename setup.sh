#!/bin/bash

# MatugenFox Native Host Setup Script
# This script registers the matugenfox native messaging host with Firefox.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HOST_PATH="$SCRIPT_DIR/matugenfox_host.py"
MANIFEST_NAME="matugenfox.json"
MANIFEST_PATH="$SCRIPT_DIR/extension/$MANIFEST_NAME"

echo "🦊 MatugenFox Setup"

# 1. Make host executable
echo "  > Making host script executable..."
chmod +x "$HOST_PATH"

# 2. Identify Firefox native messaging hosts directory
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    TARGET_DIR="$HOME/.mozilla/native-messaging-hosts"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    TARGET_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

mkdir -p "$TARGET_DIR"

# 3. Create/Update Manifest
echo "  > Generating native messaging manifest..."
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

echo "✅ Setup Complete!"
echo "--------------------------------------------------"
echo "1. Load the extension in Firefox (about:debugging)."
echo "2. Open the extension Options to set your paths."
echo "3. Restart Firefox if the host doesn't connect."
echo "--------------------------------------------------"
