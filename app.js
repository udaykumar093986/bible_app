/* app.js — FINAL production (SAFE MODE)
   - Option A selected by user
   - Search fixed (global across files; builds index on-demand)
   - Swipe/navigation starts chapter viewing at Verse 1
   - Highlight & auto-scroll for active verse
   - TTS auto-scroll per verse (primary only)
   - Dark/Light persisted to localStorage
   - Assumes uniform JSON files at BASE (same structure you provided)
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

  // ---------- DOM shortcuts ----------
  const $ = id => document.getElementById(id);

  // top tabs & panes
  const tabHome = $('tab-home'), tabRead = $('tab-read'), tabSearch = $('tab-search');
  const paneHome = $('pane-home'), paneRead = $('pane-read'), paneSearch = $('pane-search');

  // home controls
  const homeA = $('homeA'), homeB = $('homeB');
  const homeBook = $('homeBook'), homeChapter = $('homeChapter'), homeVerse = $('homeVerse');
  const homeRange = $('homeRange'), homeOpen = $('homeOpen');

  // reader controls
  const readRef = $('readRef'), readVerses = $('readVerses'), readNav = $('readNav');
  const prevVerseBtn = $('prevVerse'), nextVerseBtn = $('nextVerse');
  const prevChapterBtn = $('prevChapter'), nextChapterBtn = $('nextChapter');
  const backHomeBtn = $('backHome');

  // TTS
  const playBtn = $('play'), pauseBtn = $('pause'), resumeBtn = $('resume'), stopBtn = $('stop');

  // search
  const searchBox = $('searchBox'), searchInfo = $('searchInfo'), searchResults = $('searchResults');

  // theme
  const themeToggle = $('themeToggle');

  // bottom nav
  const bottomItems = document.querySelectorAll('#bottomNav .bottom-item');

  // notice
  const notice = $('notice');

  // ---------- STATE & CACHES ----------
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: 'home'
  };

  const normCache = {};        // filename -> normalized { books: [...] }
  const searchIndexCache = {}; // filename -> index array

  // runtime
  let currentVerseIndex = null; // integer index in the current chapter, or null
  let ttsQueue = [];

  // highlight color (safe)
  const HIGHLIGHT_COLOR = "#fff6b0";

  // ---------- UTIL ----------
  const esc = s => String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const isNumber = n => Number.isFinite(Number(n));

  function showNotice(msg, ms = 1400){
    if(!notice) return;
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(()=> { if(notice) notice.style.display = 'none'; }, ms);
  }

  // ---------- THEME ----------
  (function initTheme(){
    try {
      const saved = localStorage.getItem('theme');
      if(saved === 'dark') document.body.classList.add('dark');
    } catch(e){}
    if(themeToggle){
      themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        try { localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch(e){}
      });
    }
  })();

  // ---------- NORMALIZE JSON ----------
  function normalizeUniform(json){
    const books = [];
    if(!json || typeof json !== 'object') return { books };
    Object.keys(json).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      const chapterNums = Object.keys(chaptersObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
      const chapters = chapterNums.map(chNum => {
        const versesObj = chaptersObj[chNum] || {};
        const verseNums = Object.keys(versesObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
        return verseNums.map(vnum => ({ key: String(vnum), text: String(versesObj[vnum] || '') }));
      });
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  // ---------- FETCH + NORMALIZE ----------
  async function fetchAndNormalize(fname){
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];
    const url = BASE + fname;
    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error(`fetch failed ${res.status}`);
      const j = await res.json();
      const norm = normalizeUniform(j);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    } catch(err){
      console.error('fetchAndNormalize', err);
      showNotice('Failed to load ' + fname, 2000);
      return null;
    }
  }

  // ---------- Build search index ----------
  function buildSearchIndex(fname, norm){
    if(searchIndexCache[fname]) return searchIndexCache[fname];
    const arr = [];
    (norm.books || []).forEach((b, bi) => {
      (b.chapters || []).forEach((ch, ci) => {
        (ch || []).forEach((v, vi) => {
          arr.push({
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
    return arr;
  }

  // ---------- Populate versions dropdowns ----------
  function populateVersions(){
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

  // ---------- Tabs and bottom nav ----------
  function showView(view){
    state.view = view;
    if(paneHome) paneHome.style.display = view === 'home' ? 'block' : 'none';
    if(paneRead) paneRead.style.display = view === 'read' ? 'block' : 'none';
    if(paneSearch) paneSearch.style.display = view === 'search' ? 'block' : 'none';

    if(tabHome) tabHome.classList.toggle('active', view === 'home');
    if(tabRead) tabRead.classList.toggle('active', view === 'read');
    if(tabSearch) tabSearch.classList.toggle('active', view === 'search');

    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === view));

    if(view === 'search'){
      if(searchResults) searchResults.innerHTML = '';
      if(searchInfo) searchInfo.textContent = '';
      setTimeout(()=> searchBox && searchBox.focus(), 120);
    }
    if(view === 'read') renderRead();
    updateUrl('replace');
  }

  if(tabHome) tabHome.addEventListener('click', ()=> showView('home'));
  if(tabRead) tabRead.addEventListener('click', ()=> showView('read'));
  if(tabSearch) tabSearch.addEventListener('click', ()=> showView('search'));
  bottomItems.forEach(it => it.addEventListener('click', ()=> { const t = it.dataset.tab; if(t) showView(t); }));

  // ---------- Save/Load versions ----------
  function saveVersions(){
    try { localStorage.setItem('lastA', state.versionA || ''); localStorage.setItem('lastB', state.versionB || ''); } catch(e){}
  }
  function loadVersions(){
    try {
      const a = localStorage.getItem('lastA'), b = localStorage.getItem('lastB');
      if(a){ state.versionA = a; if(homeA) homeA.value = a; }
      if(b){ state.versionB = b; if(homeB) homeB.value = b; }
    } catch(e){}
  }

  // ---------- Populate books/chapters/verses for Version A ----------
  async function populateBooksForA(fname){
    if(!fname) return;
    const n = await fetchAndNormalize(fname);
    if(!n) return;
    if(homeBook){
      homeBook.innerHTML = "<option value=''>Book</option>";
      n.books.forEach((b,i) => homeBook.appendChild(new Option(b.name, i)));
    }
    if(homeChapter) homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(homeVerse) homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  if(homeA) homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f){ state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f; saveVersions();
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

  if(homeOpen) homeOpen.addEventListener('click', async ()=> {
    if(!homeA.value && !state.versionA){ showNotice('Select Version A'); return; }
    state.versionA = homeA.value || state.versionA;
    state.versionB = homeB.value || null;
    state.bookIndex = (homeBook && homeBook.value !== '') ? Number(homeBook.value) : 0;
    state.chapterIndex = (homeChapter && homeChapter.value !== '') ? Number(homeChapter.value) : 0;
    if(homeRange && homeRange.value && homeRange.value.trim()) state.verseKey = homeRange.value.trim();
    else if(homeVerse && homeVerse.value) state.verseKey = String(Number(homeVerse.value) + 1);
    else state.verseKey = null;
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    saveVersions();
    showView('read');
  });

  // ---------- Clamp indices ----------
  function clampIndices(){
    if(!state.versionA) { state.bookIndex = 0; state.chapterIndex = 0; return; }
    const n = normCache[state.versionA];
    if(!n || !n.books.length){ state.bookIndex = 0; state.chapterIndex = 0; return; }
    if(!isNumber(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !book.chapters.length){ state.chapterIndex = 0; return; }
    if(!isNumber(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
  }

  // ---------- Render (stacked parallel) ----------
  function paragraphHtml(text){
    if(!text) return '';
    return String(text).split(/\n+/).map(p => `<div class="para">${esc(p.trim())}</div>`).join('');
  }

  function clearActiveVerseStyles(){
    const blocks = document.querySelectorAll('.verse-block.active');
    blocks.forEach(b => {
      b.classList.remove('active');
      b.style.background = '';
    });
  }

  function setActiveVerse(idx, opts = { smooth: true }){
    clearActiveVerseStyles();
    currentVerseIndex = idx;
    const el = document.getElementById(`verse-${idx}`);
    if(!el) return;
    el.classList.add('active');
    el.style.background = `linear-gradient(90deg, ${HIGHLIGHT_COLOR}33, ${HIGHLIGHT_COLOR}22)`;
    try { el.scrollIntoView({ behavior: opts.smooth ? 'smooth' : 'auto', block: 'center' }); } catch(e){}
  }

  function showReadNav(show, idx = null){
    if(readNav) readNav.style.display = show ? 'flex' : 'none';
    if(show && typeof idx === 'number') setTimeout(()=> setActiveVerse(idx, { smooth: true }), 80);
  }

  function renderRead(){
    if(!readVerses) return;
    readVerses.innerHTML = '';

    if(!state.versionA){
      if(readRef) readRef.textContent = 'Select Version A';
      return;
    }
    const nA = normCache[state.versionA];
    if(!nA){
      if(readRef) readRef.textContent = 'Loading...';
      return;
    }

    clampIndices();
    const book = nA.books[state.bookIndex];
    if(!book){ if(readRef) readRef.textContent = 'No book'; return; }

    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || []
      : [];

    if(readRef) readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;

    // helper to render single verse block
    function renderBlock(i, smooth = false){
      const va = chapA[i] || null;
      const vb = chapB[i] || null;
      const verseNum = va ? va.key : (vb ? vb.key : String(i+1));

      const block = document.createElement('div');
      block.className = 'verse-block';
      block.id = `verse-${i}`;
      block.dataset.index = String(i);

      const header = document.createElement('div');
      header.className = 'verse-num';
      header.textContent = `Verse ${verseNum}`;
      block.appendChild(header);

      const txtA = document.createElement('div');
      txtA.className = 'verse-text';
      txtA.innerHTML = paragraphHtml(va ? va.text : '');
      block.appendChild(txtA);

      if(state.versionB){
        const txtB = document.createElement('div');
        txtB.className = 'verse-secondary';
        txtB.innerHTML = paragraphHtml(vb ? vb.text : '');
        block.appendChild(txtB);
      }

      readVerses.appendChild(block);

      // if the block is the currentVerseIndex, highlight & scroll
      if(currentVerseIndex !== null && currentVerseIndex === i) setActiveVerse(i, { smooth: true });
      if(smooth) {
        setTimeout(()=> {
          const el = document.getElementById(`verse-${i}`);
          if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 90);
      }
    }

    // if verseKey specified
    if(state.verseKey){
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){
        renderBlock(exact, true);
        showReadNav(true, exact);
        currentVerseIndex = exact;
        return;
      }
      const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1]) - 1);
        const e = Math.min(chapA.length - 1, Number(m[2]) - 1);
        for(let i=s;i<=e;i++) renderBlock(i);
        showReadNav(true, s);
        currentVerseIndex = s;
        return;
      }
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length - 1, Number(state.verseKey) - 1));
        renderBlock(idx, true); showReadNav(true, idx); currentVerseIndex = idx; return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>';
      showReadNav(false);
      currentVerseIndex = null;
      return;
    }

    // otherwise render whole chapter starting at verse 1 (normal)
    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++) renderBlock(i);
    showReadNav(false);
    currentVerseIndex = null;
  }

  // ---------- Set verse helper ----------
  function setVerseByIndex(idx){
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(!ch || idx < 0 || idx >= ch.length) return;
    state.verseKey = ch[idx].key;
    renderRead();
    updateUrl('push');
  }

  // ---------- Prev/Next Verse & Chapter wiring ----------
  if(prevVerseBtn) prevVerseBtn.addEventListener('click', ()=> {
    if(currentVerseIndex === null) return;
    if(currentVerseIndex > 0) setVerseByIndex(currentVerseIndex - 1);
    else if(state.chapterIndex > 0){
      state.chapterIndex--; state.verseKey = '1'; currentVerseIndex = 0;
      renderRead(); updateUrl('push');
    }
  });

  if(nextVerseBtn) nextVerseBtn.addEventListener('click', ()=>{
    if(currentVerseIndex === null) return;
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(currentVerseIndex < ch.length - 1) setVerseByIndex(currentVerseIndex + 1);
    else if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){
      state.chapterIndex++; state.verseKey = '1'; currentVerseIndex = 0; renderRead(); updateUrl('push');
    }
  });

  if(prevChapterBtn) prevChapterBtn.addEventListener('click', ()=> {
    if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; currentVerseIndex = null; renderRead(); updateUrl('push'); }
  });

  if(nextChapterBtn) nextChapterBtn.addEventListener('click', ()=> {
    const n = normCache[state.versionA]; if(!n) return;
    if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey = null; currentVerseIndex = null; renderRead(); updateUrl('push'); }
  });

  if(backHomeBtn) backHomeBtn.addEventListener('click', ()=> showView('home'));

  // ---------- TTS with auto-scroll highlight ----------
  function buildTTSQueue(){
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const exact = ch.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){ ttsQueue.push({text: ch[exact].text, idx: exact}); return; }
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(m){ const s=Number(m[1])-1, e=Number(m[2])-1; for(let i=Math.max(0,s); i<=Math.min(e,ch.length-1); i++) ttsQueue.push({text: ch[i].text, idx:i}); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx=Math.max(0, Math.min(ch.length-1, Number(state.verseKey)-1)); ttsQueue.push({text: ch[idx].text, idx}); return; }
    }
    ch.forEach((v,i)=> ttsQueue.push({text: v.text, idx:i}));
  }

  function speakNext(){
    if(!ttsQueue.length){ currentVerseIndex = null; return; }
    const it = ttsQueue.shift();
    currentVerseIndex = it.idx;
    const el = document.getElementById(`verse-${it.idx}`);
    if(el) setActiveVerse(it.idx, { smooth: true });
    else { renderRead(); setTimeout(()=> setActiveVerse(it.idx, { smooth: true }), 140); }

    const u = new SpeechSynthesisUtterance(String(it.text));
    u.onend = speakNext;
    u.onerror = speakNext;
    try { speechSynthesis.speak(u); } catch(e) { console.warn('TTS speak error', e); speakNext(); }
  }

  if(playBtn) playBtn.addEventListener('click', ()=> {
    try{ speechSynthesis.cancel(); } catch(e){}
    buildTTSQueue();
    if(state.view !== 'read') showView('read');
    if(!ttsQueue.length) return;
    renderRead();
    setTimeout(()=> speakNext(), 200);
  });
  if(pauseBtn) pauseBtn.addEventListener('click', ()=> { try{ speechSynthesis.pause(); } catch(e){} });
  if(resumeBtn) resumeBtn.addEventListener('click', ()=> { try{ speechSynthesis.resume(); } catch(e){} });
  if(stopBtn) stopBtn.addEventListener('click', ()=> { try{ speechSynthesis.cancel(); ttsQueue = []; currentVerseIndex = null; clearActiveVerseStyles(); } catch(e){} });

  // ---------- SEARCH (global across FILES) ----------
  async function doSearch(q){
    if(!q) return;
    if(searchResults) searchResults.innerHTML = '';
    if(searchInfo) searchInfo.textContent = '';

    const qs = q.trim().toLowerCase();
    if(!qs) return;

    const results = [];

    // build index on-demand for files; do sequential to avoid overloading
    for(const f of FILES){
      try {
        if(!searchIndexCache[f]){
          const norm = await fetchAndNormalize(f);
          if(!norm) continue;
        }
        const idx = searchIndexCache[f];
        if(!idx) continue;
        // find matches quickly
        for(let i=0;i<idx.length;i++){
          const r = idx[i];
          if(r.low.includes(qs)) results.push(Object.assign({}, r, { file: f }));
          if(results.length >= 500) break;
        }
      } catch(e){ console.warn('search file error', f, e); }
      if(results.length >= 500) break;
    }

    if(searchInfo) searchInfo.textContent = `Found ${results.length}`;
    if(!results.length){
      if(searchResults) searchResults.innerHTML = `<div style="padding:8px;color:#666">No results</div>`;
      showView('search');
      return;
    }

    const safe = qs.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(safe, 'ig');

    const frag = document.createDocumentFragment();
    results.forEach(r => {
      const div = document.createElement('div'); div.className = 'search-item';
      const snippet = esc(r.text).replace(re, m => `<span class="highlight">${m}</span>`);
      div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey} — ${String(r.file).replace(/_bible.json$/,'').toUpperCase()}</strong>
                       <div style="margin-top:6px">${snippet}</div>
                       <small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
      div.addEventListener('click', async ()=> {
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

  document.addEventListener('DOMContentLoaded', ()=>{
    if(searchBox){
      searchBox.onkeydown = (e) => {
        if(e.key === 'Enter'){
          const q = (searchBox.value || '').trim();
          if(!q) return;
          doSearch(q);
        }
      };
    }
  });

  // ---------- URL sync ----------
  function updateUrl(mode = 'push'){
    const p = new URLSearchParams();
    if(state.versionA) p.set('versionA', state.versionA);
    if(state.versionB) p.set('versionB', state.versionB);
    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));
    if(state.verseKey) p.set('verse', state.verseKey);
    p.set('view', state.view || 'home');
    const url = location.pathname + '?' + p.toString();
    try {
      if(mode === 'replace') history.replaceState({...state}, '', url);
      else history.pushState({...state}, '', url);
    } catch(e){}
  }

  window.addEventListener('popstate', async ()=>{
    const p = new URLSearchParams(location.search);
    const va = p.get('versionA'), vb = p.get('versionB');
    if(va){ state.versionA = va; if(homeA) homeA.value = va; await populateBooksForA(va); await fetchAndNormalize(va); }
    if(vb){ state.versionB = vb; if(homeB) homeB.value = vb; await fetchAndNormalize(vb); }
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || 'home';
    showView(state.view);
  });

  // ---------- Swipe & Drag (chapter navigation) ----------
  (function attachSwipe(){
    if(!readVerses) return;
    let startX = 0;
    readVerses.addEventListener('touchstart', e => { startX = e.changedTouches[0].clientX; }, { passive: true });
    readVerses.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if(Math.abs(dx) < 60) return;
      const n = normCache[state.versionA]; if(!n) return;
      if(dx < 0){
        if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
          state.chapterIndex++;
          // ensure view starts from verse 1 on chapter change by swipe
          state.verseKey = null;
          currentVerseIndex = null;
          renderRead(); updateUrl('push');
        }
      } else {
        if(state.chapterIndex > 0){
          state.chapterIndex--;
          state.verseKey = null;
          currentVerseIndex = null;
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
      const n = normCache[state.versionA]; if(!n) return;
      if(dx < 0){
        if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){
          state.chapterIndex++;
          state.verseKey = null;
          currentVerseIndex = null;
          renderRead(); updateUrl('push');
        }
      } else {
        if(state.chapterIndex > 0){
          state.chapterIndex--;
          state.verseKey = null;
          currentVerseIndex = null;
          renderRead(); updateUrl('push');
        }
      }
      mstart = mcur = 0;
    });
  })();

  // ---------- Keyboard nav ----------
  document.addEventListener('keydown', e => {
    if(state.view !== 'read') return;
    const n = normCache[state.versionA]; if(!n) return;
    if(e.key === 'ArrowRight'){ if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey = '1'; currentVerseIndex = 0; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowLeft'){ if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = '1'; currentVerseIndex = 0; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || []; if(!ch.length) return;
      const keys = ch.map(v => v.key); const idx = state.verseKey ? keys.indexOf(state.verseKey) : -1;
      if(e.key === 'ArrowDown' && idx >= 0 && idx + 1 < keys.length){ state.verseKey = keys[idx + 1]; renderRead(); updateUrl('push'); }
      if(e.key === 'ArrowUp' && idx > 0){ state.verseKey = keys[idx - 1]; renderRead(); updateUrl('push'); }
    }
  });

  // ---------- Initial load ----------
  async function initialLoad(){
    populateVersions();
    loadVersions();

    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;
    if(vA){ state.versionA = vA; if(homeA) homeA.value = vA; await populateBooksForA(vA); await fetchAndNormalize(vA); }
    if(vB){ state.versionB = vB; if(homeB) homeB.value = vB; await fetchAndNormalize(vB); }
    state.bookIndex = Number(params.get('bookIndex') || state.bookIndex);
    state.chapterIndex = params.get('chapter') ? Number(params.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = params.get('verse') || null;
    state.view = params.get('view') || state.view || 'home';
    showView(state.view);
    if(state.view === 'read') renderRead();
    updateUrl('replace');
  }

  initialLoad().catch(err => console.error('initialLoad failed', err));

  // expose debug API (optional)
  window.BibleReader = { state, normCache, searchIndexCache, fetchAndNormalize, renderRead, populateBooksForA, doSearch };

})();
