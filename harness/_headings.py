"""Corpus-wide heading inventory: the direct evidence behind report section 3.4.

The published submitted-data PDF is templated, so every section heading appears
in a predictable fraction of the 290 documents. Printing what is actually there,
with counts, settles whether a patents block exists far more convincingly than
probing for one specific phrase.
"""
import os
import re
import subprocess
from collections import Counter

HEADING = re.compile(r"^([A-Za-z][A-Za-z0-9 ()/\[\],.&%'-]{5,60}?)"
                     r"(?=\s{2,}|\s+\d|$)")
HEADING_MIN_UPPER = 2

c = Counter()
n_docs = 0
for y in (2023, 2024, 2025):
    d = os.path.join("data", str(y), "pdf")
    for n in sorted(os.listdir(d)):
        t = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8",
                            os.path.join(d, n), "-"],
                           capture_output=True).stdout.decode("utf-8", "replace")
        n_docs += 1
        seen = set()
        for line in t.split("\n"):
            s = line.strip()
            if not (6 <= len(s) <= 90):
                continue
            m = HEADING.match(s)
            if not m:
                continue
            h = m.group(1).strip()
            if len(h) >= 6:
                seen.add(h)
        c.update(seen)

print("documents: %d" % n_docs)
print("distinct heading-like lines: %d" % len(c))
print("\n--- present in >= 90%% of documents (%d)" % int(0.9 * n_docs))
for k, v in c.most_common(200):
    if v >= 0.9 * n_docs:
        print("%4d  %s" % (v, k))
print("\n--- patent / IPR related, any frequency at all")
pat = re.compile(r"patent|intellectual property|\bipr\b|innovation|research ?and ?dev", re.I)
found = [(v, k) for k, v in c.items() if pat.search(k)]
for v, k in sorted(found, reverse=True):
    print("%4d  %s" % (v, k))
if not found:
    print("  (none)")