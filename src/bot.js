/**
 * Bot.js — Telegraf bot setup (webhook mode)
 * Semua command dan callback handler
 * Parse mode: HTML (lebih stabil dari MarkdownV2)
 *
 * Video & gambar di-download dulu lalu di-upload ke Telegram,
 * karena Telegram Bot API tidak bisa fetch langsung dari CDN anime.
 */

const { Telegraf, Input } = require('telegraf');
const { Readable } = require('stream');
const api = require('./api');
const {
  formatAnimeList,
  formatAnimeListAZ,
  formatAnimeDetail,
  buildAnimeListKeyboard,
  buildAnimeListAZKeyboard,
  buildEpisodeKeyboard,
  buildEpisodeNavKeyboard,
  buildDetailKeyboard,
  buildGenreListKeyboard,
  formatGenreAnimeList,
  buildGenreAnimeKeyboard,
  getWelcomeMessage,
  escapeHTML,
} = require('./helpers');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN, {
  // Support Local Bot API Server untuk upload file >50MB (sampai 2GB)
  ...(process.env.TELEGRAM_API_ROOT && {
    telegram: {
      apiRoot: process.env.TELEGRAM_API_ROOT,
    },
  }),
});

// Cek apakah pakai Local Bot API (support file >50MB)
const isLocalAPI = !!process.env.TELEGRAM_API_ROOT;
const MAX_UPLOAD_MB = isLocalAPI ? 2000 : 50; // 2GB vs 50MB
console.log(`📡 Telegram API: ${isLocalAPI ? process.env.TELEGRAM_API_ROOT + ' (Local, max 2GB)' : 'api.telegram.org (max 50MB)'}`);

// ============================================================
// DOWNLOAD HELPER
// ============================================================

/**
 * Download file dari URL ke Buffer
 * Supports file sampai ~2GB (tergantung memory)
 * @param {string} url
 * @param {number} maxSizeMB - Max file size in MB (0 = unlimited)
 * @returns {{ buffer: Buffer, size: number, contentType: string } | null}
 */
async function downloadFile(url, maxSizeMB = 0) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://otakudesu.best/',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`Download error: ${res.status} for ${url}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    const contentLength = parseInt(res.headers.get('content-length') || '0');

    // Cek ukuran file sebelum download (jika diketahui)
    if (maxSizeMB > 0 && contentLength > maxSizeMB * 1024 * 1024) {
      console.log(`File too large: ${(contentLength / 1024 / 1024).toFixed(1)}MB > ${maxSizeMB}MB`);
      return { buffer: null, size: contentLength, contentType, tooLarge: true };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cek ukuran setelah download
    if (maxSizeMB > 0 && buffer.length > maxSizeMB * 1024 * 1024) {
      return { buffer: null, size: buffer.length, contentType, tooLarge: true };
    }

    return { buffer, size: buffer.length, contentType, tooLarge: false };
  } catch (err) {
    console.error(`Download failed for ${url}:`, err.message);
    return null;
  }
}

/**
 * Format file size ke string readable
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ============================================================
// COMMANDS
// ============================================================

bot.command('start', async (ctx) => {
  try {
    await ctx.reply(getWelcomeMessage(), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buildMainMenuKeyboard() },
    });
  } catch (err) {
    console.error('Error /start:', err.message);
    await ctx.reply('🎌 Selamat datang di VinimeBot!\n\nGunakan menu di bawah:', {
      reply_markup: { inline_keyboard: buildMainMenuKeyboard() },
    });
  }
});

bot.command('terbaru', async (ctx) => {
  await handleAnimeList(ctx, 'latest', '🆕 <b>Anime Terbaru:</b>\n\n', '🆕');
});

bot.command('rekomendasi', async (ctx) => {
  await handleAnimeList(ctx, 'rec', '⭐ <b>Anime Rekomendasi:</b>\n\n', '⭐');
});

bot.command('movie', async (ctx) => {
  await handleAnimeList(ctx, 'movie', '🎥 <b>Daftar Movie Anime:</b>\n\n', '🎥');
});

bot.command('list', async (ctx) => {
  await handleAnimeListAZ(ctx, 0);
});

bot.command('cari', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!query) {
    return ctx.reply(
      '🔍 Gunakan format:\n<code>/cari judul anime</code>\n\nContoh: <code>/cari naruto</code>',
      { parse_mode: 'HTML' },
    );
  }
  await handleSearch(ctx, query, 0);
});

bot.command('genre', async (ctx) => {
  await handleGenreList(ctx);
});

// ============================================================
// CALLBACK QUERIES
// ============================================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    await ctx.answerCbQuery().catch(() => {});

    // Menu utama
    if (data === 'menu') {
      return await editOrReply(ctx, getWelcomeMessage(), buildMainMenuKeyboard());
    }

    // Command dari tombol menu
    if (data === 'cmd_terbaru') {
      return await handleAnimeListEdit(ctx, 'latest', '🆕 <b>Anime Terbaru:</b>\n\n', '🆕', 0);
    }
    if (data === 'cmd_rekomendasi') {
      return await handleAnimeListEdit(ctx, 'rec', '⭐ <b>Anime Rekomendasi:</b>\n\n', '⭐', 0);
    }
    if (data === 'cmd_movie') {
      return await handleAnimeListEdit(ctx, 'movie', '🎥 <b>Daftar Movie Anime:</b>\n\n', '🎥', 0);
    }
    if (data === 'cmd_listaz') {
      return await handleAnimeListAZEdit(ctx, 0);
    }
    if (data === 'cmd_cari') {
      return await editOrReply(ctx,
        '🔍 Silakan ketik perintah:\n<code>/cari judul anime</code>\n\nContoh: <code>/cari naruto</code>',
        [],
      );
    }
    if (data === 'noop') return;

    // Pagination: latest_p_0, rec_p_1, movie_p_2
    const pageMatch = data.match(/^(latest|rec|movie)_p_(\d+)$/);
    if (pageMatch) {
      const prefix = pageMatch[1];
      const page = parseInt(pageMatch[2]);
      const emojiMap = { latest: '🆕', rec: '⭐', movie: '🎥' };
      const titleMap = {
        latest: '🆕 <b>Anime Terbaru:</b>\n\n',
        rec: '⭐ <b>Anime Rekomendasi:</b>\n\n',
        movie: '🎥 <b>Daftar Movie Anime:</b>\n\n',
      };
      return await handleAnimeListEdit(ctx, prefix, titleMap[prefix], emojiMap[prefix], page);
    }

    // A-Z pagination: az_p_0, az_p_1, ...
    const azPageMatch = data.match(/^az_p_(\d+)$/);
    if (azPageMatch) {
      const page = parseInt(azPageMatch[1]);
      return await handleAnimeListAZEdit(ctx, page);
    }

    // Search pagination: search_p_0_naruto
    const searchPageMatch = data.match(/^search_p_(\d+)_(.+)$/);
    if (searchPageMatch) {
      const page = parseInt(searchPageMatch[1]);
      const query = searchPageMatch[2];
      return await handleSearchEdit(ctx, query, page);
    }

    // Genre list: cmd_genre
    if (data === 'cmd_genre') {
      return await handleGenreListEdit(ctx);
    }

    // Genre anime list: genre_action_p_0
    const genrePageMatch = data.match(/^genre_([^_]+(?:_[^_]+)*)_p_(\d+)$/);
    if (genrePageMatch) {
      const slug = genrePageMatch[1];
      const page = parseInt(genrePageMatch[2]);
      return await handleGenreAnimeEdit(ctx, slug, page);
    }

    // Detail anime
    if (data.startsWith('detail_')) {
      const animeUrl = data.substring(7);
      return await handleDetail(ctx, animeUrl);
    }

    // Daftar episode
    if (data.startsWith('episodes_')) {
      const animeUrl = data.substring(9);
      return await handleEpisodes(ctx, animeUrl);
    }

    // Video episode
    if (data.startsWith('ep_')) {
      const epUrl = data.substring(3);
      return await handleEpisodeVideo(ctx, epUrl);
    }

    // Navigasi episode: epnav_<animeSlug>__<idx>
    if (data.startsWith('epnav_')) {
      const rest = data.substring(6); // hapus 'epnav_'
      const sep = rest.lastIndexOf('__');
      if (sep !== -1) {
        const animeSlug = rest.substring(0, sep);
        const idx = parseInt(rest.substring(sep + 2));
        // Reconstruct full animeUrl dari slug
        const animeUrl = animeSlug.startsWith('http') ? animeSlug : `https://otakudesu.cloud${animeSlug}`;
        return await handleEpisodeByIndex(ctx, animeUrl, idx);
      }
    }

  } catch (err) {
    console.error('Callback error:', err.message);
    try {
      await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    } catch (_) {}
  }
});

// ============================================================
async function handleGenreList(ctx) {
  const loadingMsg = await ctx.reply('⏳ Memuat daftar genre...');
  const genres = await api.getGenreList();
  if (!genres || genres.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal memuat genre. Coba lagi nanti.'
    );
  }
  const text = `<b>🎭 Pilih Genre</b>

Pilih genre anime yang ingin kamu jelajahi:`;
  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null, text,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: buildGenreListKeyboard(genres) } }
  );
}

async function handleGenreListEdit(ctx) {
  await ctx.answerCbQuery();
  await ctx.editMessageText('⏳ Memuat daftar genre...');
  const genres = await api.getGenreList();
  if (!genres || genres.length === 0) {
    return await ctx.editMessageText('😔 Gagal memuat genre. Coba lagi nanti.');
  }
  const text = `<b>🎭 Pilih Genre</b>

Pilih genre anime yang ingin kamu jelajahi:`;
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buildGenreListKeyboard(genres) },
  });
}

async function handleGenreAnimeEdit(ctx, slug, page) {
  await ctx.answerCbQuery();
  await ctx.editMessageText('⏳ Memuat anime...');
  const result = await api.getAnimeByGenre(slug, page);
  const text = formatGenreAnimeList(result.items, slug, result.currentPage, result.totalPages);
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: buildGenreAnimeKeyboard(slug, result.currentPage, result.totalPages),
    },
  });
}

// HANDLERS
// ============================================================

async function handleAnimeList(ctx, prefix, header, emoji) {
  const loadingMsg = await ctx.reply('⏳ Memuat data...');
  const items = await fetchByPrefix(prefix);

  if (!items || items.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal memuat data. Silakan coba lagi nanti.'
    );
  }

  const text = header + formatAnimeList(items, 0, emoji);
  const keyboard = buildAnimeListKeyboard(items, 0, prefix);

  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    text,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } },
  );
}

async function handleAnimeListEdit(ctx, prefix, header, emoji, page) {
  const items = await fetchByPrefix(prefix);
  if (!items || items.length === 0) {
    return await editOrReply(ctx, '😔 Gagal memuat data. Silakan coba lagi nanti.');
  }

  const text = header + formatAnimeList(items, page, emoji);
  const keyboard = buildAnimeListKeyboard(items, page, prefix);
  await editOrReply(ctx, text, keyboard);
}

async function handleSearch(ctx, query, page) {
  const loadingMsg = await ctx.reply(`⏳ Mencari "${query}"...`);
  const items = await api.searchAnime(query);

  if (!items || items.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Tidak ditemukan anime dengan judul "${query}".`
    );
  }

  const header = `🔍 <b>Hasil Pencarian:</b> <i>${escapeHTML(query)}</i>\n\n`;
  const text = header + formatAnimeList(items, page, '🔍');
  const keyboard = buildAnimeListKeyboard(items, page, 'search', query);

  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    text,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } },
  );
}

async function handleSearchEdit(ctx, query, page) {
  const items = await api.searchAnime(query);
  if (!items || items.length === 0) {
    return await editOrReply(ctx, `😔 Tidak ditemukan anime dengan judul "${query}".`);
  }

  const header = `🔍 <b>Hasil Pencarian:</b> <i>${escapeHTML(query)}</i>\n\n`;
  const text = header + formatAnimeList(items, page, '🔍');
  const keyboard = buildAnimeListKeyboard(items, page, 'search', query);
  await editOrReply(ctx, text, keyboard);
}

async function handleAnimeListAZ(ctx, page) {
  const items = api.getAllAnimeAZ();

  if (!items || items.length === 0) {
    return await ctx.reply(
      '📋 <b>Daftar anime masih kosong.</b>\n\n' +
      'Gunakan <code>/cari</code> untuk mencari anime terlebih dahulu.\n' +
      'Setiap pencarian akan otomatis menambah daftar A-Z!\n\n' +
      'Contoh: <code>/cari naruto</code>',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu' }]] } },
    );
  }

  const header = `📋 <b>Daftar Anime A-Z (${items.length} anime):</b>\n\n`;
  const text = header + formatAnimeListAZ(items, page);
  const keyboard = buildAnimeListAZKeyboard(items, page);

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

async function handleAnimeListAZEdit(ctx, page) {
  const items = api.getAllAnimeAZ();
  if (!items || items.length === 0) {
    return await editOrReply(ctx,
      '📋 <b>Daftar anime masih kosong.</b>\n\n' +
      'Gunakan <code>/cari</code> untuk mencari anime.\nSetiap pencarian otomatis menambah daftar A-Z!',
      [[{ text: '🏠 Menu Utama', callback_data: 'menu' }]],
    );
  }

  const header = `📋 <b>Daftar Anime A-Z (${items.length} anime):</b>\n\n`;
  const text = header + formatAnimeListAZ(items, page);
  const keyboard = buildAnimeListAZKeyboard(items, page);
  await editOrReply(ctx, text, keyboard);
}

/**
 * Tampilkan detail anime dengan poster (download dulu baru upload)
 */
async function handleDetail(ctx, animeUrl) {
  try { await ctx.deleteMessage(); } catch (_) {}

  console.log('[Detail] urlId:', animeUrl, 'len:', animeUrl.length);
  const loadingMsg = await ctx.reply('⏳ Memuat detail anime...');
  const detail = await api.getDetail(animeUrl);

  if (!detail) {
    console.log('[Detail] FAILED for urlId:', animeUrl);
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal memuat detail anime. Silakan coba lagi.',
    );
  }

  const text = formatAnimeDetail(detail);
  const hasChapters = detail.chapter && detail.chapter.length > 0;
  const keyboard = buildDetailKeyboard(animeUrl, hasChapters);

  // Hapus loading msg
  try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}

  // Coba kirim poster: download dulu, baru upload ke Telegram
  const cover = detail.cover || '';
  if (cover) {
    try {
      const imgData = await downloadFile(cover, 10); // max 10MB for image
      if (imgData && imgData.buffer) {
        await ctx.replyWithPhoto(
          Input.fromBuffer(imgData.buffer, 'cover.jpg'),
          {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          },
        );
        return;
      }
    } catch (err) {
      console.error('Photo download/upload error:', err.message);
    }

    // Fallback: coba kirim URL langsung
    try {
      await ctx.replyWithPhoto(cover, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      return;
    } catch (_) {}
  }

  // Fallback: text saja
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleEpisodes(ctx, animeUrl) {
  try { await ctx.deleteMessage(); } catch (_) {}

  const loadingMsg = await ctx.reply('⏳ Memuat daftar episode...');
  const detail = await api.getDetail(animeUrl);

  if (!detail || !detail.chapter || detail.chapter.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Tidak ada episode tersedia untuk anime ini.',
    );
  }

  const title = escapeHTML(detail.judul || animeUrl);
  const chapters = detail.chapter;
  let text = `📺 <b>Daftar Episode: ${title}</b>\n\nTotal: ${chapters.length} episode`;
  if (chapters.length > 20) {
    text += `\n<i>Menampilkan 20 episode terbaru</i>`;
  }

  const keyboard = buildEpisodeKeyboard(chapters, animeUrl);

  try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

/**
 * Navigasi episode berdasarkan index di chapter list
 * Dipakai oleh callback epnav_<animeSlug>__<idx>
 */
async function handleEpisodeByIndex(ctx, animeUrl, idx) {
  try { await ctx.deleteMessage(); } catch (_) {}

  const loadingMsg = await ctx.reply('⏳ Memuat episode...');

  const detail = await api.getDetail(animeUrl);
  if (!detail || !detail.chapter || detail.chapter.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal memuat data episode. Silakan coba lagi.',
    );
  }

  const chapters = detail.chapter;
  const safeIdx = Math.max(0, Math.min(idx, chapters.length - 1));
  const ep = chapters[safeIdx];

  if (!ep || !ep.url) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Episode tidak ditemukan.',
    );
  }

  const epUrl = ep.url;
  const epTitle = escapeHTML(ep.ch || `Episode ${safeIdx + 1}`);
  const animeTitle = escapeHTML(detail.judul || '');

  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `⏳ Memuat <b>${epTitle}</b>...`,
      { parse_mode: 'HTML' },
    );
  } catch (_) {}

  const videoInfo = await api.getVideo(epUrl);
  const navKeyboard = buildEpisodeNavKeyboard(animeUrl, safeIdx, chapters.length, epUrl);

  if (!videoInfo) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Gagal mengambil video untuk <b>${epTitle}</b>.\n\nCoba episode lain.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
    );
  }

  const qualities = videoInfo.reso || [];
  if (qualities.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Belum ada video untuk <b>${epTitle}</b>.`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
    );
  }

  function resolveDirectLink(entry) {
    if (!entry || !entry.link) return null;
    const link = entry.link;
    const pdMatch = link.match(/pixeldrain\.com\/u\/([A-Za-z0-9]+)/);
    if (pdMatch) return `https://pixeldrain.com/api/file/${pdMatch[1]}`;
    const skipPatterns = [
      /\.html?($|\?)/i, /mega\.nz/i, /gofile\.io/i, /acefile\.co/i, /krakenfiles\.com/i,
    ];
    if (skipPatterns.some(p => p.test(link))) return null;
    return link;
  }

  const preferred = ['720p', '480p', '360p', '1080p'];
  const availableQualities = preferred.filter(q => qualities.includes(q));
  if (availableQualities.length === 0) availableQualities.push(...qualities);

  let streamLink = null;
  let chosenQuality = null;
  for (const q of availableQualities) {
    const streamsForQ = videoInfo.stream.filter(s => s.reso === q && !s.isEmbed);
    for (const entry of streamsForQ) {
      const direct = resolveDirectLink(entry);
      if (direct) { streamLink = direct; chosenQuality = q; break; }
    }
    if (streamLink) break;
  }

  if (!streamLink) {
    const linkLines = videoInfo.stream
      .filter(s => s.link && !s.isEmbed)
      .slice(0, 8)
      .map(s => `• <a href="${escapeHTML(s.link)}">${escapeHTML(s.provider)} (${s.reso})</a>`)
      .join('\n');
    const fallbackText = linkLines
      ? `📺 <b>${animeTitle}</b> — <b>${epTitle}</b>\n\n📥 <b>Link Download:</b>\n${linkLines}\n\n<i>Buka di browser untuk download.</i>`
      : `😔 Tidak ada link video untuk <b>${epTitle}</b>.`;
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      fallbackText,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
    );
  }

  // Cek ukuran file
  let fileSize = 0;
  try {
    const headRes = await fetch(streamLink, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    fileSize = parseInt(headRes.headers.get('content-length') || '0');
  } catch (_) {}

  const fileSizeStr = fileSize > 0 ? formatSize(fileSize) : 'Unknown';
  const MAX_TELEGRAM_SIZE = MAX_UPLOAD_MB * 1024 * 1024;

  if (fileSize > MAX_TELEGRAM_SIZE) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `📺 <b>${animeTitle}</b>\n` +
      `▶️ <b>${epTitle}</b> | ${escapeHTML(chosenQuality)} | ${fileSizeStr}\n\n` +
      `⚠️ File terlalu besar untuk Telegram (max ${MAX_UPLOAD_MB}MB).\n\n` +
      `🔗 <a href="${escapeHTML(streamLink)}">📥 Download / Tonton di Browser</a>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
    );
  }

  // Download video
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `⏳ Mendownload <b>${epTitle}</b> (${chosenQuality}, ${fileSizeStr})...`,
      { parse_mode: 'HTML' },
    );
  } catch (_) {}

  const videoFile = await downloadFile(streamLink, MAX_UPLOAD_MB);

  if (!videoFile || !videoFile.buffer) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Gagal mendownload <b>${epTitle}</b>.\n\n🔗 <a href="${escapeHTML(streamLink)}">📥 Download di Browser</a>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
    );
  }

  const actualSizeStr = formatSize(videoFile.size);

  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `⏳ Upload <b>${epTitle}</b> (${chosenQuality}, ${actualSizeStr})...`,
      { parse_mode: 'HTML' },
    );
  } catch (_) {}

  const fileName = `${detail.judul || 'anime'}_${ep.ch || safeIdx}_${chosenQuality}.mp4`.replace(/[^a-zA-Z0-9._-]/g, '_');

  try {
    await ctx.replyWithVideo(
      Input.fromBuffer(videoFile.buffer, fileName),
      {
        caption: `📺 <b>${animeTitle}</b>\n▶️ <b>${epTitle}</b> | ${escapeHTML(chosenQuality)} | ${actualSizeStr}`,
        parse_mode: 'HTML',
        supports_streaming: true,
        reply_markup: { inline_keyboard: navKeyboard },
      },
    );
    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
    return;
  } catch (err) {
    console.error('Video upload error:', err.message);
    try {
      await ctx.replyWithDocument(
        Input.fromBuffer(videoFile.buffer, fileName),
        {
          caption: `📺 <b>${animeTitle}</b>\n▶️ <b>${epTitle}</b> | ${escapeHTML(chosenQuality)} | ${actualSizeStr}\n<i>Dikirim sebagai file</i>`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: navKeyboard },
        },
      );
      try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
      return;
    } catch (docErr) {
      console.error('Document upload error:', docErr.message);
    }
  }

  // Fallback terakhir: link
  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    `📺 <b>${animeTitle}</b>\n▶️ <b>${epTitle}</b> | ${escapeHTML(chosenQuality)}\n\n⚠️ Gagal upload.\n🔗 <a href="${escapeHTML(streamLink)}">📥 Download di Browser</a>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: navKeyboard } },
  );
}

/**
 * Ambil video episode — smart quality selection + download & upload
 *
 * Flow:
 * 1. GET /getvideo?chapterUrlId=xxx → dapat reso: ["360p","480p","720p"]
 * 2. Coba setiap quality dari kecil ke besar, cek ukuran file dulu (HEAD)
 * 3. Jika ≤50MB → download & upload ke Telegram
 * 4. Jika >50MB → kirim link download langsung
 */
async function handleEpisodeVideo(ctx, epUrl) {
  try { await ctx.deleteMessage(); } catch (_) {}

  const loadingMsg = await ctx.reply('⏳ Mengambil info video...');
  const menuKeyboard = [[{ text: '🏠 Menu Utama', callback_data: 'menu' }]];

  // Step 1: Ambil info quality yang tersedia
  const videoInfo = await api.getVideo(epUrl);

  if (!videoInfo) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal mengambil video. Mungkin video belum tersedia.',
    );
  }

  const qualities = videoInfo.reso || [];

  if (qualities.length === 0) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Belum ada video tersedia untuk episode ini.',
    );
  }

  // Helper: resolve a stream entry's link to a direct downloadable URL
  // Returns null if not downloadable directly
  function resolveDirectLink(entry) {
    if (!entry || !entry.link) return null;
    const link = entry.link;
    // Pixeldrain: convert /u/{id} → /api/file/{id} (direct download)
    const pdMatch = link.match(/pixeldrain\.com\/u\/([A-Za-z0-9]+)/);
    if (pdMatch) return `https://pixeldrain.com/api/file/${pdMatch[1]}`;
    // Skip pages that are not direct media (HTML download pages)
    const skipPatterns = [
      /\.html?($|\?)/i,
      /mega\.nz/i,
      /gofile\.io/i,
      /acefile\.co/i,
      /krakenfiles\.com/i,
    ];
    if (skipPatterns.some(p => p.test(link))) return null;
    // Looks like a direct link (e.g. ends in .mp4 or has video CDN)
    return link;
  }
  // Prioritas: coba dari quality terbaik yang bisa dikirim
  const preferred = ['720p', '480p', '360p', '1080p'];
  const availableQualities = preferred.filter(q => qualities.includes(q));
  if (availableQualities.length === 0) availableQualities.push(...qualities);
  console.log(`Available qualities: [${qualities.join(', ')}]`);

  // Step 2: Cari quality yang punya direct stream link
  // Use streams dari videoInfo yang sudah ada — tidak perlu fetch ulang
  let streamLink = null;
  let chosenQuality = null;
  for (const q of availableQualities) {
    const streamsForQ = videoInfo.stream.filter(s => s.reso === q && !s.isEmbed);
    for (const entry of streamsForQ) {
      const direct = resolveDirectLink(entry);
      if (direct) {
        streamLink = direct;
        chosenQuality = q;
        console.log(`Resolved: ${q} via ${entry.provider} → ${direct.substring(0, 80)}`);
        break;
      }
    }
    if (streamLink) break;
  }
  if (!streamLink) {
    // Fallback: kirim semua download links sebagai teks
    const linkLines = videoInfo.stream
      .filter(s => s.link && !s.isEmbed)
      .slice(0, 10)
      .map(s => `• <a href="${escapeHTML(s.link)}">${escapeHTML(s.provider)} (${s.reso})</a>`)
      .join('\n');
    const fallbackText = linkLines
      ? `😔 Tidak bisa download otomatis.

📥 <b>Link Download:</b>
${linkLines}

<i>Buka di browser untuk download.</i>`
      : '😔 Tidak ada link video tersedia saat ini.';
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      fallbackText,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: menuKeyboard } },
    );
  }

  console.log(`Chosen: ${chosenQuality}, URL: ${streamLink}`);

  // Step 3: Cek ukuran file dulu (HEAD request) — jangan download sia-sia
  let fileSize = 0;
  try {
    const headRes = await fetch(streamLink, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    fileSize = parseInt(headRes.headers.get('content-length') || '0');
  } catch (_) {}

  const fileSizeStr = fileSize > 0 ? formatSize(fileSize) : 'Unknown';
  const MAX_TELEGRAM_SIZE = MAX_UPLOAD_MB * 1024 * 1024;

  console.log(`File size: ${fileSizeStr} (${fileSize} bytes)`);

  // Jika file >50MB, langsung kirim link (jangan download sia-sia)
  if (fileSize > MAX_TELEGRAM_SIZE) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `▶️ <b>Video ${escapeHTML(chosenQuality)}</b> | ${fileSizeStr}\n\n` +
      `⚠️ File terlalu besar untuk Telegram (max 50MB).\n\n` +
      `🔗 <a href="${escapeHTML(streamLink)}">📥 Download / Tonton di Browser</a>\n\n` +
      `<i>💡 Deploy bot di VPS dengan Local Bot API Server untuk support file sampai 2GB.</i>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: menuKeyboard } },
    );
  }

  // Step 4: Download video
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `⏳ Mendownload video (${chosenQuality}, ${fileSizeStr})...\nMohon tunggu sebentar.`,
    );
  } catch (_) {}

  const videoFile = await downloadFile(streamLink, MAX_UPLOAD_MB);

  if (!videoFile || !videoFile.buffer) {
    return await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Gagal mendownload video.\n\n🔗 <a href="${escapeHTML(streamLink)}">📥 Download di Browser</a>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: menuKeyboard } },
    );
  }

  const actualSizeStr = formatSize(videoFile.size);

  // Step 5: Upload ke Telegram
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `⏳ Mengirim video (${chosenQuality}, ${actualSizeStr})...\nSedang upload ke Telegram...`,
    );
  } catch (_) {}

  const fileName = `anime_${chosenQuality}.mp4`;

  // Coba kirim sebagai video
  try {
    await ctx.replyWithVideo(
      Input.fromBuffer(videoFile.buffer, fileName),
      {
        caption: `▶️ <b>${escapeHTML(chosenQuality)}</b> | ${actualSizeStr}`,
        parse_mode: 'HTML',
        supports_streaming: true,
        reply_markup: { inline_keyboard: menuKeyboard },
      },
    );
    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
    console.log(`✅ Video sent: ${chosenQuality} (${actualSizeStr})`);
    return;
  } catch (err) {
    console.error('Video upload error:', err.message);

    // Fallback: kirim sebagai document
    try {
      await ctx.replyWithDocument(
        Input.fromBuffer(videoFile.buffer, fileName),
        {
          caption: `▶️ <b>${escapeHTML(chosenQuality)}</b> | ${actualSizeStr}\n<i>Dikirim sebagai file</i>`,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: menuKeyboard },
        },
      );
      try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
      console.log(`✅ Video sent as document: ${chosenQuality} (${actualSizeStr})`);
      return;
    } catch (docErr) {
      console.error('Document upload error:', docErr.message);
    }
  }

  // Fallback terakhir: kirim link
  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    `▶️ <b>Video ${escapeHTML(chosenQuality)}</b> | ${actualSizeStr}\n\n` +
    `⚠️ Gagal upload ke Telegram.\n` +
    `🔗 <a href="${escapeHTML(streamLink)}">📥 Download / Tonton di Browser</a>`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: menuKeyboard } },
  );
}

// ============================================================
// UTILITIES
// ============================================================

async function fetchByPrefix(prefix) {
  switch (prefix) {
    case 'latest': return api.getLatest();
    case 'rec': return api.getRecommended();
    case 'movie': return api.getMovies();
    default: return null;
  }
}

async function editOrReply(ctx, text, keyboard = []) {
  const opts = { parse_mode: 'HTML' };
  if (keyboard && keyboard.length > 0) {
    opts.reply_markup = { inline_keyboard: keyboard };
  }

  try {
    await ctx.editMessageText(text, opts);
  } catch (err) {
    try { await ctx.deleteMessage(); } catch (_) {}
    await ctx.reply(text, opts);
  }
}

bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try {
    ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi nanti.');
  } catch (_) {}
});

module.exports = bot;
