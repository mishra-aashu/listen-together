# Elevengram Music Engine 🎵

A high-performance Node.js proxy for JioSaavn, designed for seamless integration with **ELEVENGRAM**.

## Features
- ✅ **CORS Ready**: Connect from any React/Capacitor frontend.
- ✅ **Search**: Fast song search via `/api/search?query=...`.
- ✅ **HQ Audio**: Fetch high-quality 320kbps links via `/api/song?id=...`.
- ✅ **Vercel Optimized**: Ready for instant deployment as a Serverless Function.

## Deployment Instructions

### 1. Local Testing
```bash
npm install
node index.js
```
Then visit `http://localhost:3000/api/search?query=Kesariya`

### 2. Deploy to Vercel
1. Push this code to a new GitHub repository.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard).
3. Click **New Project** and import your repository.
4. Vercel will auto-detect the configuration and deploy it.

## Connecting to ELEVENGRAM
Once deployed, set your Vercel URL in your app's `.env` file:
```env
VITE_MUSIC_API_URL=https://your-app.vercel.app
```

### Usage Example (Frontend)
```javascript
const response = await fetch(`https://your-app.vercel.app/api/search?query=${term}`);
const data = await response.json();
```

---
*Built for the ELEVENGRAM ecosystem.*
