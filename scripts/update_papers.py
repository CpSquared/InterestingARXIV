#!/usr/bin/env python3
"""
scripts/update_papers.py

Reads data/papers.txt (one arXiv abs URL per line, ignores # comments),
reads data/papers.json (existing cached metadata),
fetches metadata from arXiv for any new IDs, and writes an updated
data/papers.json containing metadata in the same order as papers.txt.

Uses the arXiv API (Atom feed): http://export.arxiv.org/api/query?id_list=ID1,ID2,...
"""
import sys
import time
import json
from pathlib import Path
from urllib.parse import urlparse
import requests
import feedparser

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
PAPERS_TXT = DATA_DIR / "papers.txt"
PAPERS_JSON = DATA_DIR / "papers.json"

# How many IDs to request per arXiv API call (keep reasonably small)
BATCH_SIZE = 25
# polite delay between requests (seconds)
DELAY = 1.0

def extract_id_from_url(url: str) -> str:
    # Expect URLs like https://arxiv.org/abs/2601.10674 or https://arxiv.org/abs/hep-ph/0601234
    url = url.strip()
    if not url:
        return ""
    parsed = urlparse(url)
    # If they pasted just the id, accept it too
    if "/" not in parsed.path or parsed.path == url:
        # maybe they gave just an ID like "2601.10674"
        return url.split()[-1]
    parts = parsed.path.split("/")
    if len(parts) >= 3:
        return parts[-1]
    return parts[-1]

def load_papers_txt():
    if not PAPERS_TXT.exists():
        return []
    ids = []
    with PAPERS_TXT.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # allow both direct arxiv abs urls and plain ids
            if line.startswith("http"):
                arxiv_id = extract_id_from_url(line)
            else:
                arxiv_id = line
            if arxiv_id:
                ids.append(arxiv_id)
    return ids

def load_existing_json():
    if not PAPERS_JSON.exists():
        return {}
    with PAPERS_JSON.open("r", encoding="utf-8") as f:
        try:
            arr = json.load(f)
        except json.JSONDecodeError:
            print("Warning: papers.json exists but is invalid JSON. Ignoring it.", file=sys.stderr)
            return {}
    d = {}
    for item in arr:
        if "id" in item:
            d[item["id"]] = item
    return d

def fetch_metadata_for_ids(id_list):
    # arXiv API: batch with id_list joined by commas
    base = "http://export.arxiv.org/api/query?id_list="
    joined = ",".join(id_list)
    url = base + joined
    resp = requests.get(url,headers={"User-Agent": "InterestingARXIV/1"},timeout=30)
    resp.raise_for_status()
    feed = feedparser.parse(resp.text)
    results = {}
    for entry in feed.entries:
        # arXiv returns ids like 'http://arxiv.org/abs/2601.10674v1' in id field; use arxiv_primary_category/tag
        raw_id = entry.get("id", "")
        # prefer the arxiv:primary_category / id parsing to extract canonical id (strip version)
        # entry.id may include version. entry.get('id') -> 'http://arxiv.org/abs/2601.10674v1'
        # We'll extract final path and remove trailing 'vN' if present
        parsed = urlparse(raw_id)
        path = parsed.path.split("/")[-1] if parsed.path else raw_id
        # drop version suffix like v1
        if path.endswith("v") is False and path.rfind("v") != -1:
            # naive strip vN
            base_id = path.split("v")[0]
        else:
            base_id = path
        # fallback: if arXiv returns entry.arxiv_primary_category
        primary_cat = None
        if "arxiv_primary_category" in entry:
            primary_cat = entry.arxiv_primary_category.get("term")
        # authors
        authors = [a.name for a in entry.get("authors", []) if getattr(a, "name", None)]
        # published date
        published = entry.get("published", "")
        updated = entry.get("updated", "")
        # title, clean whitespace
        title = entry.get("title", "").strip().replace("\n", " ").replace("  ", " ")
        abstract = entry.get("summary", "").strip().replace("\n", " ").replace("  ", " ")
        # links: find abs and pdf
        links = {lnk.rel: lnk.href for lnk in entry.get("links", []) if getattr(lnk, "rel", None)}
        abs_url = links.get("alternate") or f"https://arxiv.org/abs/{base_id}"
        pdf_url = None
        # sometimes arXiv provides link with title 'pdf' or rel='related'
        for lnk in entry.get("links", []):
            href = getattr(lnk, "href", "")
            if href.endswith(".pdf"):
                pdf_url = href
        # primary category fallback from tags if not present
        if not primary_cat and "tags" in entry and len(entry.tags) > 0:
            primary_cat = entry.tags[0].get("term")
        # ensure base_id canonical (strip any whitespace)
        base_id = base_id.strip()
        results[base_id] = {
            "id": base_id,
            "url": abs_url,
            "pdf_url": pdf_url,
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "published": published,
            "updated": updated,
            "primary_category": primary_cat,
        }
    return results

def main():
    ids = load_papers_txt()
    if not ids:
        print("No IDs found in data/papers.txt")
        return
    existing = load_existing_json()
    missing = [i for i in ids if i not in existing]
    print(f"Total IDs in papers.txt: {len(ids)}")
    print(f"Already cached: {len(ids) - len(missing)}")
    print(f"Need to fetch: {len(missing)}")
    # fetch in batches
    fetched = {}
    for i in range(0, len(missing), BATCH_SIZE):
        batch = missing[i:i + BATCH_SIZE]
        print(f"Fetching batch {i//BATCH_SIZE + 1}: {len(batch)} ids...")
        try:
            res = fetch_metadata_for_ids(batch)
            fetched.update(res)
        except Exception as e:
            print(f"Error fetching batch: {e}", file=sys.stderr)
            # continue with next batch
        time.sleep(DELAY)
    # --- Retry unresolved IDs one-by-one (handle occasional missing entries from batch queries) ---
    still_missing = [pid for pid in missing if pid not in fetched and pid not in existing]
    if still_missing:
        print(f"Retrying unresolved IDs one-by-one: {len(still_missing)}")
        for pid in still_missing:
            try:
                # fetch_metadata_for_ids accepts a list (we pass single-id list)
                one = fetch_metadata_for_ids([pid])
                if one:
                    fetched.update(one)
                    print(f"  fetched on retry: {pid}")
                else:
                    print(f"  no data returned for {pid} on retry", file=sys.stderr)
            except Exception as e:
                print(f"WARNING: Could not fetch metadata for {pid} on retry: {e}", file=sys.stderr)
            # be polite with arXiv
            time.sleep(DELAY)
    # -------------------------------------------------------------------------------
    # merge: existing + fetched
    merged = {**existing, **fetched}
    # produce ordered list according to papers.txt
    ordered = []
    for pid in ids:
        item = merged.get(pid)
        if item:
            ordered.append(item)
        else:
            # create a placeholder so we don't lose ordering
            ordered.append({
                "id": pid,
                "url": f"https://arxiv.org/abs/{pid}",
                "title": None,
                "authors": [],
                "abstract": None,
                "published": None,
                "updated": None,
                "primary_category": None,
            })
    # write to JSON (pretty)
    with PAPERS_JSON.open("w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(ordered)} entries to {PAPERS_JSON}")

if __name__ == "__main__":
    main()