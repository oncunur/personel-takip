from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
import yedek
from routers.auth import admin_yetkisi

router = APIRouter(prefix="/yedek", tags=["Yedekleme"])


@router.get("")
def yedek_listesi(_: models.Kullanici = Depends(admin_yetkisi)):
    """Alınmış yedekleri yeniden eskiye listeler."""
    return {
        "saklanacak": yedek.SAKLANACAK_YEDEK,
        "veriler": yedek.yedekleri_listele(),
    }


@router.post("", status_code=201)
def yedek_olustur(_: models.Kullanici = Depends(admin_yetkisi)):
    """Yeni yedek alır ve bütünlüğünü doğrular.

    Doğrulama önemli: bozuk bir yedek, yedek olmamasından daha kötüdür
    çünkü sağlam olduğu sanılır.
    """
    yol = yedek.yedek_al()
    dogrulama = yedek.dogrula(yol)
    if not dogrulama["saglam"]:
        yol.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Yedek doğrulanamadı, alınan dosya silindi")

    silinen = yedek.eskileri_temizle()
    return {
        "ad": yol.name,
        "boyut": yol.stat().st_size,
        "kayit_sayilari": {t: s for t, s in dogrulama["tablolar"].items() if s},
        "silinen_eski_yedek": silinen,
    }


@router.get("/indir/{ad}")
def yedek_indir(ad: str, _: models.Kullanici = Depends(admin_yetkisi)):
    """Bir yedeği indirir."""
    # Dizin dışına çıkmayı engelle: yalnızca dosya adı kabul edilir
    guvenli_ad = Path(ad).name
    if not guvenli_ad.startswith("personel-") or not guvenli_ad.endswith(".db"):
        raise HTTPException(status_code=400, detail="Geçersiz yedek adı")

    yol = yedek.YEDEK_DIZINI / guvenli_ad
    if not yol.exists():
        raise HTTPException(status_code=404, detail="Yedek bulunamadı")

    return FileResponse(yol, media_type="application/octet-stream", filename=guvenli_ad)
