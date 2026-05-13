#!/usr/bin/env python3
import sys
import json
import struct
import os
import time
import re
import hashlib
import threading

# --- Global State ---
config = {
    "colors_file": None,
    "websites_dir": None
}
config_lock = threading.Lock()

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def parse_colors(colors_file):
    if not colors_file or not os.path.exists(colors_file):
        return {}
    
    try:
        with open(colors_file, 'r') as f:
            content = f.read()
        
        matches = re.findall(r'(--[\w-]+):\s*([^;]+);', content)
        return {name.strip(): value.strip() for name, value in matches}
    except Exception:
        return {}

def parse_websites(websites_dir):
    if not websites_dir or not os.path.exists(websites_dir):
        return {}
    
    websites = {}
    try:
        for filename in os.listdir(websites_dir):
            if filename.endswith(".css"):
                path = os.path.join(websites_dir, filename)
                with open(path, 'r') as f:
                    content = f.read()
                
                match = re.search(r'@-moz-document\s+domain\("([^"]+)"\)\s*\{(.*)\}', content, re.DOTALL)
                if match:
                    domain = match.group(1)
                    body = match.group(2).strip()
                    websites[domain] = body
                else:
                    domain = filename.replace(".css", "")
                    websites[domain] = content.strip()
    except Exception:
        pass
                
    return websites

def get_theme_data(colors_file, websites_dir):
    status = []
    if not colors_file or not os.path.exists(colors_file):
        status.append(f"Colors file not found: {colors_file}")
    if websites_dir and not os.path.exists(websites_dir):
        status.append(f"Websites dir not found: {websites_dir}")
        
    return {
        "colors": parse_colors(colors_file),
        "websites": parse_websites(websites_dir),
        "status": status if status else ["OK"]
    }

def get_data_hash(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode('utf-8')).hexdigest()

def message_handler():
    global config
    while True:
        try:
            msg = get_message()
            if not msg:
                break
            
            if msg.get("type") == "SET_CONFIG":
                new_config = msg.get("config", {})
                with config_lock:
                    config["colors_file"] = os.path.expanduser(new_config.get("colorsPath", ""))
                    config["websites_dir"] = os.path.expanduser(new_config.get("websitesDir", ""))
            
            elif msg.get("type") == "LIST_WEBSITES":
                with config_lock:
                    wdir = config["websites_dir"]
                if wdir and os.path.exists(wdir):
                    files = [f for f in os.listdir(wdir) if f.endswith(".css")]
                    send_message({"type": "WEBSITE_LIST", "files": sorted(files)})
                else:
                    send_message({"type": "WEBSITE_LIST", "files": []})

            elif msg.get("type") == "READ_WEBSITE_CSS":
                filename = msg.get("filename")
                with config_lock:
                    wdir = config["websites_dir"]
                if wdir and filename and not ".." in filename:
                    path = os.path.join(wdir, filename)
                    if os.path.exists(path):
                        with open(path, 'r') as f:
                            send_message({"type": "WEBSITE_CSS", "filename": filename, "content": f.read()})

            elif msg.get("type") == "SAVE_WEBSITE_CSS":
                filename = msg.get("filename")
                content = msg.get("content")
                with config_lock:
                    wdir = config["websites_dir"]
                if wdir and filename and content is not None and not ".." in filename:
                    path = os.path.join(wdir, filename)
                    with open(path, 'w') as f:
                        f.write(content)
                    send_message({"type": "SAVE_SUCCESS", "filename": filename})
        except Exception as e:
            # Optionally log error
            pass

def main():
    # Start message handler thread
    threading.Thread(target=message_handler, daemon=True).start()

    last_hash = ""
    last_colors_mtime = 0
    last_websites_mtime = 0
    
    while True:
        try:
            with config_lock:
                colors_file = config["colors_file"]
                websites_dir = config["websites_dir"]

            if not colors_file:
                # Wait for config from extension
                time.sleep(2)
                continue

            should_update = False
            
            # Check colors file
            if os.path.exists(colors_file):
                mtime = os.path.getmtime(colors_file)
                if mtime > last_colors_mtime:
                    last_colors_mtime = mtime
                    should_update = True
            
            # Check websites directory
            if websites_dir and os.path.exists(websites_dir):
                mtime = os.path.getmtime(websites_dir)
                if mtime > last_websites_mtime:
                    last_websites_mtime = mtime
                    should_update = True
            
            if should_update or not last_hash:
                data = get_theme_data(colors_file, websites_dir)
                current_hash = get_data_hash(data)
                
                if current_hash != last_hash:
                    last_hash = current_hash
                    data["timestamp"] = time.time()
                    send_message(data)
            
            time.sleep(2)
        except Exception:
            time.sleep(5)

if __name__ == "__main__":
    main()
