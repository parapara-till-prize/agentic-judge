from solution import is_balanced


def test_basic():
    assert is_balanced("()[]{}") is True
    assert is_balanced("(]") is False
