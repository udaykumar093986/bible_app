// app.js — Production (patched NaN fix + stable behavior)
// Base path points to your repo folder: bible_app/versions/
(() => {
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
    "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
    "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
    "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // DOM refs
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

  // caches & state
  const normCache = {};        // normalized JSON
  const searchIndexCache = {}; // search index per file

  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home"
  };

  /* -------------------
     Utilities
  --------------------*/
  function esc(s){ return s ? String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;") : ""; }
  function showNotice(msg, ms=1400){ if(!notice) return; notice.textContent = msg; notice.style.display='block'; setTimeout(()=> notice.style.display='none', ms); }
  function saveVersions(){ try{ localStorage.setItem('lastA', state.versionA||''); localStorage.setItem('lastB', state.versionB||''); }catch(e){} }
  function loadVersions(){ try{ const a=localStorage.getItem('lastA'); const b=localStorage.getItem('lastB'); if(a) state.versionA=a; if(b) state.versionB=b; }catch(e){} }

  /* -------------------
     Normalize (uniform JSON)
     expects: { "Genesis": { "1": { "1": "text", ... }, "2": {...} }, ... }
  --------------------*/
  function normalizeUniform(json){
    const books = [];
    for(const bk of Object.keys(json || {})){
      const chapObj = json[bk] || {};
      const chapNums = Object.keys(chapObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
      const chapters = chapNums.map(cn => {
        const verseObj = chapObj[String(cn)] || {};
        const verseNums = Object.keys(verseObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
        return verseNums.map(vn => ({ key: String(vn), text: String(verseObj[String(vn)] || "") }));
      });
      books.push({ name: bk, chapters });
    }
    return { books };
  }

  /* -------------------
     Fetch and index
  --------------------*/
  async function fetchAndNormalize(fname){
    if(!fname) return null;
    if(normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    const res = await fetch(url);
    if(!res.ok){
      console.error("Failed fetch:", url, res.status);
      showNotice("Failed to load " + fname);
      return null;
    }
    const json = await res.json();
    const norm = normalizeUniform(json);
    normCache[fname] = norm;
    buildSearchIndex(fname, norm);
    return norm;
  }

  function buildSearchIndex(fname, norm){
    const arr = [];
    (norm.books||[]).forEach((b,bi)=>{
      (b.chapters||[]).forEach((ch,ci)=>{
        (ch||[]).forEach((v,vi)=>{
          arr.push({
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

  /* -------------------
     Versions dropdown
  --------------------*/
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

  /* -------------------
     Tabs
  --------------------*/
  function activateTab(name){
    state.view = name;
    panes.home.style.display = (name==='home') ? 'block' : 'none';
    panes.read.style.display = (name==='read') ? 'block' : 'none';
    panes.search.style.display = (name==='search') ? 'block' : 'none';
    Object.values(tabs).forEach(t=> t && t.classList.remove('active'));
    if(tabs[name]) tabs[name].classList.add('active');
    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if(name==='read') renderRead();
    if(name==='search'){ searchResults.innerHTML=''; searchInfo.textContent=''; if(searchBox) searchBox.focus(); }
  }

  // attach tab listeners robustly
  tabs.home?.addEventListener('click', ()=> activateTab('home'));
  tabs.read?.addEventListener('click', ()=> activateTab('read'));
  tabs.search?.addEventListener('click', ()=> activateTab('search'));
  // fallback: any element with data-tab="search"
  document.querySelector("[data-tab='search']")?.addEventListener('click', ()=> activateTab('search'));

  /* -------------------
     Populate books/chapters/verses
  --------------------*/
  homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f){ state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f; saveVersions();
    await fetchAndNormalize(state.versionA);
    populateBooksA();
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  homeB.addEventListener('change', async function(){
    const f = this.value;
    state.versionB = f || null;
    saveVersions();
    if(state.versionB) await fetchAndNormalize(state.versionB);
    showNotice(this.options[this.selectedIndex]?.text ? this.options[this.selectedIndex].text + ' loaded (B)' : 'Using only Version A');
  });

  function populateBooksA(){
    const n = normCache[state.versionA];
    if(!n) return;
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name, i)));
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeBook.addEventListener('change', function(){
    const bi = Number(this.value || 0);
    const n = normCache[state.versionA];
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    if(!n || !n.books[bi]) return;
    const ccount = n.books[bi].chapters.length;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener('change', function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    if(!n || !n.books[bi] || !n.books[bi].chapters[ci]) return;
    const vcount = n.books[bi].chapters[ci].length;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  /* -------------------
     Open in READ
  --------------------*/
  homeOpen.addEventListener('click', async function(){
    if(!homeA.value) return showNotice('Select Version A');
    state.versionA = homeA.value;
    state.versionB = homeB.value || null;
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);

    // book index
    state.bookIndex = homeBook.value ? Number(homeBook.value) : 0;

    // chapter index (user selects numeric chapter option values are zero-based)
    const chVal = homeChapter.value ? Number(homeChapter.value) : 0;
    state.chapterIndex = Number.isFinite(chVal) ? chVal : 0;

    // verseKey: range or single
    const rng = (homeRange.value || '').trim();
    if(rng) state.verseKey = rng;
    else if(homeVerse.value) state.verseKey = String(Number(homeVerse.value) + 1);
    else state.verseKey = null;

    // clamp indices to available data
    clampIndices();

    activateTab('read');
    updateUrl();
  });

  /* -------------------
     Render read
  --------------------*/
  function renderRead(){
    if(!state.versionA){ readRef.textContent = 'Select Version A'; readVerses.innerHTML=''; return; }
    const nA = normCache[state.versionA];
    if(!nA){ readRef.textContent = 'Loading...'; readVerses.innerHTML=''; return; }

    // clamp in case data changed
    if(state.bookIndex < 0 || state.bookIndex >= nA.books.length) state.bookIndex = 0;
    const book = nA.books[state.bookIndex];
    if(!book){ readRef.textContent = 'No book'; readVerses.innerHTML=''; return; }
    if(state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;

    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex]) ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    if(state.verseKey){
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if(exact !== -1){ renderCombined(exact, chapA, chapB); showReadNav(true, exact); return; }
      const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1]) - 1);
        const e = Math.min(chapA.length - 1, Number(m[2]) - 1);
        for(let i=s;i<=e;i++) renderCombined(i, chapA, chapB);
        showReadNav(true, s); return;
      }
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length-1, Number(state.verseKey)-1));
        renderCombined(idx, chapA, chapB); showReadNav(true, idx); return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++) renderCombined(i, chapA, chapB);
    showReadNav(false);
  }

  function renderCombined(idx, chapA, chapB){
    const va = chapA[idx] || null;
    const vb = chapB[idx] || null;
    const key = va ? va.key : (vb ? vb.key : (idx+1));
    const labelA = (state.versionA||'').replace('_bible.json','').replace('.json','').toUpperCase();
    const labelB = state.versionB ? state.versionB.replace('_bible.json','').replace('.json','').toUpperCase() : '';

    const block = document.createElement('div'); block.className='verse-block';
    let inner = `<div class="verse-num">Verse ${esc(key)}</div>`;
    inner += `<div class="verse-label">${esc(labelA)}</div>`;
    inner += `<div class="verse-text">${esc(va?va.text:'')}</div>`;
    if(state.versionB){
      inner += `<div class="verse-label">${esc(labelB)}</div>`;
      inner += `<div class="verse-secondary">${esc(vb?vb.text:'')}</div>`;
    }
    block.innerHTML = inner;
    readVerses.appendChild(block);
  }

  let currentVerseIndex = null;
  function showReadNav(show, idx=null){ readNav.style.display = show ? 'flex' : 'none'; currentVerseIndex = (typeof idx === 'number')?idx:null; }

  function setVerseByIndex(idx){
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(!ch || idx < 0 || idx >= ch.length) return;
    state.verseKey = ch[idx].key;
    renderRead(); updateUrl();
  }

  prevChapterBtn && prevChapterBtn.addEventListener('click', ()=>{ if(state.chapterIndex>0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl(); } });
  nextChapterBtn && nextChapterBtn.addEventListener('click', ()=>{ const n = normCache[state.versionA]; if(n && state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl(); } });

  /* -------------------
     Swipe & mouse drag nav (attached to read pane)
  --------------------*/
  (function attachSwipe(){
    if(!readVerses) return;
    let touchStartX=0, touchEndX=0;
    readVerses.addEventListener('touchstart', e=> touchStartX = e.changedTouches[0].clientX, {passive:true});
    readVerses.addEventListener('touchend', e=>{ touchEndX = e.changedTouches[0].clientX; const dx = touchEndX - touchStartX; if(Math.abs(dx) < 60) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); }, {passive:true});

    // mouse drag for desktop
    let mDown=false, startX=0, curX=0;
    readVerses.addEventListener('mousedown', e=>{ mDown=true; startX = e.clientX; });
    document.addEventListener('mousemove', e=>{ if(!mDown) return; curX = e.clientX; });
    document.addEventListener('mouseup', e=>{ if(!mDown) return; mDown=false; const dx = (curX || e.clientX) - startX; if(Math.abs(dx) < 100) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); startX=curX=0; });
  })();

  // keyboard nav (desktop)
  document.addEventListener('keydown', (e)=>{
    if(state.view !== 'read') return;
    const n = normCache[state.versionA]; if(!n) return;
    const books = n.books;
    if(!books[state.bookIndex]) return;
    // shift+arrow => book navigation
    if(e.key === 'ArrowRight' && e.shiftKey){ if(state.bookIndex + 1 < books.length){ state.bookIndex++; state.chapterIndex = 0; state.verseKey=null; renderRead(); updateUrl(); } return; }
    if(e.key === 'ArrowLeft' && e.shiftKey){ if(state.bookIndex > 0){ state.bookIndex--; state.chapterIndex = 0; state.verseKey=null; renderRead(); updateUrl(); } return; }
    // chapter navigation
    if(e.key === 'ArrowRight' && !e.shiftKey){ if(state.chapterIndex + 1 < books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl(); } return; }
    if(e.key === 'ArrowLeft' && !e.shiftKey){ if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl(); } return; }
    // page up/down
    if(e.key === 'PageDown'){ state.chapterIndex = Math.min(state.chapterIndex + 5, books[state.bookIndex].chapters.length - 1); state.verseKey=null; renderRead(); updateUrl(); return; }
    if(e.key === 'PageUp'){ state.chapterIndex = Math.max(state.chapterIndex - 5, 0); state.verseKey=null; renderRead(); updateUrl(); return; }
    // verse up/down
    const curChap = books[state.bookIndex].chapters[state.chapterIndex] || [];
    const verseKeys = curChap.map(v => v.key);
    const vIdx = state.verseKey ? verseKeys.indexOf(state.verseKey) : -1;
    if(e.key === 'ArrowDown'){ if(vIdx >= 0 && vIdx + 1 < verseKeys.length){ state.verseKey = verseKeys[vIdx + 1]; renderRead(); updateUrl(); } return; }
    if(e.key === 'ArrowUp'){ if(vIdx > 0){ state.verseKey = verseKeys[vIdx - 1]; renderRead(); updateUrl(); } return; }
  });

  /* -------------------
     TTS (primary only)
  --------------------*/
  let ttsQueue = [];
  function buildTTS(){
    ttsQueue = [];
    if(!state.versionA) return;
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const exact = ch.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){ ttsQueue.push({text:ch[exact].text, idx: exact}); return; }
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(m){ const s=Number(m[1])-1, e=Number(m[2])-1; for(let i=Math.max(0,s);i<=Math.min(e,ch.length-1);i++) ttsQueue.push({text:ch[i].text, idx:i}); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx=Math.max(0,Math.min(Number(state.verseKey)-1,ch.length-1)); ttsQueue.push({text:ch[idx].text, idx}); return; }
    }
    ch.forEach((v,i)=> ttsQueue.push({text:v.text, idx:i}));
  }
  function speakNext(){ if(!ttsQueue.length) return; const item = ttsQueue.shift(); if(!item) return; const u = new SpeechSynthesisUtterance(String(item.text)); u.onend = ()=> setTimeout(speakNext, 120); u.onerror = ()=> setTimeout(speakNext, 180); speechSynthesis.speak(u); }
  playBtn && playBtn.addEventListener('click', ()=>{ speechSynthesis.cancel(); buildTTS(); speakNext(); });
  pauseBtn && pauseBtn.addEventListener('click', ()=> speechSynthesis.pause());
  resumeBtn && resumeBtn.addEventListener('click', ()=> speechSynthesis.resume());
  stopBtn && stopBtn.addEventListener('click', ()=> { speechSynthesis.cancel(); ttsQueue = []; });

  /* -------------------
     SEARCH
  --------------------*/
  searchBox && searchBox.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch((searchBox.value||'').trim().toLowerCase()); });

  async function doSearch(q){
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if(!q) return;
    if(!state.versionA){ searchInfo.textContent = 'Select Version A first'; activateTab('home'); return; }

    // ensure versions loaded for index
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);

    const idxA = searchIndexCache[state.versionA] || [];
    const idxB = state.versionB ? (searchIndexCache[state.versionB] || []) : [];

    const resultsA = idxA.filter(r => r.low.includes(q)).slice(0,200);
    const resultsB = idxB.filter(r => r.low.includes(q)).slice(0,200);

    const total = resultsA.length + resultsB.length;
    searchInfo.textContent = `Found ${total}`;

    const frag = document.createDocumentFragment();
    if(resultsA.length){
      const header = document.createElement('div'); header.style.fontWeight='700'; header.style.margin='8px 0'; header.textContent = (state.versionA||'').replace('_bible.json','').toUpperCase() + ' — ' + resultsA.length; frag.appendChild(header);
      resultsA.forEach(r => frag.appendChild(makeSearchRow(r, state.versionA)));
    }
    if(resultsB.length){
      const header = document.createElement('div'); header.style.fontWeight='700'; header.style.margin='8px 0'; header.textContent = (state.versionB||'').replace('_bible.json','').toUpperCase() + ' — ' + resultsB.length; frag.appendChild(header);
      resultsB.forEach(r => frag.appendChild(makeSearchRow(r, state.versionB)));
    }

    if(!resultsA.length && !resultsB.length){
      const none = document.createElement('div'); none.style.padding='8px'; none.style.color='#666'; none.textContent = 'No results'; frag.appendChild(none);
    }

    searchResults.appendChild(frag);
    activateTab('search');
  }

  function makeSearchRow(r, version){
    const div = document.createElement('div'); div.className='search-item';
    const snippet = esc(r.text);
    div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open (${version.replace('_bible.json','').toUpperCase()})</small>`;
    div.addEventListener('click', async ()=>{
      state.versionA = version;
      homeA.value = version;
      await fetchAndNormalize(version);
      state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
      activateTab('read'); renderRead(); updateUrl();
    });
    return div;
  }

  /* -------------------
     URL handling + NaN fixes
  --------------------*/
  function updateUrl(replace=false){
    const p = new URLSearchParams();
    if(state.versionA) p.set('versionA', state.versionA);
    if(state.versionB) p.set('versionB', state.versionB);
    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));
    if(state.verseKey) p.set('verse', state.verseKey);
    p.set('view', state.view || 'home');
    const url = location.pathname + '?' + p.toString();
    if(replace) history.replaceState({...state}, '', url); else history.pushState({...state}, '', url);
  }

  function clampIndices(){
    if(!state.versionA) return;
    const n = normCache[state.versionA];
    if(!n || !n.books || n.books.length === 0){ state.bookIndex = 0; state.chapterIndex = 0; state.verseKey = null; return; }
    if(state.bookIndex < 0 || state.bookIndex >= n.books.length) state.bookIndex = 0;
    const book = n.books[state.bookIndex];
    if(!book || !book.chapters || book.chapters.length === 0) { state.chapterIndex = 0; state.verseKey = null; return; }
    if(!Number.isFinite(state.chapterIndex) || state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
  }

  async function initialLoad(){
    populateVersions();
    loadVersions();

    const params = new URLSearchParams(location.search);
    // CHAPTER NaN FIX: ensure default and valid number
    let ch = Number(params.get('chapter'));
    if(!ch || isNaN(ch) || ch < 1) ch = 1;
    state.chapterIndex = ch - 1;

    state.bookIndex = Number(params.get('bookIndex') || 0);
    state.verseKey = params.get('verse') || null;
    state.view = params.get('view') || state.view || 'home';

    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;

    if(vA){ state.versionA = vA; homeA.value = vA; await fetchAndNormalize(vA); populateBooksA(); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }

    // clamp after ensuring A loaded
    clampIndices();

    activateTab(state.view || 'home');
    if(state.view === 'read') renderRead();
  }

  window.addEventListener('popstate', async ()=>{
    const p = new URLSearchParams(location.search);
    let ch = Number(p.get('chapter'));
    if(!ch || isNaN(ch) || ch < 1) ch = 1;
    state.chapterIndex = ch - 1;
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || 'home';

    const va = p.get('versionA'), vb = p.get('versionB');
    if(va){ state.versionA = va; homeA.value = va; await fetchAndNormalize(va); populateBooksA(); }
    if(vb){ state.versionB = vb; homeB.value = vb; await fetchAndNormalize(vb); }
    clampIndices();
    activateTab(state.view || 'home');
    if(state.view==='read') renderRead();
  });

  /* -------------------
     Start
  --------------------*/
  initialLoad().catch(err => console.error('initialLoad error', err));

})();
