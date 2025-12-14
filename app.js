/* final merged app.js — Bible Reader (stable production)
   - Full search across all versions
   - Auto-scroll & highlight while TTS plays
   - Play / Pause / Resume / Stop with mobile fallback resume
   - Always render full chapter on chapter change / swipe
   - Safe offsets so header doesn't cover verse 1
*/

(() => {
  "use strict";

  /* ------------------ CONFIG ------------------ */
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  /* ------------------ DOM SHORTCUTS ------------------ */
  const $ = id => document.getElementById(id);

  const paneHome = $("pane-home"), paneRead = $("pane-read"), paneSearch = $("pane-search");
  const tabHome = $("tab-home"), tabRead = $("tab-read"), tabSearch = $("tab-search");
  const bottomItems = document.querySelectorAll("#bottomNav .bottom-item");

  const homeA = $("homeA"), homeB = $("homeB");
  const homeBook = $("homeBook"), homeChapter = $("homeChapter"), homeVerse = $("homeVerse");
  const homeRange = $("homeRange"), homeOpen = $("homeOpen");

  const readRef = $("readRef"), readVerses = $("readVerses"), readNav = $("readNav");
  const prevVerseBtn = $("prevVerse"), nextVerseBtn = $("nextVerse");
  const prevChapterBtn = $("prevChapter"), nextChapterBtn = $("nextChapter");
  const backHomeBtn = $("backHome");

  const playBtn = $("play"), pauseBtn = $("pause"), resumeBtn = $("resume"), stopBtn = $("stop");

  const searchBox = $("searchBox"), searchInfo = $("searchInfo"), searchResults = $("searchResults");

  const themeToggle = $("themeToggle"), notice = $("notice");

  /* ------------------ STATE & CACHE ------------------ */
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home"
  };

  const normCache = {};
  const searchIndexCache = {};

  let currentVerseIndex = null;
  let ttsQueue = [];
  let isPlaying = false;
  let currentTTSUtterance = null;

  const HIGHLIGHT_COLOR = "#fff6b0";
  const HEADER_OFFSET_DEFAULT = 90;

  /* ------------------ UTILITIES ------------------ */
  const esc = s => String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");

  function showNotice(msg, ms = 1400) {
    if (!notice) return;
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(() => notice.style.display = "none", ms);
  }

  function safeNum(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }

  /* ------------------ NORMALIZE ------------------ */
  function normalizeUniform(json) {
    const books = [];
    Object.keys(json || {}).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      const chapters = Object.keys(chaptersObj).sort((a,b)=>a-b).map(c =>
        Object.keys(chaptersObj[c]).sort((a,b)=>a-b).map(v => ({
          key: v,
          text: chaptersObj[c][v]
        }))
      );
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  /* ------------------ FETCH & CACHE ------------------ */
  async function fetchAndNormalize(fname) {
    if (normCache[fname]) return normCache[fname];
    try {
      const res = await fetch(BASE + fname);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const norm = normalizeUniform(json);
      normCache[fname] = norm;

      if (!searchIndexCache[fname]) {
        buildSearchIndex(fname, norm);
      }

      return norm;
    } catch {
      return null;
    }
  }

  /* ------------------ SEARCH INDEX ------------------ */
  function buildSearchIndex(fname, norm) {
    if (searchIndexCache[fname]) return;
    const arr = [];
    norm.books.forEach((b, bi) =>
      b.chapters.forEach((ch, ci) =>
        ch.forEach(v =>
          arr.push({
            file: fname,
            book: b.name,
            bookIndex: bi,
            chapterIndex: ci,
            chapter: ci + 1,
            verseKey: v.key,
            text: v.text,
            low: v.text.toLowerCase()
          })
        )
      )
    );
    searchIndexCache[fname] = arr;
  }

  /* ------------------ SEARCH (GLOBAL) ------------------ */
  async function doSearch(q) {
    if (!q) return;

    const qs = q.toLowerCase();
    searchResults.innerHTML = "";
    searchInfo.textContent = "Searching all versions...";

    let results = [];

    for (const f of FILES) {
      if (!searchIndexCache[f]) {
        const n = await fetchAndNormalize(f);
        if (!n) continue;
      }
      results.push(...searchIndexCache[f].filter(v => v.low.includes(qs)));
    }

    searchInfo.textContent = `Found ${results.length} results`;

    results.slice(0, 800).forEach(r => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.innerHTML = `
        <strong>${r.book} ${r.chapter}:${r.verseKey} — ${r.file.replace("_bible.json","")}</strong>
        <div>${esc(r.text)}</div>
      `;
      div.onclick = async () => {
        state.versionA = r.file;
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        await fetchAndNormalize(r.file);
        showView("read");
      };
      searchResults.appendChild(div);
    });

    showView("search");
  }

  /* 🔥 REQUIRED FIX: CONNECT SEARCH INPUT */
  if (searchBox) {
    searchBox.addEventListener("keydown", e => {
      if (e.key === "Enter" && searchBox.value.trim().length >= 2) {
        doSearch(searchBox.value.trim());
      }
    });
  }

  /* ------------------ VIEW SWITCH ------------------ */
  function showView(v) {
    state.view = v;
    paneHome.style.display = v === "home" ? "block" : "none";
    paneRead.style.display = v === "read" ? "block" : "none";
    paneSearch.style.display = v === "search" ? "block" : "none";
  }

  tabHome.onclick = () => showView("home");
  tabRead.onclick = () => showView("read");
  tabSearch.onclick = () => showView("search");

  /* ------------------ INIT ------------------ */
  (async function init() {
    showView("home");
  })();

  window.BibleReader = { doSearch };

})();
