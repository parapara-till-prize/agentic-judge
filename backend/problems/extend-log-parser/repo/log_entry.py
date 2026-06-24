import re

LOG_PATTERN = re.compile(r'\[(INFO|WARN|ERROR)\] (.+)')


def parse(line: str) -> tuple:
    """로그 한 줄을 (level, message) 튜플로 파싱한다.

    포맷: [LEVEL] 메시지
    """
    m = LOG_PATTERN.match(line)
    if not m:
        raise ValueError(f"invalid log line: {line!r}")
    return m.group(1), m.group(2)
