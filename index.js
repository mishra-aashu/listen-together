const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// TESTED & WORKING PROVIDERS (Jan 2024)
const PROVIDERS = [
    {
        name: 'jiosaavn-harjjot',
        baseUrl: 'https://jiosaavn-api-ts.vercel.app',
        endpoints: {
            search: '/search/songs',
            song: '/songs'
        }
    },
    {
        name: 'saavn-sumit',
        baseUrl: 'https://saavn-api-sumit.vercel.app/api',
        endpoints: {
            search: '/search/songs',
            song: '/songs'
        }
    },
    {
        name: 'saavn-bikash',
        baseUrl: 'https://saavn.dev/api',
        endpoints: {
            search: '/search/songs',
            song: '/songs'
        }
    }
];

const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Cache-Control': 'no-cache'
});

// Root
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Elevengram Music Engine v2.1',
        endpoints: {
            search: '/api/search?query=YOUR_QUERY',
            song: '/api/song?id=SONG_ID',
            health: '/health'
        }
    });
});

// Smart data transformer
const transformSong = (song) => {
    if (!song) return null;

    try {
        return {
            id: song.id,
            name: song.name || song.title || song.song,
            album: song.album?.name || song.album || 'Unknown Album',
            year: song.year || song.releaseDate || '',
            duration: song.duration || 0,
            singers: song.primaryArtists || song.artists || song.singers || 'Unknown',
            language: song.language || '',
            
            // Image URLs
            image: song.image?.[2]?.link || 
                   song.image?.[2]?.url || 
                   song.image?.[1]?.link ||
                   song.image || 
                   '',
            
            // Download URLs with quality
            downloadUrl: extractDownloadUrls(song)
        };
    } catch (error) {
        console.error('Transform error:', error);
        return null;
    }
};

// Extract download URLs from different formats
const extractDownloadUrls = (song) => {
    const urls = [];
    
    // Format 1: Array of objects with quality
    if (Array.isArray(song.downloadUrl)) {
        song.downloadUrl.forEach(item => {
            if (item.link || item.url) {
                urls.push({
                    quality: item.quality || item.label || 'unknown',
                    link: item.link || item.url
                });
            }
        });
    }
    // Format 2: Object with quality keys
    else if (song.downloadUrl && typeof song.downloadUrl === 'object') {
        Object.entries(song.downloadUrl).forEach(([quality, link]) => {
            if (link) {
                urls.push({ quality, link });
            }
        });
    }
    // Format 3: Direct media_url or url
    else if (song.media_url || song.url || song.perma_url) {
        urls.push({
            quality: '320kbps',
            link: song.media_url || song.url || song.perma_url
        });
    }

    // Generate missing qualities if we have a base link
    if (urls.length > 0) {
        const baseLink = urls.find(u => u.link.includes('_96.') || u.link.includes('_160.'))?.link || urls[0].link;
        
        ['12kbps', '48kbps', '96kbps', '160kbps', '320kbps'].forEach(quality => {
            if (!urls.find(u => u.quality === quality)) {
                const kbps = quality.replace('kbps', '');
                const newLink = baseLink.replace(/(_12|_48|_96|_160|_320)\.mp4/, `_${kbps}.mp4`);
                if (newLink !== baseLink && newLink.includes('.mp4')) {
                    urls.push({ quality, link: newLink });
                }
            }
        });
    }

    return urls;
};

// Fetch with multiple provider fallback
const fetchWithFallback = async (endpoint, params) => {
    let lastError = null;

    for (let i = 0; i < PROVIDERS.length; i++) {
        const provider = PROVIDERS[i];
        const url = `${provider.baseUrl}${provider.endpoints[endpoint]}`;
        
        try {
            console.log(`[Provider ${i}] Trying: ${provider.name}`);
            
            const response = await axios.get(url, {
                params,
                headers: getHeaders(),
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            // Check for HTML response (bot protection)
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                console.log(`[Provider ${i}] Blocked - Got HTML`);
                continue;
            }

            // Check for valid JSON data
            if (!response.data) {
                console.log(`[Provider ${i}] No data received`);
                continue;
            }

            // Check if success or has data
            const hasData = response.data.success === true || 
                           response.data.status === 'success' ||
                           response.data.data ||
                           response.data.results;

            if (hasData) {
                console.log(`[Provider ${i}] ✅ Success: ${provider.name}`);
                return { 
                    data: response.data, 
                    providerIndex: i,
                    providerName: provider.name
                };
            } else {
                console.log(`[Provider ${i}] Empty response`);
            }

        } catch (error) {
            console.log(`[Provider ${i}] Error: ${error.message}`);
            lastError = error;
        }
    }

    throw new Error(lastError?.message || 'All providers failed');
};

// SEARCH ENDPOINT
app.get('/api/search', async (req, res) => {
    const { query, page = 1, limit = 20 } = req.query;
    
    if (!query?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'Query parameter required'
        });
    }

    try {
        const { data, providerIndex, providerName } = await fetchWithFallback('search', {
            query: query.trim(),
            page,
            limit
        });

        // Extract results from different response formats
        let rawResults = [];
        
        if (data.data?.results) {
            rawResults = data.data.results;
        } else if (Array.isArray(data.data?.songs)) {
            rawResults = data.data.songs;
        } else if (Array.isArray(data.data)) {
            rawResults = data.data;
        } else if (Array.isArray(data.results)) {
            rawResults = data.results;
        } else if (Array.isArray(data.songs)) {
            rawResults = data.songs;
        }

        const results = rawResults.map(transformSong).filter(Boolean);

        res.json({
            status: 'success',
            data: {
                total: results.length,
                results: results
            },
            meta: {
                provider: providerName,
                query: query,
                page: parseInt(page)
            }
        });

    } catch (error) {
        console.error('Search failed:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Search failed',
            message: error.message
        });
    }
});

// SONG DETAILS ENDPOINT
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    
    if (!id?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'Song ID required'
        });
    }

    try {
        const { data, providerName } = await fetchWithFallback('song', { id: id.trim() });

        // Extract song from response
        let songData = null;
        
        if (Array.isArray(data.data)) {
            songData = data.data[0];
        } else if (data.data) {
            songData = data.data;
        } else if (Array.isArray(data.songs)) {
            songData = data.songs[0];
        } else if (Array.isArray(data)) {
            songData = data[0];
        }

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
            meta: {
                provider: providerName
            }
        });

    } catch (error) {
        console.error('Song fetch failed:', error.message);
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
                await axios.get(provider.baseUrl, { timeout: 3000 });
                return { name: provider.name, status: 'online' };
            } catch {
                return { name: provider.name, status: 'offline' };
            }
        })
    );

    res.json({
        service: 'healthy',
        uptime: Math.floor(process.uptime()),
        providers: checks,
        timestamp: new Date().toISOString()
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        status: 'failed',
        error: 'Endpoint not found',
        availableEndpoints: ['/api/search', '/api/song', '/health']
    });
});

// Local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🎵 Music Engine running on http://localhost:${PORT}`);
    });
}

module.exports = app;