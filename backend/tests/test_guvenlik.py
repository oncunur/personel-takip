"""Oturum ve giriş güvenliği testleri."""
import time

import guvenlik
import models
import pytest


@pytest.fixture(autouse=True)
def temiz_durum():
    """Her test kendi başına çalışsın; sayaçlar bellekte tutuluyor."""
    guvenlik.sifirla()
    yield
    guvenlik.sifirla()


# ─── Token iptali (çıkış) ────────────────────────────────────────────

def test_cikis_tokeni_gecersiz_kilar(client, token, kullanici_olustur):
    """Çıkış öncesinde yalnızca istemci tokenı siliyordu; kopyalanmış
    bir token süresi dolana kadar geçerli kalıyordu."""
    kullanici_olustur("ayse", models.Rol.personel)
    h = token("ayse")

    assert client.get("/auth/ben", headers=h).status_code == 200
    assert client.post("/auth/cikis", headers=h).status_code == 200
    r = client.get("/auth/ben", headers=h)
    assert r.status_code == 401
    assert "sonlandırılmış" in r.json()["detail"]


def test_iptal_edilen_token_tum_uclarda_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    client.post("/auth/cikis", headers=h)
    for yol in ("/personel", "/izin", "/bordro", "/auth/kullanicilar"):
        assert client.get(yol, headers=h).status_code == 401, yol


def test_cikis_diger_oturumlari_etkilemez(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    birinci = token("ayse")
    ikinci = token("ayse")          # ikinci kez giriş, farklı token

    client.post("/auth/cikis", headers=birinci)
    assert client.get("/auth/ben", headers=birinci).status_code == 401
    assert client.get("/auth/ben", headers=ikinci).status_code == 200


def test_suresi_gecen_kayitlar_temizlenir():
    guvenlik.token_iptal_et("eski", time.time() - 10)
    guvenlik.token_iptal_et("yeni", time.time() + 600)
    assert guvenlik.token_iptal_mi("eski") is False
    assert guvenlik.token_iptal_mi("yeni") is True
    assert guvenlik.kara_liste_boyutu() == 1


# ─── Giriş hız sınırı ───────────────────────────────────────────────

def test_art_arda_hatali_denemeler_kilitler(client, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    yanlis = {"username": "ayse", "password": "YanlisSifre1"}

    for i in range(guvenlik.DENEME_SINIRI - 1):
        r = client.post("/auth/giris", data=yanlis)
        assert r.status_code == 401, f"{i+1}. deneme"

    # Sınıra ulaşan deneme kilitler
    r = client.post("/auth/giris", data=yanlis)
    assert r.status_code == 401
    assert "kilitlendi" in r.json()["detail"]

    # Bundan sonrası 429
    r = client.post("/auth/giris", data=yanlis)
    assert r.status_code == 429
    assert "dakika sonra" in r.json()["detail"]


def test_kilitliyken_dogru_sifre_de_reddedilir(client, kullanici_olustur):
    """Kilit, doğru parolayı deneyen saldırganı da durdurmalı."""
    kullanici_olustur("ayse", models.Rol.personel)
    for _ in range(guvenlik.DENEME_SINIRI):
        client.post("/auth/giris", data={"username": "ayse", "password": "Yanlis1"})

    r = client.post("/auth/giris", data={"username": "ayse", "password": "Test1234!"})
    assert r.status_code == 429


def test_basarili_giris_sayaci_sifirlar(client, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    for _ in range(3):
        client.post("/auth/giris", data={"username": "ayse", "password": "Yanlis1"})

    assert client.post("/auth/giris", data={"username": "ayse", "password": "Test1234!"}).status_code == 200

    # Sayaç sıfırlandığı için yeniden tam hak
    for i in range(guvenlik.DENEME_SINIRI - 1):
        r = client.post("/auth/giris", data={"username": "ayse", "password": "Yanlis1"})
        assert r.status_code == 401


def test_kilit_kullanici_basina(client, kullanici_olustur):
    """Bir kullanıcının kilitlenmesi diğerlerini etkilememeli."""
    kullanici_olustur("ayse", models.Rol.personel)
    kullanici_olustur("mehmet", models.Rol.personel)

    for _ in range(guvenlik.DENEME_SINIRI):
        client.post("/auth/giris", data={"username": "ayse", "password": "Yanlis1"})

    assert client.post("/auth/giris", data={"username": "ayse", "password": "Test1234!"}).status_code == 429
    assert client.post("/auth/giris", data={"username": "mehmet", "password": "Test1234!"}).status_code == 200


def test_kalan_hak_uyarisi(client, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    yanlis = {"username": "ayse", "password": "Yanlis1"}
    mesajlar = [client.post("/auth/giris", data=yanlis).json()["detail"]
                for _ in range(guvenlik.DENEME_SINIRI - 1)]
    # Son denemelere doğru kalan hak bildirilir
    assert any("deneme hakkınız kaldı" in m for m in mesajlar)


def test_buyuk_kucuk_harf_ayni_hesap_sayilir(client, kullanici_olustur):
    """Kullanıcı adını büyük harfle yazarak sınır atlatılamamalı."""
    kullanici_olustur("ayse", models.Rol.personel)
    for _ in range(guvenlik.DENEME_SINIRI):
        client.post("/auth/giris", data={"username": "ayse", "password": "Yanlis1"})
    r = client.post("/auth/giris", data={"username": "AYSE", "password": "Yanlis1"})
    assert r.status_code == 429
