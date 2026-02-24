'use strict';

const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://otakudesu.cloud';
const CATALOG_FILE = path.join(__dirname, '..', 'anime_catalog.json');

// ─── HTTP fetch with redirect follow ───────────────────────────────────────

function fetchHTML(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Referer': BASE_URL,
      },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : BASE_URL + res.headers.location;
        return fetchHTML(redirectUrl, retries).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => fetchHTML(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => fetchHTML(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(new Error(`Timeout fetching ${url}`));
      }
    });
  });
}

// Normalize relative URLs to absolute
function toAbsUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return BASE_URL + (href.startsWith('/') ? href : '/' + href);
}

// ─── Scrapers ───────────────────────────────────────────────────────────────

/**
 * Get latest/ongoing episodes from home page
 * Returns: [{ judul, lastch, url, cover }]
 */
async function getLatest() {
  try {
    const html = await fetchHTML(BASE_URL + '/');
    const $ = cheerio.load(html);
    const items = [];
    $('.venz ul li').each((_, el) => {
      const $el = $(el);
      const judul = $el.find('.jdlflm').text().trim();
      const href = $el.find('.thumb a').first().attr('href');
      const url = toAbsUrl(href);
      const epzText = $el.find('.epz').text().trim(); // e.g. "Episode 8"
      const lastch = epzText || '';
      const cover = $el.find('.thumb img').attr('src') || '';
      if (judul && url) {
        items.push({ judul, lastch, url, cover });
      }
    });
    addToCatalog(items);
    return items;
  } catch (err) {
    console.error('[getLatest]', err.message);
    return [];
  }
}

/**
 * Get recommended anime — uses /rekomendasi/ page (complete list)
 * Falls back to latest if not available
 * Returns: [{ judul, lastch, url, cover }]
 */
async function getRecommended() {
  try {
    const html = await fetchHTML(BASE_URL + '/rekomendasi/');
    const $ = cheerio.load(html);
    const items = [];
    // rekomendasi page has .venz ul li similar structure
    $('.venz ul li').each((_, el) => {
      const $el = $(el);
      const judul = $el.find('.jdlflm').text().trim();
      const href = $el.find('.thumb a').first().attr('href');
      const url = toAbsUrl(href);
      const epzText = $el.find('.epz').text().trim();
      const lastch = epzText || '';
      const cover = $el.find('.thumb img').attr('src') || '';
      if (judul && url) items.push({ judul, lastch, url, cover });
    });
    // Fallback: scrape anime-list and return top entries
    if (items.length === 0) {
      const allAnime = await getAllAnimeAZ();
      const result = allAnime.slice(0, 20);
      return result;
    }
    addToCatalog(items);
    return items;
  } catch (err) {
    console.error('[getRecommended]', err.message);
    // fallback to latest
    return getLatest();
  }
}

/**
 * Get movie anime list
 * Returns: [{ judul, lastch, url, cover }]
 */
async function getMovies() {
  try {
    const html = await fetchHTML(BASE_URL + '/category/movie/');
    const $ = cheerio.load(html);
    const items = [];
    // Movie page uses .venser .col li or .chivsrc structure
    $('.chivsrc li, .venser .col li').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('h2 a').first();
      const judul = $a.text().trim();
      const url = toAbsUrl($a.attr('href'));
      const cover = $el.find('img').first().attr('src') || '';
      const lastch = $el.find('.set').first().text().trim() || '';
      if (judul && url) items.push({ judul, lastch, url, cover });
    });
    // Also try the .detpost grid
    if (items.length === 0) {
      $('.detpost').each((_, el) => {
        const $el = $(el);
        const judul = $el.find('.jdlflm').text().trim();
        const href = $el.find('a').first().attr('href');
        const url = toAbsUrl(href);
        const cover = $el.find('img').attr('src') || '';
        const lastch = $el.find('.epz').text().trim() || '';
        if (judul && url) items.push({ judul, lastch, url, cover });
      });
    }
    addToCatalog(items);
    return items;
  } catch (err) {
    console.error('[getMovies]', err.message);
    return [];
  }
}

/**
 * Search anime by query
 * Returns: [{ judul, lastch, url, cover }]
 */
async function searchAnime(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const html = await fetchHTML(`${BASE_URL}/?s=${encodedQuery}&post_type=anime`);
    const $ = cheerio.load(html);
    const items = [];
    $('.chivsrc li').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('h2 a');
      const judul = $a.text().trim();
      const url = toAbsUrl($a.attr('href'));
      const cover = $el.find('img').attr('src') || '';
      // Extract status from .set divs
      let lastch = '';
      $el.find('.set').each((_, setEl) => {
        const text = $(setEl).text();
        if (text.includes('Status')) {
          lastch = text.replace(/.*Status\s*:\s*/i, '').trim();
        }
      });
      if (judul && url) items.push({ judul, lastch, url, cover });
    });
    addToCatalog(items);
    return items;
  } catch (err) {
    console.error('[searchAnime]', err.message);
    return [];
  }
}

/**
 * Get anime detail page
 * animeUrl: full URL or path like '/anime/naruto-sub-indo/'
 * Returns: { judul, sinopsis, rating, status, rilis, type, genre:[], chapter:[{ch, url}], cover }
 */
async function getDetail(animeUrl) {
  try {
    const url = animeUrl.startsWith('http') ? animeUrl : toAbsUrl(animeUrl);
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    // Title
    const judul = $('.jdlrx h1').text().trim() || $('h1.entry-title').text().trim();

    // Info fields from infozingle
    const info = {};
    $('.infozingle p').each((_, el) => {
      const text = $(el).text().trim();
      const colonIdx = text.indexOf(':');
      if (colonIdx > -1) {
        const key = text.substring(0, colonIdx).trim().toLowerCase();
        const value = text.substring(colonIdx + 1).trim();
        info[key] = value;
      }
    });

    // Genres as array
    const genre = [];
    $('.infozingle p').each((_, el) => {
      const $el = $(el);
      if ($el.text().toLowerCase().includes('genre')) {
        $el.find('a').each((_, a) => genre.push($(a).text().trim()));
      }
    });

    // Synopsis
    const sinopsis = $('.sinopc').text().replace(/^Sinopsis\s*:\s*/i, '').trim();

    // Cover image
    const cover = $('.thumbpic img').attr('src')
      || $('.venser img').first().attr('src')
      || $('img.wp-post-image').attr('src')
      || '';

    // Episode list — find the main "Episode List" section
    // Multiple .episodelist divs: "Batch", "Episode List", "Lengkap"
    // We want episodes (li with href containing /episode/)
    const chapters = [];
    $('.episodelist').each((_, eplistEl) => {
      $(eplistEl).find('ul li').each((_, li) => {
        const $a = $(li).find('a');
        const href = $a.attr('href') || '';
        const epTitle = $a.text().trim();
        if (href.includes('/episode/') && epTitle) {
          chapters.push({
            ch: epTitle,
            url: toAbsUrl(href),
          });
        }
      });
    });

    return {
      judul: judul || info['judul'] || '',
      sinopsis,
      rating: info['skor'] || info['rating'] || '',
      score: info['skor'] || '',
      status: info['status'] || '',
      rilis: info['tanggal rilis'] || info['published'] || '',
      published: info['tanggal rilis'] || '',
      type: info['tipe'] || info['type'] || '',
      genre,
      chapter: chapters,
      cover,
      // raw info for potential use
      studio: info['studio'] || '',
      durasi: info['durasi'] || '',
      total_episode: info['total episode'] || '',
    };
  } catch (err) {
    console.error('[getDetail]', err.message);
    return null;
  }
}

/**
 * Get episode streaming/download links
 * epUrl: full episode URL like 'https://otakudesu.cloud/episode/...'
 * Returns: { reso: ['360p','480p','720p'], stream: [{reso, link, provider}] }
 */
async function getVideo(epUrl, preferredReso = null) {
  try {
    const url = epUrl.startsWith('http') ? epUrl : toAbsUrl(epUrl);
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const stream = [];

    // Method 1: Download links (most reliable — direct URLs)
    // .download ul li: <strong>Mp4 360p</strong> <a href="...">Provider</a>
    $('.download ul li').each((_, el) => {
      const $el = $(el);
      const resoText = $el.find('strong').text().trim(); // e.g. "Mp4 360p"
      const resoMatch = resoText.match(/(\d+p)/i);
      const reso = resoMatch ? resoMatch[1] : resoText;
      $el.find('a').each((_, a) => {
        const link = $(a).attr('href');
        const provider = $(a).text().trim();
        if (link && link.startsWith('http') && reso) {
          stream.push({ reso, link, provider });
        }
      });
    });

    // Method 2: Mirror stream links (data-content base64 decode)
    // These are streaming embeds, not direct download
    if (stream.length === 0) {
      $('.mirrorstream ul').each((_, ul) => {
        const $ul = $(ul);
        // Get resolution from ul class: m360p, m480p, m720p
        const ulClass = $ul.attr('class') || '';
        const resoMatch = ulClass.match(/m(\d+p)/i);
        const reso = resoMatch ? resoMatch[1] : '';
        $ul.find('li a[data-content]').each((_, a) => {
          const dataContent = $(a).attr('data-content');
          if (dataContent) {
            try {
              const decoded = Buffer.from(dataContent, 'base64').toString('utf8');
              const json = JSON.parse(decoded);
              const provider = $(a).text().trim();
              // Store as stream entry with embed info
              stream.push({ reso, link: null, provider, embedData: json, isEmbed: true });
            } catch (_) {}
          }
        });
      });
    }

    const resoList = [...new Set(stream.map(s => s.reso).filter(Boolean))].sort();
    return { reso: resoList, stream };
  } catch (err) {
    console.error('[getVideo]', err.message);
    return null;
  }
}

// ─── Catalog (A-Z in-memory + file) ─────────────────────────────────────────

const catalog = new Map(); // url -> { judul, url, cover }
let saveTimer = null;

function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      for (const item of data) {
        if (item.url) catalog.set(item.url, item);
      }
      console.log(`[catalog] Loaded ${catalog.size} entries`);
    }
  } catch (err) {
    console.error('[catalog] Load error:', err.message);
  }
}

function saveCatalog() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(CATALOG_FILE, JSON.stringify([...catalog.values()], null, 2), 'utf8');
    } catch (err) {
      console.error('[catalog] Save error:', err.message);
    }
  }, 5000);
}

function addToCatalog(items) {
  let added = 0;
  for (const item of items) {
    if (item.url && item.judul) {
      if (!catalog.has(item.url)) added++;
      catalog.set(item.url, { judul: item.judul, url: item.url, cover: item.cover || '' });
    }
  }
  if (added > 0) saveCatalog();
}

function getAllAnimeAZ() {
  return [...catalog.values()].sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
}

/**
 * Seed catalog from anime-list A-Z page
 */
async function seedCatalog() {
  if (catalog.size > 50) return;
  console.log('[catalog] Seeding from anime-list...');
  try {
    const html = await fetchHTML(BASE_URL + '/anime-list/');
    const $ = cheerio.load(html);
    const items = [];
    $('.daftarkartun .hodebgst').each((_, el) => {
      const $el = $(el);
      const judul = $el.text().trim();
      const url = toAbsUrl($el.attr('href'));
      if (judul && url) items.push({ judul, url, cover: '' });
    });
    if (items.length > 0) {
      addToCatalog(items);
      console.log(`[catalog] Seeded ${items.length} entries from anime-list`);
    } else {
      // Fallback: seed from search
      await seedFromSearch();
    }
  } catch (err) {
    console.error('[catalog] Seed error:', err.message);
    await seedFromSearch();
  }
}

async function seedFromSearch() {
  const keywords = ['naruto', 'one piece', 'bleach', 'dragon ball', 'fairy tail'];
  for (const kw of keywords) {
    try {
      const results = await searchAnime(kw);
      console.log(`[catalog] Seed "${kw}": +${results.length}`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (_) {}
  }
}

/**
 * Get list of all genres
 * Returns: [{ name, slug }]
 */
async function getGenreList() {
  try {
    const html = await fetchHTML(BASE_URL + '/genre-list/');
    const $ = cheerio.load(html);
    const genres = [];
    $('ul.genres li a, .genres_wrap li a, .lx li a, .genre-list li a').each((_, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const slugMatch = href.match(/\/genres\/([^/]+)/);
      if (name && slugMatch) {
        genres.push({ name, slug: slugMatch[1] });
      }
    });
    if (genres.length === 0) {
      $('a[href*="/genres/"]').each((_, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr('href') || '';
        const slugMatch = href.match(/\/genres\/([^/]+)/);
        if (name && slugMatch && !genres.find(g => g.slug === slugMatch[1])) {
          genres.push({ name, slug: slugMatch[1] });
        }
      });
    }
    return genres.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[getGenreList]', err.message);
    return [];
  }
}

/**
 * Get anime list by genre slug and page
 * Returns: { items:[{ judul, url, rating, status }], currentPage, totalPages }
 */
async function getAnimeByGenre(slug, page = 1) {
  try {
    const url = page > 1
      ? `${BASE_URL}/genres/${slug}/page/${page}/`
      : `${BASE_URL}/genres/${slug}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.col-anime-con').each((_, el) => {
      const $el = $(el);
      const $titleA = $el.find('.col-anime-title a').first();
      const judul = $titleA.text().trim();
      const href = toAbsUrl($titleA.attr('href') || '');
      const rating = $el.find('.col-anime-rating').text().trim() || '-';
      const status = $el.find('.col-anime-eps').text().trim() || '';
      if (judul && href) items.push({ judul, url: href, rating, status });
    });
    let totalPages = 1;
    const pageNums = [];
    $('.pagenavix .page-numbers').each((_, el) => {
      const n = parseInt($(el).text().trim());
      if (!isNaN(n)) pageNums.push(n);
    });
    if (pageNums.length > 0) totalPages = Math.max(...pageNums);
    return { items, currentPage: page, totalPages };
  } catch (err) {
    console.error('[getAnimeByGenre]', err.message);
    return { items: [], currentPage: page, totalPages: 1 };
  }
}

// Init
loadCatalog();
// Seed asynchronously if catalog is empty
setTimeout(() => {
  if (catalog.size < 10) {
    seedCatalog().catch(err => console.error('[seedCatalog]', err.message));
  }
}, 3000);

module.exports = {
  getLatest,
  getRecommended,
  getMovies,
  searchAnime,
  getDetail,
  getVideo,
  getAllAnimeAZ,
  addToCatalog,
  getGenreList,
  getAnimeByGenre,
};
