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
  
  function makePaperCard(p) {
    const title = p.title ? escapeHtml(p.title) : escapeHtml(p.id);
    const authors = escapeHtml(authorsToString(p.authors));
    const abs = p.url || `https://arxiv.org/abs/${p.id}`;
    const pdf = p.pdf_url || `https://arxiv.org/pdf/${p.id}.pdf`;
    const abstract = p.abstract ? escapeHtml(p.abstract) : "";
  
    return `
      <div class="paper">
        <h3 class="paper-title">
          <a href="${escapeHtml(abs)}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h3>
  
        ${authors ? `<div class="paper-authors">${authors}</div>` : ""}
  
        <div class="paper-links">
          <a href="${escapeHtml(abs)}" target="_blank" rel="noopener noreferrer">arXiv</a>
          |
          <a href="${escapeHtml(pdf)}" target="_blank" rel="noopener noreferrer">PDF</a>
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
      statusEl.textContent = `Loaded ${papers.length} paper(s) from data/papers.json ✅`;
      console.log("papers.json contents:", papers);
  
      if (!Array.isArray(papers) || papers.length === 0) {
        papersEl.innerHTML = "<p>No papers yet. Add arXiv links to <code>data/papers.txt</code>.</p>";
        return;
      }
  
      papersEl.innerHTML = papers.map(makePaperCard).join("\n");
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      papersEl.innerHTML = `<p>Error loading papers: ${escapeHtml(err.message)}</p>`;
      console.error(err);
    }
  }
  
  document.addEventListener("DOMContentLoaded", main);