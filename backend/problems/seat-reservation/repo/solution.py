def reserve(store, seat_id, user_id, idem_key):
    """좌석 예약. 성공 시 {"status": "confirmed", "reservation_id": ...} 반환. (구현 필요)"""
    raise NotImplementedError


def cancel(store, reservation_id):
    """예약 취소. 좌석을 반환한다. (구현 필요)"""
    raise NotImplementedError
