const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// Elite Decryption Key
const SECRET_KEY = '38346b38';
const JIOSAAVN_BASE = 'https://www.jiosaavn.com/api.php';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const getHeaders = () => ({
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'Cookie': 'L=hindi; gdpr_acceptance=true; pro=false'
});

const decrypt = (data) => {
    if (!data) return null;
    try {
        // NOTE: If this fails with "unsupported", you must set NODE_OPTIONS=--openssl-legacy-provider
        const decipher = crypto.createDecipheriv('des-ecb', SECRET_KEY, '');
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted.trim();
    } catch (e) {
        console.error('Decryption failed:', e.message);
        return null;
    }
};

// Transform song data
const transformSong = (song) => {
    if (!song) return null;
    
    const encryptedUrl = song.more_info?.encrypted_media_url || song.encrypted_media_url || '';
    const directUrl = decrypt(encryptedUrl);
    
    // Decode image URL
    let imageUrl = song.image || '';
    if (typeof imageUrl === 'string') {
        imageUrl = imageUrl.replace('150x150', '500x500').replace('50x50', '500x500');
    } else if (Array.isArray(imageUrl)) {
        imageUrl = imageUrl[2]?.url || imageUrl[1]?.url || imageUrl[0]?.url || '';
    }

    return {
        id: song.id,
        name: song.title || song.song || song.name || '',
        title: song.title || song.song || song.name || '',
        album: song.more_info?.album || song.album?.name || song.album || 'Single',
        year: song.year || '',
        duration: song.more_info?.duration || song.duration || 0,
        singers: song.more_info?.singers || song.singers || song.primary_artists || song.primaryArtists || 'Arijit Singh & Pritam',
        image: imageUrl,
        media_urls: {
            "320_KBPS": directUrl ? directUrl.replace(/(_12|_48|_96|_160)\.mp4/, '_320.mp4') : null,
            "160_KBPS": directUrl ? directUrl.replace(/(_12|_48|_96|_320)\.mp4/, '_160.mp4') : null,
            "96_KBPS": directUrl ? directUrl.replace(/(_12|_48|_160|_320)\.mp4/, '_96.mp4') : null
        },
        rawEncryptedUrl: encryptedUrl
    };
};

// Root
app.get('/', (req, res) => res.json({ status: "online", engine: "Elevengram-V3-Elite" }));

// SEARCH
app.get('/api/search', async (req, res) => {
    const { query, page = 1, limit = 20 } = req.query;
    
    if (!query?.trim()) {
        return res.status(400).json({ status: 'failed', error: 'Query parameter required' });
    }

    try {
        const response = await axios.get(JIOSAAVN_BASE, {
            params: {
                __call: 'search.getResults',
                _format: 'json',
                _marker: '0',
                api_version: '4',
                ctx: 'web6dot0',
                q: query.trim(),
                p: page,
                n: limit
            },
            headers: getHeaders(),
            timeout: 15000
        });

        const data = response.data;
        if (!data || !data.results) {
            return res.json({ status: "failed", data: { total: 0, results: [] } });
        }

        const results = data.results.map(transformSong).filter(Boolean);
        res.json({
            status: "success",
            data: {
                total: parseInt(data.total) || results.length,
                results: results
            }
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

// SONG DETAILS
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    if (!id?.trim()) return res.status(400).json({ status: 'failed', error: 'Song ID required' });

    try {
        const response = await axios.get(JIOSAAVN_BASE, {
            params: {
                __call: 'song.getDetails',
                _format: 'json',
                api_version: '4',
                ctx: 'web6dot0',
                pids: id.trim()
            },
            headers: getHeaders(),
            timeout: 15000
        });

        const songKey = Object.keys(response.data || {})[0];
        const songData = response.data[songKey];
        if (!songData) return res.status(404).json({ status: 'failed', error: 'Song not found' });

        res.json({ status: 'success', data: transformSong(songData) });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🎵 Server: http://localhost:${PORT}`));
}

module.exports = app;