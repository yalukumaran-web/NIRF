"""Validate this harness's OCR of the 2025 score graphs against the repository's
independently produced and verified 2025 sub-score dataset
(server/src/data/expectedOutput2025.ts, itself cross-checked by
build_expected_output.js against new_comparison.xlsx).

Any disagreement is printed, not silently accepted.

Usage:  python harness/validate_ocr.py
"""

import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = ["ss", "fsr", "fqe", "fru", "pu", "qp", "ipr", "fppp",
         "gph", "gue", "gms", "gphd", "rd", "wd", "escs", "pcs", "pr"]

REF = os.path.join(ROOT, "server", "src", "data", "expectedOutput2025.ts")
MINE = os.path.join(ROOT, "data", "2025", "subscores.csv")


def load_reference():
    s = open(REF, encoding="utf-8", errors="replace").read()
    recs = re.findall(r'nirfId:\s*"(IR-E-[UIC]-\d+)".*?scores:\s*\{(.*?)\}', s, re.S)
    out = {}
    for iid, body in recs:
        out[iid] = {k: float(v) for k, v in re.findall(r"(\w+):\s*([\d.]+)", body)}
    return out


def main():
    ref = load_reference()
    rows = list(csv.DictReader(open(MINE, encoding="utf-8")))
    both = diff = cells = 0
    bad = []
    for r in rows:
        iid = r["institute_id"]
        if iid not in ref:
            continue
        both += 1
        for k in ORDER:
            a = float(r[k])
            b = ref[iid][k]
            cells += 1
            if abs(a - b) > 1e-9:
                diff += 1
                bad.append((iid, k, a, b))

    print("reference records (repo, verified) :", len(ref))
    print("this harness, 2025 graphs read     :", len(rows))
    print("institutions in both               :", both)
    print("cells compared                     :", cells)
    print("cells disagreeing                  :", diff)
    for d in bad[:30]:
        print("   ", d)

    covered = {r["institute_id"] for r in rows}
    only_repo = sorted(set(ref) - covered)
    print("\nin repo reference but not in this run:", len(only_repo), only_repo[:10])
    return 0 if diff == 0 else 1


if __name__ == "__main__":
    sys.exit(main())