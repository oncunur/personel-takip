from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
import calendar

import models
from database import get_db
from routers.auth import yonetici_yetkisi

router = APIRouter(prefix="/ozet", tags=["Ozet"])


@router.get("/aylik")
def aylik_ozet(
    yil: int = Query(...),
    ay: int = Query(...),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    son_gun = calendar.monthrange(yil, ay)[1]
    ay_baslangic = date(yil, ay, 1)
    ay_bitis = date(yil, ay, son_gun)

    personeller = (
        db.query(models.Personel)
        .filter(models.Personel.durum == models.PersonelDurum.aktif)
        .order_by(models.Personel.ad, models.Personel.soyad)
        .all()
    )

    # Tek sorguda tüm puantaj kayıtlarını çek
    puantaj_map: dict = {}
    puantajlar = db.query(models.Puantaj).filter(
        models.Puantaj.tarih >= ay_baslangic,
        models.Puantaj.tarih <= ay_bitis,
    ).all()
    for pt in puantajlar:
        pid = pt.personel_id
        if pid not in puantaj_map:
            puantaj_map[pid] = {"calisilan_gun": 0, "devamsiz_gun": 0, "izinli_gun": 0, "fazla_mesai": 0.0}
        if pt.durum in (models.PuantajDurum.tam, models.PuantajDurum.yarim):
            puantaj_map[pid]["calisilan_gun"] += 1
        elif pt.durum == models.PuantajDurum.devamsiz:
            puantaj_map[pid]["devamsiz_gun"] += 1
        elif pt.durum == models.PuantajDurum.izinli:
            puantaj_map[pid]["izinli_gun"] += 1
        puantaj_map[pid]["fazla_mesai"] += float(pt.fazla_mesai or 0)

    # Tek sorguda tüm bordrolar
    bordro_map: dict = {}
    bordrolar = db.query(models.Bordro).filter(
        models.Bordro.yil == yil,
        models.Bordro.ay == ay,
    ).all()
    for b in bordrolar:
        bordro_map[b.personel_id] = b

    result = []
    for p in personeller:
        pt = puantaj_map.get(p.id, {"calisilan_gun": 0, "devamsiz_gun": 0, "izinli_gun": 0, "fazla_mesai": 0.0})
        b = bordro_map.get(p.id)
        result.append({
            "personel_id": p.id,
            "ad": p.ad,
            "soyad": p.soyad,
            "departman": p.departman.ad if p.departman else None,
            "pozisyon": p.pozisyon,
            "baz_maas": float(p.maas or 0),
            "calisilan_gun": pt["calisilan_gun"],
            "devamsiz_gun": pt["devamsiz_gun"],
            "izinli_gun": pt["izinli_gun"],
            "fazla_mesai": round(pt["fazla_mesai"], 2),
            "bordro_id": b.id if b else None,
            "brut_maas": float(b.brut_maas) if b else None,
            "sgk_isci": float(b.sgk_isci) if b else None,
            "issizlik_isci": float(b.issizlik_isci) if b else None,
            "gelir_vergisi": float(b.gelir_vergisi) if b else None,
            "damga_vergisi": float(b.damga_vergisi) if b else None,
            "net_maas": float(b.net_maas) if b else None,
            "bordro_durum": b.durum.value if b else None,
        })

    return {"yil": yil, "ay": ay, "toplam": len(result), "veriler": result}
