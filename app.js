// ======================
// Bible Reader SPA - Updated app.js
// Includes: Back Button, Search Fix, Single/Parallel View Logic
// ======================
(async function(){
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json","NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json","hungarian_bible.json","indonesian_bible.json",
    "kannada_bible.json","malayalam_bible.json","marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // DOM references
  const tabs = {
    home: document.getElementById('tab-home'),
    read: document.getElementById('tab-read'),
    search: document.getElementById('tab-search')
  };

  const panes = {
    home: document.getElementById('pane-home'),
    read: document.getElementById('pane-read'),
    search: document.getElementById('pane-search')
  };

  const homeA = document.getElementById('homeA');
  const homeB = document.getElementById('homeB');
  const homeBook = document.getElementById('homeBook');
  const homeChapter = document.getElementById('homeChapter');
  const homeVerse = document.getElementById('homeVerse');
  const homeRange = document.getElementById('homeRange');
  const homeOpen = document.getElementById('homeOpen');

  const readRef = document.getElementById('readRef');
  const readVerses = document.getElementById('readVerses');
  const readNav = document.getElementById('readNav');

  const prevVerseBtn = document.getElementById('prevVerse');
  const nextVerseBtn = document.getElementById('nextVerse');
  const prevChapterBtn = document.getElementById('prevChapter');
  const nextChapterBtn = document.getElementById('nextChapter');

  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const resumeBtn = document.getElementById('resume');
  const stopBtn = document.getElementById('stop');

  const searchBox = document.getElementById('searchBox');
  const searchInfo = document.getElementById('searchInfo');
  const searchResults = document.getElementById('searchResults');

  const notice = document.getElementById('notice');
  const bottomNav = document.getElementById('bottomNav');
  const bottomItems = bottomNav.querySelectorAll('.bottom-item');

  let rawCache = {}, normCache = {}, searchIndexCache = {};
  let state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home"
  };

  /* Utility helpers */
  function showNotice(msg, ms=1400){
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(()=> notice.style.display = "none", ms);
  }

  function esc(s){
    return (s===undefined || s===null)
      ? ""
      : String(s)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;");
  }

  function sortKeys(keys){
    return keys.sort((a,b)=>
      (parseInt(a.split('-')[0])||0) - (parseInt(b.split('-')[0])||0)
    );
  }

  function saveVersions(){
    try{
      localStorage.setItem("lastA", state.versionA || "");
      localStorage.setItem("lastB", state.versionB || "");
    }catch(e){}
  }

  function loadVersions(){
    try{
      const a = localStorage.getItem("lastA");
      const b = localStorage.getItem("lastB");
      if(a) state.versionA = a;
      if(b) state.versionB = b;
    }catch(e){}
  }

  /* Normalize Bible JSON structures */
  function normalize(json){
    if(!json) return {books:[]};

    if(json.books && Array.isArray(json.books)){
      return {
        books: json.books.map(b => ({
          name: b.name || b.book || "Unknown",
          chapters: (b.chapters || []).map(ch => {
            if(Array.isArray(ch))
              return ch.map((t,i)=>({key:String(i+1), text:t}));

            if(typeof ch==="object"){
              const ks = sortKeys(Object.keys(ch));
              return ks.map(k=>({key:k, text: ch[k]}));
            }
            return [];
          })
        }))
      };
    }

    // Old-style structure
    const books = [];
    for(const bk of Object.keys(json)){
      const bookObj = json[bk];
      if(typeof bookObj !== "object") continue;

      const ckeys = Object.keys(bookObj).sort((a,b)=>Number(a)-Number(b));
      let chapters = [];

      for(const ck of ckeys){
        const ch = bookObj[ck];
        if(typeof ch !== "object") { chapters.push([]); continue; }

        const vks = sortKeys(Object.keys(ch));
        chapters.push(vks.map(vk=>({key:vk,text:ch[vk]})));
      }
      books.push({name: bk, chapters});
    }

    return {books};
  }

  async function fetchAndNormalize(fname){
    if(!fname) throw new Error("No filename supplied");

    if(normCache[fname]) return normCache[fname];

    const res = await fetch(BASE + fname);
    if(!res.ok) throw new Error("Failed to fetch "+fname);

    const j = await res.json();
    rawCache[fname] = j;

    const n = normalize(j);
    normCache[fname] = n;

    buildSearchIndex(fname, n);
    return n;
  }

  function buildSearchIndex(fname, norm){
    if(searchIndexCache[fname]) return searchIndexCache[fname];

    const arr = [];

    (norm.books||[]).forEach((b,bi)=>{
      (b.chapters||[]).forEach((ch,ci)=>{
        (ch||[]).forEach((v,vi)=>{
          const t = v?.text || "";
          arr.push({
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci+1,
            verseKey: v.key,
            text: t,
            low: t.toLowerCase()
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
    return arr;
  }

  /* Populate version dropdowns */
  FILES.forEach(f=>{
    const label = f.replace("_bible.json","").replace(".json","").toUpperCase();
    homeA.appendChild(new Option(label,f));
    homeB.appendChild(new Option(label,f));
  });

  /* Tab switching */
  function activateTab(name){
    state.view = name;

    panes.home.style.display = name==="home" ? "block" : "none";
    panes.read.style.display = name==="read" ? "block" : "none";
    panes.search.style.display = name==="search" ? "block" : "none";

    Object.values(tabs).forEach(t=> t.classList.remove('active'));
    tabs[name]?.classList.add("active");

    bottomItems.forEach(b => b.classList.toggle("active", b.dataset.tab === name));

    if(name==="read") renderRead();
  }

  Object.keys(tabs).forEach(k=>{
    tabs[k].addEventListener("click", ()=> activateTab(k));
  });

  bottomItems.forEach(b=>{
    b.addEventListener("click", ()=> activateTab(b.dataset.tab));
  });

  /* Version A selected */
  homeA.addEventListener("change", async function(){
    if(!this.value) return;

    state.versionA = this.value;
    homeB.disabled = false;

    await populateBooksA(state.versionA);

    saveVersions();
    showNotice(this.options[this.selectedIndex].text+" loaded (A)");
  });

  /* Populate book dropdown */
  async function populateBooksA(fname){
    const n = await fetchAndNormalize(fname);

    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name,i)));

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  /* Book selected */
  homeBook.addEventListener("change", async function(){
    if(!state.versionA) return;

    const bi = Number(homeBook.value);
    const n = await fetchAndNormalize(state.versionA);
    const chapters = n.books[bi]?.chapters?.length || 0;

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    for(let i=1;i<=chapters;i++) homeChapter.appendChild(new Option(i,i-1));

    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  /* Chapter selected */
  homeChapter.addEventListener("change", async function(){
    if(!state.versionA) return;

    const bi = Number(homeBook.value);
    const ci = Number(homeChapter.value);

    const n = await fetchAndNormalize(state.versionA);
    const vcount = n.books[bi]?.chapters?.[ci]?.length || 0;

    homeVerse.innerHTML = "<option value=''>Verse</option>";
    for(let v=1;v<=vcount;v++) homeVerse.appendChild(new Option(v,v-1));
  });

  /* Version B selected */
  homeB.addEventListener("change", function(){
    if(!this.value) return;

    state.versionB = this.value;
    saveVersions();
    showNotice(this.options[this.selectedIndex].text+" loaded (B)");
  });

  /* OPEN button → go to Read */
  homeOpen.addEventListener("click", async function(){
    const a = homeA.value || state.versionA;
    const b = homeB.value || state.versionB;

    if(!a){
      showNotice("Select Version A");
      return;
    }

    state.versionA = a;
    state.versionB = b || null;

    const bi = homeBook.value==="" ? 0 : Number(homeBook.value);
    const ci = homeChapter.value==="" ? 0 : Number(homeChapter.value);
    const vi = homeVerse.value==="" ? null : Number(homeVerse.value);

    state.bookIndex = bi;
    state.chapterIndex = ci;

    const rng = homeRange.value.trim();
    if(rng) state.verseKey = rng;
    else if(vi!==null) state.verseKey = String(vi+1);
    else state.verseKey = null;

    try{
      await fetchAndNormalize(state.versionA);
      if(state.versionB) await fetchAndNormalize(state.versionB);
    }catch(e){
      showNotice("Version Load Failed");
      return;
    }

    saveVersions();
    activateTab("read");
    renderRead();
    updateUrl();
  });

  /* Render READ page */
  async function renderRead(){
    if(!state.versionA){
      readRef.textContent = "Select Version A in HOME";
      readVerses.innerHTML="";
      return;
    }

    try{ await fetchAndNormalize(state.versionA); }catch(e){
      readRef.textContent="Failed to load version A";
      return;
    }

    if(state.versionB) try{ await fetchAndNormalize(state.versionB); }catch(e){}

    const n = normCache[state.versionA];
    if(!n) return;

    const bookA = n.books[state.bookIndex];
    if(!bookA){
      readRef.textContent="Invalid Book";
      return;
    }

    const chapA = bookA.chapters[state.chapterIndex] || [];
    const chapB =
      state.versionB &&
      normCache[state.versionB]?.books[state.bookIndex]?.chapters[state.chapterIndex]
        ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex]
        : [];

    readRef.textContent = `${bookA.name} ${state.chapterIndex+1}`;
    readVerses.innerHTML="";

    if(state.verseKey){
      renderSingleSelection(chapA, chapB);
      return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for(let i=0;i<maxLen;i++){
      renderCombined(i, chapA, chapB);
    }

    showReadNav(false);
  }

  function renderSingleSelection(chapA, chapB){
    const ch = chapA;
    let key = state.verseKey;

    let idx = ch.findIndex(v=>v.key===key);
    if(idx !== -1){
      renderCombined(idx, chapA, chapB);
      showReadNav(true, idx);
      return;
    }

    const m = key.match(/^(\d+)\s*-\s*(\d+)$/);
    if(m){
      const s = Math.max(0, Number(m[1])-1);
      const e = Math.min(ch.length-1, Number(m[2])-1);

      for(let i=s;i<=e;i++){
        renderCombined(i, chapA, chapB);
      }
      showReadNav(true, s);
      return;
    }

    if(/^\d+$/.test(key)){
      idx = Math.max(0, Math.min(Number(key)-1, ch.length-1));
      renderCombined(idx, chapA, chapB);
      showReadNav(true, idx);
      return;
    }

    readVerses.innerHTML = "<div style='padding:12px;color:#666'>Verse not found</div>";
  }

  function renderCombined(idx, chapA, chapB){
    const va = chapA[idx] || null;
    const vb = chapB[idx] || null;

    const key = va?.key || vb?.key || (idx+1);
    const labelA = state.versionA.replace("_bible.json","").toUpperCase();
    const labelB = state.versionB ? state.versionB.replace("_bible.json","").toUpperCase() : null;

    const block = document.createElement("div");
    block.className = "verse-block parallel";

    let inner = `<div class="verse-num">Verse ${key}</div>`;
    inner += `<div class="verse-label">${labelA}</div>`;
    inner += `<div class="verse-text">${esc(va?.text || "")}</div>`;

    if(state.versionB){
      inner += `<div class="verse-label">${labelB}</div>`;
      inner += `<div class="verse-secondary">${esc(vb?.text || "")}</div>`;
    }

    block.innerHTML = inner;

    readVerses.appendChild(block);
  }

  /* Navigation Buttons */
  let currentVerseIndex = null;

  function showReadNav(show, idx=null){
    readNav.style.display = show ? "flex" : "none";
    currentVerseIndex = idx;
  }

  prevVerseBtn.addEventListener("click", ()=>{
    if(currentVerseIndex===null) return;

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if(currentVerseIndex>0){
      setVerseIndex(currentVerseIndex - 1);
    }else if(state.chapterIndex>0){
      state.chapterIndex--;
      const chPrev = n.books[state.bookIndex].chapters[state.chapterIndex];
      setVerseIndex(chPrev.length-1);
    }
  });

  nextVerseBtn.addEventListener("click", ()=>{
    if(currentVerseIndex===null) return;

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if(currentVerseIndex < ch.length-1){
      setVerseIndex(currentVerseIndex + 1);
    } else if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length){
      state.chapterIndex++;
      state.verseKey=null;
      renderRead();
      updateUrl();
    }
  });

  function setVerseIndex(idx){
    const ch = normCache[state.versionA].books[state.bookIndex].chapters[state.chapterIndex];
    state.verseKey = ch[idx].key;
    renderRead();
    updateUrl();
  }

  prevChapterBtn.addEventListener("click", ()=>{
    if(state.chapterIndex>0){
      state.chapterIndex--;
      state.verseKey=null;
      renderRead();
      updateUrl();
    }
  });

  nextChapterBtn.addEventListener("click", ()=>{
    const n = normCache[state.versionA];
    if(state.chapterIndex+1 < n.books[state.bookIndex].chapters.length){
      state.chapterIndex++;
      state.verseKey=null;
      renderRead();
      updateUrl();
    }
  });

  /* BACK BUTTON in READ PAGE */
  document.getElementById("backHome").addEventListener("click", ()=>{
    activateTab("home");
    updateUrl();
  });

  /* TTS */
  let ttsQueue=[];

  function buildTTS(){
    ttsQueue = [];

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    if(state.verseKey){
      const exact = ch.findIndex(v=>v.key===state.verseKey);
      if(exact !== -1){
        ttsQueue.push({text:ch[exact].text, idx:exact});
        return;
      }

      const m = state.verseKey.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){
        const s = Math.max(0, Number(m[1])-1);
        const e = Math.min(ch.length-1, Number(m[2])-1);

        for(let i=s;i<=e;i++)
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
    if(!item){
      setTimeout(speakNext,120);
      return;
    }

    const blocks = document.querySelectorAll(".verse-block");
    blocks.forEach(b=>b.classList.remove("active-verse"));

    if(blocks[item.idx]){
      blocks[item.idx].classList.add("active-verse");
      blocks[item.idx].scrollIntoView({behavior:"smooth", block:"center"});
    }

    const utter = new SpeechSynthesisUtterance(item.text);
    utter.onend = ()=> setTimeout(speakNext,120);
    utter.onerror = ()=> setTimeout(speakNext,180);

    speechSynthesis.speak(utter);
  }

  playBtn.addEventListener("click", ()=>{
    speechSynthesis.cancel();
    buildTTS();
    speakNext();
  });

  pauseBtn.addEventListener("click", ()=> speechSynthesis.pause());
  resumeBtn.addEventListener("click", ()=> speechSynthesis.resume());
  stopBtn.addEventListener("click", ()=>{
    speechSynthesis.cancel();
    ttsQueue=[];
  });

  /* SEARCH FIXED */
  searchBox.addEventListener("keydown", (e)=>{
    if(e.key==="Enter"){
      let q = (searchBox.value||"").trim().toLowerCase();
      if(!q){
        searchResults.innerHTML="";
        searchInfo.textContent="";
        return;
      }
      doSearch(q);
    }
  });

  async function doSearch(q){
    searchResults.innerHTML="";
    searchInfo.textContent="";

    if(!state.versionA){
      searchInfo.textContent="Choose Version A in HOME";
      activateTab("home");
      return;
    }

    try{
      await fetchAndNormalize(state.versionA);

      const idx = searchIndexCache[state.versionA] ||
                  buildSearchIndex(state.versionA, normCache[state.versionA]);

      const results = [];
      const max = 250;

      for(let i=0;i<idx.length && results.length<max;i++){
        if(idx[i].low.includes(q)) results.push(idx[i]);
      }

      searchInfo.textContent = `Found ${results.length}`;

      if(results.length===0){
        searchResults.innerHTML="<div style='padding:8px;color:#666'>No results</div>";
        return;
      }

      const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re = new RegExp(safe,"ig");

      const frag = document.createDocumentFragment();

      results.forEach(r=>{
        const div = document.createElement("div");
        div.className = "search-item";

        const snippet = esc(r.text).replace(re, m=>`<span class="highlight">${m}</span>`);

        div.innerHTML = `
          <strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong>
          <div style="margin-top:6px">${snippet}</div>
          <small style="color:#666;display:block;margin-top:6px">Click to open</small>
        `;

        div.addEventListener("click", async ()=>{
          state.bookIndex = r.bookIndex;
          state.chapterIndex = r.chapterIndex;
          state.verseKey = r.verseKey;

          activateTab("read");
          await fetchAndNormalize(state.versionA);
          renderRead();
          updateUrl();
        });

        frag.appendChild(div);
      });

      searchResults.appendChild(frag);
      activateTab("search");

    }catch(err){
      showNotice("Search error");
    }
  }

  /* URL update */
  function updateUrl(replace=false){
    const p = new URLSearchParams();

    if(state.versionA) p.set("versionA", state.versionA);
    if(state.versionB) p.set("versionB", state.versionB);

    p.set("bookIndex", state.bookIndex);
    p.set("chapter", state.chapterIndex+1);

    if(state.verseKey) p.set("verse", state.verseKey);

    p.set("view", state.view);

    const newURL = location.pathname + "?" + p.toString();
    replace ?
      history.replaceState({...state}, "", newURL) :
      history.pushState({...state}, "", newURL);
  }

  /* Bottom nav auto-hide */
  let lastScroll = window.scrollY || 0;
  let navHidden = false;

  function handleScrollHide(){
    const y = window.scrollY;
    const delta = y - lastScroll;
    lastScroll = y;

    if(y < 60){
      bottomNav.classList.remove("hidden");
      navHidden=false;
      return;
    }

    if(delta > 12 && !navHidden){
      bottomNav.classList.add("hidden");
      navHidden=true;
    } else if(delta < -12 && navHidden){
      bottomNav.classList.remove("hidden");
      navHidden=false;
    }
  }

  window.addEventListener("scroll", handleScrollHide, {passive:true});

  /* Initial load */
  async function initialLoad(){
    loadVersions();

    if(state.versionA){
      homeA.value = state.versionA;
      await populateBooksA(state.versionA);
    }

    if(state.versionB){
      homeB.value = state.versionB;
    }

    activateTab(state.view);

    if(state.view==="read")
      renderRead();
  }

  await initialLoad();

  /* Handle back button browser navigation */
  window.addEventListener("popstate", async ()=>{
    const p = new URLSearchParams(location.search);

    if(p.get("versionA")) state.versionA = p.get("versionA");
    if(p.get("versionB")) state.versionB = p.get("versionB");

    state.bookIndex = Number(p.get("bookIndex")||0);
    state.chapterIndex = Number(p.get("chapter")||1)-1;
    state.verseKey = p.get("verse") || null;
    state.view = p.get("view") || "home";

    if(state.versionA){
      await fetchAndNormalize(state.versionA);
      await populateBooksA(state.versionA);
    }

    activateTab(state.view);
    if(state.view==="read") renderRead();
  });

})();
