import pytest
from solution import paginate


def test_first_page():
    assert paginate([1, 2, 3, 4, 5], 1, 2) == {"items": [1, 2], "page": 1, "total_pages": 3}


def test_last_partial():
    assert paginate([1, 2, 3, 4, 5], 3, 2) == {"items": [5], "page": 3, "total_pages": 3}


def test_out_of_range_empty():
    assert paginate([1, 2, 3], 99, 2) == {"items": [], "page": 99, "total_pages": 2}


def test_size_zero_guard():
    with pytest.raises(ValueError):
        paginate([1, 2, 3], 1, 0)


def test_total_pages_ceil():
    assert paginate(list(range(10)), 1, 3)["total_pages"] == 4


def test_one_indexed():
    assert paginate([1, 2, 3], 1, 1)["items"] == [1]
    assert paginate([1, 2, 3], 0, 1)["items"] == []
