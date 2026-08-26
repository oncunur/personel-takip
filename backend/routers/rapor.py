from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici

router = APIRouter(prefix="/rapor", tags=["Raporlar"])


@router.get("/genel")
def genel_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    toplam_personel = db.query(models.Personel).count()
    aktif_personel  = db.query(models.Personel).filter(models.Personel.durum == models.PersonelDurum.aktif).count()
    izinli_personel = db.query(models.Personel).filter(models.Personel.durum == models.PersonelDurum.izinli).count()
    toplam_dep      = db.query(models.Departman).filter(models.Departman.aktif == True).count()

    bugun = date.today()
    bekleyen_izin = db.query(models.IzinTalep).filter(models.IzinTalep.durum == models.IzinDurum.beklemede).count()
    bu_ay_izin    = db.query(models.IzinTalep).filter(
        models.IzinTalep.durum == models.IzinDurum.onaylandi,
        extract('month', models.IzinTalep.baslangic_tarihi) == bugun.month,
        extract('year',  models.IzinTalep.baslangic_tarihi) == bugun.year,
    ).count()

    return {
        "toplam_personel": toplam_personel,
        "aktif_personel": aktif_personel,
        "izinli_personel": izinli_personel,
        "toplam_departman": toplam_dep,
        "bekleyen_izin": bekleyen_izin,
        "bu_ay_izin": bu_ay_izin,
    }


@router.get("/departman-dagilim")
def departman_dagilim(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    sonuc = db.query(
        models.Departman.ad,
        func.count(models.Personel.id).label("sayi")
    ).outerjoin(models.Personel, (models.Personel.departman_id == models.Departman.id) &
                (models.Personel.durum == models.PersonelDurum.aktif)
    ).filter(models.Departman.aktif == True).group_by(models.Departman.id).all()
    return [{"departman": r.ad, "sayi": r.sayi} for r in sonuc]


@router.get("/izin-tur-dagilim")
def izin_tur_dagilim(yil: Optional[int] = Query(None), db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    hedef_yil = yil or date.today().year
    sonuc = db.query(
        models.IzinTalep.tur,
        func.count(models.IzinTalep.id).label("sayi"),
        func.sum(models.IzinTalep.gun_sayisi).label("toplam_gun")
    ).filter(
        extract('year', models.IzinTalep.baslangic_tarihi) == hedef_yil,
        models.IzinTalep.durum == models.IzinDurum.onaylandi
    ).group_by(models.IzinTalep.tur).all()
    return [{"tur": r.tur, "sayi": r.sayi, "toplam_gun": int(r.toplam_gun or 0)} for r in sonuc]


@router.get("/aylik-izin-trend")
def aylik_izin_trend(yil: Optional[int] = Query(None), db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    hedef_yil = yil or date.today().year
    sonuc = db.query(
        extract('month', models.IzinTalep.baslangic_tarihi).label("ay"),
        func.count(models.IzinTalep.id).label("talep_sayisi"),
        func.sum(models.IzinTalep.gun_sayisi).label("toplam_gun")
    ).filter(
        extract('year', models.IzinTalep.baslangic_tarihi) == hedef_yil,
        models.IzinTalep.durum != models.IzinDurum.iptal
    ).group_by("ay").order_by("ay").all()

    aylar = {int(r.ay): {"talep": r.talep_sayisi, "gun": int(r.toplam_gun or 0)} for r in sonuc}
    return [{"ay": i, "talep_sayisi": aylar.get(i, {}).get("talep", 0), "toplam_gun": aylar.get(i, {}).get("gun", 0)} for i in range(1, 13)]


@router.get("/personel-durum")
def personel_durum(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    sonuc = db.query(models.Personel.durum, func.count(models.Personel.id)).group_by(models.Personel.durum).all()
    return [{"durum": r[0], "sayi": r[1]} for r in sonuc]
