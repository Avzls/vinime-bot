/**
 * API Layer — Semua fungsi fetch ke API sansekai
 * Base URL: https://api.sansekai.my.id/api
 *
 * Endpoint & parameter yang benar (dari testing):
 * - GET /anime/latest                     → Array langsung
 * - GET /anime/recommended                → Array langsung
 * - GET /anime/movie                      → Array langsung
 * - GET /anime/search?query={q}           → { data: [{ jumlah, result: [...] }] }
 * - GET /anime/detail?urlId={url}         → { data: [{ ...detail }] }
 * - GET /anime/getvideo?chapterUrlId={id} → { data: [{ reso: [{ reso, link }] }] }
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'https://api.sansekai.my.id/api';

/**
 * Generic fetch helper with error handling & timeout
 */
async function fetchAPI(endpoint) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'VinimeBot/1.0',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`API Error: ${res.status} for ${endpoint}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`Fetch error for ${endpoint}:`, err.message);
    return null;
  }
}

/**
 * GET /anime/latest
 */
async function getLatest() {
  const items = await fetchAPI('/anime/latest');
  addToCatalog(items);
  return items;
}

/**
 * GET /anime/recommended
 */
async function getRecommended() {
  const items = await fetchAPI('/anime/recommended');
  addToCatalog(items);
  return items;
}

/**
 * GET /anime/movie
 */
async function getMovies() {
  const items = await fetchAPI('/anime/movie');
  addToCatalog(items);
  return items;
}

/**
 * GET /anime/search?query={q}
 */
async function searchAnime(query) {
  const encoded = encodeURIComponent(query);
  const raw = await fetchAPI(`/anime/search?query=${encoded}`);
  if (!raw) return null;

  let items = null;
  if (raw.data && Array.isArray(raw.data) && raw.data.length > 0) {
    items = raw.data[0].result || raw.data;
  } else if (Array.isArray(raw)) {
    items = raw;
  }

  addToCatalog(items);
  return items;
}

/**
 * GET /anime/detail?urlId={url}
 */
async function getDetail(animeUrl) {
  const raw = await fetchAPI(`/anime/detail?urlId=${encodeURIComponent(animeUrl)}`);
  if (!raw) return null;

  if (raw.data && Array.isArray(raw.data) && raw.data.length > 0) {
    return raw.data[0];
  }
  if (typeof raw === 'object' && raw.judul) return raw;
  return raw;
}

/**
 * GET /anime/getvideo?chapterUrlId={id}&reso={quality}
 */
async function getVideo(chapterUrlId, reso) {
  let endpoint = `/anime/getvideo?chapterUrlId=${encodeURIComponent(chapterUrlId)}`;
  if (reso) {
    endpoint += `&reso=${encodeURIComponent(reso)}`;
  }

  const raw = await fetchAPI(endpoint);
  if (!raw) return null;

  if (raw.data && Array.isArray(raw.data) && raw.data.length > 0) {
    return raw.data[0];
  }
  return raw;
}

// --- Persistent A-Z catalog ---
// Catalog builds gradually from normal bot usage (search, terbaru, movie, rekomendasi)
// Saved to disk so it survives restarts. No mass API calls.

const CATALOG_FILE = path.join(__dirname, '..', 'anime_catalog.json');
let catalog = new Map();

// Load catalog from disk on startup
function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      catalog = new Map(data.map(item => [item.url || item.id, item]));
      console.log(`📋 Loaded ${catalog.size} anime from catalog`);
    }
  } catch (e) {
    console.error('Failed to load catalog:', e.message);
  }
}

// Save catalog to disk (debounced)
let saveTimer = null;
function saveCatalog() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const arr = [...catalog.values()];
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(arr));
    } catch (e) {
      console.error('Failed to save catalog:', e.message);
    }
  }, 5000);
}

// Add items to catalog
function addToCatalog(items) {
  if (!items || !Array.isArray(items)) return;
  let added = 0;
  for (const item of items) {
    const key = item.url || item.id;
    if (key && !catalog.has(key)) {
      catalog.set(key, item);
      added++;
    }
  }
  if (added > 0) saveCatalog();
}

// Get sorted catalog for A-Z list
function getAllAnimeAZ() {
  return [...catalog.values()].sort((a, b) =>
    (a.judul || '').localeCompare(b.judul || '', 'id', { sensitivity: 'base' })
  );
}

// Seed catalog with a few searches (1 at a time, 10s delay)
// Only runs if catalog is empty AND API is responding
async function seedCatalog() {
  if (catalog.size > 0) return;
  
  // Check if API is alive first
  const test = await fetchAPI('/anime/latest');
  if (!test) {
    console.log('📋 API not responding, skipping seed');
    return;
  }
  // Add latest to catalog
  addToCatalog(test);
  
  console.log('📋 Seeding catalog...');
  const seeds = ['naruto','one piece','dragon','bleach','attack','demon','jujutsu','sword','kimetsu','tokyo'];
  for (const q of seeds) {
    await new Promise(r => setTimeout(r, 10000)); // 10s between each
    const items = await searchAnime(q);
    if (!items) {
      console.log('📋 Seed stopped (API error)');
      break; // Stop if API starts failing
    }
  }
  console.log(`📋 Seeded catalog with ${catalog.size} anime`);
}

// Init
loadCatalog();
// Seed after 30s delay (only if empty, checks API first)
setTimeout(() => seedCatalog().catch(() => {}), 30000);

module.exports = {
  getLatest,
  getRecommended,
  getMovies,
  searchAnime,
  getDetail,
  getVideo,
  getAllAnimeAZ,
  addToCatalog,
};
