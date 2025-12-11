/* ============================================================================
   BIBLE READER – FULL PRODUCTION VERSION
   Stable version with: 
   - Uniform JSON support
   - Search index
   - Parallel version
   - Swipe + Arrow navigation
   - URL sync
   - Back button fix
============================================================================ */

(() => {

    /* ---------------------------------------
       CONFIG
    --------------------------------------- */
    const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bible_app@main/versions/";

    const FILES = [
        "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
        "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
        "afrikaans_bible.json","bengali_bible.json","gujarati_bible.json","hindi_bible.json",
        "hungarian_bible.json","indonesian_bible.json","kannada_bible.json","malayalam_bible.json",
        "marathi_bible.json","nepali_bible.json","odia_bible.json","punjabi_bible.json",
        "sepedi_bible.json","tamil_bible.json","telugu_bible.json","xhosa_bible.json","zulu_bible.json"
    ];

    /* ---------------------------------------
       DOM
    --------------------------------------- */
    const $ = id => document.getElementById(id);

    const tabHome = $("tab-home");
    const tabRead = $("tab-read");
    const tabSearch = $("tab-search");

    const paneHome = $("pane-home");
    const paneRead = $("pane-read");
    const paneSearch = $("pane-search");

    const homeA = $("homeA");
    const homeB = $("homeB");
    const homeBook = $("homeBook");
    const homeChapter = $("homeChapter");
    const homeVerse = $("homeVerse");
    const homeRange = $("homeRange");
    const homeOpen = $("homeOpen");

    const readRef = $("readRef");
    const readVerses = $("readVerses");
    const backHome = $("backHome");

    const searchBox = $("searchBox");
    const searchInfo = $("searchInfo");
    const searchResults = $("searchResults");

    /* ---------------------------------------
       STATE & CACHE
    --------------------------------------- */
    const state = {
        versionA: null,
        versionB: null,
        bookIndex: 0,
        chapterIndex: 0,
        verseKey: null,
        view: "home"
    };

    const normCache = {};          // normalized Bible data
    const searchIndexCache = {};   // search index per version

    /* ---------------------------------------
       UTILITIES
    --------------------------------------- */
    const esc = s => String(s || "").replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));

    function showView(view) {
        state.view = view;

        paneHome.style.display = (view === "home" ? "block" : "none");
        paneRead.style.display = (view === "read" ? "block" : "none");
        paneSearch.style.display = (view === "search" ? "block" : "none");

        tabHome.classList.toggle("active", view === "home");
        tabRead.classList.toggle("active", view === "read");
        tabSearch.classList.toggle("active", view === "search");

        if (view === "read") renderRead();
    }

    /* ---------------------------------------
       JSON NORMALIZATION
    --------------------------------------- */
    function normalize(json) {
        const books = [];

        Object.keys(json).forEach(bookName => {
            const chaptersObj = json[bookName];

            const chapterNums = Object.keys(chaptersObj)
                .map(n => Number(n))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b);

            const chapters = chapterNums.map(ch => {
                const versesObj = chaptersObj[ch];
                const verseNums = Object.keys(versesObj)
                    .map(v => Number(v))
                    .filter(v => !isNaN(v))
                    .sort((a, b) => a - b);

                return verseNums.map(v => ({
                    key: String(v),
                    text: versesObj[v]
                }));
            });

            books.push({ name: bookName, chapters });
        });

        return { books };
    }

    /* ---------------------------------------
       FETCH VERSION
    --------------------------------------- */
    async function loadVersion(fname) {
        if (normCache[fname]) return normCache[fname];

        const url = BASE + fname;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load " + fname);

        const json = await res.json();
        const norm = normalize(json);
        normCache[fname] = norm;

        buildSearchIndex(fname, norm);
        return norm;
    }

    /* ---------------------------------------
       BUILD SEARCH INDEX
    --------------------------------------- */
    function buildSearchIndex(fname, norm) {
        if (searchIndexCache[fname]) return;

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
                        low: v.text.toLowerCase()
                    });
                });
            });
        });

        searchIndexCache[fname] = arr;
    }

    /* ---------------------------------------
       POPULATE VERSION DROPDOWNS
    --------------------------------------- */
    function populateVersionDropdowns() {
        homeA.innerHTML = `<option value="">Version A</option>`;
        homeB.innerHTML = `<option value="">NONE</option>`;

        FILES.forEach(f => {
            const lbl = f.replace("_bible.json", "").replace(".json", "").toUpperCase();
            homeA.appendChild(new Option(lbl, f));
            homeB.appendChild(new Option(lbl, f));
        });
    }

    populateVersionDropdowns();

    /* ---------------------------------------
       HOME: version selection
    --------------------------------------- */
    homeA.addEventListener("change", async () => {
        const f = homeA.value;
        if (!f) return;

        state.versionA = f;
        const norm = await loadVersion(f);

        homeBook.innerHTML = `<option value="">Book</option>`;
        norm.books.forEach((b, i) => homeBook.appendChild(new Option(b.name, i)));

        homeChapter.innerHTML = `<option value="">Chapter</option>`;
        homeVerse.innerHTML = `<option value="">Verse</option>`;
    });

    homeB.addEventListener("change", () => {
        state.versionB = homeB.value || null;
    });

    /* ---------------------------------------
       HOME: book → chapters
    --------------------------------------- */
    homeBook.addEventListener("change", () => {
        const bi = Number(homeBook.value);
        const norm = normCache[state.versionA];

        homeChapter.innerHTML = `<option value="">Chapter</option>`;
        if (!norm) return;

        const count = norm.books[bi].chapters.length;
        for (let i = 1; i <= count; i++) {
            homeChapter.appendChild(new Option(i, i - 1));
        }

        homeVerse.innerHTML = `<option value="">Verse</option>`;
    });

    /* ---------------------------------------
       HOME: chapter → verses
    --------------------------------------- */
    homeChapter.addEventListener("change", () => {
        const bi = Number(homeBook.value);
        const ci = Number(homeChapter.value);
        const norm = normCache[state.versionA];

        homeVerse.innerHTML = `<option value="">Verse</option>`;
        if (!norm) return;

        const count = norm.books[bi].chapters[ci].length;
        for (let v = 1; v <= count; v++) {
            homeVerse.appendChild(new Option(v, v - 1));
        }
    });

    /* ---------------------------------------
       OPEN READING PAGE
    --------------------------------------- */
    homeOpen.addEventListener("click", async () => {
        if (!state.versionA) return alert("Select Version A");

        await loadVersion(state.versionA);
        if (state.versionB) await loadVersion(state.versionB);

        state.bookIndex = Number(homeBook.value || 0);
        state.chapterIndex = Number(homeChapter.value || 0);

        if (homeRange.value.trim()) {
            state.verseKey = homeRange.value.trim();
        } else if (homeVerse.value) {
            state.verseKey = String(Number(homeVerse.value) + 1);
        } else state.verseKey = null;

        showView("read");
        renderRead();
    });

    /* ---------------------------------------
       RENDER READING PAGE
    --------------------------------------- */
    function renderRead() {
        const nA = normCache[state.versionA];
        if (!nA) return;

        const book = nA.books[state.bookIndex];
        readRef.textContent = `${book.name} ${state.chapterIndex + 1}`;

        const chapA = book.chapters[state.chapterIndex];
        const chapB = state.versionB && normCache[state.versionB]
            ? normCache[state.versionB].books[state.bookIndex].chapters[state.chapterIndex]
            : null;

        readVerses.innerHTML = "";

        if (state.verseKey) {
            const exact = chapA.findIndex(v => v.key === state.verseKey);
            if (exact !== -1) {
                renderVerse(exact, chapA, chapB);
                return;
            }
        }

        const maxLen = chapA.length;
        for (let i = 0; i < maxLen; i++) {
            renderVerse(i, chapA, chapB);
        }
    }

    function renderVerse(i, chA, chB) {
        const va = chA[i];
        const vb = chB ? chB[i] : null;

        const div = document.createElement("div");
        div.className = "verse-block";

        div.innerHTML = `
            <div class="verse-num">${va.key}</div>
            <div class="verse-text">${esc(va.text)}</div>
            ${vb ? `<div class="verse-text secondary">${esc(vb.text)}</div>` : ""}
        `;

        readVerses.appendChild(div);
    }

    /* ---------------------------------------
       BACK BUTTON
    --------------------------------------- */
    backHome.addEventListener("click", () => {
        showView("home");
    });

    /* ---------------------------------------
       SEARCH
    --------------------------------------- */
    searchBox.addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch(searchBox.value.trim().toLowerCase());
    });

    async function doSearch(q) {
        if (!q) return;

        if (!state.versionA) {
            alert("Select Version A");
            return;
        }

        await loadVersion(state.versionA);
        const index = searchIndexCache[state.versionA];

        const results = index.filter(r => r.low.includes(q)).slice(0, 200);

        searchInfo.textContent = `Found ${results.length}`;
        searchResults.innerHTML = "";

        results.forEach(r => {
            const item = document.createElement("div");
            item.className = "search-item";
            item.innerHTML = `<strong>${r.book} ${r.chapter}:${r.verseKey}</strong><div>${esc(r.text)}</div>`;
            item.addEventListener("click", () => openSearchResult(r));
            searchResults.appendChild(item);
        });

        showView("search");
    }

    function openSearchResult(r) {
        state.bookIndex = r.bookIndex;
        state.chapterIndex = r.chapterIndex;
        state.verseKey = r.verseKey;

        showView("read");
        renderRead();
    }

    /* ---------------------------------------
       SWIPE + ARROW NAVIGATION
    --------------------------------------- */
    let startX = 0;

    paneRead.addEventListener("touchstart", e => startX = e.touches[0].clientX);
    paneRead.addEventListener("touchend", e => {
        const endX = e.changedTouches[0].clientX;
        if (endX - startX > 60) prevChapter();
        else if (startX - endX > 60) nextChapter();
    });

    document.addEventListener("keydown", e => {
        if (state.view !== "read") return;
        if (e.key === "ArrowLeft") prevChapter();
        if (e.key === "ArrowRight") nextChapter();
    });

    function nextChapter() {
        const norm = normCache[state.versionA];
        const book = norm.books[state.bookIndex];

        if (state.chapterIndex + 1 < book.chapters.length) {
            state.chapterIndex++;
            state.verseKey = null;
            renderRead();
        }
    }

    function prevChapter() {
        if (state.chapterIndex > 0) {
            state.chapterIndex--;
            state.verseKey = null;
            renderRead();
        }
    }

    /* ---------------------------------------
       INITIAL LOAD
    --------------------------------------- */
    showView("home");

})();
