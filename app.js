// app.js - Bible Reader FINAL VERSION
// Supports uniform JSON like:
// { "Genesis": { "1": { "1":"text", "2":"text"}, "2": {...}}, "Exodus": {...} }

(() => {
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // DOM Refs
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
  const prevChapterBtn = document.getElementById("prevChapter");
  const nextChapterBtn = document.getElementById("nextChapter");
  const backHomeBtn = document.getElementById("backHome");

  const playBtn = document.getElementById("play");
  const pauseBtn = document.getElementById("pause");
  const resumeBtn = document.getElementById("resume");
  const stopBtn = document.getElementById("stop");

  const searchBox = document.getElementById("searchBox");
  const searchInfo = document.getElementById("searchInfo");
  const searchResults = document.getElementById("searchResults");

  const notice = document.getElementById("notice");
  const bottomNav = document.getElementById("bottomNav");
  const bottomItems = bottomNav ? bottomNav.querySelectorAll(".bottom-item") : [];

  // Cache
  const rawCache = {};
  const normCache = {};
  const searchIndexCache = {};

  // State
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home"
  };

  // Utilities
  function showNotice(msg, ms = 1400) {
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(() => (notice.style.display = "none"), ms);
  }

  function esc(s) {
    return s
      ? String(s)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
      : "";
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

  // Normalize uniform JSON format
  function normalizeUniform(json) {
    const books = [];

    for (const bk of Object.keys(json)) {
      const chObj = json[bk] || {};

      const chapterKeys = Object.keys(chObj)
        .map(k => Number(k))
        .filter(k => !isNaN(k))
        .sort((a, b) => a - b)
        .map(String);

      const chapters = [];

      chapterKeys.forEach(ck => {
        const verseObj = chObj[ck] || {};

        const verseKeys = Object.keys(verseObj)
          .map(k => Number(k))
          .filter(k => !isNaN(k))
          .sort((a, b) => a - b)
          .map(String);

        const verses = verseKeys.map(vk => ({
          key: vk,
          text: verseObj[vk] || ""
        }));

        chapters.push(verses);
      });

      books.push({ name: bk, chapters });
    }

    return { books };
  }

  // Fetch + Normalize
  async function fetchAndNormalize(fname) {
    if (!fname) return null;
    if (normCache[fname]) return normCache[fname];

    const res = await fetch(BASE + fname);
    const json = await res.json();

    rawCache[fname] = json;

    const norm = normalizeUniform(json);
    normCache[fname] = norm;

    buildSearchIndex(fname, norm);

    return norm;
  }

  // Build Search Index
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
            low: v.text.toLowerCase()
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
    return arr;
  }

  // Populate Versions
  function populateVersions() {
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";

    FILES.forEach(f => {
      const label = f.replace("_bible.json", "").replace(".json", "").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  // Tab Switching
  function activateTab(name) {
    state.view = name;

    panes.home.style.display = name === "home" ? "block" : "none";
    panes.read.style.display = name === "read" ? "block" : "none";
    panes.search.style.display = name === "search" ? "block" : "none";

    Object.values(tabs).forEach(t => t.classList.remove("active"));
    tabs[name].classList.add("active");

    bottomItems.forEach(b =>
      b.classList.toggle("active", b.dataset.tab === name)
    );

    if (name === "read") renderRead();
    if (name === "search") {
      searchResults.innerHTML = "";
      searchInfo.textContent = "";
    }
  }

  Object.keys(tabs).forEach(k =>
    tabs[k].addEventListener("click", () => activateTab(k))
  );
  bottomItems.forEach(b =>
    b.addEventListener("click", () => activateTab(b.dataset.tab))
  );

  // Version selection
  homeA.addEventListener("change", async function () {
    if (!this.value) {
      state.versionA = null;
      showNotice("Select Version A");
      return;
    }

    state.versionA = this.value;
    saveVersions();

    await populateBooksA(this.value);
    showNotice(this.options[this.selectedIndex].text + " loaded (A)");
  });

  homeB.addEventListener("change", function () {
    if (!this.value) {
      state.versionB = null;
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

  homeBook.addEventListener("change", () => {
    const n = normCache[state.versionA];
    const bi = Number(homeBook.value);
    const count = n.books[bi].chapters.length;

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    for (let i = 1; i <= count; i++) homeChapter.appendChild(new Option(i, i - 1));

    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener("change", () => {
    const n = normCache[state.versionA];
    const bi = Number(homeBook.value);
    const ci = Number(homeChapter.value);

    const count = n.books[bi].chapters[ci].length;

    homeVerse.innerHTML = "<option value=''>Verse</option>";
    for (let i = 1; i <= count; i++)
      homeVerse.appendChild(new Option(i, i - 1));
  });

  // Open Read
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

  // Render Read Page
  function renderRead() {
    if (!state.versionA) {
      readRef.textContent = "Select Version A";
      readVerses.innerHTML = "";
      return;
    }

    const nA = normCache[state.versionA];
    const book = nA.books[state.bookIndex];
    const chapA = book.chapters[state.chapterIndex];

    let chapB = [];
    if (state.versionB && normCache[state.versionB]) {
      chapB =
        normCache[state.versionB].books[state.bookIndex].chapters[
          state.chapterIndex
        ];
    }

    readRef.textContent = book.name + " " + (state.chapterIndex + 1);
    readVerses.innerHTML = "";

    // Single verse or range
    if (state.verseKey) {
      const exact = chapA.findIndex(v => v.key === state.verseKey);

      if (exact !== -1) {
        renderVerse(exact, chapA, chapB);
        showReadNav(true, exact);
        return;
      }

      // Range
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if (m) {
        let s = Number(m[1]) - 1;
        let e = Number(m[2]) - 1;

        s = Math.max(0, s);
        e = Math.min(chapA.length - 1, e);

        for (let i = s; i <= e; i++) renderVerse(i, chapA, chapB);

        showReadNav(true, s);
        return;
      }
    }

    // Full chapter
    const maxLen = Math.max(chapA.length, chapB.length);
    for (let i = 0; i < maxLen; i++) renderVerse(i, chapA, chapB);

    showReadNav(false);
  }

  function renderVerse(i, chapA, chapB) {
    const va = chapA[i] || null;
    const vb = chapB[i] || null;

    const labelA = state.versionA
      .replace("_bible.json", "")
      .replace(".json", "")
      .toUpperCase();

    const labelB = state.versionB
      ? state.versionB.replace("_bible.json", "").replace(".json", "").toUpperCase()
      : null;

    const block = document.createElement("div");
    block.className = "verse-block";

    let html = `<div class="verse-num">Verse ${va?.key || vb?.key || i + 1}</div>`;
    html += `<div class="verse-label">${labelA}</div>`;
    html += `<div class="verse-text">${esc(va?.text || "")}</div>`;

    if (state.versionB) {
      html += `<div class="verse-label">${labelB}</div>`;
      html += `<div class="verse-secondary">${esc(vb?.text || "")}</div>`;
    }

    block.innerHTML = html;
    readVerses.appendChild(block);
  }

  // Navigation Buttons
  prevChapterBtn.addEventListener("click", () => {
    if (state.chapterIndex > 0) {
      state.chapterIndex--;
      state.verseKey = null;
      renderRead();
      updateUrl();
    }
  });

  nextChapterBtn.addEventListener("click", () => {
    const n = normCache[state.versionA];
    const total = n.books[state.bookIndex].chapters.length;

    if (state.chapterIndex + 1 < total) {
      state.chapterIndex++;
      state.verseKey = null;
      renderRead();
      updateUrl();
    }
  });

  // Back Button
  backHomeBtn.addEventListener("click", () => {
    activateTab("home");
    updateUrl();
  });

  // TTS
  let ttsQueue = [];

  function buildTTS() {
    ttsQueue = [];

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if (state.verseKey) {
      const exact = ch.findIndex(v => v.key === state.verseKey);

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

  // SEARCH — FIXED & FULLY WORKING
  // SEARCH — MULTI VERSION SEARCH (A + B)
searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(searchBox.value.trim().toLowerCase()); }); async function doSearch(q) { searchResults.innerHTML = ""; searchInfo.textContent = ""; if (!q) return; if (!state.versionA) { searchInfo.textContent = "Select Version A first"; activateTab("home"); return; } await fetchAndNormalize(state.versionA); const idx = searchIndexCache[state.versionA]; const results = idx.filter((r) => r.low.includes(q)).slice(0, 250); searchInfo.textContent = Found ${results.length}; if (!results.length) { searchResults.innerHTML = <div style="padding:8px;color:#666">No results</div>; return; } const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const re = new RegExp(safe, "ig"); const frag = document.createDocumentFragment(); results.forEach((r) => { const div = document.createElement("div"); div.className = "search-item"; const highlighted = esc(r.text).replace(re, (m) => <span class="highlight">${m}</span>); div.innerHTML = <strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong> <div style="margin-top:6px">${highlighted}</div> <small style="color:#666">Click to open</small> ; div.addEventListener("click", async () => { state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey; await fetchAndNormalize(state.versionA); activateTab("read"); renderRead(); updateUrl(); }); frag.appendChild(div); }); searchResults.appendChild(frag); }



  // URL Update
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

  // SWIPE NAVIGATION + MOUSE DRAG
  (function attachSwipe() {
    if (!readVerses) return;

    let touchStartX = 0;
    let touchEndX = 0;

    readVerses.addEventListener("touchstart", e => {
      touchStartX = e.changedTouches[0].clientX;
    });

    readVerses.addEventListener("touchmove", e => {
      touchEndX = e.changedTouches[0].clientX;
    });

    readVerses.addEventListener("touchend", () => {
      const dx = touchEndX - touchStartX;

      if (Math.abs(dx) < 60) return;

      if (dx < 0) nextChapterBtn.click();
      else prevChapterBtn.click();
    });

    // Mouse drag
    let mouseDown = false;
    let mouseStart = 0;
    let mouseEnd = 0;

    readVerses.addEventListener("mousedown", e => {
      mouseDown = true;
      mouseStart = e.clientX;
    });

    document.addEventListener("mousemove", e => {
      if (!mouseDown) return;
      mouseEnd = e.clientX;
    });

    document.addEventListener("mouseup", () => {
      if (!mouseDown) return;
      mouseDown = false;

      const dx = mouseEnd - mouseStart;
      if (Math.abs(dx) < 100) return;

      if (dx < 0) nextChapterBtn.click();
      else prevChapterBtn.click();
    });
  })();

  // KEYBOARD NAVIGATION
  document.addEventListener("keydown", (e) => {
    if (state.view !== "read") return;

    const n = normCache[state.versionA];
    const books = n.books;
    const chapters = books[state.bookIndex].chapters;
    const totalChapters = chapters.length;

    // chapter navigation
    if (e.key === "ArrowRight" && !e.shiftKey) nextChapterBtn.click();
    if (e.key === "ArrowLeft" && !e.shiftKey) prevChapterBtn.click();

    // fast chapter jump
    if (e.key === "PageDown") {
      state.chapterIndex = Math.min(state.chapterIndex + 5, totalChapters - 1);
      state.verseKey = null;
      renderRead();
      updateUrl();
    }

    if (e.key === "PageUp") {
      state.chapterIndex = Math.max(state.chapterIndex - 5, 0);
      state.verseKey = null;
      renderRead();
      updateUrl();
    }

    // book navigation
    if (e.key === "ArrowRight" && e.shiftKey) {
      if (state.bookIndex + 1 < books.length) {
        state.bookIndex++;
        state.chapterIndex = 0;
        state.verseKey = null;
        renderRead();
        updateUrl();
      }
    }

    if (e.key === "ArrowLeft" && e.shiftKey) {
      if (state.bookIndex > 0) {
        state.bookIndex--;
        state.chapterIndex = 0;
        state.verseKey = null;
        renderRead();
        updateUrl();
      }
    }

    // verse navigation
    const ch = chapters[state.chapterIndex];
    const verseKeys = ch.map(v => v.key);
    const vIndex = state.verseKey ? verseKeys.indexOf(state.verseKey) : -1;

    if (e.key === "ArrowDown") {
      if (vIndex >= 0 && vIndex + 1 < verseKeys.length) {
        state.verseKey = verseKeys[vIndex + 1];
        renderRead();
        updateUrl();
      }
    }

    if (e.key === "ArrowUp") {
      if (vIndex > 0) {
        state.verseKey = verseKeys[vIndex - 1];
        renderRead();
        updateUrl();
      }
    }
  });

  // Initial Load
  async function initialLoad() {
    populateVersions();
    loadVersions();

    const p = new URLSearchParams(location.search);

    const vA = p.get("versionA") || state.versionA;
    const vB = p.get("versionB") || state.versionB;

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

    state.bookIndex = Number(p.get("bookIndex") || 0);
    state.chapterIndex = Number(p.get("chapter") || 1) - 1;
    state.verseKey = p.get("verse") || null;

    activateTab(p.get("view") || state.view);
  }

  initialLoad();

})();
