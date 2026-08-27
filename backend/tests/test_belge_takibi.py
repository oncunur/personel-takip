"""Çalışma ve ikamet izni süre takibi testleri."""
from datetime import date, timedelta

import kimlik
import models
import pytest

BUGUN = date(2026, 8, 26)


class SahtePersonel:
    def __init__(self, **kw):
        self.uyruk = None
        self.calisma_izni_bitis = None
        self.ikamet_izni_bitis = None
        self.pasaport_gecerlilik = None
        self.__dict__.update(kw)


# ─── Uyarı mantığı ───────────────────────────────────────────────────

def test_suresi_yaklasan_calisma_izni_uyarir():
    p = SahtePersonel(uyruk="UZ", calisma_izni_bitis=BUGUN + timedelta(days=10))
    u = kimlik.belge_uyarilari(p, BUGUN)
    assert len(u) == 1
    assert u[0]["belge"] == "Çalışma izni" and u[0]["kalan_gun"] == 10
    assert u[0]["durum"] == "yaklasiyor"


def test_suresi_gecmis_izin_gecti_olarak_isaretlenir():
    p = SahtePersonel(uyruk="UZ", calisma_izni_bitis=BUGUN - timedelta(days=5))
    u = kimlik.belge_uyarilari(p, BUGUN)
    assert u[0]["durum"] == "gecti" and u[0]["kalan_gun"] == -5


def test_uzak_tarihli_izin_uyarmaz():
    p = SahtePersonel(uyruk="KG", calisma_izni_bitis=BUGUN + timedelta(days=90))
    assert kimlik.belge_uyarilari(p, BUGUN) == []


def test_turk_vatandasinda_calisma_izni_aranmaz():
    """Türk vatandaşı için çalışma/ikamet izni gerekmez."""
    p = SahtePersonel(uyruk="TR", calisma_izni_bitis=BUGUN - timedelta(days=5),
                      ikamet_izni_bitis=BUGUN - timedelta(days=5))
    assert kimlik.belge_uyarilari(p, BUGUN) == []


def test_turk_vatandasinda_pasaport_izlenir():
    p = SahtePersonel(uyruk="TR", pasaport_gecerlilik=BUGUN + timedelta(days=15))
    u = kimlik.belge_uyarilari(p, BUGUN)
    assert len(u) == 1 and u[0]["belge"] == "Pasaport"


def test_birden_fazla_belge_ayri_ayri_uyarir():
    p = SahtePersonel(uyruk="TJ",
                      calisma_izni_bitis=BUGUN + timedelta(days=5),
                      ikamet_izni_bitis=BUGUN + timedelta(days=20),
                      pasaport_gecerlilik=BUGUN - timedelta(days=1))
    u = kimlik.belge_uyarilari(p, BUGUN)
    assert {x["belge"] for x in u} == {"Çalışma izni", "İkamet izni", "Pasaport"}


def test_bos_tarih_uyarmaz():
    assert kimlik.belge_uyarilari(SahtePersonel(uyruk="UZ"), BUGUN) == []


# ─── Uç nokta ────────────────────────────────────────────────────────

@pytest.fixture()
def belgeli_ekip(db_session):
    bugun = date.today()
    kisiler = [
        models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com", uyruk="UZ",
                        yabanci_kimlik_no="99123456780",
                        calisma_izni_bitis=bugun + timedelta(days=10)),
        models.Personel(ad="Nurlan", soyad="Bekov", email="nurlan@sirket.com", uyruk="KG",
                        yabanci_kimlik_no="99123456781",
                        calisma_izni_bitis=bugun - timedelta(days=3)),   # süresi geçmiş
        models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com", uyruk="TR",
                        tc_kimlik="10000000146"),
        models.Personel(ad="Rustam", soyad="Nazarov", email="rustam@sirket.com", uyruk="TJ",
                        yabanci_kimlik_no="99123456782",
                        calisma_izni_bitis=bugun + timedelta(days=200)),  # uzak
    ]
    db_session.add_all(kisiler)
    db_session.commit()
    return kisiler


def test_uc_nokta_yalnizca_yoneticiye_acik(client, token, kullanici_olustur, belgeli_ekip):
    kullanici_olustur("ayse", models.Rol.personel)
    kullanici_olustur("mudur", models.Rol.yonetici)
    assert client.get("/personel/belge-uyarilari", headers=token("ayse")).status_code == 403
    assert client.get("/personel/belge-uyarilari", headers=token("mudur")).status_code == 200


def test_uyari_listesi_ve_siralama(client, token, kullanici_olustur, belgeli_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/personel/belge-uyarilari", headers=token("mudur")).json()

    assert d["toplam"] == 2          # Aziz (10 gün) ve Nurlan (geçmiş)
    assert d["gecmis"] == 1
    # Süresi geçmiş olan en başta
    assert d["veriler"][0]["ad_soyad"] == "Nurlan Bekov"
    assert d["veriler"][0]["durum"] == "gecti"
    assert d["veriler"][1]["ad_soyad"] == "Aziz Karimov"
    assert d["veriler"][1]["uyruk_ad"] == "Özbekistan"


def test_uyari_penceresi_ayarlanabilir(client, token, kullanici_olustur, belgeli_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/personel/belge-uyarilari?gun=365", headers=token("mudur")).json()
    assert d["toplam"] == 3          # uzak tarihli Rustam da girer


def test_pasif_personel_uyarilara_girmez(client, token, kullanici_olustur, db_session, belgeli_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    belgeli_ekip[1].durum = models.PersonelDurum.pasif    # süresi geçmiş olan
    db_session.commit()
    d = client.get("/personel/belge-uyarilari", headers=token("mudur")).json()
    assert d["toplam"] == 1 and d["gecmis"] == 0


def test_personel_kaydinda_uyarilar_dondurulur(client, token, kullanici_olustur, belgeli_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    pid = belgeli_ekip[1].id
    d = client.get(f"/personel/{pid}", headers=token("mudur")).json()
    assert d["belge_uyarilari"][0]["durum"] == "gecti"


def test_izin_alanlari_kaydedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com",
        "uyruk": "UZ", "yabanci_kimlik_no": "99123456780",
        "calisma_izni_no": "CI-2026-1234", "calisma_izni_bitis": "2027-03-01",
        "ikamet_izni_no": "IK-2026-5678", "ikamet_izni_bitis": "2027-06-01",
    })
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["calisma_izni_no"] == "CI-2026-1234"
    assert d["calisma_izni_bitis"] == "2027-03-01"
    assert d["ikamet_izni_bitis"] == "2027-06-01"


def test_izin_numaralari_hassas_alan(client, token, kullanici_olustur, db_session):
    """Personel rolü başkasının izin belgesi numaralarını görmemeli."""
    db_session.add(models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com",
                                   uyruk="UZ", calisma_izni_no="CI-2026-1234"))
    db_session.commit()
    kullanici_olustur("ayse", models.Rol.personel)
    d = client.get("/personel", headers=token("ayse")).json()
    kayit = next(v for v in d["veriler"] if v["email"] == "aziz@sirket.com")
    assert kayit["calisma_izni_no"] is None
