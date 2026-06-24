from solution import reorder_logs


def test_basic_ordering():
    logs = [
        "let1 art can",
        "dig1 8 1 5 1",
        "let2 own kit dig",
        "let3 art zero",
        "dig2 3 6",
    ]
    assert reorder_logs(logs) == [
        "let1 art can",
        "let3 art zero",
        "let2 own kit dig",
        "dig1 8 1 5 1",
        "dig2 3 6",
    ]
