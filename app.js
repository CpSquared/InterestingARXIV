// app.js - full file (replace your existing file with this)
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

function formatPublishedDate(published) {
  if (!published) return "";
  const d = new Date(published);
  if (Number.isNaN(d.getTime())) return "";
  // Example: "20 Jan 2026"
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function makePaperCard(p) {
  const title = p.title ? escapeHtml(p.title) : escapeHtml(p.id);
  const authors = escapeHtml(authorsToString(p.authors));
  const abs = p.url || `https://arxiv.org/abs/${p.id}`;
  const pdf = p.pdf_url || `https://arxiv.org/pdf/${p.id}.pdf`;
  const abstract = p.abstract ? escapeHtml(p.abstract) : "";

  // Tag: prefer primary_category if present, else “arXiv paper”
  const tagText = p.primary_category ? escapeHtml(p.primary_category) : "arXiv paper";

  // Format published date for display
  const pubDate = formatPublishedDate(p.published);

  // Format updated date for display
  // const pubDate = formatPublishedDate(p.updated || p.published);

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
        ${pubDate ? ` | <span class="paper-date">${escapeHtml(pubDate)}</span>` : ""}
      </div>

      ${abstract ? `<p class="paper-abstract">${abstract}</p>` : ""}
    </div>
  `;
}

async function main() {
  const statusEl = document.getElementById("status");
  const papersEl = document.getElementById("papers");

  try {
    const resp = await fetch("data/papers.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`Failed to load papers.json (HTTP ${resp.status})`);

    const papers = await resp.json();

    // // Sort by Updated date (newest first)
    // const sorted = [...papers].sort((a, b) => {
    //   const da = new Date(a.updated || a.published || "1970-01-01");
    //   const db = new Date(b.updated || b.published || "1970-01-01");
    //   return db - da;
    // });

    // Sort by published date (newest first)
    const sorted = [...papers].sort((a, b) => {
      const da = a.published ? new Date(a.published) : new Date("1970-01-01");
      const db = b.published ? new Date(b.published) : new Date("1970-01-01");
      return db - da; // newest first
    });

    statusEl.textContent = `Loaded ${sorted.length} paper(s) from data/papers.json ✅`;
    console.log("papers.json contents:", papers);
    console.log("sorted by published:", sorted);

    if (!Array.isArray(sorted) || sorted.length === 0) {
      papersEl.innerHTML = "<p>No papers yet. Add arXiv links to <code>data/papers.txt</code>.</p>";
      return;
    }

    papersEl.innerHTML = sorted.map(makePaperCard).join("\n");
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    papersEl.innerHTML = `<p>Error loading papers: ${escapeHtml(err.message)}</p>`;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", main);