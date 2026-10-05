"""
HARNESS STEP 0 -- reproduce the whole study end to end.

    python harness/run_all.py            # everything
    python harness/run_all.py --fast     # skip the two slow download/OCR passes
                                   and reuse what is already on disk

Step order matters and is enforced here:

  1  fetch_data.py        ranking tables, 290 submitted-data PDFs, 290 score graphs
  2  ocr_graphs.js        OCR the score graphs -> the TARGET sub-scores
  3  validate_ocr.py      check the 2025 OCR against the repository reference
  3b scan_ipr.py          prove the IPR inputs do not exist in those PDFs
  4  extract_features.py  parse the PDFs -> the INPUT features
  5  build_dataset.py     join inputs to targets -> data/features.csv
  6  model.py             LOIO CV on 2023+2024, freeze the choice, score 2025
  7  report.py            figures and report.pdf

Determinism
-----------
SEED in model.py pins the only stochastic component (numpy's generator, declared
for reproducibility; the estimators themselves are closed-form or deterministic
solvers, so repeated runs give identical numbers). Network and OCR are the only
steps that depend on anything outside this repository.
"""

import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(ROOT, "harness")

STEPS = [
    ("download rankings, PDFs and score graphs", [sys.executable, "fetch_data.py"], True),
    ("OCR the published score graphs", ["node", "ocr_graphs.js"], True),
    ("validate the 2025 OCR against the repository reference",
     [sys.executable, "validate_ocr.py"], False),
    ("scan all 290 PDFs for the IPR patents block",
     [sys.executable, "scan_ipr.py"], False),
    ("extract the input features from the PDFs",
     [sys.executable, "extract_features.py"], False),
    ("join inputs to targets", [sys.executable, "build_dataset.py"], False),
    ("fit, select by LOIO CV, score 2025", [sys.executable, "model.py"], False),
    ("figures and report.pdf", [sys.executable, "report.py"], False),
]


def main():
    fast = "--fast" in sys.argv
    failed = []
    for i, (label, cmd, slow) in enumerate(STEPS, 1):
        if fast and slow:
            print("[%d/%d] SKIP  %s  (--fast)" % (i, len(STEPS), label))
            continue
        print("\n[%d/%d] %s" % (i, len(STEPS), label))
        t0 = time.time()
        rc = subprocess.call(cmd, cwd=HARNESS)
        print("    %s in %.0fs" % ("failed" if rc else "ok", time.time() - t0))
        if rc:
            failed.append(label)
            break

    print("\nartifacts:")
    for rel in ("data/features.csv", "data/predictions.csv", "report.pdf",
                "harness/out/cv_table.csv", "harness/out/metrics_2025.csv",
                "harness/out/extract_log.csv", "harness/out/ocr_repairs.csv"):
        p = os.path.join(ROOT, rel)
        print("  %-38s %s" % (rel, "present" if os.path.exists(p) else "MISSING"))
    if failed:
        sys.exit("stopped at: %s" % failed[0])
    print("\ndone.")


if __name__ == "__main__":
    main()