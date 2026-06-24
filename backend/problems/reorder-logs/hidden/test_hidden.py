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


def test_tie_break_by_identifier():
    # same content -> tie-break by identifier
    logs = ["a2 act car", "a1 act car"]
    assert reorder_logs(logs) == ["a1 act car", "a2 act car"]


def test_digit_logs_keep_original_order():
    logs = ["d3 3 3", "l1 b c", "d1 1 1", "d2 2 2"]
    assert reorder_logs(logs) == ["l1 b c", "d3 3 3", "d1 1 1", "d2 2 2"]


def test_empty():
    assert reorder_logs([]) == []


def test_all_digit_logs():
    logs = ["d2 5 5", "d1 9 9"]
    assert reorder_logs(logs) == ["d2 5 5", "d1 9 9"]
