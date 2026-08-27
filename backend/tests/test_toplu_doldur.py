"""Puantaj toplu doldurma testleri."""
from datetime import date

import models
import pytest

D = models.PuantajDurum


@pytest.fixture()
def ekip(db_session):
    kisiler = [
        models.Personel(ad="Ayse", soyad="Kaya", email="ayse.k@sirket.com"),
        models.Personel(ad="Mehmet", soyad="Demir", email="mehmet.d@sirket.com"),
    ]
    db_session.add_all(kisiler)
    db_session.commit()
    for k in kisiler:
        db_session.refresh(k)
    return kisiler


def cetvel(client, h, yil=2026, ay=8):
    return client.get(f"/puantaj/cetvel?yil={yil}&ay={ay}", headers=h).json()


def test_yalnizca_yoneticiye_acik(client, token, kullanici_olustur, ekip):
    kullanici_olustur("ayse", models.Rol.personel)
    r = client.post("/puantaj/toplu-doldur", headers=token("ayse"),
                    json={"yil": 2026, "ay": 8})
    assert r.status_code == 403


def test_ay_doldurulur_hafta_tatili_atlanir(client, token, kullanici_olustur, ekip):
    """Ağustos 2026: 31 gün, 5 pazar → kişi başı 26 iş günü."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    r = client.post("/puantaj/toplu-doldur", headers=h, json={"yil": 2026, "ay": 8})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["personel_sayisi"] == 2
    assert d["eklenen"] == 52          # 2 kişi × 26 iş günü
    assert d["atlanan"] == 10          # 2 kişi × 5 pazar

    c = cetvel(client, h)
    satir = c["personeller"][0]
    assert satir["calisilan"] == 26
    assert satir["toplam_saat"] == 260.0     # 26 × 10 saat
    assert satir["gunler"]["2"]["durum"] == "hafta_sonu"   # pazar dolmamış


def test_hafta_tatili_dahil_edilebilir(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    d = client.post("/puantaj/toplu-doldur", headers=h,
                    json={"yil": 2026, "ay": 8, "hafta_tatili_dahil": True}).json()
    assert d["eklenen"] == 62          # 2 × 31
    assert d["atlanan"] == 0


def test_mevcut_kayitlar_korunur(client, token, kullanici_olustur, db_session, ekip):
    """Varsayılan davranış: dolu günlere dokunulmaz."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    db_session.add(models.Puantaj(personel_id=ekip[0].id, tarih=date(2026, 8, 3),
                                  durum=D.devamsiz))
    db_session.commit()

    d = client.post("/puantaj/toplu-doldur", headers=h, json={"yil": 2026, "ay": 8}).json()
    assert d["guncellenen"] == 0
    assert d["atlanan"] == 11          # 10 pazar + 1 mevcut kayıt

    c = cetvel(client, h)
    satir = next(p for p in c["personeller"] if p["personel_id"] == ekip[0].id)
    assert satir["gunler"]["3"]["durum"] == "devamsiz"     # korundu


def test_mevcutlar_uzerine_yazilabilir(client, token, kullanici_olustur, db_session, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    db_session.add(models.Puantaj(personel_id=ekip[0].id, tarih=date(2026, 8, 3),
                                  durum=D.devamsiz))
    db_session.commit()

    d = client.post("/puantaj/toplu-doldur", headers=h,
                    json={"yil": 2026, "ay": 8, "mevcutlari_koru": False}).json()
    assert d["guncellenen"] == 1

    c = cetvel(client, h)
    satir = next(p for p in c["personeller"] if p["personel_id"] == ekip[0].id)
    assert satir["gunler"]["3"]["durum"] == "tam"


def test_secili_personel_ve_gunler(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    d = client.post("/puantaj/toplu-doldur", headers=h, json={
        "yil": 2026, "ay": 8,
        "personel_idler": [ekip[0].id],
        "gunler": [3, 4, 5],
    }).json()
    assert d["personel_sayisi"] == 1 and d["eklenen"] == 3

    c = cetvel(client, h)
    digeri = next(p for p in c["personeller"] if p["personel_id"] == ekip[1].id)
    assert digeri["calisilan"] == 0     # diğer kişiye dokunulmadı


def test_durum_secilebilir(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    client.post("/puantaj/toplu-doldur", headers=h, json={
        "yil": 2026, "ay": 8, "durum": "yarim", "gunler": [3]})
    c = cetvel(client, h)
    assert c["personeller"][0]["gunler"]["3"]["durum"] == "yarim"
    assert c["personeller"][0]["gunler"]["3"]["saat"] == 5.0


def test_gecersiz_gun_reddedilir(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/puantaj/toplu-doldur", headers=token("mudur"),
                    json={"yil": 2026, "ay": 2, "gunler": [30]})   # Şubat 2026: 28 gün
    assert r.status_code == 400
    assert "geçersiz gün" in r.json()["detail"]


def test_pasif_personel_doldurulmaz(client, token, kullanici_olustur, db_session, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    ekip[1].durum = models.PersonelDurum.pasif
    db_session.commit()
    d = client.post("/puantaj/toplu-doldur", headers=token("mudur"),
                    json={"yil": 2026, "ay": 8, "gunler": [3]}).json()
    assert d["personel_sayisi"] == 1
