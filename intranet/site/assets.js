// Assets hub — a Drive-backed file browser. Talks only to /api/drive/* on this
// origin; the agency Google token never reaches the browser. Vanilla JS to match
// the rest of the static portal (no build step).

const state = {
  connected: false,
  connectedEmail: null,
  fullAccess: false,
  roots: [], // client folders: { id, name, folderId, webViewLink, tenantId }
  stack: [], // breadcrumb into the current client: { folderId, name }
  loading: false,
};

const $ = (sel) => document.querySelector(sel);
const elList = $("#list");
const elCrumbs = $("#crumbs");
const elActions = $("#actions");
const elBanner = $("#banner");
const fileInput = $("#file-input");

// ---- helpers --------------------------------------------------------------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtSize(bytes) {
  if (!bytes) return "";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.code = body?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}
function toast(msg, isErr) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isErr ? 5000 : 2600);
}

const ICON = {
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3v5h5"/><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6m0-6L10 14M19 13v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 19V7m0 0l-4 4m4-4l4 4M5 5h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></svg>',
};

function isImage(mime) { return mime && mime.startsWith("image/"); }

// ---- data -----------------------------------------------------------------

async function loadRoots() {
  const data = await api("/api/drive/folders");
  state.connected = data.connected;
  state.connectedEmail = data.connectedEmail;
  state.fullAccess = data.fullAccess;
  state.roots = data.folders || [];
}

async function loadCurrentFolder() {
  const cur = state.stack[state.stack.length - 1];
  state.loading = true;
  render();
  try {
    const data = await api(`/api/drive/list?folderId=${encodeURIComponent(cur.folderId)}`);
    cur.files = data.files || [];
  } catch (err) {
    if (err.code === "not_connected") { state.connected = false; }
    else { toast(err.message, true); }
    cur.files = [];
  }
  state.loading = false;
  render();
}

// ---- navigation -----------------------------------------------------------

function openClient(root) {
  state.stack = [{ folderId: root.folderId, name: root.name, webViewLink: root.webViewLink }];
  loadCurrentFolder();
}
function openSubfolder(file) {
  state.stack.push({ folderId: file.id, name: file.name, webViewLink: file.webViewLink, files: null });
  loadCurrentFolder();
}
function gotoCrumb(index) {
  if (index < 0) { state.stack = []; render(); return; }
  state.stack = state.stack.slice(0, index + 1);
  loadCurrentFolder();
}

// ---- render ---------------------------------------------------------------

function render() {
  renderBanner();
  renderCrumbs();
  renderActions();
  renderList();
}

function renderBanner() {
  const params = new URLSearchParams(location.search);
  if (params.get("connect_error")) {
    elBanner.innerHTML = `<div class="banner warn"><span class="bico">⚠️</span><div class="btext"><b>Couldn't connect Google</b><p>${esc(connectErrorText(params.get("connect_error")))}</p></div></div>`;
    return;
  }
  if (!state.connected) {
    if (state.fullAccess) {
      elBanner.innerHTML = `<div class="banner"><span class="bico">🔗</span><div class="btext"><b>Connect Google Drive</b><p>Link the agency Google account once to power the Assets library. Files stay in Drive.</p></div><a class="abtn" href="/api/drive/oauth/start">Connect Google</a></div>`;
    } else {
      elBanner.innerHTML = `<div class="banner warn"><span class="bico">⏳</span><div class="btext"><b>Drive isn't connected yet</b><p>Ask an agency admin to connect Google Drive, then refresh.</p></div></div>`;
    }
    return;
  }
  elBanner.innerHTML = "";
}

function connectErrorText(reason) {
  const map = {
    no_refresh_token: "Google didn't return a fresh token. Remove the app at myaccount.google.com/permissions, then connect again.",
    bad_state: "The connection link expired. Please try connecting again.",
    not_configured: "Google OAuth credentials aren't set on the server yet.",
    token_exchange_failed: "Google rejected the sign-in. Check the OAuth client and redirect URI.",
  };
  return map[reason] || `Connection failed (${reason}). Try again.`;
}

function renderCrumbs() {
  const parts = [`<span class="crumb${state.stack.length ? "" : " current"}" data-crumb="-1">Assets</span>`];
  state.stack.forEach((s, i) => {
    const current = i === state.stack.length - 1;
    parts.push('<span class="sep">/</span>');
    parts.push(`<span class="crumb${current ? " current" : ""}" data-crumb="${i}">${esc(s.name)}</span>`);
  });
  elCrumbs.innerHTML = parts.join("");
  elCrumbs.querySelectorAll(".crumb").forEach((c) => {
    if (c.classList.contains("current")) return;
    c.addEventListener("click", () => gotoCrumb(Number(c.dataset.crumb)));
  });
}

function renderActions() {
  const a = [];
  if (state.stack.length > 0 && state.connected) {
    a.push(`<button class="abtn ghost" id="act-newfolder">${ICON.plus} New folder</button>`);
    a.push(`<button class="abtn" id="act-upload">${ICON.upload} Upload</button>`);
  }
  if (state.stack.length === 0 && state.fullAccess) {
    a.push(`<button class="abtn ghost" id="act-manage">${ICON.gear} Manage</button>`);
  }
  elActions.innerHTML = a.join("");
  const nf = $("#act-newfolder"); if (nf) nf.addEventListener("click", newFolderPrompt);
  const up = $("#act-upload"); if (up) up.addEventListener("click", () => fileInput.click());
  const mg = $("#act-manage"); if (mg) mg.addEventListener("click", openManage);
}

function renderList() {
  if (!state.connected) { elList.innerHTML = ""; return; }

  // Root: the client folders this admin can see.
  if (state.stack.length === 0) {
    if (state.roots.length === 0) {
      elList.innerHTML = `<div class="empty">${state.fullAccess ? "No client folders mapped yet. Use <b>Manage</b> to add one." : "No folders are shared with you yet."}</div>`;
      return;
    }
    elList.innerHTML = state.roots.map((r) => folderRowHtml(r.name, "Client folder", r.folderId)).join("");
    state.roots.forEach((r) => {
      const row = elList.querySelector(`[data-id="${cssEscape(r.folderId)}"]`);
      if (row) row.addEventListener("click", () => openClient(r));
    });
    return;
  }

  // Inside a folder.
  if (state.loading) { elList.innerHTML = `<div class="spinner">Loading…</div>`; return; }
  const cur = state.stack[state.stack.length - 1];
  const files = cur.files || [];
  if (files.length === 0) {
    elList.innerHTML = `<div class="empty">This folder is empty. Use <b>Upload</b> to add files.</div>`;
    return;
  }
  elList.innerHTML = files.map(fileRowHtml).join("");

  files.forEach((f) => {
    const row = elList.querySelector(`[data-id="${cssEscape(f.id)}"]`);
    if (!row) return;
    if (f.isFolder) {
      row.querySelector(".li").addEventListener("click", () => openSubfolder(f));
    } else {
      const li = row.querySelector(".li");
      if (f.webViewLink) li.addEventListener("click", () => window.open(f.webViewLink, "_blank", "noopener"));
    }
    const dl = row.querySelector("[data-act=download]");
    if (dl) dl.addEventListener("click", (e) => { e.stopPropagation(); window.location = `/api/drive/download?fileId=${encodeURIComponent(f.id)}`; });
    const op = row.querySelector("[data-act=open]");
    if (op) op.addEventListener("click", (e) => { e.stopPropagation(); window.open(f.webViewLink, "_blank", "noopener"); });
    const del = row.querySelector("[data-act=delete]");
    if (del) del.addEventListener("click", (e) => { e.stopPropagation(); deleteItem(f); });
  });
}

function folderRowHtml(name, desc, id) {
  return `<div class="row file-row nav" data-id="${esc(id)}">
    <div class="li"><div class="emoji">${ICON.folder}</div>
      <div class="l"><div class="title">${esc(name)}</div><div class="desc">${esc(desc)}</div></div>
    </div>
    <div class="r"><span class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>
  </div>`;
}

function fileRowHtml(f) {
  if (f.isFolder) {
    return `<div class="row file-row nav" data-id="${esc(f.id)}">
      <div class="li"><div class="emoji">${ICON.folder}</div>
        <div class="l"><div class="title">${esc(f.name)}</div><div class="desc">Folder${f.modifiedTime ? " · " + esc(fmtDate(f.modifiedTime)) : ""}</div></div>
      </div>
      <div class="r"><span class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>
    </div>`;
  }
  const thumb = isImage(f.mimeType) && f.thumbnailLink
    ? `<img src="${esc(f.thumbnailLink)}" alt="" referrerpolicy="no-referrer" />`
    : ICON.file;
  const meta = [fmtSize(f.size), fmtDate(f.modifiedTime)].filter(Boolean).join(" · ");
  return `<div class="row file-row" data-id="${esc(f.id)}">
    <div class="li" style="cursor:${f.webViewLink ? "pointer" : "default"}"><div class="emoji file">${thumb}</div>
      <div class="l"><div class="title">${esc(f.name)}</div><div class="desc">${esc(meta || "File")}</div></div>
    </div>
    <div class="r">
      ${f.webViewLink ? `<button class="iconbtn" data-act="open" title="Open in Drive">${ICON.open}</button>` : ""}
      <button class="iconbtn" data-act="download" title="Download">${ICON.download}</button>
      <button class="iconbtn danger" data-act="delete" title="Move to trash">${ICON.trash}</button>
    </div>
  </div>`;
}

function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

// ---- actions --------------------------------------------------------------

async function deleteItem(f) {
  if (!confirm(`Move "${f.name}" to the Drive trash? You can restore it from Google Drive.`)) return;
  try {
    await api("/api/drive/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: f.id }) });
    toast(`Moved "${f.name}" to trash`);
    loadCurrentFolder();
  } catch (err) { toast(err.message, true); }
}

async function newFolderPrompt() {
  const name = prompt("New folder name");
  if (!name || !name.trim()) return;
  const cur = state.stack[state.stack.length - 1];
  try {
    await api("/api/drive/create-folder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId: cur.folderId, name: name.trim() }) });
    toast("Folder created");
    loadCurrentFolder();
  } catch (err) { toast(err.message, true); }
}

fileInput.addEventListener("change", async () => {
  const cur = state.stack[state.stack.length - 1];
  const files = Array.from(fileInput.files || []);
  fileInput.value = "";
  if (!files.length || !cur) return;
  toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
  let ok = 0;
  for (const file of files) {
    const form = new FormData();
    form.append("folderId", cur.folderId);
    form.append("file", file);
    try { await api("/api/drive/upload", { method: "POST", body: form }); ok++; }
    catch (err) { toast(`${file.name}: ${err.message}`, true); }
  }
  if (ok) toast(`Uploaded ${ok} file${ok > 1 ? "s" : ""}`);
  loadCurrentFolder();
});

// ---- manage (owner only) --------------------------------------------------

function modal(html) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  root.querySelector(".modal-back").addEventListener("click", (e) => { if (e.target.classList.contains("modal-back")) closeModal(); });
  return root.querySelector(".modal");
}
function closeModal() { $("#modal-root").innerHTML = ""; }

async function openManage() {
  const m = modal(`<h2>Manage assets</h2><p class="msub">Loading…</p>`);
  try {
    const [folders, access] = await Promise.all([
      api("/api/drive/admin/client-folders"),
      api("/api/drive/admin/access"),
    ]);
    renderManage(folders.folders || [], access.admins || [], access.folders || []);
  } catch (err) {
    m.innerHTML = `<h2>Manage assets</h2><p class="msub">${esc(err.message)}</p><div class="modal-actions"><button class="abtn ghost" onclick="document.getElementById('modal-root').innerHTML=''">Close</button></div>`;
  }
}

function renderManage(folders, admins, folderOptions) {
  const folderRows = folders.length
    ? folders.map((f) => `<div class="map-item"><span class="mname">${esc(f.name)}</span><span class="mid">${esc(f.folder_id)}</span><button class="iconbtn danger" data-remove="${esc(f.id)}" title="Remove">${ICON.trash}</button></div>`).join("")
    : `<p class="msub">No client folders mapped yet.</p>`;

  const accessRows = admins.map((a) => {
    const checks = folderOptions.map((f) => `<label class="chk"><input type="checkbox" data-grant="${esc(a.id)}|${esc(f.id)}" ${a.folderIds.includes(f.id) ? "checked" : ""} ${a.fullAccess ? "disabled" : ""}/> ${esc(f.name)}</label>`).join("");
    return `<div class="access-admin">
      <div class="ahead"><div><div class="aname">${esc(a.name)}</div><div class="aemail">${esc(a.email)}</div></div>
        <label class="chk"><input type="checkbox" data-full="${esc(a.id)}" ${a.fullAccess ? "checked" : ""}/> Sees everything</label></div>
      <div class="folder-checks" style="${a.fullAccess ? "opacity:.4" : ""}">${checks || '<span class="msub">No folders to assign.</span>'}</div>
    </div>`;
  }).join("");

  const m = $("#modal-root .modal");
  m.innerHTML = `
    <h2>Manage assets</h2>
    <p class="msub">Map a client to its Drive folder, then choose who can see it.</p>

    <div style="font-weight:650;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Client folders</div>
    <div class="map-list">${folderRows}</div>
    <div class="field" style="margin-bottom:10px"><input id="nf-name" placeholder="Client name (e.g. Willis Plumbing)" /></div>
    <div class="field" style="margin-bottom:10px"><input id="nf-url" placeholder="Google Drive folder link or ID" /></div>
    <button class="abtn" id="nf-add">${ICON.plus} Add folder</button>

    <div style="font-weight:650;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:24px 0 12px;">Who sees what</div>
    <div class="access-grid">${accessRows || '<p class="msub">No admins found.</p>'}</div>

    <div class="modal-actions"><button class="abtn ghost" id="mg-close">Done</button></div>`;

  $("#mg-close").addEventListener("click", () => { closeModal(); refresh(); });
  $("#nf-add").addEventListener("click", addFolder);
  m.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeFolder(b.dataset.remove)));
  m.querySelectorAll("[data-full]").forEach((c) => c.addEventListener("change", () => setFull(c.dataset.full, c.checked)));
  m.querySelectorAll("[data-grant]").forEach((c) => c.addEventListener("change", () => {
    const [adminId, folderId] = c.dataset.grant.split("|");
    toggleGrant(adminId, folderId, c.checked);
  }));
}

async function addFolder() {
  const name = $("#nf-name").value.trim();
  const folderUrl = $("#nf-url").value.trim();
  if (!name || !folderUrl) { toast("Name and folder link are both required", true); return; }
  try {
    await api("/api/drive/admin/client-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", name, folderUrl }) });
    toast("Folder added");
    openManage();
  } catch (err) { toast(err.message, true); }
}
async function removeFolder(id) {
  if (!confirm("Remove this folder from the Assets hub? The files stay in Drive.")) return;
  try {
    await api("/api/drive/admin/client-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove", id }) });
    openManage();
  } catch (err) { toast(err.message, true); }
}
async function setFull(adminId, value) {
  try {
    await api("/api/drive/admin/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setFull", adminId, value }) });
    openManage();
  } catch (err) { toast(err.message, true); }
}
async function toggleGrant(adminId, clientFolderId, granted) {
  try {
    await api("/api/drive/admin/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: granted ? "grant" : "revoke", adminId, clientFolderId }) });
  } catch (err) { toast(err.message, true); }
}

// ---- boot -----------------------------------------------------------------

async function refresh() {
  try {
    await loadRoots();
    render();
  } catch (err) {
    elList.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

refresh();
