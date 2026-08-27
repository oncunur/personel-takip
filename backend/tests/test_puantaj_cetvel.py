"""Aylık puantaj cetveli (personel × gün matrisi) testleri."""
from datetime import date

import models
import pytest


@pytest.fixture()
def ekip(db_session):
    dep = models.Departman(ad="Yazılım")
    db_session.add(dep)
    db_session.commit()
    db_session.refresh(dep)

    kisiler = []
    for ad, soyad, eposta in [("Ayse", "Kaya", "ayse.k@sirket.com"),
                              ("Mehmet", "Demir", "mehmet.d@sirket.com")]:
        p = models.Personel(ad=ad, soyad=soyad, email=eposta, departman_id=dep.id)
        db_session.add(p)
        kisiler.append(p)
    db_session.commit()
    for p in kisiler:
        db_session.refresh(p)

    # Ayşe: 3 Ağustos tam, 4 Ağustos devamsız
    db_session.add(models.Puantaj(personel_id=kisiler[0].id, tarih=date(2026, 8, 3),
                                  durum=models.PuantajDurum.tam))
    db_session.add(models.Puantaj(personel_id=kisiler[0].id, tarih=date(2026, 8, 4),
                                  durum=models.PuantajDurum.devamsiz))
    # Mehmet: 3 Ağustos izinli, fazla mesai 2 saat 5 Ağustos
    db_session.add(models.Puantaj(personel_id=kisiler[1].id, tarih=date(2026, 8, 3),
                                  durum=models.PuantajDurum.izinli))
    db_session.add(models.Puantaj(personel_id=kisiler[1].id, tarih=date(2026, 8, 5),
                                  durum=models.PuantajDurum.tam, fazla_mesai=2))
    db_session.commit()
    return kisiler


def test_cetvel_sadece_yoneticiye_acik(client, token, kullanici_olustur, ekip):
    kullanici_olustur("ayse", models.Rol.personel)
    kullanici_olustur("mudur", models.Rol.yonetici)
    assert client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("ayse")).status_code == 403
    assert client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).status_code == 200


def test_cetvel_tum_personeli_dondurur(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    assert d["gun_sayisi"] == 31
    assert len(d["gunler"]) == 31
    assert [p["ad_soyad"] for p in d["personeller"]] == ["Ayse Kaya", "Mehmet Demir"]


def test_hucre_durumlari_ve_toplamlar(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    ayse = next(p for p in d["personeller"] if p["ad_soyad"] == "Ayse Kaya")
    mehmet = next(p for p in d["personeller"] if p["ad_soyad"] == "Mehmet Demir")

    assert ayse["gunler"]["3"]["durum"] == "tam"
    assert ayse["gunler"]["4"]["durum"] == "devamsiz"
    assert ayse["gunler"]["10"]["durum"] is None      # kayıt yok
    assert ayse["calisilan"] == 1 and ayse["devamsiz"] == 1 and ayse["izinli"] == 0

    assert mehmet["izinli"] == 1
    assert mehmet["fazla_mesai"] == 2.0


def test_hafta_tatili_isaretlenir(client, token, kullanici_olustur, ekip):
    """Cumartesi çalışma günüdür; yalnızca pazar hafta tatilidir.

    1 Ağustos 2026 cumartesi, 2 Ağustos pazar, 3 Ağustos pazartesi.
    """
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    gun = {g["gun"]: g["hafta_sonu"] for g in d["gunler"]}
    assert gun[1] is False      # cumartesi çalışılır
    assert gun[2] is True       # pazar HT
    assert gun[3] is False


def test_departmana_gore_suzulur(client, token, kullanici_olustur, db_session, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    baska = models.Departman(ad="Muhasebe")
    db_session.add(baska); db_session.commit(); db_session.refresh(baska)
    db_session.add(models.Personel(ad="Ali", soyad="Vural", email="ali.v@sirket.com",
                                   departman_id=baska.id))
    db_session.commit()

    hepsi = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    assert len(hepsi["personeller"]) == 3

    suzulmus = client.get(f"/puantaj/cetvel?yil=2026&ay=8&departman_id={baska.id}",
                          headers=token("mudur")).json()
    assert [p["ad_soyad"] for p in suzulmus["personeller"]] == ["Ali Vural"]


def test_pasif_personel_cetvelde_yok(client, token, kullanici_olustur, db_session, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    ekip[0].durum = models.PersonelDurum.pasif
    db_session.commit()
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    assert [p["ad_soyad"] for p in d["personeller"]] == ["Mehmet Demir"]


def test_hucre_kaydi_upsert_calisir(client, token, kullanici_olustur, ekip):
    """Aynı gün için ikinci kayıt yeni satır açmamalı, mevcudu güncellemeli."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    pid = ekip[0].personel_id if hasattr(ekip[0], "personel_id") else ekip[0].id

    r1 = client.post("/puantaj", headers=h, json={
        "personel_id": pid, "tarih": "2026-08-10", "durum": "tam"})
    assert r1.status_code == 201
    r2 = client.post("/puantaj", headers=h, json={
        "personel_id": pid, "tarih": "2026-08-10", "durum": "izinli"})
    assert r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=h).json()
    ayse = next(p for p in d["personeller"] if p["personel_id"] == pid)
    assert ayse["gunler"]["10"]["durum"] == "izinli"


def test_gecersiz_ay_reddedilir(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    assert client.get("/puantaj/cetvel?yil=2026&ay=13", headers=token("mudur")).status_code == 422


# ─── Kayıt silme (hücrenin boş duruma dönmesi) ───────────────────────

def test_kayit_silinince_hucre_bosalir(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    pid = ekip[0].id

    olustur = client.post("/puantaj", headers=h, json={
        "personel_id": pid, "tarih": "2026-08-12", "durum": "tam"})
    kid = olustur.json()["id"]

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=h).json()
    satir = next(p for p in d["personeller"] if p["personel_id"] == pid)
    assert satir["gunler"]["12"]["durum"] == "tam"

    assert client.delete(f"/puantaj/{kid}", headers=h).status_code == 204

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=h).json()
    satir = next(p for p in d["personeller"] if p["personel_id"] == pid)
    assert satir["gunler"]["12"]["durum"] is None
    assert satir["gunler"]["12"]["id"] is None


def test_personel_kayit_silemez(client, token, kullanici_olustur, ekip, db_session):
    kullanici_olustur("ayse", models.Rol.personel)
    kayit = db_session.query(models.Puantaj).first()
    assert client.delete(f"/puantaj/{kayit.id}", headers=token("ayse")).status_code == 403


def test_olmayan_kayit_silme_404(client, token, kullanici_olustur, ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    assert client.delete("/puantaj/99999", headers=token("mudur")).status_code == 404
