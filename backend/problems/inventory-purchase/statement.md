# 재고 차감

`solution.py`의 `purchase(store, item, idem_key=None)`를 구현하라. 재고가 있으면 1 차감하고
`{"ok": True}`, 없으면 `{"ok": False}`를 반환한다. 같은 `idem_key` 재시도는 한 번만 차감한다.
