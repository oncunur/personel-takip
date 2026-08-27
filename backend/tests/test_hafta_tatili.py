"""Hafta tatili (HT) testleri.

Şirket cumartesi çalışıyor; yalnızca pazar hafta tatilidir.
"""
from datetime import date

import models
import pytest
from routers.puantaj import hafta_tatili_mi, calisilan_saat

D = models.PuantajDurum


# ─── Gün tanımı ──────────────────────────────────────────────────────

def test_yalnizca_pazar_hafta_tatili():
    # 2026 Ağustos: 1 cumartesi, 2 pazar
    assert hafta_tatili_mi(date(2026, 8, 1)) is False   # cumartesi çalışılır
    assert hafta_tatili_mi(date(2026, 8, 2)) is True    # pazar HT
    assert hafta_tatili_mi(date(2026, 8, 3)) is False   # pazartesi


def test_agustos_2026_ht_gunleri():
    ht = [g for g in range(1, 32) if hafta_tatili_mi(date(2026, 8, g))]
    assert ht == [2, 9, 16, 23, 30]


def test_ht_saat_uretmez():
    assert calisilan_saat(D.hafta_sonu, None, None) == 0.0
    assert calisilan_saat(D.hafta_sonu, "08:00", "19:00") == 0.0


# ─── Cetvel üzerinden ────────────────────────────────────────────────

@pytest.fixture()
def kisi(db_session):
    p = models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal.ht@sirket.com")
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    return p


def test_pazar_gunleri_kayitsiz_da_olsa_ht_gelir(client, token, kullanici_olustur, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    gunler = d["personeller"][0]["gunler"]

    for pazar in ("2", "9", "16", "23", "30"):
        assert gunler[pazar]["durum"] == "hafta_sonu", f"{pazar}. gün HT değil"
        assert gunler[pazar]["saat"] == 0

    # Cumartesi normal gün: kayıt yoksa durum boş
    assert gunler["1"]["durum"] is None
    assert gunler["8"]["durum"] is None


def test_cumartesi_calisma_gunu_olarak_isaretli(client, token, kullanici_olustur, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    bayrak = {g["gun"]: g["hafta_sonu"] for g in d["gunler"]}
    assert bayrak[1] is False and bayrak[8] is False     # cumartesiler
    assert bayrak[2] is True and bayrak[9] is True       # pazarlar


def test_pazar_calismasi_kaydedilebilir(client, token, kullanici_olustur, kisi):
    """Pazar günü çalışıldıysa girilen kayıt HT varsayımını ezer."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    client.post("/puantaj", headers=h, json={
        "personel_id": kisi.id, "tarih": "2026-08-09", "durum": "tam",
        "giris_saati": "08:00", "cikis_saati": "19:00"})

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=h).json()
    satir = d["personeller"][0]
    assert satir["gunler"]["9"]["durum"] == "tam"
    assert satir["gunler"]["9"]["saat"] == 10.0
    assert satir["toplam_saat"] == 10.0


def test_pazar_kaydi_silinince_ht_ye_doner(client, token, kullanici_olustur, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    olustur = client.post("/puantaj", headers=h, json={
        "personel_id": kisi.id, "tarih": "2026-08-09", "durum": "tam"})
    client.delete(f"/puantaj/{olustur.json()['id']}", headers=h)

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=h).json()
    assert d["personeller"][0]["gunler"]["9"]["durum"] == "hafta_sonu"


def test_ht_gunleri_calisilan_gun_sayisina_girmez(client, token, kullanici_olustur, kisi, db_session):
    kullanici_olustur("mudur", models.Rol.yonetici)
    db_session.add(models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 3), durum=D.tam))
    db_session.commit()

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    satir = d["personeller"][0]
    assert satir["calisilan"] == 1        # 5 pazar HT sayılmaz
    assert satir["toplam_saat"] == 10.0
