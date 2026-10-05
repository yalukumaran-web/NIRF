"""
HARNESS STEP 3b -- verify the IPR claim in report section 3.4.

IPR is scored from patents granted and published in the assessment year, and the
brief prescribes those two counts as the inputs. This step establishes, over
every downloaded PDF rather than a sample, whether the published submitted-data
record contains a patents block at all -- because if it does not, there is no
compliant way to build the input and the parameter has to be excluded rather
than approximated.

It also reports what sections ARE present, so the absence of patents is a
statement about these documents and not about the scan failing to find them.

Usage:  python harness/scan_ipr.py
"""

import csv
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "harness", "out")
YEARS = [2023, 2024, 2025]

# Markers that would appear in a patents block. Any one hit counts.
PATENT_MARKERS = [
    r"patents?\s+granted",
    r"patents?\s+published",
    r"patents?\s+filed",
    r"patents?\s+granted\s+in\s+the\s+year",
    r"total\s+number\s+of\s+patents",
    r"ipr",
    r"intellectual\s+property\s+rights",
]

# Sections that SHOULD be present, used as a positive control: a scan that finds
# none of these is broken rather than informative. Wording is taken from the
# documents themselves -- an earlier version of these patterns missed sections
# that are demonstrably there, which would have made the patent result look
# stronger than the evidence supports.
CONTROL_MARKERS = {
    "student_strength": r"Total\s+Actual\s+Student\s+Strength",
    "sanctioned_intake": r"Sanctioned.*Intake",
    "faculty": r"Faculty\s+Details|faculty\s+members",
    "placement": r"Placement\s*&|Median\s+salary",
    "phd": r"Ph\.?D.*(pursuing|graduat)",
    "sponsored": r"Sponsored\s*Research\s*Details",
    "consultancy": r"Consultancy\s*Project\s*Details",
    "capital_expenditure": r"[Cc]apital\s+[Ee]xpenditure",
    "operational_expenditure": r"[Oo]perational\s+[Ee]xpenditure",
    "amount_in_words": r"Amount\s+Received\s+in\s+Words",
    "pcs_facilities": r"PCS\s+Facilities",
}

# Where the published data sheet actually stops. Recorded so the IPR conclusion
# reads as a statement about these documents rather than about a failed search.
SECTION_MARKERS = {
    "financial_resources": r"Financial\s+Resources",
    # not a section: "Library" is a line item inside operational expenditure
    "library_expenditure_line": r"[Ll]ibrary",
    "sports": r"Sports",
    "pcs_facilities": r"PCS\s+Facilities",
    "faculty_details": r"Faculty\s+Details",
    "innovation": r"Innovation",
    "patents": r"Patent",
    "publications": r"[Pp]ublication",
    "startup": r"[Ss]tart-?up",
    "outreach": r"[Oo]utreach",
}


def pdf_text(path):
    try:
        out = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
                             capture_output=True, timeout=120)
        return out.stdout.decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return ""


def main():
    rows = []
    section_counts = Counter()
    control_counts = Counter()
    scanned = failed = 0

    for year in YEARS:
        pdf_dir = os.path.join(DATA, str(year), "pdf")
        names = sorted(f for f in os.listdir(pdf_dir) if f.lower().endswith(".pdf"))
        for i, name in enumerate(names, 1):
            iid = os.path.splitext(name)[0]
            text = pdf_text(os.path.join(pdf_dir, name))
            if not text.strip():
                failed += 1
                rows.append(dict(year=year, institute_id=iid, chars=0,
                                 patent_hits="", sections="", note="no text extracted"))
                continue
            scanned += 1
            low = text.lower()
            hits = sorted({m for m in PATENT_MARKERS if re.search(m, low)})
            secs = sorted({k for k, m in SECTION_MARKERS.items()
                           if re.search(m, text, re.I)})
            for k in secs:
                section_counts[k] += 1
            for k, m in CONTROL_MARKERS.items():
                if re.search(m, text, re.I):
                    control_counts[k] += 1
            if i % 50 == 0:
                print("  %d/%d %s" % (i, len(names), year), flush=True)
            rows.append(dict(year=year, institute_id=iid, chars=len(text),
                             patent_hits=";".join(hits),
                             sections=";".join(secs),
                             note=""))

    path = os.path.join(OUT, "ipr_scan.csv")
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "institute_id", "chars",
                                          "patent_hits", "sections", "note"])
        w.writeheader()
        w.writerows(rows)

    with_patents = [r for r in rows if r["patent_hits"]]
    print("\nwrote %s" % path)
    print("PDFs scanned              : %d   (no text: %d)" % (scanned, failed))
    print("PDFs with any patent marker: %d" % len(with_patents))
    if with_patents:
        print("\n  the markers were:")
        for r in with_patents[:20]:
            print("   %s %s  ->  %s" % (r["year"], r["institute_id"], r["patent_hits"]))
    print("\npositive control -- sections actually found (out of %d scanned):" % scanned)
    for k in CONTROL_MARKERS:
        print("   %-24s %4d  (%.0f%%)"
              % (k, control_counts[k], 100 * control_counts[k] / max(scanned, 1)))
    print("\nlast sections present:")
    for k in SECTION_MARKERS:
        print("   %-24s %4d" % (k, section_counts[k]))


if __name__ == "__main__":
    sys.exit(main())