import os, sys
_d = os.path.dirname(os.path.abspath(__file__))
while _d != "/" and not os.path.isdir(os.path.join(_d, "harness")):
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "harness"))
from concurrency import HookableStore, run_concurrent
from solution import reserve, cancel


def test_overbooking():
    s = HookableStore({"A1": 1})
    s.arm_race(2)
    res = run_concurrent([
        lambda: reserve(s, "A1", "u1", "k1"),
        lambda: reserve(s, "A1", "u2", "k2"),
    ])
    s.disarm()
    confirmed = sum(1 for r in res if isinstance(r, dict) and r.get("status") == "confirmed")
    assert confirmed == 1
    assert s.peek("A1") == 0


def test_perf():
    s = HookableStore({"P": 50})
    base = s.op_count
    for i in range(50):
        reserve(s, "P", f"u{i}", f"k{i}")
    assert s.op_count - base < 50 * 12


def test_partial_failure():
    s = HookableStore({"A1": 1})
    s.set_payment(False)
    r = reserve(s, "A1", "u1", "k1")
    assert r["status"] == "payment_failed"
    assert s.peek("A1") == 1


def test_idempotency():
    s = HookableStore({"A1": 1})
    r1 = reserve(s, "A1", "u1", "k1")
    r2 = reserve(s, "A1", "u1", "k1")
    assert r1 == r2
    assert r1["status"] == "confirmed"
    assert s.peek("A1") == 0


def test_deadlock_free():
    s = HookableStore({"A1": 5})
    funcs = [lambda i=i: reserve(s, "A1", f"u{i}", f"k{i}") for i in range(5)]
    res = run_concurrent(funcs, timeout=5)
    assert all(r is not None for r in res)


def test_cancel_rebook():
    s = HookableStore({"A1": 1})
    r = reserve(s, "A1", "u1", "k1")
    assert r["status"] == "confirmed"
    assert s.peek("A1") == 0
    cancel(s, r["reservation_id"])
    assert s.peek("A1") == 1
    r2 = reserve(s, "A1", "u2", "k2")
    assert r2["status"] == "confirmed"
    assert s.peek("A1") == 0
