"""Testler için izole, bellek üstünde çalışan bir veritabanı kurar.

Gerçek personel.db dosyasına hiçbir testte dokunulmaz.
"""
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

# auth.py import sırasında SECRET_KEY arar; testler kendi anahtarını verir.
os.environ.setdefault("SECRET_KEY", "test-anahtari-yalnizca-testler-icin")

import models  # noqa: E402
from database import Base, get_db  # noqa: E402


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session, monkeypatch):
    import main

    main.app.dependency_overrides[get_db] = lambda: db_session

    # Başlangıç görevi get_db bağımlılığını değil, doğrudan SessionLocal'ı
    # kullanıyor. Yönlendirmezsek testler gerçek personel.db dosyasına yazar.
    monkeypatch.setattr(main, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


@pytest.fixture()
def kullanici_olustur(db_session):
    import auth as auth_utils

    def _olustur(kullanici_adi, rol, email=None, sifre="Test1234!"):
        k = models.Kullanici(
            ad=kullanici_adi.capitalize(),
            soyad="Test",
            email=email or f"{kullanici_adi}@sirket.com",
            kullanici_adi=kullanici_adi,
            sifre_hash=auth_utils.sifre_hashle(sifre),
            rol=rol,
        )
        db_session.add(k)
        db_session.commit()
        db_session.refresh(k)
        return k

    return _olustur


@pytest.fixture()
def token(client):
    def _token(kullanici_adi, sifre="Test1234!"):
        r = client.post("/auth/giris", data={"username": kullanici_adi, "password": sifre})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _token
