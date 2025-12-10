// app.js - Bible Reader SPA (final)
// - Single / Parallel view logic
// - Back button
// - Search fix
// - URL sync
// Place next to index.html and style.css

(async function () {
  const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
  const FILES = [
    "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json","NIV_bible.json","NKJV_bible.json","NLT_bible.json",
    "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json","hungarian_bible.json","indonesian_bible.json",
    "kannada_bible.json","malayalam_bible.json","marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
    "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
  ];

  // DOM refs
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
  const backHomeBtn = document.getElementById('backHome');

  const searchBox = document.getElementById('searchBox');
  const searchInfo = document.getElementById('searchInfo');
  const searchResults = document.getElementById('searchResults');

  const notice = document.getElementById('notice');
  const bottomNav = document.getElementById('bottomNav');
  const bottomItems = bottomNav.querySelectorAll('.bottom-item');

  // caches and state
  let rawCache = {};
  let normCache = {};
  let searchIndexCache = {};
  let state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: 'home'
  };

  /* ---------------- utilities ---------------- */
  function showNotice(msg, ms = 1400) {
    if (!notice) return;
    notice.textContent = msg;
    notice.style.display = 'block';
    setTimeout(() => notice.style.display = 'none', ms);
  }

  function esc(s) {
    if (s === undefined || s === null) return '';
    return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  function sortKeys(keys) {
    return keys.sort((a, b) => (parseInt(a.split('-')[0]) || 0) - (parseInt(b.split('-')[0]) || 0));
  }

  function saveVersions() {
    try {
      localStorage.setItem('lastA', state.versionA || '');
      localStorage.setItem('lastB', state.versionB || '');
    } catch (e) {}
  }

  function loadVersions() {
    try {
      const a = localStorage.getItem('lastA');
      const b = localStorage.getItem('lastB');
      if (a) state.versionA = a;
      if (b) state.versionB = b;
    } catch (e) {}
  }

  /* ---------------- normalize / fetch ---------------- */
  function normalize(json) {
    if (!json) return { books: [] };

    // case: { books: [ {name, chapters:[ ... ]} ] }
    if (json.books && Array.isArray(json.books)) {
      return {
        books: json.books.map(b => ({
          name: b.name || b.book || 'Unknown',
          chapters: (b.chapters || []).map(ch => {
            if (Array.isArray(ch)) return ch.map((t, i) => ({ key: String(i + 1), text: t }));
            if (typeof ch === 'object') {
              const ks = sortKeys(Object.keys(ch || {}));
              return ks.map(k => ({ key: k, text: ch[k] }));
            }
            return [];
          })
        }))
      };
    }

    // case: { Genesis: {1: {1: "text", 2: "text"}, 2: {...}}, ... }
    const books = [];
    for (const bk of Object.keys(json || {})) {
      const bookObj = json[bk];
      if (!bookObj || typeof bookObj !== 'object') continue;
      const ckeys = Object.keys(bookObj).sort((a, b) => Number(a) - Number(b));
      const chapters = [];
      for (const ck of ckeys) {
        const ch = bookObj[ck];
        if (!ch || typeof ch !== 'object') {
          chapters.push([]);
          continue;
        }
        const vks = sortKeys(Object.keys(ch || {}));
        chapters.push(vks.map(vk => ({ key: vk, text: ch[vk] })));
      }
      books.push({ name: bk, chapters });
    }
    return { books };
  }

  async function fetchAndNormalize(fname) {
    if (!fname) throw new Error('No file name');
    if (normCache[fname]) return normCache[fname];

    const res = await fetch(BASE + fname);
    if (!res.ok) throw new Error('Fetch failed: ' + res.status + ' ' + fname);
    const j = await res.json();
    rawCache[fname] = j;
    const n = normalize(j);
    normCache[fname] = n;
    buildSearchIndex(fname, n);
    return n;
  }

  function buildSearchIndex(fname, norm) {
    if (searchIndexCache[fname]) return searchIndexCache[fname];
    const arr = [];
    (norm.books || []).forEach((b, bi) => {
      (b.chapters || []).forEach((ch, ci) => {
        (ch || []).forEach((v, vi) => {
          const t = v && v.text ? v.text : '';
          arr.push({
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci + 1,
            verseKey: v?.key,
            text: t,
            low: t.toLowerCase()
          });
        });
      });
    });
    searchIndexCache[fname] = arr;
    return arr;
  }

  /* ---------------- populate dropdowns ---------------- */
  // First put NONE option in homeB, then add all files
  function populateVersionDropdowns() {
    // Clear and add NONE to B
    homeB.innerHTML = '';
    homeB.appendChild(new Option('NONE', ''));
    // Fill both A and B lists
    homeA.innerHTML = '<option value="">Version A</option>';
    // Note: homeB already has NONE as first option
    for (const f of FILES) {
      const label = f.replace('_bible.json', '').replace('.json', '').toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    }
  }

  populateVersionDropdowns();

  /* ---------------- tab switching ---------------- */
  function activateTab(name) {
    state.view = name;
    panes.home.style.display = (name === 'home') ? 'block' : 'none';
    panes.read.style.display = (name === 'read') ? 'block' : 'none';
    panes.search.style.display = (name === 'search') ? 'block' : 'none';

    Object.values(tabs).forEach(t => t.classList.remove('active'));
    tabs[name]?.classList.add('active');

    bottomItems.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'read') renderRead();
    if (name === 'search') { searchResults.innerHTML = ''; searchInfo.textContent = ''; }
  }

  Object.keys(tabs).forEach(k => tabs[k].addEventListener('click', () => activateTab(k)));
  bottomItems.forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));

  /* ---------------- home interactions ---------------- */
  homeA.addEventListener('change', async function () {
    if (!this.value) {
      state.versionA = null;
      saveVersions();
      showNotice('Choose Version A');
      return;
    }
    state.versionA = this.value;
    // enable B when A present
    homeB.disabled = false;
    await populateBooksA(state.versionA);
    saveVersions();
    showNotice(this.options[this.selectedIndex].text + ' loaded (A)');
  });

  // B change: allow empty -> none
  homeB.addEventListener('change', function () {
    if (!this.value) {
      state.versionB = null; // explicit single-version mode
      saveVersions();
      showNotice('Using only Version A');
      return;
    }
    state.versionB = this.value;
    saveVersions();
    showNotice(this.options[this.selectedIndex].text + ' loaded (B)');
  });

  async function populateBooksA(fname) {
    if (!fname) return;
    try {
      const n = await fetchAndNormalize(fname);
      homeBook.innerHTML = "<option value=''>Book</option>";
      n.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));
      homeChapter.innerHTML = "<option value=''>Chapter</option>";
      homeVerse.innerHTML = "<option value=''>Verse</option>";
    } catch (e) {
      showNotice('Failed to load ' + fname);
    }
  }

  homeBook.addEventListener('change', async function () {
    if (!state.versionA) return;
    const bi = Number(this.value || 0);
    const n = await fetchAndNormalize(state.versionA);
    const ccount = n.books[bi]?.chapters?.length || 0;
    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    for (let i = 1; i <= ccount; i++) homeChapter.appendChild(new Option(i, i - 1));
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener('change', async function () {
    if (!state.versionA) return;
    const bi = Number(homeBook.value || 0);
    const ci = Number(this.value || 0);
    const n = await fetchAndNormalize(state.versionA);
    const vcount = n.books[bi]?.chapters?.[ci]?.length || 0;
    homeVerse.innerHTML = "<option value=''>Verse</option>";
    for (let v = 1; v <= vcount; v++) homeVerse.appendChild(new Option(v, v - 1));
  });

  homeOpen.addEventListener('click', async function () {
    const a = homeA.value || state.versionA;
    let b = homeB.value;
    if (!a) { showNotice('Select Version A'); return; }
    if (!b || b.trim() === '') b = null;
    state.versionA = a;
    state.versionB = b;
    state.bookIndex = homeBook.value === '' ? 0 : Number(homeBook.value);
    state.chapterIndex = homeChapter.value === '' ? 0 : Number(homeChapter.value);
    const vi = homeVerse.value === '' ? null : Number(homeVerse.value);
    const rng = (homeRange.value || '').trim();
    if (rng) state.verseKey = rng;
    else if (vi !== null) state.verseKey = String(vi + 1);
    else state.verseKey = null;

    try {
      await fetchAndNormalize(state.versionA);
      if (state.versionB) await fetchAndNormalize(state.versionB);
    } catch (e) {
      showNotice('Failed to load versions');
      return;
    }
    saveVersions();
    activateTab('read');
    renderRead();
    updateUrl();
  });

  /* ---------------- render read ---------------- */
  async function renderRead() {
    if (!state.versionA) {
      readRef.textContent = 'Select Version A in HOME';
      readVerses.innerHTML = '';
      return;
    }
    try { await fetchAndNormalize(state.versionA); } catch (e) { readRef.textContent = 'Failed to load primary'; readVerses.innerHTML = ''; return; }
    if (state.versionB) {
      try { await fetchAndNormalize(state.versionB); } catch (e) { /* continue without B if fails */ }
    }

    const nA = normCache[state.versionA];
    if (!nA) { readRef.textContent = 'No data'; readVerses.innerHTML = ''; return; }

    if (state.bookIndex < 0) state.bookIndex = 0;
    if (state.bookIndex >= nA.books.length) state.bookIndex = 0;
    const bookA = nA.books[state.bookIndex];
    if (!bookA) { readRef.textContent = 'No book'; readVerses.innerHTML = ''; return; }
    if (state.chapterIndex < 0) state.chapterIndex = 0;
    if (state.chapterIndex >= bookA.chapters.length) state.chapterIndex = 0;

    const chapA = bookA.chapters[state.chapterIndex] || [];
    const chapB = (state.versionB && normCache[state.versionB] && normCache[state.versionB].books[state.bookIndex])
      ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex] || []
      : [];

    readRef.textContent = `${bookA.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = '';

    if (state.verseKey) {
      const exact = chapA.findIndex(v => v.key === state.verseKey);
      if (exact !== -1) { renderCombined(exact, chapA, chapB); showReadNav(true, exact); return; }
      const m = state.verseKey.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const s = Number(m[1]) - 1, e = Number(m[2]) - 1;
        const start = Math.max(0, Math.min(s, chapA.length - 1)), end = Math.max(start, Math.min(e, chapA.length - 1));
        for (let i = start; i <= end; i++) renderCombined(i, chapA, chapB);
        showReadNav(true, start); return;
      }
      if (/^\d+$/.test(state.verseKey)) {
        const idx = Math.max(0, Math.min(Number(state.verseKey) - 1, chapA.length - 1));
        renderCombined(idx, chapA, chapB);
        showReadNav(true, idx); return;
      }
      readVerses.innerHTML = '<div style="padding:12px;color:#666">Verse not found</div>'; showReadNav(false); return;
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for (let i = 0; i < maxLen; i++) renderCombined(i, chapA, chapB);
    showReadNav(false);
  }

  function renderCombined(idx, chapA, chapB) {
    const va = chapA[idx] || null;
    const vb = chapB[idx] || null;
    const key = va ? va.key : (vb ? vb.key : (idx + 1));
    const labelA = state.versionA ? state.versionA.replace('_bible.json', '').replace('.json', '').toUpperCase() : 'A';
    const labelB = state.versionB ? state.versionB.replace('_bible.json', '').replace('.json', '').toUpperCase() : null;

    const block = document.createElement('div');
    block.className = 'verse-block parallel';

    let inner = `<div class="verse-num">Verse ${esc(key)}</div>`;
    inner += `<div class="verse-label">${esc(labelA)}</div>`;
    inner += `<div class="verse-text">${esc(va ? va.text : '')}</div>`;

    // Only show B if a real version is selected
    if (state.versionB && String(state.versionB).trim() !== '') {
      inner += `<div class="verse-label">${esc(labelB)}</div>`;
      inner += `<div class="verse-secondary">${esc(vb ? vb.text : '')}</div>`;
    }

    block.innerHTML = inner;
    readVerses.appendChild(block);
  }

  /* ---------------- read navigation ---------------- */
  let currentVerseIndex = null;
  function showReadNav(show, idx = null) {
    readNav.style.display = show ? 'flex' : 'none';
    currentVerseIndex = (typeof idx === 'number') ? idx : null;
  }

  prevVerseBtn?.addEventListener('click', () => {
    if (currentVerseIndex === null) return;
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if (currentVerseIndex > 0) setVerseByIndex(currentVerseIndex - 1);
    else if (state.chapterIndex > 0) {
      state.chapterIndex--;
      const ch2 = n.books[state.bookIndex].chapters[state.chapterIndex];
      setVerseByIndex(ch2.length - 1);
    }
  });

  nextVerseBtn?.addEventListener('click', () => {
    if (currentVerseIndex === null) return;
    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];
    if (currentVerseIndex < ch.length - 1) setVerseByIndex(currentVerseIndex + 1);
    else if (state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) {
      state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl();
    }
  });

  function setVerseByIndex(idx) {
    const ch = normCache[state.versionA].books[state.bookIndex].chapters[state.chapterIndex];
    state.verseKey = ch[idx].key;
    renderRead(); updateUrl();
  }

  prevChapterBtn?.addEventListener('click', () => {
    if (state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl(); }
  });
  nextChapterBtn?.addEventListener('click', () => {
    const n = normCache[state.versionA];
    if (state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl(); }
  });

  /* ---------------- back to home ---------------- */
  backHomeBtn?.addEventListener('click', () => {
    activateTab('home');
    updateUrl();
  });

  /* ---------------- TTS (primary only) ---------------- */
  let ttsQueue = [];
  function buildTTS() {
    ttsQueue = [];
    if (!state.versionA) return;
    const n = normCache[state.versionA];
    if (!n) return;
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex] || [];
    if (state.verseKey) {
      const exact = ch.findIndex(v => v.key === state.verseKey);
      if (exact !== -1) { ttsQueue.push({ text: ch[exact].text, idx: exact }); return; }
      const m = state.verseKey.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { const s = Number(m[1]) - 1, e = Number(m[2]) - 1; for (let i = Math.max(0, s); i <= Math.min(e, ch.length - 1); i++) ttsQueue.push({ text: ch[i].text, idx: i }); return; }
      if (/^\d+$/.test(state.verseKey)) { const idx = Math.max(0, Math.min(Number(state.verseKey) - 1, ch.length - 1)); ttsQueue.push({ text: ch[idx].text, idx }); return; }
      return;
    }
    for (let i = 0; i < ch.length; i++) ttsQueue.push({ text: ch[i].text, idx: i });
  }

  function speakNext() {
    if (ttsQueue.length === 0) return;
    const item = ttsQueue.shift();
    if (!item || !item.text) return setTimeout(speakNext, 120);
    const blocks = document.querySelectorAll('.verse-block');
    blocks.forEach(b => b.classList.remove('active-verse'));
    if (blocks[item.idx]) { blocks[item.idx].classList.add('active-verse'); blocks[item.idx].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const u = new SpeechSynthesisUtterance(String(item.text));
    u.onend = () => setTimeout(speakNext, 120);
    u.onerror = () => setTimeout(speakNext, 180);
    speechSynthesis.speak(u);
  }

  playBtn?.addEventListener('click', () => { speechSynthesis.cancel(); buildTTS(); speakNext(); });
  pauseBtn?.addEventListener('click', () => { try { speechSynthesis.pause(); } catch (e) {} });
  resumeBtn?.addEventListener('click', () => { try { speechSynthesis.resume(); } catch (e) {} });
  stopBtn?.addEventListener('click', () => { try { speechSynthesis.cancel(); ttsQueue = []; } catch (e) {} });

  /* ---------------- search ---------------- */
  searchBox?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = (searchBox.value || '').trim().toLowerCase();
      if (!q) { searchResults.innerHTML = ''; searchInfo.textContent = ''; return; }
      doSearch(q);
    }
  });

  async function doSearch(q) {
    searchResults.innerHTML = ''; searchInfo.textContent = '';
    if (!state.versionA) { searchInfo.textContent = 'Choose Version A in HOME'; activateTab('home'); return; }
    try {
      await fetchAndNormalize(state.versionA);
      const idx = searchIndexCache[state.versionA] || buildSearchIndex(state.versionA, normCache[state.versionA]);
      const results = [];
      const max = 250;
      for (let i = 0; i < idx.length && results.length < max; i++) {
        if (idx[i].low.includes(q)) results.push(idx[i]);
      }
      searchInfo.textContent = `Found ${results.length}`;
      if (results.length === 0) { searchResults.innerHTML = '<div style="padding:8px;color:#666">No results</div>'; return; }
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(safe, 'ig');
      const frag = document.createDocumentFragment();
      results.forEach(r => {
        const div = document.createElement('div'); div.className = 'search-item';
        const snippet = esc(r.text).replace(re, m => `<span class="highlight">${m}</span>`);
        div.innerHTML = `<strong>${esc(r.book)} ${r.chapter}:${r.verseKey}</strong><div style="margin-top:6px">${snippet}</div><small style="display:block;margin-top:6px;color:#666">Click to open</small>`;
        div.addEventListener('click', async () => {
          state.bookIndex = r.bookIndex; state.chapterIndex = r.chapterIndex; state.verseKey = r.verseKey;
          activateTab('read'); await fetchAndNormalize(state.versionA); renderRead(); updateUrl();
        });
        frag.appendChild(div);
      });
      searchResults.appendChild(frag);
      activateTab('search');
    } catch (e) {
      showNotice('Search failed');
    }
  }

  /* ---------------- URL sync ---------------- */
  function updateUrl(replace = false) {
    const p = new URLSearchParams();
    if (state.versionA) p.set('versionA', state.versionA);
    if (state.versionB) p.set('versionB', state.versionB);
    p.set('bookIndex', String(state.bookIndex));
    p.set('chapter', String(state.chapterIndex + 1));
    if (state.verseKey) p.set('verse', state.verseKey);
    p.set('view', state.view || 'home');
    const url = location.pathname + '?' + p.toString();
    if (replace) history.replaceState({ ...state }, '', url);
    else history.pushState({ ...state }, '', url);
  }

  /* ---------------- bottom nav hide ---------------- */
  let lastScroll = window.scrollY || 0;
  let navHidden = false;
  function handleScrollHide() {
    const y = window.scrollY || 0;
    const delta = y - lastScroll;
    lastScroll = y;
    if (y < 60) { bottomNav.classList.remove('hidden'); navHidden = false; return; }
    if (delta > 12 && !navHidden) { bottomNav.classList.add('hidden'); navHidden = true; }
    else if (delta < -12 && navHidden) { bottomNav.classList.remove('hidden'); navHidden = false; }
  }
  window.addEventListener('scroll', handleScrollHide, { passive: true });

  /* ---------------- initial load + popstate ---------------- */
  async function initialLoad() {
    populateVersionDropdowns();
    loadVersions();
    if (state.versionA) { homeA.value = state.versionA; await populateBooksA(state.versionA); }
    if (state.versionB) homeB.value = state.versionB || '';
    activateTab(state.view || 'home');
    if (state.view === 'read') renderRead();
  }
  await initialLoad();

  window.addEventListener('popstate', async () => {
    const p = new URLSearchParams(location.search);
    const va = p.get('versionA'); const vb = p.get('versionB');
    if (va) state.versionA = va; else state.versionA = null;
    if (vb) state.versionB = vb; else state.versionB = null;
    state.bookIndex = Number(p.get('bookIndex') || 0);
    state.chapterIndex = p.get('chapter') ? Number(p.get('chapter')) - 1 : state.chapterIndex;
    state.verseKey = p.get('verse') || null;
    state.view = p.get('view') || state.view;
    if (state.versionA) { await fetchAndNormalize(state.versionA); await populateBooksA(state.versionA); homeA.value = state.versionA; }
    homeB.value = state.versionB || '';
    activateTab(state.view || 'home');
    if (state.view === 'read') renderRead();
  });

  /* ---------------- swipe & mouse drag & keys ---------------- */
  let touchStartX = 0;
  document.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].clientX, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 60) return;
    const n = normCache[state.versionA];
    if (!n) return;
    if (dx < 0) {
      if (state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl(); }
    } else {
      if (state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl(); }
    }
  }, { passive: true });

  let mouseDown = false, startX = 0, curX = 0;
  readVerses?.addEventListener('mousedown', e => { mouseDown = true; startX = e.clientX; });
  document.addEventListener('mousemove', e => { if (!mouseDown) return; curX = e.clientX; });
  document.addEventListener('mouseup', e => {
    if (!mouseDown) return; mouseDown = false;
    const dx = (curX || e.clientX) - startX;
    if (Math.abs(dx) > 100) {
      const n = normCache[state.versionA];
      if (!n) return;
      if (dx < 0) {
        if (state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl(); }
      } else {
        if (state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl(); }
      }
    }
    startX = curX = 0;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') {
      const n = normCache[state.versionA];
      if (n && state.chapterIndex + 1 < n.books[state.bookIndex].chapters.length) { state.chapterIndex++; state.verseKey = null; renderRead(); updateUrl(); }
    } else if (e.key === 'ArrowLeft') {
      if (state.chapterIndex > 0) { state.chapterIndex--; state.verseKey = null; renderRead(); updateUrl(); }
    }
  });

})(); // end IIFE
