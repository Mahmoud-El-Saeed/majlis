from app.core.security import create_verification_token


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_student_signup_verify_login_me_refresh(client):
    outbox = client._transport.app.state.test_outbox  # type: ignore[union-attr]

    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": "student@example.com", "password": "secret1234", "full_name": "طالب"},
    )
    assert r.status_code == 201, r.text
    assert len(outbox) == 1
    assert "verify?token=" in outbox[0]["body"]

    # Gate: unverified cannot log in.
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "student@example.com", "password": "secret1234"},
    )
    assert r.status_code == 401
    assert "فعّل" in r.json()["detail"]

    token = outbox[0]["body"].split("verify?token=")[1].split()[0].strip()
    r = await client.post("/api/v1/auth/verify", json={"token": token})
    assert r.status_code == 200, r.text

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "student@example.com", "password": "secret1234"},
    )
    assert r.status_code == 200, r.text
    tokens = r.json()
    assert tokens["access_token"] and tokens["refresh_token"]

    r = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "student@example.com"
    assert r.json()["is_verified"] is True

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["access_token"]


async def test_expired_or_invalid_token_rejected(client):
    r = await client.post("/api/v1/auth/verify", json={"token": "invalid"})
    assert r.status_code == 400

    # Forged verify token for unknown user.
    forged = create_verification_token("00000000-0000-0000-0000-000000000000")
    r = await client.post("/api/v1/auth/verify", json={"token": forged})
    assert r.status_code == 400

    r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"})
    assert r.status_code == 401


async def test_password_reset_via_mailpit_seam(client):
    outbox = client._transport.app.state.test_outbox  # type: ignore[union-attr]
    await client.post(
        "/api/v1/auth/signup",
        json={"email": "reset@example.com", "password": "secret1234"},
    )
    # Verify first via outbox link.
    token = outbox[-1]["body"].split("verify?token=")[1].split()[0].strip()
    await client.post("/api/v1/auth/verify", json={"token": token})

    r = await client.post(
        "/api/v1/auth/password-reset/request", json={"email": "reset@example.com"}
    )
    assert r.status_code == 200
    assert "reset?token=" in outbox[-1]["body"]

    reset_token = outbox[-1]["body"].split("reset?token=")[1].split()[0].strip()
    r = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "newsecret123"},
    )
    assert r.status_code == 200, r.text

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "newsecret123"},
    )
    assert r.status_code == 200


async def test_rate_limiting_enforced(client):
    # Signup limit is 10/min per IP in test memory fallback.
    for i in range(11):
        r = await client.post(
            "/api/v1/auth/signup",
            json={"email": f"spam{i}@example.com", "password": "secret1234"},
        )
    assert r.status_code == 429
    assert "كثيرة" in r.json()["detail"]
