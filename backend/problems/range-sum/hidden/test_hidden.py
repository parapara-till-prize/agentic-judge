from solution import range_sum


def test_basic():
    assert range_sum([5, 4, 3, 2, 1], [(1, 3), (2, 4), (1, 5)]) == [12, 9, 15]


def test_single_element_interval():
    assert range_sum([10, 20, 30], [(2, 2)]) == [20]


def test_full_range():
    assert range_sum([1, 2, 3, 4], [(1, 4)]) == [10]


def test_reversed_bounds():
    # i > j must be treated as the same interval (j..i)
    assert range_sum([1, 2, 3, 4, 5], [(4, 2)]) == [9]


def test_negatives():
    assert range_sum([-1, -2, -3], [(1, 3), (2, 2)]) == [-6, -2]
