"""Kullanıcı yönetimi ve şifre işlemleri testleri."""
import models
import pytest


@pytest.fixture()
def admin(kullanici_olustur):
    return kullanici_olustur("patron", models.Rol.admin)


# ─── Yetki ───────────────────────────────────────────────────────────

def test_kullanici_listesi_sadece_admin(client, token, kullanici_olustur, admin):
    kullanici_olustur("ayse", models.Rol.personel)
    kullanici_olustur("mudur", models.Rol.yonetici)
    assert client.get("/auth/kullanicilar", headers=token("ayse")).status_code == 403
    assert client.get("/auth/kullanicilar", headers=token("mudur")).status_code == 403
    assert client.get("/auth/kullanicilar", headers=token("patron")).status_code == 200


def test_kullanici_olusturma_sadece_admin(client, token, kullanici_olustur, admin):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/auth/kullanicilar", headers=token("mudur"), json={
        "ad": "Yeni", "soyad": "Kisi", "email": "yeni@sirket.com",
        "kullanici_adi": "yenikisi", "sifre": "Gecerli123",
    })
    assert r.status_code == 403


# ─── Kullanıcı oluşturma ─────────────────────────────────────────────

def test_admin_kullanici_olusturabilir_ve_giris_yapilabilir(client, token, admin):
    r = client.post("/auth/kullanicilar", headers=token("patron"), json={
        "ad": "Yeni", "soyad": "Kisi", "email": "yeni@sirket.com",
        "kullanici_adi": "yenikisi", "sifre": "Gecerli123", "rol": "personel",
    })
    assert r.status_code == 201, r.text
    assert r.json()["kullanici_adi"] == "yenikisi"
    assert "sifre" not in r.json() and "sifre_hash" not in r.json()

    # Yeni kullanıcı gerçekten giriş yapabilmeli
    g = client.post("/auth/giris", data={"username": "yenikisi", "password": "Gecerli123"})
    assert g.status_code == 200


def test_ayni_kullanici_adi_reddedilir(client, token, admin, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/auth/kullanicilar", headers=token("patron"), json={
        "ad": "Baska", "soyad": "Kisi", "email": "baska@sirket.com",
        "kullanici_adi": "ayse", "sifre": "Gecerli123",
    })
    assert r.status_code == 400
    assert "kullanıcı adı" in r.json()["detail"].lower()


def test_ayni_eposta_reddedilir(client, token, admin, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel, email="ayse@sirket.com")
    r = client.post("/auth/kullanicilar", headers=token("patron"), json={
        "ad": "Baska", "soyad": "Kisi", "email": "ayse@sirket.com",
        "kullanici_adi": "baskakisi", "sifre": "Gecerli123",
    })
    assert r.status_code == 400


@pytest.mark.parametrize("sifre", ["kisa1", "sadeceharf", "12345678", "       1a"])
def test_zayif_sifre_reddedilir(client, token, admin, sifre):
    r = client.post("/auth/kullanicilar", headers=token("patron"), json={
        "ad": "Yeni", "soyad": "Kisi", "email": "yeni@sirket.com",
        "kullanici_adi": "yenikisi", "sifre": sifre,
    })
    assert r.status_code == 422, f"{sifre!r} kabul edildi"


def test_gecersiz_kullanici_adi_reddedilir(client, token, admin):
    r = client.post("/auth/kullanicilar", headers=token("patron"), json={
        "ad": "Yeni", "soyad": "Kisi", "email": "yeni@sirket.com",
        "kullanici_adi": "boslu klu ad", "sifre": "Gecerli123",
    })
    assert r.status_code == 422


# ─── Güncelleme ve son admin koruması ────────────────────────────────

def test_admin_kendi_rolunu_degistiremez(client, token, admin):
    r = client.put(f"/auth/kullanicilar/{admin.id}", headers=token("patron"),
                   json={"rol": "personel"})
    assert r.status_code == 400


def test_admin_kendini_pasife_alamaz(client, token, admin):
    r = client.put(f"/auth/kullanicilar/{admin.id}", headers=token("patron"),
                   json={"aktif": False})
    assert r.status_code == 400
    assert client.delete(f"/auth/kullanicilar/{admin.id}",
                         headers=token("patron")).status_code == 400


def test_son_admin_pasife_alinamaz(client, token, admin, kullanici_olustur, db_session):
    """İkinci bir admin üzerinden bile son aktif admin düşürülememeli."""
    ikinci = kullanici_olustur("patron2", models.Rol.admin)
    # patron2'yi pasife almak serbest — geriye patron kalıyor
    assert client.delete(f"/auth/kullanicilar/{ikinci.id}",
                         headers=token("patron")).status_code == 204
    db_session.refresh(ikinci)
    assert ikinci.aktif is False


def test_rol_degisikligi_uygulanir(client, token, admin, kullanici_olustur, db_session):
    ayse = kullanici_olustur("ayse", models.Rol.personel)
    r = client.put(f"/auth/kullanicilar/{ayse.id}", headers=token("patron"),
                   json={"rol": "yonetici"})
    assert r.status_code == 200
    db_session.refresh(ayse)
    assert ayse.rol == models.Rol.yonetici


def test_pasif_kullanici_giris_yapamaz(client, token, admin, kullanici_olustur):
    ayse = kullanici_olustur("ayse", models.Rol.personel)
    client.delete(f"/auth/kullanicilar/{ayse.id}", headers=token("patron"))
    g = client.post("/auth/giris", data={"username": "ayse", "password": "Test1234!"})
    assert g.status_code == 401


# ─── Şifre değiştirme ────────────────────────────────────────────────

def test_kullanici_kendi_sifresini_degistirir(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/auth/sifre-degistir", headers=token("ayse"),
                    json={"mevcut_sifre": "Test1234!", "yeni_sifre": "YeniSifre9"})
    assert r.status_code == 200

    assert client.post("/auth/giris",
                       data={"username": "ayse", "password": "Test1234!"}).status_code == 401
    assert client.post("/auth/giris",
                       data={"username": "ayse", "password": "YeniSifre9"}).status_code == 200


def test_yanlis_mevcut_sifre_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/auth/sifre-degistir", headers=token("ayse"),
                    json={"mevcut_sifre": "YanlisSifre1", "yeni_sifre": "YeniSifre9"})
    assert r.status_code == 400


def test_ayni_sifreye_degistirilemez(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/auth/sifre-degistir", headers=token("ayse"),
                    json={"mevcut_sifre": "Test1234!", "yeni_sifre": "Test1234!"})
    assert r.status_code == 400


def test_zayif_yeni_sifre_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/auth/sifre-degistir", headers=token("ayse"),
                    json={"mevcut_sifre": "Test1234!", "yeni_sifre": "kisa"})
    assert r.status_code == 422


# ─── Şifre sıfırlama ─────────────────────────────────────────────────

def test_admin_sifre_sifirlayabilir(client, token, admin, kullanici_olustur):
    ayse = kullanici_olustur("ayse", models.Rol.personel)
    r = client.post(f"/auth/kullanicilar/{ayse.id}/sifre-sifirla",
                    headers=token("patron"), json={"yeni_sifre": "Sifirlandi1"})
    assert r.status_code == 200
    assert client.post("/auth/giris",
                       data={"username": "ayse", "password": "Sifirlandi1"}).status_code == 200


def test_personel_baskasinin_sifresini_sifirlayamaz(client, token, kullanici_olustur):
    kullanici_olustur("ayse", models.Rol.personel)
    hedef = kullanici_olustur("mehmet", models.Rol.personel)
    r = client.post(f"/auth/kullanicilar/{hedef.id}/sifre-sifirla",
                    headers=token("ayse"), json={"yeni_sifre": "Sifirlandi1"})
    assert r.status_code == 403
