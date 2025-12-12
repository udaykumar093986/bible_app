/* FINAL app.js - Bible Reader (Option A: Play reads full chapter from verse 1)
   - Play always reads entire chapter starting from verse 1
   - Pause / Resume / Stop implemented using SpeechSynthesis APIs
   - Search works across all JSON versions (index built on-demand)
   - Chapter swipe/arrow/next/prev show the full chapter from verse 1
   - Auto-scroll positions verse 1 with offset so header doesn't cover it
   - Verse highlight during TTS
*/

(() => {
  "use strict";

  // ---------- CONFIG ----------
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // ---------- DOM helpers ----------
  const $ = id => document.getElementById(id);

  const tabHome = $('tab-home'), tabRead = $('tab-read'), tabSearch = $('tab-search');
  const paneHome = $('pane-home'), paneRead = $('pane-read'), paneSearch = $('pane-search');

  const homeA = $('homeA'), homeB = $('homeB');
  const homeBook = $('homeBook'), homeChapter = $('homeChapter'), homeVerse = $('homeVerse');
  const homeRange = $('homeRange'), homeOpen = $('homeOpen');

  const readRef = $('readRef'), readVerses = $('readVerses'), readNav = $('readNav');
  const prevVerseBtn = $('prevVerse'), nextVerseBtn = $('nextVerse');
  const prevChapterBtn = $('prevChapter'), nextChapterBtn = $('nextChapter');
  const backHomeBtn = $('backHome');

  const playBtn = $('play'), pauseBtn = $('pause'), resumeBtn = $('resume'), stopBtn = $('stop');

  const searchBox = $('searchBox'), searchInfo = $('searchInfo'), searchResults = $('searchResults');

  const themeToggle = $('themeToggle');

  const notice = $('notice');
  const bottomItems = document.querySelectorAll('#bottomNav .bottom-item');

  // ---------- STATE & CACHES ----------
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null, // null means full chapter view
    view: 'home'
  };

  const normCache = {};        // fname -> normalized shape { books: [ {name, chapters: [ [ {key,text} ] ] } ] }
  const searchIndexCache = {}; // fname -> [ {bookIndex,chapterIndex,verseIndex,book,chapter,verseKey,text,low} ]

  // playing state
  let ttsQueue = []; // [{text, idx}]
  let isPlaying = false;
  let currentTTSUtterance = null;
  let currentVerseIndex = null; // index inside chapter, or null
  const HIGHLIGHT_COLOR = "#fff6b0"; // soft yellow

  // ---------- UTILITIES ----------
  const esc = s => String(s || '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  function showNotice(msg, ms=1400) {
    if(!notice) return;
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(()=> notice.style.display = 'none', ms);
  }

  function isNumber(n) { return Number.isFinite(Number(n)); }

  // scroll to element with a top offset (so header *doesn't* cover it)
  function scrollToWithOffset(el, offset=-92) {
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    window.scrollTo({ top: absoluteTop + offset, behavior: 'smooth' });
  }

  // ---------- THEME ----------
  (function initTheme(){
    try {
      const saved = localStorage.getItem('theme');
      if(saved === 'dark') document.body.classList.add('dark');
    } catch(e){}
    if(themeToggle) themeToggle.addEventListener('click', ()=>{
      document.body.classList.toggle('dark');
      try { localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch(e){}
    });
  })();

  // ---------- NORMALIZE JSON ----------
  function normalizeUniform(json) {
    const books = [];
    if(!json || typeof json !== 'object') return { books };
    Object.keys(json).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      const chapterNums = Object.keys(chaptersObj).map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
      const chapters = chapterNums.map(cn => {
        const verseObj = chaptersObj[cn] || {};
        const verseNums = Object.keys(verseObj).map(n => Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
        return verseNums.map(vn => ({ key: String(vn), text: String(verseObj[vn] || '') }));
      });
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  // ---------- FETCH + NORMALIZE ----------
  async function fetchAndNormalize(fname) {
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];
    const url = BASE + fname;
    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error('fetch failed ' + res.status);
      const json = await res.json();
      const norm = normalizeUniform(json);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    } catch(err) {
      console.error('fetchAndNormalize', err);
      showNotice('Failed to load ' + fname, 2000);
      return null;
    }
  }

  // ---------- BUILD SEARCH INDEX ----------
  function buildSearchIndex(fname, norm) {
    if(searchIndexCache[fname]) return;
    const arr = [];
    (norm.books || []).forEach((b, bi) => {
      (b.chapters || []).forEach((ch, ci) => {
        (ch || []).forEach((v, vi) => {
          arr.push({
            file: fname,
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci + 1,
            verseKey: v.key,
            text: v.text,
            low: (v.text || '').toLowerCase()
          });
        });
      });
    });
    searchIndexCache[fname] = arr;
  }

  // ---------- VERSIONS DROPDOWNS ----------
  function populateVersions() {
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach(f => {
      const label = f.replace("_bible.json","").replace(".json","").replace(/_/g,' ').toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  // ---------- TAB & NAV ----------
  function showView(view) {
    state.view = view;
    if(paneHome) paneHome.style.display = view === 'home' ? 'block' : 'none';
    if(paneRead) paneRead.style.display = view === 'read' ? 'block' : 'none';
    if(paneSearch) paneSearch.style.display = view === 'search' ? 'block' : 'none';

    if(tabHome) tabHome.classList.toggle('active', view === 'home');
    if(tabRead) tabRead.classList.toggle('active', view === 'read');
    if(tabSearch) tabSearch.classList.toggle('active', view === 'search');

    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === view));

    if(view === 'search') {
      if(searchBox) searchBox.focus();
    }
    if(view === 'read') {
      renderRead(); // ensure read pane updated
    }
    updateUrl('replace');
  }
  if(tabHome) tabHome.addEventListener('click', ()=> showView('home'));
  if(tabRead) tabRead.addEventListener('click', ()=> showView('read'));
  if(tabSearch) tabSearch.addEventListener('click', ()=> showView('search'));
  bottomItems.forEach(it => it.addEventListener('click', ()=> showView(it.dataset.tab)));

  // ---------- LOCAL STORAGE versions ----------
  function saveVersions() {
    try {
      localStorage.setItem('lastA', state.versionA || '');
      localStorage.setItem('lastB', state.versionB || '');
    } catch(e){}
  }
  function loadVersions() {
    try {
      const a = localStorage.getItem('lastA'), b = localStorage.getItem('lastB');
      if(a) { state.versionA = a; if(homeA) homeA.value = a; }
      if(b) { state.versionB = b; if(homeB) homeB.value = b; }
    } catch(e){}
  }

  // ---------- POPULATE BOOKS for A ----------
  async function populateBooksForA(fname) {
    if(!fname) return;
    const n = await fetchAndNormalize(fname);
    if(!n) return;
    if(homeBook) {
      homeBook.innerHTML = "<option value=''>Book</option>";
      n.books.forEach((b,i) => homeBook.appendChild(new Option(b.name, i)));
    }
    if(homeChapter) homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  if(homeA) homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f) { state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f;
    saveVersions();
    await populateBooksForA(f);
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  if(homeB) homeB.addEventListener('change', function(){
    const f = this.value;
    state.versionB = f || null;
    saveVersions();
    if(f) showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  if(homeBook) homeBook.addEventListener('change', async function(){
    const bi = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA] || await fetchAndNormalize(state.versionA);
    if(homeChapter) homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi]) return;
    const ccount = n.books[bi].chapters.length;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
  });

  if(homeChapter) homeChapter.addEventListener('change', function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi] || !n.books[bi].chapters[ci]) return;
    const vcount = n.books[bi].chapters[ci].length;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  if(homeOpen) homeOpen.addEventListener('click', async function(){
    if(!homeA.value && !state.versionA) { showNotice('Select Version A'); return; }
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
    showView('read');
  });

  // ---------- CLAMP INDICES ----------
  function clampIndices() {
    if(!state.versionA) { state.bookIndex = 0; state.chapterIndex = 0; return; }
    const n = normCache[state.versionA];
    if(!n || !n.books.length) { state.bookIndex = 0; state.chapterIndex = 0; return; }
    if(!isNumber(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !book.chapters.length) { state.chapterIndex = 0; return; }
    if(!isNumber(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
  }

  // ---------- RENDER READ ----------
  function paragraphHtml(text) {
    if(!text) return '';
    return String(text).split(/\n+/).map(p => `<div class="para">${esc(p.trim())}</div>`).join('');
  }

  /* -------------------------------------------
   VERSE HIGHLIGHT HELPERS (Required by TTS)
------------------------------------------- */

function clearVerseHighlights() {
  document.querySelectorAll(".verse-block").forEach(v => {
    v.classList.remove("active");
    v.style.background = "";
  });
}

function setVerseActive(idx) {
  clearVerseHighlights();

  const el = document.getElementById(`verse-${idx}`);
  if (!el) return;

  // soft yellow highlight
  el.classList.add("active");
  el.style.background = "linear-gradient(90deg, #fff6b033, #fff6b011)";

  // safe scrolling offset to prevent header covering verse
  const headerOffset = 90;
  const rect = el.getBoundingClientRect();
  const y = rect.top + window.scrollY - headerOffset;

  window.scrollTo({ top: y, behavior: "smooth" });
}


  function renderRead() {
    if(!readVerses) return;
    readVerses.innerHTML = '';
    clearVerseHighlights();

    if(!state.versionA) {
      if(readRef) readRef.textContent = 'Select Version A';
      return;
    }

    const nA = normCache[state.versionA];
    if(!nA) {
      if(readRef) readRef.textContent = 'Loading...';
      return;
    }

    clampIndices();
    const book = nA.books[state.bookIndex];
    if(!book) { if(readRef) readRef.textContent = 'No book'; return; }

    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || []
      : [];

    if(readRef) readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;

    // Render entire chapter - each verse block
    const total = Math.max(chapA.length, chapB.length);
    for(let i=0;i<total;i++){
      const va = chapA[i] || {key: String(i+1), text: ''};
      const vb = chapB[i] || null;
      const block = document.createElement('div');
      block.className = 'verse-block';
      block.id = `verse-${i}`;
      block.dataset.index = String(i);

      block.innerHTML = `
        <div class="verse-num">Verse ${esc(va.key)}</div>
        <div class="verse-text">${paragraphHtml(va.text)}</div>
        ${vb ? `<div class="verse-secondary">${paragraphHtml(vb.text)}</div>` : ''}
      `;

      readVerses.appendChild(block);
    }

    // after rendering chapter, by default (Option A), when user navigates to chapter or swipes, Play should start from verse 1.
    // If in single-verse mode (state.verseKey not null), we highlight that verse; otherwise start with no highlight and ensure chapter top visible

    if(state.verseKey) {
      const idx = chapA.findIndex(v => v.key === state.verseKey);
      if(idx >= 0) {
        readNav.style.display = 'flex';
        setTimeout(()=> setVerseActive(idx), 120);
      } else {
        readNav.style.display = 'none';
        currentVerseIndex = null;
      }
    } else {
      readNav.style.display = 'none';
      currentVerseIndex = null;
      // scroll to verse 0 (verse 1) but offset so header doesn't cover
      setTimeout(()=> {
        const first = document.getElementById('verse-0');
        if(first) scrollToWithOffset(first, -92);
      }, 120);
    }
  }

  // ---------- CHAPTER / VERSE NAV ----------
  if(prevChapterBtn) prevChapterBtn.addEventListener('click', ()=> {
    if(!normCache[state.versionA]) return;
    if(state.chapterIndex > 0) {
      state.chapterIndex--;
      state.verseKey = null;
      currentVerseIndex = null;
      renderRead();
      updateUrl('push');
    }
  });
  if(nextChapterBtn) nextChapterBtn.addEventListener('click', ()=> {
    const n = normCache[state.versionA];
    if(!n) return;
    if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++;
      state.verseKey = null;
      currentVerseIndex = null;
      renderRead();
      updateUrl('push');
    }
  });

  if(prevVerseBtn) prevVerseBtn.addEventListener('click', ()=> {
    if(currentVerseIndex === null) return;
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(currentVerseIndex > 0) {
      state.verseKey = ch[currentVerseIndex - 1].key;
      renderRead();
      updateUrl('push');
    } else if(state.chapterIndex > 0) {
      state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push');
      // jump to end of prev chapter after load
      setTimeout(()=> {
        const n2 = normCache[state.versionA];
        if(n2) {
          const last = n2.books[state.bookIndex].chapters[state.chapterIndex].length - 1;
          state.verseKey = n2.books[state.bookIndex].chapters[state.chapterIndex][last].key;
          renderRead();
        }
      }, 220);
    }
  });

  if(nextVerseBtn) nextVerseBtn.addEventListener('click', ()=> {
    if(currentVerseIndex === null) return;
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(currentVerseIndex + 1 < ch.length) {
      state.verseKey = ch[currentVerseIndex + 1].key;
      renderRead();
      updateUrl('push');
    } else if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl('push');
    }
  });

  if(backHomeBtn) backHomeBtn.addEventListener('click', ()=> {
    showView('home');
    // reset verseKey when going back
    state.verseKey = null;
    currentVerseIndex = null;
    stopTTS();
  });

  // ---------- PLAY / PAUSE / RESUME / STOP (Option A: play full chapter from verse 1) ----------
 /* -------------------------------------------
   TTS SYSTEM (Mobile + Desktop Safe)
------------------------------------------- */

let isPlaying = false;
let currentTTSUtterance = null;

/* Build queue for full chapter (always from verse 1) */
function buildTTSQueueForFullChapter() {
  ttsQueue = [];
  if (!state.versionA) return;
  const n = normCache[state.versionA];
  if (!n) return;
  const ch = (n.books[state.bookIndex] &&
             n.books[state.bookIndex].chapters[state.chapterIndex]) || [];
  for (let i = 0; i < ch.length; i++) {
    ttsQueue.push({ text: ch[i].text, idx: i });
  }
}

/* Speak next verse */
function speakNext() {
  if (!ttsQueue.length) {
    isPlaying = false;
    currentTTSUtterance = null;
    currentVerseIndex = null;
    clearVerseHighlights();
    return;
  }

  const item = ttsQueue.shift();
  currentVerseIndex = item.idx;

  // Highlight & scroll to verse
  setVerseActive(currentVerseIndex);

  try {
    const utter = new SpeechSynthesisUtterance(String(item.text));
    currentTTSUtterance = utter;

    utter.onend = () => {
      currentTTSUtterance = null;
      if (isPlaying) setTimeout(() => speakNext(), 120);
    };

    utter.onerror = () => {
      currentTTSUtterance = null;
      if (isPlaying) setTimeout(() => speakNext(), 120);
    };

    speechSynthesis.speak(utter);

  } catch (e) {
    console.warn("TTS error:", e);
    currentTTSUtterance = null;
    if (isPlaying) setTimeout(() => speakNext(), 120);
  }
}

/* Start full chapter TTS */
function startTTSFullChapter() {
  buildTTSQueueForFullChapter();
  if (!ttsQueue.length) {
    showNotice("Nothing to read");
    return;
  }

  // Ensure reader view
  if (state.view !== "read") showView("read");

  // Ensure verses exist
  renderRead();

  // Begin playback
  isPlaying = true;
  try { speechSynthesis.cancel(); } catch(e){}

  setTimeout(() => {
    speakNext();
  }, 220);
}

/* Pause TTS */
function pauseTTS() {
  try {
    speechSynthesis.pause();
  } catch (e) {}
}

/* SMART RESUME — works on mobile + desktop */
function smartResumeTTS() {
  if (!isPlaying) return;

  // Desktop or supported browsers
  if (speechSynthesis.paused) {
    try {
      speechSynthesis.resume();
      return;
    } catch (e) {
      console.warn("Resume failed → fallback restart", e);
    }
  }

  // MOBILE FALLBACK:
  // Chrome/Android often refuses resume → restart SAME verse
  if (currentVerseIndex !== null) {
    try { speechSynthesis.cancel(); } catch(e){}

    const n = normCache[state.versionA];
    if (!n) return;

    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    const item = ch[currentVerseIndex];
    if (!item) return;

    // Highlight again
    setVerseActive(currentVerseIndex);

    const u = new SpeechSynthesisUtterance(item.text);
    currentTTSUtterance = u;

    u.onend = () => {
      currentTTSUtterance = null;
      // Continue to next verse
      speakNext();
    };
    speechSynthesis.speak(u);
  }
}

/* Stop TTS */
function stopTTS() {
  try { speechSynthesis.cancel(); } catch(e){}
  isPlaying = false;
  ttsQueue = [];
  currentVerseIndex = null;
  currentTTSUtterance = null;
  clearVerseHighlights();
}

/* BUTTON EVENTS */
if (playBtn) playBtn.addEventListener("click", startTTSFullChapter);
if (pauseBtn) pauseBtn.addEventListener("click", pauseTTS);
if (resumeBtn) resumeBtn.addEventListener("click", smartResumeTTS);
if (stopBtn) stopBtn.addEventListener("click", stopTTS);


  // ---------- SEARCH ----------
  async function doSearch(q) {
    if(!q) return;
    q = String(q).trim().toLowerCase();
    if(!q) return;
    if(searchResults) searchResults.innerHTML = '';
    if(searchInfo) searchInfo.textContent = 'Searching...';

    const results = [];
    for(const f of FILES) {
      try {
        if(!searchIndexCache[f]) {
          const n = await fetchAndNormalize(f);
          if(!n) continue;
        }
        const idx = searchIndexCache[f];
        if(!idx) continue;
        for(const r of idx) {
          if(r.low.includes(q)) results.push(r);
        }
      } catch(e) {
        console.warn('search file error', f, e);
      }
    }

    if(searchInfo) searchInfo.textContent = `Found ${results.length}`;

    if(!results.length) {
      if(searchResults) searchResults.innerHTML = `<div style="padding:8px;color:#666">No results</div>`;
      showView('search');
      return;
    }

    // render results (limit to 300)
    const frag = document.createDocumentFragment();
    const safeRe = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'ig');

    results.slice(0,300).forEach(r => {
      const div = document.createElement('div');
      div.className = 'search-item';
      const snippet = esc(r.text).replace(safeRe, m => `<span class="highlight">${m}</span>`);
      div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey} — ${String(r.file).replace(/_bible.json$/,'').toUpperCase()}</strong>
                       <div style="margin-top:6px">${snippet}</div>
                       <small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
      div.addEventListener('click', async ()=> {
        // open clicked result as Version A
        state.versionA = r.file; if(homeA) homeA.value = r.file;
        state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
        await fetchAndNormalize(state.versionA);
        await populateBooksForA(state.versionA);
        showView('read');
        renderRead();
        updateUrl('push');
      });
      frag.appendChild(div);
    });

    if(searchResults) searchResults.appendChild(frag);
    showView('search');
  }

  if(searchBox) searchBox.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
      const q = (searchBox.value || '').trim();
      if(q) doSearch(q);
    }
  });

  // ---------- URL SYNC ----------
  function updateUrl(mode = 'push') {
    try {
      const p = new URLSearchParams();
      if(state.versionA) p.set('versionA', state.versionA);
      if(state.versionB) p.set('versionB', state.versionB);
      p.set('bookIndex', String(state.bookIndex));
      p.set('chapter', String(state.chapterIndex + 1));
      if(state.verseKey) p.set('verse', state.verseKey);
      p.set('view', state.view || 'home');
      const url = location.pathname + '?' + p.toString();
      if(mode === 'replace') history.replaceState({...state}, '', url); else history.pushState({...state}, '', url);
    } catch(e){}
  }

  window.addEventListener('popstate', async () => {
    const p = new URLSearchParams(location.search);
    const va = p.get('versionA'), vb = p.get('versionB');
    if(va) { state.versionA = va; if(homeA) homeA.value = va; await populateBooksForA(va); await fetchAndNormalize(va); }
    if(vb) { state.versionB = vb; if(homeB) homeB.value = vb; await fetchAndNormalize(vb); }
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || 'home';
    showView(state.view);
  });

  // ---------- SWIPE & MOUSE DRAG for chapter navigation (keeps full chapter display) ----------
  (function attachSwipe() {
    if(!readVerses) return;
    let startX = 0;

    readVerses.addEventListener('touchstart', e => { startX = e.changedTouches[0].clientX; }, { passive: true });
    readVerses.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if(Math.abs(dx) < 60) return;
      const n = normCache[state.versionA];
      if(!n) return;
      if(dx < 0) {
        // next chapter
        if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
          state.chapterIndex++;
          state.verseKey = null; currentVerseIndex = null;
          renderRead(); updateUrl('push');
        }
      } else {
        if(state.chapterIndex > 0) {
          state.chapterIndex--;
          state.verseKey = null; currentVerseIndex = null;
          renderRead(); updateUrl('push');
        }
      }
    }, { passive: true });

    // mouse drag for desktop
    let mouseDown = false, mstart = 0, mcur = 0;
    readVerses.addEventListener('mousedown', e => { mouseDown = true; mstart = e.clientX; });
    document.addEventListener('mousemove', e => { if(!mouseDown) return; mcur = e.clientX; });
    document.addEventListener('mouseup', e => {
      if(!mouseDown) return; mouseDown = false;
      const dx = (mcur || e.clientX) - mstart;
      if(Math.abs(dx) < 100) { mstart = mcur = 0; return; }
      const n = normCache[state.versionA];
      if(!n) return;
      if(dx < 0) {
        if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
          state.chapterIndex++; state.verseKey = null; currentVerseIndex = null; renderRead(); updateUrl('push');
        }
      } else {
        if(state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; currentVerseIndex = null; renderRead(); updateUrl('push'); }
      }
      mstart = mcur = 0;
    });
  })();

  // ---------- KEYBOARD NAV ----------
  document.addEventListener('keydown', e => {
    if(state.view !== 'read') return;
    const n = normCache[state.versionA]; if(!n) return;
    if(e.key === 'ArrowRight') { if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowLeft')  { if(state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || []; if(!ch.length) return;
      const keys = ch.map(v => v.key); const idx = state.verseKey ? keys.indexOf(state.verseKey) : -1;
      if(e.key === 'ArrowDown' && idx >= 0 && idx + 1 < keys.length) { state.verseKey = keys[idx + 1]; renderRead(); updateUrl('push'); }
      if(e.key === 'ArrowUp' && idx > 0) { state.verseKey = keys[idx - 1]; renderRead(); updateUrl('push'); }
    }
  });

  // ---------- INITIAL LOAD ----------
  (async function initialLoad() {
    populateVersions();
    loadVersions();

    // check URL params
    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;
    if(vA) { state.versionA = vA; if(homeA) homeA.value = vA; await populateBooksForA(vA); await fetchAndNormalize(vA); }
    if(vB) { state.versionB = vB; if(homeB) homeB.value = vB; await fetchAndNormalize(vB); }
    state.bookIndex = Number(params.get('bookIndex') || state.bookIndex);
    state.chapterIndex = params.get('chapter') ? Number(params.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = params.get('verse') || null;
    state.view = params.get('view') || state.view || 'home';
    showView(state.view);
    if(state.view === 'read') renderRead();
    updateUrl('replace');
  })();

  // ---------- DEBUG API ----------
  window.BibleReader = {
    state, normCache, searchIndexCache, fetchAndNormalize, renderRead
  };

  // End of file
})();
