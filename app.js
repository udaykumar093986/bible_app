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

  // panes / tabs
  const paneHome = $("pane-home"), paneRead = $("pane-read"), paneSearch = $("pane-search");
  const tabHome = $("tab-home"), tabRead = $("tab-read"), tabSearch = $("tab-search");
  const bottomItems = document.querySelectorAll("#bottomNav .bottom-item");

  // home selects
  const homeA = $("homeA"), homeB = $("homeB");
  const homeBook = $("homeBook"), homeChapter = $("homeChapter"), homeVerse = $("homeVerse");
  const homeRange = $("homeRange"), homeOpen = $("homeOpen");

  // reader
  const readRef = $("readRef"), readVerses = $("readVerses"), readNav = $("readNav");
  const prevVerseBtn = $("prevVerse"), nextVerseBtn = $("nextVerse");
  const prevChapterBtn = $("prevChapter"), nextChapterBtn = $("nextChapter");
  const backHomeBtn = $("backHome");

  // tts
  const playBtn = $("play"), pauseBtn = $("pause"), resumeBtn = $("resume"), stopBtn = $("stop");

  // search
  const searchBox = $("searchBox"), searchInfo = $("searchInfo"), searchResults = $("searchResults");

  // theme & notice
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

  const normCache = {};        // fname -> normalized structure
  const searchIndexCache = {}; // fname -> array of {bookIndex,chapterIndex,verseKey,text,low,file}

  let currentVerseIndex = null;

  // TTS runtime
  let ttsQueue = [];
  let isPlaying = false;
  let currentTTSUtterance = null;

  const HIGHLIGHT_COLOR = "#fff6b0"; // soft yellow
  const HEADER_OFFSET_DEFAULT = 90; // px — safe offset so header doesn't cover verse

  /* ------------------ UTILITIES ------------------ */
  const esc = s => String(s || '')
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

  function showNotice(msg, ms = 1400) {
    if(!notice) return;
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(()=> notice.style.display = "none", ms);
  }

  function safeNum(n, fallback=0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }

  /* ------------------ THEME ------------------ */
  (function initTheme(){
    try {
      const saved = localStorage.getItem("theme");
      if(saved === "dark") document.body.classList.add("dark");
    } catch(e){}
    if(themeToggle) themeToggle.addEventListener("click", ()=>{
      document.body.classList.toggle("dark");
      try { localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light"); } catch(e){}
    });
  })();

  /* ------------------ NORMALIZE JSON -> internal shape --------------- */
  function normalizeUniform(json) {
    const books = [];
    if(!json || typeof json !== "object") return { books };
    Object.keys(json).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      const chapterNums = Object.keys(chaptersObj)
        .map(k => Number(k)).filter(x => !isNaN(x)).sort((a,b)=>a-b);
      const chapters = chapterNums.map(cn => {
        const versesObj = chaptersObj[cn] || {};
        const verseNums = Object.keys(versesObj)
          .map(k => Number(k)).filter(x => !isNaN(x)).sort((a,b)=>a-b);
        return verseNums.map(vn => ({ key: String(vn), text: String(versesObj[vn] || "") }));
      });
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  /* ------------------ FETCH & CACHING ------------------ */
  async function fetchAndNormalize(fname) {
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];

    try {
      const res = await fetch(BASE + fname);
      if(!res.ok) throw new Error("Fetch failed " + res.status);
      const json = await res.json();
      const norm = normalizeUniform(json);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    } catch(err) {
      console.error("fetchAndNormalize:", fname, err);
      showNotice("Failed to load " + fname, 2000);
      return null;
    }
  }

  /* ------------------ SEARCH INDEX (on-demand) ------------------ */
  function buildSearchIndex(fname, norm) {
    if(searchIndexCache[fname]) return searchIndexCache[fname];
    const arr = [];
    (norm.books || []).forEach((b,bi) => {
      (b.chapters || []).forEach((ch,ci) => {
        (ch || []).forEach((v,vi) => {
          arr.push({
            file: fname,
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci + 1,
            verseKey: v.key,
            text: v.text,
            low: (v.text || "").toLowerCase()
          });
        });
      });
    });
    searchIndexCache[fname] = arr;
    return arr;
  }

  /* ------------------ UI: populate versions ------------------ */
  function populateVersions() {
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach(f => {
      const label = f.replace("_bible.json","").replace(".json","").replace(/_/g," ").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  /* ------------------ TAB + BOTTOM NAV ------------------ */
  function showView(v) {
    state.view = v;
    if(paneHome) paneHome.style.display = v === "home" ? "block" : "none";
    if(paneRead) paneRead.style.display = v === "read" ? "block" : "none";
    if(paneSearch) paneSearch.style.display = v === "search" ? "block" : "none";
    if(tabHome) tabHome.classList.toggle("active", v === "home");
    if(tabRead) tabRead.classList.toggle("active", v === "read");
    if(tabSearch) tabSearch.classList.toggle("active", v === "search");
    bottomItems.forEach(it => it.classList.toggle("active", it.dataset.tab === v));
    if(v === "search") setTimeout(()=> searchBox && searchBox.focus(), 150);
    if(v === "read") renderRead();
  }

  tabHome && tabHome.addEventListener("click", ()=> showView("home"));
  tabRead && tabRead.addEventListener("click", ()=> showView("read"));
  tabSearch && tabSearch.addEventListener("click", ()=> showView("search"));
  bottomItems && bottomItems.forEach(it => it.addEventListener("click", ()=> showView(it.dataset.tab)));

  /* ------------------ SAVE / LOAD last versions ------------------ */
  function saveVersions() {
    try { localStorage.setItem("lastA", state.versionA || ""); localStorage.setItem("lastB", state.versionB || ""); } catch(e){}
  }
  function loadVersions() {
    try {
      const a = localStorage.getItem("lastA"), b = localStorage.getItem("lastB");
      if(a) { state.versionA = a; if(homeA) homeA.value = a; }
      if(b) { state.versionB = b; if(homeB) homeB.value = b; }
    } catch(e){}
  }

  /* ------------------ HOME: populate books/chapters/verses ------------------ */
  async function populateBooksForA(fname) {
    if(!fname) return;
    const n = await fetchAndNormalize(fname);
    if(!n) return;
    if(homeBook) { homeBook.innerHTML = "<option value=''>Book</option>"; n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name, i))); }
    if(homeChapter) homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeA && homeA.addEventListener("change", async function(){
    const f = this.value;
    if(!f) { state.versionA = null; showNotice("Select Version A"); return; }
    state.versionA = f;
    saveVersions();
    await populateBooksForA(f);
    showNotice(this.options[this.selectedIndex].text + " loaded (A)");
  });

  homeB && homeB.addEventListener("change", function(){
    const f = this.value;
    state.versionB = f || null;
    saveVersions();
    if(f) showNotice(this.options[this.selectedIndex].text + " loaded (B)");
  });

  homeBook && homeBook.addEventListener("change", async function(){
    const bi = safeNum(this.value, 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA] || await fetchAndNormalize(state.versionA);
    if(!n || !n.books[bi]) return;
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    const ccount = n.books[bi].chapters.length;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
  });

  homeChapter && homeChapter.addEventListener("change", function(){
    const bi = safeNum(homeBook.value, 0);
    const ci = safeNum(this.value, 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    if(!n || !n.books[bi] || !n.books[bi].chapters[ci]) return;
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    const vcount = n.books[bi].chapters[ci].length;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  homeOpen && homeOpen.addEventListener("click", async ()=>{
    if(!homeA.value && !state.versionA) { showNotice("Select Version A"); return; }
    state.versionA = homeA.value || state.versionA;
    state.versionB = homeB.value || null;
    state.bookIndex = homeBook && homeBook.value !== '' ? Number(homeBook.value) : 0;
    state.chapterIndex = homeChapter && homeChapter.value !== '' ? Number(homeChapter.value) : 0;
    if(homeRange && homeRange.value && homeRange.value.trim()) state.verseKey = homeRange.value.trim();
    else if(homeVerse && homeVerse.value) state.verseKey = String(Number(homeVerse.value) + 1);
    else state.verseKey = null;
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    saveVersions();
    showView("read");
  });

  /* ------------------ RENDER READ ------------------ */
  function paragraphHtml(text) {
    if(!text) return "";
    return String(text).split(/\n+/).map(p => `<div class="para">${esc(p.trim())}</div>`).join("");
  }

  function clearVerseHighlights() {
    document.querySelectorAll(".verse-block").forEach(v => {
      v.classList.remove("active");
      v.style.background = "";
    });
  }

  function setVerseActive(idx) {
    clearVerseHighlights();
    currentVerseIndex = idx;
    const el = document.getElementById(`verse-${idx}`);
    if(!el) return;
    el.classList.add("active");
    el.style.background = `linear-gradient(90deg, ${HIGHLIGHT_COLOR}33, ${HIGHLIGHT_COLOR}11)`;
    // scroll with header offset so top is not covered
    const headerOffset = (typeof HEADER_OFFSET_DEFAULT === "number") ? HEADER_OFFSET_DEFAULT : 90;
    const rect = el.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    window.scrollTo({ top: absoluteTop - headerOffset, behavior: "smooth" });
  }

  async function renderRead() {
    if(!readVerses) return;
    readVerses.innerHTML = "";
    clearVerseHighlights();

    if(!state.versionA) {
      if(readRef) readRef.textContent = "Select Version A";
      return;
    }

    const nA = normCache[state.versionA] || await fetchAndNormalize(state.versionA);
    if(!nA) {
      if(readRef) readRef.textContent = "Loading...";
      return;
    }

    // clamp indices
    if(!Number.isFinite(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= nA.books.length) state.bookIndex = 0;
    const book = nA.books[state.bookIndex];
    if(!book) { if(readRef) readRef.textContent = "No book"; return; }
    if(!Number.isFinite(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;

    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || []
      : [];

    if(readRef) readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;

    // render entire chapter (always full chapter on chapter change / swipe)
    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++){
      const va = chapA[i] || { key: String(i+1), text: "" };
      const vb = chapB[i] || null;
      const block = document.createElement("div");
      block.className = "verse-block";
      block.id = `verse-${i}`;
      block.dataset.index = String(i);

      block.innerHTML = `
        <div class="verse-num">Verse ${esc(va.key)}</div>
        <div class="verse-text">${paragraphHtml(va.text)}</div>
        ${vb ? `<div class="verse-secondary">${paragraphHtml(vb.text)}</div>` : ""}
      `;
      readVerses.appendChild(block);
    }

    // if verseKey set -> navigate to that verse
    if(state.verseKey) {
      const idx = chapA.findIndex(v => v.key === state.verseKey);
      if(idx >= 0) {
        setTimeout(()=> setVerseActive(idx), 140);
        if(readNav) readNav.style.display = "flex";
        currentVerseIndex = idx;
      } else {
        // handle numeric or range possibilities
        const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
        if(m) {
          const s = Math.max(0, Number(m[1]) - 1);
          setTimeout(()=> setVerseActive(s), 140);
          currentVerseIndex = s;
        } else if(/^\d+$/.test(String(state.verseKey))) {
          const idx2 = Math.max(0, Math.min(chapA.length - 1, Number(state.verseKey) - 1));
          setTimeout(()=> setVerseActive(idx2), 140);
          currentVerseIndex = idx2;
        }
      }
    } else {
      // no verseKey -> show full chapter, hide read nav
      if(readNav) readNav.style.display = "none";
      currentVerseIndex = null;
      // scroll to verse 1 but offset header
      setTimeout(()=>{
        const first = document.getElementById("verse-0");
        if(first) {
          const rect = first.getBoundingClientRect();
          const absoluteTop = window.pageYOffset + rect.top;
          window.scrollTo({ top: absoluteTop - HEADER_OFFSET_DEFAULT, behavior: "smooth" });
        }
      }, 130);
    }
  }

  /* ------------------ verse navigation (prev/next) -------------- */
  prevVerseBtn && prevVerseBtn.addEventListener("click", ()=>{
    if(currentVerseIndex === null) return;
    const n = normCache[state.versionA];
    const ch = (n && n.books[state.bookIndex] && n.books[state.bookIndex].chapters[state.chapterIndex]) || [];
    if(currentVerseIndex > 0) {
      state.verseKey = ch[currentVerseIndex - 1].key;
      renderRead();
    } else if(state.chapterIndex > 0) {
      state.chapterIndex--; state.verseKey = null;
      renderRead();
      // jump to last verse ~ after render
      setTimeout(()=> {
        const n2 = normCache[state.versionA];
        if(n2) {
          const last = n2.books[state.bookIndex].chapters[state.chapterIndex].length - 1;
          state.verseKey = (n2.books[state.bookIndex].chapters[state.chapterIndex][last] || {}).key || null;
          renderRead();
        }
      }, 260);
    }
  });

  nextVerseBtn && nextVerseBtn.addEventListener("click", ()=>{
    const n = normCache[state.versionA];
    const ch = (n && n.books[state.bookIndex] && n.books[state.bookIndex].chapters[state.chapterIndex]) || [];
    if(currentVerseIndex === null) return;
    if(currentVerseIndex + 1 < ch.length) {
      state.verseKey = ch[currentVerseIndex + 1].key;
      renderRead();
    } else if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++; state.verseKey = null; renderRead();
    }
  });

  prevChapterBtn && prevChapterBtn.addEventListener("click", ()=>{
    if(state.chapterIndex > 0) {
      state.chapterIndex--; state.verseKey = null; renderRead();
    }
  });

  nextChapterBtn && nextChapterBtn.addEventListener("click", ()=>{
    const n = normCache[state.versionA];
    if(!n) return;
    if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++; state.verseKey = null; renderRead();
    }
  });

  backHomeBtn && backHomeBtn.addEventListener("click", ()=> showView("home"));

  /* ------------------ TTS: build queue, play/pause/resume/stop ------------- */

  function buildTTSQueueForFullChapter() {
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = (n.books[state.bookIndex] && n.books[state.bookIndex].chapters[state.chapterIndex]) || [];
    for(let i=0;i<ch.length;i++) ttsQueue.push({ text: ch[i].text, idx: i });
  }

  function speakNext() {
    if(!ttsQueue.length) {
      isPlaying = false;
      currentTTSUtterance = null;
      currentVerseIndex = null;
      clearVerseHighlights();
      return;
    }
    const item = ttsQueue.shift();
    currentVerseIndex = item.idx;
    // highlight & scroll
    setVerseActive(currentVerseIndex);

    try {
      const u = new SpeechSynthesisUtterance(String(item.text));
      currentTTSUtterance = u;
      u.onend = () => {
        currentTTSUtterance = null;
        if(isPlaying) setTimeout(()=> speakNext(), 120);
      };
      u.onerror = () => {
        currentTTSUtterance = null;
        if(isPlaying) setTimeout(()=> speakNext(), 120);
      };
      speechSynthesis.speak(u);
    } catch(e) {
      console.warn("TTS speak error", e);
      currentTTSUtterance = null;
      if(isPlaying) setTimeout(()=> speakNext(), 120);
    }
  }

  function startTTSFullChapter() {
    buildTTSQueueForFullChapter();
    if(!ttsQueue.length) { showNotice("Nothing to read"); return; }
    // ensure chapter is rendered
    if(state.view !== "read") showView("read");
    renderRead();
    isPlaying = true;
    try { speechSynthesis.cancel(); } catch(e){}
    setTimeout(()=> speakNext(), 220);
  }

  function pauseTTS() {
    try { speechSynthesis.pause(); } catch(e) {}
  }

  function smartResumeTTS() {
    if(!isPlaying) return;
    try {
      // if browser supports resume, do it
      if(speechSynthesis.paused) {
        speechSynthesis.resume();
        return;
      }
    } catch(e) {
      console.warn("speechSynthesis.resume failed", e);
    }
    // mobile fallback: restart current verse then continue
    if(currentVerseIndex !== null) {
      try { speechSynthesis.cancel(); } catch(e){}
      const n = normCache[state.versionA];
      if(!n) return;
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
      const item = ch[currentVerseIndex];
      if(!item) return;
      // speak current verse then continue with remaining queue
      try {
        const u = new SpeechSynthesisUtterance(String(item.text));
        currentTTSUtterance = u;
        u.onend = () => { currentTTSUtterance = null; if(isPlaying) setTimeout(()=> speakNext(), 120); };
        speechSynthesis.speak(u);
      } catch(e) {
        console.warn("resume fallback failed", e);
      }
    }
  }

  function stopTTS() {
    try { speechSynthesis.cancel(); } catch(e){}
    ttsQueue = [];
    isPlaying = false;
    currentTTSUtterance = null;
    currentVerseIndex = null;
    clearVerseHighlights();
  }

  if(playBtn) playBtn.addEventListener("click", ()=> {
    // always read full chapter from verse 1 (per current requested behavior)
    startTTSFullChapter();
  });
  if(pauseBtn) pauseBtn.addEventListener("click", pauseTTS);
  if(resumeBtn) resumeBtn.addEventListener("click", smartResumeTTS);
  if(stopBtn) stopBtn.addEventListener("click", stopTTS);

  /* ------------------ SEARCH (global) ------------------ */
  async function doSearch(q) {
    if(!q) return;
    const qs = q.trim().toLowerCase();
    searchResults.innerHTML = "";
    searchInfo.textContent = "Searching...";
    const matches = [];

    // iterate all files; build index on demand
    for(const f of FILES) {
      try {
        if(!searchIndexCache[f]) {
          const norm = normCache[f] || await fetchAndNormalize(f);
          if(!norm) continue;
        }
        const idx = searchIndexCache[f] || buildSearchIndex(f, normCache[f]);
        if(!idx) continue;
        for(const r of idx) {
          if(r.low.includes(qs)) matches.push(r);
        }
      } catch(e) {
        console.warn("Search error for file", f, e);
      }
    }

    searchInfo.textContent = `Found ${matches.length}`;
    if(matches.length === 0) {
      searchResults.innerHTML = `<div style="padding:8px;color:#666">No results</div>`;
      showView("search");
      return;
    }

    // render results
    const frag = document.createDocumentFragment();
    // limit to 800 results for safety; it's a lot; slice as needed
    const max = Math.min(matches.length, 800);
    for(let i=0;i<max;i++){
      const r = matches[i];
      const div = document.createElement("div");
      div.className = "search-item";
      const safeQ = qs.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const re = new RegExp(safeQ, "ig");
      const snippet = esc(r.text).replace(re, m => `<span class="highlight">${m}</span>`);
      const label = `${esc(r.book)} ${r.chapter}:${r.verseKey} — ${String(r.file).replace(/_bible.json$/,'').toUpperCase()}`;
      div.innerHTML = `<strong>${label}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
      div.addEventListener("click", async ()=>{
        // open clicked result as Version A
        state.versionA = r.file; if(homeA) homeA.value = r.file;
        state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
        await fetchAndNormalize(state.versionA);
        await populateBooksForA(state.versionA);
        showView("read");
        renderRead();
      });
      frag.appendChild(div);
    }
    searchResults.appendChild(frag);
    showView("search");
  }

  if(searchBox) searchBox.addEventListener("keydown", e => {
    if(e.key === "Enter") {
      const q = searchBox.value || "";
      if(q.trim()) doSearch(q.trim());
    }
  });

  /* ------------------ SWIPE (mobile) + MOUSE DRAG (desktop) ------------------ */
  (function attachSwipe(){
    if(!readVerses) return;
    let startX = 0, mouseDown = false, mStart = 0, mCur = 0;

    readVerses.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
    readVerses.addEventListener("touchend", e => {
      const dx = e.changedTouches[0].clientX - startX;
      if(Math.abs(dx) < 60) return;
      const n = normCache[state.versionA];
      if(!n) return;
      if(dx < 0) { if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; currentVerseIndex = null; renderRead(); } }
      else { if(state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; currentVerseIndex = null; renderRead(); } }
    }, { passive: true });

    // simple mouse drag
    readVerses.addEventListener("mousedown", e => { mouseDown = true; mStart = e.clientX; });
    document.addEventListener("mousemove", e => { if(!mouseDown) return; mCur = e.clientX; });
    document.addEventListener("mouseup", e => {
      if(!mouseDown) return;
      mouseDown = false;
      const dx = (mCur || e.clientX) - mStart;
      if(Math.abs(dx) < 100) { mStart = mCur = 0; return; }
      const n = normCache[state.versionA];
      if(!n) return;
      if(dx < 0) { if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; currentVerseIndex = null; renderRead(); } }
      else { if(state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; currentVerseIndex = null; renderRead(); } }
      mStart = mCur = 0;
    });
  })();

  /* ------------------ KEYBOARD NAV ------------------ */
  document.addEventListener("keydown", e => {
    if(state.view !== "read") return;
    const n = normCache[state.versionA];
    if(!n) return;
    if(e.key === "ArrowRight") { if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); } }
    if(e.key === "ArrowLeft") { if(state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); } }
    if(e.key === "ArrowDown" || e.key === "ArrowUp") {
      const ch = (n.books[state.bookIndex].chapters[state.chapterIndex]) || [];
      if(!ch.length) return;
      const keys = ch.map(v => v.key);
      const idx = (state.verseKey ? keys.indexOf(state.verseKey) : -1);
      if(e.key === "ArrowDown" && idx >= 0 && idx + 1 < keys.length) { state.verseKey = keys[idx + 1]; renderRead(); }
      if(e.key === "ArrowUp" && idx > 0) { state.verseKey = keys[idx - 1]; renderRead(); }
    }
  });

  /* ------------------ INITIALISE ------------------ */
  (async function initialLoad(){
    populateVersions();
    loadVersions();
    // If last versions existed, prefetch them
    if(state.versionA) await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    showView("home");
  })();

  /* ------------------ DEBUG API ------------------ */
  window.BibleReader = {
    state, normCache, searchIndexCache, fetchAndNormalize, renderRead, doSearch
  };

})();
