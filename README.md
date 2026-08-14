# Plainly

Speak messy, read clean — a voice dictation cleanup prototype.

`index.html` is the static frontend. `api/polish.js` is a Vercel serverless
function that proxies the "Polish my words" request to the Anthropic API, so
the API key never reaches the browser.

## Deploy on Vercel

1. Import this repo into Vercel (zero config needed — it auto-detects the
   static `index.html` and the `api/` function).
2. In the Vercel project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
3. Deploy. The frontend calls `/api/polish`, which Vercel routes to
   `api/polish.js`.

## Local development

```bash
npm i -g vercel
cp .env.example .env
# fill in ANTHROPIC_API_KEY in .env
vercel dev
```

This serves `index.html` and `api/polish.js` together on localhost, matching
production routing.
