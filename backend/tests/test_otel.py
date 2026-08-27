"""Otel konaklaması testleri.

Otel geçici konaklamadır: işe giriş sürecinde ve kalıcı konaklama
bulunana kadar kullanılır, gecelik ücretlendirilir.
"""
import models
import pytest


@pytest.fixture()
def yerler(db_session):
    kayitlar = [
        models.Konut(kod="OTL-001", ad="Şehir Otel", tur=models.KonutTur.otel,
                     kapasite=12, gecelik_ucret=2500),
        models.Konut(kod="KMP-001", ad="Wesna Kamp", tur=models.KonutTur.kamp,
                     kapasite=150, odeme_sorumlusu=models.OdemeSorumlusu.isveren),
        models.Konut(kod="KNT-001", ad="Merkez Lojman", tur=models.KonutTur.kiralik_daire,
                     kapasite=4, aylik_kira=28000),
    ]
    db_session.add_all(kayitlar); db_session.commit()
    for k in kayitlar:
        db_session.refresh(k)
    return {"otel": kayitlar[0], "kamp": kayitlar[1], "ev": kayitlar[2]}


def test_otel_kaydi_olusturulur(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/konutlar", headers=token("mudur"), json={
        "ad": "Park Otel", "tur": "otel", "kapasite": 8, "gecelik_ucret": 3200})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["otel_mi"] is True and d["gecelik_ucret"] == 3200.0
    assert d["kod"].startswith("OTL-")


def test_kategori_suzgeci_uc_grubu_ayirir(client, token, kullanici_olustur, yerler):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    assert client.get("/konaklama/konutlar?kategori=otel", headers=h).json()["toplam"] == 1
    assert client.get("/konaklama/konutlar?kategori=kamp", headers=h).json()["toplam"] == 1
    # Kiralık evler: kamp ve otel dışındakiler
    evler = client.get("/konaklama/konutlar?kategori=konut", headers=h).json()
    assert evler["toplam"] == 1 and evler["veriler"][0]["ad"] == "Merkez Lojman"


def test_ozet_oteli_ayri_raporlar(client, token, kullanici_olustur, db_session, yerler):
    kullanici_olustur("mudur", models.Rol.yonetici)
    p = models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com",
                        yaka=models.Yaka.beyaz)
    db_session.add(p); db_session.commit(); db_session.refresh(p)

    from datetime import date
    db_session.add(models.Konaklama(konut_id=yerler["otel"].id, personel_id=p.id,
                                    aktif=True, giris_tarihi=date(2026, 8, 1)))
    db_session.commit()

    d = client.get("/konaklama/ozet", headers=token("mudur")).json()
    assert d["otel"]["sayi"] == 1
    assert d["otel"]["dolu"] == 1
    assert d["otel"]["gunluk_maliyet"] == 2500.0      # 1 kişi × 2500
    assert d["kiralik_ev"]["sayi"] == 1               # otel eve dahil edilmemeli


def test_otelde_yaka_uyarisi_verilmez(client, token, kullanici_olustur, db_session, yerler):
    """Otel geçici konaklama; her iki yaka için de olağan."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    mavi = models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com",
                           yaka=models.Yaka.mavi)
    db_session.add(mavi); db_session.commit(); db_session.refresh(mavi)

    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["otel"].id, "personel_id": mavi.id,
        "giris_tarihi": "2026-08-01"})
    assert r.status_code == 201
    assert r.json()["uyari"] is None


def test_mavi_yaka_kiralik_evde_hala_uyarir(client, token, kullanici_olustur,
                                            db_session, yerler):
    """Otel istisnası diğer uyarıları kapatmamalı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    mavi = models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com",
                           yaka=models.Yaka.mavi)
    db_session.add(mavi); db_session.commit(); db_session.refresh(mavi)

    r = client.post("/konaklama/kayitlar", headers=token("mudur"), json={
        "konut_id": yerler["ev"].id, "personel_id": mavi.id,
        "giris_tarihi": "2026-08-01"})
    assert "mavi yaka" in r.json()["uyari"]
