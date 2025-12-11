// app.js — Bible Reader (Production)
// Assumes uniform JSON format (books -> chapters -> verses, all objects with numeric keys)

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
  const rawCache = {};
  const normCache = {};        // { filename: { books: [ { name, chapters: [ [ {key,text} ] ] } ] } }
  const searchIndexCache = {}; // { filename: [ {bookIndex,chapterIndex,verseIndex,book,chapter,verseKey,text,low} ] }

  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home"
  };

  // helpers
  const esc = s => s ? String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;") : "";
  const showNotice = (msg, ms=1300) => { if(!notice) return; notice.textContent=msg; notice.style.display='block'; setTimeout(()=> notice.style.display='none', ms); };
  const saveVersions = () => { try{ localStorage.setItem('lastA', state.versionA||''); localStorage.setItem('lastB', state.versionB||''); }catch(e){} };
  const loadVersions = () => { try{ const a=localStorage.getItem('lastA'); const b=localStorage.getItem('lastB'); if(a) state.versionA=a; if(b) state.versionB=b; }catch(e){} };

  // normalize uniform JSON to internal shape
  function normalizeUniform(json) {
    const books = [];
    for (const bk of Object.keys(json || {})) {
      const chapObj = json[bk] || {};
      const chapNums = Object.keys(chapObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
      const chapters = chapNums.map(cnum => {
        const verseObj = chapObj[String(cnum)] || {};
        const verseNums = Object.keys(verseObj).map(n=>Number(n)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
        return verseNums.map(vnum => ({ key: String(vnum), text: String(verseObj[String(vnum)] || "") }));
      });
      books.push({ name: bk, chapters });
    }
    return { books };
  }

  // fetch + normalize + index
  async function fetchAndNormalize(fname) {
    if (!fname) return null;
    if (normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    rawCache[fname] = json;
    const norm = normalizeUniform(json);
    normCache[fname] = norm;
    buildSearchIndex(fname, norm);
    return norm;
  }

  // build search index for a normalized version
  function buildSearchIndex(fname, norm) {
    if (searchIndexCache[fname]) return searchIndexCache[fname];
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
            low: (v.text || "").toLowerCase()
          });
        });
      });
    });
    searchIndexCache[fname] = arr;
    return arr;
  }

  // populate versions dropdowns
  function populateVersions() {
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

  // tab handling
  function activateTab(name) {
    state.view = name;
    panes.home.style.display = name==='home' ? 'block' : 'none';
    panes.read.style.display = name==='read' ? 'block' : 'none';
    panes.search.style.display = name==='search' ? 'block' : 'none';
    Object.values(tabs).forEach(t=>t.classList.remove('active'));
    if(tabs[name]) tabs[name].classList.add('active');
    bottomItems.forEach(b=> b.classList.toggle('active', b.dataset.tab===name) );
    if(name==='read') renderRead();
    if(name==='search'){ searchResults.innerHTML=''; searchInfo.textContent=''; }
  }
  Object.keys(tabs).forEach(k => { if(tabs[k]) tabs[k].addEventListener('click', ()=> activateTab(k)); });
  bottomItems.forEach(b => b.addEventListener('click', ()=> activateTab(b.dataset.tab)));

  // version selection handlers
  homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f){ state.versionA = null; showNotice('Select Version A'); return; }
    state.versionA = f; saveVersions();
    await populateBooksA(f);
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });
  homeB.addEventListener('change', function(){
    const f = this.value;
    if(!f || f===''){ state.versionB = null; showNotice('Using only Version A'); saveVersions(); return; }
    state.versionB = f; saveVersions(); showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  async function populateBooksA(fname){
    const n = await fetchAndNormalize(fname);
    homeBook.innerHTML = "<option value=''>Book</option>";
    (n.books || []).forEach((b,i)=> homeBook.appendChild(new Option(b.name, i)));
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeBook.addEventListener('change', function(){
    const bi = Number(this.value || 0);
    const n = normCache[state.versionA];
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    const ccount = (n && n.books[bi]) ? n.books[bi].chapters.length : 0;
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener('change', function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    const n = normCache[state.versionA];
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    const vcount = (n && n.books[bi] && n.books[bi].chapters[ci]) ? n.books[bi].chapters[ci].length : 0;
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  // open READ
  homeOpen.addEventListener('click', async function(){
    if(!homeA.value) return showNotice('Select Version A');
    state.versionA = homeA.value;
    state.versionB = homeB.value || null;
    if(state.versionB==='') state.versionB = null;
    state.bookIndex = homeBook.value ? Number(homeBook.value) : 0;
    state.chapterIndex = homeChapter.value ? Number(homeChapter.value) : 0;
    if(homeRange.value && homeRange.value.trim()){
      state.verseKey = homeRange.value.trim();
    } else if(homeVerse.value !== '') {
      state.verseKey = String(Number(homeVerse.value) + 1);
    } else {
      state.verseKey = null;
    }
    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
    activateTab('read');
    renderRead();
    updateUrl();
  });

  // render read
  function renderRead(){
    if(!state.versionA){ readRef.textContent = 'Select Version A'; readVerses.innerHTML=''; return; }
    const nA = normCache[state.versionA];
    if(!nA){ readRef.textContent='Loading...'; readVerses.innerHTML=''; return; }
    if(state.bookIndex < 0 || state.bookIndex >= nA.books.length) state.bookIndex = 0;
    const book = nA.books[state.bookIndex];
    if(!book){ readRef.textContent='No book'; readVerses.innerHTML=''; return; }
    if(state.chapterIndex < 0 || state.chapterIndex >= book.chapters.length) state.chapterIndex = 0;
    const chapA = book.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex]) ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || [] : [];

    readRef.textContent = book.name + ' ' + (state.chapterIndex + 1);
    readVerses.innerHTML = '';

    if(state.verseKey){
      const exact = chapA.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){ renderVerse(exact, chapA, chapB); showReadNav(true, exact); return; }
      const m = String(state.verseKey).match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1]) - 1);
        const e = Math.min(chapA.length-1, Number(m[2]) - 1);
        for(let i=s;i<=e;i++) renderVerse(i, chapA, chapB);
        showReadNav(true, s);
        return;
      }
      if(/^\d+$/.test(String(state.verseKey))){
        const idx = Math.max(0, Math.min(chapA.length-1, Number(state.verseKey)-1));
        renderVerse(idx, chapA, chapB); showReadNav(true, idx); return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++) renderVerse(i, chapA, chapB);
    showReadNav(false);
  }

  function renderVerse(i, chapA, chapB){
    const va = chapA[i] || null;
    const vb = chapB[i] || null;
    const labelA = state.versionA ? state.versionA.replace('_bible.json','').replace('.json','').toUpperCase() : 'A';
    const labelB = state.versionB ? state.versionB.replace('_bible.json','').replace('.json','').toUpperCase() : 'B';

    const block = document.createElement('div');
    block.className = 'verse-block';
    let html = `<div class="verse-num">Verse ${va?.key || vb?.key || (i+1)}</div>`;
    html += `<div class="verse-label">${esc(labelA)}</div>`;
    html += `<div class="verse-text">${esc(va?.text || '')}</div>`;
    if(state.versionB){
      html += `<div class="verse-label">${esc(labelB)}</div>`;
      html += `<div class="verse-secondary">${esc(vb?.text || '')}</div>`;
    }
    block.innerHTML = html;
    readVerses.appendChild(block);
  }

  // read nav
  let currentVerseIndex = null;
  function showReadNav(show, idx=null){ if(readNav) readNav.style.display = show ? 'flex' : 'none'; currentVerseIndex = (typeof idx === 'number')?idx:null; }

  // back button
  if(backHomeBtn) backHomeBtn.addEventListener('click', ()=> { activateTab('home'); updateUrl(); });

  // prev/next chapter buttons
  if(prevChapterBtn) prevChapterBtn.addEventListener('click', ()=>{ if(state.chapterIndex>0){ state.chapterIndex--; state.verseKey=null; renderRead(); updateUrl(); } });
  if(nextChapterBtn) nextChapterBtn.addEventListener('click', ()=>{ const n = normCache[state.versionA]; if(!n) return; if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){ state.chapterIndex++; state.verseKey=null; renderRead(); updateUrl(); } });

  // TTS
  let ttsQueue = [];
  function buildTTS(){
    ttsQueue = [];
    const n = normCache[state.versionA]; if(!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if(state.verseKey){
      const exact = ch.findIndex(v=>v.key===state.verseKey);
      if(exact!==-1){ ttsQueue.push({text:ch[exact].text, idx:exact}); return; }
      const m = String(state.verseKey).match(/^(\d+)-(\d+)$/);
      if(m){ const s=Number(m[1])-1,e=Number(m[2])-1; for(let i=Math.max(0,s);i<=Math.min(e,ch.length-1);i++) ttsQueue.push({text:ch[i].text, idx:i}); return; }
      if(/^\d+$/.test(String(state.verseKey))){ const idx=Math.max(0,Math.min(Number(state.verseKey)-1,ch.length-1)); ttsQueue.push({text:ch[idx].text, idx}); return; }
    }
    ch.forEach((v,i)=> ttsQueue.push({text:v.text, idx:i}));
  }
  function speakNext(){ if(!ttsQueue.length) return; const it = ttsQueue.shift(); const u = new SpeechSynthesisUtterance(it.text); u.onend = speakNext; speechSynthesis.speak(u); }
  if(playBtn) playBtn.addEventListener('click', ()=>{ speechSynthesis.cancel(); buildTTS(); speakNext(); });
  if(pauseBtn) pauseBtn.addEventListener('click', ()=> speechSynthesis.pause());
  if(resumeBtn) resumeBtn.addEventListener('click', ()=> speechSynthesis.resume());
  if(stopBtn) stopBtn.addEventListener('click', ()=> { speechSynthesis.cancel(); ttsQueue = []; });

  // SEARCH — searches across versionA and versionB (if present)
  if(searchBox){
    searchBox.addEventListener('keydown', async (e)=>{ if(e.key==='Enter'){ await ensureVersionsLoadedForSearch(); doSearch((searchBox.value||'').trim().toLowerCase()); } });
  }

  async function ensureVersionsLoadedForSearch(){
    if(state.versionA) await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);
  }

  async function doSearch(q){
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if(!q) return;
    if(!state.versionA){ searchInfo.textContent = 'Select Version A first'; activateTab('home'); return; }

    const versions = [state.versionA];
    if(state.versionB) versions.push(state.versionB);

    let total = 0;
    const frag = document.createDocumentFragment();
    for(const ver of versions){
      const idx = searchIndexCache[ver] || [];
      const results = idx.filter(r => r.low.includes(q)).slice(0,150);
      total += results.length;

      // version header
      const header = document.createElement('div');
      header.style.fontWeight = '700';
      header.style.margin = '8px 0';
      header.textContent = ver.replace('_bible.json','').replace('.json','').toUpperCase() + ' — ' + results.length;
      frag.appendChild(header);

      if(results.length === 0){
        const nothing = document.createElement('div'); nothing.style.padding='6px 0'; nothing.style.color='#666'; nothing.textContent = 'No results in this version';
        frag.appendChild(nothing);
        continue;
      }

      const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const re = new RegExp(safe,'ig');

      results.forEach(r=>{
        const div = document.createElement('div'); div.className = 'search-item';
        const highlighted = esc(r.text).replace(re, m=>`<span class="highlight">${m}</span>`);
        div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${highlighted}</div><small style="color:#666">Click to open (${ver.replace('_bible.json','').toUpperCase()})</small>`;
        div.addEventListener('click', async ()=>{
          // open in the version where result came from
          state.versionA = ver;
          homeA.value = ver;
          await fetchAndNormalize(ver);
          state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
          activateTab('read'); renderRead(); updateUrl();
        });
        frag.appendChild(div);
      });
    }

    searchResults.appendChild(frag);
    searchInfo.textContent = 'Found ' + total + ' results';
    activateTab('search');
  }

  // URL sync
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

  // swipe & drag attached to full read pane (works on mobile + desktop)
  (function attachSwipe(){
    const touchArea = document.getElementById('pane-read');
    if(!touchArea) return;

    let tStart = 0, tEnd = 0;
    touchArea.addEventListener('touchstart', e=>{ tStart = e.changedTouches[0].clientX; }, {passive:true});
    touchArea.addEventListener('touchmove', e=>{ tEnd = e.changedTouches[0].clientX; }, {passive:true});
    touchArea.addEventListener('touchend', ()=>{ const dx = tEnd - tStart; if(Math.abs(dx) < 60) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); });

    // mouse drag
    let mDown=false, mStart=0, mEnd=0;
    touchArea.addEventListener('mousedown', e=>{ mDown=true; mStart = e.clientX; });
    document.addEventListener('mousemove', e=>{ if(!mDown) return; mEnd = e.clientX; });
    document.addEventListener('mouseup', ()=>{ if(!mDown) return; mDown=false; const dx = mEnd - mStart; if(Math.abs(dx) < 100) return; if(dx < 0) nextChapterBtn && nextChapterBtn.click(); else prevChapterBtn && prevChapterBtn.click(); });
  })();

  // keyboard navigation (desktop)
  document.addEventListener('keydown', (e) => {
    if(state.view !== 'read') return;
    const n = normCache[state.versionA];
    if(!n) return;
    const books = n.books;
    const chapters = books[state.bookIndex].chapters;
    const totalChapters = chapters.length;

    // book navigation (shift + arrows)
    if(e.key === 'ArrowRight' && e.shiftKey){
      if(state.bookIndex + 1 < books.length){ state.bookIndex++; state.chapterIndex = 0; state.verseKey = null; renderRead(); updateUrl(); }
      return;
    }
    if(e.key === 'ArrowLeft' && e.shiftKey){
      if(state.bookIndex > 0){ state.bookIndex--; state.chapterIndex = 0; state.verseKey = null; renderRead(); updateUrl(); }
      return;
    }

    // chapter navigation
    if(e.key === 'ArrowRight' && !e.shiftKey){ if(state.chapterIndex + 1 < totalChapters){ state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl(); } return; }
    if(e.key === 'ArrowLeft' && !e.shiftKey){ if(state.chapterIndex > 0){ state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl(); } return; }

    // fast chapter jump
    if(e.key === 'PageDown'){ state.chapterIndex = Math.min(state.chapterIndex + 5, totalChapters - 1); state.verseKey=null; renderRead(); updateUrl(); return; }
    if(e.key === 'PageUp'){ state.chapterIndex = Math.max(state.chapterIndex - 5, 0); state.verseKey=null; renderRead(); updateUrl(); return; }

    // verse navigation (up/down)
    const curChapter = chapters[state.chapterIndex];
    const verseKeys = curChapter.map(v => v.key);
    const vIndex = state.verseKey ? verseKeys.indexOf(state.verseKey) : -1;
    if(e.key === 'ArrowDown'){ if(vIndex >= 0 && vIndex + 1 < verseKeys.length){ state.verseKey = verseKeys[vIndex + 1]; renderRead(); updateUrl(); } return; }
    if(e.key === 'ArrowUp'){ if(vIndex > 0){ state.verseKey = verseKeys[vIndex - 1]; renderRead(); updateUrl(); } return; }
  });

  // initial load + popstate handling
  async function initialLoad(){
    populateVersions();
    loadVersions();
    const params = new URLSearchParams(location.search);
    const vA = params.get('versionA') || state.versionA;
    const vB = params.get('versionB') || state.versionB;

    if(vA){ state.versionA = vA; homeA.value = vA; await populateBooksA(vA); await fetchAndNormalize(vA); }
    if(vB){ state.versionB = vB; homeB.value = vB; await fetchAndNormalize(vB); }

    state.bookIndex = Number(params.get('bookIndex') || state.bookIndex);
    state.chapterIndex = params.get('chapter') ? Number(params.get('chapter'))-1 : state.chapterIndex;
    state.verseKey = params.get('verse') || state.verseKey;
    activateTab(params.get('view') || state.view || 'home');
  }

  window.addEventListener('popstate', async () => {
    const p = new URLSearchParams(location.search);
    const va = p.get('versionA'); const vb = p.get('versionB');
    if(va){ state.versionA = va; homeA.value = va; await populateBooksA(va); await fetchAndNormalize(va); }
    if(vb){ state.versionB = vb; homeB.value = vb; await fetchAndNormalize(vb); }
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter'))-1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    activateTab(p.get('view') || 'home');
  });

  // start
  initialLoad().catch(()=>{ /* silent fail safe */ });

})();
