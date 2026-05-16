const state = {
  data: null,
  query: "",
  theme: "",
  audience: "",
  sort: "date-desc",
  colorTheme: "light",
  tagCounts: new Map(),
  expandedMatches: new Set(),
};

const els = {
  themeToggle: document.querySelector("#themeToggle"),
  videoCount: document.querySelector("#videoCount"),
  searchInput: document.querySelector("#searchInput"),
  themeFilter: document.querySelector("#themeFilter"),
  audienceFilter: document.querySelector("#audienceFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  searchResults: document.querySelector("#searchResults"),
  matchList: document.querySelector("#matchList"),
  resultCount: document.querySelector("#resultCount"),
  videoGrid: document.querySelector("#videoGrid"),
  termMap: document.querySelector("#termMap"),
};

const themeStorageKey = "missional-ai-video-guide-theme";

const stopwords = new Set([
  "about", "after", "again", "also", "because", "being", "from", "have",
  "into", "just", "like", "more", "most", "only", "that", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "very",
  "what", "when", "where", "which", "while", "with", "would", "your",
]);

function storedTheme() {
  try {
    const value = localStorage.getItem(themeStorageKey);
    if (value === "dark" || value === "light") return value;
  } catch {
    // Keep the page usable when localStorage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyColorTheme(theme) {
  state.colorTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.colorTheme;
  els.themeToggle?.setAttribute("aria-pressed", String(state.colorTheme === "dark"));
  els.themeToggle?.setAttribute("aria-label", `Switch to ${state.colorTheme === "dark" ? "light" : "dark"} mode`);
  const label = els.themeToggle?.querySelector(".theme-toggle__label");
  const icon = els.themeToggle?.querySelector(".theme-toggle__icon");
  if (label) label.textContent = state.colorTheme === "dark" ? "Light mode" : "Dark mode";
  if (icon) icon.textContent = state.colorTheme === "dark" ? "L" : "D";
}

function setColorTheme(theme) {
  applyColorTheme(theme);
  try {
    localStorage.setItem(themeStorageKey, state.colorTheme);
  } catch {
    // Persistence is optional.
  }
}

function tokenize(value) {
  return (value || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{2,}/g)?.map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 4 && !stopwords.has(token)) || [];
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function secondsLabel(seconds) {
  const total = Number(seconds) || 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function watchUrl(video, seconds = 0) {
  return `${video.url}&t=${Math.max(0, Number(seconds) || 0)}s`;
}

function tagColor(tag) {
  let hash = 0;
  for (const char of tag) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  if (state.colorTheme === "dark") {
    return `--tag-bg: hsl(${hue} 36% 22%); --tag-ink: hsl(${hue} 60% 86%); --tag-border: hsl(${hue} 32% 38%)`;
  }
  return `--tag-bg: hsl(${hue} 55% 92%); --tag-ink: hsl(${hue} 48% 24%); --tag-border: hsl(${hue} 42% 78%)`;
}

function textScore(video, tokens) {
  if (!tokens.length) return 0;
  const haystack = [
    video.title,
    video.speaker,
    video.summary,
    video.whyWatch,
    video.recommendedFor,
    ...(video.tags || []),
    ...(video.topTerms || []),
  ].join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 4 : 0), 0);
}

function captionMatches(tokens) {
  if (!tokens.length) return [];
  const index = state.data.subtitleTokenIndex || {};
  const videosById = new Map(state.data.videos.map((video) => [video.id, video]));
  const counts = new Map();

  for (const token of tokens) {
    const indexTerms = Object.keys(index).filter((term) => (
      term === token ||
      term.startsWith(token) ||
      token.startsWith(term)
    )).slice(0, 20);
    for (const term of indexTerms) for (const hit of index[term] || []) {
      const [videoId, seconds] = hit;
      const key = `${videoId}:${seconds}`;
      const current = counts.get(key) || { videoId, seconds, terms: new Set(), score: 0 };
      current.terms.add(term);
      current.score += 1;
      counts.set(key, current);
    }
  }

  return [...counts.values()]
    .filter((item) => videosById.has(item.videoId))
    .sort((a, b) => b.score - a.score || a.seconds - b.seconds)
    .slice(0, 24)
    .map((item) => ({ ...item, video: videosById.get(item.videoId), terms: [...item.terms] }));
}

function populateFilters() {
  const themes = new Set();
  const audiences = new Set();
  for (const video of state.data.videos) {
    (video.tags || []).forEach((tag) => {
      themes.add(tag);
      state.tagCounts.set(tag, (state.tagCounts.get(tag) || 0) + 1);
    });
    audiences.add(video.recommendedFor);
  }
  for (const theme of [...themes].sort()) {
    const count = state.tagCounts.get(theme) || 0;
    els.themeFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(theme)}">${escapeHtml(theme)} (${count})</option>`);
  }
  for (const audience of [...audiences].sort()) {
    els.audienceFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(audience)}">${escapeHtml(audience)}</option>`);
  }
}

function renderMatches(tokens) {
  const matches = captionMatches(tokens);
  els.searchResults.hidden = tokens.length === 0;
  if (!tokens.length) {
    els.matchList.innerHTML = "";
    return;
  }
  if (!matches.length) {
    els.matchList.innerHTML = `<p>No caption timestamp matches found. Try a broader term.</p>`;
    return;
  }
  els.matchList.innerHTML = matches.map((match) => `
    <article class="match-item" data-match-key="${escapeHtml(`${match.videoId}:${match.seconds}`)}">
      <button class="match-title" type="button" aria-expanded="${state.expandedMatches.has(`${match.videoId}:${match.seconds}`) ? "true" : "false"}">
        <span>
          <strong>${escapeHtml(match.video.title)}</strong>
          <small>${escapeHtml(match.terms.join(", "))} found near ${secondsLabel(match.seconds)}</small>
        </span>
      </button>
      <a class="button" href="${watchUrl(match.video, match.seconds)}" target="_blank" rel="noopener">Watch ${secondsLabel(match.seconds)}</a>
      <div class="match-detail" ${state.expandedMatches.has(`${match.videoId}:${match.seconds}`) ? "" : "hidden"}>
        <div class="speaker">${escapeHtml(match.video.speaker)}</div>
        <div class="tag-row">${(match.video.tags || []).map((tag) => {
          const count = state.tagCounts.get(tag) || 0;
          return `<button class="tag" type="button" data-tag="${escapeHtml(tag)}" style="${tagColor(tag)}">${escapeHtml(tag)} <span>${count}</span></button>`;
        }).join("")}</div>
        <p class="summary">${escapeHtml(match.video.summary)}</p>
        <div class="why"><strong>Why watch:</strong> ${escapeHtml(match.video.whyWatch)}</div>
        <p class="terms"><strong>Recommended for:</strong> ${escapeHtml(match.video.recommendedFor)}</p>
        <p class="terms"><strong>Search terms:</strong> ${escapeHtml((match.video.topTerms || []).join(", "))}</p>
      </div>
    </article>
  `).join("");
}

function renderVideos() {
  const tokens = tokenize(state.query);
  const captionScoreByVideo = new Map();
  for (const match of captionMatches(tokens)) {
    captionScoreByVideo.set(match.videoId, (captionScoreByVideo.get(match.videoId) || 0) + match.score);
  }

  let videos = state.data.videos.map((video) => ({
    ...video,
    matchScore: textScore(video, tokens) + (captionScoreByVideo.get(video.id) || 0),
  }));

  if (state.theme) {
    videos = videos.filter((video) => (video.tags || []).includes(state.theme));
  }
  if (state.audience) {
    videos = videos.filter((video) => video.recommendedFor === state.audience);
  }
  if (tokens.length) {
    videos = videos.filter((video) => video.matchScore > 0);
  }

  videos.sort((a, b) => {
    if (state.sort === "title-asc") return a.title.localeCompare(b.title);
    if (state.sort === "match-desc") return b.matchScore - a.matchScore || b.uploadDate.localeCompare(a.uploadDate);
    return b.uploadDate.localeCompare(a.uploadDate) || a.title.localeCompare(b.title);
  });

  els.resultCount.textContent = `${videos.length} of ${state.data.videoCount} videos shown`;
  els.videoGrid.innerHTML = videos.map((video) => `
    <article class="video-card">
      <div class="video-card__meta">
        <span>${escapeHtml(video.uploadDate)}</span>
        <span>${Math.round((video.durationSecondsApprox || 0) / 60)} min</span>
      </div>
      <h3>${escapeHtml(video.title)}</h3>
      <div class="speaker">${escapeHtml(video.speaker)}</div>
      <div class="tag-row">${(video.tags || []).map((tag) => {
        const count = state.tagCounts.get(tag) || 0;
        return `<button class="tag" type="button" data-tag="${escapeHtml(tag)}" style="${tagColor(tag)}">${escapeHtml(tag)} <span>${count}</span></button>`;
      }).join("")}</div>
      <p class="summary">${escapeHtml(video.summary)}</p>
      <div class="why"><strong>Why watch:</strong> ${escapeHtml(video.whyWatch)}</div>
      <details>
        <summary>Audience fit and search terms</summary>
        <p class="terms"><strong>Recommended for:</strong> ${escapeHtml(video.recommendedFor)}</p>
        <p class="terms"><strong>Search terms:</strong> ${escapeHtml((video.topTerms || []).join(", "))}</p>
      </details>
      <div class="card-actions">
        <a class="button" href="${video.url}" target="_blank" rel="noopener">Watch video</a>
        <a class="button secondary" href="https://www.youtube.com/results?search_query=${encodeURIComponent(video.title)}" target="_blank" rel="noopener">Search YouTube</a>
      </div>
    </article>
  `).join("");

  renderMatches(tokens);
}

function setSearch(query) {
  state.query = query || "";
  state.sort = "match-desc";
  els.searchInput.value = state.query;
  els.sortSelect.value = "match-desc";
  renderVideos();
  els.searchResults.hidden = false;
  els.searchResults.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTermMap() {
  const graph = state.data.termGraph || { nodes: [], links: [] };
  const themeNodes = graph.nodes.filter((node) => node.kind === "theme");
  const termNodes = graph.nodes.filter((node) => node.kind === "term");
  const maxCount = Math.max(1, ...graph.nodes.map((node) => Number(node.count) || 1));
  const minCount = Math.min(...graph.nodes.map((node) => Number(node.count) || 1));
  const scale = (count) => {
    const normalized = (Number(count) - minCount) / Math.max(1, maxCount - minCount);
    return 8 + Math.sqrt(Math.max(0, normalized)) * 18;
  };
  const placed = new Map();
  const width = 980;
  const height = 500;
  const topPad = 32;
  const bottomPad = 42;
  const themeGap = (height - topPad - bottomPad) / Math.max(1, themeNodes.length - 1);
  const termRows = Math.ceil(termNodes.length / 2);
  const termGap = (height - topPad - bottomPad) / Math.max(1, termRows - 1);

  themeNodes.forEach((node, index) => {
    placed.set(node.id, { ...node, x: 150, y: topPad + themeGap * index, r: scale(node.count) });
  });
  termNodes.forEach((node, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    placed.set(node.id, {
      ...node,
      col,
      x: col ? 770 : 555,
      y: topPad + termGap * row,
      r: scale(node.count),
    });
  });

  const links = graph.links
    .filter((link) => placed.has(link.source) && placed.has(link.target))
    .map((link) => {
      const source = placed.get(link.source);
      const target = placed.get(link.target);
      const width = Math.min(5, 1 + Number(link.count || 1) * 0.65);
      return `<line class="map-link" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke-width="${width}"></line>`;
    }).join("");

  const nodes = [...placed.values()].map((node) => {
    const termLabelLeft = node.kind === "term" && node.col === 0;
    const labelX = node.kind === "theme"
      ? node.x + node.r + 14
      : termLabelLeft
        ? node.x - node.r - 12
        : node.x + node.r + 12;
    const labelY = node.y + 4;
    const anchor = termLabelLeft ? "end" : "start";
    const approxWidth = Math.min(230, Math.max(58, node.label.length * 7.2 + 18));
    const rectX = anchor === "end" ? labelX - approxWidth + 8 : labelX - 8;
    return `
      <g class="map-node ${node.kind}" data-query="${escapeHtml(node.label)}" tabindex="0" role="button" aria-label="Search ${escapeHtml(node.label)}">
        <circle cx="${node.x}" cy="${node.y}" r="${node.r}"></circle>
        <rect class="map-label-bg" x="${rectX}" y="${labelY - 16}" width="${approxWidth}" height="23" rx="5"></rect>
        <text x="${labelX}" y="${labelY}" text-anchor="${anchor}">${escapeHtml(node.label)}</text>
        <title>${escapeHtml(node.label)}: ${escapeHtml(node.count)} videos</title>
      </g>
    `;
  }).join("");

  els.termMap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-label="Theme and term relationship map">${links}${nodes}</svg>`;
  els.termMap.querySelectorAll(".map-node").forEach((node) => {
    const query = node.getAttribute("data-query");
    node.addEventListener("click", () => setSearch(query));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSearch(query);
      }
    });
  });
}

async function init() {
  const response = await fetch("data/videos.json");
  state.data = await response.json();
  state.query = "";
  state.theme = "";
  state.audience = "";
  state.sort = "date-desc";
  els.searchInput.value = "";
  els.themeFilter.value = "";
  els.audienceFilter.value = "";
  els.sortSelect.value = "date-desc";
  els.videoCount.textContent = state.data.videoCount;
  populateFilters();
  renderTermMap();
  renderVideos();
}

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  if (state.query && state.sort !== "match-desc") {
    state.sort = "match-desc";
    els.sortSelect.value = "match-desc";
  }
  renderVideos();
});

els.themeFilter.addEventListener("change", (event) => {
  state.theme = event.target.value;
  renderVideos();
});

els.audienceFilter.addEventListener("change", (event) => {
  state.audience = event.target.value;
  renderVideos();
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderVideos();
});

els.themeToggle?.addEventListener("click", () => {
  setColorTheme(state.colorTheme === "dark" ? "light" : "dark");
  if (state.data) renderVideos();
});

els.videoGrid.addEventListener("click", (event) => {
  const tag = event.target.closest("[data-tag]");
  if (!tag) return;
  state.theme = tag.dataset.tag || "";
  els.themeFilter.value = state.theme;
  renderVideos();
  els.videoGrid.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.matchList.addEventListener("click", (event) => {
  const titleButton = event.target.closest(".match-title");
  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    state.theme = tagButton.dataset.tag || "";
    els.themeFilter.value = state.theme;
    renderVideos();
    els.videoGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!titleButton) return;
  const item = titleButton.closest("[data-match-key]");
  const key = item?.dataset.matchKey;
  if (!key) return;
  if (state.expandedMatches.has(key)) {
    state.expandedMatches.delete(key);
  } else {
    state.expandedMatches.add(key);
  }
  renderMatches(tokenize(state.query));
});

document.querySelectorAll("[data-query]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setSearch(link.dataset.query || "");
  });
});

applyColorTheme(storedTheme());

init().catch((error) => {
  console.error(error);
  els.resultCount.textContent = "Unable to load video guide data.";
});
