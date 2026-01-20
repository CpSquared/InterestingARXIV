async function main() {
    const statusEl = document.getElementById("status");
  
    try {
      const resp = await fetch("data/papers.json", { cache: "no-store" });
      if (!resp.ok) throw new Error(`Failed to load papers.json (HTTP ${resp.status})`);
  
      const papers = await resp.json();
      statusEl.textContent = `Loaded ${papers.length} paper(s) from data/papers.json ✅`;
      console.log("papers.json contents:", papers);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  }
  
  document.addEventListener("DOMContentLoaded", main);