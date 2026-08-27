"""Gider listesi testleri.

Giderler ekranı konut giderlerini otel konaklamalarıyla birlikte gösteriyor;
her satırın hangi konuta ait olduğu kodundan okunabilmeli.
"""
import models
import pytest


@pytest.fixture()
def konut(db_session):
    k = models.Konut(kod="KNT-001", ad="Merkez Lojman A Blok",
                     tur=models.KonutTur.lojman, kapasite=4, il="İstanbul")
    db_session.add(k); db_session.commit(); db_session.refresh(k)
    return k


def test_gider_listesi_konut_kodunu_dondurur(client, token, kullanici_olustur,
                                             konut):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    r = client.post("/konaklama/giderler", headers=h, json={
        "konut_id": konut.id, "tur": "kira", "yil": 2026, "ay": 8,
        "tutar": 28000, "aciklama": "Ağustos kirası",
    })
    assert r.status_code == 201, r.text

    liste = client.get("/konaklama/giderler", headers=h).json()
    assert liste["toplam"] == 1
    kayit = liste["veriler"][0]
    assert kayit["konut_kod"] == "KNT-001"
    assert kayit["konut_ad"] == "Merkez Lojman A Blok"
    assert kayit["aciklama"] == "Ağustos kirası"
    assert liste["odenmemis_tutar"] == 28000


def test_konutsuz_gider_kodu_bos_gecer(client, token, kullanici_olustur):
    """Konut silinmiş bir gider satırı listeyi kırmamalı."""
    kullanici_olustur("mudur2", models.Rol.yonetici)
    h = token("mudur2")
    liste = client.get("/konaklama/giderler", headers=h).json()
    assert liste["veriler"] == []
