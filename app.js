/* =========================================================================
   Bible Reader - Production app.js (Final)
   - Keeps JSON unchanged
   - Splits verse text into indented paragraphs (bulleted)
   - Stable loading, search, URL sync, back button, swipe, keyboard
   ========================================================================= */

(() => {
  // --------------------
  // CONFIG
  // --------------------
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";

  // Use the same FILES list we discussed previously
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // --------------------
  // DOM shortcuts
  // --------------------
  const $ = id => document.getElementById(id);

  const tabs = {
    home: $("tab-home"),
    read: $("tab-read"),
    search: $("tab-search")
  };

  const panes = {
    home: $("pane-home"),
    read: $("pane-read"),
    search: $("pane-search")
  };

  const homeA = $("homeA"), homeB = $("homeB");
  const homeBook = $("homeBook"), homeChapter = $("homeChapter"), homeVerse = $("homeVerse"), homeRange = $("homeRange"), homeOpen = $("homeOpen");

  const readRef = $("readRef"), readVerses = $("readVerses"), readNav = $("readNav");
  const prevChapterBtn = $("prevChapter"), nextChapterBtn = $("nextChapter"), backHomeBtn = $("backHome");

  const searchBox = $("searchBox"), searchInfo = $("searchInfo"), searchResults = $("searchResults");

  const notice = $("notice");
  const bottomNav = $("bottomNav");
  const bottomItems = bottomNav ? bottomNav.querySelectorAll('.bottom-item') : [];

  // --------------------
  // Application state & caches
  // --------------------
  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: 'home'
  };

  const normCache = {};        // filename -> normalized data {books: [...]}
  const searchIndexCache = {}; // filename -> search index array

  // --------------------
  // Small utilities
  // --------------------
  function esc(s){ return String(s || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
  function showNotice(msg, ms=1400){ if(!notice) return; notice.textContent = msg; notice.style.display = 'block'; setTimeout(()=> notice.style.display = 'none', ms); }
  function saveVersions(){ try{ localStorage.setItem('lastA', state.versionA||''); localStorage.setItem('lastB', state.versionB||''); }catch(e){} }
  function loadVersions(){ try{ const a = localStorage.getItem('lastA'); const b = localStorage.getItem('lastB'); if(a) state.versionA = a; if(b) state.versionB = b; }catch(e){} }
  function isInt(n){ return Number.isFinite(Number(n)); }

  // --------------------
  // JSON normalization (uniform format)
  // Input expected:
  // { "Genesis": { "1": {"1":"text", "2":"text", ...}, "2": {...} }, "Exodus": {...} }
  // Normalized -> { books: [ { name, chapters: [ [ { key, text }, ... ] ] } ] }
  // --------------------
  function normalizeUniform(json){
    const books = [];
    if(!json || typeof json !== 'object') return { books };
    Object.keys(json).forEach(bookName => {
      const chaptersObj = json[bookName] || {};
      // sort chapter numbers numerically
      const chapterNums = Object.keys(chaptersObj)
        .map(n => Number(n))
        .filter(n => !isNaN(n))
        .sort((a,b)=>a-b);
      const chapters = chapterNums.map(chNum => {
        const versesObj = chaptersObj[chNum] || {};
        const verseNums = Object.keys(versesObj)
          .map(n => Number(n))
          .filter(n => !isNaN(n))
          .sort((a,b)=>a-b);
        return verseNums.map(vnum => ({ key: String(vnum), text: String(versesObj[vnum]||'') }));
      });
      books.push({ name: bookName, chapters });
    });
    return { books };
  }

  // --------------------
  // Fetch + normalize with caching
  // --------------------
  async function fetchAndNormalize(file){
    if(!file) return null;
    if(normCache[file]) return normCache[file];
    try{
      const url = BASE + file;
      const res = await fetch(url);
      if(!res.ok) { console.error('Fetch failed', url, res.status); throw new Error('Fetch failed: ' + res.status); }
      const j = await res.json();
      const norm = normalizeUniform(j);
      normCache[file] = norm;
      buildSearchIndex(file, norm);
      return norm;
    }catch(err){
      console.error('fetchAndNormalize error', err);
      showNotice('Failed to load ' + file);
      return null;
    }
  }

  // --------------------
  // Build search index for a version (cached)
  // --------------------
  function buildSearchIndex(file, norm){
    if(searchIndexCache[file]) return searchIndexCache[file];
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
    searchIndexCache[file] = arr;
    return arr;
  }

  // --------------------
  // Populate versions dropdowns (initial)
  // --------------------
  function populateVersions(){
    if(!homeA || !homeB) return;
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach(f => {
      const label = f.replace("_bible.json","").replace(".json","").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  // --------------------
  // Tab activation
  // --------------------
  function activateTab(name){
    state.view = name;
    panes.home.style.display = name==='home' ? 'block' : 'none';
    panes.read.style.display = name==='read' ? 'block' : 'none';
    panes.search.style.display = name==='search' ? 'block' : 'none';
    Object.values(tabs).forEach(t => t.classList.remove('active'));
    if(tabs[name]) tabs[name].classList.add('active');
    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if(name==='read') renderRead();
    if(name==='search'){ searchResults.innerHTML=''; searchInfo.textContent=''; }
    updateUrl('replace');
  }
  Object.keys(tabs).forEach(k => { if(tabs[k]) tabs[k].addEventListener('click', ()=> activateTab(k)); });
  bottomItems.forEach(b => b.addEventListener('click', ()=> activateTab(b.dataset.tab)));

  // --------------------
  // Populate book/chapter/verse when versionA selected
  // --------------------
  async function populateBooksForA(file){
    if(!file) return;
    const n = await fetchAndNormalize(file);
    if(!n) return;
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i) => homeBook.appendChild(new Option(b.name, i)));
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f){ state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f; saveVersions();
    await populateBooksForA(f);
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  homeB.addEventListener('change', function(){
    const f = this.value;
    state.versionB = f || null;
    saveVersions();
    if(f) showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  homeBook.addEventListener('change', async function(){
    const bi = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA] || await fetchAndNormalize(state.versionA);
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi]) return;
    const ccount = n.books[bi].chapters.length;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
  });

  homeChapter.addEventListener('change', function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi] || !n.books[bi].chapters[ci]) return;
    const vcount = n.books[bi].chapters[ci].length;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  // --------------------
  // Open read page from home
  // --------------------
  homeOpen.addEventListener('click', async function(){
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
    activateTab('read');
  });

  // --------------------
  // Clamp indices helper
  // --------------------
  function clampIndices(){
    if(!state.versionA) { state.bookIndex = 0; state.chapterIndex = 0; return; }
    const n = normCache[state.versionA];
    if(!n || !n.books.length){ state.bookIndex = 0; state.chapterIndex = 0; return; }
    if(!isInt(state.bookIndex) || state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !book.chapters.length){ state.chapterIndex = 0; return; }
    if(!isInt(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
  }

  // --------------------
  // Render Read pane (with paragraph splitting)
  // Paragraph splitting rule (Option 2):
  // - Split on \n\n first, if none split on single \n
  // - Trim and treat each chunk as a paragraph
  // - Display paragraphs as indented bullets under the verse number
  // --------------------
  function renderRead(){
    if(!state.versionA){ readRef.textContent = 'Select Version A'; readVerses.innerHTML = ''; return; }
    const nA = normCache[state.versionA]; if(!nA){ readRef.textContent = 'Loading...'; readVerses.innerHTML = ''; return; }
    clampIndices();
    const book = nA.books[state.bookIndex];
    if(!book){ readRef.textContent = 'No book'; readVerses.innerHTML = ''; return; }
    if(state.chapterIndex < 0) state.chapterIndex = 0; if(state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex]) ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    // helper to render paragraphs for a verse text
    function renderParagraphsInto(container, verseText){
      if(!verseText) return;
      // normalize line endings
      const txt = String(verseText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      // split by double newline first
      let parts = txt.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      if(parts.length === 1){
        // if no double newlines, split on single newline
        parts = txt.split(/\n+/).map(p => p.trim()).filter(Boolean);
      }
      // Render each paragraph as an indented bullet (Option 2)
      parts.forEach(p=>{
        const pNode = document.createElement('p');
        pNode.className = 'verse-paragraph';
        // bullet + non-breaking space + content
        pNode.innerHTML = `<span class="verse-bullet">•</span> ${esc(p)}`;
        container.appendChild(pNode);
      });
    }

    // If a verseKey is specified (single or range)
    if(state.verseKey){
      // exact
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){
        renderCombinedVerseBlock(exact, chapA, chapB, renderParagraphsInto);
        showReadNav(true, exact);
        return;
      }
      // range like "3-5"
      const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1]) - 1);
        const e = Math.min(chapA.length - 1, Number(m[2]) - 1);
        for(let i=s;i<=e;i++) renderCombinedVerseBlock(i, chapA, chapB, renderParagraphsInto);
        showReadNav(true, s);
        return;
      }
      // single numeric string
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length - 1, Number(state.verseKey) - 1));
        renderCombinedVerseBlock(idx, chapA, chapB, renderParagraphsInto);
        showReadNav(true, idx);
        return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    // render full chapter
    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++){
      renderCombinedVerseBlock(i, chapA, chapB, renderParagraphsInto);
    }
    showReadNav(false);
  }

  // combined block for parallel display (A, optional B)
  function renderCombinedVerseBlock(idx, chapA, chapB, paragraphRenderer){
    const va = chapA[idx] || null;
    const vb = chapB && chapB[idx] ? chapB[idx] : null;
    const verseNum = va ? va.key : (vb ? vb.key : String(idx+1));

    const block = document.createElement('div');
    block.className = 'verse-block';

    // Verse header / number
    const header = document.createElement('div');
    header.className = 'verse-num';
    header.textContent = `Verse ${verseNum}`;
    block.appendChild(header);

    // Primary version label
    const labA = document.createElement('div');
    labA.className = 'verse-label';
    labA.textContent = (state.versionA || '').replace('_bible.json','').replace('.json','').toUpperCase();
    block.appendChild(labA);

    // Container for paragraphs A
    const contA = document.createElement('div');
    contA.className = 'verse-text';
    paragraphRenderer(contA, va ? va.text : '');
    block.appendChild(contA);

    // If B selected, show B label and paragraphs
    if(state.versionB){
      const labB = document.createElement('div');
      labB.className = 'verse-label';
      labB.textContent = (state.versionB || '').replace('_bible.json','').replace('.json','').toUpperCase();
      block.appendChild(labB);

      const contB = document.createElement('div');
      contB.className = 'verse-secondary';
      paragraphRenderer(contB, vb ? vb.text : '');
      block.appendChild(contB);
    }

    readVerses.appendChild(block);
  }

  // Read nav (prev/next verse controls)
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
    updateUrl('push');
  }

  // Prev / Next chapter logic
  prevChapterBtn && prevChapterBtn.addEventListener('click', ()=> {
    if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl('push'); }
  });
  nextChapterBtn && nextChapterBtn.addEventListener('click', ()=> {
    const n = normCache[state.versionA]; if(!n) return;
    const chapterCount = n.books[state.bookIndex].chapters.length;
    if(state.chapterIndex + 1 < chapterCount){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); }
  });

  // --------------------
  // Back to Home
  // --------------------
  backHomeBtn && backHomeBtn.addEventListener('click', ()=> {
    activateTab('home');
  });

  // --------------------
  // TTS (primary only)
  // --------------------
  let ttsQueue = [];
  function buildTTS(){
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const exact = ch.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){ ttsQueue.push(ch[exact].text); return; }
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(m){ const s=Number(m[1])-1, e=Number(m[2])-1; for(let i=Math.max(0,s);i<=Math.min(e,ch.length-1);i++) ttsQueue.push(ch[i].text); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx=Math.max(0,Math.min(ch.length-1,Number(state.verseKey)-1)); ttsQueue.push(ch[idx].text); return; }
    }
    ch.forEach(v=>ttsQueue.push(v.text));
  }
  function speakNext(){ if(!ttsQueue.length) return; const t = ttsQueue.shift(); const u = new SpeechSynthesisUtterance(String(t)); u.onend = speakNext; speechSynthesis.speak(u); }

  const playBtn = $("play"), pauseBtn = $("pause"), resumeBtn = $("resume"), stopBtn = $("stop");
  playBtn && playBtn.addEventListener('click', ()=>{ speechSynthesis.cancel(); buildTTS(); speakNext(); });
  pauseBtn && pauseBtn.addEventListener('click', ()=> speechSynthesis.pause());
  resumeBtn && resumeBtn.addEventListener('click', ()=> speechSynthesis.resume());
  stopBtn && stopBtn.addEventListener('click', ()=> { speechSynthesis.cancel(); ttsQueue = []; });

  // --------------------
  // SEARCH (primary version A)
  // --------------------
  async function doSearch(q){
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if(!q) return;
    if(!state.versionA){ searchInfo.textContent = 'Select Version A first'; activateTab('home'); return; }
    await fetchAndNormalize(state.versionA);
    const idx = searchIndexCache[state.versionA] || buildSearchIndex(state.versionA, normCache[state.versionA]);
    const results = idx.filter(r => r.low.includes(q)).slice(0, 250);
    searchInfo.textContent = `Found ${results.length}`;
    if(!results.length){ searchResults.innerHTML = '<div style="padding:8px;color:#666">No results</div>'; return; }

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(safe,'ig');

    const frag = document.createDocumentFragment();
    results.forEach(r=>{
      const div = document.createElement('div'); div.className = 'search-item';
      const snippet = esc(r.text).replace(re, m => `<span class="highlight">${m}</span>`);
      div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
      div.onclick = async ()=>{
        // Open in reader
        state.versionA = state.versionA || homeA.value;
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        await fetchAndNormalize(state.versionA);
        await populateBooksForA(state.versionA); // ensure dropdowns show data
        activateTab('read'); renderRead(); updateUrl('push');
      };
      frag.appendChild(div);
    });
    searchResults.appendChild(frag);
    activateTab('search');
  }

  searchBox && searchBox.addEventListener('keydown', e => { if(e.key === 'Enter') doSearch((searchBox.value||'').trim().toLowerCase()); });

  // --------------------
  // URL handling (push/replace) and initial load
  // --------------------
  function updateUrl(mode='push'){
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
    }catch(e){}
  }

  async function initialLoad(){
    populateVersions();
    loadVersions();
    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;
    if(vA){ state.versionA = vA; homeA.value = vA; await fetchAndNormalize(vA); await populateBooksForA(vA); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }
    state.bookIndex = Number(params.get('bookIndex') || state.bookIndex);
    state.chapterIndex = params.get('chapter') ? Number(params.get('chapter'))-1 : state.chapterIndex;
    state.verseKey = params.get('verse') || null;
    state.view = params.get('view') || state.view || 'home';
    activateTab(state.view);
    if(state.view === 'read') renderRead();
    updateUrl('replace');
  }

  window.addEventListener('popstate', async ()=>{
    const p = new URLSearchParams(location.search); const va = p.get('versionA'); const vb = p.get('versionB');
    if(va){ state.versionA = va; homeA.value = va; await fetchAndNormalize(va); await populateBooksForA(va); }
    if(vb){ state.versionB = vb; homeB.value = vb; await fetchAndNormalize(vb); }
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter'))-1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || 'home';
    activateTab(state.view);
    if(state.view === 'read') renderRead();
  });

  // --------------------
  // Swipe & mouse drag for chapter navigation
  // --------------------
  (function attachSwipe(){
    if(!readVerses) return;
    let touchStartX = 0;
    readVerses.addEventListener('touchstart', e=> touchStartX = e.changedTouches[0].clientX, {passive:true});
    readVerses.addEventListener('touchend', e=>{
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) < 60) return;
      const n = normCache[state.versionA]; if(!n) return;
      if(dx < 0){ if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); } }
      else { if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl('push'); } }
    }, {passive:true});

    // mouse drag (desktop)
    let mouseDown=false, startX=0, curX=0;
    readVerses.addEventListener('mousedown', e=>{ mouseDown=true; startX=e.clientX; });
    document.addEventListener('mousemove', e=>{ if(!mouseDown) return; curX=e.clientX; });
    document.addEventListener('mouseup', e=>{ if(!mouseDown) return; mouseDown=false; const dx = (curX||e.clientX)-startX; if(Math.abs(dx)>100){ const n = normCache[state.versionA]; if(dx<0){ if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); } } else { if(state.chapterIndex>0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl('push'); } } } startX=curX=0; });
  })();

  // --------------------
  // Keyboard arrow keys for chapters (left/right) and verse up/down when verseKey set
  // --------------------
  document.addEventListener('keydown', e=>{
    if(state.view !== 'read') return;
    const n = normCache[state.versionA]; if(!n) return;
    if(e.key === 'ArrowRight'){ if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowLeft'){ if(state.chapterIndex>0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl('push'); } }
    if(e.key === 'ArrowUp' || e.key === 'ArrowDown'){
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || []; if(!ch.length) return;
      const keys = ch.map(v=>v.key); const idx = state.verseKey ? keys.indexOf(state.verseKey) : -1;
      if(e.key === 'ArrowDown' && idx >= 0 && idx + 1 < keys.length){ state.verseKey = keys[idx+1]; renderRead(); updateUrl('push'); }
      if(e.key === 'ArrowUp' && idx > 0){ state.verseKey = keys[idx-1]; renderRead(); updateUrl('push'); }
    }
  });

  // --------------------
  // Initial load
  // --------------------
  initialLoad().catch(err => console.error('initialLoad error', err));

  // --------------------
  // Export simple debug API (optional)
  // --------------------
  window.BibleReader = { state, normCache, searchIndexCache, fetchAndNormalize, renderRead };
})();
