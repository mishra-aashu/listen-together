const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Multiple Providers for 100% Uptime
const PROVIDERS = [
    'https://saavn.dev/api',
    'https://jiosaavn-api-privatecvc.vercel.app/api',
    'https://saavn-api.vercel.app/api'
];

// Anti-Bot Headers
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com'
});

// Normalizer: Sabhi providers ka data ek jaisa banata hai
const normalizeSong = (song) => {
    if (!song) return null;

    // Image extract (High quality priority)
    const images = song.image || song.images;
    const highResImage = Array.isArray(images) 
        ? (images[images.length - 1]?.url || images[images.length - 1]?.link || images[0]?.url)
        : images;

    // Download URLs handle karna
    let downloadUrls = [];
    if (Array.isArray(song.downloadUrl)) {
        downloadUrls = song.downloadUrl.map(d => ({ quality: d.quality, link: d.link || d.url }));
    } else if (song.media_url || song.url) {
        // Fallback for direct links
        const base = song.media_url || song.url;
        downloadUrls = [
            { quality: '12kbps', link: base.replace(/(_96|_160|_320)\.mp4/, '_12.mp4') },
            { quality: '48kbps', link: base.replace(/(_96|_160|_320)\.mp4/, '_48.mp4') },
            { quality: '96kbps', link: base.replace(/(_160|_320)\.mp4/, '_96.mp4') },
            { quality: '160kbps', link: base.replace(/(_96|_320)\.mp4/, '_160.mp4') },
            { quality: '320kbps', link: base.replace(/(_96|_160)\.mp4/, '_320.mp4') }
        ];
    }

    return {
        id: song.id,
        title: song.name || song.title || song.song,
        album: song.album?.name || song.album || 'Single',
        image: highResImage,
        singers: song.primaryArtists || song.singers || 'Various Artists',
        duration: song.duration,
        // Backward compatibility for your Elevengram Frontend
        media_urls: {
            "320_KBPS": downloadUrls.find(d => d.quality.includes('320'))?.link || downloadUrls[downloadUrls.length-1]?.link,
            "160_KBPS": downloadUrls.find(d => d.quality.includes('160'))?.link || downloadUrls[0]?.link
        },
        downloadUrl: downloadUrls
    };
};

// Smart Fetch with Fallback logic
const smartFetch = async (path, params) => {
    for (let url of PROVIDERS) {
        try {
            const res = await axios.get(`${url}${path}`, { 
                params, 
                headers: getHeaders(),
                timeout: 5000 
            });
            if (res.data && (res.data.status === 'success' || res.data.success)) {
                return res.data;
            }
        } catch (e) {
            console.log(`Provider ${url} failed, trying next...`);
        }
    }
    throw new Error("All music sources are currently blocked or down.");
};

app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        const data = await smartFetch('/search/songs', { query });
        const results = (data.data.results || data.data).map(normalizeSong);
        res.json({ status: true, data: { results } });
    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

app.get('/api/song', async (req, res) => {
    try {
        const { id } = req.query;
        const data = await smartFetch('/songs', { id });
        const song = normalizeSong(data.data[0] || data.data);
        res.json({ status: true, ...song });
    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

app.get('/', (req, res) => res.json({ status: "online", engine: "Elevengram Music v2" }));

module.exports = app;