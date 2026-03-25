# Wine Cellar - Deployment Guide

This guide covers building and deploying the Wine Cellar app across web, desktop (Electron), and mobile (Capacitor) platforms.

## Table of Contents

- [Development Setup](#development-setup)
- [Web (Browser)](#web-browser)
- [Desktop (Electron)](#desktop-electron)
- [Mobile (Capacitor)](#mobile-capacitor)
- [Building for Production](#building-for-production)
- [Database Management](#database-management)
- [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- Git
- (Optional) Android Studio for mobile development

### Install Dependencies

```bash
cd wine-app
npm install
```

---

## Web (Browser)

The web app is a React application built with Vite, optimized for development and quick iteration.

### Development Mode

```bash
npm run dev
```

Opens at `http://localhost:5173` with hot reload enabled.

### Production Build

```bash
npm run build
```

Creates optimized build in `dist/` directory (~300KB gzipped).

### Deployment

Deploy the `dist/` folder to any static hosting:
- **Vercel**: `vercel deploy`
- **Netlify**: Drag & drop `dist/` folder
- **GitHub Pages**: Push to gh-pages branch
- **Custom Server**: Serve `dist/index.html` as fallback for routing

---

## Desktop (Electron)

The Electron build creates native desktop applications for Windows, macOS, and Linux.

### Architecture

- **Main Process**: `electron-main.ts` - Handles window creation, database, IPC
- **Preload Script**: `electron-preload.ts` - Secure IPC bridge for database access
- **Database**: better-sqlite3 stored at `${userData}/wine-collection.db`
- **Build System**: electron-builder for packaging

### Development Mode

```bash
npm run dev:electron
```

This:
1. Builds the Electron main process and preload script
2. Builds the web assets
3. Launches Electron with dev tools

### Production Build

#### Windows

```bash
npm run build:electron
```

Creates:
- `dist-electron/wine-app Setup 0.0.0.exe` (NSIS installer)
- `dist-electron/wine-app 0.0.0.exe` (Portable)

#### macOS

```bash
npm run build:electron
```

Creates:
- `dist-electron/wine-app-0.0.0.dmg` (Disk image)
- `dist-electron/wine-app-0.0.0.zip` (Compressed app)

Requires code signing for distribution:
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
npm run build:electron
```

#### Linux

```bash
npm run build:electron
```

Creates:
- `dist-electron/wine-app-0.0.0.AppImage` (Single executable)
- `dist-electron/wine-app_0.0.0_amd64.deb` (Debian package)

### Distributing

1. **Direct Download**: Host executables on your website
2. **App Store**: Submit to Microsoft Store, Mac App Store, etc.
3. **Installer Package**: Use the generated installers
4. **Auto-Updates**: Configure electron-updater for automatic updates

---

## Mobile (Capacitor)

Capacitor wraps the web app as a native Android/iOS application.

### Prerequisites

- Android Studio (for Android)
- Xcode (for iOS, macOS only)
- Capacitor CLI: `npm install -g @capacitor/cli`

### Setup

#### Initialize Capacitor

```bash
npx cap init wine-app --web-dir=dist
```

#### Add Android Platform

```bash
npx cap add android
```

This creates the Android project in `android/` directory.

#### Install Plugins

```bash
npm install @capacitor-community/sqlite
npx cap sync
```

### Development Mode

#### Build Web Assets

```bash
npm run build
```

#### Sync to Android

```bash
npx cap sync android
```

#### Open Android Studio

```bash
npx cap open android
```

Build and run using Android Studio's emulator or connected device.

### Production Build

#### Generate Signed APK

1. **Create Keystore**:
```bash
keytool -genkey -v -keystore wine-cellar-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias wine-cellar
```

2. **Configure Gradle**:
   - Copy `wine-cellar-release.keystore` to `android/app/`
   - Edit `android/app/build.gradle`:
```gradle
signingConfigs {
    release {
        storeFile file('wine-cellar-release.keystore')
        storePassword 'your-store-password'
        keyAlias 'wine-cellar'
        keyPassword 'your-key-password'
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
```

3. **Build APK**:
```bash
cd android
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

4. **Build AAB (for Play Store)**:
```bash
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

#### Upload to Play Store

1. Create app on [Google Play Console](https://play.google.com/console)
2. Create release track
3. Upload AAB file
4. Add screenshots, description, content rating
5. Submit for review

---

## Building for Production

### Checklist

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Run tests: `npm run lint`
- [ ] Build all platforms and verify
- [ ] Test database export/import
- [ ] Test CSV import with sample data
- [ ] Verify schedule generation works

### Full Release Build

```bash
# Update version
npm version patch  # or minor/major

# Build web
npm run build

# Build Electron
npm run build:electron

# Build Android
npm run build
npx cap sync android
# Then in Android Studio: Build → Generate Signed Bundle/APK

# Commit and tag
git commit -m "Release v0.1.0"
git tag -a v0.1.0 -m "Version 0.1.0"
git push origin --tags
```

---

## Database Management

### Database Location

- **Electron**: `~/.config/wine-app/wine-collection.db` (Linux/Mac) or `%APPDATA%\wine-app\wine-collection.db` (Windows)
- **Web**: Browser IndexedDB (local)
- **Android**: App internal storage

### Backup & Export

The app provides CSV export in Settings:
1. Open Settings page
2. Click "Export Wines"
3. Save CSV file

### Restore

1. Open Settings page
2. Click "Select CSV File" and choose exported CSV
3. Data merges with existing wines

### Manual Database Access (Electron)

```bash
# Install SQLite CLI
# macOS: brew install sqlite3
# Linux: apt-get install sqlite3
# Windows: Download from sqlite.org

# Open database
sqlite3 ~/.config/wine-app/wine-collection.db

# Useful queries
SELECT COUNT(*) as wine_count FROM wines;
SELECT DISTINCT location FROM wines;
SELECT * FROM cellar_config;
```

---

## Troubleshooting

### Electron App Won't Start

**Problem**: `Cannot find module 'electron-is-dev'`
- **Solution**: `npm install`

**Problem**: Blank window or database not loading
- **Solution**: Check DevTools (F12) for errors. Database path must exist.

### Build Fails

**Problem**: TypeScript errors during `build:electron-main`
- **Solution**: Ensure `@types/better-sqlite3` is installed: `npm install --save-dev @types/better-sqlite3`

**Problem**: electron-builder fails on Windows
- **Solution**: Install Windows Build Tools: `npm install --global windows-build-tools`

### Database Issues

**Problem**: "Database is locked"
- **Solution**: Close all instances of the app and try again

**Problem**: CSV import fails
- **Solution**: Verify CSV format matches export format. Check browser console for specific error.

### Android Build Issues

**Problem**: Gradle build fails
- **Solution**:
  - `cd android && ./gradlew clean`
  - Update Android SDK in Android Studio
  - Clear Gradle cache: `~/.gradle/caches`

**Problem**: App crashes on Android startup
- **Solution**: Check Logcat in Android Studio (Android Monitor → Logcat tab)

---

## Environment Variables

### Build Flags

```bash
# Skip library check
SKIP_LIB_CHECK=true npm run build

# Electron code signing (macOS)
export CSC_LINK=/path/to/cert.p12
export CSC_KEY_PASSWORD=password

# Capacitor environment
CAPACITOR_LOG_FILE=capacitor.log npx cap sync
```

---

## Performance Optimization

### Web
- Vite automatically tree-shakes unused code
- CSS is minified with Tailwind purging
- Assets are gzipped (~90KB JS, ~3KB CSS)

### Electron
- SQLite queries use indexes on common fields (location, tier, vintage)
- Database connections use WAL mode for concurrency
- Assets cached in dist-electron/

### Mobile
- Capacitor plugins lazily loaded
- SQLite database optimized with pragma statements
- APK size ~50-80MB depending on Android version

---

## Support

For issues or questions:
1. Check this guide
2. Review GitHub Issues
3. Check app logs:
   - Electron: DevTools Console (F12)
   - Android: Logcat in Android Studio
   - Browser: Developer Tools (F12)

---

## License

Wine Cellar © 2026. All rights reserved.
