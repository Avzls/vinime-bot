/**
 * Bot.js — Telegraf bot setup (webhook mode)
 * Semua command dan callback handler
 */

const { Telegraf, Markup } = require('telegraf');
const api = require('./api');
const {
  formatAnimeList,
  formatAnimeDetail,
  buildAnimeListKeyboard,
  buildDetailKeyboard,
  buildMainMenuKeyboard,
  getWelcomeMessage,
  escapeMarkdown,
} = require('./helpers');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ============================================================
// COMMANDS
// ============================================================

/**
 * /start — Pesan sambutan + tombol menu
 */
bot.start(async (ctx) => {
  try {
    await ctx.replyWithMarkdownV2(getWelcomeMessage(), {
      reply_markup: { inline_keyboard: buildMainMenuKeyboard() },
    });
  } catch (err) {
    console.error('Error /start:', err.message);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
  }
});

/**
 * /terbaru — Anime terbaru
 */
bot.command('terbaru', async (ctx) => {
  await handleAnimeList(ctx, 'latest', '🆕 *Anime Terbaru:*\n\n', '🆕');
});

/**
 * /rekomendasi — Anime rekomendasi
 */
bot.command('rekomendasi', async (ctx) => {
  await handleAnimeList(ctx, 'rec', '⭐ *Anime Rekomendasi:*\n\n', '⭐');
});

/**
 * /movie — Daftar movie
 */
bot.command('movie', async (ctx) => {
  await handleAnimeList(ctx, 'movie', '🎥 *Daftar Movie Anime:*\n\n', '🎥');
});

/**
 * /cari <judul> — Cari anime
 */
bot.command('cari', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!query) {
    return ctx.replyWithMarkdownV2(
      '🔍 Gunakan format: `/cari judul anime`\n\nContoh: `/cari naruto`',
    );
  }
  await handleSearch(ctx, query, 0);
});

// ============================================================
// CALLBACK QUERY HANDLERS
// ============================================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    await ctx.answerCbQuery();

    // --- Menu utama ---
    if (data === 'menu') {
      await ctx.editMessageText(getWelcomeMessage(), {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: buildMainMenuKeyboard() },
      });
      return;
    }

    // --- Command dari tombol menu ---
    if (data === 'cmd_terbaru') {
      await handleAnimeListEdit(ctx, 'latest', '🆕 *Anime Terbaru:*\n\n', '🆕', 0);
      return;
    }
    if (data === 'cmd_rekomendasi') {
      await handleAnimeListEdit(ctx, 'rec', '⭐ *Anime Rekomendasi:*\n\n', '⭐', 0);
      return;
    }
    if (data === 'cmd_movie') {
      await handleAnimeListEdit(ctx, 'movie', '🎥 *Daftar Movie Anime:*\n\n', '🎥', 0);
      return;
    }
    if (data === 'cmd_cari') {
      await ctx.editMessageText(
        '🔍 Silakan ketik perintah:\n`/cari judul anime`\n\nContoh: `/cari naruto`',
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    // --- Pagination ---
    const pageMatch = data.match(/^(latest|rec|movie)_page_(\d+)$/);
    if (pageMatch) {
      const prefix = pageMatch[1];
      const page = parseInt(pageMatch[2]);
      const emojiMap = { latest: '🆕', rec: '⭐', movie: '🎥' };
      const titleMap = {
        latest: '🆕 *Anime Terbaru:*\n\n',
        rec: '⭐ *Anime Rekomendasi:*\n\n',
        movie: '🎥 *Daftar Movie Anime:*\n\n',
      };
      await handleAnimeListEdit(ctx, prefix, titleMap[prefix], emojiMap[prefix], page);
      return;
    }

    // --- Search pagination ---
    const searchPageMatch = data.match(/^search_page_(\d+)_(.+)$/);
    if (searchPageMatch) {
      const page = parseInt(searchPageMatch[1]);
      const query = searchPageMatch[2];
      await handleSearchEdit(ctx, query, page);
      return;
    }

    // --- Detail anime ---
    if (data.startsWith('detail_')) {
      const animeUrl = data.replace('detail_', '');
      await handleDetail(ctx, animeUrl);
      return;
    }

    // --- Tonton / Watch ---
    if (data.startsWith('watch_')) {
      const animeUrl = data.replace('watch_', '');
      await handleWatch(ctx, animeUrl);
      return;
    }

    // --- Episode list ---
    if (data.startsWith('episodes_')) {
      const animeUrl = data.replace('episodes_', '');
      await handleEpisodeList(ctx, animeUrl);
      return;
    }

    // --- Episode video ---
    if (data.startsWith('ep_')) {
      const epUrl = data.replace('ep_', '');
      await handleEpisodeVideo(ctx, epUrl);
      return;
    }
  } catch (err) {
    console.error('Callback error:', err.message);
    try {
      await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    } catch (_) {}
  }
});

// ============================================================
// HANDLER FUNCTIONS
// ============================================================

/**
 * Fetch & send anime list (new message)
 */
async function handleAnimeList(ctx, prefix, header, emoji) {
  const loadingMsg = await ctx.reply('⏳ Memuat data...');
  const items = await fetchByPrefix(prefix);

  if (!items) {
    return ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal memuat data. Silakan coba lagi nanti.'
    );
  }

  const text = header + formatAnimeList(items, 0, emoji);
  const keyboard = buildAnimeListKeyboard(items, 0, prefix);

  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    text,
    { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } },
  );
}

/**
 * Fetch & edit existing message with anime list
 */
async function handleAnimeListEdit(ctx, prefix, header, emoji, page) {
  const items = await fetchByPrefix(prefix);
  if (!items) {
    return ctx.editMessageText('😔 Gagal memuat data. Silakan coba lagi nanti.');
  }

  const text = header + formatAnimeList(items, page, emoji);
  const keyboard = buildAnimeListKeyboard(items, page, prefix);

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: keyboard },
  });
}

/**
 * Search & send result (new message)
 */
async function handleSearch(ctx, query, page) {
  const loadingMsg = await ctx.reply(`⏳ Mencari "${query}"...`);
  const items = await api.searchAnime(query);

  if (!items || items.length === 0) {
    return ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      `😔 Tidak ditemukan anime dengan judul "${query}".`
    );
  }

  const header = `🔍 *Hasil Pencarian:* _${escapeMarkdown(query)}_\n\n`;
  const text = header + formatAnimeList(items, page, '🔍');
  const keyboard = buildAnimeListKeyboard(items, page, 'search', query);

  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    text,
    { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } },
  );
}

/**
 * Search & edit existing message
 */
async function handleSearchEdit(ctx, query, page) {
  const items = await api.searchAnime(query);
  if (!items || items.length === 0) {
    return ctx.editMessageText(`😔 Tidak ditemukan anime dengan judul "${query}".`);
  }

  const header = `🔍 *Hasil Pencarian:* _${escapeMarkdown(query)}_\n\n`;
  const text = header + formatAnimeList(items, page, '🔍');
  const keyboard = buildAnimeListKeyboard(items, page, 'search', query);

  await ctx.editMessageText(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: keyboard },
  });
}

/**
 * Show anime detail
 */
async function handleDetail(ctx, animeUrl) {
  const detail = await api.getDetail(animeUrl);

  if (!detail) {
    return ctx.editMessageText('😔 Gagal memuat detail anime. Silakan coba lagi.');
  }

  const text = formatAnimeDetail(detail);
  const keyboard = buildDetailKeyboard(animeUrl);

  // Jika ada cover image, kirim sebagai foto baru
  if (detail.cover) {
    try {
      // Delete old message
      await ctx.deleteMessage();
    } catch (_) {}

    try {
      await ctx.replyWithPhoto(detail.cover, {
        caption: text,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: keyboard },
      });
      return;
    } catch (err) {
      console.error('Photo send error:', err.message);
      // Fallback to text only
    }
  }

  // Fallback: text only
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (_) {
    // If edit fails (e.g. message was photo), send new message
    await ctx.reply(text, {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}

/**
 * Handle watch — get video link
 */
async function handleWatch(ctx, animeUrl) {
  try { await ctx.deleteMessage(); } catch (_) {}

  const loadingMsg = await ctx.reply('⏳ Mengambil link video...');
  const videoData = await api.getVideo(animeUrl);

  if (!videoData) {
    return ctx.telegram.editMessageText(
      ctx.chat.id, loadingMsg.message_id, null,
      '😔 Gagal mengambil link video. Mungkin video belum tersedia untuk anime ini.',
    );
  }

  // videoData bisa berupa object atau array tergantung API
  let message = '▶️ *Link Video Tersedia:*\n\n';
  const keyboard = [[{ text: '🔙 Kembali', callback_data: 'menu' }]];

  if (Array.isArray(videoData)) {
    // Array of video sources
    if (videoData.length === 0) {
      return ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, null,
        '😔 Belum ada video tersedia untuk anime ini.',
      );
    }

    videoData.forEach((v, i) => {
      const quality = v.quality || v.resolusi || v.label || `Source ${i + 1}`;
      const url = v.url || v.link || v.src || '';
      if (url) {
        message += `🔗 *${escapeMarkdown(String(quality))}:* [Tonton](${escapeMarkdown(url)})\n`;
      }
    });
  } else if (typeof videoData === 'object') {
    // Object with video info
    const episodes = videoData.episodes || videoData.episode_list || videoData.data;

    if (episodes && Array.isArray(episodes)) {
      // Show episode list with buttons
      message = `📺 *Daftar Episode:*\n\n`;
      const epKeyboard = [];
      const maxShow = Math.min(episodes.length, 20);

      for (let i = 0; i < maxShow; i++) {
        const ep = episodes[i];
        const epTitle = ep.judul || ep.title || ep.episode || `Episode ${i + 1}`;
        const epUrl = ep.url || ep.id || '';
        epKeyboard.push([{
          text: `📺 ${epTitle}`,
          callback_data: `ep_${epUrl}`.substring(0, 64),
        }]);
      }

      if (episodes.length > 20) {
        message += `_Menampilkan 20 dari ${episodes.length} episode_\n`;
      }

      epKeyboard.push([{ text: '🔙 Kembali', callback_data: `detail_${animeUrl}` }]);

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, null,
        message,
        { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: epKeyboard } },
      );
      return;
    }

    // Single video URL
    const url = videoData.url || videoData.link || videoData.src || videoData.video || '';
    if (url) {
      message += `🔗 [Tonton Sekarang](${escapeMarkdown(url)})`;
    } else {
      // Dump available keys
      const keys = Object.keys(videoData);
      if (keys.length > 0) {
        message = '▶️ *Data Video:*\n\n';
        keys.forEach(key => {
          const val = videoData[key];
          if (typeof val === 'string' && val.startsWith('http')) {
            message += `🔗 *${escapeMarkdown(key)}:* [Link](${escapeMarkdown(val)})\n`;
          } else if (typeof val === 'string') {
            message += `📝 *${escapeMarkdown(key)}:* ${escapeMarkdown(val)}\n`;
          }
        });
      } else {
        message = '😔 Format video tidak dikenali\\.';
      }
    }
  } else if (typeof videoData === 'string' && videoData.startsWith('http')) {
    message += `🔗 [Tonton Sekarang](${escapeMarkdown(videoData)})`;
  } else {
    message = '😔 Format video tidak dikenali\\.';
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id, loadingMsg.message_id, null,
    message,
    { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } },
  );
}

/**
 * Handle episode list
 */
async function handleEpisodeList(ctx, animeUrl) {
  const videoData = await api.getVideo(animeUrl);
  if (!videoData) {
    return ctx.editMessageText('😔 Gagal memuat daftar episode.');
  }
  // Redirect to watch handler logic
  await handleWatch(ctx, animeUrl);
}

/**
 * Handle episode video
 */
async function handleEpisodeVideo(ctx, epUrl) {
  const loadingText = '⏳ Mengambil link episode\\.\\.\\.';
  try {
    await ctx.editMessageText(loadingText, { parse_mode: 'MarkdownV2' });
  } catch (_) {}

  const videoData = await api.getVideo(epUrl);

  if (!videoData) {
    return ctx.editMessageText('😔 Gagal mengambil link video episode.');
  }

  let message = '▶️ *Link Episode:*\n\n';
  const keyboard = [[{ text: '🔙 Kembali', callback_data: 'menu' }]];

  if (Array.isArray(videoData)) {
    videoData.forEach((v, i) => {
      const quality = v.quality || v.resolusi || v.label || `Source ${i + 1}`;
      const url = v.url || v.link || v.src || '';
      if (url) {
        message += `🔗 *${escapeMarkdown(String(quality))}:* [Tonton](${escapeMarkdown(url)})\n`;
      }
    });
  } else if (typeof videoData === 'object') {
    const url = videoData.url || videoData.link || videoData.src || videoData.video || '';
    if (url) {
      message += `🔗 [Tonton Sekarang](${escapeMarkdown(url)})`;
    } else {
      const keys = Object.keys(videoData);
      keys.forEach(key => {
        const val = videoData[key];
        if (typeof val === 'string' && val.startsWith('http')) {
          message += `🔗 *${escapeMarkdown(key)}:* [Link](${escapeMarkdown(val)})\n`;
        }
      });
    }
  }

  await ctx.editMessageText(message, {
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// ============================================================
// UTILITY
// ============================================================

/**
 * Fetch data by prefix type
 */
async function fetchByPrefix(prefix) {
  switch (prefix) {
    case 'latest': return api.getLatest();
    case 'rec': return api.getRecommended();
    case 'movie': return api.getMovies();
    default: return null;
  }
}

/**
 * Error handler
 */
bot.catch((err, ctx) => {
  console.error('Bot error:', err.message);
  try {
    ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi nanti.');
  } catch (_) {}
});

module.exports = bot;
