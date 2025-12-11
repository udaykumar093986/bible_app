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

  let normCache = {};
  let searchIndexCache = {};

  const state = {
    versionA: null,
    versionB: null,
    bookIndex: 0,
    chapterIndex: 0,
    verseKey: null,
    view: "home",
  };

  function showNotice(msg, ms = 1400) {
    notice.textContent = msg;
    notice.style.display = "block";
    setTimeout(() => (notice.style.display = "none"), ms);
  }

  function esc(s) {
    return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function normalizeUniform(json) {
    const books = [];
    for (const bookName of Object.keys(json)) {
      const chaptersObj = json[bookName] || {};
      const chapterKeys = Object.keys(chaptersObj)
        .map(Number)
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)
        .map(String);

      const chapters = chapterKeys.map((ck) => {
        const versesObj = chaptersObj[ck] || {};
        const verseKeys = Object.keys(versesObj)
          .map(Number)
          .filter((n) => !isNaN(n))
          .sort((a, b) => a - b)
          .map(String);

        return verseKeys.map((vk) => ({
          key: vk,
          text: versesObj[vk] || "",
        }));
      });

      books.push({ name: bookName, chapters });
    }
    return { books };
  }

  async function fetchAndNormalize(fname) {
    if (!fname) return null;
    if (normCache[fname]) return normCache[fname];

    const url = BASE + fname;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("File not found:", url);
      showNotice("Failed to load " + fname);
      return null;
    }

    const json = await res.json();
    const norm = normalizeUniform(json);
    normCache[fname] = norm;

    buildSearchIndex(fname, norm);
    return norm;
  }

  function buildSearchIndex(fname, norm) {
    if (!norm || !norm.books) return;

    const arr = [];
    norm.books.forEach((b, bi) => {
      b.chapters.forEach((ch, ci) => {
        ch.forEach((v, vi) => {
          arr.push({
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.name,
            chapter: ci + 1,
            verseKey: v.key,
            text: v.text,
            low: v.text.toLowerCase(),
          });
        });
      });
    });

    searchIndexCache[fname] = arr;
  }

  function populateVersions() {
    homeA.innerHTML = "<option value=''>Version A</option>";
    homeB.innerHTML = "<option value=''>NONE</option>";
    FILES.forEach((f) => {
      const label = f.replace("_bible.json", "").toUpperCase();
      homeA.appendChild(new Option(label, f));
      homeB.appendChild(new Option(label, f));
    });
  }
  populateVersions();

  function activateTab(name) {
    state.view = name;

    panes.home.style.display = name === "home" ? "block" : "none";
    panes.read.style.display = name === "read" ? "block" : "none";
    panes.search.style.display = name === "search" ? "block" : "none";

    Object.values(tabs).forEach((t) => t.classList.remove("active"));
    tabs[name].classList.add("active");

    bottomItems.forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === name)
    );

    if (name === "read") renderRead();
  }

  homeA.addEventListener("change", async function () {
    state.versionA = this.value;
    await fetchAndNormalize(state.versionA);
    populateBooks();
  });

  homeB.addEventListener("change", async function () {
    state.versionB = this.value || null;
    if (state.versionB) await fetchAndNormalize(state.versionB);
  });

  function populateBooks() {
    const n = normCache[state.versionA];
    if (!n) return;

    homeBook.innerHTML = "<option value=''>Book</option>";
    n.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    homeVerse.innerHTML = "<option value=''>Verse</option>";
  }

  homeBook.addEventListener("change", function () {
    const bi = Number(this.value);
    const n = normCache[state.versionA];

    homeChapter.innerHTML = "<option value=''>Chapter</option>";
    const count = n.books[bi].chapters.length;
    for (let i = 1; i <= count; i++) homeChapter.appendChild(new Option(i, i - 1));

    homeVerse.innerHTML = "<option value=''>Verse</option>";
  });

  homeChapter.addEventListener("change", function () {
    const bi = Number(homeBook.value);
    const ci = Number(this.value);
    const n = normCache[state.versionA];

    homeVerse.innerHTML = "<option value=''>Verse</option>";
    const count = n.books[bi].chapters[ci].length;
    for (let v = 1; v <= count; v++) homeVerse.appendChild(new Option(v, v - 1));
  });

  homeOpen.addEventListener("click", async () => {
    if (!state.versionA) return showNotice("Select Version A");

    await fetchAndNormalize(state.versionA);
    if (state.versionB) await fetchAndNormalize(state.versionB);

    state.bookIndex = Number(homeBook.value) || 0;
    state.chapterIndex = Number(homeChapter.value) || 0;

    state.verseKey = homeRange.value.trim() || null;
    if (!state.verseKey && homeVerse.value)
      state.verseKey = String(Number(homeVerse.value) + 1);

    activateTab("read");
  });

  function renderRead() {
    const nA = normCache[state.versionA];
    if (!nA) return;

    const book = nA.books[state.bookIndex];
    const chapA = book.chapters[state.chapterIndex];

    const chapB =
      state.versionB &&
      normCache[state.versionB] &&
      normCache[state.versionB].books[state.bookIndex]
        ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex]
        : [];

    readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;
    readVerses.innerHTML = "";

    if (state.verseKey) {
      const exact = chapA.findIndex((v) => v.key === state.verseKey);
      if (exact >= 0) {
        renderVerse(exact, chapA, chapB);
        return;
      }
    }

    const maxLen = Math.max(chapA.length, chapB.length);
    for (let i = 0; i < maxLen; i++) renderVerse(i, chapA, chapB);
  }

  function renderVerse(i, chapA, chapB) {
    const va = chapA[i];
    const vb = chapB[i];

    const labelA = state.versionA.replace("_bible.json", "").toUpperCase();
    const labelB = state.versionB
      ? state.versionB.replace("_bible.json", "").toUpperCase()
      : null;

    const div = document.createElement("div");
    div.className = "verse-block";

    div.innerHTML = `
      <div class="verse-num">Verse ${va?.key || vb?.key}</div>
      <div class="verse-label">${labelA}</div>
      <div class="verse-text">${esc(va?.text || "")}</div>
      ${
        state.versionB
          ? `
        <div class="verse-label">${labelB}</div>
        <div class="verse-secondary">${esc(vb?.text || "")}</div>
      `
          : ""
      }
    `;

    readVerses.appendChild(div);
  }

  prevChapterBtn.addEventListener("click", () => {
    if (state.chapterIndex > 0) {
      state.chapterIndex--;
      renderRead();
    }
  });

  nextChapterBtn.addEventListener("click", () => {
    const n = normCache[state.versionA];
    const count = n.books[state.bookIndex].chapters.length;
    if (state.chapterIndex + 1 < count) {
      state.chapterIndex++;
      renderRead();
    }
  });

  backHomeBtn.addEventListener("click", () => activateTab("home"));

  // Keyboard Navigation
  document.addEventListener("keydown", (e) => {
    if (state.view !== "read") return;
    if (e.key === "ArrowRight") nextChapterBtn.click();
    if (e.key === "ArrowLeft") prevChapterBtn.click();
  });

  // Swipe Navigation
  let startX = 0;
  readVerses.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  readVerses.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 60) return;
    if (dx < 0) nextChapterBtn.click();
    else prevChapterBtn.click();
  });

  // TTS
  let ttsQueue = [];

  function buildTTS() {
    ttsQueue = [];

    const n = normCache[state.versionA];
    const ch = n.books[state.bookIndex].chapters[state.chapterIndex];

    ch.forEach((v) => ttsQueue.push(v.text));
  }

  playBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    buildTTS();
    speakNext();
  });

  function speakNext() {
    if (!ttsQueue.length) return;
    const text = ttsQueue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = speakNext;
    speechSynthesis.speak(u);
  }

  pauseBtn.addEventListener("click", () => speechSynthesis.pause());
  resumeBtn.addEventListener("click", () => speechSynthesis.resume());
  stopBtn.addEventListener("click", () => speechSynthesis.cancel());

  // SEARCH
  searchBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(searchBox.value.toLowerCase());
  });

  async function performSearch(q) {
    if (!state.versionA) return showNotice("Select Version A");

    await fetchAndNormalize(state.versionA);

    const index = searchIndexCache[state.versionA];
    if (!index) return;

    const results = index.filter((v) => v.low.includes(q)).slice(0, 200);

    searchInfo.textContent = `Found ${results.length}`;
    searchResults.innerHTML = "";

    results.forEach((r) => {
      const div = document.createElement("div");
      div.className = "search-item";

      div.innerHTML = `
        <strong>${r.book} ${r.chapter}:${r.verseKey}</strong>
        <div>${esc(r.text)}</div>
      `;

      div.addEventListener("click", () => {
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;
        activateTab("read");
      });

      searchResults.appendChild(div);
    });

    activateTab("search");
  }

  // Startup
  activateTab("home");
})();
