# Realtime 1:1 Chat (React Native + Node.js + Socket.IO)

**Updated for Expo SDK 53 with Web Support**

Monorepo structure:
- server: Express + Socket.IO + MongoDB (Mongoose)
- client: React Native (Expo SDK 53) app with web support

## Requirements implemented:
- JWT auth (register/login)
- Users list with last message
- Real-time chat, typing indicators, presence, delivery/read receipts
- Messages persisted in MongoDB
- **Web browser support** for testing

## Setup (Windows PowerShell):

### 1) Prerequisites
- Node.js 18+
- Git
- MongoDB Atlas account OR local MongoDB
- Expo Go app on your phone (for testing)

### 2) Server Setup
```powershell
cd server
npm install
```

Create a `.env` file in server folder:
```ini
PORT=4000
MONGO_URI=mongodb+srv://yuvraj0121singh:YOUR_PASSWORD@cluster0.p3gmjmy.mongodb.net/rn_realtime_chat?retryWrites=true&w=majority
JWT_SECRET=replace_me
```

Start the API + Socket.IO:
```powershell
npm run dev
```

### 3) Client Setup (Expo SDK 53)
```powershell
cd client
npm install
```

### 4) Test in Browser First (Recommended)
```powershell
# Start Expo in web mode
npx expo start --web
```

**Benefits of testing in browser:**
- Faster development and debugging
- Easier to identify code issues
- No mobile device setup required

### 5) Configure API Base for Mobile
- **Android emulator**: `http://10.0.2.2:4000` (default)
- **Physical device**: Use your PC's LAN IP
- **iOS simulator** (macOS only): `http://localhost:4000`

Set environment variable:
```powershell
$env:EXPO_PUBLIC_API_BASE = "http://YOUR_PC_LAN_IP:4000"
```

### 6) Start Expo for Mobile
```powershell
npm run start
```

Then:
- **Android emulator**: Press `a` in terminal
- **Physical device**: Scan QR code with Expo Go app
- **iOS simulator** (macOS): Press `i` in terminal

## API Endpoints
- `POST /auth/register` { name, email, password }
- `POST /auth/login` { email, password }
- `GET /users` (requires Authorization: Bearer <token>) returns users + lastMessage
- `GET /conversations/:id/messages` (requires auth)

## Socket Events
- `message:send` { toUserId, text, clientId }
- `message:new` → pushed on both sender and receiver
- `typing:start|typing:stop` { toUserId }
- `message:read` { messageId }
- `presence:update` { userId, online }

## Key Changes for SDK 53
- Updated to React 19.0.0 (required for SDK 53)
- Updated to React Native 0.77.0 (compatible with React 19)
- Updated all Expo packages to SDK 53 versions
- Uses new `expo/AppEntry.js` entry point structure
- Added web support with react-dom, react-native-web, and metro-runtime
- Proper app.json configuration for SDK 53

## Troubleshooting

### If you get "PlatformConstants could not be found" error:
1. **Clear Expo cache completely:**
   ```bash
   cd client
   npx expo start --clear
   ```
2. **If still not working, try:**
   ```bash
   cd client
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   npm install
   npx expo start --clear
   ```
3. Make sure you're using Expo Go SDK 53
4. Restart the Expo development server

### If web mode doesn't work:
1. **Check React version compatibility:**
   ```bash
   cd client
   npm list react react-dom
   ```
2. **Reinstall web dependencies:**
   ```bash
   npx expo install react-dom react-native-web @expo/metro-runtime
   ```

### If the app doesn't connect to backend:
1. Check your PC's LAN IP: `ipconfig`
2. Set the correct API base: `$env:EXPO_PUBLIC_API_BASE = "http://YOUR_IP:4000"`
3. Ensure backend is running on port 4000
4. Check MongoDB Atlas network access

## Project Structure
```
client/
├── expo/
│   └── AppEntry.js          # Expo SDK 53 entry point
├── src/
│   ├── screens/             # App screens
│   ├── api/                 # API functions
│   ├── socket/              # Socket.io setup
│   └── state/               # Auth context
├── App.js                   # Main app component
├── package.json             # Dependencies (React 19 + React Native 0.77.0 + web support)
└── app.json                 # Expo configuration with web support
```

## Development Workflow
1. **Start backend server** first
2. **Test in browser** using `npx expo start --web`
3. **Fix any code issues** in browser environment
4. **Test on mobile** once browser version works
5. **Debug mobile-specific issues** if they arise

## Notes
- For Android emulator, 10.0.2.2 maps to your host machine's localhost
- If you change the API base, restart Expo to pick up the env var
- Make sure your MongoDB Atlas Network Access allows your IP
- The app now uses React 19, React Native 0.77.0, and proper Expo SDK 53 structure with web support!
- **Test in browser first** - it's faster and easier to debug!
- **Use PowerShell commands** for Windows: `Remove-Item -Recurse -Force` instead of `rmdir /s`


