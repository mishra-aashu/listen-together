const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

// Naya aur stable API endpoint
const BASE_URL = "https://saavn.dev/api"; 

app.get('/api/search', async (req, res) => {
    // encodeURIComponent zaroori hai taaki spaces handle ho sakein
    const query = encodeURIComponent(req.query.query || ''); 
    
    if (!query) {
        return res.json({ status: false, message: "Query is required" });
    }

    try {
        const response = await axios.get(`${BASE_URL}/search/songs?query=${query}`);
        const apiData = response.data;

        // Agar saavn.dev ka response success hai
        if (apiData.status === "success" || apiData.success === true) {
            // Data ko transform karke Elevengram ke format mein bhejo
            const transformedResults = apiData.data.results.map(song => ({
                id: song.id,
                title: song.name,
                image: song.image[2]?.url || song.image[1]?.url, // High quality image
                album: song.album?.name || "Single",
                singers: song.primaryArtists,
                media_urls: {
                    "320_KBPS": song.downloadUrl[4]?.url || song.downloadUrl[3]?.url,
                    "160_KBPS": song.downloadUrl[2]?.url
                }
            }));

            res.json({
                status: true,
                data: { results: transformedResults }
            });
        } else {
            res.json({ status: false, data: { results: [] } });
        }
    } catch (error) {
        console.error("Search Error:", error.message);
        res.status(500).json({ status: false, error: "Backend search failed" });
    }
});

// Song details endpoint
app.get('/api/song', async (req, res) => {
    const { id } = req.query;
    try {
        const response = await axios.get(`${BASE_URL}/songs?id=${id}`);
        const apiData = response.data;

        if (apiData.status === "success" || apiData.success === true) {
            const song = apiData.data[0];
            res.json({
                status: true,
                ...song,
                media_urls: {
                    "320_KBPS": song.downloadUrl[4]?.url || song.downloadUrl[3]?.url,
                    "160_KBPS": song.downloadUrl[2]?.url
                }
            });
        } else {
            res.status(404).json({ status: false, error: "Song not found" });
        }
    } catch (error) {
        res.status(500).json({ status: false, error: "Backend details failed" });
    }
});

// Root route for health check
app.get('/', (req, res) => {
    res.json({ status: "online", version: "1.0.1" });
});

module.exports = app;