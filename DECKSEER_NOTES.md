# Deckseer: handoff notes

*Deckseer was called **Cardsight** until Nov 2026; it was renamed because another site uses that name. Internal storage names (`bsw-…` keys, the IndexedDB `binder-scanner`, the backup's `app: "binder-scanner"`) were deliberately left unchanged, so data and old backups carry over. AI files named `cardsight-…` are still accepted.*

Read this first. It explains what Deckseer is, how the code is laid out, what was decided along the way, and what comes next. Keep it next to `deckseer.html` and update it when something important changes.

## Files

| File | What it is |
|---|---|
| `deckseer.html` | the whole app |
| `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` | the installable app (PWA) for GitHub Pages; harmless when opening the HTML from disk |
| `tests/` | the Playwright test suite (`npm test`), see `tests/README.md` |
| `stage2/` | the Stage 2 index builder: `build_index.py` and the Colab notebook |

## What Deckseer is

A Magic: The Gathering app for the owner's PC, built as **one self-contained HTML file** (`deckseer.html`, about 960 KB, about 10,000 lines of inline JS and CSS). It is opened straight from disk (`file://`) in Chrome or Edge. There is no build step and no server. Everything the user owns is saved in their browser.

The goal is to be a **one-stop app**: scanning, collection, deck building, deck analysis, playtesting, card search, wishlist and game tracking.

## Pages (top tabs)

1. **Scanner**: webcam card scanner, a "This session" list, the export bar, and scan options:
   - Set lock, condition, foil, sleeved cards
   - Low light (Auto / On / Off), 💡 Screen light
   - Learning from your scans, Picture library, Ask Claude about hard cards
2. **Collection**: sub-tabs **My cards** (table, filters, big card viewer, find combos, export/backup/restore) and **Wishlist** (price alerts).
3. **Deck builder**: deck picker, deck header (Playtest, Scan cards into this deck), then deck sub-tabs:
   - **Cards**: pictures, stacks, text or table view; Edit, **Replace**, **+ Add a card**
   - **Deck check**: Mana base, Bracket, Price, Upgrades
   - **Test & fastest win**: the simulator vs bracket opponents, and the Fastest possible win finder
   - **Combos**: Commander Spellbook data
   - **Export**: send to Moxfield, Archidekt and others
4. **Card search**: all of Magic via the Scryfall search API. Results go to the collection, a deck or the wishlist.
5. **Game**: life tracker for 2–6 players (commander damage, poison, monarch, initiative, dice, turn timer), plus results and real win rates per deck.

**Playtest** is a full-screen overlay (`#pt`) opened from a deck. It has a rules engine built from the Comprehensive Rules (effective Sept 25, 2026).

## External services and libraries

- **Scryfall API**: card data, prices, images, search. The `sf()` helper queues requests about 110 ms apart.
- **OpenCV.js 4.10**: finds and straightens the card in the webcam picture. Loads from docs.opencv.org, falling back to jsdelivr.
- **Tesseract.js 5.1.1**: OCR for the name and collector line.
- **onnxruntime-web 1.20.1**: already loaded for the optional "improved text reader" (PaddleOCR). Reuse it for Stage 2.
- **Commander Spellbook**: combo database (about 30 MB, downloaded once, compact copy kept in IndexedDB).

## Where data lives

**localStorage** (`store.get/set`):

| Key | Contents |
|---|---|
| `bsw-coll` | collection |
| `bsw-decks` | decks; a deck can also hold `fwType` (chosen creature type) and `keep` (cards never suggested as cuts) |
| `bsw-prefs` | preferences: page, tabs, scan options and so on |
| `bsw-sess` | the current scan session |
| `bsw-hist` | collection value history |
| `bsw-wish` | wishlist |
| `bsw-game` | the current game |
| `bsw-games` | finished game results |
| `bsw-gsetup` | game setup |
| `bsw-gc` | cached Game Changers list (refreshed every 14 days) |
| `bsw-names` | card name list |

**IndexedDB** `binder-scanner`, stores `kv`, `vecs`, `lib` (`kv` also holds `undoRestore`, the state before the last Restore):

- `vecs`:
  - `v2|<imageUrl>`: fingerprints of reference images
  - `learn2|<printingId>`: last learned look
  - `mem|<printingId>|<slot>`: Stage 1 scan memory, up to 3 looks per printing
- `kv`:
  - `memMeta`: name, set, number, img, time and count per learned printing
  - combo data and combo descriptions
- `lib`: the optional Picture library (compact fingerprints of every card's artwork)

Moving to a new origin (for example a hosted PWA) starts with empty storage. The user moves data across with **Backup** in the old version and **Restore** in the new one.

**Backup (version 4)** saves everything that belongs to the user: collection, lists, value history, decks, scan session, wishlist, game results, the current game, game setup, preferences (with the camera choice blanked, since it's per PC) and the scan memory (`memMeta` plus the `mem|` and `learn2|` fingerprints, as base64 Float32). It leaves out what can be downloaded again: `bsw-names`, `bsw-gc`, the reference fingerprints `v2|`, the Picture library, combo data and the PaddleOCR model. The version-3 fields stay at the top level, so older copies of Deckseer can still read a new backup.

**Restore** writes the backup into storage and reloads the page. It keeps this PC's camera. Before writing, it saves the current state to `kv/undoRestore`, and the toast after the reload offers **Undo**. Version-3 backups still restore and leave the wishlist, games and scan memory alone. Code: `buildBackup`, `applyBackup`, `memDump`, `memLoad`, `undoRestore`. **When adding a new `bsw-` key, add it to `BACKUP_KEYS`, `buildBackup` and `applyBackup`.**

## How the scanner works

1. **Find**: `findCard()` uses OpenCV contours to find a card-shaped quad. `warpCard()` straightens it to 716×1000.
2. **Capture**: `grab()` picks one of three ways:
   - plain `capture()`
   - `captureSleeved()` (several frames merged to remove glare, then the card is found inside the sleeve)
   - `captureStacked(5)` in low light (averages frames to cut grain)
3. **Read**: `grabZone()` crops the name strip and collector line, converts to grey, stretches contrast and inverts light-on-dark text. In low light it also denoises. `readName()` runs Tesseract (plus PaddleOCR when loaded). Both ends of the card are read in case it is upside down.
4. **Match**: `matchName()` matches against all card names. The picture fingerprint is `fingerprint()`, compared with `simScore()`: a z-normalised colour layout of the whole card plus the art, weighted 0.6 to the art. `frameWindows()` makes several crops of each capture.
5. **Printing**: `pickPrinting()` uses the collector line, Set lock, picture match, and the scan memory.
6. **Fallbacks**: Set lock picture match (`visualMatch`), Picture library (`libraryMatch`), Ask Claude.
7. **Stage 1 memory (done)**: `learnLook()` runs on every confirmed add. It is only kept when the photo matches Scryfall's image with `simScore` > 0.45. `memoryMatch(wins)` is used in `scan()`:
   - instant match at score ≥ 0.86 with a margin ≥ 0.10
   - a card whose name couldn't be read at ≥ 0.72 / 0.07
   - overriding a misread name at ≥ 0.80 / 0.10
   - confirming the name and choosing the printing when the collector line can't decide

   These thresholds were set on synthetic tests only. **Verify them with real webcam scans.**
8. **Low light**: `trackLum()` sets auto mode (on below average brightness 70, off above 95). `lowLightCamera()` raises exposure and brightness when the webcam allows it. The screen light is `body.lit` (`#cam` gets a huge white box-shadow).

## The Fastest possible win finder (deck builder)

- **Card reading**: `fwCard()` reads each card. It runs `fwRules()`, which reuses the playtester's reader (`trAbilities`, `trActivated`, `trActions`) for triggers and activated abilities, plus finder-specific regexes for: reducers, extra land drops, looting, grants, evoke, cascade, Kindred Summons, Yarok and Twinflame doubling, Mirkwood Bats, and modal spells.
- **Search**: `fwSearch(plan, pool, cmds, o)` is a beam search over turns with a depth-first search of plays inside each turn.
  - Mana is a list of tagged units:
    - `G#12`: land or rock 12
    - `G@12`: creature 12
    - `WUBRG~T`: Treasure
    - `R~=Name`: floating mana from a spell or trigger
    - `X!elemental`: restricted mana
  - Paying is done by `fwPay()` using bipartite matching.
- **Plans**: damage, plus each winning combo from Commander Spellbook. These come from `fwPlans(d)`.
- **Mana rules worth knowing**:
  - Arcane Signet, Command Tower and Path of Ancestry make only the commander's colours (`FW_CI` from `fwIdentity(d)`). With a colourless commander they make nothing; in a deck without a commander they make any colour.
  - Restricted mana units can carry extra tags: `?C` is what the source makes for any other spell (Cavern of Souls), and `$` means the spell it pays for can't be countered. `fwOnly(u)` reads the spell type. Cards that say "This spell can't be countered" get `f.noCounter`. Both are honoured by `oppCounter`.
  - **Convoke** (`f.convoke`): each untapped creature without a mana ability, summoning sick or not, adds a unit `<colours>^<id>` (`N` for colourless, which pays generic only). Every convoke spell is offered twice, without convoke and with creatures tapped first (`fwPay(..., convokeFirst)`), and the search picks the better one. Tapped creatures can't attack. The turn table shows "convoke" and "Also: convoke: tap …".
- **Options** (`o`):
  - `lib`: a shuffled library, for realistic games
  - `oppRemoval` / `oppCounter`: an opponent that answers once
  - `bonusMana`, `anyColor`, `allHaste`, `bonusCard`: what-if settings for "What would make it faster"
- **Display**: `renderFast()` and `fwTurnHtml()` show turn-by-turn tables with what to tap. "How the finder reads each card" (`fwDescribe`, `fwAuditHtml`) has **Copy as text**. Use that report to find cards the finder misreads; the user's Ashling Elementals deck was audited this way.

## The 3,000-game deck test (`simulateDeck`)

Plays your deck against a model opponent for the chosen bracket and style (`BRACKETS`, `STYLES`). Since Nov 2026 your own cards are read twice. `cardRole` gives each card's rough job (mana, draw, power, removal, wipe). `fwCard`, the fastest-win reader, gives its rules:
- triggers (`etb` including landfall, `cast`, `sac`, `dies`), using the same matching rules as the finder (`who`: self/other/selfOrOther/any, `nontoken`)
- trigger effects: draw, damage, Risen Reef's `topif`, land search, tokens (including "one per land"), +1/+1 counters, and token **copies**
- evoke, its own or granted (**Ashling**: Elementals for {4}); the sacrifice triggers Ashling's hasty copy, which is kept at the end step by paying {W}{U}{B}{R}{G} when 5 mana is left and you have 5 or more lands (colours aren't tracked), otherwise sacrificed
- Yarok and Twinflame doublers, cost reducers, extra land drops, cascade, haste-granting

Evoke is chosen when the card can't be hardcast and has an enter value or a copier is out, or when evoke plus keeping the copy fits (5 mana is held back for that). Activated abilities (Ashnod's Altar and the like) and colours are **not** modelled. The results panel shows evokes, copies and kept copies per game. Test: `tests/sim.test.js`. An Ashling test deck wins 267 of 600 games with her abilities read, 182 without.

The fastest-win finder now also keeps a delayed-sacrifice copy when the leftover mana pays its cost (`keepCost` on the permanent, paid with `fwPay` at the end step).

## Deck check

- **Mana base**: `dcMana()` with hypergeometric odds.
- **Bracket**: `dcBracket()`, using Scryfall's `is:gamechanger` list with a built-in fallback.
- **Price**: `dcPrice()`.
- **Upgrades**:
  - `dcAnalyze()` gives each card roles and targets (`DC_ROLES`, `DC_TARGETS`) and a synergy score (`dcLinks`).
  - `dcCuts2()` finds cut candidates. Cards are never cut while their role is at or under its target, nor combo pieces, the commander or "keep" cards.
  - `dcCandidates()` finds upgrades from the collection plus an optional Scryfall search.
  - `dcTestSwaps()` runs paired A/B tests. The cut card is forced into the first 10 cards, and the simulator runs with the same random seed for both versions.

## Testing

- `tests/` has a Playwright suite (`npm test`, 61 checks). It covers backup and restore, the PWA (offline, served by a local server), the finder's mana rules and convoke, and every page opening without errors. The network is blocked, so Scryfall and the CDNs are mocked or fail. See `tests/README.md`. Add a test with each new feature.
- The scanner has still never been tested end to end with real OCR and OpenCV. **On a PC with internet, do a real scan test first**: real cards, the webcam, good and dim light, sleeved and unsleeved.

## Working style the user prefers

- Plain-language explanations. Short summaries of what changed and how to use it.
- The user plays Commander. Their main deck is **Ashling, the Limitless** Elementals (Risen Reef, Yarok, Twinflame Travelers, Omnath ×2, Maelstrom Wanderer, Avenger of Zendikar, Ashnod's Altar, and others).
- Accuracy to the real Magic rules matters a lot. When a card is misread, fix the reader in general, not just that one card.
- Keep the UI organised. Things were split into tabs because it felt crowded; don't cram new features onto one page.
- PC is the main target.

## Installable app (PWA): how to put it online

Done in code (`manifest.webmanifest`, `sw.js`, `icons/`, `index.html` → `deckseer.html`, and in the app a registration that runs only on http(s), an **Install app** button next to Backup and a "new version ready, Reload" toast). Steps for the user:

1. Create a GitHub repository (for example `deckseer`) and upload everything in this folder. `tests/`, `stage2/` and `package.json` can go too; they do no harm.
2. In the repository, go to **Settings → Pages**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, then Save. After a minute the site is at `https://<username>.github.io/deckseer/`.
3. In the **old** copy (the file on the PC): **Backup**. Open the site in Chrome or Edge, click **Install app** (or the install icon in the address bar), then **Restore** the backup.

How offline works: the app page is network-first, so a new `deckseer.html` shows up as soon as you're online. Libraries (OpenCV, Tesseract and its language data, fonts) are cached the first time they load. Scryfall card pictures are cached up to 4,000. Scryfall searches and prices and Commander Spellbook are never cached by the service worker (the app keeps its own copies). **Bump `VERSION` in `sw.js` when changing the shell file list or caching rules**; that's what triggers the "new version" toast.

## Stage 2: AI picture recognition (built, run and wired in)

`stage2/build_index.py` (also embedded in `stage2/Deckseer_Stage2_Index.ipynb` for Colab) does this:

- downloads Scryfall's `default_cards` bulk data and every paper printing's `normal` image, both faces of double-faced cards, cached and resumable
- runs ImageNet MobileNetV3-Large (timm `mobilenetv3_large_100`, 1280 features), applies PCA to 256 numbers, L2-normalises and stores int8 (`deckseer-index.bin`, rows × 256) with `deckseer-index.json` (ids, names, set, number, face, `int8_scale`, preprocessing)
- exports `deckseer-embed.onnx` **with the PCA and normalising built in**, so the browser only prepares the picture and compares
- runs a self-check: distorted pictures (tilt, blur, dim light and grain, glare, sleeve haze) searched against the index, reporting top-1, top-5 and right-name rates to `selfcheck.txt`

**Preprocessing the app must match:** take the warped 716×1000 card, resize it bilinearly to 224×312 RGB, divide by 255, normalise with the ImageNet mean and std, and pass it as NCHW float32 input `image` to get output `fingerprint`. The score is `dot(int8 row, fingerprint) / int8_scale`.

**The real run (Nov 2026, Colab):** 102,926 English paper card faces, `mobilenetv3_large_100`, 256 dims. The ONNX file matched the model (largest difference 0.000001). Self-check on 500 distorted pictures, searching all faces: right printing first **52.4%**, right printing in top 5 **70.0%**, right card name first **69.8%**. File sizes: model 18.1 MB, index 26.4 MB, json 6.7 MB. The user has these files (not in this folder).

Lessons from running it on Colab (all fixed in the script): Scryfall's bulk-data entry no longer has `download_uri` where expected, and the file is one card per line; newer PyTorch needs `onnx`/`onnxscript` to save the model; Google Drive times out on a folder of 100k files (keep `--cache` on Colab's own disk, `/content/deckseer-cache`); free Drive space is too small. The script now saves fingerprints to the cache (`fingerprints-<hash>.npy`) and checks packages before the long run.

**In the app** (search `AI picture recognition (Stage 2)`):
- **Files:** Scanner options → *AI picture recognition*. On a website the three files are fetched from next to `deckseer.html`; opened from a file, the user picks them with **Load files**. Either way they're kept in IndexedDB `kv` as `ai:model`, `ai:index` and `ai:meta`, and are not in Backup. `sw.js` doesn't cache them.
- **Code:** `aiInit`, `aiMatch(cap)` (runs on the card both ways up, one pass over the int8 index, about 0.13 s for 102,926 rows plus the model), `aiScorePrints(ai, prints)`, `presentFromAi`, `sameCard` (case- and accent-blind, either face of a two-faced card). It reuses onnxruntime-web from `PADDLE.ort`.
- **Where it's used in `scan()`:** it starts alongside the text readers.
  1. Name unreadable: after scan memory and Set lock, before the Picture library. It shows the AI's best card, **never added without the user's OK**, with its next names under "Not it?".
  2. Doubtful name: if the AI's best name is the same card, the name counts as confirmed (`picAgrees`). If the AI is sure of a different card that isn't in its top 3, it overrides, with the read name kept as an alternative.
  3. Printing (`pickPrinting(..., ai)`): it scores every printing at once with no downloads. Sure if ahead by `AI_PRINT_MARGIN`; otherwise the old picture match runs, and the AI's pick is used if that isn't confident.
- **Thresholds** `AI_MIN` 0.45, `AI_SURE` 0.75, `AI_MARGIN` 0.08, `AI_PRINT_MARGIN` 0.05 are **guesses**: the real files weren't available in the cloud workspace. Check them with real scans; log `aiMatch` results (best.s, margin) for right and wrong cards and set them from that.
- **Tests:** `tests/ai.test.js` uses a tiny stand-in model in the same format (`tests/fixtures/ai`).

## What's next

1. **Real-world check of Stage 1**: scan the same cards twice in different light and confirm memory matches. Tune the thresholds if cards are mixed up.
2. **Stage 2: AI picture fingerprint.** Done and wired in (see above). Next: load the real files, scan real cards, tune the `AI_*` thresholds, and decide whether AI-only matches may be added automatically once proven.
3. **Stage 3: fine-tune a Magic-specific model.** Baseline to beat: 69.8% right name first / 52.4% right printing first on the self-check. Use metric learning with heavy augmentation (glare, blur, tilt, sleeves, low light) on a Colab GPU, then export to ONNX.
4. **Installable app (PWA)**: built and tested (see above). The user still has to create the GitHub repository and turn on Pages. An .exe (Tauri) may come later.
5. **Ideas not yet built**:
   - sync between PC and phone
   - trade binder and trade calculator
   - card locations (binder, box, deck)
   - set completion
   - new-set watch
   - a rules search box
   - (done: convoke in the finder; Arcane Signet and Command Tower limited to the commander's colours; Cavern of Souls keeps {C} for other spells and makes the chosen type uncounterable. The creature type comes from the deck's "choose a creature type" setting in the card report, or the most common type.)
   - convoke in the playtester's rules engine (not checked yet)
