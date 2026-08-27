#!/bin/bash
# Günlük yedek alma scripti.
#
# Kurulum (her gün 02:00'de yedek almak için):
#   crontab -e
#   0 2 * * * /Users/oncunur/claoudecode/personel-takip/backend/yedek_al.sh
#
# Yedekler backend/yedekler/ altına yazılır ve en yeni 30 tanesi tutulur.

cd "$(dirname "$0")" || exit 1

python3 - <<'PY'
import sys
import yedek

try:
    yol = yedek.yedek_al()
    dogrulama = yedek.dogrula(yol)
    if not dogrulama["saglam"]:
        yol.unlink(missing_ok=True)
        print("HATA: yedek doğrulanamadı, dosya silindi", file=sys.stderr)
        sys.exit(1)

    silinen = yedek.eskileri_temizle()
    kayit = sum(dogrulama["tablolar"].values())
    print(f"✓ {yol.name} ({yol.stat().st_size // 1024} KB, {kayit} kayıt)")
    if silinen:
        print(f"  {len(silinen)} eski yedek silindi")
except Exception as e:
    print(f"HATA: {e}", file=sys.stderr)
    sys.exit(1)
PY
