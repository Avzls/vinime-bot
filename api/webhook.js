/**
 * Vercel Serverless Function — Webhook Entry Point
 * Route: POST /api/webhook
 */

const bot = require('../src/bot');

// Vercel serverless handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      // Handle Telegram webhook update
      await bot.handleUpdate(req.body, res);
      // Jika bot.handleUpdate tidak mengirim response, kirim 200
      if (!res.writableEnded) {
        res.status(200).json({ ok: true });
      }
    } else {
      // GET — Health check
      res.status(200).json({
        status: 'VinimeBot is running! 🎌',
        webhook: 'active',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ ok: true, error: err.message });
  }
};
