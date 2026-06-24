from solution import is_palindrome


def test_basic():
    assert is_palindrome("racecar") is True
    assert is_palindrome("abc") is False


def test_ignore_punctuation():
    assert is_palindrome("A man, a plan, a canal: Panama") is True


def test_case_insensitive():
    assert is_palindrome("Aa") is True


def test_empty():
    assert is_palindrome("") is True


def test_single_char():
    assert is_palindrome("x") is True


def test_alnum_only():
    assert is_palindrome(".,!") is True
