/**
 * Helpers — Format pesan, pagination, dan utilitas
 */

const PER_PAGE = 5;

/**
 * Escape karakter spesial untuk MarkdownV2
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
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
 * Format daftar anime menjadi pesan teks
 * @param  {Array}  items    - Array of anime objects
 * @param  {number} page     - Current page (0-indexed)
 * @param  {string} emoji    - Emoji prefix
 * @returns {string} Formatted message
 */
function formatAnimeList(items, page = 0, emoji = '🎬') {
  if (!items || items.length === 0) {
    return '😔 Tidak ada anime ditemukan\\.';
  }

  const start = page * PER_PAGE;
  const end = Math.min(start + PER_PAGE, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE);

  let msg = '';
  pageItems.forEach((item, idx) => {
    const num = start + idx + 1;
    const title = escapeMarkdown(item.judul || 'Tanpa Judul');
    const ep = item.lastch ? ` \\| ${escapeMarkdown(item.lastch)}` : '';
    msg += `${emoji} *${num}\\. ${title}*${ep}\n`;
  });

  msg += `\n📄 _Halaman ${page + 1} dari ${totalPages}_ \\(${items.length} anime\\)`;
  return msg;
}

/**
 * Format detail anime menjadi pesan rich Markdown
 */
function formatAnimeDetail(detail) {
  if (!detail) return '😔 Detail tidak tersedia\\.';

  const title = escapeMarkdown(detail.judul || 'Tanpa Judul');
  const sinopsis = escapeMarkdown(truncate(detail.sinopsis || 'Sinopsis tidak tersedia.', 500));
  const score = escapeMarkdown(detail.score || '-');
  const status = escapeMarkdown(detail.status || '-');
  const studio = escapeMarkdown(detail.studio || '-');
  const rilis = escapeMarkdown(detail.rilis || '-');
  const totalEp = detail.total_episode || '-';
  const genres = detail.genre && detail.genre.length > 0
    ? detail.genre.map(g => escapeMarkdown(g)).join(', ')
    : '\\-';

  let msg = `🎬 *${title}*\n\n`;
  msg += `⭐ *Score:* ${score}\n`;
  msg += `📺 *Status:* ${status}\n`;
  msg += `🎥 *Studio:* ${studio}\n`;
  msg += `📅 *Rilis:* ${rilis}\n`;
  msg += `📝 *Episode:* ${totalEp}\n`;
  msg += `🏷️ *Genre:* ${genres}\n\n`;
  msg += `📖 *Sinopsis:*\n${sinopsis}`;

  return msg;
}

/**
 * Buat inline keyboard untuk daftar anime (clickable items + pagination)
 * @param {Array}  items      - Array of anime objects
 * @param {number} page       - Current page (0-indexed)
 * @param {string} prefix     - Callback prefix (latest, rec, movie, search)
 * @param {string} searchQuery - Opsional, untuk search pagination
 * @returns {Array} Inline keyboard rows
 */
function buildAnimeListKeyboard(items, page = 0, prefix = 'latest', searchQuery = '') {
  if (!items || items.length === 0) return [];

  const start = page * PER_PAGE;
  const end = Math.min(start + PER_PAGE, items.length);
  const pageItems = items.slice(start, end);
  const totalPages = Math.ceil(items.length / PER_PAGE);

  const keyboard = [];

  // Tombol untuk setiap anime
  pageItems.forEach((item, idx) => {
    const num = start + idx + 1;
    const label = `${num}. ${(item.judul || 'Tanpa Judul').substring(0, 40)}`;
    keyboard.push([{
      text: label,
      callback_data: `detail_${item.url}`,
    }]);
  });

  // Tombol pagination
  const navRow = [];
  if (page > 0) {
    const prevData = searchQuery
      ? `${prefix}_page_${page - 1}_${searchQuery}`
      : `${prefix}_page_${page - 1}`;
    navRow.push({ text: '◀️ Prev', callback_data: prevData });
  }
  if (page < totalPages - 1) {
    const nextData = searchQuery
      ? `${prefix}_page_${page + 1}_${searchQuery}`
      : `${prefix}_page_${page + 1}`;
    navRow.push({ text: 'Next ▶️', callback_data: nextData });
  }
  if (navRow.length > 0) keyboard.push(navRow);

  // Tombol kembali ke menu
  keyboard.push([{ text: '🏠 Menu Utama', callback_data: 'menu' }]);

  return keyboard;
}

/**
 * Buat inline keyboard detail anime (Tonton + kembali)
 */
function buildDetailKeyboard(animeUrl) {
  return [
    [{ text: '▶️ Tonton', callback_data: `watch_${animeUrl}` }],
    [{ text: '🔙 Kembali', callback_data: 'menu' }],
  ];
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
      { text: '🔍 Cari Anime', callback_data: 'cmd_cari' },
    ],
  ];
}

/**
 * Welcome message
 */
function getWelcomeMessage() {
  return `🎌 *Selamat datang di VinimeBot\\!*\n\n` +
    `Bot ini membantu kamu menemukan dan menonton anime favorit\\. 🍿\n\n` +
    `📌 *Menu:*\n` +
    `🆕 /terbaru — Anime terbaru\n` +
    `⭐ /rekomendasi — Anime rekomendasi\n` +
    `🎥 /movie — Daftar movie\n` +
    `🔍 /cari \\<judul\\> — Cari anime\n\n` +
    `Atau gunakan tombol di bawah ini 👇`;
}

module.exports = {
  PER_PAGE,
  escapeMarkdown,
  truncate,
  formatAnimeList,
  formatAnimeDetail,
  buildAnimeListKeyboard,
  buildDetailKeyboard,
  buildMainMenuKeyboard,
  getWelcomeMessage,
};
