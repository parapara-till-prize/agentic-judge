import os, sys
_d = os.path.dirname(os.path.abspath(__file__))
while _d != "/" and not os.path.isdir(os.path.join(_d, "harness")):
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "harness"))
from concurrency import HookableStore, run_concurrent
from solution import increment


def test_single_inc():
    s = HookableStore({"count": 0})
    assert increment(s) == 1
    assert s.peek("count") == 1


def test_concurrent_no_lost_update():
    s = HookableStore({"count": 0})
    s.arm_race(50)
    run_concurrent([lambda: increment(s)] * 50)
    s.disarm()
    assert s.peek("count") == 50


def test_idempotent_init():
    s = HookableStore()
    assert increment(s) == 1


def test_final_count():
    s = HookableStore({"count": 0})
    for _ in range(5):
        increment(s)
    assert s.peek("count") == 5


def test_interleave_stress():
    s = HookableStore({"count": 0})
    s.arm_race(20)
    run_concurrent([lambda: increment(s)] * 20)
    s.disarm()
    assert s.peek("count") == 20
