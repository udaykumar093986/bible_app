(() => {

  /* -------------------------
     CONFIG
  ------------------------- */
  const BASE =
    "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";

  const FILES = [
    "AMP_bible.json", "CSB_bible.json", "ESV_bible.json", "KJV_bible.json",
    "NIV_bible.json", "NKJV_bible.json", "NLT_bible.json",
    "afrikaans_bible.json", "bengali_bible.json", "gujarati_bible.json", "hindi_bible.json",
    "hungarian_bible.json", "indonesian_bible.json", "kannada_bible.json",
    "malayalam_bible.json", "marathi_bible.json", "nepali_bible.json",
    "odia_bible.json", "punjabi_bible.json", "sepedi_bible.json",
    "tamil_bible.json", "telugu_bible.json", "xhosa_bible.json", "zulu_bible.json"
  ];

  /* -------------------------
     DOM REFS
  ------------------------- */
  const tabs = {
    home: document.getElementById("tab-home"),
    read: document.getElementById("tab-read"),
    search: document.getElementById("tab-search"), // IMPORTANT
  };

  const panes = {
    home: document.getElementById("pane-home"),
    read: document.getElementById("pane-read"),
    search: document.getElementById("pane-search"),
  };

  const notice = document.getElementById("notice");

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

  const searchBox = document.getElementById("searchBox");
  const searchInfo = document.getElementById("searchInfo");
  const searchResults = document.getElementById("searchResults");

  /* -------------------------
     STATE & CACHE
  ------------------------- */
  let normCache = {};
  let searchIndexCache = {};

  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home",
  };

  /* -------------------------
     HELPERS
  ------------------------- */

  function showNotice(msg, ms = 1400) {
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(() => (notice.style.display = "none"), ms);
  }

  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  /* -------------------------
     NORMALIZE JSON (UNIFORM)
  ------------------------- */
  function normalizeUniform(json) {
    const books = [];

    for (const bookName of Object.keys(json)) {
      const chaptersObj = json[bookName] || {};

      const chapterKeys = Object.keys(chaptersObj)
        .map(Number)
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)
        .map(String);

      const chapters = chapterKeys.map((ck) => {
        const versesObj = chaptersObj[ck] || {};

        const verseKeys = Object.keys(versesObj)
          .map(Number)
          .filter((n) => !isNaN(n))
          .sort((a, b) => a - b)
          .map(String);

        return verseKeys.map((vk) => ({
          key: vk,
          text: versesObj[vk] || "",
        }));
      });

      books.push({ name: bookName, chapters });
    }

    return { books };
  }

  /* -------------------------
     FETCH JSON + NORMALIZE
  ------------------------- */
  async function fetchAndNormalize(fname) {
    if (!fname) return null;
    if (normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("Failed to load:", url);
      showNotice("Cannot load " + fname);
      return null;
    }

    const json = await res.json();
    const norm = normalizeUniform(json);

    normCache[fname] = norm;
    buildSearchIndex(fname, norm);

    return norm;
  }

  /* -------------------------
     BUILD SEARCH INDEX
  ------------------------- */
  function buildSearchIndex(fname, norm) {
    const arr = [];

    norm.books.forEach((book, bi) => {
      book.chapters.forEach((ch, ci) => {
        ch.forEach((v, vi) => {
          arr.push({
            book: book.name,
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            verseKey: v.key,
            chapter: ci + 1,
            text: v.text,
            low: v.text.toLowerCase(),
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
  }

  /* -------------------------
     VERSIONS DROPDOWN
  ------------------------- */
  function populateVersions() {
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";

    FILES.forEach((f) => {
      const label = f.replace("_bible.json", "").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  /* -------------------------
     TAB SWITCHING (FIXED)
  ------------------------- */

  function activateTab(name) {
    state.view = name;

    panes.home.style.display = name === "home" ? "block" : "none";
    panes.read.style.display = name === "read" ? "block" : "none";
    panes.search.style.display = name === "search" ? "block" : "none";

    Object.values(tabs).forEach((t) => t?.classList.remove("active"));
    tabs[name]?.classList.add("active");

    if (name === "search") {
      searchBox.focus();
    }
    if (name === "read") {
      renderRead();
    }
  }

  /* ---- ALWAYS attach click handlers (fix for your issue) ---- */
  tabs.home?.addEventListener("click", () => activateTab("home"));
  tabs.read?.addEventListener("click", () => activateTab("read"));

  /* ---- THE FIX ---- */
  tabs.search?.addEventListener("click", () => activateTab("search"));

  /* HARD FAILSAFE if tab-search was misnamed */
  document.querySelector("[data-tab='search']")?.addEventListener("click", () =>
    activateTab("search")
  );

  /* -------------------------
     POPULATE BOOK LIST
  ------------------------- */
  homeA.addEventListener("change", async function () {
    state.versionA = this.value;
    await fetchAndNormalize(state.versionA);
    populateBooks();
  });

  homeB.addEventListener("change", async function () {
    state.versionB = this.value || null;
    if (state.versionB) await fetchAndNormalize(state.versionB);
  });

  function populateBooks() {
    const n = normCache[state.versionA];
    if (!n) return;

    homeBook.innerHTML = "<option>Book</option>";
    n.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));

    homeChapter.innerHTML = "<option>Chapter</option>";
    homeVerse.innerHTML = "<option>Verse</option>";
  }

  homeBook.addEventListener("change", function () {
    const bi = Number(this.value);
    const n = normCache[state.versionA];

    homeChapter.innerHTML = "<option>Chapter</option>";
    const count = n.books[bi].chapters.length;

    for (let i = 1; i <= count; i++) {
      homeChapter.appendChild(new Option(i, i - 1));
    }

    homeVerse.innerHTML = "<option>Verse</option>";
  });

  homeChapter.addEventListener("change", function () {
    const bi = Number(homeBook.value);
    const ci = Number(this.value);
    const n = normCache[state.versionA];

    const count = n.books[bi].chapters[ci].length;

    homeVerse.innerHTML = "<option>Verse</option>";

    for (let v = 1; v <= count; v++) {
      homeVerse.appendChild(new Option(v, v - 1));
    }
  });

  /* -------------------------
     OPEN READER
  ------------------------- */
  homeOpen.addEventListener("click", async () => {
    if (!state.versionA) return showNotice("Select Version A");

    await fetchAndNormalize(state.versionA);
    if (state.versionB) await fetchAndNormalize(state.versionB);

    state.bookIndex = Number(homeBook.value || 0);
    state.chapterIndex = Number(homeChapter.value || 0);

    state.verseKey =
      homeRange.value.trim() || (homeVerse.value ? Number(homeVerse.value) + 1 : null);

    activateTab("read");
  });

  /* -------------------------
     RENDER READER
  ------------------------- */
  function renderRead() {
    const nA = normCache[state.versionA];
    const book = nA.books[state.bookIndex];
    const chapA = book.chapters[state.chapterIndex];

    const chapB =
      state.versionB &&
      normCache[state.versionB]?.books[state.bookIndex]?.chapters[state.chapterIndex]
        ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex]
        : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = "";

    chapA.forEach((v, i) => {
      const vb = chapB[i];

      const block = document.createElement("div");
      block.className = "verse-block";

      block.innerHTML = `
        <div class="verse-num">Verse ${v.key}</div>
        <div class="verse-label">${state.versionA.replace("_bible.json", "")}</div>
        <div class="verse-text">${esc(v.text)}</div>
        ${
          state.versionB
            ? `
            <div class="verse-label">${state.versionB.replace("_bible.json", "")}</div>
            <div class="verse-secondary">${esc(vb?.text || "")}</div>
          `
            : ""
        }
      `;

      readVerses.appendChild(block);
    });
  }

  /* -------------------------
     CHAPTER NAVIGATION
  ------------------------- */
  prevChapterBtn.addEventListener("click", () => {
    if (state.chapterIndex > 0) {
      state.chapterIndex--;
      renderRead();
    }
  });

  nextChapterBtn.addEventListener("click", () => {
    const count =
      normCache[state.versionA].books[state.bookIndex].chapters.length;
    if (state.chapterIndex + 1 < count) {
      state.chapterIndex++;
      renderRead();
    }
  });

  backHomeBtn.addEventListener("click", () => activateTab("home"));

  /* -------------------------
     SEARCH ENGINE
  ------------------------- */
  searchBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(searchBox.value.toLowerCase());
  });

  async function performSearch(q) {
    if (!state.versionA) return showNotice("Select Version A");

    await fetchAndNormalize(state.versionA);

    const index = searchIndexCache[state.versionA] || [];
    const results = index.filter((v) => v.low.includes(q)).slice(0, 200);

    searchInfo.textContent = `Found ${results.length}`;
    searchResults.innerHTML = "";

    results.forEach((r) => {
      const item = document.createElement("div");
      item.className = "search-item";

      item.innerHTML = `
        <strong>${r.book} ${r.chapter}:${r.verseKey}</strong>
        <div>${esc(r.text)}</div>
      `;

      item.addEventListener("click", () => {
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        activateTab("read");
      });

      searchResults.appendChild(item);
    });

    activateTab("search");
  }

  /* -------------------------
     STARTUP
  ------------------------- */
  activateTab("home");
})();
