(async function(){
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
  const FILES = [
"AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json","NIV_bible.json","NKJV_bible.json","NLT_bible.json",
"afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json","hungarian_bible.json","indonesian_bible.json",
"kannada_bible.json","malayalam_bible.json","marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
"sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  const tabs = { home: document.getElementById('tab-home'), read: document.getElementById('tab-read'), search: document.getElementById('tab-search') };
  const panes = { home: document.getElementById('pane-home'), read: document.getElementById('pane-read'), search: document.getElementById('pane-search') };

  const homeA = document.getElementById('homeA'),
        homeB = document.getElementById('homeB'),
        homeBook = document.getElementById('homeBook'),
        homeChapter = document.getElementById('homeChapter'),
        homeVerse = document.getElementById('homeVerse'),
        homeRange = document.getElementById('homeRange'),
        homeOpen = document.getElementById('homeOpen');

  const readRef = document.getElementById('readRef'),
        readVerses = document.getElementById('readVerses'),
        readNav = document.getElementById('readNav');

  const prevVerseBtn = document.getElementById('prevVerse'),
        nextVerseBtn = document.getElementById('nextVerse'),
        prevChapterBtn = document.getElementById('prevChapter'),
        nextChapterBtn = document.getElementById('nextChapter');

  const playBtn = document.getElementById('play'),
        pauseBtn = document.getElementById('pause'),
        resumeBtn = document.getElementById('resume'),
        stopBtn = document.getElementById('stop');

  const searchBox = document.getElementById('searchBox'),
        searchInfo = document.getElementById('searchInfo'),
        searchResults = document.getElementById('searchResults');

  const notice = document.getElementById('notice');
  const bottomNav = document.getElementById('bottomNav');
  const bottomItems = bottomNav.querySelectorAll('.bottom-item');

  let rawCache = {}, normCache = {}, searchIndexCache = {};
  let state = { versionA: null, versionB: null, bookIndex: 0, chapterIndex: 0, verseKey: null, view: 'home' };

  function showNotice(msg, ms=1400){
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(()=> notice.style.display='none', ms);
  }

  function esc(s){
    return (s===undefined||s===null)
      ? ''
      : String(s).replaceAll('&','&amp;')
                 .replaceAll('<','&lt;')
                 .replaceAll('>','&gt;');
  }

  function sortKeys(keys){
    return keys.sort((a,b)=>
      (parseInt(String(a).split('-')[0]) || 0) -
      (parseInt(String(b).split('-')[0]) || 0)
    );
  }

  function saveVersions(){
    try{
      localStorage.setItem('lastA', state.versionA||'');
      localStorage.setItem('lastB', state.versionB||'');
    }catch(e){}
  }

  function loadVersions(){
    try{
      const a = localStorage.getItem('lastA');
      const b = localStorage.getItem('lastB');
      if(a) state.versionA = a;
      if(b) state.versionB = b;
    }catch(e){}
  }

  function normalize(json){
    if(!json) return {books:[]};

    // If structure is { books: [ {name:"Genesis", chapters:[ ["v1","v2"], ... ]} ] }
    if(json.books && Array.isArray(json.books)){
      return {
        books: json.books.map(b=>({
          name: b.name || b.book || 'Unknown',
          chapters: (b.chapters||[]).map(ch=>{
            if(Array.isArray(ch))
              return ch.map((t,i)=>({ key:String(i+1), text:t }));

            if(typeof ch==='object'){
              const ks = sortKeys(Object.keys(ch||{}));
              return ks.map(k=>({ key:k, text: ch[k] }));
            }
            return [];
          })
        }))
      };
    }

    // If structure is { Genesis: {1:{1:"text",2:"text"},2:{...}}, Exodus:{...} }
    const books=[];
    for(const bk of Object.keys(json||{})){
      const bookObj = json[bk];
      if(!bookObj || typeof bookObj !== 'object') continue;

      const ckeys = Object.keys(bookObj).sort((a,b)=>Number(a)-Number(b));
      const chapters=[];
      for(const ck of ckeys){
        const ch = bookObj[ck];
        if(!ch || typeof ch !== 'object'){
          chapters.push([]);
          continue;
        }
        const vks = sortKeys(Object.keys(ch||{}));
        chapters.push(vks.map(vk=>({ key: vk, text: ch[vk] })));
      }
      books.push({ name: bk, chapters });
    }
    return { books };
  }

  async function fetchAndNormalize(fname){
    if(!fname) throw new Error("No file");

    if(normCache[fname]) return normCache[fname];

    const res = await fetch(BASE + fname);
    if(!res.ok) throw new Error("Fetch failed: " + res.status + " (" + fname + ")");

    const j = await res.json();
    rawCache[fname] = j;

    const n = normalize(j);
    normCache[fname] = n;

    buildSearchIndex(fname, n);

    return n;
  }

  function buildSearchIndex(fname, norm){
    if(searchIndexCache[fname]) return searchIndexCache[fname];

    const arr=[];
    (norm.books||[]).forEach((b,bi)=>{
      (b.chapters||[]).forEach((ch,ci)=>{
        (ch||[]).forEach((v,vi)=>{
          const t=(v&&v.text)?v.text:'';
          arr.push({
            bookIndex:bi,
            chapterIndex:ci,
            verseIndex:vi,
            book:b.name,
            chapter:ci+1,
            verseKey:v.key,
            text:t,
            low:t.toLowerCase()
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
    return arr;
  }

  // Populate dropdown with all files
  FILES.forEach(f=>{
    const label = f.replace("_bible.json","").replace(".json","").toUpperCase();
    homeA.appendChild(new Option(label,f));
    homeB.appendChild(new Option(label,f));
  });

  // TAB SWITCHING
  function activateTab(name){
    state.view = name;

    panes.home.style.display = (name==='home') ? 'block' : 'none';
    panes.read.style.display = (name==='read') ? 'block' : 'none';
    panes.search.style.display = (name==='search') ? 'block' : 'none';

    Object.values(tabs).forEach(t => t.classList.remove('active'));
    if(tabs[name]) tabs[name].classList.add('active');

    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === name));

    if(name==='read') renderRead();
    if(name==='search'){
      searchResults.innerHTML='';
      searchInfo.textContent='';
    }
  }

  Object.keys(tabs).forEach(k=>{
    if(tabs[k]) tabs[k].addEventListener('click', ()=> activateTab(k));
  });

  bottomItems.forEach(b =>
    b.addEventListener('click', ()=> activateTab(b.dataset.tab))
  );

  // Populate books for Version A
  async function populateBooksA(fname){
    if(!fname) return;

    try{
      const n = await fetchAndNormalize(fname);
      homeBook.innerHTML = "<option value=''>Book</option>";
      n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name,i)));

      homeChapter.innerHTML = "<option value=''>Chapter</option>";
      homeVerse.innerHTML = "<option value=''>Verse</option>";
    }catch(e){
      showNotice('Failed to load ' + fname);
    }
  }

  homeA.addEventListener('change', async function(){
    const f = this.value;
    if(!f) return;

    state.versionA = f;
    await populateBooksA(f);
    saveVersions();

    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  homeBook.addEventListener('change', async function(){
    const bi = Number(this.value || 0);
    if(!state.versionA) return;

    const n = await fetchAndNormalize(state.versionA);
    const ccount = n.books[bi]?.chapters?.length || 0;

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    for(let i=1;i<=ccount;i++) homeChapter.appendChild(new Option(i, i-1));

    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener('change', async function(){
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);

    if(!state.versionA) return;

    const n = await fetchAndNormalize(state.versionA);
    const vcount = n.books[bi]?.chapters?.[ci]?.length || 0;

    homeVerse.innerHTML = "<option value=''>Verse</option>";
    for(let v=1; v<=vcount; v++) homeVerse.appendChild(new Option(v, v-1));
  });

  homeB.addEventListener('change', function(){
    const f = this.value;
    if(!f) return;

    state.versionB = f;
    saveVersions();

    showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  homeOpen.addEventListener('click', async function(){
    const a = homeA.value || state.versionA;
    const b = homeB.value || state.versionB;

    if(!a || !b){
      showNotice('Select both versions (A and B)');
      return;
    }

    const bi = homeBook.value !== '' ? Number(homeBook.value) : 0;
    const ci = homeChapter.value !== '' ? Number(homeChapter.value) : 0;
    const viDropdown = homeVerse.value !== '' ? Number(homeVerse.value) : null;
    const rng = (homeRange.value || '').trim();

    state.versionA = a;
    state.versionB = b;
    state.bookIndex = bi;
    state.chapterIndex = ci;

    if(rng)
      state.verseKey = rng;
    else if(viDropdown !== null)
      state.verseKey = String(viDropdown + 1);
    else
      state.verseKey = null;

    try{
      await fetchAndNormalize(a);
      await fetchAndNormalize(b);
    }catch(e){
      showNotice('Failed to load versions');
      return;
    }

    saveVersions();
    activateTab('read');
    renderRead();
    updateUrl();
  });

  // READER
  async function renderRead(){
    if(!state.versionA){
      readRef.textContent = 'Select versions in HOME';
      readVerses.innerHTML = '';
      return;
    }

    try{
      await fetchAndNormalize(state.versionA);
    }catch(e){
      readRef.textContent='Failed to load primary';
      readVerses.innerHTML='';
      return;
    }

    if(state.versionB) try{ await fetchAndNormalize(state.versionB); }catch(e){}

    const n = normCache[state.versionA];
    if(!n){
      readRef.textContent='No data';
      readVerses.innerHTML='';
      return;
    }

    if(state.bookIndex < 0) state.bookIndex = 0;
    if(state.bookIndex >= n.books.length) state.bookIndex = 0;

    const bookA = n.books[state.bookIndex];
    if(!bookA){
      readRef.textContent='No book';
      readVerses.innerHTML='';
      return;
    }

    if(state.chapterIndex < 0) state.chapterIndex = 0;
    if(state.chapterIndex >= bookA.chapters.length) state.chapterIndex = 0;

    const chapA = bookA.chapters[state.chapterIndex] || [];

    readRef.textContent = `${bookA.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    const chapB =
      state.versionB &&
      normCache[state.versionB] &&
      normCache[state.versionB].books[state.bookIndex]
        ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || []
        : [];

    if(state.verseKey){
      const exact = chapA.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){
        renderCombined(exact, chapA, chapB, state.versionA, state.versionB);
        showReadNav(true, exact);
        return;
      }

      const m = state.verseKey.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Number(m[1])-1;
        const e = Number(m[2])-1;
        const start = Math.max(0, Math.min(s, chapA.length-1));
        const end = Math.max(start, Math.min(e, chapA.length-1));

        for(let i=start;i<=end;i++)
          renderCombined(i, chapA, chapB, state.versionA, state.versionB);

        showReadNav(true, start);
        return;
      }

      if(/^\d+$/.test(state.verseKey)){
        const idx = Math.max(0, Math.min(Number(state.verseKey)-1, chapA.length-1));
        renderCombined(idx, chapA, chapB, state.versionA, state.versionB);
        showReadNav(true, idx);
        return;
      }

      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>';
      showReadNav(false);
      return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++)
      renderCombined(i, chapA, chapB, state.versionA, state.versionB);

    showReadNav(false);
  }

  function renderCombined(idx, chapA, chapB, fileA, fileB){
    const va = chapA[idx] || null;
    const vb = chapB[idx] || null;
    const key = va ? va.key : (vb ? vb.key : (idx+1));

    const labelA = (fileA||'').replace('_bible.json','').replace('.json','').toUpperCase();
    const labelB = (fileB||'').replace('_bible.json','').replace('.json','').toUpperCase();

    const block = document.createElement('div');
    block.className='verse-block parallel';

    let inner = `<div class="verse-num">Verse ${key}</div>`;
    inner += `<div class="verse-label">${esc(labelA)}</div>`;
    inner += `<div class="verse-text">${esc(va?va.text:'')}</div>`;
    inner += `<div class="verse-label">${esc(labelB)}</div>`;
    inner += `<div class="verse-secondary">${esc(vb?vb.text:'')}</div>`;

    block.innerHTML = inner;
    readVerses.appendChild(block);
  }

  let currentVerseIndex = null;

  function showReadNav(show, idx=null){
    readNav.style.display = show ? 'flex' : 'none';
    currentVerseIndex = (typeof idx==='number') ? idx : null;
  }

  prevVerseBtn?.addEventListener('click', ()=>{
    if(currentVerseIndex===null) return;

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if(currentVerseIndex>0){
      setVerseByIndex(currentVerseIndex-1);
    } else {
      if(state.chapterIndex>0){
        state.chapterIndex--;
        const ch2 = n.books[state.bookIndex].chapters[state.chapterIndex];
        setVerseByIndex(ch2.length-1);
      }
    }
  });

  nextVerseBtn?.addEventListener('click', ()=>{
    if(currentVerseIndex===null) return;

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if(currentVerseIndex < ch.length-1){
      setVerseByIndex(currentVerseIndex+1);
    } else {
      if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
        state.chapterIndex++;
        state.verseKey=null;
        renderRead();
        updateUrl();
      }
    }
  });

  function setVerseByIndex(idx){
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    state.verseKey = ch[idx].key;
    renderRead();
    updateUrl();
  }

  prevChapterBtn?.addEventListener('click', ()=>{
    if(state.chapterIndex>0){
      state.chapterIndex--;
      state.verseKey=null;
      renderRead();
      updateUrl();
    }
  });

  nextChapterBtn?.addEventListener('click', ()=>{
    const n = normCache[state.versionA];
    if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
      state.chapterIndex++;
      state.verseKey=null;
      renderRead();
      updateUrl();
    }
  });

  // Swipe / Drag / Keys navigation
  let touchStartX = 0;
  document.addEventListener('touchstart', e=> touchStartX = e.changedTouches[0].clientX);

  document.addEventListener('touchend', e=>{
    const dx = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(dx)<60) return;

    const n = normCache[state.versionA];
    if(dx<0){
      if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
        state.chapterIndex++;
        state.verseKey=null;
        renderRead();
        updateUrl();
      }
    } else {
      if(state.chapterIndex>0){
        state.chapterIndex--;
        state.verseKey=null;
        renderRead();
        updateUrl();
      }
    }
  });

  let mouseDown=false, startX=0, curX=0;
  readVerses.addEventListener('mousedown', e=>{
    mouseDown=true;
    startX=e.clientX;
  });

  document.addEventListener('mousemove', e=>{
    if(!mouseDown) return;
    curX=e.clientX;
  });

  document.addEventListener('mouseup', e=>{
    if(!mouseDown) return;
    mouseDown=false;

    const dx = (curX||e.clientX)-startX;
    if(Math.abs(dx)>100){
      const n = normCache[state.versionA];
      if(dx<0){
        if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
          state.chapterIndex++;
          state.verseKey=null;
          renderRead();
          updateUrl();
        }
      } else {
        if(state.chapterIndex>0){
          state.chapterIndex--;
          state.verseKey=null;
          renderRead();
          updateUrl();
        }
      }
    }

    startX=curX=0;
  });

  document.addEventListener('keydown', e=>{
    if(e.key==='ArrowRight'){
      const n = normCache[state.versionA];
      if(n && state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
        state.chapterIndex++;
        state.verseKey=null;
        renderRead();
        updateUrl();
      }
    }
    if(e.key==='ArrowLeft'){
      if(state.chapterIndex>0){
        state.chapterIndex--;
        state.verseKey=null;
        renderRead();
        updateUrl();
      }
    }
  });

  // TTS – PRIMARY VERSION ONLY
  let ttsQueue=[];

  function buildTTS(){
    ttsQueue=[];
    if(!state.versionA) return;

    const n = normCache[state.versionA];
    if(!n) return;

    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];

    if(state.verseKey){
      const exact = ch.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){
        ttsQueue.push({text:ch[exact].text, idx:exact});
        return;
      }

      const m = state.verseKey.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s=Number(m[1])-1, e=Number(m[2])-1;
        for(let i=Math.max(0,s); i<=Math.min(e,ch.length-1); i++)
          ttsQueue.push({text:ch[i].text, idx:i});
        return;
      }

      if(/^\d+$/.test(state.verseKey)){
        const idx = Math.max(0, Math.min(Number(state.verseKey)-1, ch.length-1));
        ttsQueue.push({text:ch[idx].text, idx});
        return;
      }
      return;
    }

    for(let i=0;i<ch.length;i++)
      ttsQueue.push({text:ch[i].text, idx:i});
  }

  function speakNext(){
    if(ttsQueue.length===0) return;

    const item = ttsQueue.shift();
    if(!item || !item.text){
      return setTimeout(speakNext,120);
    }

    const blocks = document.querySelectorAll('.verse-block');
    blocks.forEach(b=>b.classList.remove('active-verse'));

    if(blocks[item.idx]){
      blocks[item.idx].classList.add('active-verse');
      blocks[item.idx].scrollIntoView({behavior:'smooth', block:'center'});
    }

    const u = new SpeechSynthesisUtterance(String(item.text));
    u.onend = ()=> setTimeout(speakNext,120);
    u.onerror = ()=> setTimeout(speakNext,180);

    speechSynthesis.speak(u);
  }

  playBtn.addEventListener('click', ()=>{
    speechSynthesis.cancel();
    buildTTS();
    speakNext();
  });

  pauseBtn.addEventListener('click', ()=> speechSynthesis.pause());
  resumeBtn.addEventListener('click', ()=> speechSynthesis.resume());
  stopBtn.addEventListener('click', ()=>{
    speechSynthesis.cancel();
    ttsQueue=[];
  });

  // SEARCH
  async function doSearch(q){
    searchResults.innerHTML='';
    searchInfo.textContent='';

    if(!q) return;

    if(!state.versionA){
      searchInfo.textContent='Select versions in HOME first';
      return;
    }

    try{
      await fetchAndNormalize(state.versionA);

      const idx = searchIndexCache[state.versionA] ||
                  buildSearchIndex(state.versionA, normCache[state.versionA]);

      const results=[];
      const max = 250;

      for(let i=0;i<idx.length && results.length<max;i++){
        if(idx[i].low.includes(q)) results.push(idx[i]);
      }

      searchInfo.textContent = `Found ${results.length}`;

      if(!results.length){
        searchResults.innerHTML = '<div style="padding:8px;color:#666">No results</div>';
        return;
      }

      const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re = new RegExp(safe,'ig');

      const frag = document.createDocumentFragment();

      results.forEach(r=>{
        const div=document.createElement('div');
        div.className='search-item';

        const snippet = esc(r.text).replace(re, m=>`<span class="highlight">${m}</span>`);

        div.innerHTML = `
          <strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong>
          <div style="margin-top:6px">${snippet}</div>
          <small style="display:block;margin-top:6px;color:#666">Click to open</small>
        `;

        div.onclick = async ()=>{
          state.bookIndex = r.bookIndex;
          state.chapterIndex = r.chapterIndex;
          state.verseKey = r.verseKey;

          activateTab('read');
          await fetchAndNormalize(state.versionA);
          renderRead();
          updateUrl();
        };

        frag.appendChild(div);
      });

      searchResults.appendChild(frag);
      activateTab('search');

    }catch(e){
      showNotice('Search failed');
    }
  }

  searchBox.addEventListener('keydown', e=>{
    if(e.key==='Enter')
      doSearch((searchBox.value||'').trim().toLowerCase());
  });

  // URL UPDATE
  function updateUrl(replace=false){
    const p = new URLSearchParams();

    if(state.versionA) p.set('versionA', state.versionA);
    if(state.versionB) p.set('versionB', state.versionB);

    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));

    if(state.verseKey) p.set('verse', state.verseKey);

    p.set('view', state.view || 'home');

    const url = location.pathname + '?' + p.toString();

    if(replace)
      history.replaceState({...state}, '', url);
    else
      history.pushState({...state}, '', url);
  }

  // BOTTOM NAV AUTO-HIDE
  let lastScroll = window.scrollY || 0;
  let navHidden = false;

  function handleScrollHide(){
    const y = window.scrollY || 0;
    const delta = y - lastScroll;
    lastScroll = y;

    if(y < 60){
      showBottomNav();
      return;
    }

    if(delta > 12 && !navHidden){
      hideBottomNav();
    } else if(delta < -12 && navHidden){
      showBottomNav();
    }
  }

  function hideBottomNav(){
    bottomNav.classList.add('hidden');
    navHidden = true;
  }

  function showBottomNav(){
    bottomNav.classList.remove('hidden');
    navHidden = false;
  }

  bottomNav.addEventListener('touchstart', e=> e.stopPropagation(), {passive:true});
  window.addEventListener('scroll', handleScrollHide, {passive:true});

  // INITIAL SETUP
  async function initialLoad(){
    loadVersions();

    if(state.versionA){
      homeA.value = state.versionA;
      await populateBooksA(state.versionA);
    }

    if(state.versionB){
      homeB.value = state.versionB;
    }

    activateTab(state.view || 'home');

    if(state.view==='read')
      renderRead();
  }

  await initialLoad();

  // BACK BUTTON SUPPORT
  window.addEventListener('popstate', async e=>{
    const p = new URLSearchParams(location.search);

    const va = p.get('versionA');
    const vb = p.get('versionB');

    if(va) state.versionA = va;
    if(vb) state.versionB = vb;

    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter')
      ? Number(p.get('chapter')) - 1
      : state.chapterIndex;

    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || state.view;

    if(state.versionA) await fetchAndNormalize(state.versionA);
    if(state.versionA) await populateBooksA(state.versionA);

    activateTab(state.view || 'home');

    if(state.view==='read')
      renderRead();
  });

})(); // END IIFE
