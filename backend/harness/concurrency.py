"""동시성 카테고리 하네스 — 결정론적 race 재현용 공유 store + 동시 구동기.

계약: 제출 솔루션은 read-modify-write를 반드시 atomic 계열(incr/atomic)로 한다.
get+set 로 RMW 하면 race 로 간주되어 hidden 에서 실패한다.
arm_race(parties) 가 켜지면 get() 은 parties 개 스레드가 모두 읽을 때까지 막혔다가
동시에 풀린다 → check-then-act 의 lost-update 창을 *결정론적으로* 재현한다.
atomic/incr 은 barrier 를 거치지 않으므로(내부 lock) 올바른 풀이는 영향받지 않는다.
"""
import threading


class HookableStore:
    def __init__(self, initial=None):
        self._data = dict(initial or {})
        self._idem = {}
        self.reservations = {}
        self._lock = threading.RLock()
        self._race_barrier = None
        self._pay_ok = True
        self._seq = 0
        self.op_count = 0

    # ── race 제어 ──
    def arm_race(self, parties):
        self._race_barrier = threading.Barrier(parties)

    def disarm(self):
        self._race_barrier = None

    def _maybe_race(self):
        b = self._race_barrier
        if b is not None:
            try:
                b.wait(timeout=5)
            except Exception:
                pass
            self._race_barrier = None

    # ── racy 원시 (RMW 에 쓰면 위험) ──
    def get(self, key, default=0):
        self._maybe_race()
        with self._lock:
            self.op_count += 1
            return self._data.get(key, default)

    def set(self, key, val):
        with self._lock:
            self.op_count += 1
            self._data[key] = val

    # ── atomic 원시 (올바른 RMW) ──
    def incr(self, key, delta=1, default=0):
        with self._lock:
            self.op_count += 1
            self._data[key] = self._data.get(key, default) + delta
            return self._data[key]

    def atomic(self, key, fn, default=0):
        with self._lock:
            self.op_count += 1
            cur = self._data.get(key, default)
            newv, result = fn(cur)
            self._data[key] = newv
            return result

    # ── 멱등성 헬퍼 (atomic) ──
    def idem_get(self, key):
        with self._lock:
            return self._idem.get(key)

    def idem_set(self, key, val):
        with self._lock:
            self._idem[key] = val

    # ── 결제 스텁(주입형) / 예약 레코드 ──
    def set_payment(self, ok):
        self._pay_ok = ok

    def pay(self, user):
        with self._lock:
            self.op_count += 1
            return self._pay_ok

    def new_id(self):
        with self._lock:
            self._seq += 1
            return f"r{self._seq}"

    def record_reservation(self, rid, seat, user):
        with self._lock:
            self.reservations[rid] = {"seat": seat, "user": user}

    def remove_reservation(self, rid):
        with self._lock:
            return self.reservations.pop(rid, None)

    # ── 하네스 전용 raw 읽기 (barrier 우회) ──
    def peek(self, key, default=0):
        with self._lock:
            return self._data.get(key, default)


def run_concurrent(funcs, timeout=10):
    """funcs 를 각각 스레드로 동시에 실행하고 결과 리스트를 반환(예외도 그대로 담음)."""
    results = [None] * len(funcs)

    def wrap(i, f):
        try:
            results[i] = f()
        except Exception as e:  # noqa: BLE001
            results[i] = e

    threads = [threading.Thread(target=wrap, args=(i, f)) for i, f in enumerate(funcs)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout)
    return results
