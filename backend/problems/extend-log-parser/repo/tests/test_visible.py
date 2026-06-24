import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from log_entry import parse


def test_parse_basic():
    ts, lv, msg = parse("[2024-01-15 09:30:00] [INFO] 서버가 시작됐습니다")
    assert ts == "2024-01-15 09:30:00"
    assert lv == "INFO"
    assert msg == "서버가 시작됐습니다"


def test_parse_invalid():
    try:
        parse("이상한 로그 줄")
        assert False, "ValueError가 발생해야 합니다"
    except ValueError:
        pass
