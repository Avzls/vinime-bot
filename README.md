# 🎌 VinimeBot — Bot Telegram Nonton Anime

Bot Telegram untuk menonton anime secara gratis, menggunakan **Telegraf** dan di-deploy ke **Vercel** (serverless).

## 📋 Fitur

| Command | Deskripsi |
|---|---|
| `/start` | Menu utama dengan tombol navigasi |
| `/terbaru` | Daftar anime terbaru |
| `/rekomendasi` | Anime rekomendasi |
| `/movie` | Daftar movie anime |
| `/cari <judul>` | Cari anime berdasarkan judul |

- 🖼️ Tampilkan poster/thumbnail anime
- 📖 Detail lengkap (sinopsis, rating, genre, studio, episode)
- ▶️ Ambil link video/streaming
- 📄 Pagination otomatis (5 item per halaman)
- 🎨 Format pesan dengan Markdown & emoji

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+
- **Bot Library:** [Telegraf](https://telegraf.js.org/)
- **API:** https://api.sansekai.my.id/api (tanpa auth)
- **Hosting:** Vercel (serverless)
- **Mode:** Webhook

## 📁 Struktur Project

```
vinime/
├── api/
│   └── webhook.js      # Vercel serverless entry point
├── src/
│   ├── bot.js           # Telegraf bot (commands + callbacks)
│   ├── api.js           # Fungsi fetch ke API anime
│   └── helpers.js       # Format pesan & pagination
├── dev.js               # Local development (polling mode)
├── vercel.json          # Konfigurasi routing Vercel
├── .env.example         # Template environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Setup & Development

### 1. Buat Bot di @BotFather

1. Buka Telegram dan cari **@BotFather**
2. Kirim `/newbot`
3. Ikuti instruksi — beri nama dan username untuk bot
4. Catat **Bot Token** yang diberikan (format: `123456:ABC-DEF...`)

### 2. Clone & Install

```bash
# Clone repository
git clone <repo-url>
cd vinime

# Install dependencies
npm install
```

### 3. Setup Environment Variables

```bash
# Copy file .env.example
cp .env.example .env

# Edit file .env, isi token bot kamu
TELEGRAM_TOKEN=your_bot_token_here
API_BASE_URL=https://api.sansekai.my.id/api
```

### 4. Testing Lokal (Polling Mode)

Untuk testing lokal, gunakan mode polling (tanpa webhook):

```bash
# Install dotenv untuk development (opsional)
npm install -D dotenv

# Jalankan bot
npm run dev
```

Bot akan berjalan dalam mode polling. Buka Telegram dan kirim `/start` ke bot kamu.

### 5. Testing Lokal (Webhook Mode + Ngrok)

Jika ingin test webhook secara lokal:

```bash
# Install ngrok (jika belum)
npm install -g ngrok

# Terminal 1: Jalankan local server
# Gunakan vercel dev atau custom server

# Terminal 2: Expose port lokal via ngrok
ngrok http 3000
```

Setelah ngrok berjalan, set webhook:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<ngrok-url>/api/webhook
```

---

## 🌐 Deploy ke Vercel

### Cara 1: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy ke production
vercel --prod
```

### Cara 2: Via GitHub

1. Push project ke GitHub repository
2. Buka [vercel.com](https://vercel.com) dan login
3. Klik **"New Project"** → Import repository GitHub
4. Vercel otomatis detect project — klik **Deploy**

### Set Environment Variables di Vercel

1. Buka project di [Vercel Dashboard](https://vercel.com/dashboard)
2. Klik project → **Settings** → **Environment Variables**
3. Tambahkan:

| Key | Value |
|---|---|
| `TELEGRAM_TOKEN` | Token dari @BotFather |
| `API_BASE_URL` | `https://api.sansekai.my.id/api` |

4. Klik **Save** → **Redeploy** project

---

## 🔗 Aktivasi Webhook

Setelah deploy ke Vercel, aktifkan webhook Telegram:

### Set Webhook

Buka URL berikut di browser (ganti `<TOKEN>` dan `<VERCEL_URL>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-vercel-url>/api/webhook
```

Contoh:
```
https://api.telegram.org/bot123456:ABC-DEF/setWebhook?url=https://vinime.vercel.app/api/webhook
```

Response yang diharapkan:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Verifikasi Webhook

Cek apakah webhook aktif:

```
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

Response yang diharapkan:
```json
{
  "ok": true,
  "result": {
    "url": "https://vinime.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 📡 API Endpoints

Bot menggunakan REST API dari `https://api.sansekai.my.id/api`:

| Endpoint | Deskripsi |
|---|---|
| `GET /anime/latest` | Anime terbaru |
| `GET /anime/recommended` | Anime rekomendasi |
| `GET /anime/movie` | Daftar movie anime |
| `GET /anime/search/{query}` | Cari anime (path param) |
| `GET /anime/detail/{url}` | Detail anime |
| `GET /anime/getvideo/{url}` | Link video/streaming |

> **Catatan:** API search, detail, dan getvideo menggunakan **path parameter**, bukan query string.

---

## ⚠️ Troubleshooting

### Bot tidak merespons
- Pastikan `TELEGRAM_TOKEN` sudah benar
- Cek webhook sudah diset: `/getWebhookInfo`
- Cek log di Vercel Dashboard → **Deployments** → **Functions**

### Error 429 dari API
- API memiliki rate limiting
- Tunggu beberapa saat, lalu coba lagi

### Webhook gagal diset
- Pastikan URL Vercel sudah benar dan bisa diakses publik
- Format URL harus HTTPS
- Coba hapus webhook lama dulu: `deleteWebhook`

```
https://api.telegram.org/bot<TOKEN>/deleteWebhook
```

---

## 📄 License

MIT
