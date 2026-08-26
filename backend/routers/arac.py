from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import date
from decimal import Decimal
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici

router = APIRouter(prefix="/arac", tags=["Arac"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class AracOlustur(BaseModel):
    plaka: str
    marka: Optional[str] = None
    model: Optional[str] = None
    yil: Optional[int] = None
    tip: Optional[str] = None
    yakit_tur: models.YakitTur = models.YakitTur.dizel
    km: int = 0
    muayene_tarihi: Optional[date] = None
    sigorta_bitis: Optional[date] = None
    kasko_bitis: Optional[date] = None
    notlar: Optional[str] = None


class AracGuncelle(BaseModel):
    plaka: Optional[str] = None
    marka: Optional[str] = None
    model: Optional[str] = None
    yil: Optional[int] = None
    tip: Optional[str] = None
    yakit_tur: Optional[models.YakitTur] = None
    km: Optional[int] = None
    muayene_tarihi: Optional[date] = None
    sigorta_bitis: Optional[date] = None
    kasko_bitis: Optional[date] = None
    durum: Optional[models.AracDurum] = None
    notlar: Optional[str] = None


class AtamaOlustur(BaseModel):
    arac_id: int
    personel_id: int
    baslangic_tarihi: date
    notlar: Optional[str] = None


class AtamaBitir(BaseModel):
    bitis_tarihi: Optional[date] = None


class GiderOlustur(BaseModel):
    arac_id: int
    tur: models.AracGiderTur = models.AracGiderTur.yakit
    tarih: date
    tutar: Decimal
    km: Optional[int] = None
    litre: Optional[Decimal] = None
    aciklama: Optional[str] = None


# ---------- Yardımcı ----------
def _aktif_atama(db: Session, arac_id: int):
    return db.query(models.AracAtama).filter(
        models.AracAtama.arac_id == arac_id,
        models.AracAtama.aktif == True,
    ).first()


def _kalan(tarih: Optional[date]) -> Optional[int]:
    return (tarih - date.today()).days if tarih else None


def arac_bilgi(db: Session, a: models.Arac) -> dict:
    at = _aktif_atama(db, a.id)
    p = at.personel if at else None
    uyarilar = []
    for etiket, tarih in (("Muayene", a.muayene_tarihi), ("Sigorta", a.sigorta_bitis), ("Kasko", a.kasko_bitis)):
        k = _kalan(tarih)
        if k is not None and k <= 30:
            uyarilar.append({"tip": etiket, "tarih": str(tarih), "kalan_gun": k})
    return {
        "id": a.id,
        "plaka": a.plaka,
        "marka": a.marka,
        "model": a.model,
        "yil": a.yil,
        "tip": a.tip,
        "yakit_tur": a.yakit_tur.value if a.yakit_tur else None,
        "km": a.km or 0,
        "muayene_tarihi": str(a.muayene_tarihi) if a.muayene_tarihi else None,
        "muayene_kalan": _kalan(a.muayene_tarihi),
        "sigorta_bitis": str(a.sigorta_bitis) if a.sigorta_bitis else None,
        "sigorta_kalan": _kalan(a.sigorta_bitis),
        "kasko_bitis": str(a.kasko_bitis) if a.kasko_bitis else None,
        "kasko_kalan": _kalan(a.kasko_bitis),
        "durum": a.durum.value if a.durum else None,
        "notlar": a.notlar,
        "atama_id": at.id if at else None,
        "surucu_id": p.id if p else None,
        "surucu": f"{p.ad} {p.soyad}" if p else None,
        "uyarilar": uyarilar,
    }


def gider_bilgi(g: models.AracGider) -> dict:
    return {
        "id": g.id,
        "arac_id": g.arac_id,
        "plaka": g.arac.plaka if g.arac else None,
        "tur": g.tur.value,
        "tarih": str(g.tarih),
        "tutar": float(g.tutar),
        "km": g.km,
        "litre": float(g.litre) if g.litre else None,
        "aciklama": g.aciklama,
    }


# ---------- Araç Endpoints ----------
@router.get("")
def arac_listesi(
    arama: Optional[str] = Query(None),
    durum: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Arac)
    if arama:
        q = q.filter(or_(
            models.Arac.plaka.ilike(f"%{arama}%"),
            models.Arac.marka.ilike(f"%{arama}%"),
            models.Arac.model.ilike(f"%{arama}%"),
        ))
    if durum:
        q = q.filter(models.Arac.durum == durum)
    liste = q.order_by(models.Arac.plaka).all()
    return {"toplam": len(liste), "veriler": [arac_bilgi(db, a) for a in liste]}


@router.get("/ozet")
def arac_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    araclar = db.query(models.Arac).filter(models.Arac.durum != models.AracDurum.satildi).all()
    atanan = db.query(models.AracAtama).filter(models.AracAtama.aktif == True).count()

    bugun = date.today()
    uyarilar = []
    for a in araclar:
        for etiket, tarih in (("Muayene", a.muayene_tarihi), ("Sigorta", a.sigorta_bitis), ("Kasko", a.kasko_bitis)):
            if tarih and (tarih - bugun).days <= 30:
                uyarilar.append({
                    "arac_id": a.id, "plaka": a.plaka, "tip": etiket,
                    "tarih": str(tarih), "kalan_gun": (tarih - bugun).days,
                })

    yil_basi = date(bugun.year, 1, 1)
    giderler = db.query(models.AracGider).filter(models.AracGider.tarih >= yil_basi).all()
    tur_dagilim = {}
    for g in giderler:
        tur_dagilim[g.tur.value] = round(tur_dagilim.get(g.tur.value, 0) + float(g.tutar), 2)

    return {
        "arac_sayisi": len(araclar),
        "atanan": atanan,
        "bosta": len(araclar) - atanan,
        "bakimda": sum(1 for a in araclar if a.durum == models.AracDurum.bakimda),
        "yillik_gider": round(sum(float(g.tutar) for g in giderler), 2),
        "gider_dagilim": tur_dagilim,
        "uyarilar": sorted(uyarilar, key=lambda x: x["kalan_gun"]),
    }


@router.post("", status_code=201)
def arac_ekle(veri: AracOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    plaka = veri.plaka.upper().replace(" ", "")
    if db.query(models.Arac).filter(models.Arac.plaka == plaka).first():
        raise HTTPException(status_code=400, detail="Bu plaka zaten kayıtlı")
    a = models.Arac(**{**veri.model_dump(), "plaka": plaka})
    db.add(a); db.commit(); db.refresh(a)
    return arac_bilgi(db, a)


@router.get("/{aid}")
def arac_getir(aid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    a = db.query(models.Arac).filter(models.Arac.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Araç bulunamadı")
    bilgi = arac_bilgi(db, a)
    bilgi["atama_gecmisi"] = [{
        "id": at.id,
        "personel_id": at.personel_id,
        "personel_ad": f"{at.personel.ad} {at.personel.soyad}" if at.personel else None,
        "baslangic_tarihi": str(at.baslangic_tarihi),
        "bitis_tarihi": str(at.bitis_tarihi) if at.bitis_tarihi else None,
        "aktif": at.aktif,
    } for at in db.query(models.AracAtama).filter(models.AracAtama.arac_id == aid)
        .order_by(models.AracAtama.baslangic_tarihi.desc()).all()]
    bilgi["giderler"] = [gider_bilgi(g) for g in
        db.query(models.AracGider).filter(models.AracGider.arac_id == aid)
        .order_by(models.AracGider.tarih.desc()).limit(30).all()]
    bilgi["toplam_gider"] = round(sum(
        float(g.tutar) for g in db.query(models.AracGider).filter(models.AracGider.arac_id == aid).all()
    ), 2)
    return bilgi


@router.put("/{aid}")
def arac_guncelle(aid: int, veri: AracGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    a = db.query(models.Arac).filter(models.Arac.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Araç bulunamadı")
    data = veri.model_dump(exclude_none=True)
    if "plaka" in data:
        data["plaka"] = data["plaka"].upper().replace(" ", "")
    for alan, deger in data.items():
        setattr(a, alan, deger)
    db.commit(); db.refresh(a)
    return arac_bilgi(db, a)


@router.delete("/{aid}", status_code=204)
def arac_sil(aid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    a = db.query(models.Arac).filter(models.Arac.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Araç bulunamadı")
    a.durum = models.AracDurum.pasif
    db.commit()


# ---------- Atama Endpoints ----------
@router.post("/atama", status_code=201)
def atama_yap(veri: AtamaOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    if not db.query(models.Arac).filter(models.Arac.id == veri.arac_id).first():
        raise HTTPException(status_code=404, detail="Araç bulunamadı")
    if not db.query(models.Personel).filter(models.Personel.id == veri.personel_id).first():
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    if _aktif_atama(db, veri.arac_id):
        raise HTTPException(status_code=400, detail="Araç zaten bir personele atanmış")
    at = models.AracAtama(**veri.model_dump())
    db.add(at); db.commit(); db.refresh(at)
    return {"id": at.id, "arac_id": at.arac_id, "personel_id": at.personel_id, "aktif": True}


@router.post("/atama/{atid}/bitir")
def atama_bitir(atid: int, veri: AtamaBitir, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    at = db.query(models.AracAtama).filter(models.AracAtama.id == atid).first()
    if not at:
        raise HTTPException(status_code=404, detail="Atama bulunamadı")
    at.bitis_tarihi = veri.bitis_tarihi or date.today()
    at.aktif = False
    db.commit()
    return {"id": at.id, "aktif": False, "bitis_tarihi": str(at.bitis_tarihi)}


# ---------- Gider Endpoints ----------
@router.get("/gider/liste")
def gider_listesi(
    arac_id: Optional[int] = Query(None),
    tur: Optional[str] = Query(None),
    yil: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.AracGider)
    if arac_id:
        q = q.filter(models.AracGider.arac_id == arac_id)
    if tur:
        q = q.filter(models.AracGider.tur == tur)
    if yil:
        q = q.filter(models.AracGider.tarih >= date(yil, 1, 1), models.AracGider.tarih <= date(yil, 12, 31))
    liste = q.order_by(models.AracGider.tarih.desc()).all()
    return {
        "toplam": len(liste),
        "toplam_tutar": round(sum(float(g.tutar) for g in liste), 2),
        "veriler": [gider_bilgi(g) for g in liste],
    }


@router.post("/gider", status_code=201)
def gider_ekle(veri: GiderOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    a = db.query(models.Arac).filter(models.Arac.id == veri.arac_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Araç bulunamadı")
    g = models.AracGider(**veri.model_dump())
    if veri.km and veri.km > (a.km or 0):
        a.km = veri.km
    db.add(g); db.commit(); db.refresh(g)
    return gider_bilgi(g)


@router.delete("/gider/{gid}", status_code=204)
def gider_sil(gid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    g = db.query(models.AracGider).filter(models.AracGider.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    db.delete(g); db.commit()
