from solution import apply_patch


def test_examples():
    assert apply_patch({"a": 1, "b": 2}, {"b": 3}) == {"a": 1, "b": 3}
    assert apply_patch({"a": 1, "b": 2}, {"a": None}) == {"b": 2}
