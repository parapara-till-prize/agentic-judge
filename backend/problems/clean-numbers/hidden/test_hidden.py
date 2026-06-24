from solution import clean_numbers


def test_thousands_comma():
    assert clean_numbers(["1,234"]) == [1234]


def test_blank_to_none():
    assert clean_numbers(["", " "]) == [None, None]


def test_trim_ws():
    assert clean_numbers([" 12 "]) == [12]


def test_negative():
    assert clean_numbers(["-5"]) == [-5]


def test_decimal():
    assert clean_numbers(["3.5"]) == [3.5]


def test_currency():
    assert clean_numbers(["$5"]) == [5]
