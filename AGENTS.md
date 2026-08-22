# AGENTS.md

Guidance for AI coding agents (Claude Code, and any complementary models/tools) working in this repository.

## What this is

A static, dependency-free PWA calculator (`Calculadora BCV · Binance P2P`) for Venezuela: standard arithmetic plus live conversion between USD and bolívares using the official BCV rate and the Binance P2P parallel rate. No framework, no bundler, no build step — see README.md for the product description and deployment notes.

## Commands

- **Run all tests:** `npm test` (alias for `node --test`)
- **Run a single test file:** `node --test test/calc.test.js`
- **Run a single test by name:** `node --test --test-name-pattern="percent"` (matches the `test(...)` title)
- **Preview the app locally:** `python3 -m http.server 8000` from the repo root, then open `index.html` in a browser — there is no dev server or build step.
- **No lint/typecheck/build commands exist** in this repo — it's plain HTML/CSS/JS served as-is.
- **Push to `develop`:** use the `git-push-develop` skill (`.claude/skills/git-push-develop/SKILL.md`, invokable as `/git-push-develop` in Claude Code) instead of improvising git commands — it covers staging, commit format, and when to confirm before pushing.

## Architecture

- **`index.html`** contains the entire UI: markup, CSS, and the DOM/event-wiring JavaScript (keypad input, display rendering, currency conversion panel, live-rate fetch, theme toggle, PWA install prompt, service worker registration). It intentionally has **no calculator logic of its own** — its inline `<script>` only calls into `calc.js`'s engine and re-renders based on the engine's state.
- **`calc.js`** is the pure, DOM-free calculator engine: tokenizing, `evalExpr` (precedence-aware parser for `+ − × ÷` and parens), number formatting (`groupNumber` — a no-op today, kept as the single seam for display formatting: no thousands separator, `.` is the only decimal point), rate parsing (`parseRate`, plain `.`-decimal with a `,`→`.` fallback for values saved before this format), and currency formatting (`fmtVES`/`fmtUSD`, `toFixed(2)`). It's wrapped UMD-style so the same file works as `window.CalcEngine` in the browser and via `require("../calc.js")` in Node — this is what `test/calc.test.js` exercises with Node's built-in test runner (`node:test`). **Any change to arithmetic/tokenizing/formatting behavior belongs in `calc.js`**, not duplicated inline in `index.html`.
- **Currency conversion mode**: a `mode` variable in `index.html` ("usd" or "ves") controls conversion direction — "usd" treats the typed amount as USD and shows Bs; "ves" treats it as Bs and shows USD. Default is `"ves"` (Bs → USD) per product decision. The mode toggle button label and the `mode` variable must stay in sync (`"Bs<br>⇄ USD"` ↔ `"ves"`, `"USD<br>⇄ Bs"` ↔ `"usd"`).
- **Rates persistence**: despite README.md's "No usa localStorage" note (outdated), `index.html` *does* persist BCV/P2P rates and last-fetch time under `localStorage` keys `bcvRate`, `p2pRate`, `lastFetch`, plus the theme under `theme`.
- **Live rate fetch**: BCV rate comes from `ve.dolarapi.com`; Binance P2P rate is the median of 5 SELL USDT/VES ads from `p2p.binance.com`'s public API, which frequently fails from a browser due to CORS — this is expected and falls back silently to the last manually-entered/saved rate.
- **`sw.js`** is a cache-first service worker for offline PWA use. Its `SHELL` array must list every file the app shell needs (including `calc.js`), and `CACHE` must be bumped (e.g. `calc-bs-v6` → `v7`) whenever any shelled file changes, or offline clients won't pick up the update.
- **App version**: `APP_VERSION` in `index.html`'s inline script (mirrored in `package.json`'s `version`) is shown in the footnote (`v1.1.0`) so users can visually tell a new version was deployed. Bump it — together with the `sw.js` `CACHE` key — on every user-visible change.
- **Deployment**: `.github/workflows/deploy-pages.yml` deploys the raw repo contents (no build step) to GitHub Pages on every push to `main` or `develop`.
- **Git workflow**: this repo's push-to-`develop` conventions (staging, commit format, when to confirm before pushing) are codified in the `.claude/skills/git-push-develop/` skill — follow it for any commit/push work here.
- UI copy and code comments are in Spanish; keep new user-facing strings consistent with that. Numbers themselves are locale-agnostic (see App version / `calc.js` note above): plain `.` decimal point, no thousands separator anywhere in the UI.
