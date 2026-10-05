#!/usr/bin/env python3
"""
Standalone prediction script for model-based relative parameter prediction.

Usage: python predict_from_pdf.py <path_to_pdf>

Outputs a JSON object to stdout with:
  - extracted_absolute: raw metrics extracted from the PDF
  - predicted_relative_marks: predicted NIRF relative marks per parameter
  - max_marks: official max marks per parameter
  - missing: list of fields that could not be extracted
"""
import sys
import json
import os
import traceback
import re

HARN_ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HARN_ROOT)

try:
    sys.path.insert(0, HARN_ROOT)
    from extract_features import extract_one
    import model as md
    import build_dataset as BD
except ImportError as e:
    print(json.dumps({"error": f"Failed to import harness modules: {str(e)}",
                      "traceback": traceback.format_exc()}))
    sys.exit(1)

try:
    import numpy as np
except ImportError:
    print(json.dumps({"error": "numpy is required but not installed"}))
    sys.exit(1)

# Official max marks per modelled parameter (from NIRF Engineering score graph)
MAX_MARKS = {
    "ESCS": 20.0,
    "GPHD": 20.0,
    "GMS":  25.0,
    "FPPP": 10.0,
    "SS":   20.0,
    "FRU":  30.0,
}

# Selection: which model family/strategy was chosen by LOIO CV (from selection.json)
SELECTION_PATH = os.path.join(HARN_ROOT, "out", "selection.json")


def load_selection():
    """Load the model selection produced by model.py (LOIO CV results)."""
    if os.path.exists(SELECTION_PATH):
        with open(SELECTION_PATH, encoding="utf-8") as f:
            return json.load(f)
    # Hardcoded fallback in case selection.json is missing
    return {
        "ESCS": {"family": "Isotonic",    "strategy": "pooled"},
        "GPHD": {"family": "PreviousYear","strategy": "per_year"},
        "GMS":  {"family": "PreviousYear","strategy": "per_year"},
        "FPPP": {"family": "PreviousYear","strategy": "per_year"},
        "SS":   {"family": "PreviousYear","strategy": "per_year"},
        "FRU":  {"family": "AdditiveLog", "strategy": "per_year"},
    }


def extract_features_from_pdf(pdf_path):
    """
    Extract raw absolute features from a NIRF DCS PDF.
    Returns (record_dict, year, institute_id).
    The institute_id is taken from the record itself when possible.
    """
    basename = os.path.basename(pdf_path)

    # Try to infer year from path/filename (default 2025)
    m = re.search(r'20\d{2}', pdf_path)
    year = int(m.group(0)) if m else 2025

    # Try to infer institute_id from filename as a hint
    m2 = re.search(r'(IR-[A-Z]-[A-Z]-\d+)', basename)
    if not m2:
        m2 = re.search(r'(IR-[A-Z]-[A-Z]-\d+)', pdf_path)
    iid_hint = m2.group(1) if m2 else basename.replace('.pdf', '')

    # extract_one returns (record_dict, source_string)
    rec, _via = extract_one(year, iid_hint, pdf_path)

    # Use the institute_id from the record if available (it may be more accurate)
    iid = rec.get('institute_id', iid_hint) or iid_hint
    year_from_rec = rec.get('year', year)
    if year_from_rec:
        try:
            year = int(year_from_rec)
        except (ValueError, TypeError):
            pass

    return rec, year, iid


def predict_parameters(extracted, year, iid, selection):
    """
    Given extracted features for a college, predict relative marks for each
    parameter using the pre-trained models on 2023+2024 data.

    For PreviousYear parameters: look up the college's 2024 actual abs score
    in features.csv (the most recent training year). If the college is not in
    the training data, fall back to fitting the AdditiveLog/Isotonic curve.

    For Isotonic/AdditiveLog: fit on the full 2023+2024 training rows.
    """
    # Load all rows from features.csv (training + test data)
    rows = md.load_rows()
    train_years = md.TRAIN_YEARS  # [2023, 2024]

    # ── Resolve iid ──────────────────────────────────────────────────────────
    # If the iid doesn't look like a proper IR-* code (e.g. it came from a
    # filename like "NITPuducherry_Engineering_NIRF_2025"), try to find the
    # matching row in features.csv by checking if the iid appears in the name.
    IR_PATTERN = re.compile(r'^IR-[A-Z]-[A-Z]-\d+$')
    if not IR_PATTERN.match(iid):
        # Try matching against institute names in the training data (2024 rows)
        name_lower = iid.lower().replace('_', ' ').replace('-', ' ')
        best_match_iid = None
        best_overlap = 0
        for r in rows:
            if r['year'] != 2024:
                continue
            r_name = (r.get('name') or '').lower()
            # Count overlapping words between the filename stem and the college name
            fn_words = set(w for w in name_lower.split() if len(w) > 3 and w not in ('engineering', 'nirf', '2025', '2024', '2023'))
            nm_words = set(w for w in r_name.split() if len(w) > 3)
            overlap = len(fn_words & nm_words)
            if overlap > best_overlap:
                best_overlap = overlap
                best_match_iid = r['institute_id']
        if best_match_iid and best_overlap >= 1:
            iid = best_match_iid

    # Build a lookup: (institute_id, year) -> row
    by_iid = {(r["institute_id"], r["year"]): r for r in rows}

    results = {}
    debug_info = {}

    for param, spec in BD.PARAMETERS.items():
        key = param.lower()
        mx = MAX_MARKS[param]
        sel_info = selection.get(param, {})
        family_name = sel_info.get("family", "Isotonic")
        strategy = sel_info.get("strategy", "pooled")

        # Build the usable training set for this parameter
        usable = [r for r in rows
                  if r["%s_abs" % key] is not None
                  and r["%s_rel" % key] is not None
                  and all(r[k] is not None for k in spec["x"])]

        # ── PreviousYear strategy ─────────────────────────────────────────────
        # The PreviousYear baseline uses the college's own most-recent published
        # abs score as its prediction.
        # We dynamically find the most recent year available in features.csv
        # so this works correctly for 2026 PDFs (uses 2025), 2027 PDFs (uses 2026), etc.
        if family_name == "PreviousYear":
            prev_abs = None
            # Find the most recent year in our data for this college
            most_recent_year = max(r["year"] for r in rows)
            prev_row = by_iid.get((iid, most_recent_year))
            if prev_row is not None and prev_row.get("%s_abs" % key) is not None:
                prev_abs = float(prev_row["%s_abs" % key])
                results[param] = prev_abs
                debug_info[param] = {
                    "method": "PreviousYear (%d actual)" % most_recent_year,
                    "value_abs": prev_abs,
                    "value_rel": prev_abs / mx
                }
                continue

            # College not in training data -> fall back to best fitted model
            # Use AdditiveLog for 2-input params, Isotonic for 1-input
            debug_info[param] = {"method": "PreviousYear fallback -> fitted model"}
            n_inputs = len(spec["x"])
            if n_inputs == 2:
                fallback_cls = md.AdditiveLog
            else:
                fallback_cls = md.Isotonic

            # Check we have the required inputs
            have_inputs = all(extracted.get(k) is not None for k in spec["x"])
            if not have_inputs:
                results[param] = None
                debug_info[param]["reason"] = f"Missing inputs: {spec['x']}"
                continue

            # For PreviousYear fallback, use ALL usable rows (pooled) for the
            # fitted model - mirrors model.py's pooled strategy which includes
            # 2023+2024+2025 to get the best possible curve.
            train_rows = usable  # all years: 2023+2024+2025
            if len(train_rows) < md.MIN_ISO_POINTS:
                results[param] = None
                debug_info[param]["reason"] = "Not enough training rows"
                continue

            try:
                fitted = md.build(strategy if strategy != "per_year" else "pooled",
                                  fallback_cls, train_rows, key, spec["x"])
                X = np.array([[float(extracted[k]) for k in spec["x"]]])
                rel = float(fitted.predict(X)[0])
                rel = max(0.0, min(1.0, rel))
                results[param] = rel * mx
                debug_info[param]["method"] += f" ({fallback_cls.__name__})"
                debug_info[param]["value_rel"] = rel
            except Exception as ex:
                results[param] = None
                debug_info[param]["error"] = str(ex)
            continue

        # ── Fitted model strategy (Isotonic, AdditiveLog, etc.) ──────────────
        # Check if we have all required inputs extracted from the PDF
        have_inputs = all(extracted.get(k) is not None for k in spec["x"])
        if not have_inputs:
            results[param] = None
            debug_info[param] = {"method": family_name, "reason": f"Missing inputs: {spec['x']}"}
            continue

        # Get the model class
        all_families = (md.families_for(1) + md.families_for(2))
        fam_cls = next((f for f in all_families if f.__name__ == family_name), None)
        if fam_cls is None:
            results[param] = None
            debug_info[param] = {"method": family_name, "reason": f"Unknown family: {family_name}"}
            continue

        # Train on the selected strategy's rows.
        # IMPORTANT: For 'pooled', model.py uses ALL rows (2023+2024+2025)
        # because pooled means "no year restriction". This is what gives us
        # 282 training rows for ESCS vs only 194 if we restrict to train_years.
        # For 'per_year', use only the most recent labelled year (2024).
        if strategy == "per_year":
            latest = max(train_years)
            train_rows = [r for r in usable if r["year"] == latest]
        else:
            # pooled: use ALL available rows (all years)
            train_rows = usable

        if len(train_rows) < md.MIN_ISO_POINTS:
            results[param] = None
            debug_info[param] = {"method": family_name,
                                  "reason": f"Only {len(train_rows)} training rows (need {md.MIN_ISO_POINTS})"}
            continue

        try:
            fitted = md.build(strategy if strategy != "per_year" else "pooled",
                              fam_cls, train_rows, key, spec["x"])
            X = np.array([[float(extracted[k]) for k in spec["x"]]])
            rel = float(fitted.predict(X)[0])
            rel = max(0.0, min(1.0, rel))
            results[param] = rel * mx
            debug_info[param] = {
                "method": f"{family_name} ({strategy})",
                "value_rel": rel,
                "value_abs": rel * mx,
                "n_train": len(train_rows),
            }
        except Exception as ex:
            results[param] = None
            debug_info[param] = {"method": family_name, "error": str(ex),
                                  "traceback": traceback.format_exc()}

    return results, debug_info


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "PDF path required as first argument"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"PDF file not found: {pdf_path}"}))
        sys.exit(1)

    try:
        # Step 1: Extract features from the PDF
        extracted, year, iid = extract_features_from_pdf(pdf_path)

        # Step 2: Load model selection
        selection = load_selection()

        # Step 3: Predict
        pred_abs, debug_info = predict_parameters(extracted, year, iid, selection)

        # Step 4: Build output
        # Round predicted marks to 3 decimal places
        predicted_marks = {}
        predicted_fractions = {}
        for param, val in pred_abs.items():
            if val is not None:
                predicted_marks[param] = round(float(val), 3)
                predicted_fractions[param] = round(float(val) / MAX_MARKS[param], 4)
            else:
                predicted_marks[param] = None
                predicted_fractions[param] = None

        # Format extracted absolute values for display
        abs_display = {}
        for k, v in extracted.items():
            if v is not None:
                try:
                    abs_display[k] = round(float(v), 4)
                except (TypeError, ValueError):
                    abs_display[k] = v

        result = {
            "success": True,
            "institute_id": iid,
            "year": year,
            "extracted_absolute": abs_display,
            "predicted_relative_marks": predicted_marks,
            "predicted_fractions": predicted_fractions,
            "max_marks": MAX_MARKS,
            "debug": debug_info,
        }
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({
            "error": "Prediction failed",
            "detail": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
