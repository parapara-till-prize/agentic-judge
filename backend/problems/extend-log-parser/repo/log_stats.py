from log_entry import parse


def count_by_level(lines: list[str]) -> dict:
    """레벨별 로그 수를 집계한다."""
    counts: dict[str, int] = {}
    for line in lines:
        lv, msg = parse(line)
        counts[lv] = counts.get(lv, 0) + 1
    return counts
