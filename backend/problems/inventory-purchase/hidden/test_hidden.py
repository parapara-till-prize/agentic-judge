import os, sys
_d = os.path.dirname(os.path.abspath(__file__))
while _d != "/" and not os.path.isdir(os.path.join(_d, "harness")):
    _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, "harness"))
from concurrency import HookableStore, run_concurrent
from solution import purchase


def test_basic_purchase():
    s = HookableStore({"widget": 3})
    assert purchase(s, "widget") == {"ok": True}
    assert s.peek("widget") == 2


def test_no_oversell_concurrent():
    s = HookableStore({"widget": 1})
    s.arm_race(2)
    res = run_concurrent([lambda: purchase(s, "widget")] * 2)
    s.disarm()
    oks = sum(1 for r in res if isinstance(r, dict) and r.get("ok"))
    assert oks == 1
    assert s.peek("widget") == 0


def test_out_of_stock():
    s = HookableStore({"widget": 0})
    assert purchase(s, "widget") == {"ok": False}
    assert s.peek("widget") == 0


def test_idempotent_purchase():
    s = HookableStore({"widget": 5})
    r1 = purchase(s, "widget", "k1")
    r2 = purchase(s, "widget", "k1")
    assert r1 == r2 == {"ok": True}
    assert s.peek("widget") == 4


def test_restock():
    s = HookableStore({"widget": 1})
    assert purchase(s, "widget")["ok"] is True
    assert purchase(s, "widget")["ok"] is False
    s.incr("widget", 1)
    assert purchase(s, "widget")["ok"] is True
    assert s.peek("widget") == 0
