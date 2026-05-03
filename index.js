const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Root endpoint for status check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Elevengram Music Engine is running',
        endpoints: ['/api/search', '/api/song']
    });
});

// Basic Search Endpoint
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
    }
    
    try {
        // Using the JioSaavn API instance provided in the request
        const response = await axios.get(`https://saavn.me/search/songs?query=${encodeURIComponent(query)}`);
        res.json(response.data);
    } catch (error) {
        console.error("Search Error:", error.message);
        res.status(500).json({ error: "Failed to fetch music from Saavn" });
    }
});

// Specific Song Details (To get high-quality links)
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: "ID parameter is required" });
    }

    try {
        const response = await axios.get(`https://saavn.me/songs?id=${id}`);
        res.json(response.data);
    } catch (error) {
        console.error("Song Details Error:", error.message);
        res.status(500).json({ error: "Failed to fetch song details" });
    }
});

// Handle local execution
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Music Engine running locally on http://localhost:${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
