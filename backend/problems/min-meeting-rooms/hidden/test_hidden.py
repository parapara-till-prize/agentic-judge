from solution import min_rooms


def test_basic_overlap():
    assert min_rooms([[0, 30], [5, 10], [15, 20]]) == 2


def test_boundary_touch():
    assert min_rooms([[0, 10], [10, 20]]) == 1


def test_empty():
    assert min_rooms([]) == 0


def test_all_overlap():
    assert min_rooms([[1, 5], [2, 6], [3, 7]]) == 3


def test_nested():
    assert min_rooms([[1, 10], [2, 3]]) == 2


def test_unsorted_input():
    assert min_rooms([[15, 20], [0, 30], [5, 10]]) == 2
