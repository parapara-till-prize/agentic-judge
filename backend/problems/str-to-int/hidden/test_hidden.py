from solution import my_atoi


def test_leading_ws():
    assert my_atoi("   42") == 42


def test_sign():
    assert my_atoi("-7") == -7


def test_stop_at_nondigit():
    assert my_atoi("4d2") == 4


def test_int32_clamp():
    assert my_atoi("99999999999") == 2147483647
    assert my_atoi("-99999999999") == -2147483648


def test_empty_invalid_zero():
    assert my_atoi("") == 0
    assert my_atoi("abc") == 0


def test_plus_sign():
    assert my_atoi("+5") == 5
