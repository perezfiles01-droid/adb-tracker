# Session handoff: Project Knowledge (adb-tracker)

Last updated 4 November 2026. Read this, then `CLAUDE.md`, before changing
anything. It is the state of the site and every decision the owner has made.

## What this is

A clone of Project Tracker (`perezfiles01-droid/Project-Tracker`), turned into a
knowledge base for learning the ADB EDRMS project.

- **Repo:** https://github.com/perezfiles01-droid/adb-tracker (branch `main`)
- **Live site:** https://perezfiles01-droid.github.io/adb-tracker/
- **Site password:** `adb`, asked once per computer and browser. It is a curtain
  against casual visitors, not security: the files are public.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/pages.yml` on every
  push to `main`, in about 20 to 30 seconds.

## How it differs from Project Tracker

Everything below applies only on the live path `/adb-tracker/`, through
`window.TRACKER_CLEAN` in `config.js`. The browser checks run from `file://` and
`localhost`, so they still exercise the full original app. Keep it that way.

- **Name:** "Project Knowledge", formerly "ADB Tracker".
- **Sidebar:** shows only INDEX, with one entry, "Project Knowledge".
- **Hidden on live:** Projects, Task, Drive and Image are hidden. So are Rename
  project, Delete project and Create Project.
- **Clean slate:** workbook projects with `edition: "adb"` are the only ones
  loaded. Today that is the single project **ADB** ("Asian Development Bank").
- **Separate storage:** localStorage, the session pointer and the IndexedDB name
  carry an `adb:` prefix (`NS` in `assets/store.js`), so this site never touches
  Project Tracker's data on the shared github.io origin.

## The ADB project

Clicking the **ADB** card opens two cards (the hub, `hubView` in
`assets/links.js`).

### 1. ADB Knowledge Transfer: an 8-chapter guide

Source: the `book` section of the `adb-kt` project in `data/tracker.json`.
Renderer: `bookView` and `blockHtml` in `assets/links.js`.

**Chapters:**
1. Introduction
2. Key Terms
3. Declaring a Record
4. Roles and Responsibilities
5. Release History
6. Release Delivery Process
7. Current Release: EDRMS Utilization Report
8. Summary

**Videos** (in `videos/`):
- **Part 1, Introduction:** `EDRMS_KT_Part1_Introduction.mp4`, in Ch1
- **Part 2, The Release Journey:** `EDRMS_KT_Part2_The_Release_Journey.mp4`, in Ch5
- **Part 3, How A Release Is Delivered:** `EDRMS_KT_Part3_How_A_Release_Is_Delivered.mp4`, in Ch6
- **Part 4, Utilization Report: Where the Data Comes From:**
  `EDRMS_KT_Part4_Utilization_Report_Data_Sources_1440p.mp4`, in Ch7. The owner
  uploaded it; it is not in the Jim repo.

**Block types:** hero, intro, para, flow, cards, steps, timeline, analogy,
video. Each block animates in.

**Editing:**
- **✎ Edit text** edits wording in place. It saves to `tracker.bookEdits` in
  **that browser only** and does not reach other users.
- **Permanent changes** go into `data/tracker.json`.

### 2. Frequently Asked Questions: editable, and published to everyone

- **Data:** `data/faq.json`, owned by the owner. It changes from the site, so
  always `git pull` before touching it, and never overwrite it with an older
  copy.
- **Structure:** questions → guides → steps. A step is
  `[title, text, [screenshot paths]]`.
- **Screenshots:** stored in `faq-images/*.jpg`.
- **Current questions:**
  1. How to declare a record? Four guides: single, multiple (2026.1),
     centralized (2026.2), email in Outlook (2026.3).
  2. How to access the database? The jump host through the Windows App, then
     VS Code, PostgreSQL, tables, and a query. Screenshots on every step.
  3. A third question, added by the owner.
- **View mode:**
  - Questions start closed, each with a ▸ arrow.
  - A 🔍 search filters as you type and opens the matches.
  - A faint "screenshot" tag marks a step that has one; clicking the step shows it.
- **Edit mode (✎ Edit):**
  - Questions still start closed and stay open while you work.
  - Edit any text; add or delete questions, guides and steps.
  - Screenshots: several per step. Click a step, then **Ctrl+V** to paste, or
    "Add from file" (multi-select), or drag and drop. Each has its own ✕.
- **⬆ Publish to everyone:**
  - Writes `faq.json` and any new images to the repo through the GitHub
    Contents API.
  - Uses the owner's fine-grained token: adb-tracker only, Contents read and
    write. It is stored as `tracker.githubToken`, a setting, on the owner's
    computer only and never in the backup.
  - Pages redeploys and everyone sees it in about a minute.
- **The engine is generic:** a hub section with `type: "videos"`, its own
  `file`, and optionally `layout: "cards"` and `noun`.
  - "BA Tasks" was built this way (four stage cards: Plan, Build, Test, Go
    Live), then **removed at the owner's request**.
  - Its content is kept in `data/ba-tasks.json`. To restore it, add the section
    back to `data/tracker.json`.

## Rules the owner set (do not re-ask)

**Shipping (detail in `CLAUDE.md`):**
- Ship every change all the way to live without asking.
- **Fast lane** for content and wording: edit, run the quick checks, push
  straight to `main`.
- **Full lane** (PR, wait for Checks, merge, confirm the deploy) for anything
  that changes behaviour.

**Content and approval:**
- **Mockup first** when the owner asks for one, or for a new content section.
  Wait for "go".
- **Formal KT wording**, simple and not childish. No "Key point" boxes, no
  review questions in the guide.
- **Give the hard-refresh reminder** after every change: Ctrl+Shift+R, or
  Cmd+Shift+R on a Mac.
- **The live bytes cannot be read from a cloud session** (github.io is
  blocked). Verify by running locally under a `/adb-tracker/` path, check the
  Pages run, and say plainly that the live page was not seen.

## How to test locally like the live site

```bash
mkdir -p /tmp/srv && ln -sfn "$PWD" /tmp/srv/adb-tracker
(cd /tmp/srv && python3 -m http.server 8765 &)
# open http://localhost:8765/adb-tracker/ with Playwright, password adb,
# then "Use this computer only"
```

```bash
python3 scripts/build_standalone.py
CHROMIUM_PATH=/opt/pw-browsers/chromium node checks/check_render.mjs
```

The full suite is every file in `checks/`. Run them four in parallel at most:
eight in parallel caused one flaky failure.

## Known gotchas

- **Step styling leaks.** `.bk-steplist li div { display:flex }` outranks plain
  single-class rules on any div inside a step. Use `.faqstep .x` or stronger.
- **Observer loops.** A MutationObserver that re-applies the FAQ search must
  only write when the value changes, or it loops on its own write.
- **Publishing makes several deploys.** Publish sends one commit per screenshot
  plus one for `faq.json`. Each commit starts a deploy, and each cancels the one
  before it, so only the last finishes. The site can take a few minutes to catch
  up. Suggested fix, not yet built: publish everything in a single commit, guard
  against overwriting a newer `faq.json`, and show a "still updating" note.
- **A Stop hook** checks for unpushed commits. The clone needed
  `remote.origin.fetch` set before the upstream compared correctly.

## Open items

- **Centralized guide title:** the guide is titled "Declaring a centralized
  email" as the owner wrote it. Release 2026.2 is centralized *records*. Not
  yet confirmed.
- **Unverified steps:** the steps for multiple, centralized and Outlook were
  drafted from release notes, not screens.
- **Jim repo:** the KT Part 4 video is not in Jim's `video/` folder. Offered to
  add it; no answer yet.
