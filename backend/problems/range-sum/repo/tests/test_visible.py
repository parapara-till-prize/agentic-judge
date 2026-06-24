from solution import range_sum


def test_basic():
    arr = [5, 4, 3, 2, 1]
    assert range_sum(arr, [(1, 3), (2, 4), (1, 5)]) == [12, 9, 15]
