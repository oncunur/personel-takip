"""Veritabanı yedekleme.

Tüm veri tek bir SQLite dosyasında tutuluyor. Dosya bozulur veya
silinirse geri dönüş yok; bu yüzden yedek alınabilir olmalı.

SQLite'ın kendi backup API'si kullanılır: dosyayı kopyalamaktan farklı
olarak, yazma işlemi sürerken bile tutarlı bir kopya üretir.
"""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List

VERITABANI = Path(__file__).parent / "personel.db"
YEDEK_DIZINI = Path(__file__).parent / "yedekler"
SAKLANACAK_YEDEK = 30      # bundan eskiler silinir


def yedek_al(hedef_dizin: Path = None) -> Path:
    """Tutarlı bir yedek oluşturur ve dosya yolunu döner."""
    hedef_dizin = Path(hedef_dizin or YEDEK_DIZINI)
    hedef_dizin.mkdir(parents=True, exist_ok=True)

    damga = datetime.now().strftime("%Y%m%d-%H%M%S")
    hedef = hedef_dizin / f"personel-{damga}.db"

    # SQLite backup API: kilitlenmeden, tutarlı kopya üretir
    kaynak = sqlite3.connect(VERITABANI)
    kopya = sqlite3.connect(hedef)
    try:
        with kopya:
            kaynak.backup(kopya)
    finally:
        kopya.close()
        kaynak.close()

    return hedef


def yedekleri_listele(hedef_dizin: Path = None) -> List[dict]:
    """Mevcut yedekleri yeniden eskiye doğru listeler."""
    hedef_dizin = Path(hedef_dizin or YEDEK_DIZINI)
    if not hedef_dizin.exists():
        return []

    kayitlar = []
    for dosya in hedef_dizin.glob("personel-*.db"):
        bilgi = dosya.stat()
        kayitlar.append({
            "ad": dosya.name,
            "boyut": bilgi.st_size,
            "tarih": datetime.fromtimestamp(bilgi.st_mtime).isoformat(timespec="seconds"),
        })
    return sorted(kayitlar, key=lambda x: x["tarih"], reverse=True)


def eskileri_temizle(hedef_dizin: Path = None, saklanacak: int = SAKLANACAK_YEDEK) -> List[str]:
    """En yeni N yedeği bırakır, kalanları siler."""
    hedef_dizin = Path(hedef_dizin or YEDEK_DIZINI)
    yedekler = yedekleri_listele(hedef_dizin)
    silinen = []
    for y in yedekler[saklanacak:]:
        (hedef_dizin / y["ad"]).unlink(missing_ok=True)
        silinen.append(y["ad"])
    return silinen


def dogrula(yedek_yolu: Path) -> dict:
    """Yedeğin okunabilir olduğunu ve tablo sayılarını doğrular."""
    baglanti = sqlite3.connect(yedek_yolu)
    try:
        bozuk = baglanti.execute("PRAGMA integrity_check").fetchone()[0]
        tablolar = [r[0] for r in baglanti.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        sayimlar = {t: baglanti.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tablolar}
    finally:
        baglanti.close()
    return {"saglam": bozuk == "ok", "tablolar": sayimlar}
