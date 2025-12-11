// app.js — Full rewrite: stable loader, search, URL sync, back button, NaN fix, swipe, keyboard, TTS
(() => {
  /* ===========================
     Configuration
     =========================== */
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  /* ===========================
     DOM references
     =========================== */
  const el = id => document.getElementById(id);
  const tabs = { home: el("tab-home"), read: el("tab-read"), search: el("tab-search") };
  const panes = { home: el("pane-home"), read: el("pane-read"), search: el("pane-search") };

  const homeA = el("homeA"), homeB = el("homeB"), homeBook = el("homeBook"),
        homeChapter = el("homeChapter"), homeVerse = el("homeVerse"), homeRange = el("homeRange"),
        homeOpen = el("homeOpen");

  const readRef = el("readRef"), readVerses = el("readVerses"), readNav = el("readNav"),
        prevChapterBtn = el("prevChapter"), nextChapterBtn = el("nextChapter"), backHomeBtn = el("backHome");

  const playBtn = el("play"), pauseBtn = el("pause"), resumeBtn = el("resume"), stopBtn = el("stop");
  const searchBox = el("searchBox"), searchInfo = el("searchInfo"), searchResults = el("searchResults");
  const notice = el("notice");
  const bottomNav = el("bottomNav"), bottomItems = bottomNav ? bottomNav.querySelectorAll(".bottom-item") : [];

  /* ===========================
     In-memory caches & state
     =========================== */
  const normCache = {};        // filename -> { books: [ { name, chapters: [ [ {key,text}, ... ] ] } ] }
  const searchIndexCache = {}; // filename -> [ {bookIndex,chapterIndex,verseIndex,book,chapter,verseKey,text,low} ]

  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: 'home'
  };

  /* ===========================
     Utility helpers
     =========================== */
  function esc(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
  function showNotice(msg, ms=1400){ if(!notice) return; notice.textContent = msg; notice.style.display='block'; setTimeout(()=> notice.style.display='none', ms); }
  function setActiveTabUI(name){
    Object.values(tabs).forEach(t => t && t.classList.remove('active'));
    if(tabs[name]) tabs[name].classList.add('active');
    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  }
  function saveLastVersions(){ try{ localStorage.setItem('lastA', state.versionA||''); localStorage.setItem('lastB', state.versionB||''); }catch(e){} }
  function loadLastVersions(){ try{ const a = localStorage.getItem('lastA'); const b = localStorage.getItem('lastB'); if(a) state.versionA=a; if(b) state.versionB=b; }catch(e){} }

  /* ===========================
     JSON normalization (uniform)
     Format expected:
     { "Genesis": { "1": { "1":"text", ... }, "2": {...} }, "Exodus": {...} }
     Normalized -> { books: [ { name, chapters: [ [ {key,text}, ... ] ] } ] }
     =========================== */
  function normalizeUniform(json){
    const books = [];
    for(const bookName of Object.keys(json || {})){
      const chaptersObj = json[bookName] || {};
      const chapterNums = Object.keys(chaptersObj)
        .map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b).map(String);
      const chapters = chapterNums.map(ck => {
        const versesObj = chaptersObj[ck] || {};
        const verseNums = Object.keys(versesObj)
          .map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b).map(String);
        return verseNums.map(vk => ({ key: vk, text: String(versesObj[vk] || '') }));
      });
      books.push({ name: bookName, chapters });
    }
    return { books };
  }

  /* ===========================
     Fetch + normalize (with caching)
     Returns normalized object or null
     =========================== */
  async function fetchAndNormalize(fname){
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];
    try{
      const url = BASE + fname;
      const res = await fetch(url);
      if(!res.ok){ console.error('Fetch failed', url, res.status); showNotice('Failed to load ' + fname); return null; }
      const j = await res.json();
      const norm = normalizeUniform(j);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    }catch(err){
      console.error('fetchAndNormalize error', err);
      showNotice('Error loading ' + fname);
      return null;
    }
  }

  /* ===========================
     Build search index for a version (cached)
     =========================== */
  function buildSearchIndex(fname, norm){
    if(!norm || !norm.books) { searchIndexCache[fname] = []; return; }
    const arr = [];
    norm.books.forEach((b, bi) => {
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
            low: (v.text||'').toLowerCase()
          });
        });
      });
    });
    searchIndexCache[fname] = arr;
  }

  /* ===========================
     Populate version dropdowns
     =========================== */
  function populateVersionDropdowns(){
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach(f => {
      const label = f.replace("_bible.json","").replace(".json","").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }

  /* ===========================
     Populate books/chapters/verses based on loaded versionA
     Returns a promise that resolves when done (safe to await)
     =========================== */
  async function populateBooksAndChapters(){
    homeBook.innerHTML = "<option value=''>Book</option>";
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";

    const v = state.versionA;
    if(!v) return;
    const n = await fetchAndNormalize(v);
    if(!n) return;
    n.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));
  }

  /* ===========================
     Clamp indices to actual loaded data (protect against NaN/out-of-range)
     =========================== */
  function clampIndicesForCurrentVersion(){
    if(!state.versionA) { state.bookIndex = 0; state.chapterIndex = 0; state.verseKey = null; return; }
    const n = normCache[state.versionA];
    if(!n || !Array.isArray(n.books) || n.books.length === 0){ state.bookIndex = 0; state.chapterIndex = 0; state.verseKey = null; return; }
    if(!Number.isFinite(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !Array.isArray(book.chapters) || book.chapters.length === 0){ state.chapterIndex = 0; state.verseKey = null; return; }
    if(!Number.isFinite(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
    // if verseKey exists, ensure it maps; if not, leave as-is - renderRead will handle not found
  }

  /* ===========================
     Activate tab (single function)
     =========================== */
  function activateTab(name){
    state.view = name;
    setActiveTabUI(name);
    panes.home.style.display = (name === 'home') ? 'block' : 'none';
    panes.read.style.display = (name === 'read') ? 'block' : 'none';
    panes.search.style.display = (name === 'search') ? 'block' : 'none';

    if(name === 'home'){
      // focus first meaningful control
      setTimeout(()=> homeA && homeA.focus(), 60);
    } else if(name === 'search'){
      setTimeout(()=> searchBox && searchBox.focus(), 60);
    } else if(name === 'read'){
      renderRead();
    }
    updateUrl('push');
  }

  /* ===========================
     Render Read Pane
     =========================== */
  function renderRead(){
    if(!state.versionA){ readRef.textContent = 'Select Version A'; readVerses.innerHTML = ''; return; }
    const normA = normCache[state.versionA];
    if(!normA){ readRef.textContent = 'Loading...'; readVerses.innerHTML = ''; return; }

    clampIndicesForCurrentVersion();

    const book = normA.books[state.bookIndex];
    if(!book){ readRef.textContent = 'No book'; readVerses.innerHTML=''; return; }
    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex]) ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    // If a specific verse or range asked
    if(state.verseKey){
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){ renderVerseBlock(exact, chapA, chapB); showReadNav(true, exact); return; }
      const rng = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(rng){
        let s = Math.max(0, Number(rng[1]) - 1);
        let e = Math.min(chapA.length - 1, Number(rng[2]) - 1);
        for(let i = s; i <= e; i++) renderVerseBlock(i, chapA, chapB);
        showReadNav(true, s);
        return;
      }
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length - 1, Number(state.verseKey) - 1));
        renderVerseBlock(idx, chapA, chapB); showReadNav(true, idx); return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    // render entire chapter (or parallel)
    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++) renderVerseBlock(i, chapA, chapB);
    showReadNav(false);
  }

  function renderVerseBlock(idx, chapA, chapB){
    const va = chapA[idx] || null;
    const vb = chapB[idx] || null;
    const verseNum = va ? va.key : (vb ? vb.key : (idx + 1));
    const labelA = state.versionA ? state.versionA.replace("_bible.json","").replace(".json","").toUpperCase() : 'A';
    const labelB = state.versionB ? state.versionB.replace("_bible.json","").replace(".json","").toUpperCase() : null;

    const block = document.createElement('div');
    block.className = 'verse-block';
    block.innerHTML = `
      <div class="verse-num">Verse ${esc(verseNum)}</div>
      <div class="verse-label">${esc(labelA)}</div>
      <div class="verse-text">${esc(va ? va.text : '')}</div>
      ${ state.versionB ? `<div class="verse-label">${esc(labelB)}</div><div class="verse-secondary">${esc(vb? vb.text : '')}</div>` : '' }
    `;
    readVerses.appendChild(block);
  }

  function showReadNav(show, idx = null){
    if(readNav) readNav.style.display = show ? 'flex' : 'none';
    currentVerseIndex = (typeof idx === 'number') ? idx : null;
  }

  /* ===========================
     Read navigation helpers
     =========================== */
  let currentVerseIndex = null;
  function setVerseByIndex(idx){
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(!ch || idx < 0 || idx >= ch.length) return;
    state.verseKey = ch[idx].key;
    renderRead();
    updateUrl('push');
  }

  prevChapterBtn && prevChapterBtn.addEventListener('click', ()=> {
    if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push'); }
  });
  nextChapterBtn && nextChapterBtn.addEventListener('click', ()=> {
    const n = normCache[state.versionA];
    if(!n) return;
    const chapterCount = n.books[state.bookIndex].chapters.length;
    if(state.chapterIndex + 1 < chapterCount){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); }
  });

  // Back button
  if(backHomeBtn) backHomeBtn.addEventListener('click', ()=> {
    activateTab('home');
    updateUrl('push');
  });

  /* ===========================
     Keyboard navigation and swipe
     =========================== */
  document.addEventListener('keydown', (e) => {
    if(state.view !== 'read') return;
    // arrow keys:
    if(e.key === 'ArrowRight' && !e.shiftKey){ nextChapterBtn && nextChapterBtn.click(); }
    if(e.key === 'ArrowLeft' && !e.shiftKey){ prevChapterBtn && prevChapterBtn.click(); }
    if(e.key === 'ArrowRight' && e.shiftKey){ // shift+right => next book
      const n = normCache[state.versionA]; if(!n) return;
      if(state.bookIndex + 1 < n.books.length){ state.bookIndex++; state.chapterIndex = 0; state.verseKey = null; renderRead(); updateUrl('push'); }
    }
    if(e.key === 'ArrowLeft' && e.shiftKey){
      if(state.bookIndex > 0){ state.bookIndex--; state.chapterIndex = 0; state.verseKey = null; renderRead(); updateUrl('push'); }
    }
    // page up/down:
    if(e.key === 'PageDown'){ const n = normCache[state.versionA]; if(n){ state.chapterIndex = Math.min(state.chapterIndex + 5, n.books[state.bookIndex].chapters.length - 1); state.verseKey = null; renderRead(); updateUrl('push'); } }
    if(e.key === 'PageUp'){ state.chapterIndex = Math.max(state.chapterIndex - 5, 0); state.verseKey = null; renderRead(); updateUrl('push'); }
    // up/down navigate verses (if verseKey present)
    if(e.key === 'ArrowUp' || e.key === 'ArrowDown'){ const n = normCache[state.versionA]; if(!n) return; const curChap = n.books[state.bookIndex].chapters[state.chapterIndex] || []; const keys = curChap.map(v => v.key); const idx = state.verseKey ? keys.indexOf(state.verseKey) : -1; if(e.key === 'ArrowDown' && idx >= 0 && idx + 1 < keys.length){ state.verseKey = keys[idx+1]; renderRead(); updateUrl('push'); } if(e.key === 'ArrowUp' && idx > 0){ state.verseKey = keys[idx-1]; renderRead(); updateUrl('push'); } }
  });

  // swipe/drags on readVerses
  (function attachSwipe(){
    if(!readVerses) return;
    let startX = 0, mouseDown=false, curX=0;
    readVerses.addEventListener('touchstart', e => startX = e.changedTouches[0].clientX, {passive:true});
    readVerses.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - startX; if(Math.abs(dx) < 60) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); }, {passive:true});
    readVerses.addEventListener('mousedown', e => { mouseDown=true; startX = e.clientX; });
    document.addEventListener('mousemove', e => { if(!mouseDown) return; curX = e.clientX; });
    document.addEventListener('mouseup', e => { if(!mouseDown) return; mouseDown=false; const dx = (curX || e.clientX) - startX; if(Math.abs(dx) < 100) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); startX = curX = 0; });
  })();

  /* ===========================
     TTS for current chapter (primary)
     =========================== */
  let ttsQueue = [];
  function buildTTS(){
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const idx = ch.findIndex(v => v.key === state.verseKey);
      if(idx !== -1){ ttsQueue.push(ch[idx].text); return; }
      const rng = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(rng){ const s = Math.max(0, Number(rng[1]) - 1), e = Math.min(ch.length - 1, Number(rng[2]) - 1); for(let i=s;i<=e;i++) ttsQueue.push(ch[i].text); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx2 = Math.max(0, Math.min(ch.length - 1, Number(state.verseKey) - 1)); ttsQueue.push(ch[idx2].text); return; }
    }
    ch.forEach(v => ttsQueue.push(v.text));
  }
  function speakNext(){ if(!ttsQueue.length) return; const text = ttsQueue.shift(); const u = new SpeechSynthesisUtterance(text); u.onend = speakNext; speechSynthesis.speak(u); }
  playBtn && playBtn.addEventListener('click', ()=>{ speechSynthesis.cancel(); buildTTS(); speakNext(); });
  pauseBtn && pauseBtn.addEventListener('click', ()=> speechSynthesis.pause());
  resumeBtn && resumeBtn.addEventListener('click', ()=> speechSynthesis.resume());
  stopBtn && stopBtn.addEventListener('click', ()=> { speechSynthesis.cancel(); ttsQueue = []; });

  /* ===========================
     Search: perform and render
     =========================== */
  async function performSearch(q){
    if(!q) return;
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if(!state.versionA){ searchInfo.textContent = 'Select Version A first'; activateTab('home'); return; }

    // ensure index exists
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);

    const idxA = searchIndexCache[state.versionA] || [];
    const idxB = state.versionB ? (searchIndexCache[state.versionB] || []) : [];

    const resultsA = idxA.filter(r => r.low.includes(q)).slice(0, 200);
    const resultsB = idxB.filter(r => r.low.includes(q)).slice(0, 200);

    const total = resultsA.length + resultsB.length;
    searchInfo.textContent = `Found ${total}`;

    const frag = document.createDocumentFragment();

    if(resultsA.length){
      const h = document.createElement('div'); h.style.fontWeight='700'; h.style.margin='8px 0'; h.textContent = state.versionA.replace('_bible.json','').toUpperCase() + ' — ' + resultsA.length; frag.appendChild(h);
      resultsA.forEach(r => frag.appendChild(makeSearchRow(r, state.versionA)));
    }
    if(resultsB.length){
      const h = document.createElement('div'); h.style.fontWeight='700'; h.style.margin='8px 0'; h.textContent = state.versionB.replace('_bible.json','').toUpperCase() + ' — ' + resultsB.length; frag.appendChild(h);
      resultsB.forEach(r => frag.appendChild(makeSearchRow(r, state.versionB)));
    }
    if(total === 0){
      const none = document.createElement('div'); none.style.padding = '8px'; none.style.color = '#666'; none.textContent = 'No results'; frag.appendChild(none);
    }

    searchResults.appendChild(frag);
    activateTab('search');
  }

  function makeSearchRow(r, version){
    const div = document.createElement('div'); div.className = 'search-item';
    const snippet = esc(r.text.replace(/\s+/g, ' ').trim());
    div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open (${version.replace('_bible.json','').toUpperCase()})</small>`;
    div.addEventListener('click', async () => {
      // Open this search result in reader for that version
      state.versionA = version;
      homeA.value = version;
      await fetchAndNormalize(version);
      await populateBooksAndChapters(); // repopulate dropdowns
      state.bookIndex = r.bookIndex;
      state.chapterIndex = r.chapterIndex;
      state.verseKey = r.verseKey;
      clampIndicesForCurrentVersion();
      activateTab('read');
    });
    return div;
  }

  // wire search box
  searchBox && searchBox.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') performSearch((searchBox.value||'').trim().toLowerCase());
  });

  /* ===========================
     URL handling
     - updateUrl(mode): mode='push'|'replace'
     - initialLoad reads URL then loads versions & populates properly
     =========================== */
  function updateUrl(mode = 'push'){
    const p = new URLSearchParams();
    if(state.versionA) p.set('versionA', state.versionA);
    if(state.versionB) p.set('versionB', state.versionB);
    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));
    if(state.verseKey) p.set('verse', state.verseKey);
    p.set('view', state.view || 'home');
    const url = location.pathname + '?' + p.toString();
    try{
      if(mode === 'replace') history.replaceState({...state}, '', url);
      else history.pushState({...state}, '', url);
    }catch(e){
      console.warn('updateUrl failed', e);
    }
  }

  // Robust initial load: read URL params, load versions, clamp, show appropriate view
  async function initialLoad(){
    populateVersionDropdowns();
    loadLastVersions();

    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;
    const bookIndex = Number(params.get('bookIndex') || state.bookIndex || 0);
    let chapterNum = Number(params.get('chapter'));
    if(!chapterNum || isNaN(chapterNum) || chapterNum < 1) chapterNum = 1;
    const verseParam = params.get('verse') || state.verseKey || null;
    const viewParam = params.get('view') || state.view || 'home';

    // set preliminary state values (we still need to load versions to clamp indices correctly)
    state.bookIndex = Number.isFinite(bookIndex) ? bookIndex : 0;
    state.chapterIndex = (Number.isFinite(chapterNum) ? (chapterNum - 1) : 0);
    state.verseKey = verseParam;
    state.view = viewParam;

    if(vA){ state.versionA = vA; homeA.value = vA; await fetchAndNormalize(vA); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }

    // ensure dropdowns reflect the loaded versionA
    await populateBooksAndChapters();

    // clamp indices after loading data
    clampIndicesForCurrentVersion();

    // set dropdown UI selections if present
    try{ if(homeBook) homeBook.value = String(state.bookIndex); }catch(e){}
    try{ if(homeChapter) homeChapter.value = String(state.chapterIndex); }catch(e){}
    try{ if(homeVerse && state.verseKey){ /* optional map to index if desired */ } }catch(e){}

    // show view
    setActiveTabUI(state.view);
    panes.home.style.display = (state.view === 'home') ? 'block' : 'none';
    panes.read.style.display = (state.view === 'read') ? 'block' : 'none';
    panes.search.style.display = (state.view === 'search') ? 'block' : 'none';

    if(state.view === 'read') renderRead();
    else if(state.view === 'home') { /* nothing */ }
    else if(state.view === 'search') { /* nothing */ }
    updateUrl('replace');
  }

  // popstate handler: load versions if needed then render
  window.addEventListener('popstate', async () => {
    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA');
    const vB = params.get('versionB');
    const bookIndex = Number(params.get('bookIndex') || 0);
    let chapterNum = Number(params.get('chapter'));
    if(!chapterNum || isNaN(chapterNum) || chapterNum < 1) chapterNum = 1;
    const verseParam = params.get('verse') || null;
    const viewParam = params.get('view') || 'home';

    if(vA){ state.versionA = vA; homeA.value = vA; await fetchAndNormalize(vA); await populateBooksAndChapters(); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }
    state.bookIndex = Number.isFinite(bookIndex) ? bookIndex : 0;
    state.chapterIndex = chapterNum - 1;
    state.verseKey = verseParam;
    state.view = viewParam;
    clampIndicesForCurrentVersion();
    setActiveTabUI(state.view);
    panes.home.style.display = (state.view === 'home') ? 'block' : 'none';
    panes.read.style.display = (state.view === 'read') ? 'block' : 'none';
    panes.search.style.display = (state.view === 'search') ? 'block' : 'none';
    if(state.view === 'read') renderRead();
  });

  /* ===========================
     Event bindings for dropdowns & buttons
     =========================== */
  // When the user selects a book/chapter from HOME, update state so "Open" works predictably.
  homeBook && homeBook.addEventListener('change', async function(){
    state.bookIndex = Number(this.value || 0);
    // populate chapters for selected book
    const n = normCache[state.versionA];
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(n && n.books[state.bookIndex]){
      const ccount = (n.books[state.bookIndex].chapters||[]).length;
      for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
    }
  });

  homeChapter && homeChapter.addEventListener('change', function(){
    state.chapterIndex = Number(this.value || 0);
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(n && n.books[state.bookIndex] && n.books[state.bookIndex].chapters[state.chapterIndex]){
      const vcount = n.books[state.bookIndex].chapters[state.chapterIndex].length;
      for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
    }
  });

  homeVerse && homeVerse.addEventListener('change', function(){
    // store selection for Open to use
    if(this.value !== '') state.verseKey = String(Number(this.value) + 1);
    else state.verseKey = null;
  });

  homeOpen && homeOpen.addEventListener('click', async () => {
    if(!homeA.value){ showNotice('Select Version A'); return; }
    state.versionA = homeA.value;
    state.versionB = homeB.value || null;
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    await populateBooksAndChapters();
    // if dropdowns have values, use them, else default to 0
    state.bookIndex = homeBook.value !== '' ? Number(homeBook.value) : 0;
    state.chapterIndex = homeChapter.value !== '' ? Number(homeChapter.value) : 0;
    // verseKey already set by homeVerse change; if manual range present, override
    const rng = (homeRange && homeRange.value) ? homeRange.value.trim() : '';
    if(rng) state.verseKey = rng;
    clampIndicesForCurrentVersion();
    activateTab('read');
  });

  /* ===========================
     Small convenience: clicking bottom nav items
     =========================== */
  if(bottomItems && bottomItems.length){
    bottomItems.forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.tab;
      if(t) activateTab(t);
    }));
  }

  /* ===========================
     Ensure Search tab clickable even if HTML changes
     =========================== */
  tabs.home?.addEventListener('click', ()=> activateTab('home'));
  tabs.read?.addEventListener('click', ()=> activateTab('read'));
  tabs.search?.addEventListener('click', ()=> activateTab('search'));
  // fallback by data attribute
  document.querySelector("[data-tab='search']")?.addEventListener('click', ()=> activateTab('search'));

  /* ===========================
     Startup: run initialLoad
     =========================== */
  initialLoad().catch(err => { console.error('initialLoad failed', err); showNotice('Initialization failed'); });

  /* ===========================
     Export for debugging (optional)
     =========================== */
  window._BR = {
    state, normCache, searchIndexCache, fetchAndNormalize, populateBooksAndChapters, renderRead
  };
})();
