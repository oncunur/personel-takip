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

router = APIRouter(prefix="/demirbas", tags=["Demirbas"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class DemirbasOlustur(BaseModel):
    kod: Optional[str] = None
    ad: str
    kategori: Optional[str] = None
    marka: Optional[str] = None
    model: Optional[str] = None
    seri_no: Optional[str] = None
    alis_tarihi: Optional[date] = None
    alis_bedeli: Decimal = Decimal(0)
    garanti_bitis: Optional[date] = None
    lokasyon: Optional[str] = None
    notlar: Optional[str] = None


class DemirbasGuncelle(BaseModel):
    kod: Optional[str] = None
    ad: Optional[str] = None
    kategori: Optional[str] = None
    marka: Optional[str] = None
    model: Optional[str] = None
    seri_no: Optional[str] = None
    alis_tarihi: Optional[date] = None
    alis_bedeli: Optional[Decimal] = None
    garanti_bitis: Optional[date] = None
    durum: Optional[models.DemirbasDurum] = None
    lokasyon: Optional[str] = None
    notlar: Optional[str] = None


class ZimmetOlustur(BaseModel):
    demirbas_id: int
    personel_id: int
    veris_tarihi: date
    notlar: Optional[str] = None


class IadeIstegi(BaseModel):
    iade_tarihi: Optional[date] = None
    durum: models.DemirbasDurum = models.DemirbasDurum.depoda
    notlar: Optional[str] = None


# ---------- Yardımcı ----------
def _aktif_zimmet(db: Session, demirbas_id: int):
    return db.query(models.Zimmet).filter(
        models.Zimmet.demirbas_id == demirbas_id,
        models.Zimmet.aktif == True,
    ).first()


def demirbas_bilgi(db: Session, d: models.Demirbas) -> dict:
    z = _aktif_zimmet(db, d.id)
    p = z.personel if z else None
    return {
        "id": d.id,
        "kod": d.kod,
        "ad": d.ad,
        "kategori": d.kategori,
        "marka": d.marka,
        "model": d.model,
        "seri_no": d.seri_no,
        "alis_tarihi": str(d.alis_tarihi) if d.alis_tarihi else None,
        "alis_bedeli": float(d.alis_bedeli or 0),
        "garanti_bitis": str(d.garanti_bitis) if d.garanti_bitis else None,
        "garanti_aktif": bool(d.garanti_bitis and d.garanti_bitis >= date.today()),
        "durum": d.durum.value if d.durum else None,
        "lokasyon": d.lokasyon,
        "notlar": d.notlar,
        "zimmet_id": z.id if z else None,
        "zimmetli_personel_id": p.id if p else None,
        "zimmetli_personel": f"{p.ad} {p.soyad}" if p else None,
        "zimmet_tarihi": str(z.veris_tarihi) if z else None,
    }


def zimmet_bilgi(z: models.Zimmet) -> dict:
    p = z.personel
    d = z.demirbas
    return {
        "id": z.id,
        "demirbas_id": z.demirbas_id,
        "demirbas_kod": d.kod if d else None,
        "demirbas_ad": d.ad if d else None,
        "kategori": d.kategori if d else None,
        "personel_id": z.personel_id,
        "personel_ad": f"{p.ad} {p.soyad}" if p else None,
        "departman": p.departman.ad if p and p.departman else None,
        "veris_tarihi": str(z.veris_tarihi),
        "iade_tarihi": str(z.iade_tarihi) if z.iade_tarihi else None,
        "gun_sayisi": ((z.iade_tarihi or date.today()) - z.veris_tarihi).days,
        "aktif": z.aktif,
        "notlar": z.notlar,
    }


def _sonraki_kod(db: Session) -> str:
    son = db.query(models.Demirbas).order_by(models.Demirbas.id.desc()).first()
    return f"DMB-{(son.id + 1 if son else 1):04d}"


# ---------- Demirbaş Endpoints ----------
@router.get("")
def demirbas_listesi(
    arama: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    durum: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Demirbas)
    if arama:
        q = q.filter(or_(
            models.Demirbas.ad.ilike(f"%{arama}%"),
            models.Demirbas.kod.ilike(f"%{arama}%"),
            models.Demirbas.marka.ilike(f"%{arama}%"),
            models.Demirbas.model.ilike(f"%{arama}%"),
            models.Demirbas.seri_no.ilike(f"%{arama}%"),
        ))
    if kategori:
        q = q.filter(models.Demirbas.kategori == kategori)
    if durum:
        q = q.filter(models.Demirbas.durum == durum)
    liste = q.order_by(models.Demirbas.kod).all()
    return {"toplam": len(liste), "veriler": [demirbas_bilgi(db, d) for d in liste]}


@router.get("/kategoriler")
def kategori_listesi(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    rows = db.query(models.Demirbas.kategori).filter(models.Demirbas.kategori.isnot(None)).distinct().all()
    return [r[0] for r in rows if r[0]]


@router.get("/ozet")
def demirbas_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    liste = db.query(models.Demirbas).all()
    sayim = {}
    for d in liste:
        k = d.durum.value if d.durum else "bilinmiyor"
        sayim[k] = sayim.get(k, 0) + 1
    return {
        "toplam": len(liste),
        "zimmetli": sayim.get("zimmetli", 0),
        "depoda": sayim.get("depoda", 0),
        "bakimda": sayim.get("bakimda", 0),
        "hurda": sayim.get("hurda", 0),
        "kayip": sayim.get("kayip", 0),
        "toplam_deger": round(sum(float(d.alis_bedeli or 0) for d in liste), 2),
        "durum_dagilim": sayim,
    }


@router.post("", status_code=201)
def demirbas_ekle(veri: DemirbasOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    data = veri.model_dump()
    if not data.get("kod"):
        data["kod"] = _sonraki_kod(db)
    if db.query(models.Demirbas).filter(models.Demirbas.kod == data["kod"]).first():
        raise HTTPException(status_code=400, detail="Bu demirbaş kodu zaten kayıtlı")
    d = models.Demirbas(**data)
    db.add(d); db.commit(); db.refresh(d)
    return demirbas_bilgi(db, d)


@router.get("/{did}")
def demirbas_getir(did: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    d = db.query(models.Demirbas).filter(models.Demirbas.id == did).first()
    if not d:
        raise HTTPException(status_code=404, detail="Demirbaş bulunamadı")
    bilgi = demirbas_bilgi(db, d)
    bilgi["gecmis"] = [
        zimmet_bilgi(z) for z in
        db.query(models.Zimmet).filter(models.Zimmet.demirbas_id == did)
        .order_by(models.Zimmet.veris_tarihi.desc()).all()
    ]
    return bilgi


@router.put("/{did}")
def demirbas_guncelle(did: int, veri: DemirbasGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    d = db.query(models.Demirbas).filter(models.Demirbas.id == did).first()
    if not d:
        raise HTTPException(status_code=404, detail="Demirbaş bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(d, alan, deger)
    db.commit(); db.refresh(d)
    return demirbas_bilgi(db, d)


@router.delete("/{did}", status_code=204)
def demirbas_sil(did: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    d = db.query(models.Demirbas).filter(models.Demirbas.id == did).first()
    if not d:
        raise HTTPException(status_code=404, detail="Demirbaş bulunamadı")
    if _aktif_zimmet(db, did):
        raise HTTPException(status_code=400, detail="Demirbaş zimmetli, önce iade alınmalı")
    d.durum = models.DemirbasDurum.hurda
    db.commit()


# ---------- Zimmet Endpoints ----------
@router.get("/zimmet/liste")
def zimmet_listesi(
    personel_id: Optional[int] = Query(None),
    sadece_aktif: bool = Query(True),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Zimmet)
    if personel_id:
        q = q.filter(models.Zimmet.personel_id == personel_id)
    if sadece_aktif:
        q = q.filter(models.Zimmet.aktif == True)
    liste = q.order_by(models.Zimmet.veris_tarihi.desc()).all()
    return {"toplam": len(liste), "veriler": [zimmet_bilgi(z) for z in liste]}


@router.post("/zimmet", status_code=201)
def zimmet_ver(veri: ZimmetOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    d = db.query(models.Demirbas).filter(models.Demirbas.id == veri.demirbas_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Demirbaş bulunamadı")
    if not db.query(models.Personel).filter(models.Personel.id == veri.personel_id).first():
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    if _aktif_zimmet(db, veri.demirbas_id):
        raise HTTPException(status_code=400, detail="Bu demirbaş zaten zimmetli")
    if d.durum in (models.DemirbasDurum.hurda, models.DemirbasDurum.kayip):
        raise HTTPException(status_code=400, detail="Hurda/kayıp demirbaş zimmetlenemez")

    z = models.Zimmet(**veri.model_dump(), teslim_eden_id=kullanici.id)
    d.durum = models.DemirbasDurum.zimmetli
    db.add(z); db.commit(); db.refresh(z)
    return zimmet_bilgi(z)


@router.post("/zimmet/{zid}/iade")
def zimmet_iade(zid: int, veri: IadeIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    z = db.query(models.Zimmet).filter(models.Zimmet.id == zid).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zimmet kaydı bulunamadı")
    if not z.aktif:
        raise HTTPException(status_code=400, detail="Bu zimmet zaten iade edilmiş")
    z.iade_tarihi = veri.iade_tarihi or date.today()
    z.aktif = False
    if veri.notlar:
        z.notlar = (z.notlar or "") + f"\nİade: {veri.notlar}"
    z.demirbas.durum = veri.durum
    db.commit(); db.refresh(z)
    return zimmet_bilgi(z)


@router.get("/zimmet/personel/{pid}")
def personel_zimmetleri(pid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    aktifler = db.query(models.Zimmet).filter(
        models.Zimmet.personel_id == pid,
        models.Zimmet.aktif == True,
    ).all()
    return {
        "personel_id": pid,
        "personel_ad": f"{p.ad} {p.soyad}",
        "departman": p.departman.ad if p.departman else None,
        "pozisyon": p.pozisyon,
        "toplam_deger": round(sum(float(z.demirbas.alis_bedeli or 0) for z in aktifler), 2),
        "zimmetler": [zimmet_bilgi(z) for z in aktifler],
    }
