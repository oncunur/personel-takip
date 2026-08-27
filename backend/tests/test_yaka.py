"""Yaka tipi ve konaklama uyumu testleri."""
from datetime import date

import models
import pytest


@pytest.fixture()
def ekip(db_session):
    kisiler = [
        models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com",
                        yaka=models.Yaka.mavi),
        models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com",
                        yaka=models.Yaka.beyaz),
        models.Personel(ad="Belirsiz", soyad="Kisi", email="belirsiz@sirket.com"),
    ]
    db_session.add_all(kisiler); db_session.commit()
    for k in kisiler:
        db_session.refresh(k)
    return kisiler


@pytest.fixture()
def yerler(db_session):
    kayitlar = [
        models.Konut(kod="KMP-001", ad="Wesna Kamp", tur=models.KonutTur.kamp,
                     odeme_sorumlusu=models.OdemeSorumlusu.isveren, kapasite=50),
        models.Konut(kod="KNT-001", ad="Merkez Lojman", tur=models.KonutTur.kiralik_daire,
                     kapasite=4),
    ]
    db_session.add_all(kayitlar); db_session.commit()
    for k in kayitlar:
        db_session.refresh(k)
    return {"kamp": kayitlar[0], "ev": kayitlar[1]}


# ─── Alan ────────────────────────────────────────────────────────────

def test_yaka_kaydedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com", "yaka": "mavi"})
    assert r.status_code == 201, r.text
    assert r.json()["yaka"] == "mavi"


def test_yaka_bos_birakilabilir(client, token, kullanici_olustur):
    """Mevcut kayıtlarda bu alan boş; zorunlu olmamalı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Kisi", "soyad": "Test", "email": "kisi@sirket.com"})
    assert r.status_code == 201 and r.json()["yaka"] is None


def test_gecersiz_yaka_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Kisi", "soyad": "Test", "email": "kisi@sirket.com", "yaka": "yesil"})
    assert r.status_code == 422


def test_yakaya_gore_suzme(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    assert [v["ad"] for v in client.get("/personel?yaka=mavi", headers=h).json()["veriler"]] == ["Aziz"]
    assert [v["ad"] for v in client.get("/personel?yaka=beyaz", headers=h).json()["veriler"]] == ["Kemal"]


# ─── Yerleştirme uyumu ───────────────────────────────────────────────

def test_mavi_yaka_kampa_yerlesince_uyari_yok(client, token, kullanici_olustur, ekip, yerler):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["kamp"].id, "personel_id": ekip[0].id,
        "giris_tarihi": "2026-08-01"})
    assert r.status_code == 201
    assert r.json()["uyari"] is None


def test_mavi_yaka_kiralik_eve_yerlesince_uyarir(client, token, kullanici_olustur, ekip, yerler):
    """Kayıt engellenmez, yalnızca dikkat çekilir."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["ev"].id, "personel_id": ekip[0].id,
        "giris_tarihi": "2026-08-01"})
    assert r.status_code == 201                 # kayıt yine oluşur
    assert "mavi yaka" in r.json()["uyari"]
    assert "Merkez Lojman" in r.json()["uyari"]


def test_beyaz_yaka_kampa_yerlesince_uyarir(client, token, kullanici_olustur, ekip, yerler):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["kamp"].id, "personel_id": ekip[1].id,
        "giris_tarihi": "2026-08-01"})
    assert r.status_code == 201
    assert "beyaz yaka" in r.json()["uyari"]


def test_beyaz_yaka_kiralik_evde_uyari_yok(client, token, kullanici_olustur, ekip, yerler):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["ev"].id, "personel_id": ekip[1].id,
        "giris_tarihi": "2026-08-01"})
    assert r.json()["uyari"] is None


def test_yakasi_belirsiz_personelde_uyari_yok(client, token, kullanici_olustur, ekip, yerler):
    """Alan boş bırakılmış kayıtlar uyarı üretmemeli."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["kamp"].id, "personel_id": ekip[2].id,
        "giris_tarihi": "2026-08-01"})
    assert r.status_code == 201 and r.json()["uyari"] is None
