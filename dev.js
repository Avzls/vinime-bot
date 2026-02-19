/**
 * Development Server — Local testing dengan polling
 * Jalankan: node dev.js
 *
 * CATATAN: File ini hanya untuk development lokal.
 * Di Vercel, bot menggunakan webhook mode via api/webhook.js
 */

// Load environment variables dari .env
try {
  require('dotenv').config();
} catch (_) {
  // dotenv optional, bisa set env vars manual
  console.log('💡 dotenv not installed. Set env vars manually or run: npm i -D dotenv');
}

// Validasi token
if (!process.env.TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN belum diset!');
  console.error('   Buat file .env dan isi TELEGRAM_TOKEN=your_token_here');
  process.exit(1);
}

const bot = require('./src/bot');

// Mode polling untuk development
console.log('🚀 Starting VinimeBot in polling mode (development)...');
console.log('📡 API Base:', process.env.API_BASE_URL || 'https://api.sansekai.my.id/api');

bot.launch()
  .then(() => console.log('✅ Bot is running! Send /start to your bot.'))
  .catch((err) => {
    console.error('❌ Failed to start bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
