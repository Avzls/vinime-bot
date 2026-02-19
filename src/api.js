/**
 * API Layer — Semua fungsi fetch ke API sansekai
 * Base URL: https://api.sansekai.my.id/api
 */

const API_BASE = process.env.API_BASE_URL || 'https://api.sansekai.my.id/api';

/**
 * Generic fetch helper with error handling & timeout
 */
async function fetchAPI(endpoint) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

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

    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Fetch error for ${endpoint}:`, err.message);
    return null;
  }
}

/**
 * GET /anime/latest — Anime terbaru
 * Returns: [{ id, url, judul, cover, lastch, lastup }]
 */
async function getLatest() {
  return await fetchAPI('/anime/latest');
}

/**
 * GET /anime/recommended — Anime rekomendasi
 * Returns: [{ id, url, judul, cover, genre[], sinopsis, studio, score, status, rilis, total_episode }]
 */
async function getRecommended() {
  return await fetchAPI('/anime/recommended');
}

/**
 * GET /anime/movie — Daftar movie anime
 * Returns: [{ id, url, judul, cover, lastch, lastup }]
 */
async function getMovies() {
  return await fetchAPI('/anime/movie');
}

/**
 * GET /anime/search/{query} — Cari anime berdasarkan judul
 * Uses path parameter (bukan query string)
 */
async function searchAnime(query) {
  const encoded = encodeURIComponent(query);
  return await fetchAPI(`/anime/search/${encoded}`);
}

/**
 * GET /anime/detail/{url} — Detail anime
 * Uses the 'url' field from anime list as identifier
 */
async function getDetail(animeUrl) {
  return await fetchAPI(`/anime/detail/${animeUrl}`);
}

/**
 * GET /anime/getvideo/{url} — Ambil link video/streaming
 * Uses the 'url' field or episode identifier
 */
async function getVideo(animeUrl) {
  return await fetchAPI(`/anime/getvideo/${animeUrl}`);
}

module.exports = {
  getLatest,
  getRecommended,
  getMovies,
  searchAnime,
  getDetail,
  getVideo,
};
