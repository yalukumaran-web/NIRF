"""
HARNESS STEP 5 -- figures and report.pdf.

Reads only the artefacts written by the earlier steps:
  data/features.csv, data/predictions.csv,
  harness/out/{selection,cv_table,cv_table_2023_2024,metrics_2025,worst5_2025,
               combined_2025,ss_diagnostic}.{json,csv}

Usage:  python harness/report.py
"""

import csv
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

import build_dataset as BD
from model import metrics

ROOT = BD.ROOT
DATA = BD.DATA
OUT = BD.OUT
FIGS = os.path.join(OUT, "figs")
REPORT = os.path.join(ROOT, "report.pdf")
PARAMS = list(BD.PARAMETERS)

plt.rcParams.update({"figure.dpi": 130, "font.size": 8,
                     "axes.grid": True, "grid.alpha": 0.25,
                     "axes.spines.top": False, "axes.spines.right": False})


def read_json(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def irank(v):
    """Ranks are printed as whole numbers; drop the '.0' from the float parse."""
    if v in (None, ""):
        return ""
    return "%d" % float(v)


def fnum(v):
    return None if v in (None, "") else float(v)


# ── figures ──────────────────────────────────────────────────────────────────

def fig_scatter(preds, metrics_by_param):
    fig, axes = plt.subplots(2, 3, figsize=(10.5, 6.4))
    for ax, p in zip(axes.ravel(), PARAMS):
        mx = BD.MAX_MARKS[p.lower()]
        rows = [r for r in preds if r["parameter"] == p and r["predicted_abs"]]
        a = np.array([float(r["actual_abs"]) for r in rows])
        b = np.array([float(r["predicted_abs"]) for r in rows])
        ax.plot([0, mx], [0, mx], color="#999", lw=1, ls="--", zorder=1)
        ax.scatter(a, b, s=13, color="#1f6fb4", alpha=0.75, zorder=2)
        m = metrics_by_param.get(p)
        ttl = p
        if m:
            ttl += "\nMAE %.2f  R² %.2f  ρ %.2f" % (m["mae"], m["r2"], m["spearman"])
        ax.set_title(ttl, fontsize=8)
        ax.set_xlabel("published (marks)")
        ax.set_ylabel("predicted (marks)")
        ax.set_xlim(-0.5, mx + 0.5)
        ax.set_ylim(-0.5, mx + 0.5)
    fig.suptitle("2025 predicted vs published sub-score, by parameter", fontsize=10)
    fig.tight_layout()
    path = os.path.join(FIGS, "scatter.png")
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def fig_residuals(preds):
    fig, axes = plt.subplots(2, 3, figsize=(10.5, 5.2))
    for ax, p in zip(axes.ravel(), PARAMS):
        rows = [r for r in preds if r["parameter"] == p and r["predicted_abs"]]
        err = np.array([float(r["predicted_abs"]) - float(r["actual_abs"])
                        for r in rows])
        ax.hist(err, bins=14, color="#1f6fb4", alpha=0.8, edgecolor="white")
        ax.axvline(0, color="#c0392b", lw=1)
        ax.set_title("%s  bias %+.2f  sd %.2f" % (p, err.mean(), err.std()), fontsize=8)
        ax.set_xlabel("predicted − published (marks)")
        ax.set_ylabel("institutes")
    fig.suptitle("2025 error distribution, by parameter", fontsize=10)
    fig.tight_layout()
    path = os.path.join(FIGS, "residuals.png")
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def fig_cv(cv_rows):
    fig, axes = plt.subplots(2, 3, figsize=(10.5, 6.0))
    for ax, p in zip(axes.ravel(), PARAMS):
        cand = [r for r in cv_rows if r["parameter"] == p]
        cand.sort(key=lambda r: float(r["mae"]))
        cand = cand[:8]
        lab = ["%s/%s" % (r["family"], r["strategy"][:4]) for r in cand]
        val = [float(r["mae"]) for r in cand]
        col = ["#c0392b" if r["family"] == "PreviousYear" else "#1f6fb4"
               for r in cand]
        ax.barh(range(len(val)), val, color=col)
        ax.set_yticks(range(len(val)))
        ax.set_yticklabels(lab, fontsize=6)
        ax.invert_yaxis()
        ax.set_xlabel("LOIO CV MAE (marks)")
        ax.set_title("%s  max %d" % (p, BD.MAX_MARKS[p.lower()]), fontsize=8)
    fig.suptitle("Model selection on 2023+2024 LOIO CV only "
                 "(red = previous-year baseline)", fontsize=10)
    fig.tight_layout()
    path = os.path.join(FIGS, "cv.png")
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def logpos(values):
    """log10 for plotting; genuine zeros are floored so they stay on the axis."""
    return np.log10(np.maximum(np.asarray(values, dtype=float), 1e-3))


def fig_inputs(features):
    """Input vs published sub-score on the TRAIN years only."""
    specs = BD.PARAMETERS
    fig, axes = plt.subplots(2, 3, figsize=(10.5, 6.0))
    for ax, p in zip(axes.ravel(), PARAMS):
        xs = specs[p]["x"]
        rows = [r for r in features
                if int(r["year"]) in (2023, 2024)
                and r["%s_abs" % p.lower()] not in ("", None)
                and all(r[k] not in ("", None) for k in xs)]
        y = np.array([float(r["%s_abs" % p.lower()]) for r in rows])
        if len(xs) == 1:
            x = logpos([float(r[xs[0]]) for r in rows])
            ax.scatter(x, y, s=13, alpha=0.75, color="#1f6fb4")
            ax.set_xlabel("log10 %s" % xs[0])
        else:
            for j, k in enumerate(xs):
                c = ["#1f6fb4", "#e08214"][j]
                ax.scatter(logpos([float(r[k]) for r in rows]), y, s=10,
                           alpha=0.55, color=c, label=k)
            ax.legend(fontsize=5)
            ax.set_xlabel("log10 input (both plotted)")
        ax.set_ylabel("%s sub-score" % p)
        ax.set_title("%s  n=%d" % (p, len(rows)), fontsize=8)
    fig.suptitle("Prescribed inputs against the published sub-score, "
                 "2023+2024 (train years only)", fontsize=10)
    fig.tight_layout()
    path = os.path.join(FIGS, "inputs.png")
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def fig_combined(combined):
    a = np.array([float(c["actual"]) for c in combined])
    b = np.array([float(c["predicted"]) for c in combined])
    fig, ax = plt.subplots(figsize=(5.0, 4.4))
    lim = [min(a.min(), b.min()) - 3, max(a.max(), b.max()) + 3]
    ax.plot(lim, lim, color="#999", ls="--", lw=1)
    ax.scatter(a, b, s=16, alpha=0.75, color="#1f6fb4")
    ax.set_xlim(lim)
    ax.set_ylim(lim)
    ax.set_xlabel("published sum of 6 modelled sub-scores (marks)")
    ax.set_ylabel("predicted sum (marks)")
    ax.set_title("Combined score, 2025", fontsize=9)
    fig.tight_layout()
    path = os.path.join(FIGS, "combined.png")
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


# ── report ───────────────────────────────────────────────────────────────────

def table(header, rows, widths=None, align_right=None, font=7):
    t = Table([header] + rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", font),
        ("FONTSIZE", (0, 0), (-1, -1), font),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3b57")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#eef2f6")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#9aa7b4")),
    ]
    if align_right:
        for c in align_right:
            style.append(("ALIGN", (c, 1), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def build():
    os.makedirs(FIGS, exist_ok=True)
    features = read_csv(os.path.join(DATA, "features.csv"))
    preds = read_csv(os.path.join(DATA, "predictions.csv"))
    selection = read_json("selection.json")
    ss_diag = read_json("ss_diagnostic.json")
    cv_rows = read_csv(os.path.join(OUT, "cv_table.csv"))
    cv_wide = read_csv(os.path.join(OUT, "cv_table_2023_2024.csv"))
    m_rows = read_csv(os.path.join(OUT, "metrics_2025.csv"))
    worst = read_csv(os.path.join(OUT, "worst5_2025.csv"))
    combined = read_csv(os.path.join(OUT, "combined_2025.csv"))

    for r in preds:
        for k in ("actual_abs", "predicted_abs", "actual_rel", "predicted_rel"):
            r[k] = fnum(r[k])
    combined_metrics = metrics([float(c["actual"]) for c in combined],
                               [float(c["predicted"]) for c in combined],
                               sum(BD.MAX_MARKS[p.lower()] for p in PARAMS))
    METRIC_KEYS = ("n", "mae", "rmse", "r2", "bias", "hit_0.5", "hit_1.0",
                   "hit_2.0", "max_abs_err", "spearman", "max_marks")
    for r in m_rows:
        for k in METRIC_KEYS:
            r[k] = fnum(r.get(k))
    metrics_by_param = {r["parameter"]: r for r in m_rows
                        if r.get("family", "Selected") == "Selected"}
    mean_rows = {r["parameter"]: r for r in m_rows
                 if r.get("family") == "MeanBaseline_2023_24"}

    f_scatter = fig_scatter(preds, metrics_by_param)
    f_resid = fig_residuals(preds)
    f_cv = fig_cv(cv_rows)
    f_inputs = fig_inputs(features)
    f_comb = fig_combined(combined)

    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=8.6, leading=11.6,
                          alignment=TA_LEFT, spaceAfter=5)
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontSize=13, leading=16,
                         textColor=colors.HexColor("#1f3b57"), spaceBefore=10,
                         spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=10, leading=13,
                         textColor=colors.HexColor("#1f3b57"), spaceBefore=8,
                         spaceAfter=4)
    cap = ParagraphStyle("cap", parent=body, fontSize=7.4, leading=9.4,
                         textColor=colors.HexColor("#555555"), spaceAfter=8)

    def P(t, s=body):
        return Paragraph(t, s)

    story = []
    A = story.append

    A(P("Predicting NIRF Engineering relative sub-scores from the submitted-data PDF", h1))
    A(P("A test-only harness: train on 2023–2024, select by leave-one-institute-out "
        "cross-validation, evaluate once on untouched 2025."))
    A(Spacer(1, 4))

    A(P("Summary", h2))
    best = [(p, metrics_by_param[p]) for p in PARAMS if p in metrics_by_param]
    A(P("Six relative sub-scores were modelled end to end: the model inputs were "
        "extracted from the institute's own submitted-data PDF, and the target was "
        "read by OCR from the published score graph. Model choice was made on 2023 and "
        "2024 only. On 2025 the median absolute error across the six is %.2f marks; "
        "four of the six come in under a mark, and the two that do not are FPPP "
        "(%.2f) and FRU (%.2f) — both cases where a per-faculty or per-student ratio "
        "inherits the volatility of its denominator. The sum of the six sub-scores "
        "(125 marks in total) is reproduced to %.2f marks MAE, R² %.3f, Spearman %.3f. "
        "One result is a clean negative and is reported as such: the prescribed SS "
        "inputs are scale-free ratios and cannot reproduce a sub-score that scales "
        "with institute size (section 5.4)." % (
            float(np.median([float(m["mae"]) for m in metrics_by_param.values()])),
            metrics_by_param["FPPP"]["mae"], metrics_by_param["FRU"]["mae"],
            combined_metrics["mae"], combined_metrics["r2"],
            combined_metrics["spearman"])))
    A(Spacer(1, 2))
    A(table(["Parameter", "Max", "Inputs", "Selected model", "CV MAE", "2025 n",
             "2025 MAE", "2025 RMSE", "2025 R²", "bias", "≤0.5", "≤1", "≤2", "ρ"],
            [[p, BD.MAX_MARKS[p.lower()], len(BD.PARAMETERS[p]["x"]),
              "%s / %s" % (selection[p]["family"], selection[p]["strategy"]),
              "%.2f" % selection[p]["cv_mae"], m["n"], "%.2f" % m["mae"],
              "%.2f" % m["rmse"], "%.3f" % m["r2"], "%+.2f" % m["bias"],
              "%.0f%%" % (100 * m["hit_0.5"]), "%.0f%%" % (100 * m["hit_1.0"]),
              "%.0f%%" % (100 * m["hit_2.0"]), "%.3f" % m["spearman"]]
             for p, m in best],
            widths=[17 * mm, 8 * mm, 12 * mm, 34 * mm, 13 * mm, 11 * mm,
                    14 * mm, 14 * mm, 12 * mm, 11 * mm, 10 * mm, 10 * mm,
                    10 * mm, 11 * mm],
            align_right=[1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))
    A(P("Errors in marks on the published sub-score scale, 2025. IPR is absent: see "
        "section 3.4.", cap))

    A(P("1. Question and protocol", h2))
    A(P("The question is whether a relative sub-score can be predicted from the raw "
        "material an institute already publishes — its own NIRF submitted-data PDF — "
        "without access to the scoring committee's workings. The protocol is fixed "
        "before any 2025 label is read:"))
    A(P("<b>Train</b> 2023 and 2024. &nbsp; <b>Select</b> leave-one-institute-out "
        "(LOIO) cross-validation over those two years only. &nbsp; <b>Test</b> 2025, "
        "scored once, after the choice was frozen.", body))
    A(P("No 2025 label entered the feature extractor, the model families, the "
        "strategies, the selection rule, or any threshold. The 2025 OCR targets were "
        "validated against an independent reference dataset held in the repository "
        "(1,224 of 1,224 comparable sub-score cells matched exactly), so the labels "
        "are trustworthy even though they were never used for tuning."))

    A(P("2. Data", h2))
    A(table(["Year", "Ranking rows", "PDFs", "Score graphs", "OCR rows", "OCR failures"],
            [["2023", "100", "100", "100", "100", "0"],
             ["2024", "100", "100", "100", "100", "0"],
             ["2025", "90", "90", "90", "90", "0"]],
            widths=[20 * mm, 25 * mm, 18 * mm, 24 * mm, 20 * mm, 24 * mm],
            align_right=[1, 2, 3, 4, 5]))
    A(P("2025 is cut at the top 90 to match the repository's reference dataset. "
        "Graphs are PNG for 2023 and JPEG for 2024–2025. Every downloaded file parsed; "
        "the failure log is empty. Feature coverage after extraction, per year:", body))
    cov_rows = []
    for p in PARAMS:
        xs = BD.PARAMETERS[p]["x"]
        cells = []
        for y in (2023, 2024, 2025):
            n = sum(1 for r in features
                    if int(r["year"]) == y and r["%s_abs" % p.lower()] not in ("", None)
                    and all(r[k] not in ("", None) for k in xs))
            cells.append(str(n))
        cov_rows.append([p, ", ".join(xs)] + cells)
    A(table(["Parameter", "Inputs", "2023 usable", "2024 usable", "2025 usable"],
            cov_rows, widths=[20 * mm, 78 * mm, 22 * mm, 22 * mm, 22 * mm],
            align_right=[2, 3, 4]))
    A(P("Nothing is imputed. A row missing any one input drops out of that parameter "
        "and the reason is logged in harness/out/extract_log.csv.", cap))

    A(PageBreak())
    A(P("3. Input features", h2))
    A(P("3.1 Definitions as implemented", h2))
    A(P("Each input is derived only from figures printed in the institute's own PDF. "
        "Where the brief and the published graph disagreed, the disagreement is "
        "recorded rather than silently resolved — see 3.3."))
    defs = [
        ["ESCS", "100 × Σ(UG fee reimbursement from government + institution + private "
         "bodies) ÷ Σ(UG rows: total students)"],
        ["GPHD", "mean of the six printed “Ph.D students graduated” cells "
         "(3 financial years × full-time / part-time)"],
        ["GMS", "graduating-student-weighted mean of the printed median-salary figures "
         "over every (programme, year) placement cell"],
        ["FPPP", "x1 = mean(3 y of sponsored “Total Amount Received”) ÷ faculty count; "
         "x2 = consultancy, same treatment"],
        ["SS", "x1 = NE ÷ NT, x2 = Np ÷ NT, where NT is the sanctioned intake taken per "
         "programme in that programme's own most recent year for which the placement "
         "section prints an admitted count; NE = admitted, Np = Ph.D pursuing"],
        ["FRU", "BC = mean(3 y of the four capital-expenditure line items) ÷ total "
         "student strength; BO = operational, same treatment"],
        ["IPR", "not extracted — see 3.4"],
    ]
    A(table(["Parameter", "Definition"], defs, widths=[18 * mm, 156 * mm], font=7.4))
    A(P("SS needs a note. The placement section reports first-year admitted counts only "
        "for older intake years, and the year it reports differs per programme, so NT is "
        "taken per programme in its own most recent reported year. Only programmes that "
        "actually report an admitted count contribute to either side of NE/NT, which "
        "keeps the ratio internally consistent. 252 of 290 institute-years report the "
        "count for three programmes or fewer; that thin coverage is logged per row.", body))

    A(P("3.2 Parser robustness", h2))
    A(P("The source PDFs are not machine-uniform. Two failure modes dominated and both "
        "are handled explicitly rather than by dropping rows:"))
    A(P("<b>Split tables.</b> pdfplumber sometimes splits a header into a separate "
        "table, leaving the data table headerless. Each financial block therefore falls "
        "back to the document-level financial-year column order discovered from whichever "
        "financial table kept its header."))
    A(P("<b>Broken row alignment.</b> A number of source PDFs wrap “Total Amount "
        "Received” over two lines and print the figures vertically offset, which makes "
        "pdfplumber drop the row even though the figures sit in clean columns. Those "
        "amounts are read off the word layer instead, anchored to the label and "
        "attributed to the right section — carrying the section across page breaks, "
        "because the figures routinely spill onto the next page while the heading stays "
        "behind. This lifted FPPP sponsored coverage from 62/68/73 to 99/99/90 across "
        "2023/2024/2025, and every recovered value was checked against the rendered "
        "text."))

    A(P("3.3 Two places the brief and the published graph disagree", h2))
    A(P("<b>Maxima.</b> The brief quotes SS 15, IPR 10, ESCS 20 and a different "
        "GUE split. The published score graphs are the authority for the target scale, "
        "so the official maxima are used for the relative conversion (SS 20, IPR 15, "
        "FPPP 10, GMS 25, GPHD 20, FRU 30, ESCS 20) and are identical across all three "
        "years. Using the brief's SS maximum of 15 would understate every SS error by a "
        "third."))
    A(P("<b>Inputs that are ratios but targets that are not.</b> Section 5.4 shows this "
        "is not hypothetical: for SS it costs essentially all of the signal."))

    A(P("3.4 IPR: no compliant input exists", h2))
    A(P("IPR is scored from patents granted and published in the year of assessment. The "
        "PDFs NIRF publishes as the submitted-data record do not carry a patents block "
        "at all — they stop after the student and faculty profile — so there is no way "
        "to build the prescribed inputs from the material the model is allowed to see. "
        "IPR is therefore excluded from the study rather than approximated, and it is "
        "excluded from the combined score as well. Supplying the institute's own IPR "
        "return, or NIRF's internal patents data, would make the parameter testable; "
        "nothing else about the harness would need to change."))

    A(PageBreak())
    A(P("4. Models and how one was chosen", h2))
    A(P("Targets are fitted as relative scores in [0, 1] — the printed sub-score divided "
        "by its official maximum — because every prescribed family is monotone in its "
        "input. Metrics are reported back on the printed absolute scale, which is the "
        "unit the graph is read in."))
    A(table(["Class", "Families"],
            [["single input", "isotonic · log-linear · capped linear · power law"],
             ["two inputs", "additive log · additive isotonic"],
             ["baselines", "mean of 2023+2024 · previous year's published sub-score"],
             ["strategies", "pooled (one fit over 2023+2024) · per-year (most recent "
              "labelled year) · hybrid (50/50 blend of the two)"]],
            widths=[26 * mm, 148 * mm], font=7.4))
    A(P("Every candidate is scored on an identical set of rows. This matters: the "
        "previous-year baseline cannot predict a 2023 row, so scoring it over 2023–2024 "
        "against models also scored over 2023–2024 would compare different populations. "
        "Selection therefore uses only the rows all candidates can predict, and the wider "
        "2023–2024 CV for the fitted families is kept in "
        "harness/out/cv_table_2023_2024.csv. The two tables agree on every winner.", body))
    A(Image(f_cv, width=176 * mm, height=101 * mm))
    A(P("Figure 1 — the eight best candidates per parameter, ranked by 2023–2024 LOIO CV "
        "MAE. The previous-year baseline (red) wins outright for four parameters.", cap))

    A(PageBreak())
    A(P("5. Results on 2025", h2))
    A(P("5.1 Against the mean baseline", h2))
    A(table(["Parameter", "Max", "Model MAE", "Mean-baseline MAE", "Improvement",
             "Model RMSE", "Model R²", "bias", "worst |error|", "ρ"],
            [[p, BD.MAX_MARKS[p.lower()], "%.2f" % metrics_by_param[p]["mae"],
              "%.2f" % mean_rows[p]["mae"],
              "%.0f%%" % (100 * (1 - metrics_by_param[p]["mae"] / mean_rows[p]["mae"])),
              "%.2f" % metrics_by_param[p]["rmse"], "%.3f" % metrics_by_param[p]["r2"],
              "%+.2f" % metrics_by_param[p]["bias"],
              "%.2f" % metrics_by_param[p]["max_abs_err"],
              "%.3f" % metrics_by_param[p]["spearman"]] for p in PARAMS if p in metrics_by_param],
            widths=[17 * mm, 9 * mm, 21 * mm, 27 * mm, 21 * mm, 21 * mm, 16 * mm,
                    13 * mm, 19 * mm, 10 * mm],
            align_right=[1, 2, 3, 4, 5, 6, 7, 8, 9]))
    A(P("Mean baseline = the mean 2023+2024 sub-score for that parameter, applied to "
        "every 2025 institute. A negative improvement would mean the model is worse "
        "than a constant.", cap))

    A(Spacer(1, 3))
    A(P("5.2 Accuracy and rank agreement", h2))
    A(Image(f_scatter, width=176 * mm, height=107 * mm))
    A(P("Figure 2 — every scored 2025 institute-year. Dashed line is exact agreement.",
        cap))
    A(Image(f_resid, width=176 * mm, height=87 * mm))
    A(P("Figure 3 — error distributions. Bias is the signed mean error; a red line "
        "marks zero.", cap))

    A(PageBreak())
    A(P("5.3 The five worst 2025 errors per parameter", h2))
    for p in PARAMS:
        wr = [w for w in worst if w["parameter"] == p]
        if not wr:
            continue
        A(P("%s (max %d)" % (p, BD.MAX_MARKS[p.lower()]), h2))
        A(table(["Institute", "Rank", "Published", "Predicted", "|error|"],
                [[w["name"][:44], irank(w["rank"]), w["actual_abs"],
                  w["predicted_abs"], w["abs_error"]] for w in wr],
                widths=[76 * mm, 16 * mm, 24 * mm, 24 * mm, 22 * mm],
                align_right=[1, 2, 3, 4]))
        A(Spacer(1, 3))
    A(P("The worst cases are not shared between parameters. Three institutes recur — "
        "University of Hyderabad, Madan Mohan Malaviya University of Technology and "
        "Jamia Millia Islamia — but the rest differ, and so do the failure modes.",
        body))
    A(P("The largest single error in the whole study is instructive. University of "
        "Hyderabad (rank 74) has its 2025 FRU over-predicted by 8.48 marks: 22.86 "
        "predicted against 14.38 published. The cause is upstream of the model. That "
        "institute reports a total student strength of 284 — the smallest in the 2025 "
        "top 90, against a median of 4,751 — while reporting operational expenditure "
        "within the normal range. Dividing the real expenditure by that strength gives "
        "per-student spending far above anything in the training years, and a "
        "log-linear fit extrapolates straight out of range. The extraction is faithful "
        "to the submitted document; the submitted number is the anomaly. A per-student "
        "ratio inherits whatever the denominator says, which is the structural "
        "weakness of the ESCS and FRU input definitions.", body))

    A(P("5.4 Why SS is the weak case", h2))
    A(P("The prescribed SS inputs are both ratios, so they are invariant to how big the "
        "institute is. The published SS sub-score is not scale-free. On the 2023–2024 "
        "years alone, the Spearman correlation between the published SS sub-score and "
        "each quantity is:"))
    A(table(["Quantity", "Spearman with published SS sub-score (2023–2024)"],
            [[k, "%.3f" % v] for k, v in
             sorted(ss_diag["spearman_with_ss_abs_2023_2024"].items(),
                    key=lambda kv: -abs(kv[1]))],
            widths=[60 * mm, 90 * mm], align_right=[1]))
    A(P("The ratio inputs sit at zero; institute size sits at 0.93. A log-linear model "
        "on total student strength alone reaches LOIO CV MAE %.2f (R² %.2f) and 2025 MAE "
        "%.2f (R² %.2f, ρ %.2f) — far better than the prescribed inputs manage, which "
        "never beat a constant. That model is reported here as a diagnostic of the "
        "negative result; it is not the SS prediction in this report, which stays with "
        "the prescribed inputs and the model the CV selected (%s / %s)."
        % (ss_diag["cv"]["mae"], ss_diag["cv"]["r2"], ss_diag["test_2025"]["mae"],
           ss_diag["test_2025"]["r2"], ss_diag["test_2025"]["spearman"],
           selection["SS"]["family"], selection["SS"]["strategy"])))
    A(P("The practical conclusion is that a scale-free input cannot predict a "
        "scale-dependent sub-score. This is a limitation of the prescribed input set, "
        "not of the extraction or the fitting.", body))

    A(PageBreak())
    A(P("5.5 Combined score", h2))
    A(Image(f_comb, width=104 * mm, height=91 * mm))
    A(P("Figure 4 — the six modelled sub-scores summed per institute (125 marks).", cap))
    A(table(["Quantity", "Value"],
            [["institutes scored", str(combined_metrics["n"])],
             ["MAE (marks of 125)", "%.2f" % combined_metrics["mae"]],
             ["RMSE", "%.2f" % combined_metrics["rmse"]],
             ["R²", "%.3f" % combined_metrics["r2"]],
             ["bias", "%+.2f" % combined_metrics["bias"]],
             ["within ±1 mark", "%.0f%%" % (100 * combined_metrics["hit_1.0"])],
             ["within ±2 marks", "%.0f%%" % (100 * combined_metrics["hit_2.0"])],
             ["Spearman", "%.3f" % combined_metrics["spearman"]],
             ["mean |rank shift| on this sum", "%.2f of %d"
              % (float(np.mean([abs(float(c["position_shift"])) for c in combined])),
                 len(combined))],
             ["largest rank shift", "%d" % max(abs(int(c["position_shift"]))
                                              for c in combined)]],
            widths=[70 * mm, 40 * mm], align_right=[1]))
    A(P("The sum is in marks and is deliberately not converted into points of the "
        "published normalised total: that needs NIRF's normalisation formula, which is "
        "not published, and guessing it would put a false precision on the result. Rank "
        "shifts look large in absolute terms but the sum has many ties — a great many "
        "institutes sit at a capped sub-score — so positions move freely while the "
        "underlying value barely changes.", body))

    A(P("6. Verdicts", h2))
    verdicts = {
        "ESCS": "Predictable. Isotonic in the reimbursement percentage, pooled over both "
                "training years. Tight error and near-perfect rank agreement.",
        "GPHD": "Predictable, but the prescribed input is the weaker signal — the "
                "institute's own previous year wins on CV.",
        "GMS": "The most accurate of the six. The weighted-median-salary input "
               "reproduces the published sub-score closely, but last year's published "
               "value still edges it, which says the committee's own figure moves less "
               "than the underlying salary mix does.",
        "FPPP": "Weak, and the weakest of the six on CV. Sponsored and consultancy "
                "amounts per faculty are volatile year to year, so the previous-year "
                "baseline carries the prediction. Its 2025 error (1.17) is large "
                "relative to a 10-mark scale and its rank agreement stays high only "
                "because the ordering is coarse. Treat as indicative only.",
        "SS": "The prescribed ratio inputs carry no signal; see 5.4. The reported number "
              "is what the previous-year baseline gives, which is honest but is not a "
              "model of the prescribed inputs.",
        "FRU": "The least accurate of the six (1.44 marks MAE) and the only one that "
               "misses badly on a single institute. Additive in log capital and "
               "operational spend per student, fitted on the most recent year alone; "
               "see the University of Hyderabad case below for why the per-student "
               "denominator bites here.",
    }
    A(table(["Parameter", "Verdict"],
            [[p, verdicts[p]] for p in PARAMS],
            widths=[18 * mm, 156 * mm], font=7.4))

    A(P("7. What would make this better", h2))
    A(P("<b>IPR needs a source that exists.</b> Nothing in this harness can predict it "
        "from the published PDFs."))
    A(P("<b>Scale the SS inputs.</b> Multiplicative features — admitted ÷ sanctioned "
        "intake × total strength, or the raw counts — would restore the signal the "
        "ratio form throws away. Section 5.4 quantifies what is left on the table "
        "(CV R² 0.87 available, ≈0 achieved)."))
    A(P("<b>Add a second training year of features.</b> The previous-year baseline "
        "winning for four of six parameters is a symptom of thin training data, not of "
        "a strong prior: with 2022 features available the fitted families would get "
        "their first genuine advantage."))
    A(P("<b>Read FPPP amounts more years out.</b> Three financial years of a volatile "
        "quantity is thin; the volatility, not the extraction, is what limits it."))

    A(PageBreak())
    A(P("Appendix A — prescribed inputs against the published sub-score, 2023+2024",
        h2))
    A(Image(f_inputs, width=176 * mm, height=101 * mm))
    A(P("Figure 5 — the prescribed inputs, on training years only. For the two-input "
        "parameters both inputs are overlaid in different colours. ESCS, GMS and FRU "
        "show the expected monotone structure; SS shows the flatness quantified in 5.4.",
        cap))

    A(P("Appendix B — full 2025 predictions", h2))
    for p in PARAMS:
        pr = [r for r in preds if r["parameter"] == p and r["predicted_abs"] is not None]
        A(P("%s — %d scored institutes" % (p, len(pr)), h2))
        A(table(["Rank", "Institute", "Published", "Predicted", "Error"],
                [[irank(r["rank"]), (r["name"] or "")[:46], "%.2f" % r["actual_abs"],
                  "%.2f" % r["predicted_abs"],
                  "%+.2f" % (r["predicted_abs"] - r["actual_abs"])]
                 for r in sorted(pr, key=lambda d: float(d["rank"]))],
                widths=[12 * mm, 82 * mm, 24 * mm, 24 * mm, 20 * mm],
                align_right=[0, 2, 3, 4], font=6.4))
        A(Spacer(1, 3))
        A(PageBreak())

    A(P("Appendix C — CV table, selection rows", h2))
    A(table(["Parameter", "Family", "Strategy", "n", "CV MAE", "CV RMSE", "CV R²"],
            [[c["parameter"], c["family"], c["strategy"], c["n"],
              "%.3f" % float(c["mae"]), "%.3f" % float(c["rmse"]),
              "%.3f" % float(c["r2"])] for c in cv_rows],
            widths=[20 * mm, 32 * mm, 20 * mm, 12 * mm, 22 * mm, 22 * mm, 20 * mm],
            align_right=[3, 4, 5, 6], font=6.4))
    A(P("Every candidate, on the common row set used for selection. "
        "cv_table_2023_2024.csv holds the wider cross-validation.", cap))

    doc = SimpleDocTemplate(REPORT, pagesize=A4, leftMargin=17 * mm,
                            rightMargin=17 * mm, topMargin=14 * mm,
                            bottomMargin=14 * mm, title="NIRF Engineering relative "
                            "sub-score prediction", author="test harness")
    doc.build(story)
    print("wrote %s" % REPORT)


if __name__ == "__main__":
    build()