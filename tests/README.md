# Deckseer tests

Headless Chrome opens `deckseer.html` with the internet blocked (Scryfall and the CDNs are mocked or fail), and checks:

| File | What it checks |
|---|---|
| `backup.test.js` | Backup saves everything (collection, decks, wishlist, games, game setup, session, preferences, scan memory); Restore brings it back; Undo; old backups still work; wrong files are refused |
| `pwa.test.js` | Served from a web address: manifest, icons, service worker, works offline; opened from a file: nothing breaks |
| `finder.test.js` | Fastest-win finder: Arcane Signet / Command Tower, Cavern of Souls, "can't be countered", convoke |
| `ai.test.js` | AI picture recognition with a tiny stand-in model in the real file format (`fixtures/ai`, made by `fixtures/make_ai_fixture.py`): files found on a website or picked from disk, kept in the browser, a card recognised (also upside down), the printing chosen, an AI-only match waits for your OK, wrong files refused |
| `pages.test.js` | Every page and deck section opens without errors; a full fastest-win run on a test deck |

On a PC (once): install Node.js, then in this folder `npm install` (this also fetches onnxruntime-web for the AI test) and `npx playwright install chromium`.

Run all: `npm test`. Run one file: `node tests/run.js finder`.
