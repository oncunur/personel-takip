"""Yarım gün ücrete yarım gün olarak girer.

Yarım günü tam saymak, çalışılmayan yarım gün için ücret ödenmesine yol
açıyordu; puantaj cetveli ile bordro da birbirini tutmuyordu.
"""
from decimal import Decimal

import models
import pytest
from routers.bordro import bordro_hesapla
from routers.puantaj import gun_esdegeri


# ─── Gün eşdeğeri ────────────────────────────────────────────────────

def test_tam_gun_bir_yarim_gun_yarim_sayilir():
    assert gun_esdegeri(["tam", "tam", "yarim"]) == 2.5


def test_devamsiz_ve_izinli_calisilan_gune_girmez():
    assert gun_esdegeri(["tam", "devamsiz", "izinli", "hafta_sonu"]) == 1.0


def test_enum_ve_metin_ayni_sonucu_verir():
    D = models.PuantajDurum
    assert gun_esdegeri([D.tam, D.yarim]) == gun_esdegeri(["tam", "yarim"]) == 1.5


def test_bos_ay_sifir():
    assert gun_esdegeri([]) == 0.0


def test_yalniz_yarim_gunler_toplanir():
    assert gun_esdegeri(["yarim"] * 5) == 2.5


# ─── Ücrete yansıması ────────────────────────────────────────────────

def test_yarim_gun_ucreti_yarim_dusurur():
    """26 günün 25'i tam, 1'i yarım → 25,5 gün."""
    tam = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                         Decimal("0"), 26, 26)
    yarimli = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                             Decimal("0"), 25.5, 26)
    gunluk = 65000 / 26
    assert tam["brut_maas"] - yarimli["brut_maas"] == pytest.approx(gunluk / 2, abs=0.01)


def test_kesirli_gun_brutu_dogru_hesaplar():
    h = bordro_hesapla(Decimal("52000"), Decimal("0"), Decimal("0"),
                       Decimal("0"), 23.5, 26)
    assert h["brut_maas"] == pytest.approx(52000 * 23.5 / 26, abs=0.01)


# ─── Uçtan uca ───────────────────────────────────────────────────────

def test_puantaj_ozeti_bordroya_yarim_gun_aktarir(client, token, kullanici_olustur,
                                                  db_session):
    from datetime import date

    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    p = models.Personel(ad="Yarim", soyad="Gunlu", email="yarim@sirket.com",
                        maas=Decimal("52000"))
    db_session.add(p); db_session.commit(); db_session.refresh(p)

    # 2 tam + 1 yarım gün işle
    for gun, durum in [(3, "tam"), (4, "tam"), (5, "yarim")]:
        r = client.post("/puantaj", headers=h, json={
            "personel_id": p.id, "tarih": str(date(2026, 8, gun)), "durum": durum,
        })
        assert r.status_code in (200, 201), r.text

    ozet = client.get(f"/bordro/puantaj-ozeti?personel_id={p.id}&yil=2026&ay=8", headers=h).json()
    assert ozet["calisilan_gun"] == 2.5

    r = client.post("/bordro", headers=h, json={
        "personel_id": p.id, "yil": 2026, "ay": 8,
        "baz_maas": 52000, "calisilan_gun": ozet["calisilan_gun"],
    })
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["calisilan_gun"] == 2.5
    assert b["brut_maas"] == pytest.approx(52000 * 2.5 / 26, abs=0.01)
