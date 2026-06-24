from solution import clean_numbers


def test_examples():
    assert clean_numbers(["12", " 7 "]) == [12, 7]
