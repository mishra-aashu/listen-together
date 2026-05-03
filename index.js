const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.jiosaavn.com/',
    'Cookie': 'L=hindi; gdpr_acceptance=true; pro=false'
};

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Root endpoint for status check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Elevengram Music Engine is running',
        endpoints: {
            search: '/api/search?query=YOUR_QUERY',
            song: '/api/song?id=SONG_ID'
        },
        version: '1.0.0'
    });
});

// Helper function to clean and ensure high-quality links
const formatSongData = (song) => {
    if (!song) return null;

    try {
        // Ensure downloadUrl array exists
        if (!song.downloadUrl || !Array.isArray(song.downloadUrl)) {
            song.downloadUrl = [];
        }

        // If we have at least one link, try to generate others if missing
        if (song.downloadUrl.length > 0) {
            const baseLink = song.downloadUrl.find(d => d.link && d.link.includes('_96.'))?.link || 
                             song.downloadUrl.find(d => d.link && d.link.includes('_160.'))?.link || 
                             song.downloadUrl.find(d => d.link)?.link;

            if (baseLink) {
                const qualities = [
                    { label: '12kbps', suffix: '_12' },
                    { label: '48kbps', suffix: '_48' },
                    { label: '96kbps', suffix: '_96' },
                    { label: '160kbps', suffix: '_160' },
                    { label: '320kbps', suffix: '_320' }
                ];

                qualities.forEach(q => {
                    const exists = song.downloadUrl.some(d => d.quality === q.label);
                    if (!exists) {
                        // Generate link by replacing quality pattern
                        const newLink = baseLink.replace(/(_12|_48|_96|_160|_320)\./, `${q.suffix}.`);
                        if (newLink !== baseLink) {
                            song.downloadUrl.push({ quality: q.label, link: newLink });
                        }
                    }
                });
            }
        }
        
        // Sort by bitrate
        song.downloadUrl.sort((a, b) => {
            const bitrateA = parseInt(a.quality) || 0;
            const bitrateB = parseInt(b.quality) || 0;
            return bitrateA - bitrateB;
        });
        
        return song;
    } catch (error) {
        console.error('Error formatting song data:', error.message);
        return song;
    }
};

// Basic Search Endpoint
app.get('/api/search', async (req, res) => {
    const { query, page = 1, limit = 10 } = req.query;
    
    if (!query || query.trim() === '') {
        return res.status(400).json({ 
            status: 'failed',
            error: "Query parameter is required and cannot be empty" 
        });
    }
    
    try {
        const response = await axios.get(
            `https://saavn.me/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, 
            { 
                headers,
                timeout: 10000 // 10 second timeout
            }
        );
        
        let data = response.data;
        
        if (data.status === 'success' && data.data && data.data.results) {
            data.data.results = data.data.results.map(formatSongData).filter(song => song !== null);
        }
        
        res.json(data);
    } catch (error) {
        console.error("Search Error:", error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ 
                status: 'failed',
                error: "Request timeout - Please try again" 
            });
        }
        
        res.status(500).json({ 
            status: 'failed',
            error: "Failed to fetch music from Saavn",
            message: error.response?.data?.message || error.message
        });
    }
});

// Specific Song Details (To get high-quality links)
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    
    if (!id || id.trim() === '') {
        return res.status(400).json({ 
            status: 'failed',
            error: "ID parameter is required and cannot be empty" 
        });
    }

    try {
        const response = await axios.get(
            `https://saavn.me/songs?id=${id}`, 
            { 
                headers,
                timeout: 10000
            }
        );
        
        let data = response.data;

        if (data.status === 'success' && data.data && Array.isArray(data.data) && data.data[0]) {
            const song = formatSongData(data.data[0]);
            res.json({
                status: 'success',
                data: song
            });
        } else {
            res.status(404).json({ 
                status: 'failed',
                error: "Song details not found" 
            });
        }
    } catch (error) {
        console.error("Song Details Error:", error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ 
                status: 'failed',
                error: "Request timeout - Please try again" 
            });
        }
        
        res.status(500).json({ 
            status: 'failed',
            error: "Failed to fetch song details",
            message: error.response?.data?.message || error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'failed',
        error: 'Endpoint not found',
        message: 'Please check the API documentation'
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        status: 'failed',
        error: 'Internal server error',
        message: error.message
    });
});

// Handle local execution
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🎵 Music Engine running on http://localhost:${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/health`);
    });
}

// Export for Vercel
module.exports = app;