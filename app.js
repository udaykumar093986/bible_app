// app.js - Bible Reader SPA (FULLY UPDATED + SEARCH FIXED + SINGLE/PARALLEL FIXED)

(async function () {
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",

    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  /* DOM REFS */
  const tabs = {
    home: document.getElementById("tab-home"),
    read: document.getElementById("tab-read"),
    search: document.getElementById("tab-search"),
  };
  const panes = {
    home: document.getElementById("pane-home"),
    read: document.getElementById("pane-read"),
    search: document.getElementById("pane-search"),
  };

  const homeA = document.getElementById("homeA");
  const homeB = document.getElementById("homeB");
  const homeBook = document.getElementById("homeBook");
  const homeChapter = document.getElementById("homeChapter");
  const homeVerse = document.getElementById("homeVerse");
  const homeRange = document.getElementById("homeRange");
  const homeOpen = document.getElementById("homeOpen");

  const readRef = document.getElementById("readRef");
  const readVerses = document.getElementById("readVerses");
  const readNav = document.getElementById("readNav");

  const prevVerseBtn = document.getElementById("prevVerse");
  const nextVerseBtn = document.getElementById("nextVerse");
  const prevChapterBtn = document.getElementById("prevChapter");
  const nextChapterBtn = document.getElementById("nextChapter");

  const playBtn = document.getElementById("play");
  const pauseBtn = document.getElementById("pause");
  const resumeBtn = document.getElementById("resume");
  const stopBtn = document.getElementById("stop");
  const backHomeBtn = document.getElementById("backHome");

  const searchBox = document.getElementById("searchBox");
  const searchInfo = document.getElementById("searchInfo");
  const searchResults = document.getElementById("searchResults");

  const notice = document.getElementById("notice");
  const bottomNav = document.getElementById("bottomNav");
  const bottomItems = bottomNav.querySelectorAll(".bottom-item");

  /* CACHES & STATE */
  let rawCache = {};
  let normCache = {};
  let searchIndexCache = {};

  let state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home",
  };

  /* UTILITIES */
  function showNotice(msg, ms = 1400) {
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(() => (notice.style.display = "none"), ms);
  }

  function esc(s) {
    if (!s) return "";
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function sortKeys(keys) {
    return keys.sort(
      (a, b) =>
        (parseInt(a.split("-")[0]) || 0) - (parseInt(b.split("-")[0]) || 0)
    );
  }

  function saveVersions() {
    try {
      localStorage.setItem("lastA", state.versionA || "");
      localStorage.setItem("lastB", state.versionB || "");
    } catch {}
  }

  function loadVersions() {
    try {
      const a = localStorage.getItem("lastA");
      const b = localStorage.getItem("lastB");
      if (a) state.versionA = a;
      if (b) state.versionB = b;
    } catch {}
  }

  /* NORMALIZE JSON FORMAT */
  function normalize(json) {
    if (!json) return { books: [] };

    if (json.books && Array.isArray(json.books)) {
      return {
        books: json.books.map((b) => ({
          name: b.name || b.book || "Unknown",
          chapters: (b.chapters || []).map((ch) => {
            if (Array.isArray(ch))
              return ch.map((t, i) => ({ key: String(i + 1), text: t }));

            if (typeof ch === "object") {
              const ks = sortKeys(Object.keys(ch));
              return ks.map((k) => ({ key: k, text: ch[k] }));
            }
            return [];
          }),
        })),
      };
    }

    const books = [];
    for (const bk of Object.keys(json)) {
      const chObj = json[bk];
      const ckeys = Object.keys(chObj).sort((a, b) => Number(a) - Number(b));
      const chapters = [];

      for (const ck of ckeys) {
        const ch = chObj[ck];
        const vks = sortKeys(Object.keys(ch));
        chapters.push(vks.map((vk) => ({ key: vk, text: ch[vk] })));
      }
      books.push({ name: bk, chapters });
    }
    return { books };
  }

  /* FETCH */
  async function fetchAndNormalize(fname) {
    if (!fname) return null;
    if (normCache[fname]) return normCache[fname];

    const res = await fetch(BASE + fname);
    const json = await res.json();
    const norm = normalize(json);
    normCache[fname] = norm;
    buildSearchIndex(fname, norm);
    return norm;
  }

  /* BUILD SEARCH INDEX */
  function buildSearchIndex(fname, norm) {
    if (searchIndexCache[fname]) return searchIndexCache[fname];

    const arr = [];
    norm.books.forEach((b, bi) => {
      b.chapters.forEach((ch, ci) => {
        ch.forEach((v, vi) => {
          arr.push({
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci + 1,
            verseKey: v.key,
            text: v.text,
            low: v.text.toLowerCase(),
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
    return arr;
  }

  /* POPULATE VERSION DROPDOWNS */
  function populateVersions() {
    homeA.innerHTML = `<option value="">Version A</option>`;
    homeB.innerHTML = `<option value="">NONE</option>`;

    FILES.forEach((f) => {
      const label = f.replace("_bible.json", "").replace(".json", "").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  /* TABS */
  function activateTab(view) {
    state.view = view;

    panes.home.style.display = view === "home" ? "block" : "none";
    panes.read.style.display = view === "read" ? "block" : "none";
    panes.search.style.display = view === "search" ? "block" : "none";

    Object.values(tabs).forEach((t) => t.classList.remove("active"));
    tabs[view].classList.add("active");

    bottomItems.forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === view)
    );

    if (view === "read") renderRead();
    if (view === "search") {
      searchResults.innerHTML = "";
      searchInfo.textContent = "";
    }
  }

  Object.keys(tabs).forEach((k) =>
    tabs[k].addEventListener("click", () => activateTab(k))
  );
  bottomItems.forEach((b) =>
    b.addEventListener("click", () => activateTab(b.dataset.tab))
  );

  /* VERSION SELECT HANDLING */
  homeA.addEventListener("change", async function () {
    if (!this.value) {
      state.versionA = null;
      showNotice("Select Version A");
      return;
    }
    state.versionA = this.value;
    saveVersions();

    await populateBooksA(state.versionA);
    showNotice(this.options[this.selectedIndex].text + " loaded (A)");
  });

  homeB.addEventListener("change", function () {
    if (!this.value) {
      state.versionB = null; // → single version
      showNotice("Using only Version A");
      saveVersions();
      return;
    }
    state.versionB = this.value;
    saveVersions();
    showNotice(this.options[this.selectedIndex].text + " loaded (B)");
  });

  async function populateBooksA(fname) {
    const n = await fetchAndNormalize(fname);
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeBook.addEventListener("change", async function () {
    const bi = Number(this.value);
    const n = normCache[state.versionA];
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    const count = n.books[bi].chapters.length;
    for (let i = 1; i <= count; i++)
      homeChapter.appendChild(new Option(i, i - 1));
  });

  homeChapter.addEventListener("change", async function () {
    const bi = Number(homeBook.value);
    const ci = Number(this.value);
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    const count = n.books[bi].chapters[ci].length;
    for (let v = 1; v <= count; v++)
      homeVerse.appendChild(new Option(v, v - 1));
  });

  /* OPEN READ */
  homeOpen.addEventListener("click", async function () {
    if (!homeA.value) return showNotice("Select Version A");

    state.versionA = homeA.value;
    state.versionB = homeB.value || null;
    if (state.versionB === "") state.versionB = null;

    state.bookIndex = homeBook.value ? Number(homeBook.value) : 0;
    state.chapterIndex = homeChapter.value ? Number(homeChapter.value) : 0;

    if (homeRange.value.trim()) {
      state.verseKey = homeRange.value.trim();
    } else if (homeVerse.value) {
      state.verseKey = String(Number(homeVerse.value) + 1);
    } else {
      state.verseKey = null;
    }

    await fetchAndNormalize(state.versionA);
    if (state.versionB) await fetchAndNormalize(state.versionB);

    activateTab("read");
    renderRead();
    updateUrl();
  });

  /* RENDER READ */
  function renderRead() {
    const A = state.versionA;
    if (!A) {
      readRef.textContent = "Select Version A";
      return;
    }

    const nA = normCache[A];
    const book = nA.books[state.bookIndex];
    const chapA = book.chapters[state.chapterIndex];

    let chapB = [];
    if (state.versionB && normCache[state.versionB]) {
      chapB = normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex];
    }

    readRef.textContent = book.name + " " + (state.chapterIndex + 1);
    readVerses.innerHTML = "";

    if (state.verseKey) {
      const exact = chapA.findIndex((v) => v.key === state.verseKey);
      if (exact !== -1) {
        renderVerse(exact, chapA, chapB);
        showReadNav(true, exact);
        return;
      }
      const m = state.verseKey.match(/^(\d+)-(\d+)$/);
      if (m) {
        const start = Number(m[1]) - 1;
        const end = Number(m[2]) - 1;
        for (let i = start; i <= end; i++)
          renderVerse(i, chapA, chapB);
        showReadNav(true, start);
        return;
      }
    }

    const len = Math.max(chapA.length, chapB.length);
    for (let i = 0; i < len; i++)
      renderVerse(i, chapA, chapB);

    showReadNav(false);
  }

  function renderVerse(idx, chapA, chapB) {
    const va = chapA[idx];
    const vb = chapB[idx];

    const A = state.versionA
      ? state.versionA.replace("_bible.json", "").replace(".json", "").toUpperCase()
      : "";

    const B = state.versionB
      ? state.versionB.replace("_bible.json", "").replace(".json", "").toUpperCase()
      : null;

    const block = document.createElement("div");
    block.className = "verse-block";

    let html = `<div class="verse-num">Verse ${va?.key || vb?.key}</div>`;
    html += `<div class="verse-label">${A}</div>`;
    html += `<div class="verse-text">${esc(va?.text || "")}</div>`;

    if (state.versionB) {
      html += `<div class="verse-label">${B}</div>`;
      html += `<div class="verse-secondary">${esc(vb?.text || "")}</div>`;
    }

    block.innerHTML = html;
    readVerses.appendChild(block);
  }

  /* READ NAVIGATION */
  let currentVerseIndex = null;

  function showReadNav(show, idx = null) {
    readNav.style.display = show ? "flex" : "none";
    currentVerseIndex = idx;
  }

  /* BACK BUTTON */
  backHomeBtn.addEventListener("click", () => {
    activateTab("home");
    updateUrl();
  });

  /* TTS */
  let ttsQueue = [];
  function buildTTS() {
    ttsQueue = [];
    const nA = normCache[state.versionA];
    const ch = nA.books[state.bookIndex].chapters[state.chapterIndex];

    if (state.verseKey) {
      const exact = ch.findIndex((v) => v.key === state.verseKey);
      if (exact !== -1) {
        ttsQueue.push({ text: ch[exact].text, idx: exact });
        return;
      }
    }

    ch.forEach((v, i) => ttsQueue.push({ text: v.text, idx: i }));
  }

  function speakNext() {
    if (!ttsQueue.length) return;
    const item = ttsQueue.shift();

    const u = new SpeechSynthesisUtterance(item.text);
    u.onend = speakNext;
    speechSynthesis.speak(u);
  }

  playBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    buildTTS();
    speakNext();
  });

  pauseBtn.addEventListener("click", () => speechSynthesis.pause());
  resumeBtn.addEventListener("click", () => speechSynthesis.resume());
  stopBtn.addEventListener("click", () => speechSynthesis.cancel());

  /* SEARCH */
  searchBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(searchBox.value.trim().toLowerCase());
  });

  async function doSearch(q) {
    searchResults.innerHTML = "";
    searchInfo.textContent = "";

    if (!q) return;

    if (!state.versionA) {
      searchInfo.textContent = "Select Version A first";
      activateTab("home");
      return;
    }

    await fetchAndNormalize(state.versionA);
    const idx = searchIndexCache[state.versionA];

    const results = idx.filter((r) => r.low.includes(q)).slice(0, 250);
    searchInfo.textContent = `Found ${results.length}`;

    if (!results.length) {
      searchResults.innerHTML =
        `<div style="padding:8px;color:#666">No results</div>`;
      return;
    }

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "ig");

    const frag = document.createDocumentFragment();
    results.forEach((r) => {
      const div = document.createElement("div");
      div.className = "search-item";

      const highlighted = esc(r.text).replace(re, (m) => `<span class="highlight">${m}</span>`);

      div.innerHTML = `
        <strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong>
        <div style="margin-top:6px">${highlighted}</div>
        <small style="color:#666">Click to open</small>
      `;

      div.addEventListener("click", async () => {
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;

        await fetchAndNormalize(state.versionA);
        activateTab("read");
        renderRead();
        updateUrl();
      });

      frag.appendChild(div);
    });

    searchResults.appendChild(frag);
  }

  /* URL SYNC */
  function updateUrl() {
    const p = new URLSearchParams();

    if (state.versionA) p.set("versionA", state.versionA);
    if (state.versionB) p.set("versionB", state.versionB);

    p.set("bookIndex", state.bookIndex);
    p.set("chapter", state.chapterIndex + 1);

    if (state.verseKey) p.set("verse", state.verseKey);
    p.set("view", state.view);

    history.replaceState({}, "", "?" + p.toString());
  }

  /* INITIAL LOAD */
  async function initialLoad() {
    populateVersions();
    loadVersions();

    const params = new URLSearchParams(location.search);

    const vA = params.get("versionA") || state.versionA;
    const vB = params.get("versionB") || state.versionB;

    if (vA) {
      state.versionA = vA;
      homeA.value = vA;

      await populateBooksA(vA);
      await fetchAndNormalize(vA);
    }

    if (vB) {
      state.versionB = vB;
      homeB.value = vB;
      await fetchAndNormalize(vB);
    }

    state.bookIndex = Number(params.get("bookIndex") || 0);
    state.chapterIndex = Number(params.get("chapter") || 1) - 1;
    state.verseKey = params.get("verse") || null;

    activateTab(params.get("view") || "home");
  }

  await initialLoad();
})();
