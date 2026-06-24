from solution import validate_signup


def test_required_fields():
    r = validate_signup({})
    assert r["ok"] is False
    assert "email_required" in r["errors"] and "password_required" in r["errors"]


def test_email_format():
    assert validate_signup({"email": "a@b", "password": "abcd1234"})["ok"] is False


def test_password_rule():
    assert validate_signup({"email": "a@b.com", "password": "short"})["ok"] is False


def test_trims():
    assert validate_signup({"email": " a@b.com ", "password": "abcd1234"})["ok"] is True


def test_reject_extra():
    r = validate_signup({"email": "a@b.com", "password": "abcd1234", "role": "admin"})
    assert r["ok"] is False
    assert "unexpected_field:role" in r["errors"]


def test_type_confusion():
    r = validate_signup({"email": "a@b.com", "password": 12345678})
    assert r["ok"] is False
    assert "password_type" in r["errors"]
