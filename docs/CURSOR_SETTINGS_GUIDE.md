# Cursor AI Terminal Command Settings

## Quick Fix Steps

1. **Open Cursor Settings:**
   - Press `Ctrl + ,` (or `Cmd + ,` on Mac)
   - OR go to: **File → Preferences → Settings**

2. **Navigate to AI Settings:**
   - In the settings search bar, type: `AI terminal` or `cursor ai`
   - Look for settings related to:
     - "Allow AI to run terminal commands"
     - "AI terminal command execution"
     - "Preview terminal commands only"

3. **Enable Terminal Execution:**
   - Find: **"Allow AI to run terminal commands"** → Set to **ON/Enabled**
   - Find: **"Only show terminal commands (don't run)"** → Set to **OFF/Disabled**
   - Find: **"Preview terminal commands"** → Set to **OFF/Disabled**

4. **Alternative: Command Palette Method:**
   - Press `Ctrl + Shift + P` (or `Cmd + Shift + P`)
   - Type: `Preferences: Open Settings (UI)`
   - Search for `cursor.ai` or `terminal`

5. **Verify Git Credential Helper:**
   ```powershell
   git config --global credential.helper manager
   ```

## Test It Works

After adjusting settings, test with:
```powershell
git status
echo "test"
```

You should see actual command output, not just the command echoed back.

## If Settings Don't Appear

Cursor's AI settings might be under:
- **Settings → Features → AI**
- **Settings → Cursor → AI**
- Or check the Cursor-specific settings panel (separate from VS Code settings)


