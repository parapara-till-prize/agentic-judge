from solution import parse_dates


def test_iso():
    assert parse_dates(["2024-01-01"]) == ["2024-01-01"]


def test_slash_short():
    assert parse_dates(["1/1/24"]) == ["2024-01-01"]


def test_month_name():
    assert parse_dates(["Jan 1 2024"]) == ["2024-01-01"]


def test_invalid_skip():
    assert parse_dates(["oops"]) == [None]


def test_ambiguous():
    assert parse_dates(["3/4/24"]) == ["2024-03-04"]


def test_trailing_ws():
    assert parse_dates([" 2024-01-01 "]) == ["2024-01-01"]
