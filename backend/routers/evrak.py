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

router = APIRouter(prefix="/evrak", tags=["Evrak"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class EvrakOlustur(BaseModel):
    evrak_no: Optional[str] = None
    yon: models.EvrakYon = models.EvrakYon.gelen
    tarih: date
    konu: str
    gonderen: Optional[str] = None
    alici: Optional[str] = None
    kategori: Optional[str] = None
    ilgili_personel_id: Optional[int] = None
    dosya_yolu: Optional[str] = None
    notlar: Optional[str] = None


class EvrakGuncelle(BaseModel):
    evrak_no: Optional[str] = None
    yon: Optional[models.EvrakYon] = None
    tarih: Optional[date] = None
    konu: Optional[str] = None
    gonderen: Optional[str] = None
    alici: Optional[str] = None
    kategori: Optional[str] = None
    ilgili_personel_id: Optional[int] = None
    dosya_yolu: Optional[str] = None
    notlar: Optional[str] = None


class SozlesmeOlustur(BaseModel):
    baslik: str
    karsi_taraf: Optional[str] = None
    tur: models.SozlesmeTur = models.SozlesmeTur.hizmet
    baslangic_tarihi: date
    bitis_tarihi: Optional[date] = None
    bedel: Decimal = Decimal(0)
    para_birimi: str = "TRY"
    uyari_gun: int = 30
    sorumlu_personel_id: Optional[int] = None
    dosya_yolu: Optional[str] = None
    notlar: Optional[str] = None


class SozlesmeGuncelle(BaseModel):
    baslik: Optional[str] = None
    karsi_taraf: Optional[str] = None
    tur: Optional[models.SozlesmeTur] = None
    baslangic_tarihi: Optional[date] = None
    bitis_tarihi: Optional[date] = None
    bedel: Optional[Decimal] = None
    para_birimi: Optional[str] = None
    uyari_gun: Optional[int] = None
    durum: Optional[models.SozlesmeDurum] = None
    sorumlu_personel_id: Optional[int] = None
    dosya_yolu: Optional[str] = None
    notlar: Optional[str] = None


# ---------- Yardımcı ----------
def evrak_bilgi(e: models.Evrak) -> dict:
    p = e.ilgili_personel
    return {
        "id": e.id,
        "evrak_no": e.evrak_no,
        "yon": e.yon.value if e.yon else None,
        "tarih": str(e.tarih),
        "konu": e.konu,
        "gonderen": e.gonderen,
        "alici": e.alici,
        "kategori": e.kategori,
        "ilgili_personel_id": e.ilgili_personel_id,
        "ilgili_personel": f"{p.ad} {p.soyad}" if p else None,
        "dosya_yolu": e.dosya_yolu,
        "notlar": e.notlar,
    }


def sozlesme_bilgi(s: models.Sozlesme) -> dict:
    p = s.sorumlu
    kalan = (s.bitis_tarihi - date.today()).days if s.bitis_tarihi else None
    return {
        "id": s.id,
        "baslik": s.baslik,
        "karsi_taraf": s.karsi_taraf,
        "tur": s.tur.value if s.tur else None,
        "baslangic_tarihi": str(s.baslangic_tarihi),
        "bitis_tarihi": str(s.bitis_tarihi) if s.bitis_tarihi else None,
        "kalan_gun": kalan,
        "uyari": bool(kalan is not None and kalan <= (s.uyari_gun or 30)),
        "bedel": float(s.bedel or 0),
        "para_birimi": s.para_birimi,
        "uyari_gun": s.uyari_gun,
        "durum": s.durum.value if s.durum else None,
        "sorumlu_personel_id": s.sorumlu_personel_id,
        "sorumlu": f"{p.ad} {p.soyad}" if p else None,
        "dosya_yolu": s.dosya_yolu,
        "notlar": s.notlar,
    }


def _sonraki_no(db: Session, yon: models.EvrakYon, yil: int) -> str:
    onek = "GLN" if yon == models.EvrakYon.gelen else "GDN"
    sayi = db.query(models.Evrak).filter(
        models.Evrak.yon == yon,
        models.Evrak.tarih >= date(yil, 1, 1),
        models.Evrak.tarih <= date(yil, 12, 31),
    ).count()
    return f"{onek}-{yil}-{sayi + 1:04d}"


# ---------- Evrak Endpoints ----------
@router.get("")
def evrak_listesi(
    arama: Optional[str] = Query(None),
    yon: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    yil: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Evrak)
    if arama:
        q = q.filter(or_(
            models.Evrak.konu.ilike(f"%{arama}%"),
            models.Evrak.evrak_no.ilike(f"%{arama}%"),
            models.Evrak.gonderen.ilike(f"%{arama}%"),
            models.Evrak.alici.ilike(f"%{arama}%"),
        ))
    if yon:
        q = q.filter(models.Evrak.yon == yon)
    if kategori:
        q = q.filter(models.Evrak.kategori == kategori)
    if yil:
        q = q.filter(models.Evrak.tarih >= date(yil, 1, 1), models.Evrak.tarih <= date(yil, 12, 31))
    liste = q.order_by(models.Evrak.tarih.desc(), models.Evrak.id.desc()).all()
    return {
        "toplam": len(liste),
        "gelen": sum(1 for e in liste if e.yon == models.EvrakYon.gelen),
        "giden": sum(1 for e in liste if e.yon == models.EvrakYon.giden),
        "veriler": [evrak_bilgi(e) for e in liste],
    }


@router.post("", status_code=201)
def evrak_ekle(veri: EvrakOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    data = veri.model_dump()
    if not data.get("evrak_no"):
        data["evrak_no"] = _sonraki_no(db, veri.yon, veri.tarih.year)
    e = models.Evrak(**data)
    db.add(e); db.commit(); db.refresh(e)
    return evrak_bilgi(e)


# ---------- Sözleşme Endpoints (evrak/{eid}'den ÖNCE tanımlı olmalı) ----------
@router.get("/sozlesmeler")
def sozlesme_listesi(
    arama: Optional[str] = Query(None),
    tur: Optional[str] = Query(None),
    durum: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Sozlesme)
    if arama:
        q = q.filter(or_(
            models.Sozlesme.baslik.ilike(f"%{arama}%"),
            models.Sozlesme.karsi_taraf.ilike(f"%{arama}%"),
        ))
    if tur:
        q = q.filter(models.Sozlesme.tur == tur)
    if durum:
        q = q.filter(models.Sozlesme.durum == durum)
    liste = q.order_by(models.Sozlesme.bitis_tarihi.asc().nullslast()).all()
    return {
        "toplam": len(liste),
        "toplam_bedel": round(sum(float(s.bedel or 0) for s in liste), 2),
        "veriler": [sozlesme_bilgi(s) for s in liste],
    }


@router.post("/sozlesmeler", status_code=201)
def sozlesme_ekle(veri: SozlesmeOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    s = models.Sozlesme(**veri.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return sozlesme_bilgi(s)


@router.put("/sozlesmeler/{sid}")
def sozlesme_guncelle(sid: int, veri: SozlesmeGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    s = db.query(models.Sozlesme).filter(models.Sozlesme.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(s, alan, deger)
    db.commit(); db.refresh(s)
    return sozlesme_bilgi(s)


@router.delete("/sozlesmeler/{sid}", status_code=204)
def sozlesme_sil(sid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    s = db.query(models.Sozlesme).filter(models.Sozlesme.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    db.delete(s); db.commit()


@router.get("/ozet")
def evrak_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    bugun = date.today()
    yil_basi = date(bugun.year, 1, 1)
    evraklar = db.query(models.Evrak).filter(models.Evrak.tarih >= yil_basi).all()
    sozlesmeler = db.query(models.Sozlesme).filter(
        models.Sozlesme.durum == models.SozlesmeDurum.aktif
    ).all()

    uyarilar = []
    for s in sozlesmeler:
        if s.bitis_tarihi:
            kalan = (s.bitis_tarihi - bugun).days
            if kalan <= (s.uyari_gun or 30):
                uyarilar.append({
                    "id": s.id, "baslik": s.baslik, "karsi_taraf": s.karsi_taraf,
                    "bitis": str(s.bitis_tarihi), "kalan_gun": kalan,
                })

    return {
        "yillik_evrak": len(evraklar),
        "gelen": sum(1 for e in evraklar if e.yon == models.EvrakYon.gelen),
        "giden": sum(1 for e in evraklar if e.yon == models.EvrakYon.giden),
        "aktif_sozlesme": len(sozlesmeler),
        "sozlesme_bedel_toplam": round(sum(float(s.bedel or 0) for s in sozlesmeler), 2),
        "sozlesme_uyarilari": sorted(uyarilar, key=lambda x: x["kalan_gun"]),
    }


@router.get("/kategoriler")
def kategori_listesi(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    rows = db.query(models.Evrak.kategori).filter(models.Evrak.kategori.isnot(None)).distinct().all()
    return [r[0] for r in rows if r[0]]


@router.get("/{eid}")
def evrak_getir(eid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    e = db.query(models.Evrak).filter(models.Evrak.id == eid).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    return evrak_bilgi(e)


@router.put("/{eid}")
def evrak_guncelle(eid: int, veri: EvrakGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    e = db.query(models.Evrak).filter(models.Evrak.id == eid).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(e, alan, deger)
    db.commit(); db.refresh(e)
    return evrak_bilgi(e)


@router.delete("/{eid}", status_code=204)
def evrak_sil(eid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    e = db.query(models.Evrak).filter(models.Evrak.id == eid).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    db.delete(e); db.commit()
