"""Puantajdan bordroya veri aktarımı testleri."""
from datetime import date

import models
import pytest

D = models.PuantajDurum


@pytest.fixture()
def kisi(db_session):
    p = models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com", maas=60000)
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    return p


@pytest.fixture()
def puantajli_ay(db_session, kisi):
    db_session.add_all([
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 3), durum=D.tam),          # 10
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 4), durum=D.tam,
                       giris_saati="08:00", cikis_saati="21:00"),                          # 12
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 5), durum=D.yarim),        # 5
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 6), durum=D.devamsiz),     # 0
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 7), durum=D.izinli),       # 0
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 10), durum=D.tam,
                       fazla_mesai=2),                                                     # 10
    ])
    db_session.commit()
    return kisi


def test_ozet_yalnizca_yoneticiye_acik(client, token, kullanici_olustur, puantajli_ay):
    kullanici_olustur("ayse", models.Rol.personel)
    kullanici_olustur("mudur", models.Rol.yonetici)
    yol = f"/bordro/puantaj-ozeti?personel_id={puantajli_ay.id}&yil=2026&ay=8"
    assert client.get(yol, headers=token("ayse")).status_code == 403
    assert client.get(yol, headers=token("mudur")).status_code == 200


def test_ozet_degerleri(client, token, kullanici_olustur, puantajli_ay):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get(f"/bordro/puantaj-ozeti?personel_id={puantajli_ay.id}&yil=2026&ay=8",
                   headers=token("mudur")).json()

    assert d["ad_soyad"] == "Kemal Yilmaz"
    assert d["baz_maas"] == 60000.0          # personel kaydından gelir
    assert d["kayit_sayisi"] == 6
    assert d["calisilan_gun"] == 4           # 3 tam + 1 yarım
    assert d["devamsiz_gun"] == 1
    assert d["izinli_gun"] == 1
    assert d["toplam_saat"] == 37.0          # 10 + 12 + 5 + 0 + 0 + 10
    assert d["fazla_mesai"] == 2.0
    assert d["gunluk_mesai"] == 10.0


def test_kayitsiz_ay_sifir_doner(client, token, kullanici_olustur, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get(f"/bordro/puantaj-ozeti?personel_id={kisi.id}&yil=2026&ay=7",
                   headers=token("mudur")).json()
    assert d["kayit_sayisi"] == 0 and d["calisilan_gun"] == 0 and d["toplam_saat"] == 0


def test_olmayan_personel_404(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.get("/bordro/puantaj-ozeti?personel_id=9999&yil=2026&ay=8", headers=token("mudur"))
    assert r.status_code == 404


def test_gecersiz_ay_reddedilir(client, token, kullanici_olustur, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.get(f"/bordro/puantaj-ozeti?personel_id={kisi.id}&yil=2026&ay=13",
                   headers=token("mudur"))
    assert r.status_code == 422


def test_ozet_bordro_olusturmada_kullanilabilir(client, token, kullanici_olustur, puantajli_ay):
    """Özetten alınan değerlerle bordro oluşturulabilmeli."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    ozet = client.get(f"/bordro/puantaj-ozeti?personel_id={puantajli_ay.id}&yil=2026&ay=8",
                      headers=h).json()

    r = client.post("/bordro", headers=h, json={
        "personel_id": ozet["personel_id"], "yil": 2026, "ay": 8,
        "baz_maas": ozet["baz_maas"],
        "calisilan_gun": ozet["calisilan_gun"],
        "fazla_mesai_saat": ozet["fazla_mesai"],
    })
    assert r.status_code == 201, r.text
    assert r.json()["calisilan_gun"] == 4
