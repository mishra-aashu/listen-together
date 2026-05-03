const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Direct JioSaavn Internal API - Most Reliable
const JIOSAAVN_BASE = 'https://www.jiosaavn.com/api.php';

const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'Cookie': 'L=hindi; gdpr_acceptance=true; pro=false'
});

// Decode encrypted media URL
const decodeMediaUrl = (url) => {
    if (!url) return '';
    try {
        // JioSaavn uses base64 encoded URLs
        const decoded = Buffer.from(url, 'base64').toString('utf-8');
        return decoded.replace(/^http:/, 'https:');
    } catch {
        return url;
    }
};

// Generate all quality URLs from base URL
const generateQualityUrls = (baseUrl) => {
    if (!baseUrl) return [];
    
    const decoded = decodeMediaUrl(baseUrl);
    const urls = [];
    const qualities = ['12', '48', '96', '160', '320'];
    
    qualities.forEach(q => {
        const link = decoded.replace(/(_12|_48|_96|_160|_320)\.mp4/, `_${q}.mp4`);
        urls.push({
            quality: `${q}kbps`,
            link: link
        });
    });
    
    return urls;
};

// Transform JioSaavn song format
const transformSong = (song) => {
    if (!song) return null;
    
    try {
        // Decode image URL
        const imageUrl = song.image 
            ? song.image.replace('150x150', '500x500').replace('50x50', '500x500')
            : '';
        
        // Get download URLs
        const downloadUrl = generateQualityUrls(song.more_info?.encrypted_media_url || song.encrypted_media_url);
        
        return {
            id: song.id,
            name: song.title || song.song || '',
            album: song.more_info?.album || song.album || '',
            year: song.year || '',
            duration: song.more_info?.duration || song.duration || 0,
            singers: song.more_info?.singers || song.singers || song.primary_artists || '',
            language: song.language || '',
            hasLyrics: song.more_info?.has_lyrics === 'true',
            image: imageUrl,
            downloadUrl: downloadUrl,
            rawEncryptedUrl: song.more_info?.encrypted_media_url || ''
        };
    } catch (error) {
        console.error('Transform error:', error.message);
        return null;
    }
};

// Root
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Elevengram Music Engine v3.0',
        source: 'Direct JioSaavn API',
        endpoints: {
            search: '/api/search?query=YOUR_QUERY&page=1&limit=20',
            song: '/api/song?id=SONG_ID',
            debug: '/api/debug',
            health: '/health'
        }
    });
});

// DEBUG ENDPOINT - temporarily added
app.get('/api/debug', async (req, res) => {
    const results = {};
    
    const testUrls = [
        'https://jiosaavn-api-ts.vercel.app/search/songs?query=Kesariya',
        'https://jiosaavn-api-ts.vercel.app/songs/search?query=Kesariya',
        'https://jiosaavn-api-ts.vercel.app/api/search?query=Kesariya',
        'https://saavn-api-rouge.vercel.app/api/search/songs?query=Kesariya',
        'https://saavn-api-rouge.vercel.app/api/songs/search?query=Kesariya',
    ];
    
    for (const url of testUrls) {
        try {
            const response = await axios.get(url, { 
                timeout: 8000,
                validateStatus: () => true 
            });
            results[url] = {
                status: response.status,
                contentType: response.headers['content-type'],
                // First 500 chars of response
                preview: JSON.stringify(response.data).substring(0, 500)
            };
        } catch (error) {
            results[url] = { error: error.message };
        }
    }
    
    res.json(results);
});

// SEARCH
app.get('/api/search', async (req, res) => {
    const { query, page = 1, limit = 20 } = req.query;
    
    if (!query?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'Query parameter required'
        });
    }

    try {
        console.log(`\n🔍 Searching: "${query}"`);
        
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
        
        console.log(`📦 Raw response keys:`, Object.keys(data || {}));

        if (!data || !data.results) {
            return res.status(404).json({
                status: 'failed',
                error: 'No results found',
                rawKeys: Object.keys(data || {})
            });
        }

        const results = data.results.map(transformSong).filter(Boolean);
        
        console.log(`✅ Results: ${results.length}`);

        res.json({
            status: 'success',
            data: {
                total: parseInt(data.total) || results.length,
                start: parseInt(data.start) || 1,
                results: results
            }
        });

    } catch (error) {
        console.error('❌ Search Error:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Search failed',
            message: error.message
        });
    }
});

// SONG DETAILS
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    
    if (!id?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'Song ID required'
        });
    }

    try {
        console.log(`\n🎵 Fetching song: ${id}`);
        
        const response = await axios.get(JIOSAAVN_BASE, {
            params: {
                __call: 'song.getDetails',
                _format: 'json',
                _marker: '0',
                api_version: '4',
                ctx: 'web6dot0',
                pids: id.trim()
            },
            headers: getHeaders(),
            timeout: 15000
        });

        const data = response.data;
        
        // Song details come as object with song id as key
        const songKey = Object.keys(data || {})[0];
        const songData = data[songKey];
        
        if (!songData) {
            return res.status(404).json({
                status: 'failed',
                error: 'Song not found'
            });
        }

        const transformed = transformSong(songData);

        res.json({
            status: 'success',
            data: transformed
        });

    } catch (error) {
        console.error('❌ Song Error:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Failed to fetch song',
            message: error.message
        });
    }
});

// HEALTH
app.get('/health', async (req, res) => {
    try {
        await axios.get('https://www.jiosaavn.com', { timeout: 5000 });
        res.json({
            service: 'healthy',
            source: 'JioSaavn Direct',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch {
        res.json({
            service: 'degraded',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    }
});

// 404
app.use((req, res) => {
    res.status(404).json({
        status: 'failed',
        error: 'Endpoint not found'
    });
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🎵 Server: http://localhost:${PORT}`);
    });
}

module.exports = app;