from solution import validate_signup


def test_valid():
    assert validate_signup({"email": "user@example.com", "password": "abcd1234"})["ok"] is True
