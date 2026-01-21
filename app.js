function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function authorsToString(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  return authors.join(", ");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dateKey(p) {
  // Sort by latest update first; fallback to published; then epoch
  const iso = p.updated || p.published || "1970-01-01T00:00:00Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function makePaperCard(p) {
  const title = p.title ? escapeHtml(p.title) : escapeHtml(p.id);
  const authors = escapeHtml(authorsToString(p.authors));

  const abs = p.url || `https://arxiv.org/abs/${p.id}`;
  const pdf = p.pdf_url || `https://arxiv.org/pdf/${p.id}.pdf`;

  const abstract = p.abstract ? escapeHtml(p.abstract) : "";

  const firstDate = formatDate(p.published);
  const updatedDate = formatDate(p.updated);

  const tagText = p.primary_category ? escapeHtml(p.primary_category) : "arXiv";

  return `
    <div class="paper">
      <div class="paper-top">
        <span class="tag">${tagText}</span>
        <h3 class="paper-title">
          <a href="${escapeHtml(abs)}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h3>
      </div>

      ${authors ? `<div class="paper-authors">${authors}</div>` : ""}

      <div class="paper-links">
        <a href="${escapeHtml(abs)}" target="_blank" rel="noopener noreferrer">arXiv</a>
        |
        <a href="${escapeHtml(pdf)}" target="_blank" rel="noopener noreferrer">PDF</a>
        ${firstDate ? ` | <span class="paper-date">v1: ${escapeHtml(firstDate)}</span>` : ""}
        ${updatedDate ? ` | <span class="paper-date">latest: ${escapeHtml(updatedDate)}</span>` : ""}
      </div>

      ${abstract ? `<p class="paper-abstract">${abstract}</p>` : ""}
    </div>
  `;
}

function ensureRootContainers() {
  // We’ll render everything inside the existing ".container" if present
  const container = document.querySelector(".container") || document.body;

  // Prefer an existing root if you already have one in HTML
  let root = document.getElementById("categories-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "categories-root";
    container.appendChild(root);
  }

  // navigation card goes here
  let nav = document.getElementById("nav-root");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "nav-root";
    root.appendChild(nav);
  }

  // category lists go here
  let lists = document.getElementById("lists-root");
  if (!lists) {
    lists = document.createElement("div");
    lists.id = "lists-root";
    root.appendChild(lists);
  }

  return { container, root, nav, lists };
}

function renderNav(categories) {
  const items = categories
    .map(
      (c) => `
        <div class="nav-item">
          <a href="#cat-${escapeHtml(c.id)}">${escapeHtml(c.title)}</a>
        </div>
      `
    )
    .join("");

  return `
    <div class="section-card nav-card">
      <div class="paper-title nav-header">Take me to:</div>
      <div class="nav-list">
        ${items}
      </div>
    </div>
  `;
}

function renderCategoryBlock(category, papersForCategory) {
  const catDomId = `cat-${category.id}`;

  const papersHtml =
    papersForCategory.length === 0
      ? `<p class="meta">No papers yet in this category.</p>`
      : papersForCategory.map(makePaperCard).join("\n");

  return `
    <div class="section-card">
      <details class="card" id="${escapeHtml(catDomId)}">
        <summary class="list-summary">
          <span class="paper-title list-title">${escapeHtml(category.title)}</span>
        </summary>

        <div class="papers-category">
          ${papersHtml}
        </div>
      </details>
    </div>
  `;
}

function setupNavHandlers() {
  const navRoot = document.getElementById("nav-root");
  if (!navRoot) return;

  const links = navRoot.querySelectorAll('a[href^="#cat-"]');

  links.forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();

      const href = a.getAttribute("href");
      if (!href || !href.startsWith("#")) return;

      const targetId = href.slice(1); // remove '#'
      const det = document.getElementById(targetId);
      if (!det) return;

      // Open the category
      det.open = true;

      // Smooth scroll to it
      det.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function main() {
  const statusEl = document.getElementById("status");

  const { nav, lists } = ensureRootContainers();

  try {
    const [papersResp, catsResp, mapResp] = await Promise.all([
      fetch("data/papers.json", { cache: "no-store" }),
      fetch("data/categories.json", { cache: "no-store" }),
      fetch("data/categories_map.json", { cache: "no-store" }),
    ]);

    if (!papersResp.ok) throw new Error(`Failed to load papers.json (HTTP ${papersResp.status})`);
    if (!catsResp.ok) throw new Error(`Failed to load categories.json (HTTP ${catsResp.status})`);
    if (!mapResp.ok) throw new Error(`Failed to load categories_map.json (HTTP ${mapResp.status})`);

    const papersArr = await papersResp.json();
    const catsCfg = await catsResp.json();
    const catMap = await mapResp.json();

    const categories = Array.isArray(catsCfg.categories) ? catsCfg.categories : [];

    // index papers by id for fast lookup
    const byId = {};
    for (const p of papersArr) {
      if (p && p.id) byId[p.id] = p;
    }

    // Build nav box (top)
    nav.innerHTML = renderNav(categories);

    // Build each category list
    const blocks = categories.map((c) => {
      const ids = Array.isArray(catMap[c.id]) ? catMap[c.id] : [];
      const papers = ids
        .map((id) => byId[id])
        .filter(Boolean)
        .sort((a, b) => dateKey(b) - dateKey(a)); // newest update first

      return renderCategoryBlock(c, papers);
    });

    lists.innerHTML = blocks.join("\n");

    setupNavHandlers();

    // status
    statusEl.textContent = `Loaded ${papersArr.length} paper(s) ✅`;
    console.log("categories:", categories);
    console.log("categories_map:", catMap);
  } catch (err) {
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
    lists.innerHTML = `<p>Error: ${escapeHtml(err.message)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);