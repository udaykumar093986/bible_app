// =========================================================
// Bible Reader SPA – Single Version or Dual Version Mode
// =========================================================

const BASE = "https://cdn.jsdelivr.net/gh/udaykumar093986/bibles@main/";
const FILES = [
  "AMP_bible.json","CSB_bible.json","ESV_bible.json","KJV_bible.json",
  "NIV_bible.json","NKJV_bible.json","NLT_bible.json",
  "hindi_bible.json","telugu_bible.json","tamil_bible.json","kannada_bible.json"
];

const versionA = document.getElementById("versionA");
const versionB = document.getElementById("versionB");
const homeBook = document.getElementById("homeBook");
const homeChapter = document.getElementById("homeChapter");
const homeVerse = document.getElementById("homeVerse");
const homeRange = document.getElementById("homeRange");
const homeOpen = document.getElementById("homeOpen");

const readRef = document.getElementById("readRef");
const readVerses = document.getElementById("readVerses");

const tabs = document.querySelectorAll(".tab");
const panes = document.querySelectorAll(".pane");
const bottomItems = document.querySelectorAll(".bottom-item");

const searchBox = document.getElementById("searchBox");
const searchInfo = document.getElementById("searchInfo");
const searchResults = document.getElementById("searchResults");

document.getElementById("backHome").onclick = () => activateTab("home");

let cache = {};
let state = {
  A: null,
  B: null,
  book: 0,
  chapter: 0,
  verseKey: null,
  mode: "single" // "single" or "dual"
};

// ---------------------------------------------------------
// Load version dropdowns
// ---------------------------------------------------------
FILES.forEach(f => {
  const label = f.replace("_bible.json", "").toUpperCase();

  versionA.appendChild(new Option(label, f));
  versionB.appendChild(new Option(label, f));
});

// ---------------------------------------------------------
// Fetch Bible JSON
// ---------------------------------------------------------
async function loadVersion(file) {
  if (!file) return null;
  if (cache[file]) return cache[file];

  const res = await fetch(BASE + file);
  cache[file] = await res.json();
  return cache[file];
}

// ---------------------------------------------------------
// Populate books and chapters
// ---------------------------------------------------------
versionA.onchange = async () => {
  state.A = versionA.value || null;
  if (!state.A) return;
  const data = await loadVersion(state.A);

  homeBook.innerHTML = "<option value=''>Book</option>";
  data.books.forEach((b, i) => homeBook.appendChild(new Option(b.book_name || b.name, i)));

  versionB.value = "";
  state.B = null;
  state.mode = "single";
};

versionB.onchange = () => {
  state.B = versionB.value || null;
  state.mode = state.B ? "dual" : "single";
};

homeBook.onchange = async () => {
  const data = await loadVersion(state.A);
  const chapters = data.books[homeBook.value].chapters.length;

  homeChapter.innerHTML = "<option value=''>Chapter</option>";
  for (let i = 1; i <= chapters; i++) {
    homeChapter.appendChild(new Option(i, i - 1));
  }
};

homeChapter.onchange = async () => {
  const data = await loadVersion(state.A);
  const book = data.books[homeBook.value];
  const verses = book.chapters[homeChapter.value].length;

  homeVerse.innerHTML = "<option value=''>Verse</option>";
  for (let i = 1; i <= verses; i++) {
    homeVerse.appendChild(new Option(i, i));
  }
};

// ---------------------------------------------------------
// Render Reader Mode
// ---------------------------------------------------------
async function renderReader() {
  const A = state.A;
  const B = state.B;

  const dataA = await loadVersion(A);
  const bookA = dataA.books[state.book];
  const chapterA = bookA.chapters[state.chapter];

  readRef.textContent = `${bookA.book_name || bookA.name} ${state.chapter + 1}`;
  readVerses.innerHTML = "";

  let firstIndex = state.verseKey ? Number(state.verseKey) - 1 : 0;
  let lastIndex = firstIndex;

  const rangeMatch = (state.verseKey || "").match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    firstIndex = Number(rangeMatch[1]) - 1;
    lastIndex = Number(rangeMatch[2]) - 1;
  }

  for (let i = firstIndex; i <= lastIndex; i++) {
    const block = document.createElement("div");
    block.className = "verse-block";

    const va = chapterA[i]?.text || "";
    const key = i + 1;

    block.innerHTML = `
      <div class="verse-num">Verse ${key}</div>
      <div class="verse-text">${va}</div>
    `;

    if (state.mode === "dual" && B) {
      const dataB = await loadVersion(B);
      const bookB = dataB.books[state.book];
      const chapterB = bookB.chapters[state.chapter];

      const vb = chapterB[i]?.text || "";

      block.innerHTML += `
        <div class="verse-label">${B.replace("_bible.json","")}</div>
        <div class="verse-secondary">${vb}</div>
      `;
    }

    readVerses.appendChild(block);
  }
}

// ---------------------------------------------------------
// OPEN READER
// ---------------------------------------------------------
homeOpen.onclick = async () => {
  if (!state.A) {
    alert("Please select Version A");
    return;
  }

  state.book = Number(homeBook.value || 0);
  state.chapter = Number(homeChapter.value || 0);
  state.verseKey = homeRange.value || (homeVerse.value || null);

  activateTab("read");
  renderReader();
};

// ---------------------------------------------------------
// SEARCH
// ---------------------------------------------------------
searchBox.addEventListener("keydown", async e => {
  if (e.key !== "Enter") return;

  if (!state.A) {
    searchInfo.textContent = "Select Version A first";
    return;
  }

  const q = searchBox.value.trim();
  if (!q) return;

  const data = await loadVersion(state.A);

  searchResults.innerHTML = "";
  let results = [];
  const max = 200;

  data.books.forEach((b, bi) => {
    b.chapters.forEach((chap, ci) => {
      chap.forEach((v, vi) => {
        if (v.text.toLowerCase().includes(q.toLowerCase())) {
          results.push({
            bookIndex: bi,
            chapterIndex: ci,
            verseIndex: vi,
            book: b.book_name || b.name,
            verseKey: vi + 1,
            text: v.text
          });
        }
      });
    });
  });

  searchInfo.textContent = `Found ${results.length}`;
  results = results.slice(0, max);

  results.forEach(r => {
    const item = document.createElement("div");
    item.className = "search-item";
    item.innerHTML = `<b>${r.book} ${r.chapterIndex + 1}:${r.verseKey}</b><br>${r.text}`;

    item.onclick = () => {
      state.book = r.bookIndex;
      state.chapter = r.chapterIndex;
      state.verseKey = r.verseKey;
      activateTab("read");
      renderReader();
    };

    searchResults.appendChild(item);
  });
});

// ---------------------------------------------------------
// TAB SYSTEM
// ---------------------------------------------------------
function activateTab(id) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  bottomItems.forEach(b => b.classList.toggle("active", b.dataset.tab === id));

  panes.forEach(p => {
    p.style.display = p.id === "pane-" + id ? "block" : "none";
  });
}

// Bottom Nav
bottomItems.forEach(b => {
  b.onclick = () => activateTab(b.dataset.tab);
});

tabs.forEach(t => {
  t.onclick = () => activateTab(t.dataset.tab);
});
