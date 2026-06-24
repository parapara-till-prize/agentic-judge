from log_entry import parse


def filter_by_level(lines: list[str], level: str) -> list[str]:
    """주어진 레벨의 로그 메시지만 반환한다."""
    result = []
    for line in lines:
        lv, msg = parse(line)
        if lv == level:
            result.append(msg)
    return result
