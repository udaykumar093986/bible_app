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
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(()=> notice.style.display = 'none', ms);
  };

  function scrollToElementWithOffset(el, offset = -90) {
    const rect = el.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top;
    window.scrollTo({ top: absoluteTop + offset, behavior: "smooth" });
  }

  /* -------------------------------
     THEME
  --------------------------------*/
  (() => {
    const saved = localStorage.getItem("theme");
    if(saved === "dark") document.body.classList.add("dark");

    if(themeToggle) {
      themeToggle.onclick = () => {
        document.body.classList.toggle("dark");
        localStorage.setItem("theme", 
          document.body.classList.contains("dark") ? "dark" : "light"
        );
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
    if(normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    try {
      const res = await fetch(url);
      const json = await res.json();
      const norm = normalizeUniform(json);
      normCache[fname] = norm;
      buildSearchIndex(fname, norm);
      return norm;
    } catch(e) {
      console.error("Failed to load", fname);
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
    norm.books.forEach((b,bi) => {
      b.chapters.forEach((ch,ci)=>{
        ch.forEach((v,vi)=>{
          arr.push({
            file: fname,
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci+1,
            verseKey: v.key,
            text: v.text,
            low: v.text.toLowerCase()
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
    paneHome.style.display = v === "home" ? "block" : "none";
    paneRead.style.display = v === "read" ? "block" : "none";
    paneSearch.style.display = v === "search" ? "block" : "none";

    tabHome.classList.toggle("active", v==="home");
    tabRead.classList.toggle("active", v==="read");
    tabSearch.classList.toggle("active", v==="search");

    bottomItems.forEach(i =>
      i.classList.toggle("active", i.dataset.tab === v)
    );

    if(v === "search") {
      searchBox.focus();
    }
    if(v === "read") {
      renderRead();
    }
  }

  tabHome.onclick = ()=> showView("home");
  tabRead.onclick = ()=> showView("read");
  tabSearch.onclick = ()=> showView("search");

  bottomItems.forEach(i => i.onclick = () => showView(i.dataset.tab));

  /* -------------------------------
     HOME EVENTS
  --------------------------------*/
  homeA.onchange = async function() {
    state.versionA = this.value;
    if(!this.value) return;
    await populateBooksForA(this.value);
    fetchAndNormalize(this.value);
  };

  homeB.onchange = function() {
    state.versionB = this.value || null;
  };

  async function populateBooksForA(fname) {
    const n = await fetchAndNormalize(fname);
    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b,i)=> homeBook.appendChild(new Option(b.name,i)));

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeBook.onchange = function() {
    const idx = Number(this.value);
    const n = normCache[state.versionA];
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    n.books[idx].chapters.forEach((_,i)=> homeChapter.appendChild(new Option(i+1,i)));
  };

  homeChapter.onchange = function() {
    const bi = Number(homeBook.value);
    const ci = Number(this.value);
    const n = normCache[state.versionA];

    homeVerse.innerHTML = "<option value=''>Verse</option>";
    n.books[bi].chapters[ci].forEach((_,i)=> homeVerse.appendChild(new Option(i+1,i)));
  };

  homeOpen.onclick = async () => {
    state.versionA = homeA.value;
    state.versionB = homeB.value || null;
    state.bookIndex = Number(homeBook.value || 0);
    state.chapterIndex = Number(homeChapter.value || 0);
    state.verseKey = homeVerse.value ? String(Number(homeVerse.value)+1) : null;

    await fetchAndNormalize(state.versionA);
    if(state.versionB) await fetchAndNormalize(state.versionB);

    showView("read");
  };

  /* -------------------------------
     RENDER READ VIEW
  --------------------------------*/
  function paragraphHtml(text) {
    return text.split(/\n+/).map(p =>
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
    clearActive();
    readVerses.innerHTML = "";

    const nA = normCache[state.versionA];
    if(!nA) return;

    const book = nA.books[state.bookIndex];
    const chapA = book.chapters[state.chapterIndex];
    const chapB = (state.versionB && normCache[state.versionB])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex]
      : [];

    readRef.textContent = `${book.name} ${state.chapterIndex+1}`;

    const showFullChapter = (state.verseKey === null);

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

    if(showFullChapter) {
      readNav.style.display = "none";

      // Auto-scroll to Verse 1 with offset
      setTimeout(()=>{
        const first = $("verse-0");
        if(first) scrollToElementWithOffset(first);
      },150);

    } else {
      // Single verse mode
      const idx = chapA.findIndex(v=>v.key === state.verseKey);
      if(idx >= 0) {
        readNav.style.display = "flex";
        setTimeout(()=> setActive(idx), 150);
      }
    }
  }

  /* -------------------------------
     CHAPTER NAVIGATION
  --------------------------------*/
  prevChapterBtn.onclick = () =>{
    if(state.chapterIndex > 0) {
      state.chapterIndex--;
      state.verseKey = null;
      renderRead();
    }
  };

  nextChapterBtn.onclick = () =>{
    const n = normCache[state.versionA];
    if(state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++;
      state.verseKey = null;
      renderRead();
    }
  };

  /* -------------------------------
     VERSE NAVIGATION
  --------------------------------*/
  prevVerseBtn.onclick = ()=>{
    if(currentVerseIndex > 0) {
      const n = normCache[state.versionA];
      const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
      state.verseKey = ch[currentVerseIndex - 1].key;
      renderRead();
    }
  };

  nextVerseBtn.onclick = ()=>{
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if(currentVerseIndex + 1 < ch.length) {
      state.verseKey = ch[currentVerseIndex + 1].key;
      renderRead();
    }
  };

  /* -------------------------------
     SEARCH
  --------------------------------*/
  async function doSearch(q) {
    q = q.toLowerCase();
    searchResults.innerHTML = "";
    searchInfo.textContent = "Searching...";

    const result = [];

    for(const f of FILES) {
      if(!searchIndexCache[f]) {
        await fetchAndNormalize(f);
      }
      const arr = searchIndexCache[f];
      arr.forEach(r => {
        if(r.low.includes(q)) result.push(r);
      });
    }

    searchInfo.textContent = `Found ${result.length}`;

    result.forEach(r=>{
      const div = document.createElement("div");
      div.className = "search-item";

      const hl = r.text.replace(
        new RegExp(q,"ig"),
        m=>`<mark>${m}</mark>`
      );

      div.innerHTML = `
        <strong>${r.book} ${r.chapter}:${r.verseKey}</strong>
        <div>${hl}</div>
      `;

      div.onclick = async ()=>{
        state.versionA = r.file;
        await fetchAndNormalize(state.versionA);
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        showView("read");
      };

      searchResults.appendChild(div);
    });
  }

  searchBox.onkeydown = e=>{
    if(e.key === "Enter") doSearch(searchBox.value.trim());
  };

  /* -------------------------------
     SWIPE SUPPORT
  --------------------------------*/
  (() =>{
    let startX = 0;

    readVerses.addEventListener("touchstart", e=>{
      startX = e.touches[0].clientX;
    });

    readVerses.addEventListener("touchend", e=>{
      const dx = e.changedTouches[0].clientX - startX;

      if(Math.abs(dx) < 60) return;

      if(dx < 0) nextChapterBtn.onclick();
      else prevChapterBtn.onclick();
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

})();
