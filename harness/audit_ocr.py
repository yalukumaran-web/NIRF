"""
Audit the OCR sub-scores for 2023 and 2024.

2025 is validated exactly against server/src/data/expectedOutput2025.ts. The
2023 and 2024 labels are the TRAINING labels and have no independent reference,
so this script looks for the failure modes OCR actually produces rather than
hoping for a second source:

  1  out-of-range     a value above its printed maximum column
  2  under-read       a lost decimal point leaves the value 100x too SMALL, which
                      is in range and therefore never repaired; a value that sits
                      an order of magnitude below its column's distribution is
                      the signature
  3  quantisation     values should be ratios x max, so after normalising by the
                      column max the distinct values should be a small, smooth set
  4  degenerate rows  a sub-score identical to its maximum across every institute
                      in a year, which would mean the OCR read a constant
  5  decimal repairs  how much of the corpus was repaired, per column

Anything flagged here is re-read from the graph at higher resolution before it
is trusted.
"""
import csv
import os
from collections import Counter, defaultdict

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "harness", "out")
YEARS = [2023, 2024, 2025]

MAXES = {
    "ss": 20, "fsr": 30, "fqe": 20, "fru": 30, "pu": 35, "qp": 40, "ipr": 15,
    "fppp": 10, "gph": 40, "gue": 15, "gms": 25, "gphd": 20, "rd": 30, "wd": 30,
    "escs": 20, "pcs": 20, "pr": 100,
}
ORDER = list(MAXES)


def load(year):
    with open(os.path.join(DATA, str(year), "subscores.csv"),
              encoding="utf-8-sig", newline="") as f:
        return {r["institute_id"]: r for r in csv.DictReader(f)}


def main():
    print("=" * 78)
    print("1/5  out-of-range values (value > printed max)")
    bad = 0
    for y in YEARS:
        for iid, r in load(y).items():
            for k in ORDER:
                v = float(r[k])
                if v > MAXES[k] + 1e-9 or v < -1e-9:
                    print("   %s %s %s=%s (max %s)" % (y, iid, k, v, MAXES[k]))
                    bad += 1
    print("   %d found" % bad)

    print("\n" + "=" * 78)
    print("2/5  under-read candidates: value < 5%% of the column median")
    flagged = defaultdict(list)
    for y in (2023, 2024):
        rows = load(y)
        for k in ORDER:
            vals = np.array([float(r[k]) for r in rows.values()])
            med = np.median(vals)
            for iid, r in rows.items():
                v = float(r[k])
                if med > 0 and 0 < v < 0.05 * med and v not in (0.0,):
                    flagged[(y, k)].append((iid, v, med))
    if not flagged:
        print("   none")
    for (y, k), items in sorted(flagged.items()):
        print("   %s %-5s %d row(s): %s" % (y, k, len(items),
                                            [(i, round(v, 3)) for i, v, _ in items[:6]]))

    print("\n" + "=" * 78)
    print("3/5  quantisation: distinct values as a fraction of the max")
    for y in YEARS:
        rows = load(y)
        line = []
        for k in ORDER:
            vals = np.array([float(r[k]) for r in rows.values()])
            rel = np.unique(np.round(vals / MAXES[k], 4))
            line.append("%s:%d" % (k, len(rel)))
        print("   %s  %s" % (y, "  ".join(line)))

    print("\n" + "=" * 78)
    print("4/5  columns constant across a whole year (would mean a bad read)")
    for y in YEARS:
        rows = load(y)
        const = [k for k in ORDER
                 if len({r[k] for r in rows.values()}) == 1]
        print("   %s  %s" % (y, const or "none"))

    print("\n" + "=" * 78)
    print("5/5  decimal repairs, by year and column")
    path = os.path.join(OUT, "ocr_repairs.csv")
    if os.path.exists(path):
        with open(path, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        by_year = Counter(r["year"] for r in rows)
        total = Counter()
        for r in rows:
            total[r["year"]] += int(r["n_values_decimal_repaired"])
        print("   rows repaired per year : %s" % dict(by_year))
        print("   values repaired/year  : %s" % dict(total))
        print("   (repairs are logged per row, not per column; column attribution")
        print("    is not recorded, so a per-column rate cannot be computed)")
    else:
        print("   no ocr_repairs.csv")


if __name__ == "__main__":
    main()