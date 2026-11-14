import json
from pathlib import Path

from fastapi.testclient import TestClient

import backend.main as main
from backend.main import app

client = TestClient(app)

FIXTURE_IDS = {"precip_indonesia_DJF", "precip_coastal_peru_DJF"}


def test_health_answers():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["series"] >= len(FIXTURE_IDS)


def test_list_series_returns_entries_with_labels():
    response = client.get("/api/series")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == len(body["series"])
    ids = {entry["id"] for entry in body["series"]}
    assert FIXTURE_IDS <= ids

    entry = next(item for item in body["series"] if item["id"] == "precip_indonesia_DJF")
    assert entry["label"]
    assert entry["region_label"] == "Indonesia"
    assert entry["season"] == "DJF"
    assert entry["units"] == "mm/day"
    assert entry["validation_status"] == "fixture"
    assert entry["inference_status"] == "unavailable"
    assert entry["source"]["product"] == "GPCPMON"


def test_get_fixture_series_matches_contract():
    response = client.get("/api/series/precip_coastal_peru_DJF")
    assert response.status_code == 200
    doc = response.json()
    assert doc["id"] == "precip_coastal_peru_DJF"
    assert doc["region"]["id"] == "coastal_peru"
    assert doc["validation"]["status"] == "fixture"
    assert doc["trend"]["inference"]["status"] == "unavailable"
    assert len(doc["years"]) == len(doc["values"]) == len(doc["coverage"])
    assert doc["source"]["version"] == "3.3"


def test_unknown_series_returns_404():
    response = client.get("/api/series/no_such_series")
    assert response.status_code == 404


def test_path_traversal_is_rejected():
    attempts = [
        "/api/series/..",
        "/api/series/%2E%2E",
        "/api/series/..%2F..%2Fdocs%2FCONTRACT",
        "/api/series/..%5C..%5Crequirements",
    ]
    for url in attempts:
        response = client.get(url)
        assert response.status_code in (400, 404), url


def test_fixture_file_on_disk_matches_contract():
    fixture_dir = Path(__file__).resolve().parent.parent / "data" / "fixtures"
    target = (fixture_dir / "precip_indonesia_DJF.json").resolve()
    assert target.is_file()
    doc = json.loads(target.read_text(encoding="utf-8"))
    assert doc["region"]["bbox"] == [95, -11, 141, 6]


def test_new_inference_fields_pass_through(tmp_path, monkeypatch):
    artifacts = tmp_path / "artifacts"
    fixtures = tmp_path / "fixtures"
    artifacts.mkdir()
    fixtures.mkdir()

    doc = {
        "id": "precip_inference_fixture_DJF",
        "variable": "precipitation",
        "units": "mm/day",
        "source": {"product": "GPCPMON", "version": "3.3"},
        "region": {"id": "inference_fixture", "label": "Inference fixture"},
        "season": {"code": "DJF"},
        "years": [1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991],
        "values": [8.0, 8.1, 7.9, 8.2, 8.0, 8.1, 7.95, 8.05],
        "coverage": [1.0] * 8,
        "trend": {
            "sen_slope_per_decade": -0.126,
            "intercept": 8.1,
            "method": "Sen",
            "inference": {
                "status": "ok",
                "p_value": 0.042,
                "ci": [-0.231, -0.021],
                "method": "MK + Hamed-Rao (3 lags)",
                "strict_check_pass": True,
                "strict_check_p": 0.031,
                "lag1": 0.41,
                "caution": True,
                "ci_note": "Assumes independent years.",
                "n": 8,
            },
        },
        "validation": {"reference": "none", "status": "fixture"},
    }
    (artifacts / "precip_inference_fixture_DJF.json").write_text(
        json.dumps(doc), encoding="utf-8"
    )
    monkeypatch.setattr(main, "ARTIFACTS_DIR", artifacts)
    monkeypatch.setattr(main, "FIXTURES_DIR", fixtures)

    listed = client.get("/api/series")
    assert listed.status_code == 200
    entry = next(
        item
        for item in listed.json()["series"]
        if item["id"] == "precip_inference_fixture_DJF"
    )
    assert entry["inference_status"] == "ok"

    response = client.get("/api/series/precip_inference_fixture_DJF")
    assert response.status_code == 200
    inference = response.json()["trend"]["inference"]
    assert inference["status"] == "ok"
    assert inference["p_value"] == 0.042
    assert inference["ci"] == [-0.231, -0.021]
    assert inference["strict_check_pass"] is True
    assert inference["strict_check_p"] == 0.031
    assert inference["lag1"] == 0.41
    assert inference["caution"] is True
    assert inference["n"] == 8
