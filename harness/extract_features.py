"""
HARNESS STEP 2 -- extract the model INPUTS (x) from each submitted-data PDF.

Primary parser: pdfplumber tables.  Fallback parser: `pdftotext -layout` text.
Nothing is imputed -- if a block cannot be read, that feature is left empty for
that institute-year and the reason is written to harness/out/extract_log.csv.

Feature definitions actually implemented (see report section 3):

  ESCS  % of UG students receiving full tuition fee reimbursement
        = 100 * SUM_over_UG_rows(reimb_state_central + reimb_institution
                                 + reimb_private) / SUM_over_UG_rows(total_students)
  GPHD  mean of the six printed "Ph.D students graduated" cells
        (3 financial years x Full time / Part time)
  GMS   graduating-student-weighted mean of the printed median-salary figures,
        over every (programme, year) cell of the placement section:
        GMS = SUM(salary_i * graduating_i) / SUM(graduating_i)
  FPPP  x1 = mean(3 y of sponsored "Total Amount Received") / faculty_count
        x2 = mean(3 y of consultancy "Total Amount Received") / faculty_count
  SS    NT = sanctioned intake, taken per programme in that programme's own most
        recent year for which the placement section prints an admitted count
        NE = first-year students admitted in that year
        Np = Ph.D students pursuing (full time + part time)
        x1 = NE / NT      x2 = Np / NT
        (NE/NT uses only the programmes that actually report NE, so the ratio
         stays internally consistent; thin coverage is logged)
  FRU   BC = mean(3 y of the four capital-expenditure line items) / total student strength
        BO = mean(3 y of the three operational-expenditure line items) / total student strength
  IPR   NOT EXTRACTABLE -- the PDFs NIRF publishes carry no patents block
        (verified across every downloaded PDF; see harness/out/extract_log.csv)

Usage:  python harness/extract_features.py
"""

import csv
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "harness", "out")
YEARS = [2023, 2024, 2025]

log_rows = []


def note(year, iid, field, status, detail=""):
    log_rows.append([year, iid, field, status, str(detail).replace("\n", " ")[:200]])


# ── small parsing helpers ───────────────────────────────────────────────────

NUM = re.compile(r"-?\d+(?:\.\d+)?")


def num(cell):
    """Leading number of a table cell. '268746540 (Twenty Six Crores)' -> 268746540.
    '-' and '' -> None.  Nothing is invented."""
    if cell is None:
        return None
    s = str(cell).strip()
    if not s or s in {"-", "--", "NA", "N/A", "Nil", "nil"}:
        return None
    m = NUM.search(s.replace(",", ""))
    return float(m.group(0)) if m else None


def txt(cell):
    return re.sub(r"\s+", " ", str(cell or "")).strip()


def parse_number(s):
    """Same rules as num(), for a raw word-layer string."""
    return num(s)


def cells(row):
    """pdfplumber rows can be ragged or None; normalise to a list."""
    return list(row) if row else []


def table_text(t):
    return " ".join(txt(c) for row in t for c in cells(row))


# ── PDF readers ─────────────────────────────────────────────────────────────

# Table-extraction passes, tried in order. Different PDFs degrade differently:
# the default "lines" finder silently drops a row whose column alignment is
# broken in the source file (common in the 2023 sponsored-research block), while
# the text-based passes still see it. The first pass that yields a complete
# block wins.
TABLE_PASSES = [
    {},                                             # pdfplumber default
    {"vertical_strategy": "lines", "horizontal_strategy": "text"},
    {"vertical_strategy": "text", "horizontal_strategy": "text"},
]


def read_tables_pdfplumber(path):
    """All tables of the PDF, across every extraction pass, in pass order."""
    import pdfplumber
    out = []
    with pdfplumber.open(path) as pdf:
        for settings in TABLE_PASSES:
            for page in pdf.pages:
                try:
                    tables = page.extract_tables(settings) or []
                except Exception:  # noqa: BLE001
                    continue
                for t in tables:
                    if t and t[0]:
                        out.append(t)
    return out


def read_text(path):
    """pdftotext -layout fallback."""
    exe = "pdftotext"
    try:
        r = subprocess.run([exe, "-layout", "-enc", "UTF-8", path, "-"],
                           capture_output=True, timeout=120)
        if r.returncode == 0 and r.stdout:
            return r.stdout.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        pass
    return ""


# ── section classifiers ─────────────────────────────────────────────────────

def is_intake(t):
    h = cells(t[0])
    return txt(h[0]) == "Academic Year" and len(h) >= 4 and \
        all(re.fullmatch(r"(19|20)\d\d-\d\d", txt(c) or "") for c in h[1:])


def is_strength(t):
    return txt(cells(t[0])[0]).startswith("(All programs")


def is_placement(t):
    """Header row of a placement table carries 'Median salary of ... graduates'."""
    return "Median salary" in " ".join(txt(c) for c in cells(t[0]))


def is_phd(t):
    return "Ph.D" in txt(cells(t[0])[0]) and "pursuing" in txt(cells(t[0])[0]).lower()


def has_row(t, needle):
    return any(needle.lower() in txt(cells(r)[0]).lower() for r in t)


def find_row(t, needle):
    for r in t:
        r = cells(r)
        if r and needle.lower() in txt(r[0]).lower():
            return r
    return None


def year_cols(t):
    """Map column index -> 'YYYY-YY' for the header row, if it is a year header."""
    h = cells(t[0])
    out = {}
    for i, c in enumerate(h):
        s = txt(c)
        if re.fullmatch(r"(19|20)\d\d-\d\d", s):
            out[i] = s
    return out


def find_block(tables, markers):
    """First table whose first column contains every marker string.

    Markers disambiguate blocks that a single table may hold more than one of
    (e.g. sponsored vs consultancy research)."""
    for t in tables:
        col0 = " | ".join(txt(cells(r)[0]) for r in t).lower()
        if all(m.lower() in col0 for m in markers):
            return t
    return None


def best_block(tables, markers):
    """Table matching the most markers -- used only to report a partial read."""
    best, best_hits = None, 0
    for t in tables:
        col0 = " | ".join(txt(cells(r)[0]) for r in t).lower()
        hits = sum(1 for m in markers if m.lower() in col0)
        if hits > best_hits:
            best, best_hits = t, hits
    return best if best_hits >= max(1, len(markers) - 1) else None


AMOUNT_ROW_RE = re.compile(r"total\s*amount\s*received", re.I)
NUMERIC_RE = re.compile(r"^\(?-?[0-9][0-9,.]*\)?$")
SPONSORED_RE = re.compile(r"sponsored\s*research\s*details", re.I)
CONSULTANCY_RE = re.compile(r"consultancy\s*project\s*details", re.I)


def word_amounts(path):
    """Sponsored / consultancy amounts read straight off the word layer.

    A number of source PDFs wrap the "Total Amount Received" label over two
    lines and print the figures vertically offset from it. pdfplumber's table
    finder then drops the row entirely even though the figures themselves sit in
    clean columns, so those rows are read from word coordinates instead: the
    text is rebuilt into lines, each amount label is matched to the nearest
    horizontal band of numbers beneath it, and the band is attributed to
    whichever section heading precedes it -- carrying the current section across
    a page break, because the figures routinely spill onto the next page while
    the section heading stays behind.
    """
    import pdfplumber
    headings = []            # (page, top, name)
    labels = []              # (page, top)
    bands = []               # (page, top, [numbers left-to-right])
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            words = page.extract_words()
            # Rebuild lines, keeping each line's numeric words and its text.
            by_top = {}
            for w in words:
                by_top.setdefault(round(w["top"]), []).append(w)
            lines = []
            for top in sorted(by_top):
                ws = sorted(by_top[top], key=lambda w: w["x0"])
                lines.append((top, " ".join(w["text"] for w in ws),
                              [w for w in ws if NUMERIC_RE.match(w["text"]) and len(w["text"]) > 2]))
            for top, text, nums in lines:
                if SPONSORED_RE.search(text):
                    headings.append((pi, top, "sponsored"))
                elif CONSULTANCY_RE.search(text):
                    headings.append((pi, top, "consultancy"))
                if AMOUNT_ROW_RE.search(text):
                    labels.append((pi, top))
                if len(nums) >= 2:
                    bands.append((pi, top, [parse_number(w["text"]) for w in nums]))
    headings.sort()

    out = {}
    for pi, ltop in sorted(labels):
        # Nearest band at or just below the label, on the same page.
        cands = [b for b in bands
                 if b[0] == pi and -3 <= b[1] - ltop <= 40 and b not in out.values()]
        if not cands:
            continue
        band = min(cands, key=lambda b: abs(b[1] - ltop))
        name = None
        for hp, htop, hname in headings:
            if (hp, htop) <= (pi, ltop):
                name = hname
            else:
                break
        if name is None or name in out:
            continue
        vals = [v for v in band[2] if v is not None]
        if len(vals) >= 2:
            out[name] = vals
    return out


# ── per-block feature extraction ─────────────────────────────────────────────

def f_escs(t):
    """% of UG students on full tuition fee reimbursement (UG rows only)."""
    h = cells(t[0])
    def col(*needles):
        for i, c in enumerate(h):
            s = txt(c).lower()
            if all(n.lower() in s for n in needles):
                return i
        return None

    i_tot = col("total students")
    i_a = col("reimbursement", "state and central")
    i_b = col("reimbursement", "institution")
    i_c = col("reimbursement", "private")
    if None in (i_tot, i_a, i_b, i_c):
        return None, "strength columns not found"
    num_, den = 0.0, 0.0
    for r in t[1:]:
        r = cells(r)
        prog = txt(r[0])
        if not prog.upper().startswith("UG"):
            continue
        tot = num(r[i_tot]) if i_tot < len(r) else None
        a = num(r[i_a]) if i_a < len(r) else None
        b = num(r[i_b]) if i_b < len(r) else None
        c = num(r[i_c]) if i_c < len(r) else None
        if tot is None or tot <= 0:
            continue
        den += tot
        num_ += (a or 0) + (b or 0) + (c or 0)
    if den <= 0:
        return None, "no UG strength rows"
    return 100.0 * num_ / den, ""


def f_gphd_and_phd(t):
    """(mean PhD graduates over 3 years, PhD students pursuing)."""
    split = None
    for i, r in enumerate(t):
        r = cells(r)
        if r and "graduated" in txt(r[0]).lower():
            split = i
            break
    if split is None:
        return None, None, "no 'Ph.D students graduated' block"

    pursuing = 0.0
    got_pursuing = False
    for r in t[1:split]:
        r = cells(r)
        lab = txt(r[0]).lower() if r else ""
        if lab.startswith("full time") or lab.startswith("part time"):
            for c in r[1:]:
                v = num(c)
                if v is not None:
                    pursuing += v
                    got_pursuing = True
    if not got_pursuing:
        pursuing = None

    yearly_totals = [0.0, 0.0, 0.0]
    has_grad = False
    for r in t[split + 1:]:
        r = cells(r)
        lab = txt(r[0]).lower() if r else ""
        if lab.startswith("full time") or lab.startswith("part time"):
            vals = [num(c) for c in r[1:] if num(c) is not None]
            for idx, val in enumerate(vals[:3]):
                yearly_totals[idx] += val
                has_grad = True
    if not has_grad:
        return None, pursuing, "no PhD graduation cells"
    return sum(yearly_totals) / 3.0, pursuing, ""


def f_gms(tables):
    """Graduating-student-weighted mean median salary over the placement section."""
    num_, den = 0.0, 0.0
    used = 0
    for t in tables:
        if not is_placement(t):
            continue
        h = cells(t[0])
        i_sal = i_grad = None
        for i, c in enumerate(h):
            s = txt(c).lower()
            if "median salary" in s:
                i_sal = i
            if "graduating in minimum stipulated time" in s:
                i_grad = i
        if i_sal is None or i_grad is None:
            continue
        for r in t[1:]:
            r = cells(r)
            sal = num(r[i_sal]) if i_sal < len(r) else None
            grad = num(r[i_grad]) if i_grad < len(r) else None
            if sal is None or grad is None or grad <= 0:
                continue
            num_ += sal * grad
            den += grad
            used += 1
    if den <= 0:
        return None, 0, "no placement rows with a salary and a graduating count"
    return num_ / den, used, ""


def f_faculty(text, tables=None):
    # 1. Search for explicit "Number of faculty members entered" phrase if present
    m = re.search(r"Number of faculty members entered\D{0,40}?([\d,]+)", text, re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", ""))
    
    max_srno = 0
    # 2. Search for Faculty Details serial numbers in document text
    lines = text.split("\n")
    in_faculty = False
    for line in lines:
        if "Faculty Details" in line:
            in_faculty = True
        if in_faculty:
            match = re.match(r"^\s*(\d{1,4})\s+[A-Za-z\s\.\-]{3,}\s+\d{2}\s+", line)
            if match:
                val = int(match.group(1))
                if val > max_srno:
                    max_srno = val

    # 3. Search table cells for highest faculty serial number
    if tables:
        for t in tables:
            if not t:
                continue
            for row in t:
                if not row or not row[0]:
                    continue
                first_cell = str(row[0]).strip()
                if first_cell.isdigit():
                    val = int(first_cell)
                    row_str = " ".join(str(c) for c in row if c).lower()
                    if any(d in row_str for d in ["professor", "lecturer", "ph.d", "m.tech", "regular", "adhoc", "visiting"]):
                        if val > max_srno:
                            max_srno = val

    if max_srno > 0:
        return float(max_srno)
    return None


def f_financial(t, items, fin_years=None):
    """Sum the given line items per financial year, then average over the years.

    pdfplumber sometimes splits the 'Financial Year | 2023-24 | 2022-23 | 2021-22'
    header into a table of its own, leaving the data table headerless. In that
    case the year labels are taken from `fin_years`, discovered once per PDF from
    whichever financial table did keep its header (column order is identical)."""
    cols = year_cols(t)
    if cols:
        colmap = {i: y for i, y in cols.items()}
    elif fin_years:
        colmap = {i + 1: y for i, y in enumerate(fin_years)}
    else:
        return None, "no year columns and no document-level year header"
    per_year = {y: 0.0 for y in colmap.values()}
    found = 0
    for needle in items:
        r = find_row(t, needle)
        if r is None:
            continue
        got = False
        for i, y in colmap.items():
            v = num(r[i]) if i < len(r) else None
            if v is not None:
                per_year[y] += v
                got = True
        if got:
            found += 1
    if found < len(items):
        return None, f"only {found}/{len(items)} line items found"
    return sum(per_year.values()) / len(per_year), ""


CAPITAL_ITEMS = ["Library (", "New Equipment and software", "Engineering Workshops",
                 "Other expenditure on creation of Capital Assets"]
OPERATIONAL_ITEMS = ["Salaries (", "Maintenance of Academic Infrastructure",
                     "Seminars/Conferences/Workshops"]


def f_total_strength(t):
    h = cells(t[0])
    i_tot = None
    for i, c in enumerate(h):
        if txt(c).lower().startswith("total students"):
            i_tot = i
            break
    if i_tot is None:
        return None, "no Total Students column"
    s = 0.0
    for r in t[1:]:
        r = cells(r)
        v = num(r[i_tot]) if i_tot < len(r) else None
        if v is not None:
            s += v
    return (s, "") if s > 0 else (None, "student strength is zero")


def f_ss(intake_t, placement_tables):
    """Student Superstar inputs.

    The placement section reports "first-year students admitted" only for older
    intake years, and the year it reports differs per programme, so NT is taken
    per programme in that programme's OWN most recent reported year. Only
    programmes that actually report an admitted count contribute to either side
    of NE/NT, which keeps the ratio internally consistent; the number of such
    programmes is returned so the caller can log thin coverage.
    """
    cols = year_cols(intake_t)
    if not cols:
        return None, None, 0, "intake table has no year columns"

    # intake[(programme, year)] = sanctioned intake
    intake = {}
    for r in intake_t[1:]:
        r = cells(r)
        prog = txt(r[0])
        if not prog:
            continue
        for i, y in cols.items():
            v = num(r[i]) if i < len(r) else None
            if v is not None:
                intake[(prog, y)] = v

    # latest year each programme reports an admitted count, and that count
    latest = {}
    for pt in placement_tables:
        if not is_placement(pt):
            continue
        h = cells(pt[0])
        i_year = i_adm = None
        # The header repeats "Academic Year" three times (intake / lateral entry /
        # graduation). The intake year is the FIRST one.
        for i, c in enumerate(h):
            if txt(c).lower() == "academic year" and i_year is None:
                i_year = i
            if "first year students admitted" in txt(c).lower():
                i_adm = i
        if i_year is None or i_adm is None:
            continue
        for r in pt[1:]:
            r = cells(r)
            y = txt(r[i_year]) if i_year < len(r) else ""
            v = num(r[i_adm]) if i_adm < len(r) else None
            if not y or v is None:
                continue
            if y not in latest or y > latest[y][0]:
                latest[y] = (y, v, i)

    if not latest:
        return None, None, 0, "no admitted counts in any placement table"

    ne = nt = 0.0
    n_prog = 0
    for y, (_, adm, _i) in latest.items():
        tot = 0.0
        for (prog, yy), v in intake.items():
            if yy == y:
                tot += v
        if tot <= 0:
            continue
        ne += adm
        nt += tot
        n_prog += 1
    if n_prog == 0 or nt <= 0:
        return None, None, 0, "sanctioned intake unavailable for the reported years"
    return nt, ne, n_prog, ""


# ── driver ──────────────────────────────────────────────────────────────────

def extract_one(year, iid, path):
    rec = {"year": year, "institute_id": iid}

    try:
        tables = read_tables_pdfplumber(path)
        via = "pdfplumber"
    except Exception as e:  # noqa: BLE001
        tables = []
        via = "pdftotext-fallback"
        note(year, iid, "_parser", "pdfplumber_failed", e)

    if not tables:
        note(year, iid, "_parser", "no_tables", "")
        return rec, via

    intake = [t for t in tables if is_intake(t)]
    strength = [t for t in tables if is_strength(t)]
    phd = [t for t in tables if is_phd(t)]
    capital = [t for t in [find_block(tables, CAPITAL_ITEMS)] if t]
    operational = [t for t in [find_block(tables, OPERATIONAL_ITEMS)] if t]
    sponsored = [t for t in [find_block(tables, ["Total no. of Sponsored",
                                                  "Total Amount Received"])] if t]
    consultancy = [t for t in [find_block(tables, ["Total no. of Consultancy",
                                                   "Total Amount Received"])] if t]

    # Document-level financial-year column order, for tables that lost their header.
    fin_years = []
    for t in tables:
        hc = cells(t[0])
        if hc and "financial year" in txt(hc[0]).lower():
            cols = year_cols(t)
            if cols:
                fin_years = [cols[i] for i in sorted(cols)]
                break

    # ESCS + total student strength
    if strength:
        v, why = f_escs(strength[0])
        rec["escs_pct"] = v
        if v is None:
            note(year, iid, "escs_pct", "missing", why)
        tot, why = f_total_strength(strength[0])
        rec["total_students"] = tot
        if tot is None:
            note(year, iid, "total_students", "missing", why)
    else:
        note(year, iid, "escs_pct", "missing", "no student-strength table")

    # GPHD + PhD pursuing
    rec["gphd_avg"] = rec["phd_pursuing"] = None
    if phd:
        g, p, why = f_gphd_and_phd(phd[0])
        rec["gphd_avg"], rec["phd_pursuing"] = g, p
        if g is None:
            note(year, iid, "gphd_avg", "missing", why)
    else:
        note(year, iid, "gphd_avg", "missing", "no Ph.D table")

    # GMS
    gms, used, why = f_gms(tables)
    rec["gms_median_salary"] = gms
    rec["gms_cells_used"] = used
    if gms is None:
        note(year, iid, "gms_median_salary", "missing", why)

    # Faculty
    fac = None
    for t in tables:
        r = find_row(t, "Number of faculty members entered")
        if r is not None and len(r) > 1:
            fac = num(r[1])
            break
    if fac is None:
        fac = f_faculty(read_text(path), tables)
        if fac is not None:
            via += "+faculty_text"
    rec["faculty_count"] = fac
    if fac is None:
        note(year, iid, "faculty_count", "missing", "")

    # FPPP
    word_fallback = {}
    for key, t, label in (
            ("fppp_sponsored_per_faculty", sponsored, "sponsored"),
            ("fppp_consultancy_per_faculty", consultancy, "consultancy")):
        rec[key] = None
        vals, why = None, f"no complete {label} block in any extraction pass"
        if t:
            tbl = t[0]
            r = find_row(tbl, "Total Amount Received")
            if r is None:
                why = "no 'Total Amount Received' row"
            else:
                cols = year_cols(tbl) or {i + 1: y for i, y in enumerate(fin_years or [])}
                vals = [num(r[i]) for i in sorted(cols) if i < len(r)]
                vals = [v for v in vals if v is not None]
                why = "no amounts"
        if vals is None:
            if not word_fallback:
                try:
                    word_fallback = word_amounts(path)
                except Exception:  # noqa: BLE001
                    word_fallback = {}
            vals = word_fallback.get(label)
        if not vals:
            note(year, iid, key, "missing", why)
        elif not fac:
            note(year, iid, key, "missing", "faculty count unavailable -> per-faculty undefined")
        else:
            rec[key] = (sum(vals) / len(vals)) / fac

    # SS
    rec["ss_nt"] = rec["ss_ne"] = rec["ss_np"] = rec["ss_x1"] = rec["ss_x2"] = None
    rec["ss_n_prog"] = None
    if intake:
        nt, ne, n_prog, why = f_ss(intake[0], tables)
        rec["ss_nt"] = nt
        rec["ss_ne"] = ne
        rec["ss_n_prog"] = n_prog or None
        rec["ss_np"] = rec["phd_pursuing"]
        if nt:
            if ne is not None:
                rec["ss_x1"] = ne / nt
            if rec["phd_pursuing"] is not None:
                rec["ss_x2"] = rec["phd_pursuing"] / nt
        if n_prog < 4:
            note(year, iid, "ss_ne", "thin",
                 f"admitted counts for only {n_prog} programme(s): {why or ''}".strip())
    else:
        note(year, iid, "ss_nt", "missing", "no sanctioned-intake table")

    # FRU
    total = rec.get("total_students")
    cap = oper = None
    if capital:
        cap, why = f_financial(capital[0], CAPITAL_ITEMS, fin_years)
        if cap is None:
            note(year, iid, "fru_capital_per_student", "missing", why)
    else:
        note(year, iid, "fru_capital_per_student", "missing", "no capital-expenditure table")
    if operational:
        oper, why = f_financial(operational[0], OPERATIONAL_ITEMS, fin_years)
        if oper is None:
            note(year, iid, "fru_operational_per_student", "missing", why)
    else:
        note(year, iid, "fru_operational_per_student", "missing", "no operational table")

    if not total:
        note(year, iid, "fru_*", "missing", "student strength unavailable -> per-student undefined")
    else:
        rec["fru_capital_per_student"] = cap / total if cap is not None else None
        rec["fru_operational_per_student"] = oper / total if oper is not None else None

    # IPR: not present in the published PDFs at all.
    rec["ipr_patents_granted"] = None
    rec["ipr_patents_published"] = None
    rec["parser"] = via
    return rec, via


FIELDS = ["year", "institute_id", "parser", "escs_pct", "gphd_avg", "gms_median_salary",
          "gms_cells_used", "ipr_patents_granted", "ipr_patents_published",
          "fppp_sponsored_per_faculty", "fppp_consultancy_per_faculty",
          "ss_nt", "ss_ne", "ss_np", "ss_x1", "ss_x2",
          "total_students", "faculty_count",
          "fru_capital_per_student", "fru_operational_per_student"]


def main():
    os.makedirs(OUT, exist_ok=True)
    out_rows = []
    for year in YEARS:
        rank = {r["institute_id"]: r
                for r in csv.DictReader(open(os.path.join(DATA, str(year), "ranking.csv"),
                                             encoding="utf-8"))}
        pdfdir = os.path.join(DATA, str(year), "pdf")
        ids = sorted(f[:-4] for f in os.listdir(pdfdir) if f.endswith(".pdf"))
        print("year", year, len(ids), "pdfs")
        for n, iid in enumerate(ids, 1):
            rec, _ = extract_one(year, iid, os.path.join(pdfdir, iid + ".pdf"))
            rec["name"] = rank.get(iid, {}).get("name", "")
            rec["rank"] = rank.get(iid, {}).get("rank", "")
            out_rows.append(rec)
            if n % 25 == 0:
                print("   ", n, "/", len(ids))

    cols = ["year", "institute_id", "name", "rank"] + [f for f in FIELDS if f not in ("year", "institute_id")]
    with open(os.path.join(ROOT, "data", "features_raw.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in out_rows:
            w.writerow({c: r.get(c, "") for c in cols})

    with open(os.path.join(OUT, "extract_log.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["year", "institute_id", "field", "status", "detail"])
        w.writerows(log_rows)

    # completeness summary
    print("\n%-34s %6s %6s %6s" % ("field", "2023", "2024", "2025"))
    for f in ["escs_pct", "gphd_avg", "gms_median_salary", "fppp_sponsored_per_faculty",
              "fppp_consultancy_per_faculty", "ss_x1", "ss_x2",
              "fru_capital_per_student", "fru_operational_per_student", "total_students"]:
        cells = []
        for y in YEARS:
            n = sum(1 for r in out_rows if r["year"] == y and r.get(f) not in (None, ""))
            cells.append(n)
        print("%-34s %6d %6d %6d" % (f, *cells))
    print("\nextract_log.csv rows:", len(log_rows))


if __name__ == "__main__":
    sys.exit(main())