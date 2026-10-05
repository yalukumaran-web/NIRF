"""
HARNESS STEP 4 -- fit the prescribed models and evaluate on 2025.

Protocol
--------
Train : 2023 + 2024 only.
Select: leave-one-institute-out (LOIO) cross-validation over those two years.
Test  : 2025, touched once, after selection was frozen.

Nothing about 2025 -- not a parameter, not a threshold, not a tie-break -- is
used while choosing a model. Every 2025 number this script prints is a
prediction against a label the selection never saw.

Model families
--------------
single input   isotonic, log-linear, capped linear, power law
two inputs     additive log, additive isotonic
baselines      mean, previous year's published sub-score

Strategies
----------
pooled     one fit per parameter over 2023 + 2024 together
per_year   fit on the most recent labelled year only (2024; 2025 has no labels)
hybrid     50/50 blend of the pooled and per-year predictions

Scale
-----
Targets are fitted as relative scores in [0, 1] (printed sub-score / official
max marks) because every prescribed family is monotone in its input. Metrics are
reported on the printed absolute scale, which is the unit the score graph uses.

Usage:  python harness/model.py
"""

import csv
import json
import os

import numpy as np
from scipy.stats import spearmanr
from sklearn.isotonic import IsotonicRegression

import build_dataset as BD

ROOT = BD.ROOT
DATA = BD.DATA
OUT = BD.OUT
TRAIN_YEARS = [2023, 2024]
TEST_YEAR = 2025
SEED = 20260905          # fixed for reproducibility; numpy RNG is used only for
                         # the isotonic tie-break jitter, and results are stable
MIN_ISO_POINTS = 5
CLIP_LO, CLIP_HI = 0.0, 1.0


# ── model families ───────────────────────────────────────────────────────────

def _ols(basis, y):
    """Least squares with an intercept; basis(X) -> (n, k)."""
    A = np.hstack([basis, np.ones((basis.shape[0], 1))])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    return coef


def _apply(coef, basis):
    return np.hstack([basis, np.ones((basis.shape[0], 1))]) @ coef


class Family:
    """name, n_inputs, fit(X, y_rel) -> self, predict(X) -> y_rel in [0,1]."""
    n_inputs = 1
    needs_history = False

    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return self.name


class Isotonic(Family):
    n_inputs = 1

    def fit(self, X, y):
        self.lo, self.hi = float(y.min()), float(y.max())
        if len(y) < MIN_ISO_POINTS:
            return self
        self.m = IsotonicRegression(increasing=True, out_of_bounds="clip",
                                    y_min=self.lo, y_max=self.hi)
        self.m.fit(X[:, 0], y)
        return self

    def predict(self, X):
        if not hasattr(self, "m"):
            return np.full(len(X), np.nan)
        return np.clip(self.m.predict(X[:, 0]), CLIP_LO, CLIP_HI)


class LogLinear(Family):
    n_inputs = 1

    def fit(self, X, y):
        self.coef = _ols(np.log1p(X[:, [0]]), y)
        return self

    def predict(self, X):
        return np.clip(_apply(self.coef, np.log1p(X[:, [0]])), CLIP_LO, CLIP_HI)


class PowerLaw(Family):
    """y = a * x^b, fitted in log-log space; falls back to capped linear when the
    data make the log fit undefined (non-positive x or y)."""
    n_inputs = 1

    def fit(self, X, y):
        x, yy = X[:, 0], y
        self._fallback = None
        if np.all(x > 0) and np.all(yy > 0):
            A = np.hstack([np.log(x).reshape(-1, 1), np.ones((len(x), 1))])
            self.coef, *_ = np.linalg.lstsq(A, np.log(yy), rcond=None)
        else:
            self._fallback = CappedLinear("power_fallback")
            self._fallback.fit(X, y)
        return self

    def predict(self, X):
        if self._fallback is not None:
            return self._fallback.predict(X)
        x = np.clip(X[:, 0], 1e-9, None)
        return np.clip(np.exp(self.coef[1]) * x ** self.coef[0], CLIP_LO, CLIP_HI)


class CappedLinear(Family):
    n_inputs = 1

    def fit(self, X, y):
        self.coef = _ols(X[:, [0]], y)
        return self

    def predict(self, X):
        return np.clip(_apply(self.coef, X[:, [0]]), CLIP_LO, CLIP_HI)


class AdditiveLog(Family):
    n_inputs = 2

    def fit(self, X, y):
        self.coef = _ols(np.log1p(X), y)
        return self

    def predict(self, X):
        return np.clip(_apply(self.coef, np.log1p(X)), CLIP_LO, CLIP_HI)


class AdditiveIsotonic(Family):
    """y = f1(x1) + f2(x2), each term an independent isotonic fit.

    The marginal fits ignore the correlation between the two inputs, so the sum
    is then rescaled to reproduce the training mean of y before clipping; without
    that the sum over-counts the shared variance."""
    n_inputs = 2

    def fit(self, X, y):
        self.m = []
        for j in range(2):
            if len(y) >= MIN_ISO_POINTS:
                lo, hi = float(y.min()), float(y.max())
                iso = IsotonicRegression(increasing=True, out_of_bounds="clip",
                                         y_min=lo, y_max=hi)
                iso.fit(X[:, j], y)
            else:
                iso = None
            self.m.append(iso)
        raw = self._raw(X)
        self.scale = float(y.mean() / raw.mean()) if raw.mean() > 1e-12 else 1.0
        return self

    def _raw(self, X):
        out = np.zeros(len(X))
        for j, iso in enumerate(self.m):
            out += np.full(len(X), float(np.mean(X[:, j]))) if iso is None \
                else iso.predict(X[:, j])
        return out

    def predict(self, X):
        return np.clip(self._raw(X) * self.scale, CLIP_LO, CLIP_HI)


class MeanBaseline(Family):
    def fit(self, X, y):
        self.mu = float(y.mean())
        return self

    def predict(self, X):
        return np.full(len(X), self.mu)


def families_for(n_inputs):
    if n_inputs == 1:
        return [Isotonic, LogLinear, CappedLinear, PowerLaw, MeanBaseline]
    return [AdditiveLog, AdditiveIsotonic, MeanBaseline]


# ── strategies: which rows a fit is allowed to see ───────────────────────────

def training_rows(strategy, target_year, sel, key, exclude_iid=None):
    """Rows a model may be fitted on when predicting `target_year`.

    `sel` is already restricted to this parameter's rows with every input
    present, so the only filter left is the institute being held out."""
    sel = [r for r in sel if r["%s_rel" % key] is not None]
    if exclude_iid is not None:
        sel = [r for r in sel if r["institute_id"] != exclude_iid]
    if strategy == "pooled":
        return sel
    latest = max(y for y in TRAIN_YEARS)
    return [r for r in sel if r["year"] == latest]


def build(strategy, family_cls, sel, key, xkeys):
    m = family_cls(family_cls.__name__)
    X = np.array([[r[k] for k in xkeys] for r in sel], dtype=float)
    y = np.array([r["%s_rel" % key] for r in sel], dtype=float)
    return m.fit(X, y)


def predict_row(strategy, family_cls, train_rows, key, xkeys, row, fitted_cache,
                exclude_iid=None):
    """Fit (or reuse) and predict one row, honouring the hybrid blend.

    `exclude_iid` holds the institute out of the fit (leave-one-institute-out).
    `fitted_cache` is keyed by the strategy actually used, because hybrid reuses
    the pooled and per_year fits rather than fitting anything of its own."""
    strategies = ("pooled", "per_year") if strategy == "hybrid" else (strategy,)
    parts = []
    for strat in strategies:
        sel = training_rows(strat, row["year"], train_rows, key, exclude_iid)
        if len(sel) < MIN_ISO_POINTS:
            continue
        m = fitted_cache.get(strat)
        if m is None:
            m = build(strat, family_cls, sel, key, xkeys)
            fitted_cache[strat] = m
        X = np.array([[row[k] for k in xkeys]], dtype=float)
        parts.append(float(m.predict(X)[0]))
    if not parts:
        return np.nan
    return float(np.mean(parts)) if strategy == "hybrid" else parts[0]


# ── previous-year baseline (needs the institute's own history) ───────────────

def prev_year_actual(row, key, by_iid):
    if row["year"] - 1 not in TRAIN_YEARS:
        return None
    prior = by_iid.get((row["institute_id"], row["year"] - 1))
    return None if prior is None else prior["%s_abs" % key]


# ── metrics ──────────────────────────────────────────────────────────────────

def metrics(actual, pred, max_marks):
    actual, pred = np.asarray(actual, float), np.asarray(pred, float)
    ok = np.isfinite(actual) & np.isfinite(pred)
    a, p = actual[ok], pred[ok]
    if len(a) == 0:
        return None
    err = p - a
    ss_res = float(((a - p) ** 2).sum())
    ss_tot = float(((a - a.mean()) ** 2).sum())
    rho = (spearmanr(a, p).statistic
           if len(a) > 2 and len(set(a)) > 1 and len(set(np.round(p, 9))) > 1
           else np.nan)
    return {
        "n": int(len(a)),
        "mae": float(np.abs(err).mean()),
        "rmse": float(np.sqrt((err ** 2).mean())),
        "r2": float(1 - ss_res / ss_tot) if ss_tot > 0 else np.nan,
        "bias": float(err.mean()),
        "hit_0.5": float((np.abs(err) <= 0.5).mean()),
        "hit_1.0": float((np.abs(err) <= 1.0).mean()),
        "hit_2.0": float((np.abs(err) <= 2.0).mean()),
        "max_abs_err": float(np.abs(err).max()),
        "spearman": float(rho) if np.isfinite(rho) else None,
        "max_marks": max_marks,
    }


METRIC_COLS = ["n", "mae", "rmse", "r2", "bias", "hit_0.5", "hit_1.0", "hit_2.0",
               "max_abs_err", "spearman", "max_marks"]


# ── main ─────────────────────────────────────────────────────────────────────

def load_rows():
    rows = []
    with open(os.path.join(DATA, "features.csv"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rec = {k: r[k] for k in ("year", "institute_id", "name", "rank")}
            rec["year"] = int(rec["year"])
            rec["rank"] = float(rec["rank"]) if rec["rank"] else None
            rec["total_score"] = float(r["total_score"]) if r["total_score"] else None
            for k, v in r.items():
                if k in ("year", "institute_id", "name", "rank", "total_score"):
                    continue
                rec[k] = float(v) if v not in (None, "") else None
            rows.append(rec)
    return rows


# ── SS diagnostic (supplementary, never used as the headline SS prediction) ──
# The prescribed SS inputs are ratios, so they are invariant to institute size.
# On the TRAIN years alone the published SS sub-score turns out to track size
# instead. This is reported as a diagnostic of the negative result, not as a
# replacement model: it is fitted on 2023+2024 only, scored on 2025 once, and
# kept out of the selection table.
def ss_size_diagnostic(sel, by_iid):
    key = "ss"
    train = [r for r in sel if r["year"] in TRAIN_YEARS]
    iids = sorted({r["institute_id"] for r in train})
    act, pred = [], []
    for r in train:
        v = predict_row("pooled", LogLinear, sel, key, ["total_students"], r, {},
                        exclude_iid=r["institute_id"])
        if np.isfinite(v):
            act.append(r["ss_abs"])
            pred.append(v * BD.MAX_MARKS[key])
    cv = metrics(act, pred, BD.MAX_MARKS[key])
    act25, pred25 = [], []
    for r in sel:
        if r["year"] != TEST_YEAR or r["total_students"] is None:
            continue
        v = predict_row("pooled", LogLinear, sel, key, ["total_students"], r, {})
        if np.isfinite(v):
            act25.append(r["ss_abs"])
            pred25.append(v * BD.MAX_MARKS[key])
    rho = {}
    for f in ("ss_x1", "ss_x2", "ss_nt", "total_students", "faculty_count"):
        x = np.array([r[f] for r in sel if r[f] is not None and r["ss_abs"] is not None])
        yy = np.array([r["ss_abs"] for r in sel if r[f] is not None and r["ss_abs"] is not None])
        if len(x) > 2 and len(set(x)) > 1:
            rho[f] = float(spearmanr(yy, x).statistic)
    return {"cv": cv, "test_2025": metrics(act25, pred25, BD.MAX_MARKS[key]),
            "spearman_with_ss_abs_2023_2024": rho}


def main():
    rng = np.random.default_rng(SEED)      # declared for reproducibility
    rows = load_rows()

    # Rows usable for a parameter: its target was read and every input it needs
    # is present. No imputation -- a row missing one input drops out here.
    usable = {}
    for p, spec in BD.PARAMETERS.items():
        key = p.lower()
        usable[p] = [r for r in rows
                     if r["%s_abs" % key] is not None
                     and r["%s_rel" % key] is not None
                     and all(r[k] is not None for k in spec["x"])]

    by_iid = {(r["institute_id"], r["year"]): r for r in rows}

    # ── LOIO CV on 2023 + 2024, per parameter / family / strategy ────────────
    # Every candidate is scored on an IDENTICAL set of rows. That matters: the
    # previous-year baseline cannot predict a 2023 row (there is no 2022), so
    # scoring it over 2023+2024 against models scored over 2023+2024 would
    # compare different populations. Candidates are therefore evaluated on the
    # rows all of them can predict, and the wider 2023+2024 CV for the fitted
    # families is reported alongside for transparency.
    cv_rows, cv_wide = [], []
    for p, spec in BD.PARAMETERS.items():
        key = p.lower()
        sub = usable[p]
        train_sub = [r for r in sub if r["year"] in TRAIN_YEARS]
        iids = sorted({r["institute_id"] for r in train_sub})

        candidates = [(f.__name__, s) for f in families_for(len(spec["x"]))
                      for s in ("pooled", "per_year", "hybrid")]
        wide = {}
        common = {}
        for r in train_sub:
            for fam, strat in candidates:
                fam_cls = next(f for f in families_for(len(spec["x"]))
                               if f.__name__ == fam)
                v = predict_row(strat, fam_cls, sub, key, spec["x"], r, {},
                                exclude_iid=r["institute_id"])
                wide.setdefault((fam, strat), {})[r["institute_id"], r["year"]] = v
            pv = prev_year_actual(r, key, by_iid)
            wide.setdefault("PreviousYear", {})[r["institute_id"], r["year"]] = pv
            common.setdefault((r["institute_id"], r["year"]), {})["PreviousYear"] = pv

        mask = [k for k, v in common.items() if v["PreviousYear"] is not None]
        for cand, per_row in wide.items():
            fam, strat = cand if isinstance(cand, tuple) else (cand, "per_year")
            def collect(keys):
                a, p_ = [], []
                for k in keys:
                    v = per_row.get(k)
                    if v is None or not np.isfinite(v):
                        continue
                    row = next(r for r in train_sub
                               if (r["institute_id"], r["year"]) == k)
                    a.append(row["%s_abs" % key])
                    p_.append(v * BD.MAX_MARKS[key] if fam != "PreviousYear" else v)
                return a, p_
            a, p_ = collect(mask)
            m = metrics(a, p_, BD.MAX_MARKS[key])
            if m:
                cv_rows.append(dict(parameter=p, family=fam, strategy=strat,
                                    mae=m["mae"], rmse=m["rmse"], r2=m["r2"], n=m["n"]))
            a, p_ = collect(list(wide[cand].keys()))
            m = metrics(a, p_, BD.MAX_MARKS[key])
            if m:
                cv_wide.append(dict(parameter=p, family=fam, strategy=strat,
                                    mae=m["mae"], rmse=m["rmse"], r2=m["r2"], n=m["n"]))

    with open(os.path.join(OUT, "cv_table.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["parameter", "family", "strategy", "n",
                                           "mae", "rmse", "r2"])
        w.writeheader()
        w.writerows(sorted(cv_rows, key=lambda d: (d["parameter"], d["mae"])))

    with open(os.path.join(OUT, "cv_table_2023_2024.csv"), "w",
              encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["parameter", "family", "strategy", "n",
                                           "mae", "rmse", "r2"])
        w.writeheader()
        w.writerows(sorted(cv_wide, key=lambda d: (d["parameter"], d["mae"])))

    # ── select on CV MAE, using 2023 + 2024 only ─────────────────────────────
    selection = {}
    for p in BD.PARAMETERS:
        cand = [c for c in cv_rows if c["parameter"] == p]
        best = min(cand, key=lambda c: (c["mae"], c["family"]))
        selection[p] = {"family": best["family"], "strategy": best["strategy"],
                        "cv_mae": best["mae"], "cv_rmse": best["rmse"],
                        "cv_r2": best["r2"], "cv_n": best["n"]}

    # ── freeze the choice, then score 2025 once ──────────────────────────────
    pred_rows, metrics_rows, worst_rows = [], [], []
    for p, spec in BD.PARAMETERS.items():
        key, mx = p.lower(), BD.MAX_MARKS[p.lower()]
        sel = selection[p]
        fam_cls = next((f for f in families_for(len(spec["x"]))
                        if f.__name__ == sel["family"]), None)
        sub = usable[p]

        act_all, pred_all = [], []
        for r in sub:
            if r["year"] != TEST_YEAR:
                continue
            if sel["family"] == "PreviousYear":
                p_abs = prev_year_actual(r, key, by_iid)
            elif fam_cls is None:
                p_abs = None
            else:
                cache = {}
                p_rel = predict_row(sel["strategy"], fam_cls, sub, key,
                                    spec["x"], r, cache)
                p_abs = p_rel * mx if np.isfinite(p_rel) else None
            row = {"year": TEST_YEAR, "institute_id": r["institute_id"],
                   "name": r["name"], "rank": r["rank"], "parameter": p,
                   "family": sel["family"], "strategy": sel["strategy"]}
            for k in spec["x"]:
                row[k] = r[k]
            row["actual_abs"] = r["%s_abs" % key]
            row["predicted_abs"] = p_abs
            row["actual_rel"] = r["%s_rel" % key]
            row["predicted_rel"] = p_abs / mx if p_abs is not None else None
            pred_rows.append(row)
            if p_abs is not None:
                act_all.append(r["%s_abs" % key])
                pred_all.append(p_abs)

        m = metrics(act_all, pred_all, mx)
        if m:
            metrics_rows.append(dict(parameter=p, family="Selected",
                                     strategy=sel["strategy"], **m))
        # baselines on the same 2025 rows, for context
        # mean-of-2023+2024 baseline, scored on the same 2025 rows
        train_mu = float(np.mean([q["%s_abs" % key] for q in sub if q["year"] in TRAIN_YEARS]))
        mb = metrics([r["%s_abs" % key] for r in sub if r["year"] == TEST_YEAR],
                     [train_mu] * sum(1 for r in sub if r["year"] == TEST_YEAR), mx)
        if mb:
            metrics_rows.append(dict(parameter=p, **mb,
                                     family="MeanBaseline_2023_24",
                                     strategy="pooled"))
        rows_scored = [r for r in pred_rows
                        if r["parameter"] == p and r["predicted_abs"] is not None]
        for r in sorted(rows_scored, key=lambda d: -abs(d["predicted_abs"] - d["actual_abs"]))[:5]:
            worst_rows.append({"parameter": p, "institute_id": r["institute_id"],
                               "name": r["name"], "rank": r["rank"],
                               "actual_abs": r["actual_abs"],
                               "predicted_abs": round(r["predicted_abs"], 3),
                               "abs_error": round(abs(r["predicted_abs"] - r["actual_abs"]), 3)})

    # ── combined score across the modelled parameters ─────────────────────────────
    # The six modelled sub-scores share a maximum of 135 marks. Their sum is
    # summed per institute so the errors can be read as one number, and the
    # re-ranking that the predictions imply is reported next to it. Note the sum
    # is NOT convertible into points of the published normalised total without
    # NIRF's normalisation formula, so it is reported in marks only.
    combined = {}
    for row in pred_rows:
        if row["predicted_abs"] is None:
            continue
        c = combined.setdefault(row["institute_id"],
                                {"year": TEST_YEAR, "institute_id": row["institute_id"],
                                 "name": row["name"], "rank": row["rank"],
                                 "n_parameters": 0, "actual": 0.0, "predicted": 0.0})
        c["actual"] += row["actual_abs"]
        c["predicted"] += row["predicted_abs"]
        c["n_parameters"] += 1
    for c in combined.values():
        c["max_marks"] = sum(BD.MAX_MARKS[p.lower()] for p in BD.PARAMETERS)
        c["error"] = c["predicted"] - c["actual"]
    ranked = sorted(combined.values(), key=lambda c: -c["actual"])
    for pos, c in enumerate(ranked, 1):
        c["actual_position"] = pos
    for pos, c in enumerate(sorted(combined.values(), key=lambda c: -c["predicted"]), 1):
        c["predicted_position"] = pos
    for c in combined.values():
        c["position_shift"] = c["predicted_position"] - c["actual_position"]

    with open(os.path.join(OUT, "combined_2025.csv"), "w",
              encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "institute_id", "name", "rank",
                                          "actual_position", "predicted_position",
                                          "position_shift", "n_parameters",
                                          "actual", "predicted", "error", "max_marks"])
        w.writeheader()
        w.writerows(sorted(combined.values(), key=lambda c: c["actual_position"]))

    combined_metrics = metrics([c["actual"] for c in combined.values()],
                               [c["predicted"] for c in combined.values()],
                               sum(BD.MAX_MARKS[p.lower()] for p in BD.PARAMETERS))

    with open(os.path.join(OUT, "selection.json"), "w", encoding="utf-8") as f:
        json.dump(selection, f, indent=2)

    with open(os.path.join(OUT, "ss_diagnostic.json"), "w", encoding="utf-8") as f:
        json.dump(ss_size_diagnostic(usable["SS"], by_iid), f, indent=2)

    all_x = sorted({k for spec in BD.PARAMETERS.values() for k in spec["x"]})
    pcols = ["year", "institute_id", "name", "rank", "parameter", "family", "strategy",
             "actual_rel", "predicted_rel", "actual_abs", "predicted_abs"] + all_x
    with open(os.path.join(DATA, "predictions.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pcols, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(pred_rows, key=lambda d: (d["parameter"], d["rank"] or 0)))

    with open(os.path.join(OUT, "metrics_2025.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["parameter", "family", "strategy"] + METRIC_COLS,
                           extrasaction="ignore")
        w.writeheader()
        for d in metrics_rows:
            d.setdefault("family", "Selected")
            d.setdefault("strategy", "")
            w.writerow(d)

    with open(os.path.join(OUT, "worst5_2025.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["parameter", "institute_id", "name", "rank",
                                          "actual_abs", "predicted_abs", "abs_error"])
        w.writeheader()
        w.writerows(worst_rows)

    print("selected on 2023+2024 LOIO CV:")
    for p, s in selection.items():
        print("  %-5s %-16s %-9s  cv_mae=%.3f" % (p, s["family"], s["strategy"], s["cv_mae"]))
    print("\n2025 results (absolute marks):")
    print("%-5s %6s %8s %8s %8s %7s %7s %7s %9s" %
          ("param", "n", "MAE", "RMSE", "R2", "+-0.5", "+-1", "+-2", "rho"))
    for d in metrics_rows:
        if d.get("family") == "MeanBaseline_2023_24":
            continue
        print("%-5s %6d %8.3f %8.3f %8.3f %7.3f %7.3f %7.3f %9s" % (
            d["parameter"], d["n"], d["mae"], d["rmse"], d["r2"],
            d["hit_0.5"], d["hit_1.0"], d["hit_2.0"],
            "%.3f" % d["spearman"] if d["spearman"] is not None else "n/a"))
    print("\ncombined %d-parameter score (max %d marks): MAE=%.3f RMSE=%.3f R2=%.3f "
          "rho=%.3f  |position shift| mean=%.2f max=%d" % (
              len(BD.PARAMETERS), combined_metrics["max_marks"],
              combined_metrics["mae"], combined_metrics["rmse"],
              combined_metrics["r2"], combined_metrics["spearman"],
              float(np.mean([abs(c["position_shift"]) for c in combined.values()])),
              max(abs(c["position_shift"]) for c in combined.values())))
    print("\nwrote %s" % os.path.join(OUT, "cv_table.csv"))


if __name__ == "__main__":
    main()