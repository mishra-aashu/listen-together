const express = require('express');
const axios = require('axios');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const app = express();

app.use(cors());
app.use(express.json());

// ---------- CONFIG ----------
const SECRET_KEY = '38346591';
const JIOSAAVN_BASE = 'https://www.jiosaavn.com/api.php';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// ---------- HELPERS ----------
const getHeaders = () => ({
  'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
  Referer: 'https://www.jiosaavn.com/',
  Origin: 'https://www.jiosaavn.com',
  Cookie: 'L=hindi; gdpr_acceptance=true; pro=false',
});

// DES-ECB decryption
const decrypt = (data) => {
  if (!data) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(SECRET_KEY);
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(data) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result ? result.trim() : null;
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
};

// Process image URL (use 500x500)
const getImageUrl = (img) => {
  if (typeof img === 'string') return img.replace(/150x150|50x50/, '500x500');
  if (Array.isArray(img)) {
    const match = img.find(i => i?.url) || img[img.length - 1];
    return match?.url || '';
  }
  return '';
};

// Robustly extract artist names from raw JioSaavn data
const extractArtist = (song) => {
  if (!song) return '';

  // 1. Try artistMap (most accurate)
  const artistMap = song.more_info?.artistMap || song.artistMap;
  if (artistMap) {
    const primary = artistMap.primary_artists || [];
    const artists = artistMap.artists || [];
    const featured = artistMap.featured_artists || [];
    
    // Combine names from primary and artists if they are arrays
    const names = new Set();
    [...primary, ...artists, ...featured].forEach(a => {
      if (typeof a === 'string') names.add(a);
      else if (a?.name) names.add(a.name);
    });
    
    if (names.size > 0) return Array.from(names).join(', ');
  }

  // 2. Try direct fields in order of preference
  const artistData = 
    song.more_info?.singers || 
    song.more_info?.primary_artists || 
    song.more_info?.artist || 
    song.more_info?.music || 
    song.singers || 
    song.primary_artists || 
    song.primaryArtists || 
    song.artist || 
    song.music || 
    '';
  
  let artistName = '';
  if (Array.isArray(artistData)) {
    artistName = artistData.map(a => typeof a === 'string' ? a : (a.name || a)).join(', ');
  } else if (typeof artistData === 'string') {
    artistName = artistData;
  }
  
  // 3. Fallback to subtitle (often contains "Artist - Album")
  if (!artistName && song.subtitle) {
    artistName = song.subtitle.split(' - ')[0].trim();
  }

  // 4. Fallback to album artists if still empty
  if (!artistName && song.more_info?.album?.artists && Array.isArray(song.more_info.album.artists)) {
    artistName = song.more_info.album.artists.map(a => a.name || a).join(', ');
  }
  
  return artistName || 'Unknown Artist';
};

// Transform a raw JioSaavn song object into our standard format
const transformSong = (song) => {
  if (!song) return null;
  
  const encryptedUrl = song.more_info?.encrypted_media_url || song.encrypted_media_url || '';
  const directUrl = decrypt(encryptedUrl);
  const imageUrl = getImageUrl(song.image);
  const artistName = extractArtist(song);

  return {
    id: song.id,
    name: song.title || song.song || song.name || '',
    title: song.title || song.song || song.name || '',
    album: song.more_info?.album || song.album?.name || song.album || 'Single',
    year: song.year || '',
    duration: song.more_info?.duration || song.duration || 0,
    singers: artistName,
    artist: artistName,      // Compatibility for frontend
    artists: artistName,     // Compatibility for frontend
    subtitle: artistName,    // Compatibility for frontend
    image: imageUrl,
    media_urls: {
      '320_KBPS': directUrl ? directUrl.replace(/(_\d{2,3})\.(mp4|m4a|mp3)/, '_320.$2') : null,
      '160_KBPS': directUrl ? directUrl.replace(/(_\d{2,3})\.(mp4|m4a|mp3)/, '_160.$2') : null,
      '96_KBPS': directUrl ? directUrl.replace(/(_\d{2,3})\.(mp4|m4a|mp3)/, '_96.$2') : null,
    },
    rawEncryptedUrl: encryptedUrl,
  };
};
// Helper: fetch song details internally (reuse axios directly to avoid HTTP loop)
async function getSongDetails(songId) {
  try {
    const resp = await axios.get(JIOSAAVN_BASE, {
      params: {
        __call: 'song.getDetails',
        _format: 'json',
        api_version: '4',
        ctx: 'web6dot0',
        pids: songId,
      },
      headers: getHeaders(),
      timeout: 10000,
    });
    const key = Object.keys(resp.data || {})[0];
    const songs = resp.data?.songs || [];
    return songs[0] || resp.data[key] || null;
  } catch {
    return null;
  }
}

// Helper: search songs internally
async function searchSongs(query, limit = 10) {
  try {
    const resp = await axios.get(JIOSAAVN_BASE, {
      params: {
        __call: 'search.getResults',
        _format: 'json',
        _marker: '0',
        api_version: '4',
        ctx: 'web6dot0',
        q: query,
        p: 1,
        n: limit,
      },
      headers: getHeaders(),
      timeout: 10000,
    });
    return resp.data?.results || [];
  } catch {
    return [];
  }
}

// ---------- ENDPOINTS ----------

// Root – health check
app.get('/', (req, res) => res.json({ status: 'online', engine: 'Elevengram-V3-Elite' }));

// SEARCH
app.get('/api/search', async (req, res) => {
  const { query, page = 1, limit = 20 } = req.query;
  if (!query?.trim()) return res.status(400).json({ status: 'failed', error: 'Query parameter required' });

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
        n: limit,
      },
      headers: getHeaders(),
      timeout: 15000,
    });

    const data = response.data;
    if (!data || !data.results) return res.json({ status: 'failed', data: { total: 0, results: [] } });

    const results = data.results.map(transformSong).filter(Boolean);
    res.json({
      status: 'success',
      data: {
        total: parseInt(data.total) || results.length,
        results,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
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
        pids: id.trim(),
      },
      headers: getHeaders(),
      timeout: 15000,
    });

    const songData = response.data?.songs?.[0] || response.data?.[Object.keys(response.data || {})[0]];
    if (!songData || typeof songData !== 'object') return res.status(404).json({ status: 'failed', error: 'Song not found' });

    res.json({ status: 'success', data: transformSong(songData) });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Recommendations with fallback
app.get('/api/recommendations', async (req, res) => {
  const { song_id, limit = 10 } = req.query;
  const maxResults = Math.min(parseInt(limit) || 10, 20);

  if (!song_id?.trim()) {
    return res.status(400).json({ status: 'failed', error: 'song_id parameter required' });
  }

  try {
    // --- STEP 1: Try native similar songs endpoint ---
    const nativeResp = await axios.get(JIOSAAVN_BASE, {
      params: {
        __call: 'song.getSimilarSongs',
        _format: 'json',
        _marker: '0',
        api_version: '4',
        ctx: 'web6dot0',
        language: 'hindi',
        id: song_id.trim(),
        limit: maxResults,
      },
      headers: getHeaders(),
      timeout: 10000,
    });

    let songs = (Array.isArray(nativeResp.data) ? nativeResp.data : []).map(transformSong).filter(Boolean);
    if (songs.length > 0) {
      return res.json({ status: 'success', data: { total: songs.length, results: songs } });
    }

    // --- STEP 2: Fallback to metadata-based similarity ---
    console.log('[Reco Fallback] Fetching song details for artist/album search');
    const details = await getSongDetails(song_id.trim());
    if (!details) {
      // Can't even get details, jump to trending
      throw new Error('No details');
    }

    const artist = extractArtist(details);
    const album = details.more_info?.album || details.album || '';
    let fallbackSongs = [];

    // 2a. Search by artist
    if (artist) {
      const artistQuery = artist.split(',')[0].trim();
      fallbackSongs = await searchSongs(artistQuery, maxResults + 5); // few extra to filter
    }

    // 2b. If not enough, also search by album and merge
    if (fallbackSongs.length < maxResults && album) {
      const albumResults = await searchSongs(album, maxResults);
      // Merge, avoid duplicates by ID
      const existingIds = new Set(fallbackSongs.map(s => s.id));
      for (const s of albumResults) {
        if (!existingIds.has(s.id)) {
          fallbackSongs.push(s);
          existingIds.add(s.id);
        }
      }
    }

    // Filter out the original song itself and take required count
    fallbackSongs = fallbackSongs
      .filter(s => s.id !== song_id.trim())
      .slice(0, maxResults)
      .map(transformSong)
      .filter(Boolean);

    if (fallbackSongs.length > 0) {
      return res.json({ status: 'success', data: { total: fallbackSongs.length, results: fallbackSongs } });
    }

    // --- STEP 3: Ultimate fallback – trending songs (from home data) ---
    console.log('[Reco Fallback] Falling back to trending songs');
    const homeResp = await axios.get(JIOSAAVN_BASE, {
      params: {
        __call: 'webradio.getHomePageData',
        _format: 'json',
        api_version: '4',
        ctx: 'web6dot0',
        language: 'hindi',
        n: 30,
      },
      headers: getHeaders(),
      timeout: 10000,
    });
    const trending = homeResp.data?.new_trending || [];
    const trendingSongs = trending
      .filter(s => s.id !== song_id.trim())
      .slice(0, maxResults)
      .map(transformSong)
      .filter(Boolean);

    res.json({ status: 'success', data: { total: trendingSongs.length, results: trendingSongs } });

  } catch (error) {
    console.error('Recommendations error:', error.message);
    res.json({ status: 'success', data: { total: 0, results: [] } });
  }
});


// HOME / CATEGORIES (trending, charts, playlists, etc.)
app.get('/api/home', async (req, res) => {
  const { limit = 10 } = req.query;   // items per section, default 10
  try {
    const response = await axios.get(JIOSAAVN_BASE, {
      params: {
        __call: 'webradio.getHomePageData',
        _format: 'json',
        _marker: '0',
        api_version: '4',
        ctx: 'web6dot0',
        language: 'hindi',
        n: 50,              // fetch more from upstream, then slice
      },
      headers: getHeaders(),
      timeout: 15000,
    });

    const raw = response.data;
    const homeData = {};

    // Process each section if it exists
    if (raw.new_trending && Array.isArray(raw.new_trending)) {
      homeData.new_trending = raw.new_trending
        .slice(0, limit)
        .map(transformSong)
        .filter(Boolean);
    }
    if (raw.top_playlists && Array.isArray(raw.top_playlists)) {
      homeData.top_playlists = raw.top_playlists
        .slice(0, limit)
        .map(playlist => ({
          id: playlist.id,
          title: playlist.title,
          subtitle: playlist.subtitle,
          image: getImageUrl(playlist.image),
          song_count: playlist.list_count || playlist.count,
          songs: [],   // not populated here to keep response light
        }));
    }
    if (raw.charts && Array.isArray(raw.charts)) {
      homeData.charts = raw.charts
        .slice(0, limit)
        .map(chart => ({
          id: chart.id,
          title: chart.title,
          subtitle: chart.subtitle,
          image: getImageUrl(chart.image),
          songs: [],   // same as above
        }));
    }
    if (raw.city_mod && Array.isArray(raw.city_mod)) {
      homeData.city_mod = raw.city_mod
        .slice(0, limit)
        .map(transformSong)
        .filter(Boolean);
    }
    // Add more sections as needed (e.g., raw.new_albums, raw.albums, raw.radio)

    res.json({ status: 'success', data: homeData });
  } catch (error) {
    console.error('Home error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ---------- START SERVER ----------
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🎵 Server running on http://localhost:${PORT}`));
}

module.exports = app;