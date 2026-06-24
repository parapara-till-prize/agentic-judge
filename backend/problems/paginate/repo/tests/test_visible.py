from solution import paginate


def test_examples():
    assert paginate([1, 2, 3, 4, 5], 1, 2) == {"items": [1, 2], "page": 1, "total_pages": 3}
