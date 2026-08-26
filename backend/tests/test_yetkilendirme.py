"""Rol bazlı erişim kontrolü testleri.

Her test, personel rolündeki bir kullanıcının başkasının verisine
erişememesi gerektiğini doğrular. Bu uçlarda daha önce rol kontrolü
eksikti; testler aynı boşluğun geri gelmesini engeller.
"""
from datetime import date

import models
import pytest


@pytest.fixture()
def veri(db_session):
    """Hassas verili bir çalışan, bordrosu ve izin talebi."""
    p = models.Personel(
        ad="Mehmet", soyad="Demir", email="mehmet@sirket.com",
        tc_kimlik="12345678901", adres="Gizli Mah. 5", maas=95000,
        dogum_tarihi=date(1990, 1, 1), notlar="Özel not",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    db_session.add(models.Bordro(
        personel_id=p.id, yil=2026, ay=8, baz_maas=95000, brut_maas=95000,
        net_maas=70000, sgk_isci=0, issizlik_isci=0, gelir_vergisi=0,
        damga_vergisi=0, fazla_mesai_ucr=0, prim=0, diger_eklemeler=0,
        calisilan_gun=30, fazla_mesai_saat=0,
    ))
    db_session.add(models.IzinTalep(
        personel_id=p.id, tur=models.IzinTur.yillik,
        baslangic_tarihi=date(2026, 9, 1), bitis_tarihi=date(2026, 9, 5),
        gun_sayisi=5, durum=models.IzinDurum.beklemede, aciklama="Özel izin notu",
    ))
    db_session.commit()
    return p


# ─── Personel listesi: hassas alanlar ────────────────────────────────

def test_personel_rolu_baskasinin_hassas_verisini_goremez(
    client, token, kullanici_olustur, veri
):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get("/personel", headers=token("ayse"))
    assert r.status_code == 200
    kayit = next(v for v in r.json()["veriler"] if v["id"] == veri.id)
    assert kayit["tc_kimlik"] is None
    assert kayit["maas"] is None
    assert kayit["adres"] is None
    assert kayit["dogum_tarihi"] is None
    assert kayit["notlar"] is None
    # Rehber bilgisi görünmeye devam etmeli
    assert kayit["ad"] == "Mehmet"


def test_personel_rolu_kendi_kaydini_tam_gorur(
    client, token, kullanici_olustur, db_session, veri
):
    kullanici_olustur("mehmet", models.Rol.personel, email="mehmet@sirket.com")
    r = client.get(f"/personel/{veri.id}", headers=token("mehmet"))
    assert r.status_code == 200
    assert r.json()["tc_kimlik"] == "12345678901"
    assert r.json()["maas"] == 95000.0


def test_yonetici_hassas_veriyi_gorur(client, token, kullanici_olustur, veri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.get(f"/personel/{veri.id}", headers=token("mudur"))
    assert r.json()["tc_kimlik"] == "12345678901"
    assert r.json()["maas"] == 95000.0


def test_personel_rolu_detayda_da_maskelenir(client, token, kullanici_olustur, veri):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get(f"/personel/{veri.id}", headers=token("ayse"))
    assert r.status_code == 200
    assert r.json()["maas"] is None
    assert r.json()["tc_kimlik"] is None


# ─── Bordro ──────────────────────────────────────────────────────────

def test_personel_rolu_baskasinin_bordrosunu_goremez(
    client, token, kullanici_olustur, veri
):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get("/bordro", headers=token("ayse"))
    assert r.status_code == 200
    assert r.json()["toplam"] == 0
    assert r.json()["veriler"] == []


def test_personel_rolu_kendi_bordrosunu_gorur(client, token, kullanici_olustur, veri):
    kullanici_olustur("mehmet", models.Rol.personel, email="mehmet@sirket.com")
    r = client.get("/bordro", headers=token("mehmet"))
    assert r.json()["toplam"] == 1
    assert r.json()["veriler"][0]["net_maas"] == 70000.0


def test_yonetici_tum_bordrolari_gorur(client, token, kullanici_olustur, veri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.get("/bordro", headers=token("mudur"))
    assert r.json()["toplam"] == 1


# ─── İzin ────────────────────────────────────────────────────────────

def test_personel_kaydi_olmayan_kullanici_izinleri_goremez(
    client, token, kullanici_olustur, veri
):
    """Eşleşen Personel kaydı yokken filtre atlanıp tüm izinler dönmemeli."""
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get("/izin", headers=token("ayse"))
    assert r.status_code == 200
    assert r.json()["toplam"] == 0


def test_personel_kendi_iznini_gorur(client, token, kullanici_olustur, veri):
    kullanici_olustur("mehmet", models.Rol.personel, email="mehmet@sirket.com")
    r = client.get("/izin", headers=token("mehmet"))
    assert r.json()["toplam"] == 1


def test_baskasi_adina_izin_talebi_acilamaz(client, token, kullanici_olustur, veri):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/izin", headers=token("ayse"), json={
        "personel_id": veri.id, "tur": "yillik",
        "baslangic_tarihi": "2026-11-01", "bitis_tarihi": "2026-11-03",
    })
    assert r.status_code == 403


def test_baskasinin_izni_iptal_edilemez(client, token, kullanici_olustur, db_session, veri):
    kullanici_olustur("ayse", models.Rol.personel)
    talep = db_session.query(models.IzinTalep).first()
    r = client.delete(f"/izin/{talep.id}", headers=token("ayse"))
    assert r.status_code == 403
    db_session.refresh(talep)
    assert talep.durum == models.IzinDurum.beklemede


def test_baskasinin_izin_bakiyesi_sorgulanamaz(client, token, kullanici_olustur, veri):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get(f"/izin/bakiye/{veri.id}", headers=token("ayse"))
    assert r.status_code == 403


def test_kendi_bakiyesini_sorgulayabilir(client, token, kullanici_olustur, veri):
    kullanici_olustur("mehmet", models.Rol.personel, email="mehmet@sirket.com")
    r = client.get("/izin/bakiyem", headers=token("mehmet"))
    assert r.status_code == 200
    assert r.json()["hak"] == 14


def test_personel_kaydi_olmayan_bos_bakiye_alir(client, token, kullanici_olustur, veri):
    """Personel kaydı olmayan hesap, başkasının bakiyesini görmemeli."""
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get("/izin/bakiyem", headers=token("ayse"))
    assert r.status_code == 200
    assert r.json()["kalan"] is None


# ─── Aylık özet ──────────────────────────────────────────────────────

def test_personel_rolu_aylik_ozeti_goremez(client, token, kullanici_olustur, veri):
    """Aylık özet tüm personelin maaş ve bordro verisini içerir."""
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.get("/ozet/aylik?yil=2026&ay=8", headers=token("ayse"))
    assert r.status_code == 403


def test_yonetici_aylik_ozeti_gorur(client, token, kullanici_olustur, veri):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.get("/ozet/aylik?yil=2026&ay=8", headers=token("mudur"))
    assert r.status_code == 200
    assert r.json()["toplam"] == 1


# ─── Kimlik doğrulama ────────────────────────────────────────────────

def test_tokensiz_erisim_reddedilir(client):
    for yol in ("/personel", "/bordro", "/izin", "/ozet/aylik?yil=2026&ay=8"):
        assert client.get(yol).status_code == 401


def test_gecersiz_token_reddedilir(client):
    r = client.get("/personel", headers={"Authorization": "Bearer sahte.token.degeri"})
    assert r.status_code == 401
