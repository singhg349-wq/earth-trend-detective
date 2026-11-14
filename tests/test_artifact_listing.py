from scripts.build_artifacts import automatic_check


def valid_payload():
    return {
        "units": "mm/day",
        "years": list(range(1984, 2026)),
        "values": [float(i) for i in range(42)],
        "coverage": [1.0] * 42,
        "region": {"cells_used": 4},
    }


def test_automatic_check_accepts_complete_finite_series():
    assert automatic_check(valid_payload())


def test_automatic_check_rejects_nonfinite_values():
    payload = valid_payload()
    payload["values"][3] = float("nan")
    assert not automatic_check(payload)


def test_automatic_check_rejects_wrong_coverage_units_length_and_empty_region():
    for field, value in (("coverage", [1.0] * 41), ("units", "mm")):
        payload = valid_payload()
        payload[field] = value
        assert not automatic_check(payload)
    payload = valid_payload()
    payload["coverage"][0] = 1.1
    assert not automatic_check(payload)
    payload = valid_payload()
    payload["region"]["cells_used"] = 0
    assert not automatic_check(payload)
