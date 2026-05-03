const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());

// Elite Decryption Key
const SECRET_KEY = '38346b38';

// Decryption Function
const decrypt = (data) => {
    try {
        if (!data) return null;
        // DES-ECB decryption logic
        const decipher = crypto.createDecipheriv('des-ecb', SECRET_KEY, '');
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted.trim();
    } catch (e) {
        console.error("Decryption Error:", e.message);
        return null;
    }
};

app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ status: "failed", message: "Query required" });

    try {
        // saavn.dev se raw data uthana
        const response = await axios.get(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`);
        const apiData = response.data;

        if (apiData.success && apiData.data.results) {
            const results = apiData.data.results.map(song => {
                // Step 1: Decrypt the direct link
                const directUrl = decrypt(song.rawEncryptedUrl);
                
                // Step 2: High-quality image select karo
                const imageUrl = song.image[2]?.url || song.image[1]?.url || song.image[0]?.url || "";

                return {
                    id: song.id,
                    name: song.name,
                    title: song.name,
                    album: song.album?.name || "Single",
                    year: song.year,
                    duration: song.duration,
                    singers: song.primaryArtists || song.singers || "Various Artists",
                    image: imageUrl,
                    // Ab null nahi aayega, direct playable link milega
                    media_urls: {
                        "320_KBPS": directUrl ? directUrl.replace(/(_96|_160)\.mp4/, '_320.mp4') : null,
                        "160_KBPS": directUrl ? directUrl.replace(/(_96|_320)\.mp4/, '_160.mp4') : null,
                        "96_KBPS": directUrl ? directUrl.replace(/(_160|_320)\.mp4/, '_96.mp4') : null
                    },
                    rawEncryptedUrl: song.rawEncryptedUrl
                };
            });

            res.json({ status: "success", data: { total: results.length, results } });
        } else {
            res.json({ status: "success", data: { total: 0, results: [] } });
        }
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.get('/', (req, res) => res.json({ status: "online", engine: "Elevengram-V3-Pro" }));

module.exports = app;