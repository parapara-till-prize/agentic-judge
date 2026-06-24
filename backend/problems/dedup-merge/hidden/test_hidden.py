from solution import dedup_merge


def test_dedup_key():
    assert dedup_merge([{"id": "a", "v": 1}, {"id": "a", "v": 2}]) == [{"id": "a", "v": 2}]


def test_latest_nonnull_wins():
    assert dedup_merge([{"id": "a", "v": 1}, {"id": "a", "v": None}]) == [{"id": "a", "v": 1}]


def test_preserve_order():
    assert dedup_merge([{"id": "b"}, {"id": "a"}, {"id": "b"}]) == [{"id": "b"}, {"id": "a"}]


def test_case_insensitive_key():
    assert dedup_merge([{"id": "A", "v": 1}, {"id": "a", "v": 2}]) == [{"id": "a", "v": 2}]


def test_missing_key():
    assert dedup_merge([{"v": 1}, {"id": "a", "v": 2}]) == [{"v": 1}, {"id": "a", "v": 2}]


def test_conflict_resolution():
    assert dedup_merge([{"id": "a", "x": 1, "y": 1}, {"id": "a", "x": 2, "y": None}]) == [{"id": "a", "x": 2, "y": 1}]
