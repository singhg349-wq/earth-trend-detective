"""Tests for the Streamlit fallback, focused on the artifact contract."""

import json

import streamlit_app as app


def write_json(path, doc):
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


def make_artifact(series_id, status, region="Test region", variable="precipitation"):
    return {
        "id": series_id,
        "variable": variable,
        "units": "mm/day",
        "source": {"product": "GPCPMON", "version": "3.3", "var": "sat_gauge_precip"},
        "region": {"id": series_id, "label": region},
        "season": {"code": "DJF", "year_label": "January year"},
        "years": [1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991],
        "values": [8.0, 8.1, 7.9, 8.2, 8.0, 8.1, 7.95, 8.05],
        "coverage": [1.0] * 8,
        "trend": {
            "sen_slope_per_decade": 0.1,
            "intercept": 8.0,
            "method": "Sen",
            "inference": {"status": "unavailable", "p_value": None, "ci": None},
        },
        "validation": {"status": status},
        "template_summary": "Test summary.",
    }


def test_validation_labels_match_the_contract():
    assert app.validation_label("passed") == "checked against Giovanni"
    assert (
        app.validation_label("unchecked-same-method")
        == "same method, not individually checked"
    )
    assert app.validation_label("pending") == "pending check"
    assert app.validation_label("fixture") is None
    assert app.validation_label("failed") is None
    assert app.validation_label(None) is None


def test_load_index_accepts_dicts_and_strings_and_skips_unsafe_ids(tmp_path):
    index = tmp_path / "index.json"
    write_json(
        index,
        {
            "artifacts": [
                {"id": "precip_indonesia_DJF", "label": "Indonesia"},
                "precip_amazon_DJF",
                {"id": "../outside"},
                {"id": ""},
                3,
            ]
        },
    )

    entries = app.load_index(index)
    assert [entry["id"] for entry in entries] == [
        "precip_indonesia_DJF",
        "precip_amazon_DJF",
    ]
    assert entries[0]["label"] == "Indonesia"


def test_missing_or_broken_index_returns_no_entries(tmp_path):
    missing = tmp_path / "missing.json"
    assert app.load_index(missing) == []

    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert app.load_index(broken) == []


def test_load_series_uses_index_and_hides_other_states(tmp_path):
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    write_json(artifacts / "passed.json", make_artifact("precip_passed_DJF", "passed"))
    write_json(
        artifacts / "unchecked.json",
        make_artifact("precip_unchecked_DJF", "unchecked-same-method"),
    )
    write_json(
        artifacts / "pending.json", make_artifact("precip_pending_DJF", "pending")
    )
    write_json(
        artifacts / "fixture.json", make_artifact("precip_fixture_DJF", "fixture")
    )
    write_json(
        artifacts / "failed.json", make_artifact("precip_failed_DJF", "failed")
    )
    write_json(
        artifacts / "unlisted.json",
        make_artifact("precip_unlisted_DJF", "passed"),
    )

    index = tmp_path / "index.json"
    write_json(
        index,
        {
            "artifacts": [
                {"id": "precip_passed_DJF", "file": "passed.json"},
                {"id": "precip_unchecked_DJF", "file": "unchecked.json"},
                {"id": "precip_pending_DJF", "file": "pending.json"},
                {"id": "precip_fixture_DJF", "file": "fixture.json"},
                {"id": "precip_failed_DJF", "file": "failed.json"},
            ]
        },
    )

    records = app.load_series(index_path=index, artifacts_dir=artifacts)
    assert [record["id"] for record in records] == [
        "precip_passed_DJF",
        "precip_unchecked_DJF",
        "precip_pending_DJF",
    ]
    assert [record["validation_label"] for record in records] == [
        "checked against Giovanni",
        "same method, not individually checked",
        "pending check",
    ]
    assert all(record["from_file_scan"] is False for record in records)


def test_index_file_field_can_point_to_a_differently_named_file(tmp_path):
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    doc = make_artifact("precip_coastal_peru_DJF", "pending", "Coastal Peru")
    write_json(artifacts / "precip_peru_DJF.json", doc)

    index = tmp_path / "index.json"
    write_json(
        index,
        {
            "artifacts": [
                {
                    "id": "precip_coastal_peru_DJF",
                    "label": "Coastal Peru",
                    "file": "precip_peru_DJF.json",
                }
            ]
        },
    )

    records = app.load_series(index_path=index, artifacts_dir=artifacts)
    assert len(records) == 1
    assert records[0]["id"] == "precip_coastal_peru_DJF"
    assert records[0]["region_label"] == "Coastal Peru"
    assert records[0]["validation_status"] == "pending"


def test_unsafe_or_missing_files_are_skipped(tmp_path):
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    index = tmp_path / "index.json"
    write_json(
        index,
        {
            "artifacts": [
                {"id": "precip_missing_DJF", "file": "../outside.json"},
                {"id": "precip_absent_DJF"},
            ]
        },
    )

    assert app.load_series(index_path=index, artifacts_dir=artifacts) == []


def test_validation_status_from_file_wins_over_index_hint(tmp_path):
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    write_json(
        artifacts / "pending.json", make_artifact("precip_pending_DJF", "pending")
    )
    index = tmp_path / "index.json"
    write_json(
        index,
        {
            "artifacts": [
                {
                    "id": "precip_pending_DJF",
                    "file": "pending.json",
                    "validation_status": "passed",
                }
            ]
        },
    )

    records = app.load_series(index_path=index, artifacts_dir=artifacts)
    assert records[0]["validation_status"] == "pending"
    assert records[0]["validation_label"] == "pending check"


def test_empty_index_falls_back_to_real_artifact_files(tmp_path):
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    write_json(
        artifacts / "precip_indonesia_DJF.json",
        make_artifact("precip_indonesia_DJF", "pending", "Indonesia"),
    )
    write_json(
        artifacts / "precip_fixture_DJF.json",
        make_artifact("precip_fixture_DJF", "fixture", "Fixture"),
    )
    write_json(artifacts / "index.json", {"artifacts": []})
    write_json(
        artifacts / "regions.json",
        {"type": "FeatureCollection", "features": []},
    )

    records = app.load_series(
        index_path=artifacts / "index.json", artifacts_dir=artifacts
    )
    assert [record["id"] for record in records] == ["precip_indonesia_DJF"]
    assert records[0]["from_file_scan"] is True


def test_inference_summary_shows_both_tests_interval_and_lag1():
    doc = {
        "variable": "precipitation",
        "units": "mm/day",
        "trend": {
            "sen_slope_per_decade": 0.1163,
            "slope_units": "mm/day/decade",
            "inference": {
                "status": "ok",
                "p_value": 0.165385,
                "ci": [-0.048669, 0.276796],
                "method": "MK + Hamed-Rao (3 lags)",
                "strict_check_pass": False,
                "strict_check_p": 0.085708,
                "lag1": 0.005411,
                "caution": False,
                "n": 42,
            },
        },
    }

    summary = app.inference_summary(doc)
    assert summary["available"] is True
    assert summary["message"] == ""
    assert summary["main_test"] == "p = 0.165 (MK + Hamed-Rao, 3 lags)"
    assert (
        summary["strict_test"]
        == "strict check p = 0.086 (Yue-Wang classic prewhitening)"
    )
    assert summary["strict_result"] == "passes strict check: no"
    assert summary["interval"].startswith(app.CI_LABEL)
    assert summary["interval"].endswith("-0.049 to +0.277 mm/day/decade")
    assert summary["lag1"] == "lag-1 = 0.005"
    assert summary["caution"] is False
    assert summary["caution_text"] == ""


def test_ci_label_is_the_required_sentence():
    assert app.CI_LABEL == (
        "95% slope interval (assumes independent years; narrower than true "
        "uncertainty when years correlate)"
    )


def test_caution_badge_starts_at_lag1_0_3():
    base = {
        "units": "mm/day",
        "trend": {
            "inference": {
                "status": "ok",
                "p_value": 0.2,
                "ci": [-0.1, 0.3],
                "strict_check_pass": False,
                "strict_check_p": 0.4,
            }
        },
    }
    at_threshold = dict(base)
    at_threshold["trend"] = dict(base["trend"])
    at_threshold["trend"]["inference"] = dict(base["trend"]["inference"], lag1=0.3)
    below = dict(base)
    below["trend"] = dict(base["trend"])
    below["trend"]["inference"] = dict(base["trend"]["inference"], lag1=0.299)
    missing = dict(base)
    missing["trend"] = dict(base["trend"])
    missing["trend"]["inference"] = dict(base["trend"]["inference"], lag1=None)

    assert app.inference_summary(at_threshold)["caution"] is True
    assert "0.3 or more" in app.inference_summary(at_threshold)["caution_text"]
    assert app.inference_summary(below)["caution"] is False
    assert app.inference_summary(missing)["caution"] is False


def test_unavailable_inference_is_labelled_and_not_shown_as_significant():
    doc = {
        "units": "mm/day",
        "trend": {
            "sen_slope_per_decade": None,
            "inference": {
                "status": "unavailable",
                "p_value": None,
                "ci": None,
                "method": "MK + Hamed-Rao (3 lags)",
                "strict_check_pass": None,
                "strict_check_p": 0.04,
                "lag1": 0.42,
            },
        },
    }

    summary = app.inference_summary(doc)
    assert summary["available"] is False
    assert summary["message"] == "inference unavailable"
    assert summary["main_test"] == "main test (MK + Hamed-Rao, 3 lags): not available"
    assert summary["strict_result"] == "passes strict check: not available"
    assert summary["interval"] == f"{app.CI_LABEL}: not available"
    assert summary["lag1"] == "lag-1 = 0.420"
    assert "significant" not in json.dumps(summary).lower()


def test_missing_inference_block_is_unavailable():
    summary = app.inference_summary({"units": "mm/day", "trend": {}})
    assert summary["available"] is False
    assert summary["message"] == "inference unavailable"
    assert summary["lag1"] == "lag-1 = not available"


def test_variable_catalog_marks_only_rainfall_ready():
    records = [
        {
            "id": "precip_indonesia_DJF",
            "variable": "precipitation",
            "doc": {},
        }
    ]
    rows = app.variable_catalog(records)
    by_variable = {row["variable"]: row["status"] for row in rows}
    assert by_variable["precipitation"] == "ready"
    assert by_variable["temperature"] == "not ready"
    assert by_variable["aerosol_optical_depth"] == "not ready"
    assert by_variable["soil_moisture"] == "not ready"


def test_variable_catalog_without_series_marks_everything_not_ready():
    rows = app.variable_catalog([])
    assert all(row["status"] == "not ready" for row in rows)


def test_series_title_and_option_label_include_validation_wording(tmp_path):
    record = {
        "id": "precip_indonesia_DJF",
        "region_label": "Indonesia",
        "variable": "precipitation",
        "season": "DJF",
        "validation_label": "pending check",
    }
    assert app.series_title(record) == "Indonesia · DJF · Rainfall"
    assert app.option_label(record) == "Indonesia · DJF · Rainfall — pending check"


def test_build_chart_uses_the_region_title(tmp_path):
    record = {
        "id": "precip_indonesia_DJF",
        "region_label": "Indonesia",
        "variable": "precipitation",
        "season": "DJF",
        "doc": make_artifact("precip_indonesia_DJF", "pending"),
    }
    fig = app.build_chart(record)
    assert fig.layout.title.text == "Indonesia · DJF · Rainfall"
