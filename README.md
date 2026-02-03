# @10play/expo-air

Vibe Coding for React-Native - AI-powered on-device development with Claude.

## Features

- Floating widget overlay on your iOS device
- Send prompts to Claude directly from your phone
- Real-time code changes via Expo Metro
- Git status monitoring
- Tunnel support for remote development

## Requirements

- Expo SDK 54+
- iOS 15.1+ (iOS only in v0)
- Node.js 18+

## Installation

### 1. Install the package

```bash
npm install @10play/expo-air
```

### 2. Initialize in your project

```bash
npx expo-air init
```

This will:
- Create `.expo-air.json` configuration file
- Add the plugin to your `app.json`
- Update `.gitignore`
- Run `expo prebuild` to generate native iOS code

### 3. Start development

```bash
npx expo-air start
```

This starts:
- Widget Metro server (port 8082)
- Prompt server (port 3847)
- App Metro server (port 8081)
- Cloudflare tunnels for remote access (optional)

The widget will appear automatically when your app launches in DEBUG mode.

## Usage

### CLI Commands

```bash
# Initialize expo-air in your project
npx expo-air init
npx expo-air init --force              # Overwrite existing config
npx expo-air init --skip-prebuild      # Skip running expo prebuild

# Start the development environment
npx expo-air start
npx expo-air start --no-tunnel         # Skip tunnel (local network only)
npx expo-air start --no-build          # Skip building the app
npx expo-air start --no-server         # Skip starting the WebSocket server

# Start only the WebSocket server
npx expo-air server
```

### Port Options

```bash
npx expo-air start \
  --port 3847 \           # Prompt server port
  --widget-port 8082 \    # Widget Metro port
  --metro-port 8081       # App Metro port
```

## Configuration

### .expo-air.json

Configuration file created by `expo-air init`:

```json
{
  "autoShow": true,
  "ui": {
    "bubbleSize": 60,
    "bubbleColor": "#007AFF"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoShow` | boolean | `true` | Auto-show widget on app launch |
| `ui.bubbleSize` | number | `60` | Size of the floating bubble |
| `ui.bubbleColor` | string | `"#007AFF"` | Color of the floating bubble |

### .expo-air.local.json (gitignored)

Auto-generated file containing tunnel URLs for the current session:

```json
{
  "serverUrl": "wss://...",
  "widgetMetroUrl": "https://...",
  "appMetroUrl": "https://..."
}
```

## How It Works

1. **App launches** - `ExpoAirAppDelegateSubscriber` triggers (DEBUG builds only)
2. **Config loaded** - Settings read from `Info.plist` (set by plugin during prebuild)
3. **Widget loads** - `FloatingBubbleManager` loads widget bundle from Metro server
4. **Connection established** - Widget connects to prompt server via WebSocket
5. **Ready to vibe** - Send prompts to Claude from your device

## Development Mode Only

The widget is designed for development only and will **never appear in production builds**. This is enforced via:

- `#if DEBUG` guards in native Swift code
- Widget loads from Metro dev server (no bundled JS)
- No impact on release builds

## Troubleshooting

### Widget not appearing

1. Ensure you're running a DEBUG build (not release/production)
2. Check that Metro servers are running (`npx expo-air start`)
3. Verify `autoShow: true` in `.expo-air.json`
4. Check Xcode console for `[expo-air]` logs

### Connection issues

1. For local development, ensure device is on same WiFi as your computer
2. For remote development, use tunnels (`npx expo-air start` enables by default)
3. Check that ports 3847, 8081, 8082 are not blocked

### Prebuild issues

If prebuild fails, try:
```bash
npx expo prebuild --platform ios --clean
```

## License

MIT
