"""Veritabanı yedekleme testleri."""
import sqlite3
from pathlib import Path

import models
import pytest
import yedek


@pytest.fixture()
def gecici_dizin(tmp_path):
    return tmp_path / "yedekler"


# ─── Yedek alma ──────────────────────────────────────────────────────

def test_yedek_olusturulur_ve_saglamdir(gecici_dizin):
    yol = yedek.yedek_al(gecici_dizin)
    assert yol.exists() and yol.stat().st_size > 0
    assert yedek.dogrula(yol)["saglam"] is True


def test_yedek_verinin_kopyasini_icerir(gecici_dizin):
    """Yedek, kaynaktaki tabloları ve kayıt sayılarını taşımalı."""
    yol = yedek.yedek_al(gecici_dizin)
    d = yedek.dogrula(yol)

    kaynak = sqlite3.connect(yedek.VERITABANI)
    try:
        beklenen = kaynak.execute("SELECT COUNT(*) FROM personeller").fetchone()[0]
    finally:
        kaynak.close()
    assert d["tablolar"]["personeller"] == beklenen


def test_yedekler_yeniden_eskiye_listelenir(gecici_dizin):
    import time
    ilk = yedek.yedek_al(gecici_dizin)
    time.sleep(1.05)                      # dosya adı saniye çözünürlüğünde
    ikinci = yedek.yedek_al(gecici_dizin)

    liste = yedek.yedekleri_listele(gecici_dizin)
    assert [x["ad"] for x in liste] == [ikinci.name, ilk.name]


def test_eski_yedekler_temizlenir(gecici_dizin):
    import time
    for _ in range(3):
        yedek.yedek_al(gecici_dizin)
        time.sleep(1.05)

    silinen = yedek.eskileri_temizle(gecici_dizin, saklanacak=2)
    assert len(silinen) == 1
    assert len(yedek.yedekleri_listele(gecici_dizin)) == 2


def test_bos_dizin_bos_liste_doner(tmp_path):
    assert yedek.yedekleri_listele(tmp_path / "yok") == []


# ─── Uç noktalar ─────────────────────────────────────────────────────

def test_yedek_uclari_yalnizca_admine_acik(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    kullanici_olustur("patron", models.Rol.admin)
    assert client.get("/yedek", headers=token("mudur")).status_code == 403
    assert client.get("/yedek", headers=token("patron")).status_code == 200


def test_yedek_olusturma_ucu(client, token, kullanici_olustur, monkeypatch, gecici_dizin):
    kullanici_olustur("patron", models.Rol.admin)
    monkeypatch.setattr(yedek, "YEDEK_DIZINI", gecici_dizin)

    r = client.post("/yedek", headers=token("patron"))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["ad"].startswith("personel-") and d["ad"].endswith(".db")
    assert d["boyut"] > 0
    assert "personeller" in d["kayit_sayilari"]


def test_indirmede_dizin_disina_cikilamaz(client, token, kullanici_olustur):
    """Yol gezinme denemesi reddedilmeli."""
    kullanici_olustur("patron", models.Rol.admin)
    h = token("patron")
    for kotu in ("../personel.db", "../../etc/passwd", "personel.db", "baska.db"):
        r = client.get(f"/yedek/indir/{kotu}", headers=h)
        assert r.status_code in (400, 404), kotu


def test_olmayan_yedek_404(client, token, kullanici_olustur):
    kullanici_olustur("patron", models.Rol.admin)
    r = client.get("/yedek/indir/personel-20200101-000000.db", headers=token("patron"))
    assert r.status_code == 404
