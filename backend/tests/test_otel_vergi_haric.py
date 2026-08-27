"""Otel gecelik fiyatı vergi hariç girilir.

Oteller fiyatı vergisiz veriyor (LADES OTEL 3.000/gece); ödenecek tutar
bulunurken %10 KDV ve %1 konaklama vergisi eklenir. Önceden girilen ücret
vergi dahil sayılıyor, tahminler faturadan düşük çıkıyordu — aynı otelde
tahmini kayıt 3.000, faturalı kayıt 3.300 görünüyordu.
"""
from datetime import date

import models
import pytest


CARPAN = 1.11   # 1 + %10 KDV + %1 konaklama vergisi


@pytest.fixture()
def otel(db_session):
    k = models.Konut(kod="OTL-001", ad="LADES OTEL", tur=models.KonutTur.otel,
                     kapasite=12, gecelik_ucret=3000, il="Mersin")
    db_session.add(k); db_session.commit(); db_session.refresh(k)
    return k


@pytest.fixture()
def kisi(db_session):
    p = models.Personel(ad="Turan", soyad="Derya", email="turan@sirket.com",
                        yaka=models.Yaka.beyaz, uyruk="TR")
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    return p


def _kayit(client, h, otel, kisi, **ek):
    return client.post("/konaklama/kayitlar", headers=h, json={
        "konut_id": otel.id, "personel_id": kisi.id,
        "giris_tarihi": "2026-08-01", **ek,
    })


def test_tahmine_vergi_eklenir(client, token, kullanici_olustur, otel, kisi):
    """3.000 vergi hariç → 1 gece için 3.330 ödenir."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    r = _kayit(client, h, otel, kisi, cikis_tarihi="2026-08-02")
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["gece_sayisi"] == 1
    assert d["gecelik_ucret"] == 3000          # alan vergi hariç
    assert d["tutar"] == pytest.approx(3000 * CARPAN, abs=0.01)
    assert d["net_tutar"] == pytest.approx(3000, abs=0.01)
    assert d["kdv"] == pytest.approx(300, abs=0.01)
    assert d["konaklama_vergisi"] == pytest.approx(30, abs=0.01)


def test_dokuz_gece_tahmini(client, token, kullanici_olustur, otel, kisi):
    kullanici_olustur("mudur2", models.Rol.yonetici)
    h = token("mudur2")
    r = _kayit(client, h, otel, kisi, cikis_tarihi="2026-08-10")
    d = r.json()
    assert d["gece_sayisi"] == 9
    assert d["tutar"] == pytest.approx(9 * 3000 * CARPAN, abs=0.01)


def test_fatura_islenince_gercek_tutar_gecerli(client, token, kullanici_olustur,
                                               otel, kisi):
    """Fatura geldiğinde tahmin devre dışı kalır, matrah geriye ayrıştırılır."""
    kullanici_olustur("mudur3", models.Rol.yonetici)
    h = token("mudur3")
    kid = _kayit(client, h, otel, kisi, cikis_tarihi="2026-08-10").json()["id"]

    r = client.post(f"/konaklama/kayitlar/{kid}/fatura", headers=h, json={
        "fatura_no": "LDE2026000000215", "fatura_tarihi": "2026-08-24",
        "fatura_tutari": 29700,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["faturalandi"] is True
    assert d["tutar"] == 29700
    # Gerçek faturanın matrahı: 26.756,76
    assert d["net_tutar"] == pytest.approx(26756.76, abs=0.05)
    assert d["kdv"] == pytest.approx(2675.68, abs=0.05)
    assert d["konaklama_vergisi"] == pytest.approx(267.57, abs=0.05)


def test_ayni_otelde_tahmin_ve_fatura_ayni_gecelikten_gider(client, token,
                                                            kullanici_olustur,
                                                            otel, kisi, db_session):
    """Karışıklığın kaynağı buydu: iki kayıt farklı gecelik gösteriyordu."""
    kullanici_olustur("mudur4", models.Rol.yonetici)
    h = token("mudur4")
    ikinci = models.Personel(ad="Hatice", soyad="Sahin", email="hs@sirket.com")
    db_session.add(ikinci); db_session.commit(); db_session.refresh(ikinci)

    a = _kayit(client, h, otel, kisi, cikis_tarihi="2026-08-02").json()
    b = client.post("/konaklama/kayitlar", headers=h, json={
        "konut_id": otel.id, "personel_id": ikinci.id,
        "giris_tarihi": "2026-08-01", "cikis_tarihi": "2026-08-10",
    }).json()
    assert a["gecelik_ucret"] == b["gecelik_ucret"] == 3000
