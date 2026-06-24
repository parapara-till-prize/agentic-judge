from solution import dedup_merge


def test_examples():
    assert dedup_merge([{"id": "a", "v": 1}, {"id": "a", "v": 2}]) == [{"id": "a", "v": 2}]
