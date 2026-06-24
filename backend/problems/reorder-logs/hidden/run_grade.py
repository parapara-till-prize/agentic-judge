# Hidden grader for Python problems: run the hidden suite, print the GRADE marker.
# Overlaid into the grading copy root alongside test_hidden.py and the solution.
import json
import pytest


class _Collector:
    def __init__(self):
        self.passed = 0
        self.total = 0

    def pytest_runtest_logreport(self, report):
        if report.when == "call":
            self.total += 1
            if report.passed:
                self.passed += 1


_c = _Collector()
pytest.main(["test_hidden.py", "-q", "--tb=no", "-p", "no:cacheprovider"], plugins=[_c])
print("GRADE:" + json.dumps({"passed": _c.passed, "total": _c.total}))
