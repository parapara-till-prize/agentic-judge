"""build_meta가 grade.py 오버레이 규칙(루트 기준 명령)을 지키는지 검증.
pytest 미사용 — 순수 assert. 실행: .venv/Scripts/python.exe tests/test_build_meta.py
generate.py를 import하려면 backend/ 가 sys.path에 있어야 한다."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import generate


def test_frontend_hidden_cmd_is_root_relative():
    meta = generate.build_meta(
        "demo", "데모", "frontend", "mid", ["CSS"],
        [{"id": "check_a", "weight": 1}],
    )
    # grade.py가 hidden/ 내용을 채점폴더 루트에 펼치므로 명령은 루트 기준이어야 한다.
    assert meta["hidden"]["cmd"] == "node run_grade.js", meta["hidden"]["cmd"]


def test_frontend_visible_cmd_unchanged():
    meta = generate.build_meta(
        "demo", "데모", "frontend", "mid", ["CSS"],
        [{"id": "check_a", "weight": 1}],
    )
    # 비짓블은 attempt 루트(repo/ 내용물)에서 실행되므로 tests/ 기준이 맞다.
    assert meta["open"]["cmd"] == "node tests/run_visible.js", meta["open"]["cmd"]


def test_build_meta_uses_shared_fe_constants():
    # build_meta와 _validate_frontend가 같은 명령 규칙을 쓰도록 상수로 단일화됐는지 확인.
    meta = generate.build_meta(
        "demo", "데모", "frontend", "mid", ["CSS"],
        [{"id": "check_a", "weight": 1}],
    )
    assert meta["open"]["cmd"] == generate._FE_VISIBLE_CMD
    assert meta["hidden"]["cmd"] == generate._FE_GRADE_CMD
    assert generate._FE_GRADE_CMD == "node run_grade.js"


if __name__ == "__main__":
    test_frontend_hidden_cmd_is_root_relative()
    test_frontend_visible_cmd_unchanged()
    test_build_meta_uses_shared_fe_constants()
    print("OK")
