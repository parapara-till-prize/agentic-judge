import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repo'))

from log_entry import parse
from log_filter import filter_by_level
from log_stats import count_by_level

LINES = [
    "[2024-01-15 09:30:00] [INFO] 서버 시작",
    "[2024-01-15 09:30:01] [WARN] 메모리 70% 초과",
    "[2024-01-15 09:30:02] [ERROR] DB 연결 실패",
    "[2024-01-15 09:30:03] [INFO] 재연결 시도",
    "[2024-01-15 09:30:04] [ERROR] 재연결 실패",
]


# ── parse() 자체 ──────────────────────────────────────────────

def test_parse_info():
    ts, lv, msg = parse("[2024-01-15 09:30:00] [INFO] 서버 시작")
    assert ts == "2024-01-15 09:30:00"
    assert lv == "INFO"
    assert msg == "서버 시작"


def test_parse_warn():
    ts, lv, msg = parse("[2024-01-15 10:00:00] [WARN] 디스크 공간 부족")
    assert lv == "WARN"
    assert msg == "디스크 공간 부족"
    assert ts == "2024-01-15 10:00:00"


def test_parse_error():
    ts, lv, msg = parse("[2024-01-15 11:00:00] [ERROR] 예외 발생")
    assert lv == "ERROR"
    assert ts == "2024-01-15 11:00:00"


def test_parse_invalid():
    try:
        parse("[INFO] 타임스탬프 없는 구형 포맷")
        assert False, "ValueError가 발생해야 합니다"
    except ValueError:
        pass


# ── log_filter.py 의존성 — parse() 만 고치면 여기서 터진다 ──

def test_filter_still_works():
    msgs = filter_by_level(LINES, "INFO")
    assert msgs == ["서버 시작", "재연결 시도"]


def test_filter_level_mix():
    error_msgs = filter_by_level(LINES, "ERROR")
    assert len(error_msgs) == 2
    assert "DB 연결 실패" in error_msgs
    assert "재연결 실패" in error_msgs


# ── log_stats.py 의존성 — parse() 만 고치면 여기서도 터진다 ──

def test_stats_still_works():
    stats = count_by_level(LINES)
    assert stats == {"INFO": 2, "WARN": 1, "ERROR": 2}


def test_stats_all_levels():
    single = [
        "[2024-01-15 12:00:00] [INFO] 테스트",
        "[2024-01-15 12:00:01] [WARN] 경고",
        "[2024-01-15 12:00:02] [ERROR] 오류",
    ]
    stats = count_by_level(single)
    assert stats["INFO"] == 1
    assert stats["WARN"] == 1
    assert stats["ERROR"] == 1
