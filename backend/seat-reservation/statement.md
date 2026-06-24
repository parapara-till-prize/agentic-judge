# 선착순 좌석 예약

`solution.py`에 `reserve(store, seat_id, user_id, idem_key)`와 `cancel(store, reservation_id)`를
구현하라. 좌석은 한정 수량. 결제(`store.pay(user)`)가 성공하면 확정한다.
store는 원자 연산(`atomic/incr`), 멱등 헬퍼(`idem_get/idem_set`), 결제 스텁(`pay`),
예약 레코드(`new_id/record_reservation/remove_reservation`)를 제공한다.

반환: `{"status": "confirmed", "reservation_id": ...}` | `{"status": "soldout"}` | `{"status": "payment_failed"}`.
