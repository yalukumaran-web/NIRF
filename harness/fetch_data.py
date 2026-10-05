"""
HARNESS STEP 0 -- fetch the raw NIRF Engineering data.

For each year in {2023, 2024, 2025} this downloads, into data/<year>/:
    ranking.csv   institute_id, name, city, state, score, rank, tlr, rpc, go, oi, pr
    pdf/<ID>.pdf  the institute's "Data Submitted by Institution" PDF
    graph/<ID>.jpg the published sub-parameter score graph (may 404 -- logged)

Nothing is imputed. Anything the server refuses is written to
harness/out/fetch_failures.csv and excluded downstream.

Usage:  python harness/fetch_data.py
"""

import csv
import html
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "harness", "out")

YEARS = [2023, 2024, 2025]
# Rank cut-off actually used by the harness: top 100, top 100, top 90.
TOP_N = {2023: 100, 2024: 100, 2025: 90}

RANKING_URL = "https://www.nirfindia.org/Rankings/{year}/EngineeringRanking.html"
PDF_URL = "https://www.nirfindia.org/nirfpdfcdn/{year}/pdf/Engineering/{iid}.pdf"
# The published sub-parameter score graph. NOTE: 2023 graphs are .png,
# 2024/2025 graphs are .jpg -- the extension changed between editions.
GRAPH_URL = "https://www.nirfindia.org/nirfpdfcdn/{year}/graph/Engineering/{iid}.{ext}"
GRAPH_EXT = {2023: "png", 2024: "jpg", 2025: "jpg"}

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) nirf-harness/1.0"}
RETRIES = 3

failures = []  # (year, institute_id, kind, url, reason)


def get(url, binary=False):
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = "HTTP %s" % e.code
            if e.code in (404, 403):
                return None  # permanent
        except Exception as e:  # noqa: BLE001
            last = type(e).__name__ + ": " + str(e)[:120]
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("giving up on %s (%s)" % (url, last))


def parse_ranking(page_html):
    """Pull every result row out of the NIRF ranking page's main table.

    The page nests a second (hidden) 5-column parameter table inside the Name
    cell, so a flat regex over <td> mis-parses it. BeautifulSoup is used so the
    outer row cells are taken positionally.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(page_html, "lxml")
    table = soup.find("table", id="tbl_overall")
    if table is None:
        return []

    def num(s):
        try:
            return float(str(s).strip())
        except (TypeError, ValueError):
            return None

    rows = []
    tbody = table.find("tbody")
    scope = tbody if tbody is not None else table
    for tr in scope.find_all("tr", recursive=False):
        tds = tr.find_all("td", recursive=False)
        if len(tds) != 6:
            continue
        iid = tds[0].get_text(strip=True)
        if not re.fullmatch(r"IR-E-[UIC]-\d+", iid):
            continue

        # Name cell: the visible text is everything before the button block.
        name_cell = tds[1]
        name = name_cell.get_text(" ", strip=True)
        name = re.split(r"More Details|Close", name)[0].strip()
        name = re.sub(r"\s+", " ", name)

        # Hidden parameter table lives inside the name cell.
        params = {}
        inner = name_cell.find("table")
        if inner is not None:
            keys = ["tlr", "rpc", "go", "oi", "pr"]
            vals = [td.get_text(strip=True) for td in inner.find_all("td")]
            for k, v in zip(keys, vals):
                params[k] = num(v)

        m2 = re.search(r"(\d+)", tds[5].get_text(strip=True))
        rows.append(
            {
                "institute_id": iid,
                "name": name,
                "city": tds[2].get_text(" ", strip=True),
                "state": tds[3].get_text(" ", strip=True),
                "score": num(tds[4].get_text(strip=True)),
                "rank": int(m2.group(1)) if m2 else None,
                "tlr": params.get("tlr"),
                "rpc": params.get("rpc"),
                "go": params.get("go"),
                "oi": params.get("oi"),
                "pr": params.get("pr"),
            }
        )
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    for year in YEARS:
        print("=" * 70)
        print("YEAR", year)
        page = get(RANKING_URL.format(year=year))
        if page is None:
            failures.append((year, "", "ranking_page", RANKING_URL.format(year=year), "HTTP 404"))
            print("  !! ranking page unavailable")
            continue

        rows = parse_ranking(page)
        rows = [r for r in rows if r["rank"] is not None]
        rows.sort(key=lambda r: r["rank"])
        top = rows[: TOP_N[year]]
        print("  parsed %d ranked rows, taking top %d" % (len(rows), len(top)))

        ydir = os.path.join(DATA, str(year))
        os.makedirs(os.path.join(ydir, "pdf"), exist_ok=True)
        os.makedirs(os.path.join(ydir, "graph"), exist_ok=True)

        cols = ["rank", "institute_id", "name", "city", "state", "score",
                "tlr", "rpc", "go", "oi", "pr"]
        with open(os.path.join(ydir, "ranking.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            for r in top:
                w.writerow({c: r[c] for c in cols})

        n_pdf = n_graph = 0
        for i, r in enumerate(top, 1):
            iid = r["institute_id"]
            pdf_path = os.path.join(ydir, "pdf", iid + ".pdf")
            if not os.path.exists(pdf_path):
                blob = get(PDF_URL.format(year=year, iid=iid), binary=True)
                if blob is None:
                    failures.append((year, iid, "pdf", PDF_URL.format(year=year, iid=iid), "HTTP 404/403"))
                else:
                    with open(pdf_path, "wb") as fh:
                        fh.write(blob)
            n_pdf += 1

            g_path = os.path.join(ydir, "graph", iid + "." + GRAPH_EXT[year])
            if not os.path.exists(g_path):
                blob = get(GRAPH_URL.format(year=year, iid=iid, ext=GRAPH_EXT[year]), binary=True)
                if blob is None:
                    failures.append((year, iid, "graph",
                                     GRAPH_URL.format(year=year, iid=iid, ext=GRAPH_EXT[year]),
                                     "HTTP 404/403"))
                else:
                    with open(g_path, "wb") as fh:
                        fh.write(blob)
            if os.path.exists(g_path):
                n_graph += 1
            if i % 20 == 0:
                print("   %3d/%d  pdf=%d graph=%d" % (i, len(top), n_pdf, n_graph))

        print("  DONE year=%d  pdf=%d/%d  graph=%d/%d"
              % (year, len(os.listdir(os.path.join(ydir, "pdf"))), len(top),
                 len(os.listdir(os.path.join(ydir, "graph"))), len(top)))

    with open(os.path.join(OUT, "fetch_failures.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["year", "institute_id", "kind", "url", "reason"])
        w.writerows(failures)
    print("\nfetch_failures.csv: %d rows" % len(failures))
    for row in failures[:20]:
        print("  ", row)


if __name__ == "__main__":
    sys.exit(main())