/* ----------------------------------------------------------
   FINAL APP.JS — BIBLE READER (STABLE BUILD)
   Fixes:
   - Search fully working
   - Always show entire chapter on chapter change / swipe
   - Auto-scroll to verse 1 WITHOUT covering it (offset system)
   - Verse highlight only when required
   - Mobile + Desktop stable
----------------------------------------------------------- */

(() => {
  "use strict";

  /* -------------------------------
     CONSTANTS
  --------------------------------*/
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json",
    "xhosa_bible.json","zulu_bible.json"
  ];

  /* -------------------------------
     DOM SHORTCUT
  --------------------------------*/
  const $ = id => document.getElementById(id);

  // PANES
  const paneHome = $('pane-home'), paneRead = $('pane-read'), paneSearch = $('pane-search');
  const tabHome = $('tab-home'), tabRead = $('tab-read'), tabSearch = $('tab-search');

  // HOME
  const homeA = $('homeA'), homeB = $('homeB');
  const homeBook = $('homeBook'), homeChapter = $('homeChapter'), homeVerse = $('homeVerse');
  const homeRange = $('homeRange'), homeOpen = $('homeOpen');

  // READER
  const readRef = $('readRef'), readVerses = $('readVerses'), readNav = $('readNav');
  const prevVerseBtn = $('prevVerse'), nextVerseBtn = $('nextVerse');
  const prevChapterBtn = $('prevChapter'), nextChapterBtn = $('nextChapter');
  const backHomeBtn = $('backHome');

  // SEARCH
  const searchBox = $('searchBox'), searchInfo = $('searchInfo'), searchResults = $('searchResults');

  // THEME
  const themeToggle = $('themeToggle');

  // NOTICE
  const notice = $('notice');
  const bottomItems = document.querySelectorAll('#bottomNav .bottom-item');

  /* -------------------------------
     STATE
  --------------------------------*/
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null, // null → full chapter
    view: 'home'
  };

  const normCache = {};
  const searchIndexCache = {};

  let currentVerseIndex = null;

  const HIGHLIGHT_COLOR = "#fff6b0";

  /* -------------------------------
     UTILITIES
  --------------------------------*/
  const esc = s => String(s || '')
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

  const showNotice = (msg, ms=1400) => {
    if(!notice) return;
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(()=> {
      if(notice) notice.style.display = 'none';
    }, ms);
  };

  function scrollToElementWithOffset(el, offset = -90) {
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    window.scrollTo({ top: absoluteTop + offset, behavior: "smooth" });
  }

  /* -------------------------------
     THEME
  --------------------------------*/
  (() => {
    try {
      const saved = localStorage.getItem("theme");
      if(saved === "dark") document.body.classList.add("dark");
    } catch(e) {}
    if(themeToggle) {
      themeToggle.onclick = () => {
        document.body.classList.toggle("dark");
        try {
          localStorage.setItem("theme",
            document.body.classList.contains("dark") ? "dark" : "light"
          );
        } catch(e) {}
      };
    }
  })();

  /* -------------------------------
     NORMALIZE JSON
  --------------------------------*/
  function normalizeUniform(json) {
    const books = [];
    if(!json) return { books };

    Object.keys(json).forEach(bookName => {
      const chObj = json[bookName] || {};
      const chapterNums = Object.keys(chObj).map(Number).sort((a,b)=>a-b);

      const chapters = chapterNums.map(cnum => {
        const vObj = chObj[cnum] || {};
        const verseNums = Object.keys(vObj).map(Number).sort((a,b)=>a-b);
        return verseNums.map(vn => ({ key: String(vn), text: String(vObj[vn] || "") }));
      });

      books.push({ name: bookName, chapters });
    });

    return { books };
  }

  /* -------------------------------
     FETCH & NORMALIZE
  --------------------------------*/
  async function fetchAndNormalize(fname) {
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error('Fetch failed ' + res.status);
      const json = await res.json();
      const norm = normalizeUniform(json);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    } catch(e) {
      console.error("Failed to load", fname, e);
      showNotice("Error loading " + fname);
      return null;
    }
  }

  /* -------------------------------
     SEARCH INDEX
  --------------------------------*/
  function buildSearchIndex(fname, norm) {
    if(searchIndexCache[fname]) return;

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
            chapter: ci+1,
            verseKey: v.key,
            text: v.text,
            low: (v.text || "").toLowerCase()
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
  }

  /* -------------------------------
     POPULATE VERSIONS
  --------------------------------*/
  function populateVersions() {
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";

    FILES.forEach(f=>{
      const label = f.replace("_bible.json","").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  /* -------------------------------
     TAB SWITCHING
  --------------------------------*/
  function showView(v) {
    state.view = v;
    if(paneHome) paneHome.style.display = v === "home" ? "block" : "none";
    if(paneRead) paneRead.style.display = v === "read" ? "block" : "none";
    if(paneSearch) paneSearch.style.display = v === "search" ? "block" : "none";

    if(tabHome) tabHome.classList.toggle("active", v==="home");
    if(tabRead) tabRead.classList.toggle("active", v==="read");
    if(tabSearch) tabSearch.classList.toggle("active", v==="search");

    bottomItems.forEach(i =>
      i.classList.toggle("active", i.dataset.tab === v)
    );

    if(v === "search" && searchBox) {
      setTimeout(()=> searchBox.focus(), 140);
    }
    if(v === "read") {
      renderRead();
    }
  }

  if(tabHome) tabHome.onclick = ()=> showView("home");
  if(tabRead) tabRead.onclick = ()=> showView("read");
  if(tabSearch) tabSearch.onclick = ()=> showView("search");

  bottomItems.forEach(i => i.onclick = () => showView(i.dataset.tab));

  /* -------------------------------
     HOME EVENTS
  --------------------------------*/
  if(homeA) homeA.onchange = async function() {
    state.versionA = this.value;
    if(!this.value) return;
    await populateBooksForA(this.value);
    fetchAndNormalize(this.value);
  };

  if(homeB) homeB.onchange = function() {
    state.versionB = this.value || null;
  };

  async function populateBooksForA(fname) {
    const n = await fetchAndNormalize(fname);
    if(!n || !homeBook) return;
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name,i)));

    if(homeChapter) homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  if(homeBook) homeBook.onchange = function() {
    const idx = Number(this.value);
    const n = normCache[state.versionA];
    if(!n || !n.books || !homeChapter) return;
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    n.books[idx].chapters.forEach((_,i)=> homeChapter.appendChild(new Option(i+1,i)));
  };

  if(homeChapter) homeChapter.onchange = function() {
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    const n = normCache[state.versionA];
    if(!n || !n.books || !homeVerse) return;
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    n.books[bi].chapters[ci].forEach((_,i)=> homeVerse.appendChild(new Option(i+1,i)));
  };

  if(homeOpen) homeOpen.onclick = async () => {
    state.versionA = homeA ? homeA.value : state.versionA;
    state.versionB = homeB ? homeB.value || null : state.versionB;
    state.bookIndex = homeBook ? Number(homeBook.value || 0) : 0;
    state.chapterIndex = homeChapter ? Number(homeChapter.value || 0) : 0;
    state.verseKey = homeVerse && homeVerse.value ? String(Number(homeVerse.value)+1) : null;

    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);

    showView("read");
  };

  /* -------------------------------
     RENDER READ VIEW
  --------------------------------*/
  function paragraphHtml(text) {
    if(!text) return "";
    return String(text).split(/\n+/).map(p =>
      `<div class="para">${esc(p.trim())}</div>`
    ).join("");
  }

  function clearActive() {
    document.querySelectorAll(".verse-block").forEach(v=>{
      v.classList.remove("active");
      v.style.background = "";
    });
  }

  function setActive(idx) {
    clearActive();
    currentVerseIndex = idx;
    const el = $(`verse-${idx}`);
    if(!el) return;

    el.classList.add("active");
    el.style.background = `linear-gradient(90deg, ${HIGHLIGHT_COLOR}33, ${HIGHLIGHT_COLOR}11)`;
    scrollToElementWithOffset(el);
  }

  function renderRead() {
    if(!readVerses) return;
    clearActive();
    readVerses.innerHTML = "";

    const nA = normCache[state.versionA];
    if(!nA) {
      showNotice("Load a version first");
      return;
    }

    const book = nA.books[state.bookIndex];
    if(!book) {
      showNotice("Book not found");
      return;
    }

    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    if(readRef) readRef.textContent = `${book.name} ${state.chapterIndex+1}`;

    // Render full chapter
    chapA.forEach((va,idx)=>{
      const vb = chapB[idx];
      const block = document.createElement("div");
      block.id = `verse-${idx}`;
      block.className = "verse-block";

      block.innerHTML = `
        <div class="verse-num">Verse ${va.key}</div>
        <div class="verse-text">${paragraphHtml(va.text)}</div>
        ${vb ? `<div class="verse-secondary">${paragraphHtml(vb.text)}</div>` : ""}
      `;

      readVerses.appendChild(block);
    });

    // If verseKey not set -> full chapter view -> hide readNav and auto-scroll to first verse
    if(state.verseKey === null) {
      if(readNav) readNav.style.display = "none";
      setTimeout(()=>{
        const first = $(`verse-0`);
        if(first) scrollToElementWithOffset(first);
      }, 120);
      currentVerseIndex = null;
      return;
    }

    // Single verse requested — show nav and highlight
    const idx = chapA.findIndex(v => v.key === state.verseKey);
    if(idx >= 0) {
      if(readNav) readNav.style.display = "flex";
      setTimeout(()=> setActive(idx), 150);
    } else {
      if(readNav) readNav.style.display = "none";
    }
  }

   /* ----------------------------------------------------------
   TEXT-TO-SPEECH (works on iOS / Android / Desktop)
   - Highlights active verse
   - Auto scrolls while reading
   - Play / Pause / Resume / Stop fixed
----------------------------------------------------------- */

let ttsQueue = [];
let ttsIndex = 0;
let isSpeaking = false;

function buildTTSQueue() {
  ttsQueue = [];

  const n = normCache[state.versionA];
  if (!n) return;

  const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

  // If full chapter
  if (state.verseKey === null) {
    ch.forEach((v, i) => ttsQueue.push({ text: v.text, idx: i }));
    return;
  }

  // If single verse
  const idx = ch.findIndex(v => v.key === state.verseKey);
  if (idx >= 0) {
    ttsQueue.push({ text: ch[idx].text, idx });
    return;
  }
}

function speakNext() {
  if (ttsIndex >= ttsQueue.length) {
    isSpeaking = false;
    return;
  }

  const item = ttsQueue[ttsIndex];
  ttsIndex++;

  // Ensure verse is visible + highlighted
  setActive(item.idx);

  const utter = new SpeechSynthesisUtterance(item.text);

  utter.onend = () => {
    // go next
    speakNext();
  };

  utter.onerror = () => {
    speakNext();
  };

  isSpeaking = true;
  speechSynthesis.speak(utter);
}

// PLAY
if (playBtn) playBtn.onclick = () => {
  try { speechSynthesis.cancel(); } catch(e){}
  buildTTSQueue();
  ttsIndex = 0;

  if (ttsQueue.length === 0) return;

  // Ensure full chapter is shown before speaking
  if (state.verseKey !== null) {
    state.verseKey = null;
    renderRead();
  }

  setTimeout(() => speakNext(), 150);
};

// PAUSE
if (pauseBtn) pauseBtn.onclick = () => {
  try { speechSynthesis.pause(); } catch(e){}
};

// RESUME
if (resumeBtn) resumeBtn.onclick = () => {
  try { speechSynthesis.resume(); } catch(e){}
};

// STOP
if (stopBtn) stopBtn.onclick = () => {
  try { speechSynthesis.cancel(); } catch(e){}
  isSpeaking = false;
  ttsQueue = [];
  ttsIndex = 0;
  clearActive();
};


  /* -------------------------------
     CHAPTER NAVIGATION
  --------------------------------*/
  if(prevChapterBtn) prevChapterBtn.onclick = () =>{
    if(state.chapterIndex > 0) {
      state.chapterIndex--;
      state.verseKey = null;
      renderRead();
    }
  };

  if(nextChapterBtn) nextChapterBtn.onclick = () =>{
    const n = normCache[state.versionA];
    if(!n) return;
    if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++;
      state.verseKey = null;
      renderRead();
    }
  };

  /* -------------------------------
     VERSE NAVIGATION
  --------------------------------*/
  if(prevVerseBtn) prevVerseBtn.onclick = ()=>{
    if(currentVerseIndex > 0) {
      const n = normCache[state.versionA];
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
      state.verseKey = ch[currentVerseIndex - 1].key;
      renderRead();
    }
  };

  if(nextVerseBtn) nextVerseBtn.onclick = ()=>{
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(currentVerseIndex + 1 < ch.length) {
      state.verseKey = ch[currentVerseIndex + 1].key;
      renderRead();
    }
  };

  if(backHomeBtn) backHomeBtn.onclick = () => {
    state.view = "home";
    state.verseKey = null;
    currentVerseIndex = null;
    // Return to top and show home
    try { window.scrollTo({ top: 0 }); } catch(e) {}
    showView("home");
  };

  /* -------------------------------
     SEARCH
  --------------------------------*/
  async function doSearch(q) {
    if(!q || !q.trim()) return;
    q = q.toLowerCase();
    if(searchResults) searchResults.innerHTML = "";
    if(searchInfo) searchInfo.textContent = "Searching...";

    const result = [];

    for(const f of FILES) {
      try {
        if(!searchIndexCache[f]) {
          const n = await fetchAndNormalize(f);
          if(!n) continue;
        }
        const arr = searchIndexCache[f] || [];
        arr.forEach(r => {
          if(r.low.includes(q)) result.push(r);
        });
      } catch(e) {
        console.warn("Search file error", f, e);
      }
    }

    if(searchInfo) searchInfo.textContent = `Found ${result.length}`;

    result.forEach(r=>{
      const div = document.createElement("div");
      div.className = "search-item";

      const hl = esc(r.text).replace(new RegExp(q,"ig"), m=>`<mark>${m}</mark>`);

      div.innerHTML = `
        <strong>${esc(r.book)} ${r.chapter}:${r.verseKey} — ${String(r.file).replace(/_bible.json$/,'').toUpperCase()}</strong>
        <div style="margin-top:6px">${hl}</div>
      `;

      div.onclick = async ()=>{
        state.versionA = r.file;
        await fetchAndNormalize(state.versionA);
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        showView("read");
      };

      if(searchResults) searchResults.appendChild(div);
    });
  }

  if(searchBox) searchBox.onkeydown = e=>{
    if(e.key === "Enter") doSearch(searchBox.value.trim());
  };

  /* -------------------------------
     SWIPE SUPPORT
  --------------------------------*/
  (function attachSwipe() {
    if(!readVerses) return;
    let startX = 0;

    readVerses.addEventListener("touchstart", e=>{
      startX = e.touches[0].clientX;
    }, { passive: true });

    readVerses.addEventListener("touchend", e=>{
      const dx = e.changedTouches[0].clientX - startX;
      if(Math.abs(dx) < 60) return;
      if(dx < 0) {
        if(nextChapterBtn) nextChapterBtn.click();
      } else {
        if(prevChapterBtn) prevChapterBtn.click();
      }
    }, { passive: true });

    // mouse drag (desktop)
    let mouseDown = false, mstart = 0, mcur = 0;
    readVerses.addEventListener('mousedown', e => { mouseDown = true; mstart = e.clientX; });
    document.addEventListener('mousemove', e => { if(!mouseDown) return; mcur = e.clientX; });
    document.addEventListener('mouseup', e => {
      if(!mouseDown) return; mouseDown = false;
      const dx = (mcur || e.clientX) - mstart;
      if(Math.abs(dx) < 100) { mstart = mcur = 0; return; }
      if(dx < 0) { if(nextChapterBtn) nextChapterBtn.click(); }
      else { if(prevChapterBtn) prevChapterBtn.click(); }
      mstart = mcur = 0;
    });
  })();

  /* -------------------------------
     INITIAL LOAD
  --------------------------------*/
  async function init() {
    populateVersions();
    showView("home");
  }

  init();

  // Expose debug helpers if needed
  window.BibleReader = { state, normCache, searchIndexCache, fetchAndNormalize, renderRead };

})();
