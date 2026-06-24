from solution import apply_patch


def test_shallow_merge():
    assert apply_patch({"a": 1, "b": 2}, {"b": 3}) == {"a": 1, "b": 3}


def test_null_deletes():
    assert apply_patch({"a": 1, "b": 2}, {"a": None}) == {"b": 2}


def test_nested_merge():
    assert apply_patch({"a": {"x": 1, "y": 2}}, {"a": {"y": 3}}) == {"a": {"x": 1, "y": 3}}


def test_array_replace():
    assert apply_patch({"a": [1, 2, 3]}, {"a": [4]}) == {"a": [4]}


def test_type_change():
    assert apply_patch({"a": {"x": 1}}, {"a": 5}) == {"a": 5}


def test_add_key():
    assert apply_patch({"a": 1}, {"b": 2}) == {"a": 1, "b": 2}
