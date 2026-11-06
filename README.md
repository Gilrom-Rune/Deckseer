# Deckseer

*(formerly Cardsight)*

A Magic: The Gathering app that runs in your browser: webcam card scanner, collection, deck builder, deck analysis, playtester with a rules engine, card search, wishlist and game tracker.

**Open it:** https://gilrom-rune.github.io/Deckseer/ (Chrome or Edge), then click **Install app** next to Backup to get it as a program with its own icon.

Everything you own (collection, decks, games) is saved in your browser on your own computer. Use **Backup** now and then.

## What's here

| | |
|---|---|
| `deckseer.html` | the whole app, one file |
| `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` | makes it installable and work offline |
| `DECKSEER_NOTES.md` | how it all works, decisions made, and what's next |
| `tests/` | automated tests (`npm install`, then `npm test`) |
| `stage2/` | the notebook that builds the AI picture recognition files |

## AI picture recognition (optional)

The Stage 2 notebook makes `deckseer-embed.onnx`, `deckseer-index.bin` and `deckseer-index.json` (about 50 MB). Upload them next to `deckseer.html` and the scanner finds them on its own. Or keep them off GitHub and load them in the app: Scanner options → AI picture recognition → Load files.

---

Deckseer is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Magic: The Gathering is a trademark of Wizards of the Coast. Card data and images from Scryfall; Deckseer is not affiliated with Scryfall.
