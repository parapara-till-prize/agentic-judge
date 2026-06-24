from solution import is_balanced


def test_basic():
    assert is_balanced("()[]{}") is True
    assert is_balanced("(]") is False


def test_nesting_order():
    assert is_balanced("([)]") is False
    assert is_balanced("{[()]}") is True


def test_empty_is_true():
    assert is_balanced("") is True


def test_leading_close():
    assert is_balanced(")(") is False


def test_unmatched_opens():
    assert is_balanced("(((") is False
