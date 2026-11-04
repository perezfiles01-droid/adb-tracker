/* The link inventory: workbook rows, your edits, and links you add yourself,
   merged into one list.

   data/tracker.json is a build artefact generated from the workbook and served
   read-only — this is a static site, there is nothing to write back to. So an
   edit cannot change the JSON. It is held as an overlay in this browser,
   keyed by a stable id derived from the row, and applied over the workbook
   data at render time.

   That id is the load-bearing part. Workbook rows carry no identity of their
   own: GLASS links are {group,name,url,verified} and only the 31 EDRMS sites
   have an "sn". Without a derived key an edit has nothing to attach to. */
(() => {
  const EDITS = "tracker.linkEdits";   // { id: {name,description,account,url,removed} }
  const ADDED = "tracker.userLinks";   // [ {id,project,name,description,account,url} ]
  const DRIVE = "tracker.driveLinks";  // owned by drive.js; shared shape
  const TABLES = "tracker.linkTables"; // [ {id,project,name} ] tables you name yourself
  const PROJECTS = "tracker.projects"; // { added, renamed, hidden, desc:{key:text} }
  const PINS = "tracker.linkPins";     // [ id ] links held at the top of their table

  const read = (key, fallback) => {
    return window.TrackerStore.get(key, JSON.parse(fallback));
  };
  const edits = () => read(EDITS, "{}");
  const added = () => read(ADDED, "[]");
  const drive = () => read(DRIVE, "[]");
  const writeEdits = (o) => window.TrackerStore.set(EDITS, o);
  const writeAdded = (a) => window.TrackerStore.set(ADDED, a);
  const writeDrive = (a) => window.TrackerStore.set(DRIVE, a);
  const customTables = () => read(TABLES, "[]");
  const projectStore = () => {
    const v = read(PROJECTS, "{}");
    return { added: v.added || [], renamed: v.renamed || {}, hidden: v.hidden || [],
             desc: v.desc || {} };
  };
  const writeProjects = (v) => window.TrackerStore.set(PROJECTS, v);
  const writeTables = (a) => window.TrackerStore.set(TABLES, a);

  /* ---------- pinned links ----------
     A pin is per table, which is what "top of the list" means here: the same
     link filed in two tables is two rows, and pinning one says nothing about
     the other. Held as a plain list of row ids. */
  const pins = () => read(PINS, "[]");
  const isPinned = (id) => pins().includes(id);
  function togglePin(id) {
    const list = pins();
    const i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    window.TrackerStore.set(PINS, list);
  }

  const slug = (s) => String(s ?? "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";

  /** The Drive card groups pinned files and anything you add without a project. */
  const DRIVE_GROUP = "Google Drive";

  /**
   * Every link the app knows about, in one shape.
   *
   * origin says where an edit must be written back to, which differs per
   * source: workbook rows get an overlay entry, Drive links are edited in
   * place in their own store, and links you added live in theirs.
   */
  function resolved() {
    const data = window.TrackerState.data;
    const ov = edits();
    const out = [];
    const seen = new Set();

    const push = (row) => {
      // A derived id can collide (two rows with the same name in one section);
      // suffix rather than let one edit silently apply to both.
      let id = row.id;
      let n = 2;
      while (seen.has(id)) id = `${row.id}~${n++}`;
      seen.add(id);
      const patch = ov[id] || {};
      if (patch.removed) return;
      out.push({ ...row, id, ...patch });
    };

    for (const p of data.projects.filter((x) => x.active !== false)) {
      for (const sec of p.sections) {
        const base = `${p.id}:${slug(sec.title)}`;
        if (sec.type === "links") {
          for (const i of sec.items) {
            push({ id: `${base}:${slug(i.name)}`, name: i.name, url: i.url,
                   description: i.note || "", account: "", verified: i.verified,
                   project: p.name, table: sec.title, origin: "workbook" });
          }
        } else if (sec.type === "sites") {
          for (const i of sec.items) {
            // label is "link" / "link (demo)" — a link-type marker, not a
            // description. Left empty so the column reads as fillable.
            push({ id: `${base}:${slug(i.name)}`, name: i.name, url: i.url,
                   description: "", account: i.account || "", verified: i.verified,
                   project: p.name, table: sec.title, origin: "workbook" });
          }
        } else if (sec.type === "phases") {
          for (const ph of sec.items) {
            for (const st of ph.steps) {
              if (!st.url) continue;
              push({ id: `${base}:${slug(st.name)}`, name: st.name, url: st.url,
                     description: st.description || ph.title, account: "",
                     verified: st.verified, project: p.name, table: sec.title,
                     origin: "workbook" });
            }
          }
        }
      }
    }

    // Pinned Drive files are not a project, so they no longer appear in the
    // Projects section. They keep their own page, which is where they belong.
    for (const u of added()) {
      push({ id: u.id, name: u.name, url: u.url, description: u.description || "",
             account: u.account || "", verified: true,
             project: u.project || DRIVE_GROUP, table: u.table || "",
             origin: "user" });
    }
    return out;
  }

  /** One tile per project. Google Drive is not a project and is not here. */
  function groups() {
    const rows = resolved();
    const ps = projectStore();
    const order = window.TrackerState.data.projects
      .filter((p) => p.active !== false).map((p) => p.name);
    for (const r of rows) if (r.project && !order.includes(r.project)) order.push(r.project);
    for (const a of ps.added) if (!order.includes(a.name)) order.push(a.name);
    return order
      // A workbook project cannot be deleted from data/tracker.json, which is
      // served read-only, so "delete" is a tombstone keyed on the slug.
      .filter((name) => !ps.hidden.includes(slug(name)))
      .map((name) => ps.renamed[slug(name)] || name)
      .map((name) => {
      const items = rows.filter((r) => r.project === name);
      return { key: slug(name), name, description: describe(name, slug(name)),
               count: items.length,
               tables: tablesFor(name).length,
               undescribed: items.filter((r) => !r.description).length };
    });
  }

  /**
   * The tables inside a project: the workbook's own sections, which are a
   * real categorisation already (EDRMS ADB arrives as "Sites & source links"
   * and "EDRMS release phases"), plus any you have named yourself.
   */
  function tablesFor(projectName) {
    const names = [];
    const owned = originalNames(projectName);
    for (const r of resolved()) {
      if (owned.includes(r.project) && r.table && !names.includes(r.table)) names.push(r.table);
    }
    for (const t of customTables()) {
      if (t.project === projectName && !names.includes(t.name)) names.push(t.name);
    }
    if (!names.length) names.push("Links");
    return names;
  }

  /**
   * A project's one-line description.
   *
   * Yours if you have written one; otherwise the workbook's own blurb, which
   * GLASS and EDRMS ADB both arrive with and which was previously shown only
   * once you had already opened the project. A project you added starts with
   * none, and reads as a plain name until you give it one.
   */
  function describe(displayName, key) {
    const ps = projectStore();
    if (typeof ps.desc[key] === "string") return ps.desc[key];
    for (const n of originalNames(displayName)) {
      const p = window.TrackerState.data.projects.find((x) => x.name === n);
      if (p && p.blurb) return p.blurb;
    }
    return "";
  }

  const groupByKey = (key) => groups().find((g) => g.key === key);
  /**
   * A rename changes the display name only; rows still carry the name they
   * were filed under, so both are accepted when collecting a project's rows.
   */
  const originalNames = (displayName) => {
    const ps = projectStore();
    const names = [displayName];
    for (const [k, v] of Object.entries(ps.renamed)) {
      if (v !== displayName) continue;
      for (const p of window.TrackerState.data.projects) if (slug(p.name) === k) names.push(p.name);
      for (const r of resolved()) if (slug(r.project) === k) names.push(r.project);
    }
    return [...new Set(names)];
  };
  const rowsFor = (key) => {
    const g = groupByKey(key);
    if (!g) return [];
    const names = originalNames(g.name);
    return resolved().filter((r) => names.includes(r.project));
  };
  const rowsIn = (projectName, tableName) => {
    const names = originalNames(projectName);
    return resolved().filter((r) =>
      names.includes(r.project) && (r.table || tablesFor(projectName)[0]) === tableName);
  };

  /* ---------- writes ---------- */
  function saveRow(row, values) {
    if (row.origin === "workbook") {
      const ov = edits();
      ov[row.id] = { ...(ov[row.id] || {}), name: values.name, url: values.url,
                     description: values.description, account: values.account,
                     table: values.table || row.table };
      writeEdits(ov);
    } else if (row.origin === "drive") {
      const list = drive();
      const t = list.find((l) => l.id === row.id);
      if (t) { Object.assign(t, values); writeDrive(list); }
    } else {
      const list = added();
      const t = list.find((l) => l.id === row.id);
      if (t) { Object.assign(t, values); writeAdded(list); }
    }
  }

  function addRow(groupName, values) {
    const list = added();
    list.push({ id: "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                project: groupName, ...values });
    writeAdded(list);
  }

  function addTable(projectName, name) {
    const list = customTables();
    if (list.some((t) => t.project === projectName && t.name === name)) return;
    list.push({ id: "tb-" + Date.now(), project: projectName, name });
    writeTables(list);
  }

  /**
   * Rename a table. Tables come from two places - the workbook's own section
   * titles and ones you named yourself - so the rename is recorded once, at
   * the name level, and every row that quoted the old name is re-pointed.
   * A workbook row keeps its tombstone/override record; nothing is rewritten
   * in the data file.
   */
  function renameTable(projectName, oldName, newName) {
    newName = String(newName || "").trim();
    if (!newName || newName === oldName) return;

    const custom = customTables();
    const mine = custom.find((c) => c.project === projectName && c.name === oldName);
    if (mine) mine.name = newName;
    else custom.push({ id: "tb-" + Date.now(), project: projectName, name: newName });
    writeTables(custom);

    // Re-point rows you added or pinned.
    const own = added();
    for (const r of own) if (r.project === projectName && (r.table || "") === oldName) r.table = newName;
    writeAdded(own);
    const pinned = drive();
    for (const r of pinned) if (r.project === projectName && (r.table || "") === oldName) r.table = newName;
    writeDrive(pinned);

    // Workbook rows move by override, the same mechanism an edit already uses.
    const ov = edits();
    for (const r of resolved()) {
      if (r.origin === "workbook" && r.project === projectName && r.table === oldName) {
        ov[r.id] = { ...(ov[r.id] || {}), table: newName };
      }
    }
    writeEdits(ov);

    // The old custom entry, if the rename left one behind, is now empty.
    writeTables(customTables().filter((c) =>
      !(c.project === projectName && c.name === oldName)));
  }

  /**
   * Delete a table and every link in it. Workbook rows are tombstoned rather
   * than dropped, because the workbook still holds them and they would come
   * straight back on the next render.
   */
  function deleteTable(projectName, tableName) {
    for (const r of rowsIn(projectName, tableName)) removeRow(r);
    writeTables(customTables().filter((c) =>
      !(c.project === projectName && c.name === tableName)));
  }

  function removeRow(row) {
    if (row.origin === "workbook") {
      const ov = edits();
      // Kept as a tombstone rather than dropped: the workbook row still
      // exists and would come straight back on the next render.
      ov[row.id] = { ...(ov[row.id] || {}), removed: true };
      writeEdits(ov);
    } else if (row.origin === "drive") {
      writeDrive(drive().filter((l) => l.id !== row.id));
    } else {
      writeAdded(added().filter((l) => l.id !== row.id));
    }
  }

  /* ---------- views ---------- */
  const esc = (s2) => String(s2 ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const PROJ_COLS = 3, PROJ_ROWS = 2;               // 3 projects a row
  const PROJ_PER_PAGE = PROJ_COLS * PROJ_ROWS;
  const ROWS_PER_PAGE = 10;

  // Per-section state. Each search box and each account filter is its own,
  // so filtering one table never disturbs another.
  // { "projects": q, "artifacts:<project>": q }. One search for the whole Table
  // of Artifacts rather than one per table: the tables are one collection, and
  // a box on each meant typing the same thing four times to find one row.
  const find = {};
  let selected = null;    // the project whose tables are open underneath
  const account = {};     // { "<proj>:<table>": chosen email }

  const has = (r, q) => !q ||
    (String(r.name || "") + " " + String(r.description || "")).toLowerCase().includes(q);

  const searchBox = (key, placeholder) => `<div class="search sectionsearch">
      <input type="search" data-search="${esc(key)}" value="${esc(find[key] || "")}"
             placeholder="${esc(placeholder)}" autocomplete="off">
    </div>`;

  /** Projects: three a row, paginated, exactly like the Drive page's grid. */
  function projectsTable() {
    const q = (find.projects || "").toLowerCase();
    const list = groups().filter((g) => !q || g.name.toLowerCase().includes(q));
    const cur = window.TrackerUI.pageIndex("projects", list.length, PROJ_PER_PAGE);
    const slice = list.slice(cur * PROJ_PER_PAGE, (cur + 1) * PROJ_PER_PAGE);

    // The whole tile opens the project. It used to carry a pencil and a bin
    // of its own, which meant seven projects put fourteen controls on the
    // page for two actions; those are one pair of buttons above the list now,
    // and the tile is a single large target with nothing to miss.
    const tiles = slice.map((g) => `
      <button class="ptile${selected === g.key ? " picked" : ""}" data-pick="${esc(g.key)}">
        <span class="t">${esc(g.name)}</span>
        ${g.description ? `<span class="psub">${esc(g.description)}</span>` : ""}
      </button>`).join("");

    return `<div class="ptiles">${tiles ||
        `<div class="empty">No project matches that search.</div>`}</div>
      ${listFoot(window.TrackerUI.pager("projects", list.length, PROJ_PER_PAGE),
                 // The live ADB site is a fixed knowledge base: no project editing.
                 window.TRACKER_CLEAN ? "" : `<button class="btn primary" data-newproject="1">Create Project</button>`)}`;
  }

  /**
   * The row under a list: its pager on the left, its create button on the
   * right.
   *
   * The button cannot live beside the pager's own controls, because a pager
   * renders nothing at all for a single page — park a button there and it
   * disappears the moment a list gets short enough to fit. This row always
   * renders; only the pager inside it comes and goes.
   */
  const listFoot = (pagerHtml, button) =>
    `<div class="listfoot">
       <div class="listfoot-pager">${pagerHtml || ""}</div>
       <div class="listfoot-act">${button}</div>
     </div>`;

  /** One named table inside a project. */
  function linkTable(projectName, tableName) {
    const key = `links:${slug(projectName)}:${slug(tableName)}`;
    const all = rowsIn(projectName, tableName);
    const emails = [...new Set(all.map((r) => r.account).filter(Boolean))].sort();
    const chosen = account[key] || "";
    // The one search above the tables, not a box of this table's own.
    const q = (find[`artifacts:${slug(projectName)}`] || "").toLowerCase();
    let rows = all.filter((r) => has(r, q));
    if (chosen) rows = rows.filter((r) => r.account === chosen);
    rows = window.TrackerUI.sortRows(key, rows);
    // Pinned rows are lifted BEFORE paging, so a pinned link is on page one
    // however long the table is - a pin that only reordered the page you were
    // already looking at would be no use at all. Order within each half is
    // left alone, so the column sort still holds.
    const pinned = pins();
    rows = [...rows.filter((r) => pinned.includes(r.id)),
            ...rows.filter((r) => !pinned.includes(r.id))];

    const cur = window.TrackerUI.pageIndex(key, rows.length, ROWS_PER_PAGE);
    const slice = rows.slice(cur * ROWS_PER_PAGE, (cur + 1) * ROWS_PER_PAGE);
    const dash = `<span class="tag dead">—</span>`;

    const body = slice.map((r) => `<tr>
        <td class="wrap"><span class="sitename">${esc(r.name)}</span></td>
        <td class="wrap">${r.description
          ? esc(window.TrackerUI.htmlText(r.description)) : dash}</td>
        <td class="acct">${r.account
          ? `<button class="acctcell" data-copy="${esc(r.account)}"
                     title="Click to copy ${esc(r.account)}">${esc(r.account)}</button>`
          : dash}</td>
        <td>${r.url
          ? `<a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">Open ↗</a>`
          : dash}</td>
        <td class="actions">
          ${window.TrackerUI.iconButton("pin",
            isPinned(r.id) ? "Unpin from the top" : "Pin to the top",
            `data-pin="${esc(r.id)}" data-pinkey="${esc(key)}" aria-pressed="${isPinned(r.id)}"`,
            isPinned(r.id) ? "pinned" : "")}
          ${window.TrackerUI.iconButton("edit", "Edit", `data-edit="link:${esc(r.id)}"`)}
          ${window.TrackerUI.iconButton("remove", "Remove", `data-remove="link:${esc(r.id)}"`)}
        </td>
      </tr>`).join("");

    // The filter belongs to its column, not to a separate control above the
    // table: a lone "All email access" select gave no clue which column it
    // acted on.
    const emailHeader = `<th class="emailhead">
        <span class="emaillabel">Email Access</span>
        ${emails.length ? `<select class="accountpick" data-account="${esc(key)}"
          title="Filter by account" aria-label="Filter by email access">
          <option value="">All</option>
          ${emails.map((a) => `<option value="${esc(a)}"${a === chosen ? " selected" : ""}>${esc(a)}</option>`).join("")}
        </select>` : ""}
      </th>`;

    // A table with nothing left after the search is not a result, so it is not
    // shown. Searching "uat" used to print MAIN (0) and "Nothing in this table
    // yet" above the two tables that actually matched, which is the opposite
    // of what a search is for - the more tables a project has, the more empty
    // headings you scroll past to reach the answer.
    //
    // Only while a search is running. With the box empty an empty table is a
    // real thing you own and can add to, and hiding it would leave no way to
    // reach it. The account filter counts as searching for the same reason.
    if ((q || chosen) && !rows.length) return "";

    return `<section class="linksection">
        <div class="sectionhead">
          <div class="sectionleft">
            <h3 class="sec">${esc(tableName)} (${rows.length})</h3>
          </div>
          <div class="sectiontools">
            ${window.TrackerUI.iconButton("add", "Add link", `data-addto="${esc(projectName)}|${esc(tableName)}"`)}
            ${window.TrackerUI.iconButton("rename", "Rename", `data-edit="table:${esc(projectName)}|${esc(tableName)}"`)}
            ${window.TrackerUI.iconButton("remove", "Delete", `data-remove="table:${esc(projectName)}|${esc(tableName)}"`)}
          </div>
        </div>
        ${rows.length
          ? `<div class="tablewrap"><table class="linktable">
               <thead><tr>
                 ${window.TrackerUI.sortHeader(key, "name", "Site")}
                 ${window.TrackerUI.sortHeader(key, "description", "Description")}
                 ${emailHeader}<th>Link</th><th></th>
               </tr></thead>
               <tbody>${body}</tbody>
             </table></div>${window.TrackerUI.pager(key, rows.length, ROWS_PER_PAGE)}`
          : `<div class="empty">Nothing in this table yet.</div>`}
      </section>`;
  }

  /* ---------- KT book ----------
     A workbook project may carry a "book" section: short chapters to learn
     the project from scratch. Opening the project shows the reader. All
     chapters are in the DOM; the buttons only show one, so switching never
     re-renders the page or restarts a video. */
  function bookSection(name) {
    const p = window.TrackerState.data.projects.find((x) => x.name === name);
    return p && (p.sections || []).find((s) => s.type === "book" && s.items && s.items.length);
  }

  /* ---------- editing the guide in place ----------
     Every text in the guide carries data-bkpath, its address in the chapter
     data ("0.title", "0.2.items.1.2"). In edit mode those become editable;
     what you type is kept under BOOK_EDITS as { path: text } and laid over
     the workbook text on every render. It is in KEYS.data, so it is in the
     backup and undoable. Only text changes: layout, icons and videos do not. */
  const BOOK_EDITS = "tracker.bookEdits";
  let bookEditing = false;
  const bookEdits = () => window.TrackerStore.get(BOOK_EDITS, {}) || {};
  let edBase = "";
  const T = (path, val) => {
    const full = edBase + path, ov = bookEdits()[full];
    return `<span class="bk-t" data-bkpath="${esc(full)}">${esc(ov ?? val ?? "")}</span>`;
  };

  /* One chapter is a list of blocks. Each block animates in on its own
     delay (--d), so a page builds itself up rather than appearing at once. */
  function blockHtml(b, P) {
    let k = 0;
    const d = () => `style="--d:${k++}"`;
    const it = (j, f, v) => T(`${P}.items.${j}.${f}`, v);
    switch (b.type) {
      case "hero": return `<div class="bk-hero"><div class="bk-hero-icon">${esc(b.icon)}</div>
          <div><div class="bk-hero-text">${T(P + ".text", b.text)}</div>${b.sub ? `<div class="bk-hero-sub">${T(P + ".sub", b.sub)}</div>` : ""}</div></div>`;
      case "flow": return `<div class="bk-block">${b.label ? `<div class="bk-label">${T(P + ".label", b.label)}</div>` : ""}
          <div class="bk-flow">${b.items.map(([ic, t, s2], j) =>
            `${j ? `<div class="bk-arrow" ${d()}>➜</div>` : ""}<div class="bk-node" ${d()}><div class="bk-node-icon">${esc(ic)}</div>
             <b>${it(j, 1, t)}</b><span>${it(j, 2, s2)}</span></div>`).join("")}</div></div>`;
      case "cards": return `<div class="bk-cards">${b.items.map(([ic, t, s2], j) =>
          `<div class="bk-card" ${d()}><div class="bk-card-icon">${esc(ic)}</div><b>${it(j, 1, t)}</b><span>${it(j, 2, s2)}</span></div>`).join("")}</div>`;
      case "steps": return `<ol class="bk-steplist">${b.items.map(([ic, t, s2], j) =>
          `<li ${d()}><span class="bk-num">${j + 1}</span><span class="bk-step-icon">${esc(ic)}</span>
           <div><b>${it(j, 1, t)}</b><span>${it(j, 2, s2)}</span></div></li>`).join("")}</ol>`;
      case "timeline": return `<ol class="bk-timeline">${b.items.map(([w, r, ic, t], j) =>
          `<li ${d()}${/Current release/.test(t) ? ' class="now"' : ""}><span class="bk-dot">${esc(ic)}</span>
           <div><span class="bk-when">${it(j, 0, w)} · <b>${it(j, 1, r)}</b></span>${it(j, 3, t)}</div></li>`).join("")}</ol>`;
      case "analogy": return `<div class="bk-analogy"><span>💡</span><p>${T(P + ".text", b.text)}</p></div>`;
      case "intro": return `<p class="bk-intro">${T(P + ".text", b.text)}</p>`;
      case "para": return `<div class="bk-para">${b.label ? `<div class="bk-label">${T(P + ".label", b.label)}</div>` : ""}<p>${T(P + ".text", b.text)}</p></div>`;
      case "takeaway": return `<div class="bk-takeaway"><div class="bk-label">Key point</div><p>${T(P + ".text", b.text)}</p></div>`;
      case "quiz": return `<div class="bk-quiz"><div class="bk-label">Review questions</div>${b.items.map(([q, a], j) =>
          `<details${bookEditing ? " open" : ""}><summary>${it(j, 0, q)}</summary><p>${it(j, 1, a)}</p></details>`).join("")}</div>`;
      case "video": return `<div class="bk-video"><div class="bk-label">🎬 Video: ${T(P + ".name", b.name)}</div>
          <video controls playsinline preload="metadata" src="${esc(b.src)}"></video></div>`;
      default: return "";
    }
  }

  function chapterHtml(c, i, n, cur) {
    return `
      <article class="bk-page${i === cur ? " bk-in" : ""}" data-bkpage="${i}"${i === cur ? "" : " hidden"}>
        <div class="bk-count">${esc(c.icon || "")} Chapter ${i + 1} of ${n}</div>
        <h3 class="bk-title">${T(i + ".title", c.title)}</h3>
        ${(c.blocks || []).map((b, j) => `<section class="bk-sec" style="--s:${j}">${blockHtml(b, `${i}.${j}`)}</section>`).join("")}
        <div class="bk-nav">
          <button class="btn" data-bkgo="${i - 1}"${i ? "" : " disabled"}>← Back</button>
          ${i < n - 1
            ? `<button class="btn primary" data-bkgo="${i + 1}">Next: ${esc(c.next || "")}→</button>`
            : `<button class="btn primary" data-bkgo="0">↺ Start again</button>`}
        </div>
      </article>`;
  }

  /* ---------- the project's hub ----------
     A project carrying a book opens to a row of cards, one per learning
     section (the book, FAQ videos). Clicking a card opens it underneath;
     clicking it again closes it. */
  let hubOpen = "";
  function hubSections(name) {
    const p = window.TrackerState.data.projects.find((x) => x.name === name);
    return ((p && p.sections) || []).filter((s) => s.type === "book" || s.type === "videos");
  }
  function hubView(name) {
    const secs = hubSections(name);
    const open = secs.find((s) => slug(s.title) === hubOpen);
    return `
      <div class="opened">
        <div class="ptiles hubtiles">${secs.map((s) => `
          <button class="ptile${open === s ? " picked" : ""}" data-hub="${esc(slug(s.title))}" aria-expanded="${open === s}">
            <span class="t">${esc(s.icon || (s.type === "book" ? "📘" : "❓"))} ${esc(s.title)}</span>
            ${s.blurb ? `<span class="psub">${esc(s.blurb)}</span>` : ""}
          </button>`).join("")}</div>
        ${!open ? "" : open.type === "book" ? bookView(name, open) : faqView(open)}
      </div>`;
  }
  /* ---------- FAQ, editable and published to everyone ----------
     The FAQ lives in data/faq.json in the repo. Everyone reads that file
     (never cached, so a publish shows within about a minute). The owner
     edits a draft in memory, then Publish writes faq.json and any new
     screenshots to the repo through the GitHub API, using an access key
     kept in Settings on the owner's computer only. Pages redeploys on that
     commit, and every visitor gets the change.

     Screenshots are never put in localStorage: a pending one is held in
     memory until Publish, then it is a file in faq-images/. */
  const FAQ_REPO = "perezfiles01-droid/adb-tracker";
  // Each editable section names its own file (sec.file); the FAQ is the default.
  let FAQ_FILE = "data/faq.json";
  const liveData = {};
  const loading = new Set();
  let stageOpen = -1;   // the stage card picked in a "cards" section
  const TOKEN_KEY = "tracker.githubToken";
  let faqDraft = null, faqEditing = false, faqDirty = false, faqStatus = "";
  const faqPending = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rerender = () => { if (window.TrackerRender) window.TrackerRender(); };

  function faqLoad(file) {
    if (!window.TRACKER_CLEAN || typeof fetch !== "function" || loading.has(file)) return;
    loading.add(file);
    fetch(`${file}?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && Array.isArray(j.items)) { liveData[file] = j.items; if (!faqEditing) rerender(); } })
      .catch(() => { /* keep the copy in tracker.json */ });
  }

  // A step's screenshots: a list now. Older data held one path as a string.
  const shotsOf = (st) => (Array.isArray(st[2]) ? st[2] : st[2] ? [st[2]] : []);
  let faqActive = "";
  /* ---------- FAQ search ----------
     Filters in place, without re-rendering, so the box keeps focus while
     typing. Matches the question, guide names, descriptions and step text.
     A matching question opens; inside it, guides with no match are hidden.
     Clearing the box puts every question back as it was. */
  let faqQuery = "";
  const faqText = (q) => [q.question || "", ...(q.videos || []).flatMap((v) =>
    [v.name, v.desc, v.release, ...(v.steps || []).flatMap((st) => [st[0], st[1]])])].join(" ").toLowerCase();
  function faqFilter() {
    const box = document.querySelector("[data-faqsearch]");
    if (!box) return;
    const words = faqQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (el) => words.every((w) => (el.dataset.find || "").includes(w));
    let n = 0;
    document.querySelectorAll("details.faqq").forEach((d) => {
      if (!words.length) {
        if (d.hidden) d.hidden = false;
        if (d.open !== faqOpen.has(+d.dataset.qi)) d.open = faqOpen.has(+d.dataset.qi);
        d.querySelectorAll(".faqhow").forEach((g) => { g.hidden = false; });
        return;
      }
      const ok = hit(d);
      d.hidden = !ok;
      if (!ok) return;
      n++;
      d.open = true;
      const guides = [...d.querySelectorAll(".faqhow")];
      const any = guides.some(hit);
      guides.forEach((g) => { g.hidden = any && !hit(g); });
    });
    const out = document.querySelector("[data-faqsearch-n]");
    // Written only when it changes: the observer below watches the page,
    // and rewriting the same text is a mutation that would call this again.
    const label = words.length ? (n ? `${n} ${n === 1 ? "question" : "questions"}` : "No matches") : "";
    if (out && out.textContent !== label) out.textContent = label;
  }
  document.addEventListener("input", (e) => {
    if (!e.target.matches || !e.target.matches("[data-faqsearch]")) return;
    faqQuery = e.target.value;
    faqFilter();
  });
  // Re-apply after any re-render, so a running search survives it.
  new MutationObserver(() => { if (faqQuery && document.querySelector("[data-faqsearch]")) faqFilter(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  // Which questions are open. Kept across re-renders, so adding a step or a
  // screenshot does not fold the question you are working in; everything
  // starts closed, in view and in edit mode alike.
  const faqOpen = new Set();
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.classList || !d.classList.contains("faqq") || faqQuery.trim()) return;
    if (d.open) faqOpen.add(+d.dataset.qi); else faqOpen.delete(+d.dataset.qi);
  }, true);
  const imgSrc = (path) => (faqPending.has(path) ? faqPending.get(path) : path);

  function faqView(sec) {
    FAQ_FILE = sec.file || "data/faq.json";
    faqLoad(FAQ_FILE);
    const qs = faqEditing ? faqDraft : (liveData[FAQ_FILE] || sec.items || []);
    const E = faqEditing, cards = sec.layout === "cards";
    const noun = sec.noun || "question";
    const ed = (path, val, tag = "span", cls = "") =>
      E ? `<${tag} class="faqed ${cls}" contenteditable="plaintext-only" data-faqf="${path}">${esc(val || "")}</${tag}>`
        : `<${tag}${cls ? ` class="${cls}"` : ""}>${esc(val || "").replace(/(^|\s)(BA:.*)$/, "$1<em class=\"banote\">$2</em>")}</${tag}>`;
    const act = (a, label, cls = "") => `<button class="btn faqbtn ${cls}" data-faqact="${a}">${label}</button>`;
    return `
      <div class="opened">
        <div class="sectionhead">
          <h2 class="page sub">${esc(sec.title)}</h2>
          <div class="sectiontools">${E
            ? `${act("cancel", "Cancel")}${act("publish", "⬆ Publish to everyone", "primary")}`
            : `<button class="btn" data-faqact="edit">✎ Edit</button>`}</div>
        </div>
        ${faqStatus ? `<div class="faqstatus">${esc(faqStatus)}</div>` : ""}
        ${!E && !cards && qs.length ? `<div class="faqsearch"><span aria-hidden="true">🔍</span>
          <input type="search" data-faqsearch placeholder="Search questions and steps…" aria-label="Search the FAQ" value="${esc(faqQuery)}">
          <span class="faqsearch-n" data-faqsearch-n></span></div>` : ""}
        ${E ? `<div class="bk-editnote">Click any text to change it. Use the buttons to add or delete. Nothing is saved for others until you press Publish.</div>` : ""}
        ${cards ? stageCards() : qs.length ? `<div class="faqlist">${qs.map((q, qi) => `
          <details class="faqq" data-qi="${qi}" data-find="${esc(faqText(q))}"${faqOpen.has(qi) ? " open" : ""}>
            <summary><span class="faqnum">${qi + 1}</span>${ed(`${qi}|question`, q.question)}
              ${E ? act(`delq:${qi}`, `🗑 Delete ${noun}`, "danger") : ""}</summary>
${qBody(q, qi)}
          </details>`).join("")}</div>`
          : `<div class="empty">Nothing added yet.</div>`}
        ${E ? `<div style="margin-top:12px">${act("addq", `＋ Add ${noun}`)}</div>` : ""}
      </div>`;

    // The steps, guides and tools of one question (or stage).
    function qBody(q, qi) {
      return `
            <div class="faqhowlist">${(q.videos || []).map((v, vi) => `
              <section class="faqhow" data-find="${esc(faqText({ videos: [v] }))}">
                <div class="faqhow-head"><span class="faqhow-icon">${esc(v.icon || "📄")}</span>
                  <div style="flex:1"><h4>${ed(`${qi}|${vi}|name`, v.name)}
                    ${E ? ed(`${qi}|${vi}|release`, v.release, "span", "tag") : v.release ? ` <span class="tag">${esc(v.release)}</span>` : ""}</h4>
                  ${E || v.desc ? ed(`${qi}|${vi}|desc`, v.desc, "p") : ""}</div>
                  ${E ? act(`delg:${qi}.${vi}`, "🗑 Delete guide", "danger") : ""}</div>
                <ol class="bk-steplist">${(v.steps || []).map((st, si) => {
                  const [t, x] = st, imgs = shotsOf(st), key = `${qi}.${vi}.${si}`;
                  return `<li class="faqstep${imgs.length ? " hasimg" : ""}${E && faqActive === key ? " active" : ""}" data-faqstep="${key}">
                    <span class="bk-num">${si + 1}</span>
                    <div class="faqstep-body"><b>${ed(`${qi}|${vi}|${si}|0`, t)}</b>${ed(`${qi}|${vi}|${si}|1`, x)}
                      ${imgs.length && !E ? `<span class="faqhint" title="Click the step to see ${imgs.length === 1 ? "the screenshot" : `${imgs.length} screenshots`}">${imgs.length === 1 ? "screenshot" : `${imgs.length} screenshots`}</span>` : ""}
                      ${imgs.length ? `<div class="faqshots">${imgs.map((im, k) => `<figure class="faqshotwrap">
                          <img class="faqshot" src="${esc(imgSrc(im))}" alt="Screenshot ${k + 1} for step ${si + 1}" loading="lazy">
                          ${E ? `<button class="faqx" data-faqact="rmimg:${key}.${k}" title="Remove this screenshot">✕</button>` : ""}</figure>`).join("")}</div>` : ""}
                      ${E ? `<div class="faqpaste" tabindex="0" data-faqpaste="${key}">📋 ${faqActive === key
                          ? "Ready: press Ctrl+V (⌘V on Mac) to paste a screenshot here"
                          : "Click here, then press Ctrl+V to paste a screenshot"}</div>
                        <div class="faqstep-tools">
                        <label class="btn faqbtn">🖼 ${imgs.length ? "Add more" : "Add"} from file
                          <input type="file" accept="image/*" multiple hidden data-faqimg="${key}"></label>
                        ${act(`dels:${key}`, "🗑 Delete step", "danger")}</div>` : ""}
                    </div></li>`;
                }).join("")}</ol>
                ${E ? act(`adds:${qi}.${vi}`, "＋ Add step") : ""}
                ${v.src ? `<div class="faqvid"><video controls playsinline preload="metadata" src="${esc(v.src)}"></video></div>` : ""}
              </section>`).join("")}</div>
            ${E ? act(`addg:${qi}`, "＋ Add guide") : ""}`;
    }
    // A "cards" section: one clickable card per stage, the picked one opens below.
    function stageCards() {
      const pick = qs[stageOpen];
      return `<div class="stagecards">${qs.map((q, qi) => `
          <button class="stagecard${qi === stageOpen ? " picked" : ""}" data-stage="${qi}" aria-expanded="${qi === stageOpen}">
            <span class="stage-icon">${esc(q.icon || "📌")}</span>
            <b>${esc(q.question || "")}</b>${q.sub ? `<span>${esc(q.sub)}</span>` : ""}</button>`).join("")}</div>
        ${pick ? `<div class="stagebody${E ? " editing" : ""}">
            <div class="stagehead">${E ? `<b>${ed(`${stageOpen}|question`, pick.question)}</b>${ed(`${stageOpen}|sub`, pick.sub)}
              ${act(`delq:${stageOpen}`, `🗑 Delete ${noun}`, "danger")}` : ""}</div>
            ${qBody(pick, stageOpen)}</div>`
          : qs.length ? `<div class="stagehint">Select a stage above to see its steps.</div>` : ""}`;
    }
  }

  function faqSet(path, val) {
    const p = path.split("|"), q = faqDraft[+p[0]];
    if (p.length === 2) { q[p[1]] = val; return; }
    const v = q.videos[+p[1]];
    if (p.length === 3) { v[p[2]] = val; return; }
    v.steps[+p[2]][+p[3]] = val;
  }

  function faqShrink(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / img.width), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => rej(new Error("That file could not be read as an image."));
      img.src = URL.createObjectURL(file);
    });
  }

  const b64utf8 = (str) => btoa(unescape(encodeURIComponent(str)));

  async function faqPublish() {
    let tok = window.TrackerStore.getText(TOKEN_KEY);
    if (!tok) {
      tok = (prompt("Paste your GitHub access key to publish.\n\nIt is saved on this computer only, so you are asked once.") || "").trim();
      if (!tok) return;
      window.TrackerStore.setText(TOKEN_KEY, tok);
    }
    const api = (path, opt = {}) => fetch(`https://api.github.com/repos/${FAQ_REPO}/contents/${path}`, {
      ...opt, headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" } });
    const fail = async (r) => {
      let msg = ""; try { msg = (await r.json()).message || ""; } catch { /* no body */ }
      if (r.status === 401 || r.status === 403) window.TrackerStore.remove(TOKEN_KEY);
      throw new Error(`GitHub refused (${r.status}${msg ? `: ${msg}` : ""}).` +
        (r.status === 401 || r.status === 403 ? " The access key was cleared; publish again to enter a new one." : ""));
    };
    faqStatus = "Publishing…"; rerender();
    try {
      const used = JSON.stringify(faqDraft);
      for (const [path, data] of faqPending) {
        if (!used.includes(`"${path}"`)) continue;
        const r = await api(path, { method: "PUT", body: JSON.stringify({ message: `FAQ screenshot ${path}`, content: data.split(",")[1] }) });
        if (!r.ok) await fail(r);
      }
      const cur = await api(FAQ_FILE);
      if (!cur.ok && cur.status !== 404) await fail(cur);
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const r = await api(FAQ_FILE, { method: "PUT", body: JSON.stringify({
        message: "Update the FAQ from the site", content: b64utf8(JSON.stringify({ items: faqDraft }, null, 1) + "\n"), sha }) });
      if (!r.ok) await fail(r);
      liveData[FAQ_FILE] = clone(faqDraft); faqEditing = false; faqDirty = false;
      faqStatus = "✓ Published. Everyone will see it in about a minute (a hard refresh may be needed).";
    } catch (err) {
      faqStatus = `Not published. ${err.message}`;
    }
    rerender();
  }

  document.addEventListener("click", (e) => {
    const st = e.target.closest && e.target.closest("[data-faqstep]");
    if (st && !faqEditing && st.classList.contains("hasimg")) { st.classList.toggle("showimg"); return; }
    const b = e.target.closest && e.target.closest("[data-faqact]");
    if (!b) return;
    e.preventDefault();
    const [a, arg] = b.dataset.faqact.split(":");
    const ix = (arg || "").split(".").map(Number);
    const sec = hubSections(groups().find((g) => slug(g.name) === selected)?.name || "").find((s) => slug(s.title) === hubOpen);
    if (a === "edit") { faqDraft = clone(liveData[FAQ_FILE] || (sec && sec.items) || []); faqEditing = true; faqDirty = false; faqStatus = ""; }
    else if (a === "cancel") {
      faqActive = "";
      if (faqDirty && !confirm("Discard your unpublished changes?")) return;
      faqEditing = false; faqPending.clear(); faqStatus = "";
    }
    else if (a === "publish") { faqPublish(); return; }
    else {
      const q = faqDraft[ix[0]], v = q && q.videos && q.videos[ix[1]];
      const sure = (what) => confirm(`Delete this ${what}? It is removed for everyone when you publish.`);
      if (a === "addq") faqOpen.add(faqDraft.length), stageOpen = faqDraft.length, faqDraft.push({ question: "New question", videos: [{ name: "New guide", icon: "📄", desc: "", steps: [["Step title", "What to do."]] }] });
      else if (a === "delq") { if (!sure("question")) return; faqDraft.splice(ix[0], 1); stageOpen = -1;
        const kept = [...faqOpen].filter((i) => i !== ix[0]).map((i) => (i > ix[0] ? i - 1 : i));
        faqOpen.clear(); kept.forEach((i) => faqOpen.add(i)); }
      else if (a === "addg") (q.videos = q.videos || []).push({ name: "New guide", icon: "📄", desc: "", steps: [["Step title", "What to do."]] });
      else if (a === "delg") { if (!sure("guide")) return; q.videos.splice(ix[1], 1); }
      else if (a === "adds") (v.steps = v.steps || []).push(["Step title", "What to do."]);
      else if (a === "dels") { if (!sure("step")) return; v.steps.splice(ix[2], 1); }
      else if (a === "rmimg") {
        const st = v.steps[ix[2]], list = shotsOf(st).slice();
        list.splice(ix[3], 1);
        if (list.length) st[2] = list; else st.length = 2;
      }
      faqDirty = true;
    }
    rerender();
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest && e.target.closest("[data-faqf]");
    if (!el || !faqEditing) return;
    faqSet(el.dataset.faqf, el.textContent.replace(/\s+/g, " ").trim());
    faqDirty = true;
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest("[data-faqf]");
    if (!el) return;
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === " " && el.closest("summary")) e.stopPropagation();
  }, true);
  // Typing in the question must not open and close it.
  document.addEventListener("click", (e) => {
    if (faqEditing && e.target.closest && e.target.closest("summary") &&
        (e.target.closest("[data-faqf]") || e.target.closest("[data-faqact]"))) e.preventDefault();
  }, true);
  // Add images (from a file picker, a paste or a drop) to one step.
  async function faqAddShots(key, files) {
    const [qi, vi, si] = key.split(".").map(Number);
    const st = faqDraft[qi].videos[vi].steps[si];
    const list = shotsOf(st).slice();
    for (const f of files) {
      if (!f || !/^image\//.test(f.type)) continue;
      try {
        const data = await faqShrink(f);
        const path = `faq-images/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
        faqPending.set(path, data);
        list.push(path);
      } catch (err) { alert(err.message); }
    }
    if (list.length) { st[2] = list; faqDirty = true; }
    faqActive = key;
    rerender();
  }
  document.addEventListener("change", (e) => {
    const inp = e.target.closest && e.target.closest("[data-faqimg]");
    if (inp && inp.files && inp.files.length) faqAddShots(inp.dataset.faqimg, [...inp.files]);
  });
  // The step you last clicked is where a paste lands.
  document.addEventListener("click", (e) => {
    if (!faqEditing) return;
    const li = e.target.closest && e.target.closest("[data-faqstep]");
    if (!li || e.target.closest("[data-faqact]") || e.target.closest("label")) return;
    if (faqActive !== li.dataset.faqstep) {
      faqActive = li.dataset.faqstep;
      document.querySelectorAll("[data-faqstep].active").forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
      const z = li.querySelector(".faqpaste");
      if (z) z.textContent = "📋 Ready: press Ctrl+V (⌘V on Mac) to paste a screenshot here";
    }
  });
  document.addEventListener("paste", (e) => {
    if (!faqEditing || !faqActive) return;
    const files = [...((e.clipboardData && e.clipboardData.items) || [])]
      .filter((it) => it.kind === "file" && /^image\//.test(it.type)).map((it) => it.getAsFile());
    if (!files.length) return;          // plain text pastes into the text as usual
    e.preventDefault();
    faqAddShots(faqActive, files);
  });
  document.addEventListener("dragover", (e) => { if (faqEditing && e.target.closest && e.target.closest("[data-faqstep]")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    const li = faqEditing && e.target.closest && e.target.closest("[data-faqstep]");
    if (!li || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    faqAddShots(li.dataset.faqstep, [...e.dataTransfer.files]);
  });
  window.addEventListener("beforeunload", (e) => { if (faqEditing && faqDirty) { e.preventDefault(); e.returnValue = ""; } });

  document.addEventListener("click", (e) => {
    const c = e.target.closest && e.target.closest("[data-stage]");
    if (!c) return;
    stageOpen = stageOpen === +c.dataset.stage ? -1 : +c.dataset.stage;
    faqActive = "";
    rerender();
  });
  document.addEventListener("click", (e) => {
    const h = e.target.closest && e.target.closest("[data-hub]");
    if (!h) return;
    if (faqEditing && faqDirty && !confirm("Leave without publishing? Your unpublished changes will be lost.")) return;
    faqEditing = false; faqPending.clear(); faqStatus = ""; faqActive = ""; faqOpen.clear(); stageOpen = -1;
    hubOpen = hubOpen === h.dataset.hub ? "" : h.dataset.hub;
    if (window.TrackerRender) window.TrackerRender();
  });

  let bookPage = 0;
  function bookView(name, sec) {
    const ch = sec.items, ov = bookEdits();
    edBase = `${slug(name)}:`;
    const title = (i) => ov[`${edBase}${i}.title`] ?? ch[i].title;
    const cur = Math.min(bookPage, ch.length - 1);
    const edited = Object.keys(ov).some((k) => k.startsWith(edBase));
    return `
      <div class="opened">
        <div class="sectionhead">
          <h2 class="page sub">${esc(name)}: Knowledge Transfer</h2>
          <div class="sectiontools">
            ${bookEditing && edited ? `<button class="btn" data-bkreset>Restore original text</button>` : ""}
            <button class="btn${bookEditing ? " primary" : ""}" data-bkedit>${bookEditing ? "✓ Done editing" : "✎ Edit text"}</button>
          </div>
        </div>
        ${bookEditing ? `<div class="bk-editnote">Click any text to change it. Changes save as you type and stay in this browser.</div>` : ""}
        <div class="bk-progress"><div class="bk-bar" style="width:${((cur + 1) / ch.length) * 100}%"></div></div>
        <div class="bk${bookEditing ? " bk-editing" : ""}">
          <nav class="bk-toc"><ol>${ch.map((c, i) =>
            `<li><button data-bkgo="${i}" aria-current="${i === cur}"><span>${esc(c.icon || "")}</span>${esc(title(i))}</button></li>`).join("")}</ol></nav>
          <div class="bk-body">${ch.map((c, i) => chapterHtml({ ...c, next: ch[i + 1] ? title(i + 1) + " " : "" }, i, ch.length, cur)).join("")}</div>
        </div>
      </div>`;
  }

  const bookRerender = () => { if (window.TrackerRender) window.TrackerRender(); };
  const setEditable = () => document.querySelectorAll(".bk-t").forEach((el) => {
    el.contentEditable = bookEditing ? "plaintext-only" : "false";
    if (bookEditing && el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  });
  new MutationObserver(() => { if (bookEditing && document.querySelector(".bk-t:not([contenteditable])")) setEditable(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-bkedit]")) { bookEditing = !bookEditing; bookRerender(); setEditable(); return; }
    if (e.target.closest && e.target.closest("[data-bkreset]")) {
      if (!confirm("Restore the original text of this guide? Your edits to it will be removed.")) return;
      const ov = bookEdits();
      for (const k of Object.keys(ov)) if (k.startsWith(edBase)) delete ov[k];
      window.TrackerStore.set(BOOK_EDITS, ov); bookRerender(); setEditable(); return;
    }
    // In edit mode a click on a question edits it rather than folding it.
    if (bookEditing && e.target.closest && e.target.closest("summary .bk-t")) e.preventDefault();
  });
  // Save on every keystroke, without re-rendering, so the caret stays put.
  document.addEventListener("input", (e) => {
    const el = e.target.closest && e.target.closest(".bk-t");
    if (!el || !bookEditing) return;
    const ov = bookEdits();
    ov[el.dataset.bkpath] = el.textContent.replace(/\s+/g, " ").trim();
    window.TrackerStore.set(BOOK_EDITS, ov);
  });
  // A space or Enter inside a question must not toggle it; Enter must not add lines.
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest(".bk-t");
    if (!el || !bookEditing) return;
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    if (e.key === " " && el.closest("summary")) { e.stopPropagation(); }
  }, true);

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-bkgo]");
    if (!b || b.disabled) return;
    const i = Number(b.dataset.bkgo);
    const pages = document.querySelectorAll(".bk-page");
    if (i >= 0 && i < pages.length) bookPage = i;
    if (i < 0 || i >= pages.length) return;
    pages.forEach((pg) => {
      const on = Number(pg.dataset.bkpage) === i;
      pg.hidden = !on;
      // Re-adding the class replays the build-up animation on every visit.
      pg.classList.remove("bk-in");
      if (on) { void pg.offsetWidth; pg.classList.add("bk-in"); }
      if (!on) pg.querySelectorAll("video").forEach((v) => v.pause());
    });
    document.querySelectorAll(".bk-toc [data-bkgo]").forEach((t) =>
      t.setAttribute("aria-current", String(Number(t.dataset.bkgo) === i)));
    const bar = document.querySelector(".bk-bar");
    if (bar) bar.style.width = `${((i + 1) / pages.length) * 100}%`;
    const top = document.querySelector(".bk-progress");
    if (top && b.closest(".bk-nav")) top.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /** Overview: the Projects table, and the picked project's tables beneath it. */
  function overview() {
    const g = selected ? groupByKey(selected) : null;
    return `
      <h2 class="page">${window.TRACKER_CLEAN ? "Project Knowledge" : "Projects"}</h2>
      <div class="sectionhead">
        <div class="sectionleft">${searchBox("projects", "Search projects…")}</div>
        ${window.TRACKER_CLEAN ? "" : `<div class="sectiontools">
          <button class="btn" data-projectaction="rename">Rename project</button>
          <button class="btn" data-projectaction="delete">Delete project</button>
        </div>`}
      </div>
      ${projectsTable()}
      ${g && bookSection(g.name) ? hubView(g.name) : g ? `
        <div class="opened">
          <div class="sectionhead">
            <h2 class="page sub">Table of Artifacts</h2>
          </div>
          <div class="sectionhead artifactsearch">
            <div class="sectionleft">
              ${searchBox(`artifacts:${slug(g.name)}`,
                  "Search every table for a site or description…")}
            </div>
          </div>
          ${tablesFor(g.name).map((t) => linkTable(g.name, t)).join("")
            || `<div class="empty">Nothing matches your search.</div>`}
          ${listFoot("", `<button class="btn primary"
             data-newtable="${esc(g.name)}">Create Table</button>`)}
        </div>` : ""}`;
  }

  /** Kept so an existing #g:<project> bookmark still opens that project. */
  function tableView(key) {
    if (groupByKey(key)) {
      selected = key;
      // Opening a project from the sidebar has to leave its tile on screen.
      // The tiles page six at a time, so the seventh project opened its
      // tables under a page of tiles that did not include it.
      const i = groups().findIndex((g) => g.key === key);
      if (i > -1) window.TrackerUI.goToPage("projects", Math.floor(i / PROJ_PER_PAGE));
    }
    return overview();
  }

  /* ---------- wiring ---------- */
  const fields = (r, projectName, tableName) => [
    { name: "name", label: "Site", value: r ? r.name : "", placeholder: "What this link is" },
    { name: "description", label: "Description", type: "rich", rows: 3,
      value: r ? r.description : "", placeholder: "What it is for, in your own words" },
    { name: "account", label: "Email Access", value: r ? r.account : "",
      placeholder: "Which account opens it" },
    { name: "url", label: "Link", value: r ? r.url : "", placeholder: "https://…" },
    { name: "table", label: "Table", type: "select",
      options: tablesFor(projectName), value: r ? (r.table || tableName) : tableName,
      help: "Move this link into another table in the same project." },
  ];

  async function edit(id) {
    const row = resolved().find((r) => r.id === id);
    if (!row) return;
    const v = await window.TrackerUI.formDialog({
      title: "Edit link", submitLabel: "Save changes",
      fields: fields(row, row.project, row.table),
    });
    if (!v) return;
    saveRow(row, v);
    window.TrackerRender();
  }

  async function add(projectName, tableName) {
    const v = await window.TrackerUI.formDialog({
      title: `Add link to ${tableName}`, submitLabel: "Add link",
      fields: fields(null, projectName, tableName),
    });
    if (!v || (!v.name && !v.url)) return;
    addRow(projectName, { ...v, name: v.name || v.url, table: v.table || tableName });
    window.TrackerRender();
  }

  async function newTable(projectName) {
    const v = await window.TrackerUI.formDialog({
      title: "New table in " + projectName, submitLabel: "Create table",
      fields: [{ name: "name", label: "Table name", value: "",
                 placeholder: "UAT links, CR links, anything" }],
    });
    if (!v || !v.name) return;
    addTable(projectName, v.name);
    window.TrackerRender();
  }

  async function newProject() {
    const v = await window.TrackerUI.formDialog({
      title: "Add project", submitLabel: "Add project",
      fields: [{ name: "name", label: "Project name", value: "",
                 placeholder: "What the project is called" }],
    });
    if (!v || !v.name) return;
    const ps = projectStore();
    if (!groups().some((g) => g.name === v.name)) {
      ps.added.push({ key: slug(v.name), name: v.name });
      // A project hidden earlier under the same name comes back rather than
      // being added twice.
      ps.hidden = ps.hidden.filter((k) => k !== slug(v.name));
      writeProjects(ps);
    }
    window.TrackerRender();
  }

  /**
   * Rename and delete used to be a pencil and a bin on every tile. They are
   * one pair of buttons above the list now, so the project is chosen inside
   * the dialog instead of by which tile you clicked. Whatever is on screen -
   * the current page of tiles, a search - does not limit the choice: the
   * picker offers every project there is.
   */
  async function pickProject(action) {
    const list = groups();
    if (!list.length) {
      await window.TrackerUI.confirmDialog({
        title: action === "rename" ? "Rename project" : "Delete project",
        intro: "There are no projects yet.", confirmLabel: "OK",
      });
      return;
    }
    const names = list.map((g) => g.name);
    const v = await window.TrackerUI.formDialog({
      title: action === "rename" ? "Rename project" : "Delete project",
      intro: action === "rename"
        ? "Choose the project to rename."
        : "Choose the project to delete. You will be asked to confirm.",
      submitLabel: action === "rename" ? "Continue" : "Continue",
      fields: [{ name: "project", label: "Project", type: "select",
                 options: names, value: names[0] }],
    });
    if (!v || !v.project) return;
    const g = list.find((x) => x.name === v.project);
    if (!g) return;
    return action === "rename" ? renameProject(g.key) : deleteProject(g.key);
  }

  async function renameProject(key) {
    const g = groupByKey(key);
    if (!g) return;
    const v = await window.TrackerUI.formDialog({
      title: "Edit project", submitLabel: "Save changes",
      fields: [
        { name: "name", label: "Project name", value: g.name },
        { name: "description", label: "Description", type: "rich", rows: 2,
          value: g.description || "",
          placeholder: "One line about what this project is",
          help: "Shown under the project's name in the list." },
      ],
    });
    if (!v || !v.name) return;
    const ps = projectStore();
    const renamed = v.name !== g.name;
    if (renamed) {
      const own = ps.added.find((a) => slug(a.name) === key || a.key === key);
      if (own) own.name = v.name;          // one you added: rename it in place
      else ps.renamed[key] = v.name;       // a workbook one: overlay the name
    }
    // Filed under the name it will be READ back under, which is the slug of
    // the new name: groups() derives every key from the display name.
    ps.desc[slug(v.name)] = v.description || "";
    if (renamed) delete ps.desc[key];
    writeProjects(ps);
    if (renamed && selected === key) selected = slug(v.name);
    window.TrackerRender();
  }

  async function deleteProject(key) {
    const g = groupByKey(key);
    if (!g) return;
    const n = rowsFor(key).length;
    const yes = await window.TrackerUI.confirmDialog({
      title: "Delete project",
      intro: `Remove "${g.name}" from the tracker?` +
             (n ? ` Its ${n} link${n === 1 ? "" : "s"} go with it.` : " It has no links.") +
             " Links from the workbook can be brought back by adding the project again.",
      confirmLabel: "Delete project",
    });
    if (!yes) return;
    const ps = projectStore();
    ps.added = ps.added.filter((a) => slug(a.name) !== key && a.key !== key);
    // The tombstone has to name the slug groups() FILTERS on, which is the
    // name the row was filed under - not the display name. Keyed on the
    // display name alone, deleting a renamed workbook project wrote a
    // tombstone nothing matched and the project stayed on the page.
    for (const n of [g.name, ...originalNames(g.name)]) {
      if (!ps.hidden.includes(slug(n))) ps.hidden.push(slug(n));
    }
    if (!ps.hidden.includes(key)) ps.hidden.push(key);
    writeProjects(ps);
    if (selected === key) selected = null;
    window.TrackerRender();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-newproject]")) return newProject();
    const pa = e.target.closest("[data-projectaction]");
    if (pa) return pickProject(pa.dataset.projectaction);
    const pe = e.target.closest('[data-edit^="project:"]');
    if (pe) return renameProject(window.TrackerUI.actionId(pe, "edit"));
    const pd = e.target.closest('[data-remove^="project:"]');
    if (pd) return deleteProject(window.TrackerUI.actionId(pd, "remove"));

    const pick = e.target.closest("[data-pick]");
    if (pick) {
      selected = selected === pick.dataset.pick ? null : pick.dataset.pick;
      return window.TrackerRender();
    }
    const nt = e.target.closest("[data-newtable]");
    if (nt) return newTable(nt.dataset.newtable);
    const at = e.target.closest("[data-addto]");
    if (at) {
      const i = at.dataset.addto.lastIndexOf("|");
      return add(at.dataset.addto.slice(0, i), at.dataset.addto.slice(i + 1));
    }
    const tre = e.target.closest('[data-edit^="table:"]');
    if (tre) {
      const spec = window.TrackerUI.actionId(tre, "edit");
      const i = spec.lastIndexOf("|");
      return renamePrompt(spec.slice(0, i), spec.slice(i + 1));
    }
    const trd = e.target.closest('[data-remove^="table:"]');
    if (trd) {
      const spec = window.TrackerUI.actionId(trd, "remove");
      const i = spec.lastIndexOf("|");
      return deletePrompt(spec.slice(0, i), spec.slice(i + 1));
    }
    const pin = e.target.closest("[data-pin]");
    if (pin) {
      togglePin(pin.dataset.pin);
      // A row pinned from page three lands on page one. Leaving the reader on
      // page three would show them a table their link had just disappeared
      // from, so the table follows it.
      if (isPinned(pin.dataset.pin)) window.TrackerUI.goToPage(pin.dataset.pinkey, 0);
      return window.TrackerRender();
    }
    const ed = e.target.closest('[data-edit^="link:"]');
    if (ed) return edit(window.TrackerUI.actionId(ed, "edit"));
    const rm = e.target.closest('[data-remove^="link:"]');
    if (rm) return removeLink(window.TrackerUI.actionId(rm, "remove"));
  });

  async function removeLink(id) {
    const row = resolved().find((r) => r.id === id);
    if (!row) return;
    const yes = await window.TrackerUI.confirmDialog({
      title: "Remove link",
      intro: `Remove "${row.name}" from ${row.table || "this table"}?`,
      confirmLabel: "Remove link",
    });
    if (!yes) return;
    removeRow(row);
    window.TrackerRender();
  }

  // Re-rendering replaces the inputs, so focus and caret are restored by hand;
  // without this a section search loses focus after every keystroke.
  async function renamePrompt(projectName, tableName) {
    const v = await window.TrackerUI.formDialog({
      title: "Rename table",
      intro: `Renaming "${tableName}" in ${projectName}. Every link in it moves with the name.`,
      submitLabel: "Rename",
      fields: [{ name: "name", label: "Table name", value: tableName }],
    });
    if (!v || !v.name.trim() || v.name.trim() === tableName) return;
    renameTable(projectName, tableName, v.name.trim());
    window.TrackerRender();
  }

  async function deletePrompt(projectName, tableName) {
    const n = rowsIn(projectName, tableName).length;
    // Say the cost before it is paid: deleting a table takes its links too,
    // and a workbook link removed here does not come back on reload.
    const yes = await window.TrackerUI.confirmDialog({
      title: "Delete table",
      intro: `Delete "${tableName}" from ${projectName}?` +
             (n ? ` Its ${n} link${n === 1 ? "" : "s"} will be removed with it.` : " It is empty."),
      confirmLabel: n ? `Delete table and ${n} link${n === 1 ? "" : "s"}` : "Delete table",
    });
    if (!yes) return;
    deleteTable(projectName, tableName);
    window.TrackerRender();
  }

  document.addEventListener("input", (e) => {
    const box = e.target.closest("[data-search]");
    if (box) {
      const key = box.dataset.search;
      find[key] = box.value.trim();
      window.TrackerRender();
      const again = document.querySelector(`[data-search="${CSS.escape(key)}"]`);
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      return;
    }
    const sel = e.target.closest("[data-account]");
    if (sel) { account[sel.dataset.account] = sel.value; window.TrackerRender(); }
  });

  window.TrackerLinks = {
    searchBox, isPinned, togglePin, findValue: (key) => (find[key] || "").toLowerCase(),
    resolved, groups, groupByKey, rowsFor, rowsIn, tablesFor, newProject, saveRow, addRow, addTable,
    renameTable, deleteTable,
    removeRow, slug, DRIVE_GROUP, overview, tableView, ROWS_PER_PAGE, PROJ_COLS,
  };
})();
