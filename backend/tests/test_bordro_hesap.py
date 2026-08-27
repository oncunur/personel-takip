"""Bordro hesabı, firmanın çalışma düzenine bağlı.

Pazar hariç haftanın 6 günü, günde 10 saat çalışılıyor; fazla mesai maaşa
dahil olduğu için ayrı bir ücret kalemi doğurmuyor. Önceki hesap 22 gün /
176 saat / 1,5× varsayıyordu ve puantaj modülüyle çelişiyordu.
"""
from decimal import Decimal

import pytest
from routers.bordro import ay_is_gunu, bordro_hesapla


# ─── Ayın iş günü ────────────────────────────────────────────────────

def test_agustos_2026_yirmi_alti_is_gunu():
    """31 günlük ay, 5 Pazar → 26 iş günü."""
    assert ay_is_gunu(2026, 8) == 26


def test_subat_2026_yirmi_dort_is_gunu():
    assert ay_is_gunu(2026, 2) == 24


def test_her_ay_cumartesiyi_is_gunu_sayar():
    """Cumartesi çalışma günü; yalnızca Pazar tatil."""
    import calendar
    from datetime import date
    for ay in range(1, 13):
        son = calendar.monthrange(2026, ay)[1]
        pazar = sum(1 for g in range(1, son + 1) if date(2026, ay, g).weekday() == 6)
        assert ay_is_gunu(2026, ay) == son - pazar


# ─── Ücret ───────────────────────────────────────────────────────────

def test_tam_ay_calisan_tam_maas_alir():
    h = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                       Decimal("0"), 26, 26)
    assert h["brut_maas"] == 65000.0


def test_eksik_gun_orantili_dusulur():
    """26 günün 13'ü → yarım maaş."""
    h = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                       Decimal("0"), 13, 26)
    assert h["brut_maas"] == 32500.0


def test_fazla_mesai_brute_eklenmez():
    """Fazla mesai maaşa dahil; saat girilse de ücret doğurmaz."""
    sifir = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                           Decimal("0"), 26, 26)
    kirk_saat = bordro_hesapla(Decimal("65000"), Decimal("40"), Decimal("0"),
                               Decimal("0"), 26, 26)
    assert kirk_saat["fazla_mesai_ucr"] == 0.0
    assert kirk_saat["brut_maas"] == sifir["brut_maas"]


def test_fazladan_calisilan_gun_maasi_sismez():
    """Puantajda 28 gün işlenmişse bile brüt baz maaşı aşmaz."""
    h = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                       Decimal("0"), 28, 26)
    assert h["brut_maas"] == 65000.0


def test_prim_ve_eklemeler_brute_girer():
    h = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("5000"),
                       Decimal("1000"), 26, 26)
    assert h["brut_maas"] == 71000.0


def test_kesintiler_brutten_hesaplanir():
    h = bordro_hesapla(Decimal("65000"), Decimal("0"), Decimal("0"),
                       Decimal("0"), 26, 26)
    assert h["sgk_isci"] == pytest.approx(65000 * 0.14, abs=0.01)
    assert h["issizlik_isci"] == pytest.approx(65000 * 0.01, abs=0.01)
    assert h["net_maas"] < h["brut_maas"]
