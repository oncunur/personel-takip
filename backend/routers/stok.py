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

router = APIRouter(prefix="/stok", tags=["Stok"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class UrunOlustur(BaseModel):
    kod: Optional[str] = None
    ad: str
    kategori: Optional[str] = None
    birim: str = "adet"
    mevcut_miktar: Decimal = Decimal(0)
    kritik_seviye: Decimal = Decimal(0)
    birim_fiyat: Decimal = Decimal(0)
    raf: Optional[str] = None


class UrunGuncelle(BaseModel):
    kod: Optional[str] = None
    ad: Optional[str] = None
    kategori: Optional[str] = None
    birim: Optional[str] = None
    kritik_seviye: Optional[Decimal] = None
    birim_fiyat: Optional[Decimal] = None
    raf: Optional[str] = None
    aktif: Optional[bool] = None


class HareketOlustur(BaseModel):
    urun_id: int
    tur: models.StokHareketTur = models.StokHareketTur.giris
    miktar: Decimal
    tarih: Optional[date] = None
    personel_id: Optional[int] = None
    belge_no: Optional[str] = None
    aciklama: Optional[str] = None


# ---------- Yardımcı ----------
def urun_bilgi(u: models.StokUrun) -> dict:
    mevcut = float(u.mevcut_miktar or 0)
    kritik = float(u.kritik_seviye or 0)
    return {
        "id": u.id,
        "kod": u.kod,
        "ad": u.ad,
        "kategori": u.kategori,
        "birim": u.birim,
        "mevcut_miktar": mevcut,
        "kritik_seviye": kritik,
        "kritik_mi": mevcut <= kritik,
        "birim_fiyat": float(u.birim_fiyat or 0),
        "toplam_deger": round(mevcut * float(u.birim_fiyat or 0), 2),
        "raf": u.raf,
        "aktif": u.aktif,
    }


def hareket_bilgi(h: models.StokHareket) -> dict:
    p = h.personel
    return {
        "id": h.id,
        "urun_id": h.urun_id,
        "urun_ad": h.urun.ad if h.urun else None,
        "urun_kod": h.urun.kod if h.urun else None,
        "birim": h.urun.birim if h.urun else None,
        "tur": h.tur.value,
        "miktar": float(h.miktar),
        "tarih": str(h.tarih),
        "personel_id": h.personel_id,
        "personel_ad": f"{p.ad} {p.soyad}" if p else None,
        "belge_no": h.belge_no,
        "aciklama": h.aciklama,
    }


def _sonraki_kod(db: Session) -> str:
    son = db.query(models.StokUrun).order_by(models.StokUrun.id.desc()).first()
    return f"STK-{(son.id + 1 if son else 1):03d}"


# ---------- Ürün Endpoints ----------
@router.get("")
def urun_listesi(
    arama: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    sadece_kritik: bool = Query(False),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.StokUrun).filter(models.StokUrun.aktif == True)
    if arama:
        q = q.filter(or_(
            models.StokUrun.ad.ilike(f"%{arama}%"),
            models.StokUrun.kod.ilike(f"%{arama}%"),
        ))
    if kategori:
        q = q.filter(models.StokUrun.kategori == kategori)
    liste = [urun_bilgi(u) for u in q.order_by(models.StokUrun.ad).all()]
    if sadece_kritik:
        liste = [u for u in liste if u["kritik_mi"]]
    return {
        "toplam": len(liste),
        "kritik_sayisi": sum(1 for u in liste if u["kritik_mi"]),
        "toplam_deger": round(sum(u["toplam_deger"] for u in liste), 2),
        "veriler": liste,
    }


@router.get("/ozet")
def stok_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    urunler = [urun_bilgi(u) for u in db.query(models.StokUrun).filter(models.StokUrun.aktif == True).all()]
    kritikler = [u for u in urunler if u["kritik_mi"]]
    bugun = date.today()
    ay_basi = date(bugun.year, bugun.month, 1)
    hareketler = db.query(models.StokHareket).filter(models.StokHareket.tarih >= ay_basi).all()
    return {
        "urun_sayisi": len(urunler),
        "kritik_sayisi": len(kritikler),
        "toplam_deger": round(sum(u["toplam_deger"] for u in urunler), 2),
        "ay_giris": round(sum(float(h.miktar) for h in hareketler if h.tur == models.StokHareketTur.giris), 2),
        "ay_cikis": round(sum(float(h.miktar) for h in hareketler if h.tur == models.StokHareketTur.cikis), 2),
        "kritik_urunler": sorted(kritikler, key=lambda u: u["mevcut_miktar"])[:10],
    }


@router.get("/kategoriler")
def kategori_listesi(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    rows = db.query(models.StokUrun.kategori).filter(models.StokUrun.kategori.isnot(None)).distinct().all()
    return [r[0] for r in rows if r[0]]


@router.get("/hareketler")
def hareket_listesi(
    urun_id: Optional[int] = Query(None),
    tur: Optional[str] = Query(None),
    personel_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.StokHareket)
    if urun_id:
        q = q.filter(models.StokHareket.urun_id == urun_id)
    if tur:
        q = q.filter(models.StokHareket.tur == tur)
    if personel_id:
        q = q.filter(models.StokHareket.personel_id == personel_id)
    liste = q.order_by(models.StokHareket.tarih.desc(), models.StokHareket.id.desc()).limit(limit).all()
    return {"toplam": len(liste), "veriler": [hareket_bilgi(h) for h in liste]}


@router.post("/hareketler", status_code=201)
def hareket_ekle(veri: HareketOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    u = db.query(models.StokUrun).filter(models.StokUrun.id == veri.urun_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    miktar = Decimal(str(veri.miktar))
    if miktar <= 0:
        raise HTTPException(status_code=400, detail="Miktar sıfırdan büyük olmalı")

    mevcut = Decimal(str(u.mevcut_miktar or 0))
    if veri.tur == models.StokHareketTur.giris:
        u.mevcut_miktar = mevcut + miktar
    elif veri.tur in (models.StokHareketTur.cikis, models.StokHareketTur.fire):
        if miktar > mevcut:
            raise HTTPException(status_code=400, detail=f"Yetersiz stok. Mevcut: {mevcut} {u.birim}")
        u.mevcut_miktar = mevcut - miktar
    else:  # sayim → mevcut miktarı doğrudan set eder
        u.mevcut_miktar = miktar

    h = models.StokHareket(**{**veri.model_dump(), "tarih": veri.tarih or date.today()})
    db.add(h); db.commit(); db.refresh(h)
    return {"hareket": hareket_bilgi(h), "urun": urun_bilgi(u)}


@router.post("", status_code=201)
def urun_ekle(veri: UrunOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    data = veri.model_dump()
    if not data.get("kod"):
        data["kod"] = _sonraki_kod(db)
    if db.query(models.StokUrun).filter(models.StokUrun.kod == data["kod"]).first():
        raise HTTPException(status_code=400, detail="Bu ürün kodu zaten kayıtlı")
    u = models.StokUrun(**data)
    db.add(u); db.commit(); db.refresh(u)
    if float(u.mevcut_miktar or 0) > 0:
        db.add(models.StokHareket(
            urun_id=u.id, tur=models.StokHareketTur.giris,
            miktar=u.mevcut_miktar, tarih=date.today(), aciklama="Açılış stoğu",
        ))
        db.commit()
    return urun_bilgi(u)


@router.get("/{uid}")
def urun_getir(uid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    u = db.query(models.StokUrun).filter(models.StokUrun.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    bilgi = urun_bilgi(u)
    bilgi["hareketler"] = [hareket_bilgi(h) for h in
        db.query(models.StokHareket).filter(models.StokHareket.urun_id == uid)
        .order_by(models.StokHareket.tarih.desc(), models.StokHareket.id.desc()).limit(30).all()]
    return bilgi


@router.put("/{uid}")
def urun_guncelle(uid: int, veri: UrunGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    u = db.query(models.StokUrun).filter(models.StokUrun.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(u, alan, deger)
    db.commit(); db.refresh(u)
    return urun_bilgi(u)


@router.delete("/{uid}", status_code=204)
def urun_sil(uid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    u = db.query(models.StokUrun).filter(models.StokUrun.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    u.aktif = False
    db.commit()
