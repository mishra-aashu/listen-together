const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Multiple API providers for reliability
const PROVIDERS = {
    primary: 'https://saavn.dev/api',
    secondary: 'https://jiosaavn-api-privatecvc.vercel.app/api',
    tertiary: 'https://saavn-api.vercel.app'
};

// Smart headers to avoid bot detection
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com'
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Elevengram Music Engine',
        endpoints: ['/api/search', '/api/song'],
        providers: Object.keys(PROVIDERS),
        version: '2.0.0'
    });
});

// Universal data transformer
const transformSongData = (song, provider) => {
    if (!song) return null;

    try {
        // Handle different API response formats
        const normalized = {
            id: song.id || song.song_id,
            name: song.name || song.title || song.song,
            album: song.album?.name || song.album || 'Unknown',
            year: song.year || song.release_date || '',
            duration: song.duration || '0',
            label: song.label || '',
            singers: song.primaryArtists || song.singers || song.artists || '',
            
            // Image handling
            image: song.image?.[2]?.link || 
                   song.image?.[2]?.url || 
                   song.image || 
                   song.albumArt || 
                   '',
            
            // Download URLs
            downloadUrl: []
        };

        // Extract download URLs based on provider format
        if (song.downloadUrl) {
            if (Array.isArray(song.downloadUrl)) {
                normalized.downloadUrl = song.downloadUrl.map(url => ({
                    quality: url.quality || url.label || 'unknown',
                    link: url.link || url.url || url
                }));
            } else if (typeof song.downloadUrl === 'object') {
                normalized.downloadUrl = Object.entries(song.downloadUrl).map(([quality, link]) => ({
                    quality,
                    link
                }));
            }
        } else if (song.media_url || song.url) {
            normalized.downloadUrl.push({
                quality: '320kbps',
                link: song.media_url || song.url
            });
        }

        // Generate missing quality links if we have at least one
        if (normalized.downloadUrl.length > 0) {
            const baseLink = normalized.downloadUrl[0].link;
            const qualities = ['12kbps', '48kbps', '96kbps', '160kbps', '320kbps'];
            
            qualities.forEach(quality => {
                if (!normalized.downloadUrl.find(d => d.quality === quality)) {
                    const suffix = quality.replace('kbps', '');
                    const newLink = baseLink.replace(/(_12|_48|_96|_160|_320)\.mp4/, `_${suffix}.mp4`);
                    if (newLink !== baseLink) {
                        normalized.downloadUrl.push({ quality, link: newLink });
                    }
                }
            });
        }

        return normalized;
    } catch (error) {
        console.error('Transform error:', error.message);
        return song;
    }
};

// Fetch with fallback logic
const fetchWithFallback = async (endpoint, params) => {
    const providers = Object.values(PROVIDERS);
    
    for (let i = 0; i < providers.length; i++) {
        try {
            const url = `${providers[i]}${endpoint}`;
            console.log(`Trying provider ${i + 1}:`, url);
            
            const response = await axios.get(url, {
                params,
                headers: getHeaders(),
                timeout: 8000,
                validateStatus: (status) => status < 500
            });

            // Check if we got HTML instead of JSON (bot protection)
            const contentType = response.headers['content-type'];
            if (contentType && contentType.includes('text/html')) {
                console.log(`Provider ${i + 1} returned HTML, trying next...`);
                continue;
            }

            // Check if response has valid data
            if (response.data && (response.data.success !== false)) {
                console.log(`✅ Provider ${i + 1} succeeded`);
                return { data: response.data, provider: i };
            }
        } catch (error) {
            console.log(`Provider ${i + 1} failed:`, error.message);
            if (i === providers.length - 1) {
                throw error; // Last provider failed
            }
        }
    }
    
    throw new Error('All providers failed');
};

// Search endpoint
app.get('/api/search', async (req, res) => {
    const { query, page = 1, limit = 20 } = req.query;
    
    if (!query?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'Query parameter is required'
        });
    }

    try {
        const { data, provider } = await fetchWithFallback('/search/songs', {
            query: query.trim(),
            page,
            limit
        });

        // Transform response
        let results = [];
        
        if (data.data?.results) {
            results = data.data.results;
        } else if (Array.isArray(data.data)) {
            results = data.data;
        } else if (Array.isArray(data.results)) {
            results = data.results;
        }

        const transformed = results.map(song => transformSongData(song, provider));

        res.json({
            status: 'success',
            data: {
                total: data.total || transformed.length,
                results: transformed
            },
            provider: provider
        });

    } catch (error) {
        console.error('Search failed:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'All music providers are currently unavailable',
            message: error.message
        });
    }
});

// Song details endpoint
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    
    if (!id?.trim()) {
        return res.status(400).json({
            status: 'failed',
            error: 'ID parameter is required'
        });
    }

    try {
        const { data, provider } = await fetchWithFallback('/songs', { id: id.trim() });

        let songData = null;
        
        if (Array.isArray(data.data)) {
            songData = data.data[0];
        } else if (data.data) {
            songData = data.data;
        } else if (Array.isArray(data)) {
            songData = data[0];
        }

        if (!songData) {
            return res.status(404).json({
                status: 'failed',
                error: 'Song not found'
            });
        }

        const transformed = transformSongData(songData, provider);

        res.json({
            status: 'success',
            data: transformed,
            provider: provider
        });

    } catch (error) {
        console.error('Song fetch failed:', error.message);
        res.status(500).json({
            status: 'failed',
            error: 'Failed to fetch song details',
            message: error.message
        });
    }
});

// Health check with provider status
app.get('/health', async (req, res) => {
    const statuses = {};
    
    for (const [name, url] of Object.entries(PROVIDERS)) {
        try {
            await axios.get(url, { timeout: 3000 });
            statuses[name] = 'online';
        } catch {
            statuses[name] = 'offline';
        }
    }

    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        providers: statuses,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'failed',
        error: 'Endpoint not found'
    });
});

// Start server for local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🎵 Elevengram Music Engine running on port ${PORT}`);
    });
}

module.exports = app;