"""Kamp konaklaması testleri.

Beyaz yaka kiralık evlerde, mavi yaka kamplarda kalıyor. Kampların bir
kısmının bedelini işveren karşılıyor, kalanını şirket ödüyor.
"""
import models
import pytest


@pytest.fixture()
def konaklama_yerleri(db_session):
    kayitlar = [
        # İşveren ödemeli kamplar
        models.Konut(kod="KMP-001", ad="Wesna Kamp", tur=models.KonutTur.kamp,
                     odeme_sorumlusu=models.OdemeSorumlusu.isveren, kapasite=50),
        models.Konut(kod="KMP-002", ad="Akkuyu Park", tur=models.KonutTur.kamp,
                     odeme_sorumlusu=models.OdemeSorumlusu.isveren, kapasite=40),
        # Şirket ödemeli kamplar
        models.Konut(kod="KMP-003", ad="İmperial", tur=models.KonutTur.kamp,
                     odeme_sorumlusu=models.OdemeSorumlusu.bykara, kapasite=30),
        # Kiralık ev
        models.Konut(kod="KNT-001", ad="Merkez Lojman", tur=models.KonutTur.kiralik_daire,
                     odeme_sorumlusu=models.OdemeSorumlusu.bykara, kapasite=4,
                     aylik_kira=28000),
    ]
    db_session.add_all(kayitlar)
    db_session.commit()
    for k in kayitlar:
        db_session.refresh(k)
    return kayitlar


# ─── Kategori ayrımı ─────────────────────────────────────────────────

def test_kamp_turu_kaydedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/konutlar", headers=token("mudur"), json={
        "ad": "Doğa 33", "tur": "kamp", "odeme_sorumlusu": "isveren", "kapasite": 60})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["tur"] == "kamp" and d["kamp_mi"] is True
    assert d["odeme_sorumlusu"] == "isveren"


def test_kamplara_kmp_kodu_verilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kamp = client.post("/konaklama/konutlar", headers=h,
                       json={"ad": "Zeytin Kamp", "tur": "kamp", "kapasite": 20}).json()
    ev = client.post("/konaklama/konutlar", headers=h,
                     json={"ad": "Daire 5", "tur": "kiralik_daire", "kapasite": 3}).json()
    assert kamp["kod"].startswith("KMP-")
    assert ev["kod"].startswith("KNT-")


def test_kategoriye_gore_suzme(client, token, kullanici_olustur, konaklama_yerleri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    kamplar = client.get("/konaklama/konutlar?kategori=kamp", headers=h).json()
    assert kamplar["toplam"] == 3
    assert all(k["kamp_mi"] for k in kamplar["veriler"])

    evler = client.get("/konaklama/konutlar?kategori=konut", headers=h).json()
    assert evler["toplam"] == 1
    assert evler["veriler"][0]["ad"] == "Merkez Lojman"


def test_odeme_sorumlusuna_gore_suzme(client, token, kullanici_olustur, konaklama_yerleri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    isveren = client.get("/konaklama/konutlar?odeme_sorumlusu=isveren", headers=h).json()
    assert {k["ad"] for k in isveren["veriler"]} == {"Wesna Kamp", "Akkuyu Park"}

    bykara = client.get("/konaklama/konutlar?kategori=kamp&odeme_sorumlusu=bykara",
                        headers=h).json()
    assert [k["ad"] for k in bykara["veriler"]] == ["İmperial"]


# ─── Özet ────────────────────────────────────────────────────────────

def test_ozet_kamp_ve_ev_ayirir(client, token, kullanici_olustur, konaklama_yerleri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/konaklama/ozet", headers=token("mudur")).json()

    assert d["kamp"]["sayi"] == 3
    assert d["kamp"]["kapasite"] == 120          # 50 + 40 + 30
    assert d["kamp"]["isveren_sayi"] == 2
    assert d["kamp"]["isveren_kapasite"] == 90
    assert d["kamp"]["bykara_sayi"] == 1
    assert d["kamp"]["bykara_kapasite"] == 30

    assert d["kiralik_ev"]["sayi"] == 1
    assert d["kiralik_ev"]["kapasite"] == 4
    assert d["kiralik_ev"]["aylik_kira"] == 28000.0


def test_ozet_doluluk_kategoriye_gore(client, token, kullanici_olustur, db_session,
                                      konaklama_yerleri):
    """Yerleşim sayıları kamp ve ev için ayrı hesaplanmalı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    p1 = models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com")
    p2 = models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com")
    db_session.add_all([p1, p2]); db_session.commit()

    wesna = next(k for k in konaklama_yerleri if k.ad == "Wesna Kamp")
    lojman = next(k for k in konaklama_yerleri if k.ad == "Merkez Lojman")
    from datetime import date
    db_session.add_all([
        models.Konaklama(konut_id=wesna.id, personel_id=p1.id, aktif=True,
                         giris_tarihi=date(2026, 8, 1)),
        models.Konaklama(konut_id=lojman.id, personel_id=p2.id, aktif=True,
                         giris_tarihi=date(2026, 8, 1)),
    ])
    db_session.commit()

    d = client.get("/konaklama/ozet", headers=token("mudur")).json()
    assert d["kamp"]["dolu"] == 1
    assert d["kamp"]["isveren_dolu"] == 1
    assert d["kamp"]["bykara_dolu"] == 0
    assert d["kiralik_ev"]["dolu"] == 1


def test_varsayilan_odeme_sorumlusu_bykara(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/konaklama/konutlar", headers=token("mudur"),
                    json={"ad": "Yeni Daire", "kapasite": 2})
    assert r.json()["odeme_sorumlusu"] == "bykara"


def test_odeme_sorumlusu_guncellenebilir(client, token, kullanici_olustur, konaklama_yerleri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    kid = konaklama_yerleri[0].id
    r = client.put(f"/konaklama/konutlar/{kid}", headers=h, json={"odeme_sorumlusu": "bykara"})
    assert r.status_code == 200
    assert r.json()["odeme_sorumlusu"] == "bykara"
