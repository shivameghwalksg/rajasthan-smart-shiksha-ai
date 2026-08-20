# Rajasthan Smart Shiksha AI — Phase 2 Real AI

## 1) Install
Install Node.js 18+.

Then in this folder:
```bash
npm install
```

## 2) Add your Gemini API key
Create a file named `.env` in the project root:
```env
GEMINI_API_KEY=YOUR_REAL_KEY
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

**Never put the real key inside `public/index.html` and never commit `.env` to GitHub.**

## 3) Run
```bash
npm start
```

Open:
http://localhost:3000

## 4) Test
Open:
http://localhost:3000/api/health

You should see `aiConfigured: true`.

## 5) Deploy later
For Render:
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `GEMINI_API_KEY` = your key
- Optional: `GEMINI_MODEL` = `gemini-2.5-flash`

The browser calls `/api/chat`; the server calls Gemini. The API key is never sent to the browser.

Next phase: official Rajasthan education documents + RAG/source citations.
