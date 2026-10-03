import os, re, glob
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

WS = r"C:\Users\LAKSHMI YALINI K\OneDrive\Desktop\NIRF_PDFS"
PDFS = os.path.join(WS, "pdfs")

ORDER = []
rows = []
seen = {}
bad = []

for i in range(1, 11):
    rf = os.path.join(WS, "results_batch_%02d.txt" % i)
    order_line = 0
    with open(rf, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            parts = line.split("\t")
            if len(parts) == 4:
                name = parts[1].strip()
                url = parts[2].strip()
                loc = parts[3].strip()
            elif len(parts) == 3:
                name = parts[0].strip()
                url = parts[1].strip()
                loc = parts[2].strip()
            else:
                continue
            fname = os.path.basename(loc.replace("\\", "/"))
            if url == "NOT AVAILABLE" or loc == "NOT AVAILABLE":
                rows.append((name, "NOT AVAILABLE", "NOT AVAILABLE"))
                continue
            path = os.path.join(PDFS, fname) if fname else None
            ok = False
            size = 0
            if path and os.path.isfile(path):
                with open(path, "rb") as p:
                    head = p.read(5)
                if head == b"%PDF-":
                    ok = True
                    size = os.path.getsize(path)
                else:
                    bad.append((name, fname, "bad-header"))
            if not ok:
                bad.append((name, fname, "missing-or-invalid"))
                rows.append((name, url, fname or "MISSING"))
                continue
            rows.append((name, url, "pdfs/" + fname))
            order_line += 1

wb = Workbook()
ws = wb.active
ws.title = "NIRF 2025 Engineering"

hdr = ["College Name", "URL Link", "PDF"]
ws.append(hdr)
gray = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
for c in range(1, 4):
    cell = ws.cell(row=1, column=c)
    cell.font = Font(bold=True, color="FFFFFF", size=12)
    cell.fill = gray
    cell.alignment = Alignment(horizontal="center", vertical="center")

for name, url, loc in rows:
    r = ws.max_row + 1
    ws.cell(row=r, column=1, value=name)
    ws.cell(row=r, column=2, value=url)
    c3 = ws.cell(row=r, column=3, value=loc)
    if loc != "NOT AVAILABLE":
        c3.hyperlink = loc
        c3.font = Font(color="0563C1", underline="single")
        c3.alignment = Alignment(vertical="center")
    else:
        ws.cell(row=r, column=1).font = Font(color="808080")
        ws.cell(row=r, column=2).font = Font(color="808080")
        c3.font = Font(color="808080")

ws.column_dimensions["A"].width = 55
ws.column_dimensions["B"].width = 90
ws.column_dimensions["C"].width = 60
ws.freeze_panes = "A2"

out = os.path.join(WS, "nirf_eng_pdf.xlsx")
wb.save(out)

na_count = sum(1 for _, u, _ in rows if u == "NOT AVAILABLE")
print("Total rows:", len(rows))
print("Available:", len(rows) - na_count, "| NOT AVAILABLE:", na_count)
print("Problems:", bad if bad else "none")
print("Saved:", out)