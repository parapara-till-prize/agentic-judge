# 원자적 카운터

`solution.py`의 `increment(store)`를 구현하라. 호출마다 store의 `"count"`를 1 증가시키고
증가 후 값을 반환한다. store는 `get/set`(비원자)과 `incr/atomic`(원자) 연산을 제공한다.
동시 호출에서도 정확해야 한다.
