import os, sys
_d = os.path.dirname(os.path.abspath(__file__))
while _d != "/" and not os.path.isdir(os.path.join(_d, "harness")):
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "harness"))
from concurrency import HookableStore, run_concurrent
from solution import reserve


def test_example():
    s = HookableStore({"A1": 1})
    assert reserve(s, "A1", "u1", "k1")["status"] == "confirmed"
