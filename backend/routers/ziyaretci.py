from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici

router = APIRouter(prefix="/ziyaretci", tags=["Ziyaretci"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


def _saat_dk(s: str) -> int:
    try:
        sa, dk = s.split(":")
        return int(sa) * 60 + int(dk)
    except Exception:
        raise HTTPException(status_code=400, detail="Saat formatı hatalı (SS:DD bekleniyor)")


# ---------- Schemas ----------
class ZiyaretciOlustur(BaseModel):
    ad_soyad: str
    firma: Optional[str] = None
    telefon: Optional[str] = None
    ziyaret_edilen_id: Optional[int] = None
    amac: Optional[str] = None
    kart_no: Optional[str] = None
    notlar: Optional[str] = None


class OdaOlustur(BaseModel):
    ad: str
    konum: Optional[str] = None
    kapasite: int = 0
    ekipman: Optional[str] = None


class RezervasyonOlustur(BaseModel):
    oda_id: int
    baslik: str
    tarih: date
    baslangic_saat: str
    bitis_saat: str
    olusturan_id: Optional[int] = None
    katilimci_sayisi: int = 0
    notlar: Optional[str] = None


# ---------- Yardımcı ----------
def ziyaretci_bilgi(z: models.Ziyaretci) -> dict:
    p = z.ziyaret_edilen
    return {
        "id": z.id,
        "ad_soyad": z.ad_soyad,
        "firma": z.firma,
        "telefon": z.telefon,
        "ziyaret_edilen_id": z.ziyaret_edilen_id,
        "ziyaret_edilen": f"{p.ad} {p.soyad}" if p else None,
        "amac": z.amac,
        "giris_zamani": z.giris_zamani.isoformat() if z.giris_zamani else None,
        "cikis_zamani": z.cikis_zamani.isoformat() if z.cikis_zamani else None,
        "icerde": z.cikis_zamani is None,
        "kart_no": z.kart_no,
        "notlar": z.notlar,
    }


def rezervasyon_bilgi(r: models.OdaRezervasyon) -> dict:
    p = r.olusturan
    return {
        "id": r.id,
        "oda_id": r.oda_id,
        "oda_ad": r.oda.ad if r.oda else None,
        "baslik": r.baslik,
        "tarih": str(r.tarih),
        "baslangic_saat": r.baslangic_saat,
        "bitis_saat": r.bitis_saat,
        "olusturan_id": r.olusturan_id,
        "olusturan": f"{p.ad} {p.soyad}" if p else None,
        "katilimci_sayisi": r.katilimci_sayisi,
        "iptal": r.iptal,
        "notlar": r.notlar,
    }


# ---------- Ziyaretçi Endpoints ----------
@router.get("")
def ziyaretci_listesi(
    arama: Optional[str] = Query(None),
    tarih: Optional[date] = Query(None),
    sadece_icerde: bool = Query(False),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Ziyaretci)
    if arama:
        q = q.filter(or_(
            models.Ziyaretci.ad_soyad.ilike(f"%{arama}%"),
            models.Ziyaretci.firma.ilike(f"%{arama}%"),
        ))
    if sadece_icerde:
        q = q.filter(models.Ziyaretci.cikis_zamani.is_(None))
    liste = q.order_by(models.Ziyaretci.giris_zamani.desc()).limit(300).all()
    if tarih:
        liste = [z for z in liste if z.giris_zamani and z.giris_zamani.date() == tarih]
    return {
        "toplam": len(liste),
        "icerde": sum(1 for z in liste if z.cikis_zamani is None),
        "veriler": [ziyaretci_bilgi(z) for z in liste],
    }


@router.post("", status_code=201)
def ziyaretci_giris(veri: ZiyaretciOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    z = models.Ziyaretci(**veri.model_dump(), giris_zamani=datetime.utcnow())
    db.add(z); db.commit(); db.refresh(z)
    return ziyaretci_bilgi(z)


@router.post("/{zid}/cikis")
def ziyaretci_cikis(zid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    z = db.query(models.Ziyaretci).filter(models.Ziyaretci.id == zid).first()
    if not z:
        raise HTTPException(status_code=404, detail="Ziyaretçi kaydı bulunamadı")
    if z.cikis_zamani:
        raise HTTPException(status_code=400, detail="Çıkış zaten yapılmış")
    z.cikis_zamani = datetime.utcnow()
    db.commit(); db.refresh(z)
    return ziyaretci_bilgi(z)


@router.delete("/{zid}", status_code=204)
def ziyaretci_sil(zid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    z = db.query(models.Ziyaretci).filter(models.Ziyaretci.id == zid).first()
    if not z:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    db.delete(z); db.commit()


# ---------- Toplantı Odası Endpoints ----------
@router.get("/odalar")
def oda_listesi(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    odalar = db.query(models.ToplantiOdasi).filter(models.ToplantiOdasi.aktif == True).order_by(models.ToplantiOdasi.ad).all()
    bugun = date.today()
    sonuc = []
    for o in odalar:
        bugunku = db.query(models.OdaRezervasyon).filter(
            models.OdaRezervasyon.oda_id == o.id,
            models.OdaRezervasyon.tarih == bugun,
            models.OdaRezervasyon.iptal == False,
        ).count()
        sonuc.append({
            "id": o.id, "ad": o.ad, "konum": o.konum, "kapasite": o.kapasite,
            "ekipman": o.ekipman, "aktif": o.aktif, "bugunku_rezervasyon": bugunku,
        })
    return sonuc


@router.post("/odalar", status_code=201)
def oda_ekle(veri: OdaOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    if db.query(models.ToplantiOdasi).filter(models.ToplantiOdasi.ad == veri.ad).first():
        raise HTTPException(status_code=400, detail="Bu isimde bir oda zaten var")
    o = models.ToplantiOdasi(**veri.model_dump())
    db.add(o); db.commit(); db.refresh(o)
    return {"id": o.id, "ad": o.ad, "konum": o.konum, "kapasite": o.kapasite, "ekipman": o.ekipman, "aktif": True, "bugunku_rezervasyon": 0}


@router.delete("/odalar/{oid}", status_code=204)
def oda_sil(oid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    o = db.query(models.ToplantiOdasi).filter(models.ToplantiOdasi.id == oid).first()
    if not o:
        raise HTTPException(status_code=404, detail="Oda bulunamadı")
    o.aktif = False
    db.commit()


# ---------- Rezervasyon Endpoints ----------
@router.get("/rezervasyonlar")
def rezervasyon_listesi(
    tarih: Optional[date] = Query(None),
    oda_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.OdaRezervasyon).filter(models.OdaRezervasyon.iptal == False)
    if tarih:
        q = q.filter(models.OdaRezervasyon.tarih == tarih)
    if oda_id:
        q = q.filter(models.OdaRezervasyon.oda_id == oda_id)
    liste = q.order_by(models.OdaRezervasyon.tarih, models.OdaRezervasyon.baslangic_saat).all()
    return {"toplam": len(liste), "veriler": [rezervasyon_bilgi(r) for r in liste]}


@router.post("/rezervasyonlar", status_code=201)
def rezervasyon_ekle(veri: RezervasyonOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    oda = db.query(models.ToplantiOdasi).filter(models.ToplantiOdasi.id == veri.oda_id).first()
    if not oda:
        raise HTTPException(status_code=404, detail="Oda bulunamadı")

    bas, bit = _saat_dk(veri.baslangic_saat), _saat_dk(veri.bitis_saat)
    if bit <= bas:
        raise HTTPException(status_code=400, detail="Bitiş saati başlangıçtan sonra olmalı")
    if oda.kapasite and veri.katilimci_sayisi > oda.kapasite:
        raise HTTPException(status_code=400, detail=f"Oda kapasitesi {oda.kapasite} kişi")

    mevcutlar = db.query(models.OdaRezervasyon).filter(
        models.OdaRezervasyon.oda_id == veri.oda_id,
        models.OdaRezervasyon.tarih == veri.tarih,
        models.OdaRezervasyon.iptal == False,
    ).all()
    for m in mevcutlar:
        if bas < _saat_dk(m.bitis_saat) and _saat_dk(m.baslangic_saat) < bit:
            raise HTTPException(
                status_code=400,
                detail=f"Çakışma: '{m.baslik}' ({m.baslangic_saat}-{m.bitis_saat})",
            )

    r = models.OdaRezervasyon(**veri.model_dump())
    db.add(r); db.commit(); db.refresh(r)
    return rezervasyon_bilgi(r)


@router.delete("/rezervasyonlar/{rid}", status_code=204)
def rezervasyon_iptal(rid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    r = db.query(models.OdaRezervasyon).filter(models.OdaRezervasyon.id == rid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Rezervasyon bulunamadı")
    r.iptal = True
    db.commit()
