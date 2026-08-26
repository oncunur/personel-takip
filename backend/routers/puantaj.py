from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
import calendar, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici
from pydantic import BaseModel

router = APIRouter(prefix="/puantaj", tags=["Puantaj"])


class PuantajKayit(BaseModel):
    personel_id: int
    tarih: date
    giris_saati: Optional[str] = None
    cikis_saati: Optional[str] = None
    durum: models.PuantajDurum = models.PuantajDurum.tam
    fazla_mesai: Optional[Decimal] = None
    notlar: Optional[str] = None


class PuantajGuncelle(BaseModel):
    giris_saati: Optional[str] = None
    cikis_saati: Optional[str] = None
    durum: Optional[models.PuantajDurum] = None
    fazla_mesai: Optional[Decimal] = None
    notlar: Optional[str] = None


def kayit_dict(k: models.Puantaj) -> dict:
    return {
        "id": k.id,
        "personel_id": k.personel_id,
        "personel_ad": f"{k.personel.ad} {k.personel.soyad}" if k.personel else None,
        "tarih": str(k.tarih),
        "giris_saati": k.giris_saati,
        "cikis_saati": k.cikis_saati,
        "durum": k.durum,
        "fazla_mesai": float(k.fazla_mesai) if k.fazla_mesai else 0,
        "notlar": k.notlar,
    }


@router.get("/aylik")
def aylik_puantaj(
    personel_id: int = Query(...),
    yil: int = Query(...),
    ay: int = Query(...),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    baslangic = date(yil, ay, 1)
    bitis = date(yil, ay, calendar.monthrange(yil, ay)[1])

    kayitlar = db.query(models.Puantaj).filter(
        models.Puantaj.personel_id == personel_id,
        models.Puantaj.tarih >= baslangic,
        models.Puantaj.tarih <= bitis,
    ).all()

    kayit_map = {str(k.tarih): kayit_dict(k) for k in kayitlar}

    # Her gün için durum üret
    gunler = []
    gun = baslangic
    while gun <= bitis:
        tarih_str = str(gun)
        hafta_sonu = gun.weekday() >= 5
        if tarih_str in kayit_map:
            gunler.append(kayit_map[tarih_str])
        else:
            gunler.append({
                "id": None,
                "personel_id": personel_id,
                "tarih": tarih_str,
                "giris_saati": None,
                "cikis_saati": None,
                "durum": "hafta_sonu" if hafta_sonu else None,
                "fazla_mesai": 0,
                "notlar": None,
            })
        gun += timedelta(days=1)

    calisilan = sum(1 for g in gunler if g["durum"] in ["tam", "yarim"])
    devamsiz  = sum(1 for g in gunler if g["durum"] == "devamsiz")
    izinli    = sum(1 for g in gunler if g["durum"] == "izinli")
    toplam_fazla = sum(g["fazla_mesai"] or 0 for g in gunler)

    return {
        "personel_id": personel_id, "yil": yil, "ay": ay,
        "calisilan_gun": calisilan, "devamsiz_gun": devamsiz,
        "izinli_gun": izinli, "toplam_fazla_mesai": toplam_fazla,
        "gunler": gunler,
    }


@router.post("", status_code=201)
def puantaj_kaydet(
    veri: PuantajKayit,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    mevcut = db.query(models.Puantaj).filter(
        models.Puantaj.personel_id == veri.personel_id,
        models.Puantaj.tarih == veri.tarih,
    ).first()
    if mevcut:
        for alan, deger in veri.model_dump(exclude_none=True).items():
            setattr(mevcut, alan, deger)
        db.commit(); db.refresh(mevcut)
        return kayit_dict(mevcut)
    k = models.Puantaj(**veri.model_dump())
    db.add(k); db.commit(); db.refresh(k)
    return kayit_dict(k)


@router.put("/{kid}")
def puantaj_guncelle(
    kid: int, veri: PuantajGuncelle,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    k = db.query(models.Puantaj).filter(models.Puantaj.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(k, alan, deger)
    db.commit(); db.refresh(k)
    return kayit_dict(k)
