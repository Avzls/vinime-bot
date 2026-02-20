/**
 * Helpers — Format pesan, pagination, dan utilitas
 */

const PER_PAGE = 5;
const PER_PAGE_AZ = 10;

/**
 * Escape karakter spesial untuk MarkdownV2
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Potong teks panjang dengan ellipsis
 */
function truncate(text, maxLen = 300) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

/**
 * Format daftar anime menjadi pesan teks (HTML mode)
 */
function formatAnimeList(items, page = 0, emoji = '🎬') {
  if (!items || items.length === 0) {
    return '😔 Tidak ada anime ditemukan.';
  }

  const start = page * PER_PAGE;
  const end = Math.min(start + PER_PAGE, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE);

  let msg = '';
  pageItems.forEach((item, idx) => {
    const num = start + idx + 1;
    const title = escapeHTML(item.judul || 'Tanpa Judul');
    const ep = item.lastch ? ` | ${escapeHTML(item.lastch)}` : '';
    msg += `${emoji} <b>${num}. ${title}</b>${ep}\n`;
  });

  msg += `\n📄 <i>Halaman ${page + 1} dari ${totalPages}</i> (${items.length} anime)`;
  return msg;
}

/**
 * Format detail anime (HTML mode)
 */
function formatAnimeDetail(detail) {
  if (!detail) return '😔 Detail tidak tersedia.';

  const title = escapeHTML(detail.judul || detail.series_id || 'Tanpa Judul');
  const sinopsis = escapeHTML(truncate(detail.sinopsis || 'Sinopsis tidak tersedia.', 500));
  const score = escapeHTML(detail.rating || detail.score || '-');
  const status = escapeHTML(detail.status || '-');
  const rilis = escapeHTML(detail.published || detail.rilis || '-');
  const type = escapeHTML(detail.type || '-');
  const totalEp = detail.chapter ? detail.chapter.length : (detail.total_episode || '-');
  const genres = detail.genre && detail.genre.length > 0
    ? detail.genre.map(g => escapeHTML(g)).join(', ')
    : '-';

  let msg = `🎬 <b>${title}</b>\n\n`;
  msg += `⭐ <b>Score:</b> ${score}\n`;
  msg += `📺 <b>Status:</b> ${status}\n`;
  msg += `🎥 <b>Tipe:</b> ${type}\n`;
  msg += `📅 <b>Rilis:</b> ${rilis}\n`;
  msg += `📝 <b>Episode:</b> ${totalEp}\n`;
  msg += `🏷️ <b>Genre:</b> ${genres}\n\n`;
  msg += `📖 <b>Sinopsis:</b>\n${sinopsis}`;

  return msg;
}

/**
 * Escape untuk HTML
 */
function escapeHTML(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Buat inline keyboard untuk daftar anime (clickable items + pagination)
 */
function buildAnimeListKeyboard(items, page = 0, prefix = 'latest', searchQuery = '') {
  if (!items || items.length === 0) return [];

  const start = page * PER_PAGE;
  const end = Math.min(start + PER_PAGE, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE);

  const keyboard = [];

  pageItems.forEach((item, idx) => {
    const num = start + idx + 1;
    const label = `${num}. ${(item.judul || 'Tanpa Judul').substring(0, 40)}`;
    const urlId = item.url || item.series_id || '';
    keyboard.push([{
      text: label,
      callback_data: `detail_${urlId}`.substring(0, 64),
    }]);
  });

  const navRow = [];
  if (page > 0) {
    const prevData = searchQuery
      ? `${prefix}_p_${page - 1}_${searchQuery}`
      : `${prefix}_p_${page - 1}`;
    navRow.push({ text: '◀️ Prev', callback_data: prevData.substring(0, 64) });
  }
  if (page < totalPages - 1) {
    const nextData = searchQuery
      ? `${prefix}_p_${page + 1}_${searchQuery}`
      : `${prefix}_p_${page + 1}`;
    navRow.push({ text: 'Next ▶️', callback_data: nextData.substring(0, 64) });
  }
  if (navRow.length > 0) keyboard.push(navRow);

  keyboard.push([{ text: '🏠 Menu Utama', callback_data: 'menu' }]);

  return keyboard;
}

/**
 * Format daftar anime A-Z (10 per page, client-side pagination)
 */
function formatAnimeListAZ(items, page = 0) {
  if (!items || items.length === 0) {
    return '😔 Tidak ada anime ditemukan.';
  }

  const start = page * PER_PAGE_AZ;
  const end = Math.min(start + PER_PAGE_AZ, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE_AZ);

  let msg = '';
  pageItems.forEach((item, idx) => {
    const num = start + idx + 1;
    const title = escapeHTML(item.judul || 'Tanpa Judul');
    msg += `📋 <b>${num}. ${title}</b>\n`;
  });

  msg += `\n📄 <i>Halaman ${page + 1} dari ${totalPages}</i> (${items.length} anime)`;
  return msg;
}

/**
 * Buat inline keyboard untuk list A-Z (10 per page, 2 kolom)
 */
function buildAnimeListAZKeyboard(items, page = 0) {
  if (!items || items.length === 0) return [];

  const start = page * PER_PAGE_AZ;
  const end = Math.min(start + PER_PAGE_AZ, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE_AZ);

  const keyboard = [];

  for (let i = 0; i < pageItems.length; i += 2) {
    const row = [];
    const idx1 = start + i;
    const item1 = pageItems[i];
    const urlId1 = item1.url || item1.series_id || '';
    row.push({
      text: `${idx1 + 1}. ${(item1.judul || '?').substring(0, 25)}`,
      callback_data: `detail_${urlId1}`.substring(0, 64),
    });
    if (i + 1 < pageItems.length) {
      const idx2 = start + i + 1;
      const item2 = pageItems[i + 1];
      const urlId2 = item2.url || item2.series_id || '';
      row.push({
        text: `${idx2 + 1}. ${(item2.judul || '?').substring(0, 25)}`,
        callback_data: `detail_${urlId2}`.substring(0, 64),
      });
    }
    keyboard.push(row);
  }

  // Pagination
  const navRow = [];
  if (page > 0) {
    navRow.push({ text: '◀️ Prev', callback_data: `az_p_${page - 1}` });
  }
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (page < totalPages - 1) {
    navRow.push({ text: 'Next ▶️', callback_data: `az_p_${page + 1}` });
  }
  if (navRow.length > 0) keyboard.push(navRow);

  keyboard.push([{ text: '🏠 Menu Utama', callback_data: 'menu' }]);

  return keyboard;
}

/**
 * Buat inline keyboard untuk episode list
 */
function buildEpisodeKeyboard(chapters, animeUrl) {
  const keyboard = [];
  const maxShow = Math.min(chapters.length, 20);

  for (let i = 0; i < maxShow; i += 2) {
    const row = [];
    const ep1 = chapters[i];
    row.push({
      text: `📺 Ep ${ep1.ch || i + 1}`,
      callback_data: `ep_${ep1.url}`.substring(0, 64),
    });
    if (i + 1 < maxShow) {
      const ep2 = chapters[i + 1];
      row.push({
        text: `📺 Ep ${ep2.ch || i + 2}`,
        callback_data: `ep_${ep2.url}`.substring(0, 64),
      });
    }
    keyboard.push(row);
  }

  keyboard.push([{ text: '🔙 Kembali', callback_data: `detail_${animeUrl}`.substring(0, 64) }]);
  keyboard.push([{ text: '🏠 Menu Utama', callback_data: 'menu' }]);
  return keyboard;
}

/**
 * Buat inline keyboard detail anime
 */
function buildDetailKeyboard(animeUrl, hasChapters = false) {
  const keyboard = [];
  if (hasChapters) {
    keyboard.push([{ text: '📺 Daftar Episode', callback_data: `episodes_${animeUrl}`.substring(0, 64) }]);
  }
  keyboard.push([{ text: '🔙 Kembali', callback_data: 'menu' }]);
  return keyboard;
}

/**
 * Buat inline keyboard menu utama
 */
function buildMainMenuKeyboard() {
  return [
    [
      { text: '🆕 Terbaru', callback_data: 'cmd_terbaru' },
      { text: '⭐ Rekomendasi', callback_data: 'cmd_rekomendasi' },
    ],
    [
      { text: '🎥 Movie', callback_data: 'cmd_movie' },
      { text: '📋 List A-Z', callback_data: 'cmd_listaz' },
    ],
    [
      { text: '🔍 Cari Anime', callback_data: 'cmd_cari' },
    ],
  ];
}

/**
 * Welcome message (HTML)
 */
function getWelcomeMessage() {
  return `🎌 <b>Selamat datang di VinimeBot!</b>\n\n` +
    `Bot ini membantu kamu menemukan dan menonton anime favorit. 🍿\n\n` +
    `📌 <b>Menu:</b>\n` +
    `🆕 /terbaru — Anime terbaru\n` +
    `⭐ /rekomendasi — Anime rekomendasi\n` +
    `🎥 /movie — Daftar movie\n` +
    `📋 /list — Semua anime A-Z\n` +
    `🔍 /cari &lt;judul&gt; — Cari anime\n\n` +
    `Atau gunakan tombol di bawah ini 👇`;
}

module.exports = {
  PER_PAGE,
  PER_PAGE_AZ,
  escapeMarkdown,
  escapeHTML,
  truncate,
  formatAnimeList,
  formatAnimeListAZ,
  formatAnimeDetail,
  buildAnimeListKeyboard,
  buildAnimeListAZKeyboard,
  buildEpisodeKeyboard,
  buildDetailKeyboard,
  buildMainMenuKeyboard,
  getWelcomeMessage,
};
