/* app.js - Bible Reader (production) 
   - Auto-scroll: highlight whole verse-block (.active-verse)
   - TTS follows primary version (A) and auto-scrolls
   - Search, Book/Chapter/Verse selection, swipe, keyboard nav, URL sync
*/

(() => {
  // ---------- Configuration ----------
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
  const tabHome = $("tab-home"), tabRead = $("tab-read"), tabSearch = $("tab-search");
  const paneHome = $("pane-home"), paneRead = $("pane-read"), paneSearch = $("pane-search");
  const homeA = $("homeA"), homeB = $("homeB");
  const homeBook = $("homeBook"), homeChapter = $("homeChapter"), homeVerse = $("homeVerse"), homeRange = $("homeRange");
  const homeOpen = $("homeOpen");
  const readRef = $("readRef"), readVerses = $("readVerses"), readNav = $("readNav");
  const prevVerseBtn = $("prevVerse"), nextVerseBtn = $("nextVerse"), prevChapterBtn = $("prevChapter"), nextChapterBtn = $("nextChapter");
  const backHomeBtn = $("backHome");
  const playBtn = $("play"), pauseBtn = $("pause"), resumeBtn = $("resume"), stopBtn = $("stop");
  const searchBox = $("searchBox"), searchInfo = $("searchInfo"), searchResults = $("searchResults");
  const notice = $("notice");
  const bottomItems = document.querySelectorAll("#bottomNav .bottom-item");

  // ---------- State & caches ----------
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: 'home'
  };
  const normCache = {};        // file -> normalized {books: [ {name, chapters: [ [ {key,text} ] ] } ] }
  const searchIndexCache = {}; // file -> [ {bookIndex, chapterIndex, verseIndex, book, chapter, verseKey, text, low} ]

  // ---------- Utilities ----------
  const esc = s => String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function showNotice(msg, ms = 1400){ if(!notice) return; notice.textContent = msg; notice.style.display = 'block'; setTimeout(()=> notice.style.display = 'none', ms); }
  function isNumber(n){ return Number.isFinite(Number(n)); }

  // ---------- Normalizer (uniform JSON -> internal) ----------
  function normalizeUniform(json){
    const books = [];
    if(!json || typeof json !== 'object') return { books };
    Object.keys(json).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      const chapterNums = Object.keys(chaptersObj)
        .map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
      const chapters = chapterNums.map(chNum => {
        const versesObj = chaptersObj[chNum] || {};
        const verseNums = Object.keys(versesObj)
          .map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
        return verseNums.map(vnum => ({ key: String(vnum), text: String(versesObj[vnum] || '') }));
      });
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  // ---------- Fetch + normalize ----------
  async function fetchAndNormalize(file){
    if(!file) return null;
    if(normCache[file]) return normCache[file];
    try{
      const url = BASE + file;
      const res = await fetch(url);
      if(!res.ok){ console.error('Failed to fetch', url, res.status); throw new Error('Fetch failed'); }
      const j = await res.json();
      const norm = normalizeUniform(j);
      normCache[file] = norm;
      buildSearchIndex(file, norm);
      return norm;
    }catch(err){
      console.error('fetchAndNormalize', err);
      showNotice('Failed to load ' + file);
      return null;
    }
  }

  // ---------- Build search index ----------
  function buildSearchIndex(file, norm){
    if(searchIndexCache[file]) return searchIndexCache[file];
    const arr = [];
    (norm.books || []).forEach((b,bi) => {
      (b.chapters || []).forEach((ch,ci) => {
        (ch || []).forEach((v,vi) => {
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
    searchIndexCache[file] = arr;
    return arr;
  }

  // ---------- Populate versions ----------
  function populateVersions(){
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach(f=>{
      const label = f.replace("_bible.json","").replace(".json","").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  // ---------- View management ----------
  function showView(view){
    state.view = view;
    paneHome.style.display = view === 'home' ? 'block' : 'none';
    paneRead.style.display = view === 'read' ? 'block' : 'none';
    paneSearch.style.display = view === 'search' ? 'block' : 'none';

    tabHome && tabHome.classList.toggle('active', view === 'home');
    tabRead && tabRead.classList.toggle('active', view === 'read');
    tabSearch && tabSearch.classList.toggle('active', view === 'search');
    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === view));

    if(view === 'search') setTimeout(()=> searchBox && searchBox.focus(), 140);
    if(view === 'read') renderRead();
    updateUrl('replace');
  }

  // top tab handlers
  tabHome && (tabHome.onclick = () => showView('home'));
  tabRead && (tabRead.onclick = () => showView('read'));
  tabSearch && (tabSearch.onclick = () => showView('search'));
  bottomItems.forEach(item => item.onclick = () => { const t = item.dataset.tab; if(t) showView(t); });

  // ---------- LocalStorage ----------
  function saveVersions(){ try{ localStorage.setItem('lastA', state.versionA || ''); localStorage.setItem('lastB', state.versionB || ''); }catch(e){} }
  function loadVersions(){ try{ const a = localStorage.getItem('lastA'); const b = localStorage.getItem('lastB'); if(a){ state.versionA = a; homeA.value = a } if(b){ state.versionB = b; homeB.value = b } }catch(e){} }

  // ---------- Populate books/chapters/verses ----------
  async function populateBooksForA(file){
    if(!file) return;
    const n = await fetchAndNormalize(file);
    if(!n) return;
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i) => homeBook.appendChild(new Option(b.name, i)));
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeA && homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f){ state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f; saveVersions();
    await populateBooksForA(f);
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  homeB && homeB.addEventListener('change', function(){
    const f = this.value;
    state.versionB = f || null; saveVersions();
    if(f) showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  homeBook && homeBook.addEventListener('change', async function(){
    const bi = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA] || await fetchAndNormalize(state.versionA);
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi]) return;
    const ccount = n.books[bi].chapters.length;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
  });

  homeChapter && homeChapter.addEventListener('change', function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi] || !n.books[bi].chapters[ci]) return;
    const vcount = n.books[bi].chapters[ci].length;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  // ---------- Open read ----------
  homeOpen && homeOpen.addEventListener('click', async ()=>{
    if(!homeA.value && !state.versionA){ showNotice('Select Version A'); return; }
    state.versionA = homeA.value || state.versionA;
    state.versionB = homeB.value || null;
    state.bookIndex = homeBook.value !== '' ? Number(homeBook.value) : 0;
    state.chapterIndex = homeChapter.value !== '' ? Number(homeChapter.value) : 0;
    if(homeRange.value && homeRange.value.trim()) state.verseKey = homeRange.value.trim();
    else if(homeVerse.value) state.verseKey = String(Number(homeVerse.value) + 1);
    else state.verseKey = null;

    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    saveVersions();
    showView('read');
  });

  // ---------- Clamp indices ----------
  function clampIndices(){
    if(!state.versionA){ state.bookIndex = 0; state.chapterIndex = 0; return; }
    const n = normCache[state.versionA];
    if(!n || !n.books.length){ state.bookIndex = 0; state.chapterIndex = 0; return; }
    if(!isNumber(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !book.chapters.length){ state.chapterIndex = 0; return; }
    if(!isNumber(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
  }

  // ---------- Paragraph renderer (simple split) ----------
  function paragraphRenderer(container, text){
    if(!text) return;
    const paragraphs = String(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
    paragraphs.forEach(p => {
      const d = document.createElement('div');
      d.className = 'para';
      d.textContent = p;
      container.appendChild(d);
    });
  }

  // ---------- Auto-scroll helper ----------
  function scrollToVerse(index){
    const blocks = document.querySelectorAll('.verse-block');
    if(!blocks || !blocks[index]) return;
    blocks.forEach(b => b.classList.remove('active-verse'));
    blocks[index].classList.add('active-verse');
    try{
      blocks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }catch(e){
      // fallback
      blocks[index].scrollIntoView();
    }
  }

  // ---------- Render combined verse (Version A + optional B) ----------
  function renderCombinedSingle(idx, chapA, chapB){
    const va = chapA[idx] || null;
    const vb = (chapB && chapB[idx]) ? chapB[idx] : null;
    const verseNum = va ? va.key : (vb ? vb.key : String(idx + 1));
    const block = document.createElement('div');
    block.className = 'verse-block';

    // verse number
    const header = document.createElement('div');
    header.className = 'verse-num';
    header.textContent = `Verse ${verseNum}`;
    block.appendChild(header);

    // version A text
    const contA = document.createElement('div');
    contA.className = 'verse-text';
    paragraphRenderer(contA, va ? va.text : '');
    block.appendChild(contA);

    // version B (parallel) if provided
    if(state.versionB){
      const contB = document.createElement('div');
      contB.className = 'verse-secondary';
      paragraphRenderer(contB, vb ? vb.text : '');
      block.appendChild(contB);
    }

    readVerses.appendChild(block);
  }

  // ---------- Show / hide read nav ----------
  let currentVerseIndex = null;
  function showReadNav(show, idx=null){
    if(readNav) readNav.style.display = show ? 'flex' : 'none';
    currentVerseIndex = (typeof idx === 'number') ? idx : null;
  }

  function setVerseByIndex(idx){
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(!ch || idx < 0 || idx >= ch.length) return;
    state.verseKey = ch[idx].key;
    renderRead();
    // scroll after render
    setTimeout(()=> scrollToVerse(idx), 160);
    updateUrl('push');
  }

  // ---------- Render read main ----------
  function renderRead(){
    if(!state.versionA){ readRef.textContent = 'Select Version A'; readVerses.innerHTML = ''; return; }
    const nA = normCache[state.versionA];
    if(!nA){ readRef.textContent = 'Loading...'; readVerses.innerHTML = ''; return; }
    clampIndices();
    const book = nA.books[state.bookIndex];
    if(!book){ readRef.textContent = 'No book'; readVerses.innerHTML = ''; return; }
    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex]) ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    // verseKey handling: exact, range, numeric
    if(state.verseKey){
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){ renderCombinedSingle(exact, chapA, chapB); showReadNav(true, exact); setTimeout(()=> scrollToVerse(exact), 140); return; }
      const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1]) - 1), e = Math.min(chapA.length - 1, Number(m[2]) - 1);
        for(let i=s;i<=e;i++) renderCombinedSingle(i, chapA, chapB);
        showReadNav(true, s);
        setTimeout(()=> scrollToVerse(s), 140);
        return;
      }
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length - 1, Number(state.verseKey) - 1));
        renderCombinedSingle(idx, chapA, chapB); showReadNav(true, idx); setTimeout(()=> scrollToVerse(idx), 140); return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++) renderCombinedSingle(i, chapA, chapB);
    showReadNav(false);
  }

  // ---------- Prev/Next verse buttons ----------
  prevVerseBtn && prevVerseBtn.addEventListener('click', ()=>{
    if(currentVerseIndex === null) return;
    if(currentVerseIndex > 0) setVerseByIndex(currentVerseIndex - 1);
    else if(state.chapterIndex > 0){
      state.chapterIndex--; const n = normCache[state.versionA];
      if(n && n.books[state.bookIndex]) setVerseByIndex(n.books[state.bookIndex].chapters[state.chapterIndex].length - 1);
    }
  });
  nextVerseBtn && nextVerseBtn.addEventListener('click', ()=>{
    if(currentVerseIndex === null) return;
    const n = normCache[state.versionA]; const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(currentVerseIndex < ch.length - 1) setVerseByIndex(currentVerseIndex + 1);
    else if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl('push'); }
  });

  // ---------- Prev/Next chapter ----------
  prevChapterBtn && prevChapterBtn.addEventListener('click', ()=>{ if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push'); } });
  nextChapterBtn && nextChapterBtn.addEventListener('click', ()=>{ const n = normCache[state.versionA]; if(!n) return; if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl('push'); } });

  // ---------- Back home ----------
  backHomeBtn && backHomeBtn.addEventListener('click', ()=> showView('home'));

  // ---------- TTS (primary only) ----------
  let ttsQueue = [];
  function buildTTS(){
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const exact = ch.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){ ttsQueue.push({text: ch[exact].text, idx: exact}); return; }
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(m){ const s=Number(m[1])-1,e=Number(m[2])-1; for(let i=Math.max(0,s); i<=Math.min(e,ch.length-1); i++) ttsQueue.push({text:ch[i].text, idx:i}); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx=Math.max(0,Math.min(Number(state.verseKey)-1,ch.length-1)); ttsQueue.push({text:ch[idx].text, idx}); return; }
      return;
    }
    ch.forEach((v,i)=> ttsQueue.push({text: v.text, idx: i}));
  }

  function speakNext(){
    if(!ttsQueue.length) return;
    const item = ttsQueue.shift();
    if(typeof item.idx === 'number') scrollToVerse(item.idx);
    const u = new SpeechSynthesisUtterance(String(item.text));
    u.onend = speakNext;
    u.onerror = speakNext;
    speechSynthesis.speak(u);
  }

  playBtn && playBtn.addEventListener('click', ()=>{ try{ speechSynthesis.cancel(); }catch(e){} buildTTS(); speakNext(); });
  pauseBtn && pauseBtn.addEventListener('click', ()=> { try{ speechSynthesis.pause(); }catch(e){} });
  resumeBtn && resumeBtn.addEventListener('click', ()=> { try{ speechSynthesis.resume(); }catch(e){} });
  stopBtn && stopBtn.addEventListener('click', ()=> { try{ speechSynthesis.cancel(); ttsQueue = []; }catch(e){} });

  // ---------- SEARCH ----------
  async function doSearch(q){
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if(!q) return;
    if(!state.versionA){ searchInfo.textContent = 'Select Version A first'; showView('home'); return; }
    await fetchAndNormalize(state.versionA);
    const idx = searchIndexCache[state.versionA] || buildSearchIndex(state.versionA, normCache[state.versionA]);
    if(!idx){ searchInfo.textContent = 'No index'; return; }
    const results = idx.filter(r => r.low.includes(q)).slice(0, 250);
    searchInfo.textContent = `Found ${results.length}`;
    if(!results.length){ searchResults.innerHTML = `<div style="padding:8px;color:#666">No results</div>`; showView('search'); return; }
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const re = new RegExp(safe, 'ig');
    const frag = document.createDocumentFragment();
    results.forEach(r=>{
      const div = document.createElement('div'); div.className = 'search-item';
      const snippet = esc(r.text).replace(re, m => `<span class="highlight">${m}</span>`);
      div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
      div.addEventListener('click', async ()=>{
        state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
        await fetchAndNormalize(state.versionA);
        await populateBooksForA(state.versionA);
        showView('read'); renderRead();
        // scroll after small delay to ensure DOM is ready
        setTimeout(()=> {
          // find index by verseKey and scroll
          const n = normCache[state.versionA];
          const ch = (n && n.books[state.bookIndex]) ? n.books[state.bookIndex].chapters[state.chapterIndex] : [];
          const idx = ch ? ch.findIndex(v => v.key === state.verseKey) : -1;
          if(idx !== -1) scrollToVerse(idx);
        }, 120);
        updateUrl('push');
      });
      frag.appendChild(div);
    });
    searchResults.appendChild(frag);
    showView('search');
  }

  // attach search input handler
  document.addEventListener('DOMContentLoaded', ()=>{
    const sb = $("searchBox");
    if(sb) sb.onkeydown = (e)=> { if(e.key === 'Enter'){ const q = sb.value.trim().toLowerCase(); doSearch(q); } };
  });

  // ---------- URL sync ----------
  function updateUrl(mode='push'){
    const p = new URLSearchParams();
    if(state.versionA) p.set('versionA', state.versionA);
    if(state.versionB) p.set('versionB', state.versionB);
    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));
    if(state.verseKey) p.set('verse', state.verseKey);
    p.set('view', state.view || 'home');
    const url = location.pathname + '?' + p.toString();
    try { if(mode === 'replace') history.replaceState({...state}, '', url); else history.pushState({...state}, '', url); } catch(e){}
  }

  // popstate
  window.addEventListener('popstate', async ()=>{
    const p = new URLSearchParams(location.search);
    const va = p.get('versionA'), vb = p.get('versionB');
    if(va){ state.versionA = va; homeA.value = va; await populateBooksForA(va); await fetchAndNormalize(va); }
    if(vb){ state.versionB = vb; homeB.value = vb; await fetchAndNormalize(vb); }
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || 'home';
    showView(state.view);
  });

  // ---------- Swipe & mouse drag ----------
  (function attachSwipe(){
    if(!readVerses) return;
    let touchStartX = 0;
    readVerses.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].clientX, {passive:true});
    readVerses.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) < 60) return;
      const n = normCache[state.versionA]; if(!n) return;
      if(dx < 0){ if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl('push'); } }
      else { if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push'); } }
    }, {passive:true});

    // mouse drag
    let mouseDown=false, startX=0, curX=0;
    readVerses.addEventListener('mousedown', e=>{ mouseDown=true; startX = e.clientX; });
    document.addEventListener('mousemove', e=>{ if(!mouseDown) return; curX = e.clientX; });
    document.addEventListener('mouseup', e=>{
      if(!mouseDown) return; mouseDown=false;
      const dx = (curX || e.clientX) - startX;
      if(Math.abs(dx) < 100){ startX = curX = 0; return; }
      const n = normCache[state.versionA]; if(!n) return;
      if(dx < 0){ if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); } }
      else { if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl('push'); } }
      startX = curX = 0;
    });
  })();

  // ---------- Keyboard nav ----------
  document.addEventListener('keydown', e => {
    if(state.view !== 'read') return;
    const n = normCache[state.versionA]; if(!n) return;
    if(e.key === 'ArrowRight'){ if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowLeft'){ if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || []; if(!ch.length) return;
      const keys = ch.map(v => v.key); const idx = state.verseKey ? keys.indexOf(state.verseKey) : -1;
      if(e.key === 'ArrowDown'){
        if(idx >= 0 && idx + 1 < keys.length){ state.verseKey = keys[idx + 1]; renderRead(); setTimeout(()=> scrollToVerse(idx + 1), 120); updateUrl('push'); }
      }
      if(e.key === 'ArrowUp'){
        if(idx > 0){ state.verseKey = keys[idx - 1]; renderRead(); setTimeout(()=> scrollToVerse(idx - 1), 120); updateUrl('push'); }
      }
    }
  });

  // ---------- Initial load ----------
  async function initialLoad(){
    populateVersions();
    loadVersions();
    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;
    if(vA){ state.versionA = vA; homeA.value = vA; await populateBooksForA(vA); await fetchAndNormalize(vA); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }
    state.bookIndex = Number(params.get('bookIndex') || state.bookIndex);
    state.chapterIndex = params.get('chapter') ? Number(params.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = params.get('verse') || null;
    state.view = params.get('view') || state.view || 'home';
    showView(state.view);
    if(state.view === 'read') renderRead();
    updateUrl('replace');
  }

  initialLoad().catch(err => console.error('initialLoad error', err));

  // expose small debug API
  window.BibleReader = { state, normCache, searchIndexCache, fetchAndNormalize, renderRead };

})(); 
