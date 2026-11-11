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

## Phones and tablets

Installed from the website on Android (Chrome, Install app) or iPhone (Safari, Add to Home Screen). At 700px wide or less:
- the page tabs become a **bottom bar** (icon from `data-ic`, short label from `data-short`; the full label `.tl` and counts are hidden), and the toast and guide sit above it
- the header is compact
- `.dc-table` and `.sim-table` scroll inside themselves (the mana table used to push the page sideways)
- the playtest stacks top to bottom (piles, table, hand), and a command-zone card keeps a card's shape
- `(pointer:coarse)` gives larger tap targets

Camera: `isPhone()` (coarse pointer and no fine pointer) asks for `facingMode: environment` unless a camera was chosen. `torchSetup` shows **🔦 Flashlight** when `getCapabilities().torch` (Android Chrome; iPhone has no torch control) and hides the screen light for a back camera. `sound()` also vibrates on phones. Tests: `tests/phone.test.js` (Pixel 7 emulation with a stand-in camera) and a PC run to check nothing changes there.

## The step-by-step guide

The **📖 Guide** button in the header, "How to use Deckseer", and the welcome box all open `#tour`, a side panel. (Note: `#guide` is the camera's outline box, so don't reuse that id.) Content lives in `GUIDE`: chapters of steps `{h, b, go: {page, ctab, dtab, el, needDeck}}`. **Show me** (`guideShow`) switches page and tab, opens any `<details>` around the target, scrolls to it and makes it glow (`.guide-hl`). Progress is kept in `prefs.guide`. `tests/guide.test.js` walks every step and checks every target exists, so **add or update a guide step whenever a feature or button changes**.

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

Plays your deck against a model opponent: a bracket or speed (`BRACKETS`, `SPEEDS`) with a style (`STYLES`), or **your table** (see below). Your own cards are read twice. `cardRole` gives each card's rough job. `fwCard`, the fastest-win reader, gives its rules, and since Nov 2026 the test uses:
- **Mana with colours:** every land, rock and dork adds its real units (`f.units`, `f.rock`, `f.dork`, restricted mana, Arcane Signet limited to your commander's colours), and costs are paid with `fwPay`, so the wrong colours stop you. **Lands that enter tapped** arrive a turn late. Land searches fetch the basic of a colour the deck needs (`basicFor`). Results show "wrong colours" turns and the number of tapped lands.
- **Triggers:** enters (including landfall), cast, sacrifice and dies, with the finder's matching rules. Effects covered: draw, damage, Risen Reef's top card, land search, tokens, +1/+1 counters, token copies.
- **Evoke**, its own or granted (Ashling's {4}), and **Ashling's copy**, kept at the end step only if `{W}{U}{B}{R}{G}` can really be paid (colours checked). The test holds that mana back when it plans to keep one.
- **Sacrifice outlets** (Ashnod's Altar, Phyrexian Altar: `outlet` on the card). An evoked creature is sacrificed to the outlet for mana, and in a **second main phase** after combat, copies that can't be kept are sacrificed to it, with the mana spent. An outlet counts as a strong play while a sacrifice payoff or evoke-granter is out. It isn't a mana rock (`cardRole` would think so).
- **Activated abilities** without sacrifice costs (`acts`: draw, token, damage, counters, land search), used once each per turn with leftover mana.
- **Turn order:** a landfall creature is cast before the land drop when it can be. A tapped land is played on turns its mana isn't needed.
- Yarok and Twinflame doublers, cost reducers, extra land drops, cascade and granted haste.
- **Combat** (`combat`): the opponent has creatures (`oppBoard`). A bracket opponent gets random ones that grow with the turn; a saved-deck opponent uses its real creatures, only once it could have cast them. They block: a block that kills and survives, a trade against power 3+, and a chump when the damage would be lethal, the attacker has power 6+, or commander damage would reach 21. Covered: flying (only fliers and reach block it), menace, "can't be blocked", trample, deathtouch, double strike, infect (poison wins) and **commander damage** (21 wins). Blocked creatures can die, which fires their dies triggers. Your removal kills their best blocker half the time; wipes clear both boards.
- **Resources:** Treasures are kept between turns as any-colour mana. Clues are cracked for {2} when your hand is low. Food and similar tokens are ignored. "X" tokens count as 2.
- **Tutors** (`tutor`: into hand, on top, or onto the battlefield) and **graveyard recursion** (`regrow`, `reanimate`, Eternal Witness's `fromGrave`) pick the card worth most to the deck (`worth`). The graveyard holds nontoken permanents that died and resolved spells.

**One of your decks as the opponent** (`deckOpponent`, option `deck:<id>`): its unopposed win turn (300 games), its removal and wipe density as interaction chances, and its creatures as blockers. Cached per deck version. It's a model built from that deck, not a turn-by-turn game of both decks.

**Your table** (`tableGames`, `calibrateTable`, `d.simCal`): with 5 or more logged games for the deck in the Game tab, the opponent is tuned so the test wins as often as you really do. The game-length turn comes from your games, and the opponent's speed shift is found by bisection (8 × 500 seeded games). The tuning is stored on the deck and redone only when new games are logged or the style changes, so later tests and the Upgrades swap tests all use the same opponent.

**Still not modelled:** multiplayer politics (by choice), the opponent attacking you with its creatures (its win turn stands in for that), your creatures staying back to block, first strike, and both decks playing every card turn by turn. A full run takes about 2.5 s. Tests: `tests/sim.test.js`, `tests/sim2.test.js`, `tests/sim3.test.js`.

The fastest-win finder also keeps a delayed-sacrifice copy when the leftover mana pays its cost (`keepCost`).

### The page stays responsive while searching

`fwSearchGen` is a generator: `dfs` yields when `o._yieldAt` has passed. `fwSearch` runs it all at once (tests, small jobs). `fwSearchAsync` runs it in slices of about 20 ms with a `setTimeout` break between them. `fastestWin`, `fwRealistic` and the Upgrades swap tests (`dcTestSwaps`) use the async version, so the page answers taps while they run. On a 4× slowed phone the longest pause is about 70 ms (it was 0.5 s or more per plan, and much longer on big decks).

**■ Stop** (`fwState.stop`, passed as `opts.stopped`) ends the search within a slice and keeps the best win found so far (`res.stopped`). Phones (`isPhone()`) get shorter limits: 2.5 s per plan, a 6 s deep check, and 30 s for Search harder. Test: `tests/responsive.test.js`.

### Deep check: looking for the fastest win, not just a win

The quick search (`fwSearch` defaults) uses rules of thumb:
- about 11 options per step (`choices`), at most 12 plays a turn
- the 120 best positions kept per turn (`BEAM`)
- greedy land drops
- abilities only when they look useful

It stops at the first win. **Every "Find the fastest win" now adds a deep check** (`fastestWin(d, cb, {deep: true, budget})`). From the best turn T it searches every plan again with `maxT = T-1`, then T-2… with `o.deep`:
- every castable card and every payable ability are options
- every kind of land is tried as the land drop (`s0land`)
- up to 40 plays a turn
- `beam`/`wide` raised (500/26 by default; "🔎 Search harder" uses 1500/40 and a 60 s budget)
- up to 40 combo plans

The search records what limited it (`o._cut` time, `_depthCut`, `_wideCut`, `_beamCut`). The panel says **"every possible line"** only when nothing was cut. Otherwise it says "searched hard … not every possible line could be checked", or that it ran out of time. On the Ashling test deck it finds a legal turn-2 win (the quick search found turn 3), and turn 1 is checked exhaustively. Test: `tests/fastest.test.js`.

### Finder fixes from a real Ashling game (Nov 2026)

The user's turn table showed impossible plays. Found and fixed:
- **Leaked mana between options.** Cascade candidates (and some other choices) shared the parent's `s.mana` array. When one option's effect pushed mana into it (a land fetched by Cavalier of Thorns), the others saw it too: phantom mana appeared as "a mana source". That's how Kindred Summons was "paid" with nothing. `play`, `activate` and Clues now copy `after` (`after.slice()`).
- **Token copies lost always-on abilities.** A copy (Ashling) now starts from the full card (`byName`) and registers haste-granting (Maelstrom Wanderer: all creatures haste), anthems, mana abilities, legend colours and artifacts. Doublers (Yarok, Twinflame) come through `arrive`.
- **A real graveyard.** `n.gy` lists the cards there (sacrificed or evoked nontoken permanents, resolved or countered spells), and `n.back` lists cards returned to hand. Greenwarden (`fromGrave`) returns the best real card (`bestFromGy`), not any card you like. That includes the evoked original Greenwarden via its Ashling copy, a real loop.
- **Impulsivity-style** "cast target instant or sorcery card from a graveyard without paying its mana cost" (`castGy`) queues a free cast (`casc` entry with `gy`) and exiles the card.
- **Kindred Summons:** today's Oracle wording ("…of the chosen type") is read as well as the old one.
- **Turn table order:** an activated ability's line comes before the triggers its costs set off.

- **Flamekin Harbinger** ("search … then shuffle and put that card on top"): `tutorTop` keeps the searched type (`ph`). Each trigger shuffles first, so a second trigger (Yarok, Twinflame, an Ashling copy) replaces the first card: **only one card is ever on top**, and the turn table says so. In realistic games (`o.lib`), `n.topCard` is the best fitting card still in the library: it becomes the next draw, or goes to hand when Risen Reef looks at it (via `n.back`). In best-case mode there's still no extra card.
- **Risen Reef in realistic games** reads the real next card (`o.lib[n.slots]`): a land goes onto the battlefield tapped, anything else to hand. Best-case mode still picks the best top card, by design.

Tests: `tests/interactions.test.js` with real Oracle text in `tests/fixtures/ashling-cards.js`. Add cards from the user's deck there as new interactions come up. Known simplifications left: Cavalier of Thorns' land comes out as a basic of a needed colour ("Wastes" if none), and the other four revealed cards aren't put in the graveyard.

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

## Releasing an update (it's live)

The app is live at **https://gilrom-rune.github.io/Deckseer/** (GitHub Pages from `main`, repository `Gilrom-Rune/Deckseer`, public, PolyForm Noncommercial license). Everyone using it from there gets updates automatically. To release:

1. `node tools/bump-version.js`: sets `APP_VERSION` in `deckseer.html` and `version.json` (date plus counter). `tests/version.test.js` fails if they differ.
2. `npm test`: every check must pass. An update reaches every user at once.
3. Commit and push to `main`. Pages redeploys in about a minute.

How it reaches people: `sw.js` fetches the page with `cache: "no-cache"`, so it revalidates instead of waiting out the 10-minute browser and CDN cache. An open app fetches `version.json` (no-store) at start, every 10 minutes and on window focus. If it differs from `APP_VERSION`, the toast "A new version of Deckseer is ready (…) → Reload" stays until clicked. Bump `VERSION` in `sw.js` only when the offline helper itself changes.

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

## Start-up downloads popup (2026.11.08.8)
- `#setupDlg` (a modal `<dialog>`) opens on first start (`prefs.seenSetup`), after `lib.loaded` and once the AI has finished loading; skipped if both are already ready. The **⬇ Downloads** button in the header (`#setupOpen`) reopens it.
- **Card pictures:** scope select + button that drive the existing Picture library (`#libScope`, `#libBuild`), so pause/resume work the same. Status mirrors `#libState`.
- **AI:** the files can't be downloaded for people (they aren't on the site), so it shows the four steps, a link that opens `stage2/Deckseer_Stage2_Index.ipynb` straight in Google Colab, **Load the files** (same `aiLoadPicked`), and **Show me how** (opens the guide's AI chapter).
- `libStatus` and `aiStatus` are wrapped to call `setupRender()` so the popup updates live.
- Not shown under test automation (`navigator.webdriver`) unless `window.DECKSEER_SETUP` is set; tests/setup.test.js does that.

## Playtest: mana, opponents and combat (2026.11.08.9)
- **Paying mana** (`ptCastPaid`, on by default; ⋯ → Settings "Pay mana automatically", `prefs.ptAutoMana`). Clicking a card in hand or the command zone, or a cast way from the card menu (evoke etc.), works out the cost (`ptCastCost`: way cost, commander tax), asks for X (`ptAskX`, defaults to the most you can pay), plans the payment (`ptPlan`) and taps it (`ptApplyPlan`).
  - Units: a mana unit is a list of ways to spend it `[{c, pain, only}]`. `ptManaSource` reads mana abilities via `trActivated` (basic land types for basics), merging one-unit abilities (Brushland = C/G/W with pain on G and W). Signets (mana in the cost) and sacrifice sources are used last; Treasures are sacrificed.
  - `ptPlan` pays colored pips first (fewest options first, depth-first with backtracking), then generic from the cheapest; it handles hybrid, phyrexian (2 life), {2/W}, "spend only on creature spells", and convoke. Leftover mana from multi-mana sources (Sol Ring) floats into `PT.pool`.
  - `PT.pool` gets mana from rituals (`case "mana"`), activated mana abilities, and lands tapped by hand (`ptTapPick`; untapping takes it back). It empties at the end step (`ptEmptyPool`).
  - Hand cards you can afford get `.can-cast` (gold glow). A second land in a turn asks first (`ptLandDrops` counts "play an additional land").
- **Opponents** (`PT.opps`, `PT.oppT` = the one you aim at; `prefs.ptOppN`, 3 in Commander). Each has life, poison, `cmd` (damage per commander uid), `board` (creatures that can block, `ptOppCre`), `out`, and `mode` (hand / typical / a deck id; `ptOppGrow` runs each Next turn). `ptHitOpp(n, why, who)` takes "each", an index, or nothing (the aimed one). Effects parsed with "each opponent" carry `each`; drains gain `PT.lastLost`. `ptOppsCheck` knocks opponents out (0 life, 10 poison, 21 commander) and sets `PT.won` when all are out. The strip is `#ptOpps` (`ptOppsHtml`, `ptOppClick`).
- **Combat**: the attack window picks who each attacker attacks (`PT.atkOpp`). Then `ptBlocksOrDamage` → `ptAutoBlocks` (good blocks, chump blocks only when the damage is lethal, then safe blocks and fair trades) → the Blocks window (`ptRenderBlocks`, change blocks by clicking) → `ptCombatDamage(blocks)`: first-strike and regular steps, trample, deathtouch, lifelink, indestructible, menace, infect/toxic, commander damage. `ptCanBlock` covers flying/reach, unblockable, shadow, skulk, power limits, protection from colours, fear and intimidate.
- **Card fixes**: library searches read what to find and where it goes (`trSearch`): only matching cards are shown, and "on top" cards wait until after the shuffle (`ptSearchDone`); this fixes Flamekin Harbinger. Risen Reef's "you may put it into your hand" is now read. A duplicate log line for "+1/+1 counter on each" is gone.
- Tests: `tests/playtest.test.js` (36 checks).

## Every card in the Playtest (2026.11.08.10)
- **Test corpus**: `tools/forge-cards.js` turns Forge's card scripts (github.com/Card-Forge/forge, `forge-gui/res/cardsfolder`, reachable here through a sparse git clone) into Deckseer card objects: 34,057 cards including split, double-faced, adventure and Alchemy cards. The corpus isn't committed.
- `tools/allcards-check.js <cards.json> [report]` plays every card on a busy table. For each card it: reads it, casts it paying mana, resolves everything with Deckseer choosing, uses its activated abilities and other ways to cast, takes the next turn, attacks and ends the turn. It reports errors, freezes and slow cards (over 3 s). Rendering is skipped during play and done once per card, and timers are flushed per card so errors land on the right card. About 6 minutes for all cards.
- `tools/allcards-coverage.js <cards.json>` reports the share of triggered abilities, activated abilities, modes and instant/sorcery effects the rules engine reads completely (`trCovered`), plus the commonest wording it doesn't, keyed by the exact word that failed.
- `tests/allcards.test.js` runs a 2,000-card sample when `ALL_CARDS` points to a cards file (`ALL_CARDS_N=0` for all of them).
- Fixed from the full run: Phyrexian mana with life in `ptPlan`; endless self-copies (Gruff Triplets "if it isn't a token", Skitterbeam Battalion "if you cast it", `card.wasCast`; Blastoneuron's "copy of it" in its own enter ability); `trFits` now honours "with/without <keyword>", "+1/+1 counter on it" and toughness limits (Wingmantle Chaplain looped).
- Now read and carried out: "choose one —" triggered abilities (modes, `ptPickMode`); Alchemy "A-" names; removal, damage, −N/−N, tap and "can't block" on the opponents' creatures (`ptOppTargets`, `ptHitOppCre`, best threat first, aimed opponent first); sweepers and "each creature" damage on their boards; "each opponent sacrifices a creature"; self moves (`selfMove`: return to hand, sacrifice, exile, top/bottom, shuffle); damage equal to its power (`powDmg`); impulse draw (`impulse`, with a Play button in Exile); "for each opponent, create…"; "you draw a card and gain/lose N life"; "target player gains N life"; counters on "each of up to two target creatures", "another target creature you control", and enchanted or equipped creatures; reveal during a search; counterspells and hand attack marked as nothing to act on.
- Mana pool: `ptPoolHtml` draws coloured mana symbols (split circles for "or", a rainbow for any colour, a gold dot for restricted mana, a pop animation for new mana).

## Playtest cost reductions (2026.11.08.11)
- `ptCastCost` applies `ptCostCuts(spell)` via `ptReduceCost`, after commander tax, so the glow, the payment and the log all use the reduced cost. The log names the cards that reduced it.
- **From your permanents**, read sentence by sentence (lines split before `trLower`):
  - "[types] spells you cast cost {N} less", including the singular "Each creature spell you cast costs…", "the first … each turn", "with mana value N or greater/less", and "for each …".
  - Counting covers counters on the card itself (Animar) and "creature you control with a +1/+1 counter on it" (Hamza).
  - Coloured reductions remove a matching pip (Morophon's {W}{U}{B}{R}{G}); generic reductions never touch coloured pips (Electromancer can't reduce {R}).
- **The chosen type** (Herald's Horn, Urza's Incubator, Morophon): `ptChosenOf(card)` uses `card.chosenType`, else the deck's type (`d.fwType` or `fwDeckType`). Cloud Key's card type defaults to the deck's most common one. Right-click → "Chosen type: … (change)" sets it.
- **The spell's own text**: "This spell costs {N} less to cast for each … / if …", "costs {X} less, where X is…" (Ghalta), and affinity.
- The finder's reducer reader now also takes the singular "spell … costs" wording.
- **Ways to cast** (2026.11.08.12). `ptCastCost(c, zone, way)` follows rules 118.9 and 601.2f:
  - Alternative costs replace the mana cost: evoke (including Ashling's), dash, blitz, flashback, escape, madness, overload, bestow, prototype, disguise and so on. Only the mana part of the way's cost (`ptManaPart`) is paid.
  - Additional costs are added to it (`PT_WAY_ADD`: kicker, multikicker, buyback, entwine, squad, offspring, replicate, jump-start…).
  - Split cards and adventures cost the side you cast. Cascade and casting from exile use the normal cost.
  - Reductions and commander tax apply to all of these, except the ways that aren't casting a spell (`PT_WAY_NOSPELL`: unearth, plot, foretell, suspend).
  - Emerge also subtracts the mana value of the creature `ptEmergeSac` picks, and sacrifices it as part of paying.
- The card menu shows "Evoke {4} → {2}" when reductions change it. Hand cards also glow when only an alternative way (`PT_WAY_GLOW`) is affordable.
- The 3,000-game simulator now reduces evoke costs too (`evokePay` goes through `reduced`). The finder already did.

## Tokens made as cards enter (2026.11.08.13)
Checked with every card whose enter ability creates tokens (848). Cast in Auto mode without automatic choosing, 681 now make their tokens by themselves, up from 569. The rest have an unmet condition ("if you attacked this turn"), X = 0, an optional cost not paid (kicker, offspring, squad, bargain), or a real choice first ("you may sacrifice… if you do").

**Fixed**
- `ptCount` dropped "the" but not "number of", so most "the number of X you control" counts were 0. This affected token counts, sizes, X values and more across the Playtest. New counts: opponents you have, differently named lands, colors among permanents, other creatures named ….
- Fabricate and endure make the tokens (fabricate's Servos, endure's Spirit); you can undo and add counters instead.
- "Create a 0/0 … token. Put N +1/+1 counters on it": the counters follow the token and go on it (`onMade`).
- A card's own "gets +1/+1 for each …" (Urza's Construct), and Equipment "+X/+N where X is / for each …" (`ptAttachBonus`).

**Token reader**
- "a number of … tokens equal to …" (`count`), tokens "named …", named legendary tokens including non-creatures ("Beau, a legendary blue Ox…", Cragflame, The Blackjack), "your choice of a Clue, Food or Treasure" (makes a Treasure), and Role tokens (`role`: the Role's text, attached to your best creature, replacing an older Role).
- The "with …" part is read by `trWithClause`, a linear scanner, after an exponential regex froze on Mechtitan Core. It handles quoted abilities, numbered keywords and equip costs.
- Abilities in quotes belong to the token: actions inside them are dropped, and "unless" inside them no longer makes the effect conditional.

**Triggers**
- Ability names with punctuation are stripped ("Do You Like Squirrels? —").
- "When X enters and whenever …" gives both conditions. "this … or a/an … enters" counts as self or other.
- "this Spacecraft/Planet/Siege" reads as the card's own name.
- `ptAddPrompt` splits "Create a Treasure. Then you may …": the part with no choice resolves on its own, and only the choice waits.

## The Notary Hobbits (2026.11.09.1)
- **Plural wording**:
  - "create two tokens that are copies of them" is a copy (`of: "self"`), not a plain token, and "except the tokens aren't legendary" strips Legendary (`nonLegend`).
  - "if they're not a token" is checked (`trEvalIf`).
- **Mana per thing you control**: `ptManaUnits` reads "{C} for each Halfling you control", so it's one unit per matching permanent, changelings included.
- `fwDeckType` skips changelings, so a deck with many changelings gets its real type (Halfling, not Shapeshifter). This affects Roaming Throne, Herald's Horn and other "chosen type" cards.
- **Still misread by the finder and the 3,000-game test** (not the Playtest): the Hobbits' copies and per-Halfling mana, the untap abilities of Umbral Mantle and Sword of the Paruns, Helix Pinnacle's win, and Roaming Throne's doubling. Their numbers undersell decks built on these.

## Fastest win: checked in the Playtest (2026.11.10.1)
**Replay checker (`fwReplay`)**
- Each win the finder reports is played out in the Playtest engine before it's shown. The replay uses the same opening hand and draws (`best.acq` / `best.order`), with shuffles off (`PT._noShuffle`, through `ptLibShuffle`). Searches take the planned card, modes use `ptBestMode`, sacrifices follow the finder's choices, and X uses the planned value.
- `fastestWin` checks up to 8 results. Lines that fail go into `rejected`; verified lines are sorted first.
- Result: `ok: true` means it worked. `false` means the Playtest couldn't do it, which catches finder mistakes. `null` means it failed after something had to be done by hand, so it doesn't count against the finder.
- The panel shows "Checked in the Playtest" / "Couldn't be played out" (`.fw-check`), with a step-by-step list (`prefs.fwSteps`).
- The last turn also gets its end step, so end-step triggers can finish the game.

**Finder mistakes it caught, now fixed**
- Castle Garenbrig-style lands entering untapped (`tapUnless`).
- Temple of the False God tapping with too few lands (`manaIf`).
- X spells: paid as X = 0 but still getting the effect. Fixed with `xn`/`xEnters` and the X ≥ 10 condition on Finale of Devastation.
- Craterhoof's pump counted twice.
- Burn from activated abilities counted as cast damage.

**Playtest gaps it caught, now fixed**
- Impulsivity (`castGy`).
- A card's own death or sacrifice setting off its "whenever a creature dies" (Ashling).
- Temple's "activate only if": `ptManaSource` checks it (`onlyIf`).
- `ptActivate` pays mana costs through `ptPlan`.
- Payment order: colorless-only sources are spent first.
- Craterhoof's "gain X and get +a/+b" wording (`pumpRe2`).

**Finder reads more (checked across all 34,057 cards with `tools/finder-coverage.js`)**
The count of abilities the Playtest understands but the finder dropped went from 3,292 to about 2,200. The finder now covers:
- **New events**: beginning of combat, attacks alone, your end step, and gaining life.
- **Sagas**: chapter I on entering, the next chapter each turn, and sacrifice after the last one (`loreUp`).
- **"You may pay {N}. If you do, …"**: paid when the mana is there.
- **"You may sacrifice another … If you do"**: only with something to sacrifice.
- **"You may discard / draw … If you do"**: the rest happens only if the first part did.
- **"If you control (another / N or more) X, …"**: checked against your permanents (`tr.ctl`).
- **Biggest groups still dropped**: other "if" conditions (kicked, attacked this turn, a creature died this turn…), costs that remove counters or tap creatures, and choices.
- Payment: a source that makes more mana than the generic part needs (Sol Ring for {1}{R}) is tapped last.

## Rename decks, add a deck to the collection (2026.11.10.2)
- **Rename**: a "✎ Rename" button next to the deck name focuses the name box, which now sizes to its text. Enter saves, Escape cancels, and a toast offers Undo.
- **＋ Add to collection** on every deck:
  - `deckCollGap(d)` compares the deck with the collection by name, across every list and printing. The badge shows how many copies are missing.
  - The panel offers "Add the N missing" or "Add all anyway" (`deckToColl(d, all)`), using the deck's own printings, the current list (not "Decks") and the default condition. Undo is available.
  - `offerDeckColl` offers it after importing a deck list, and when you stop scanning into a deck with "Also add scanned cards to my collection" off.
- Tests: `tests/deckcoll.test.js`.

## Add all, even owned (2026.11.10.3)
- The "add all" choice is labelled "Add all N cards, even ones I already own". When every card is owned, the button reads "✓ In your collection · add all?" so it is still reachable.

## Collection type filter (2026.11.10.4)
- A new card type filter in the collection (`#fType`, `prefs.fType`, `typeOk`). Options: lands, basic, nonbasic, everything but lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers and battles.
- A double-faced card is a land if either face is one.
- Old entries with no type: basic land names still count as lands.
- Exports follow the filter, like the other filters. Tests: `tests/colltype.test.js`.

## Add cards without scanning (2026.11.10.5)
- A "＋ Add cards" button in the deck header (`#deckAddHead`) opens the add window (`openReplace({add: true})`). The Cards-tab button is renamed "+ Add cards".
- **Search by name**: a "How many" box (`repl.qty`) and "Into" main / sideboard / commander (`repl.board`). It starts on Commander when the deck needs one. The window stays open after each card, with a green message.
- **Paste a list** (`replAddPasted`) uses `parseDeckList` + `lookupCards` and adds to this deck. Cards it could not find are left in the box. Undo is available.
- Tests: `tests/deckadd.test.js`.

## Ka-ching for valuable cards (2026.11.11.1)
- The "valuable" sound (a card worth at least the alert price, default $5) is now a cash-register ka-ching made with Web Audio (`kaching(ac, t0)`). The "ka" is a burst of filtered noise plus a falling thump. The "ching" is a bell with uneven overtones (1, 2.76, 5.4, 8.9 × 1975 Hz), each struck twice 0.7% apart, ringing out over about 1 s. No sound file.
- A "🔊 Hear it" button next to the alert price plays it, even with sounds off.
- The AudioContext is resumed if the browser suspended it. Tests: `tests/sound.test.js`.

## A more real ka-ching, or your own sound (2026.11.11.2)
- `kaching` was rebuilt to sound like a real register:
  - Two metal clacks (noise through resonances at 1.25, 3.3 and 5.2 kHz) and the drawer thump.
  - A struck bell with pairs of close modes that beat as it rings (about 1.7 s).
  - Coins: 14 pings at 4–9 kHz, with the same jingle every time.
  - A small reverb, made by a ConvolverNode.
- **"Use my own sound…"**: pick an MP3, WAV or OGG up to 500 KB. It is stored as a data URL in `bsw-kaching`, not in backups, and plays instead of the built-in sound, which you can switch back to. Licensed register recordings were only in paid packs, so none is bundled.
