# NexorCRM Mobile App

A React Native (Expo) mobile CRM app for NexorCRM — supports **Android & iOS**.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- [Expo Go](https://expo.dev/go) app on your Android or iPhone

### Run the App

```bash
cd mobile
npm install
npm start
```

Then:
- **Android:** Scan the QR code with **Expo Go** app
- **iOS:** Scan the QR code with the **Camera** app → open in Expo Go
- **Android Emulator:** Press `a` in the terminal
- **iOS Simulator:** Press `i` in the terminal (macOS only)

---

## 📁 Project Structure

```
mobile/
├── App.jsx                        # Entry point
├── app.json                       # Expo config (name, bundle ID, icons)
├── src/
│   ├── context/
│   │   └── AuthContext.jsx        # JWT auth state (login/logout)
│   ├── navigation/
│   │   ├── AppNavigator.jsx       # Root navigator (Auth vs. Main)
│   │   └── MainTabs.jsx           # Bottom tab bar
│   ├── screens/
│   │   ├── auth/LoginScreen.jsx
│   │   ├── dashboard/DashboardScreen.jsx
│   │   ├── leads/LeadsScreen.jsx
│   │   ├── leads/LeadDetailScreen.jsx
│   │   ├── opportunities/OpportunitiesScreen.jsx
│   │   ├── opportunities/OpportunityDetailScreen.jsx
│   │   ├── projects/ProjectsScreen.jsx
│   │   ├── projects/ProjectDetailScreen.jsx
│   │   └── profile/ProfileScreen.jsx
│   ├── services/
│   │   ├── api.js                 # Axios + JWT interceptor
│   │   ├── auth.js
│   │   ├── leads.js
│   │   ├── opportunities.js
│   │   ├── projects.js
│   │   └── dashboard.js
│   ├── components/
│   │   ├── StatCard.jsx
│   │   ├── LeadCard.jsx
│   │   ├── OpportunityCard.jsx
│   │   ├── ProjectCard.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── EmptyState.jsx
│   │   └── SearchBar.jsx
│   └── theme/
│       ├── colors.js
│       ├── typography.js
│       └── spacing.js
```

## 🔌 Backend Connection

The app connects to the NexorCRM backend at:

| Platform         | URL                          |
|-----------------|------------------------------|
| Android Emulator | `http://10.0.2.2:7012/api`   |
| iOS Simulator    | `http://localhost:7012/api`   |
| Physical Device  | Use your PC's local IP e.g. `http://192.168.x.x:7012/api` |

> **Note:** For physical devices, update the `BASE_URL` in `src/services/api.js` with your PC's local network IP.

## 🔐 Login

Use the same credentials as the web app. Login is handled via JWT stored in AsyncStorage.

## 📦 Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure & build
eas build --platform android
eas build --platform ios
```
