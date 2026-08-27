"""Otel konaklama maliyeti testleri.

Referans: LADES OTEL faturası LDE2026000000215
  15.08–24.08.2026 · 9 gece · oda 03 · tek kişi · BB
  net 26.756,76 + KDV %10 (2.675,68) + konaklama vergisi %1 (267,57)
  = 29.700,00 TL  →  gecelik 3.300 TL brüt
"""
from datetime import date

import models
import pytest


@pytest.fixture()
def otel(db_session):
    k = models.Konut(kod="OTL-001", ad="LADES OTEL", tur=models.KonutTur.otel,
                     kapasite=12, gecelik_ucret=3300, il="Mersin", ilce="Silifke")
    db_session.add(k); db_session.commit(); db_session.refresh(k)
    return k


@pytest.fixture()
def kisi(db_session):
    p = models.Personel(ad="Iasin", soyad="Abukhamdekh", email="iasin@sirket.com",
                        yaka=models.Yaka.mavi, uyruk="SY")
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    return p


def kayit_olustur(client, h, otel, kisi, **ek):
    govde = {"konut_id": otel.id, "personel_id": kisi.id,
             "giris_tarihi": "2026-08-15", "oda_no": "03", **ek}
    return client.post("/konaklama/kayitlar", headers=h, json=govde)


# ─── Fatura öncesi tahmin ────────────────────────────────────────────

def test_fatura_kesilmeden_maliyet_hesaplanir(client, token, kullanici_olustur,
                                              db_session, otel, kisi):
    """Asıl istek buydu: fatura gelmeden de elde bir rakam olsun."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    r = kayit_olustur(client, h, otel, kisi, cikis_tarihi="2026-08-24",
                      pansiyon="BB", rezervasyon_no="96195089")
    assert r.status_code == 201, r.text
    d = r.json()

    assert d["gece_sayisi"] == 9
    assert d["gecelik_ucret"] == 3300.0
    assert d["tahmini_tutar"] == 29700.0
    assert d["faturalandi"] is False
    # Faturadaki kırılımla birebir
    assert d["net_tutar"] == 26756.76
    assert d["kdv"] == 2675.68
    assert d["konaklama_vergisi"] == 267.57
    assert d["oda_no"] == "03" and d["pansiyon"] == "BB"
    assert d["rezervasyon_no"] == "96195089"


def test_gecelik_ucret_kayda_ozel_verilebilir(client, token, kullanici_olustur, otel, kisi):
    """Otelin varsayılanından farklı bir anlaşma olabilir."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = kayit_olustur(client, token("mudur"), otel, kisi,
                      cikis_tarihi="2026-08-20", gecelik_ucret=2800)
    d = r.json()
    assert d["gecelik_ucret"] == 2800.0
    assert d["tahmini_tutar"] == 2800.0 * 5


def test_devam_eden_konaklama_bugune_kadar_sayilir(client, token, kullanici_olustur,
                                                   db_session, otel, kisi):
    from datetime import timedelta
    kullanici_olustur("mudur", models.Rol.yonetici)
    giris = date.today() - timedelta(days=4)
    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": otel.id, "personel_id": kisi.id, "giris_tarihi": str(giris)})
    d = r.json()
    assert d["gece_sayisi"] == 4
    assert d["tahmini_tutar"] == 3300.0 * 4


# ─── Fatura işleme ───────────────────────────────────────────────────

def test_fatura_islenince_gercek_tutar_gecerli(client, token, kullanici_olustur, otel, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kid = kayit_olustur(client, h, otel, kisi, cikis_tarihi="2026-08-24").json()["id"]

    r = client.post(f"/konaklama/kayitlar/{kid}/fatura", headers=h, json={
        "fatura_no": "LDE2026000000215", "fatura_tarihi": "2026-08-24",
        "fatura_tutari": 29700})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["faturalandi"] is True
    assert d["fatura_no"] == "LDE2026000000215"
    assert d["tutar"] == 29700.0
    assert d["tahminden_fark"] == 0.0          # tahmin tuttu


def test_fatura_tahminden_saparsa_fark_gorunur(client, token, kullanici_olustur, otel, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kid = kayit_olustur(client, h, otel, kisi, cikis_tarihi="2026-08-24").json()["id"]

    r = client.post(f"/konaklama/kayitlar/{kid}/fatura", headers=h, json={
        "fatura_no": "LDE2026000000216", "fatura_tarihi": "2026-08-24",
        "fatura_tutari": 31200})
    assert r.json()["tahminden_fark"] == 1500.0
    assert r.json()["tutar"] == 31200.0


# ─── Otel özeti ──────────────────────────────────────────────────────

def test_otel_ozeti_kisi_bazli_dokum(client, token, kullanici_olustur, db_session, otel):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    kisiler = []
    for ad, eposta in [("Iasin", "iasin@sirket.com"), ("Aziz", "aziz@sirket.com")]:
        p = models.Personel(ad=ad, soyad="Test", email=eposta)
        db_session.add(p); db_session.commit(); db_session.refresh(p)
        kisiler.append(p)

    # Biri faturalanmış, biri bekliyor
    k1 = client.post("/konaklama/kayitlar", headers=h, json={
        "konut_id": otel.id, "personel_id": kisiler[0].id,
        "giris_tarihi": "2026-08-15", "cikis_tarihi": "2026-08-24"}).json()
    client.post(f"/konaklama/kayitlar/{k1['id']}/fatura", headers=h, json={
        "fatura_no": "LDE-1", "fatura_tarihi": "2026-08-24", "fatura_tutari": 29700})

    client.post("/konaklama/kayitlar", headers=h, json={
        "konut_id": otel.id, "personel_id": kisiler[1].id,
        "giris_tarihi": "2026-08-20", "cikis_tarihi": "2026-08-25"})

    d = client.get("/konaklama/otel-ozeti", headers=h).json()
    assert d["toplam_kayit"] == 2
    assert d["toplam_gece"] == 14                  # 9 + 5
    assert d["faturalanan"] == 1 and d["faturalanmamis"] == 1
    assert d["faturalanan_tutar"] == 29700.0
    assert d["bekleyen_tutar"] == 16500.0          # 5 gece × 3300
    assert d["toplam_tutar"] == 46200.0


def test_otel_ozeti_yalnizca_otelleri_kapsar(client, token, kullanici_olustur,
                                             db_session, otel, kisi):
    """Kamp ve kiralık ev kayıtları otel özetine girmemeli."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kamp = models.Konut(kod="KMP-001", ad="Wesna", tur=models.KonutTur.kamp, kapasite=150)
    db_session.add(kamp); db_session.commit(); db_session.refresh(kamp)

    p2 = models.Personel(ad="Mavi", soyad="Yaka", email="mavi@sirket.com")
    db_session.add(p2); db_session.commit(); db_session.refresh(p2)

    kayit_olustur(client, h, otel, kisi, cikis_tarihi="2026-08-24")
    client.post("/konaklama/kayitlar", headers=h, json={
        "konut_id": kamp.id, "personel_id": p2.id, "giris_tarihi": "2026-08-01"})

    d = client.get("/konaklama/otel-ozeti", headers=h).json()
    assert d["toplam_kayit"] == 1


def test_konaklama_guncellenebilir(client, token, kullanici_olustur, otel, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kid = kayit_olustur(client, h, otel, kisi).json()["id"]
    r = client.put(f"/konaklama/kayitlar/{kid}", headers=h, json={
        "oda_no": "07", "pansiyon": "HB", "gecelik_ucret": 3500})
    assert r.status_code == 200
    assert r.json()["oda_no"] == "07" and r.json()["gecelik_ucret"] == 3500.0
