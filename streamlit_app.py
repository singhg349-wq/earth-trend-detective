"""Streamlit fallback for Earth System Trend Detective.

The app reads the regional result files listed in ``data/artifacts/index.json``.
It only shows validation states that have been given a plain-English label in
``docs/CONTRACT.md``. No data leaves this process.
"""

import json
import math
import re
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

APP_ROOT = Path(__file__).resolve().parent
ARTIFACTS_DIR = APP_ROOT / "data" / "artifacts"
INDEX_FILE = ARTIFACTS_DIR / "index.json"

SERIES_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")

CI_LABEL = (
    "95% slope interval (assumes independent years; narrower than true "
    "uncertainty when years correlate)"
)

# Only these three states are listed. Fixtures, failed checks and unknown
# states are hidden so an unchecked or fake number cannot look like a result.
VALIDATION_LABELS = {
    "passed": "checked against Giovanni",
    "unchecked-same-method": "same method, not individually checked",
    "pending": "pending check",
}

VARIABLE_ORDER = (
    ("precipitation", "Rainfall"),
    ("temperature", "Temperature"),
    ("aerosol_optical_depth", "Aerosol optical depth"),
    ("soil_moisture", "Soil moisture"),
)

VARIABLE_TITLES = dict(VARIABLE_ORDER)


def _read_json(path):
    """Read a JSON object, returning None instead of raising."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            doc = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    return doc if isinstance(doc, dict) else None


def _finite_number(value):
    """Return a real finite number, or None for booleans, text and NaN."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    return value if math.isfinite(value) else None


def validation_label(status):
    """Plain-English label for a contract validation status, or None to hide it."""
    if not isinstance(status, str):
        return None
    return VALIDATION_LABELS.get(status)


def load_index(index_path=INDEX_FILE):
    """Return the artifact entries in data/artifacts/index.json.

    Entries are dictionaries with at least an ``id``. Plain strings are also
    accepted. Unsafe ids are skipped.
    """
    doc = _read_json(index_path)
    items = doc.get("artifacts") if isinstance(doc, dict) else None
    if not isinstance(items, list):
        return []

    entries = []
    for item in items:
        if isinstance(item, str):
            entry = {"id": item}
        elif isinstance(item, dict):
            entry = dict(item)
        else:
            continue
        series_id = entry.get("id")
        if not isinstance(series_id, str) or not SERIES_ID.fullmatch(series_id):
            continue
        entries.append(entry)
    return entries


def artifact_filename(entry):
    """Return a safe file name for one index entry."""
    name = entry.get("file")
    if (
        isinstance(name, str)
        and name
        and Path(name).name == name
        and name.lower().endswith(".json")
    ):
        return name
    return f"{entry['id']}.json"


def _index_from_files(artifacts_dir=ARTIFACTS_DIR):
    """Build a temporary list from real artifact files when index.json is empty.

    This only reads the small regional JSON files in the artifact folder. It is
    used so a missing manifest does not leave the fallback blank, and it never
    reaches outside ``data/artifacts``.
    """
    entries = []
    if not artifacts_dir.is_dir():
        return entries
    for path in sorted(artifacts_dir.glob("*.json")):
        if path.name in {"index.json", "regions.json"}:
            continue
        doc = _read_json(path)
        if not isinstance(doc, dict) or not isinstance(doc.get("years"), list):
            continue
        series_id = doc.get("id") or path.stem
        if isinstance(series_id, str) and SERIES_ID.fullmatch(series_id):
            entries.append({"id": series_id, "file": path.name})
    return entries


def load_series(index_path=INDEX_FILE, artifacts_dir=ARTIFACTS_DIR):
    """Load the visible series named by the index.

    Each returned record contains the index entry, the artifact document, the
    validation status and its plain-English label. States other than
    ``passed``, ``unchecked-same-method`` and ``pending`` are hidden.
    """
    entries = load_index(index_path)
    used_fallback = not entries
    if used_fallback:
        entries = _index_from_files(artifacts_dir)

    records = []
    seen = set()
    for entry in entries:
        series_id = entry["id"]
        if series_id in seen:
            continue
        doc = _read_json(artifacts_dir / artifact_filename(entry))
        if not isinstance(doc, dict):
            continue

        status = (doc.get("validation") or {}).get("status")
        if not status:
            status = entry.get("validation_status")
        label = validation_label(status)
        if label is None:
            continue

        region = doc.get("region") or {}
        season = doc.get("season") or {}
        records.append(
            {
                "id": series_id,
                "entry": entry,
                "doc": doc,
                "validation_status": status,
                "validation_label": label,
                "region_label": region.get("label") or entry.get("label") or series_id,
                "variable": doc.get("variable") or entry.get("variable") or "series",
                "season": season.get("code") or entry.get("season") or "",
                "from_file_scan": used_fallback,
            }
        )
    return records


def series_title(record):
    """Short readable name for a selector or chart title."""
    variable = VARIABLE_TITLES.get(record["variable"], record["variable"])
    parts = [record["region_label"]]
    if record["season"]:
        parts.append(record["season"])
    parts.append(variable)
    return " · ".join(parts)


def option_label(record):
    return f"{series_title(record)} — {record['validation_label']}"


def variable_catalog(series):
    """List the four contracted variables and whether this app can show them."""
    ready = {record["variable"] for record in series}
    rows = []
    for variable, title in VARIABLE_ORDER:
        is_ready = variable == "precipitation" and variable in ready
        rows.append(
            {
                "variable": variable,
                "label": title,
                "status": "ready" if is_ready else "not ready",
            }
        )
    return rows


def _format_signed(value, digits=3):
    number = _finite_number(value)
    return None if number is None else f"{number:+.{digits}f}"


def inference_summary(doc):
    """Build the plain-English inference lines for one result.

    The Mann-Kendall/Hamed-Rao result is the main test. The Yue-Wang classic
    prewhitening result is the strict secondary check. A non-``ok`` main test
    is never presented as a significant trend.
    """
    trend = doc.get("trend") or {}
    inference = trend.get("inference") or {}
    status = inference.get("status") or "unavailable"
    available = status == "ok"

    method = inference.get("method") or "MK + Hamed-Rao (3 lags)"
    method_text = str(method).replace(" (", ", ").replace(")", "")
    p_value = _finite_number(inference.get("p_value"))
    strict_p = _finite_number(inference.get("strict_check_p"))
    lag1 = _finite_number(inference.get("lag1"))
    strict_pass = inference.get("strict_check_pass")

    if available and p_value is not None:
        main_test = f"p = {p_value:.3f} ({method_text})"
    elif available:
        main_test = f"p = not available ({method_text})"
    else:
        main_test = f"main test ({method_text}): not available"

    if strict_p is None:
        strict_test = "strict check p = not available (Yue-Wang classic prewhitening)"
    else:
        strict_test = (
            f"strict check p = {strict_p:.3f} (Yue-Wang classic prewhitening)"
        )

    if strict_pass is True:
        strict_result = "passes strict check: yes"
    elif strict_pass is False:
        strict_result = "passes strict check: no"
    else:
        strict_result = "passes strict check: not available"

    units = trend.get("slope_units")
    if not units:
        units = f"{doc.get('units')}/decade" if doc.get("units") else "per decade"
    ci = inference.get("ci")
    if (
        isinstance(ci, list)
        and len(ci) == 2
        and _format_signed(ci[0]) is not None
        and _format_signed(ci[1]) is not None
    ):
        interval = f"{CI_LABEL}: {_format_signed(ci[0])} to {_format_signed(ci[1])} {units}"
    else:
        interval = f"{CI_LABEL}: not available"

    if lag1 is None:
        lag1_text = "lag-1 = not available"
    else:
        lag1_text = f"lag-1 = {lag1:.3f}"

    caution = lag1 is not None and lag1 >= 0.3
    if caution:
        caution_text = (
            f"Caution: lag-1 = {lag1:.3f} is 0.3 or more. Consecutive seasons are "
            "linked, so these years carry less independent information than their "
            "count suggests. Treat the p-value as a rough guide, not a firm verdict."
        )
    else:
        caution_text = ""

    return {
        "available": available,
        "status": status,
        "message": "" if available else "inference unavailable",
        "main_test": main_test,
        "strict_test": strict_test,
        "strict_result": strict_result,
        "interval": interval,
        "lag1": lag1_text,
        "caution": caution,
        "caution_text": caution_text,
    }


def build_chart(record):
    """Line chart for one result, with coverage in the hover text."""
    doc = record["doc"]
    pairs = list(zip(doc.get("years") or [], doc.get("values") or []))
    coverage = doc.get("coverage") or []
    frame = pd.DataFrame(
        {
            "Year": [pair[0] for pair in pairs],
            "Value": [pair[1] for pair in pairs],
            "Coverage": [
                coverage[index] if index < len(coverage) else None
                for index in range(len(pairs))
            ],
        }
    )
    fig = px.line(
        frame,
        x="Year",
        y="Value",
        title=series_title(record),
        labels={"Value": doc.get("units") or "value", "Year": "Year"},
        hover_data=["Coverage"],
    )
    return fig


def _valid_points(record):
    doc = record["doc"]
    points = []
    for year, value, cover in zip(
        doc.get("years") or [],
        doc.get("values") or [],
        doc.get("coverage") or [],
    ):
        number = _finite_number(value)
        if number is not None:
            points.append((year, number, cover))
    return points


def render_inference(doc):
    """Render the trend number and both inference tests."""
    trend = doc.get("trend") or {}
    slope = _finite_number(trend.get("sen_slope_per_decade"))
    units = trend.get("slope_units")
    if not units:
        units = f"{doc.get('units')}/decade" if doc.get("units") else "per decade"
    if slope is None:
        st.metric("Sen slope", "not available")
    else:
        st.metric("Sen slope", f"{slope:+.3f} {units}")

    summary = inference_summary(doc)
    st.markdown("**Inference**")
    if not summary["available"]:
        st.info("inference unavailable")
    st.write(summary["main_test"])
    st.write(summary["strict_test"])
    st.write(summary["strict_result"])
    st.write(summary["interval"])
    st.write(summary["lag1"])
    if summary["caution"]:
        st.warning(summary["caution_text"])


def render_result(record):
    """Render one result card: numbers, chart, inference, source and label."""
    doc = record["doc"]
    units = doc.get("units") or ""
    points = _valid_points(record)
    st.subheader(series_title(record))

    if points:
        values = [point[1] for point in points]
        latest = values[-1]
        average = sum(values) / len(values)
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Latest", f"{latest:.2f} {units}", delta=f"{latest - average:+.2f}")
        with col2:
            st.metric("Average", f"{average:.2f} {units}")
        with col3:
            st.metric("Range", f"{min(values):.2f} – {max(values):.2f} {units}")
        st.plotly_chart(build_chart(record), width="stretch")
    else:
        st.info("No values are available for this result.")

    render_inference(doc)

    st.markdown("**Validation**")
    st.write(f"{record['validation_label']} (`{record['validation_status']}`)")

    source = doc.get("source") or {}
    season = doc.get("season") or {}
    years = doc.get("years") or []
    coverage = doc.get("coverage") or []
    st.markdown("**Source and coverage**")
    st.write(
        f"{source.get('product') or 'Unknown product'} "
        f"{source.get('version') or ''} · {source.get('var') or ''}".rstrip()
    )
    st.caption(source.get("doi_or_url") or "")
    st.write(f"Region: {record['region_label']} · Season: {season.get('code') or ''}")
    if years:
        st.write(f"Years: {years[0]}–{years[-1]} ({len(points)} valid)")
    if coverage:
        numbers = [c for c in coverage if _finite_number(c) is not None]
        if numbers:
            st.write(f"Coverage: {min(numbers):.2f}–{max(numbers):.2f}")
    summary = doc.get("template_summary")
    if summary:
        st.caption(summary)


def render_variables(series):
    st.sidebar.subheader("Variables")
    for row in variable_catalog(series):
        st.sidebar.write(f"{row['label']}: {row['status']}")


def main():
    st.set_page_config(page_title="Earth System Trend Detective", layout="wide")
    st.title("Earth System Trend Detective")
    st.caption(
        "DJF rainfall trends from GPCP version 3.3. Pin one result, then choose "
        "another to compare them side by side."
    )

    series = load_series()
    render_variables(series)

    st.sidebar.subheader("About")
    st.sidebar.write("NASA Space Apps 2026")
    st.sidebar.write("Rainfall: GPCP 3.3, DJF 1984–2025 (January year)")
    st.sidebar.caption(
        "Regions come from data/artifacts/index.json, with a local file "
        "fallback only when that list is empty."
    )

    if not series:
        st.error(
            "No results to show. Add checked or pending series to "
            "data/artifacts/index.json."
        )
        return

    records = {record["id"]: record for record in series}
    ids = [record["id"] for record in series]

    pinned_id = st.session_state.get("pinned_a_id")
    if pinned_id not in records:
        pinned_id = None

    col_a, col_b = st.columns(2)

    with col_a:
        st.subheader("Result A")
        default_index = ids.index(pinned_id) if pinned_id in ids else 0
        selected_a = st.selectbox(
            "Choose result A",
            ids,
            index=default_index,
            format_func=lambda key: option_label(records[key]),
            key="select_a",
        )
        if st.button("Pin A"):
            st.session_state["pinned_a_id"] = selected_a
            pinned_id = selected_a
            st.success(f"Pinned A: {series_title(records[selected_a])}")

    a_id = pinned_id or selected_a
    if pinned_id:
        st.caption(f"Pinned A: {series_title(records[pinned_id])}")
    else:
        st.caption("Pin A to keep it fixed while you choose result B.")

    b_options = [key for key in ids if key != a_id]
    with col_b:
        st.subheader("Result B")
        if b_options:
            selected_b = st.selectbox(
                "Choose result B",
                b_options,
                format_func=lambda key: option_label(records[key]),
                key="select_b",
            )
        else:
            selected_b = None
            st.info("No other result is available to compare.")

    left, right = st.columns(2)
    with left:
        render_result(records[a_id])
    with right:
        if selected_b:
            render_result(records[selected_b])
        else:
            st.info("Add a second series to compare.")


if __name__ == "__main__":
    main()
