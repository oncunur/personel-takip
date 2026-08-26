"""Çalışılan saat hesabı testleri.

Şirket düzeni: 08:00–19:00, 1 saat ara dinlenmesi, günlük 10 saat.
Fazla mesai ücreti maaşa dahil olduğu için ayrıca hesaplanmaz.
"""
from datetime import date

import models
import pytest
from routers.puantaj import GUNLUK_MESAI, YARIM_GUN, calisilan_saat


D = models.PuantajDurum


# ─── Saf hesap ───────────────────────────────────────────────────────

@pytest.mark.parametrize("durum,giris,cikis,beklenen", [
    # Saat girilmiş günler: fark alınır, ara dinlenmesi düşülür
    (D.tam,   "08:00", "19:00", 10.0),   # şirketin standart günü
    (D.tam,   "08:30", "19:00",  9.5),   # yarım saat geç giriş
    (D.tam,   "08:00", "21:00", 12.0),   # geç çıkış
    (D.tam,   "08:00", "13:00",  5.0),   # yarım günü aşmıyor, mola düşülmez
    (D.yarim, "08:00", "13:00",  5.0),
    # Saat girilmemiş günler: duruma göre standart süre
    (D.tam,   None, None, GUNLUK_MESAI),
    (D.yarim, None, None, YARIM_GUN),
    # Çalışılmayan günler
    (D.devamsiz,    "08:00", "19:00", 0.0),   # saat girilse de sayılmaz
    (D.izinli,      None, None, 0.0),
    (D.resmi_tatil, None, None, 0.0),
    (D.hafta_sonu,  None, None, 0.0),
    (None,          None, None, 0.0),
])
def test_calisilan_saat(durum, giris, cikis, beklenen):
    assert calisilan_saat(durum, giris, cikis) == beklenen


@pytest.mark.parametrize("giris,cikis", [
    ("bozuk", "19:00"), ("08:00", ""), ("", ""), ("19:00", "08:00"), ("08:00", "08:00"),
])
def test_bozuk_saat_standarda_duser(giris, cikis):
    """Geçersiz veya ters saatlerde standart süreye düşülür, hata verilmez."""
    assert calisilan_saat(D.tam, giris, cikis) == GUNLUK_MESAI


# ─── Cetvel üzerinden ────────────────────────────────────────────────

@pytest.fixture()
def kisi(db_session):
    p = models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal.y@sirket.com")
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    return p


def test_cetvel_hucre_ve_toplam_saat(client, token, kullanici_olustur, db_session, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    db_session.add_all([
        # 3 Ağustos: saatli tam gün → 10
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 3), durum=D.tam,
                       giris_saati="08:00", cikis_saati="19:00"),
        # 4 Ağustos: saatsiz tam gün → 10
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 4), durum=D.tam),
        # 5 Ağustos: yarım gün → 5
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 5), durum=D.yarim),
        # 6 Ağustos: devamsız → 0
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 6), durum=D.devamsiz),
        # 7 Ağustos: geç çıkış → 12
        models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 7), durum=D.tam,
                       giris_saati="08:00", cikis_saati="21:00"),
    ])
    db_session.commit()

    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    satir = d["personeller"][0]

    assert satir["gunler"]["3"]["saat"] == 10.0
    assert satir["gunler"]["4"]["saat"] == 10.0
    assert satir["gunler"]["5"]["saat"] == 5.0
    assert satir["gunler"]["6"]["saat"] == 0.0
    assert satir["gunler"]["7"]["saat"] == 12.0
    assert satir["gunler"]["20"]["saat"] == 0.0        # kayıt yok
    assert satir["toplam_saat"] == 37.0                # 10+10+5+0+12


def test_cetvel_mesai_duzenini_bildirir(client, token, kullanici_olustur, kisi):
    """Arayüz varsayılan saatleri buradan okur."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    assert d["mesai"] == {
        "baslangic": "08:00", "bitis": "19:00",
        "gunluk_saat": 10.0, "mola_saat": 1.0,
    }


def test_hucre_saat_alanlari_dondurulur(client, token, kullanici_olustur, db_session, kisi):
    kullanici_olustur("mudur", models.Rol.yonetici)
    db_session.add(models.Puantaj(personel_id=kisi.id, tarih=date(2026, 8, 3), durum=D.tam,
                                  giris_saati="08:30", cikis_saati="18:30"))
    db_session.commit()
    d = client.get("/puantaj/cetvel?yil=2026&ay=8", headers=token("mudur")).json()
    h = d["personeller"][0]["gunler"]["3"]
    assert h["giris_saati"] == "08:30" and h["cikis_saati"] == "18:30"
    assert h["saat"] == 9.0     # 10 saat aralık − 1 saat mola
