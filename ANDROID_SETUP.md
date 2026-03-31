# Android Development Setup & Testing Guide

## Prerequisites

### 1. Install Android SDK & Tools

**Option A: Android Studio (Recommended)**
```bash
# Download from: https://developer.android.com/studio
# Install Android Studio

# After installation, set environment variables (add to ~/.zshrc or ~/.bash_profile):
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator

# Verify installation
adb --version
```

**Option B: Command Line Tools Only**
```bash
# Download cmdline-tools from:
# https://developer.android.com/studio#command-tools

# Extract and set up
mkdir -p ~/Android/Sdk/cmdline-tools
# Extract downloaded file into cmdline-tools/latest/

export ANDROID_HOME=$HOME/Android/sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 2. Install SDKs & Build Tools

```bash
# Accept licenses
yes | sdkmanager --licenses

# Install necessary components
sdkmanager "platforms;android-34"
sdkmanager "build-tools;34.0.0"
sdkmanager "cmdline-tools;latest"
sdkmanager "emulator"
sdkmanager "system-images;android-34;google_apis;arm64-v8a"
```

### 3. Create Android Virtual Device (Emulator)

```bash
# Create emulator
avdmanager create avd \
  -n "Wine-Device" \
  -k "system-images;android-34;google_apis;arm64-v8a" \
  -d "Pixel 4"

# List available AVDs
avdmanager list avd

# Start emulator (run in background)
emulator -avd Wine-Device &
```

Or use Android Studio GUI:
- Open Android Studio → Device Manager → Create Virtual Device

## Building for Android

### Step 1: Install Capacitor CLI & Build Tools

```bash
cd /home/user/Wine-Management

# Install global Capacitor CLI
npm install -g @capacitor/cli

# Verify installation
cap --version
```

### Step 2: Add Android Platform (if not already added)

```bash
# Navigate to project root
cd /home/user/Wine-Management

# Check if android platform exists
ls -la android/

# If not, add it:
npx cap add android
```

### Step 3: Build the Web App for Production

```bash
# Build Vite web bundle (required before Android build)
npm run build

# Verify build output
ls -la dist/
```

### Step 4: Sync Web Assets to Android

```bash
# Copy built web assets to Android project
npx cap sync android
```

### Step 5: Open in Android Studio

```bash
# Open the Android project in Android Studio
npx cap open android
```

**Or manually:**
```bash
# Open the android folder in Android Studio
open -a "Android Studio" android/
```

## Running on Device/Emulator

### Option A: From Android Studio (Recommended)

1. **Connect Physical Device:**
   - Enable USB Debugging on phone (Settings → Developer Options)
   - Connect via USB cable
   - Verify connection: `adb devices`

2. **Or Start Emulator:**
   ```bash
   emulator -avd Wine-Device &
   ```

3. **In Android Studio:**
   - Select device in device dropdown (top toolbar)
   - Click green "Run" button (or Shift+F10)
   - Wait for app to build and install

### Option B: From Command Line

```bash
# List connected devices/emulators
adb devices

# Build debug APK
./gradlew assembleDebug

# Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.example.winemanagement/.MainActivity
```

### Option C: Live Reload Development

```bash
cd /home/user/Wine-Management

# Start dev server (terminal 1)
npm run dev

# In another terminal, start live reload
npx cap run android

# After any code change, save and reload in browser
```

## Troubleshooting

### Problem: "Unable to locate Android SDK"
```bash
# Check ANDROID_HOME is set
echo $ANDROID_HOME

# If not set, add to ~/.zshrc:
export ANDROID_HOME=$HOME/Library/Android/sdk
source ~/.zshrc
```

### Problem: "Gradle build failed"
```bash
# Clean build
cd android/
./gradlew clean
./gradlew assembleDebug

# Or from project root
cd /home/user/Wine-Management
npx cap build android
```

### Problem: "Device not authorized"
```bash
# On device, approve the ADB authorization prompt
# Or revoke and restart:
adb kill-server
adb start-server
adb devices
```

### Problem: "App crashes on launch"
```bash
# View logs
adb logcat | grep -i wine
# or
adb logcat -s "Wine-Management"

# Clear app data
adb shell pm clear com.example.winemanagement
```

## Database on Android

The app uses Capacitor's SQLite plugin:
- **Location:** `/data/data/com.example.winemanagement/databases/`
- **File:** `wine_database.db`

To access device database:
```bash
# Pull database from device
adb pull /data/data/com.example.winemanagement/databases/wine_database.db ./wine_db.db

# Inspect with SQLite
sqlite3 wine_db.db ".tables"
```

## Performance Tips

- **Cold start:** First install takes 30-60 seconds
- **Hot reload:** Code changes with live reload: 2-5 seconds
- **Emulator performance:** Use `-cores 4 -memory 4096` flags for faster emulator

## Building Release APK

```bash
cd /home/user/Wine-Management

# Build release bundle
npm run build
npx cap sync android
cd android/
./gradlew bundleRelease

# Output: app/build/outputs/bundle/release/app-release.aab
```

## Next Steps

1. **First Run:**
   ```bash
   emulator -avd Wine-Device &  # Start emulator
   sleep 30                      # Wait for emulator to boot
   cd /home/user/Wine-Management
   npm run build
   npx cap sync android
   npx cap run android
   ```

2. **Testing the Fix:**
   - Import wine CSV via app UI
   - Navigate to Schedule → Delivery Schedule
   - Verify all 617 wines appear in deliveries
   - Check spanning 2026-2050 with 19 deliveries

3. **Debugging:**
   - Use Chrome DevTools (chrome://inspect) to debug Android WebView
   - Or use Android Studio's built-in debugger

## Common Commands Reference

```bash
# Check Android setup
adb devices
sdkmanager --list
avdmanager list avd

# Build & deploy
npm run build && npx cap sync android && npx cap open android

# Clean rebuild
rm -rf node_modules dist android && npm install && npm run build && npx cap add android

# Logs
adb logcat
adb logcat -c  # Clear logs
```

Good luck! 🚀
