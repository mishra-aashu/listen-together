const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// WORKING PROVIDERS (Verified Jan 2024)
const PROVIDERS = [
    {
        name: 'jiosaavn-primary',
        baseUrl: 'https://jiosaavn-api-ts.vercel.app',
        active: true
    },
    {
        name: 'saavn-backup',
        baseUrl: 'https://saavn-api-rouge.vercel.app/api',
        active: true
    }
];

const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
});

// Root
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Elevengram Music Engine',
        version: '2.2',
        endpoints: {
            search: '/api/search?query=YOUR_QUERY',
            song: '/api/song?id=SONG_ID',
            health: '/health'
        }
    });
});

// Transform song data
const transformSong = (song) => {
    if (!song) return null;

    try {
        const transformed = {
            id: song.id,
            name: song.name || song.title || song.song,
            album: song.album?.name || song.album || 'Unknown',
            year: song.year || song.releaseDate || '',
            duration: song.duration || 0,
            singers: song.primaryArtists || song.artists || song.singers || 'Unknown',
            language: song.language || '',
            image: extractImage(song),
            downloadUrl: extractDownloadUrls(song)
        };

        return transformed;
    } catch (error) {
        console.error('Transform error:', error.message);
        return null;
    }
};

// Extract best quality image
const extractImage = (song) => {
    if (!song.image) return '';
    
    if (Array.isArray(song.image)) {
        // Get highest quality (usually last in array)
        return song.image[song.image.length - 1]?.link || 
               song.image[song.image.length - 1]?.url ||
               song.image[2]?.link ||
               song.image[1]?.link ||
               song.image[0]?.link || '';
    }
    
    return song.image;
};

// Extract download URLs
const extractDownloadUrls = (song) => {
    const urls = [];
    
    // Handle different response formats
    if (Array.isArray(song.downloadUrl)) {
        song.downloadUrl.forEach(item => {
            if (item && (item.link || item.url)) {
                urls.push({
                    quality: item.quality || item.label || 'unknown',
                    link: item.link || item.url
                });
            }
        });
    } else if (song.downloadUrl && typeof song.downloadUrl === 'object') {
        Object.entries(song.downloadUrl).forEach(([quality, link]) => {
            if (link) urls.push({ quality, link });
        });
    }

    // Fallback to media_url or url
    if (urls.length === 0 && (song.media_url || song.url)) {
        urls.push({
            quality: '320kbps',
            link: song.media_url || song.url
        });
    }

    // Generate quality variants
    if (urls.length > 0) {
        const baseLink = urls[0].link;
        const qualities = ['12kbps', '48kbps', '96kbps', '160kbps', '320kbps'];
        
        qualities.forEach(quality => {
            if (!urls.find(u => u.quality === quality)) {
                const kbps = quality.replace('kbps', '');
                const newLink = baseLink.replace(/(_12|_48|_96|_160|_320)\.mp4/, `_${kbps}.mp4`);
                
                if (newLink !== baseLink && newLink.includes('.mp4')) {
                    urls.push({ quality, link: newLink });
                }
            }
        });
    }

    return urls.sort((a, b) => {
        const qa = parseInt(a.quality) || 0;
        const qb = parseInt(b.quality) || 0;
        return qa - qb;
    });
};

// Fetch with smart fallback
const fetchWithFallback = async (endpoint, params) => {
    const activeProviders = PROVIDERS.filter(p => p.active);
    const errors = [];

    for (let i = 0; i < activeProviders.length; i++) {
        const provider = activeProviders[i];
        const url = `${provider.baseUrl}/${endpoint}`;
        
        try {
            console.log(`[Attempt ${i + 1}/${activeProviders.length}] ${provider.name}: ${url}`);
            
            const response = await axios.get(url, {
                params,
                headers: getHeaders(),
                timeout: 12000,
                validateStatus: (status) => status < 500
            });

            // Check content type
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                console.log(`❌ ${provider.name}: Got HTML (blocked)`);
                errors.push(`${provider.name}: Bot protection`);
                continue;
            }

            // Validate response
            if (!response.data) {
                console.log(`❌ ${provider.name}: Empty response`);
                errors.push(`${provider.name}: No data`);
                continue;
            }

            // Check for actual data
            const hasResults = response.data.success === true || 
                             response.data.status === 'SUCCESS' ||
                             response.data.data ||
                             response.data.results;

            if (hasResults) {
                console.log(`✅ ${provider.name}: SUCCESS`);
                return { 
                    data: response.data, 
                    provider: provider.name 
                };
            } else {
                console.log(`❌ ${provider.name}: No results in response`);
                errors.push(`${provider.name}: Empty results`);
            }

        } catch (error) {
            const errorMsg = error.code === 'ENOTFOUND' 
                ? 'DNS failed' 
                : error.code === 'ETIMEDOUT' 
                ? 'Timeout' 
                : error.message;
            
            console.log(`❌ ${provider.name}: ${errorMsg}`);
            errors.push(`${provider.name}: ${errorMsg}`);
        }
    }

    throw new Error(`All providers failed: ${errors.join(', ')}`);
};

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
        console.log(`\n🔍 SEARCH REQUEST: "${query}"`);
        
        const { data, provider } = await fetchWithFallback('search/songs', {
            query: query.trim(),
            page,
            limit
        });

        // Extract results
        let rawResults = [];
        
        if (data.data?.results) rawResults = data.data.results;
        else if (data.data?.songs) rawResults = data.data.songs;
        else if (Array.isArray(data.data)) rawResults = data.data;
        else if (data.results) rawResults = data.results;
        else if (data.songs) rawResults = data.songs;

        console.log(`📦 Raw results count: ${rawResults.length}`);

        const results = rawResults.map(transformSong).filter(Boolean);

        console.log(`✅ Transformed results: ${results.length}`);

        res.json({
            status: 'success',
            data: {
                total: results.length,
                results: results
            },
            meta: {
                provider: provider,
                query: query,
                page: parseInt(page)
            }
        });

    } catch (error) {
        console.error('❌ SEARCH ERROR:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Search failed',
            message: error.message,
            hint: 'Try different keywords or check /health'
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
        console.log(`\n🎵 SONG REQUEST: ${id}`);
        
        const { data, provider } = await fetchWithFallback('songs', { 
            id: id.trim() 
        });

        let songData = null;
        
        if (Array.isArray(data.data)) songData = data.data[0];
        else if (data.data) songData = data.data;
        else if (Array.isArray(data)) songData = data[0];

        if (!songData) {
            return res.status(404).json({
                status: 'failed',
                error: 'Song not found'
            });
        }

        const transformed = transformSong(songData);

        res.json({
            status: 'success',
            data: transformed,
            meta: { provider }
        });

    } catch (error) {
        console.error('❌ SONG ERROR:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Failed to fetch song',
            message: error.message
        });
    }
});

// HEALTH CHECK
app.get('/health', async (req, res) => {
    const checks = await Promise.all(
        PROVIDERS.map(async (provider) => {
            try {
                const response = await axios.get(provider.baseUrl, { 
                    timeout: 5000,
                    validateStatus: () => true 
                });
                
                return { 
                    name: provider.name, 
                    status: response.status < 500 ? 'online' : 'offline',
                    url: provider.baseUrl
                };
            } catch (error) {
                return { 
                    name: provider.name, 
                    status: 'offline',
                    error: error.code || error.message,
                    url: provider.baseUrl
                };
            }
        })
    );

    const allOnline = checks.every(c => c.status === 'online');

    res.json({
        service: allOnline ? 'healthy' : 'degraded',
        uptime: Math.floor(process.uptime()),
        providers: checks,
        timestamp: new Date().toISOString()
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({
        status: 'failed',
        error: 'Endpoint not found'
    });
});

// Local dev
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🎵 Server: http://localhost:${PORT}`);
    });
}

module.exports = app;