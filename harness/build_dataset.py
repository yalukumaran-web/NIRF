"""
HARNESS STEP 3 -- join extracted inputs (x) to OCR'd sub-scores (y).

Produces data/features.csv, one row per institute-year:

  identity   year, institute_id, name, rank
  inputs     the x columns written by extract_features.py
  targets    <param>_abs  the printed sub-score, straight off the score graph
             <param>_rel  <param>_abs / official max marks   (what the models fit)

Targets are kept in BOTH forms: the prescribed single-input models
(isotonic / log / capped linear / power) are monotone in x and therefore have
to be fitted on the relative scale, but the metrics are reported on the printed
absolute scale because that is the unit the sub-score graph is read in.

Nothing is imputed. A parameter is usable for a row only when every input it
needs is present; unusable rows keep empty cells and are counted on stdout.

Usage:  python harness/build_dataset.py
"""

import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "harness", "out")
YEARS = [2023, 2024, 2025]

# Official maximum marks printed on the NIRF Engineering score graph. These are
# the denominators of the relative sub-scores; they are identical for all three
# years. (Note the task brief quotes different maxima for a few parameters --
# that divergence is reported in report section 3 rather than silently resolved.)
MAX_MARKS = {
    "ss": 20, "fsr": 30, "fqe": 20, "fru": 30, "pu": 35, "qp": 40,
    "ipr": 15, "fppp": 10, "gph": 40, "gue": 15, "gms": 25, "gphd": 20,
    "rd": 30, "wd": 30, "escs": 20, "pcs": 20, "pr": 100,
}

# The parameters this study models, and the extracted inputs each one needs.
# IPR is deliberately absent: the published PDFs carry no patents block, so no
# compliant input exists for it (see extract_features.py).
PARAMETERS = {
    "ESCS": {"x": ["escs_pct"]},
    "GPHD": {"x": ["gphd_avg"]},
    "GMS": {"x": ["gms_median_salary"]},
    "FPPP": {"x": ["fppp_sponsored_per_faculty", "fppp_consultancy_per_faculty"]},
    "SS": {"x": ["ss_x1", "ss_x2"]},
    "FRU": {"x": ["fru_capital_per_student", "fru_operational_per_student"]},
}
ALL_X = ["escs_pct", "gphd_avg", "gms_median_salary",
         "fppp_sponsored_per_faculty", "fppp_consultancy_per_faculty",
         "ss_x1", "ss_x2", "ss_nt", "ss_ne", "ss_np", "ss_n_prog",
         "fru_capital_per_student", "fru_operational_per_student",
         "total_students", "faculty_count"]


def read_csv(path):
    if not os.path.exists(path):
        sys.exit("missing input: %s -- run the earlier harness steps first" % path)
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def as_float(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main():
    rows = []
    for year in YEARS:
        feats = read_csv(os.path.join(DATA, "features_raw.csv"))
        targets = {r["institute_id"]: r
                   for r in read_csv(os.path.join(DATA, str(year), "subscores.csv"))}
        ranking = {r["institute_id"]: r
                   for r in read_csv(os.path.join(DATA, str(year), "ranking.csv"))}
        for f in feats:
            if int(f["year"]) != year:
                continue
            iid = f["institute_id"]
            t, rk = targets.get(iid), ranking.get(iid)
            if t is None:
                sys.exit("no OCR target for %s %s" % (year, iid))
            rec = {
                "year": year,
                "institute_id": iid,
                "name": (rk or {}).get("name") or f.get("name", ""),
                "rank": as_float((rk or {}).get("rank")) or as_float(f.get("rank")),
                "total_score": as_float((rk or {}).get("score")),
            }
            for k in ALL_X:
                rec[k] = as_float(f.get(k))
            for p in PARAMETERS:
                rec["%s_abs" % p.lower()] = as_float(t.get(p.lower()))
                rec["%s_rel" % p.lower()] = (as_float(t.get(p.lower())) / MAX_MARKS[p.lower()]
                                             if as_float(t.get(p.lower())) is not None else None)
            rows.append(rec)

    cols = (["year", "institute_id", "name", "rank", "total_score"] + ALL_X
            + ["%s_%s" % (p.lower(), s) for p in PARAMETERS for s in ("abs", "rel")])
    out = os.path.join(DATA, "features.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print("wrote %s  (%d rows)" % (out, len(rows)))

    print("\nusable rows per parameter (all inputs present and target present)")
    header = "%-6s %-11s %s" % ("param", "inputs", "  ".join("%5s" % y for y in YEARS))
    print(header)
    for p, spec in PARAMETERS.items():
        cells = []
        for year in YEARS:
            n = sum(1 for r in rows
                    if r["year"] == year
                    and r["%s_abs" % p.lower()] is not None
                    and all(r[k] is not None for k in spec["x"]))
            cells.append("%5d" % n)
        print("%-6s %-11s %s" % (p, len(spec["x"]), "  ".join(cells)))
    print("\nIPR: not modelled -- no compliant input available (see report section 3)")


if __name__ == "__main__":
    main()