# Session handoff: Project Knowledge (adb-tracker)

Last updated 4 November 2026 (process section added the same day). Read this, then `CLAUDE.md`, before changing
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
  3. How to create jira tickets? Added by the owner from the site.
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

## How we work: the exact routine, every request

This is how every change has been handled. A new session should behave the
same way, so the owner never notices that the chat changed.

### 1. Before touching anything
```bash
cd /home/user/adb-tracker            # or wherever the clone is
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'   # once; the clone lacked it
git checkout main && git pull        # ALWAYS: the owner publishes FAQ edits from the site
```

### 2. Decide the lane
- **Fast lane:** wording, content, `data/tracker.json`, CSS, docs. Push
  straight to `main`. About 1 to 3 minutes end to end.
- **Full lane:** anything in `assets/*.js`, or new behaviour. Use a branch, a
  PR, wait for Checks, merge, then confirm the deploy.
- **Unsure?** Use the full lane.

### 3. If the owner asked for a mockup, or it is new content
Write the mockup in the chat first, using a formal tone and the same
structure the page will have. List what to confirm. Wait for "go" or
corrections. **Do not ask about merging or deploying**; that is always yes.

### 4. Make the change
- Edit the files.
- For `data/tracker.json` content, a small Python script that loads the JSON,
  changes it and dumps it with `indent=1, ensure_ascii=False` keeps the diff
  clean.
- After any change to `assets/`, `index.html` or `data/tracker.json`, run
  `python3 scripts/build_standalone.py`.

### 5. Verify
```bash
export CHROMIUM_PATH=/opt/pw-browsers/chromium
node checks/check_render.mjs && node checks/check_search.mjs      # fast lane
ls checks/check_*.mjs | xargs -P4 -I{} sh -c 'node {} >/dev/null 2>&1 || echo "FAIL {}"'   # full lane: prints nothing but FAILs
OUT=/tmp node scripts/live_check.cjs faq     # or: adb | kt <chapter 0-7> | publish
```
- `live_check.cjs` serves the repo under `/adb-tracker/`, the way live behaves,
  passes the password and opens ADB.
- **Pass:** `errors []` and `bad []`.
- **Always look at the screenshot.** Two real bugs were only visible there: a
  screenshot showing before its click, and buttons stretched full width.
- `publish` fakes GitHub and prints what would have been committed. It never
  writes to the real repo. **Never test Publish against the real repo.**
- **If a check fails, read its output** (rerun it alone). Two failures in this
  project were the test itself (parallel load) or old data, not the change.
  Prove which before changing code.

### 6. Ship
**Fast lane:**
```bash
git commit -am "<what changed, plain words>"   # message ends with the attribution lines the session gives
git push origin main
sha=$(git rev-parse HEAD)
until [ "$(gh api "repos/perezfiles01-droid/adb-tracker/actions/runs?head_sha=$sha" --jq '[.workflow_runs[]|select(.name=="Deploy site to GitHub Pages" and .status=="completed")]|length')" -ge 1 ]; do sleep 5; done
gh api "repos/perezfiles01-droid/adb-tracker/actions/runs?head_sha=$sha" --jq '.workflow_runs[]|select(.name=="Deploy site to GitHub Pages")|.conclusion'   # must print success
```

**Full lane:**
1. Make a branch: `git checkout -b claude/<topic>`.
2. Commit, then `git fetch origin && git merge origin/main`. This brings in the
   owner's FAQ publishes, so they are never overwritten.
3. Push.
4. Open the PR with the GitHub MCP tool `create_pull_request`. The body says
   what changed, how it was verified, and ends with the PR attribution lines.
5. Wait for **Checks** on the PR head SHA, using the same `until` loop with
   `.name=="Checks"`. It must be `success`.
6. Merge with `merge_pull_request`, method `merge`, `expectedHeadSha` set to
   the head SHA.
7. Wait for the Pages run on the **merge SHA**. It must be `success`.
8. `git checkout main && git pull`.

### 7. Report to the owner
Short and plain, in this shape:
1. **One line:** it's live, with the link
   https://perezfiles01-droid.github.io/adb-tracker/ and "press **Ctrl+Shift+R**".
2. **What to click** to see it: **ADB** → the card → …
3. **What changed**, as a few bullets in their words.
4. **What was checked**, then: "I can't open github.io from here, so I haven't
   seen the live page itself."
5. **Anything open or worth confirming** (only if real), with a suggested next
   step.

No apologies, no asking permission to merge or deploy, and no technical
detail they did not ask for.

### 8. When the owner publishes from the site
Their edits arrive on `main` as commits named "Update the FAQ from the site"
or "FAQ screenshot …". That is normal. Pull before editing `data/faq.json`.
**Never overwrite it with an older copy.**

## How to test locally like the live site

Use `node scripts/live_check.cjs <mode>` (step 5 above). It replaces the
hand-rolled server and Playwright scripts used in the first session.

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
