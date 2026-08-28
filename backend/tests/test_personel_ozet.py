"""Personel listesinin üstündeki sayılar.

Yaka dağılımı ve süresi geçmiş belge sayısı ayrı uçlardan toplanıyordu;
liste sayfası tek çağrıyla açılsın diye birleştirildi. Süresi geçmiş
çalışma izni yaptırım doğurduğu için bu sayı listenin üstünde durur.
"""
from datetime import date, timedelta

import models
import pytest


@pytest.fixture()
def kadro(db_session):
    bugun = date.today()
    kisiler = [
        models.Personel(ad="Beyaz", soyad="Bir", email="b1@sirket.com",
                        yaka=models.Yaka.beyaz, uyruk="TR"),
        models.Personel(ad="Mavi", soyad="Bir", email="m1@sirket.com",
                        yaka=models.Yaka.mavi, uyruk="UZ",
                        calisma_izni_bitis=bugun - timedelta(days=5)),   # süresi geçmiş
        models.Personel(ad="Mavi", soyad="Iki", email="m2@sirket.com",
                        yaka=models.Yaka.mavi, uyruk="KG",
                        calisma_izni_bitis=bugun + timedelta(days=10)),  # yaklaşan
        models.Personel(ad="Yakasiz", soyad="Kisi", email="y1@sirket.com", uyruk="TR"),
        models.Personel(ad="Pasif", soyad="Kisi", email="p1@sirket.com",
                        yaka=models.Yaka.mavi, uyruk="TJ",
                        durum=models.PersonelDurum.pasif),
    ]
    db_session.add_all(kisiler); db_session.commit()
    return kisiler


def test_ozet_sayilari(client, token, kullanici_olustur, kadro):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/personel/ozet", headers=token("mudur")).json()

    assert d["toplam"] == 5
    assert d["aktif"] == 4 and d["pasif"] == 1
    assert d["beyaz_yaka"] == 1
    assert d["mavi_yaka"] == 2          # pasif olan sayılmaz
    assert d["yaka_girilmemis"] == 1
    assert d["yabanci"] == 2            # aktifler arasında TR olmayan


def test_suresi_gecmis_belge_ayri_sayilir(client, token, kullanici_olustur, kadro):
    kullanici_olustur("mudur2", models.Rol.yonetici)
    d = client.get("/personel/ozet", headers=token("mudur2")).json()
    assert d["belge_gecmis"] == 1
    assert d["belge_yaklasan"] == 1


def test_pasif_personelin_belgesi_uyari_uretmez(client, token, kullanici_olustur,
                                                db_session):
    """Çalışmayan kişinin izni dolmuş olabilir; uyarı listesini şişirmemeli."""
    kullanici_olustur("mudur3", models.Rol.yonetici)
    p = models.Personel(ad="Ayrilan", soyad="Kisi", email="ayrilan@sirket.com",
                        yaka=models.Yaka.mavi, uyruk="UZ",
                        durum=models.PersonelDurum.pasif,
                        calisma_izni_bitis=date.today() - timedelta(days=100))
    db_session.add(p); db_session.commit()
    d = client.get("/personel/ozet", headers=token("mudur3")).json()
    assert d["belge_gecmis"] == 0


def test_ozet_personel_rolune_kapali(client, token, kullanici_olustur):
    kullanici_olustur("calisan", models.Rol.personel)
    r = client.get("/personel/ozet", headers=token("calisan"))
    assert r.status_code == 403
