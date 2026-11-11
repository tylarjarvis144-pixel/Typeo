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

## Dig-Safe Dispatch (`/dispatch`)

`dispatch/index.html` is a standalone job dispatch app (no backend; data is
saved in the browser's localStorage, with JSON export/import). Any job marked
as involving excavation **cannot be started** until its Dial Before You Dig
plan is complete:

1. **Locate request** – ticket number, date requested, and dig area. The
   earliest legal dig date (default +2 business days) and ticket expiry
   (default 28 days) are calculated automatically and can be overridden.
2. **Utility responses & plans** – every utility must be Marked or Clear (a
   Conflict needs notes on how it will be managed), and at least one Dial
   Before You Dig plan/map for the site (PDF or photo) must be attached. Each
   file can be tagged to the utility it came from. Attachments are stored in
   the browser's IndexedDB and are included in Export/Import. Step 1 also
   links to the locate enquiry website (set in Settings) and opens the site
   address in Google Maps.
3. **Safe-dig checklist** – white-lining, marks verified, plans on site,
   hand-dig in tolerance zone, potholing, crew briefing, emergency plan.
4. **Supervisor sign-off** – editing the plan afterwards clears the sign-off.

The **Start job** button stays disabled and lists exactly what is missing until
all four steps pass. Wait/validity periods, crews and default utilities are
editable under **Settings** to match your local rules. On Vercel it is served
at `/dispatch`.
