from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici

router = APIRouter(prefix="/satinalma", tags=["SatinAlma"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class KalemGiris(BaseModel):
    urun_ad: str
    miktar: Decimal = Decimal(1)
    birim: str = "adet"
    birim_fiyat: Decimal = Decimal(0)


class TalepOlustur(BaseModel):
    talep_eden_id: int
    departman_id: Optional[int] = None
    tarih: Optional[date] = None
    ihtiyac_tarihi: Optional[date] = None
    aciklama: Optional[str] = None
    oncelik: models.TalepOncelik = models.TalepOncelik.normal
    kalemler: List[KalemGiris] = []


class OnayIstegi(BaseModel):
    onay_notu: Optional[str] = None


class SiparisIstegi(BaseModel):
    tedarikci: Optional[str] = None
    siparis_tarihi: Optional[date] = None


class TeslimIstegi(BaseModel):
    teslim_tarihi: Optional[date] = None


# ---------- Yardımcı ----------
def talep_bilgi(t: models.SatinAlmaTalep) -> dict:
    p = t.talep_eden
    kalemler = [{
        "id": k.id,
        "urun_ad": k.urun_ad,
        "miktar": float(k.miktar or 0),
        "birim": k.birim,
        "birim_fiyat": float(k.birim_fiyat or 0),
        "tutar": round(float(k.miktar or 0) * float(k.birim_fiyat or 0), 2),
    } for k in t.kalemler]
    return {
        "id": t.id,
        "talep_no": t.talep_no,
        "talep_eden_id": t.talep_eden_id,
        "talep_eden": f"{p.ad} {p.soyad}" if p else None,
        "departman_id": t.departman_id,
        "departman": t.departman.ad if t.departman else None,
        "tarih": str(t.tarih),
        "ihtiyac_tarihi": str(t.ihtiyac_tarihi) if t.ihtiyac_tarihi else None,
        "aciklama": t.aciklama,
        "oncelik": t.oncelik.value if t.oncelik else None,
        "tahmini_tutar": float(t.tahmini_tutar or 0),
        "durum": t.durum.value if t.durum else None,
        "onaylayan": f"{t.onaylayan.ad} {t.onaylayan.soyad}" if t.onaylayan else None,
        "onay_tarihi": t.onay_tarihi.isoformat() if t.onay_tarihi else None,
        "onay_notu": t.onay_notu,
        "tedarikci": t.tedarikci,
        "siparis_tarihi": str(t.siparis_tarihi) if t.siparis_tarihi else None,
        "teslim_tarihi": str(t.teslim_tarihi) if t.teslim_tarihi else None,
        "kalem_sayisi": len(kalemler),
        "kalemler": kalemler,
    }


def _sonraki_no(db: Session, yil: int) -> str:
    sayi = db.query(models.SatinAlmaTalep).filter(
        models.SatinAlmaTalep.talep_no.like(f"SAT-{yil}-%")
    ).count()
    return f"SAT-{yil}-{sayi + 1:03d}"


# ---------- Endpoints ----------
@router.get("")
def talep_listesi(
    arama: Optional[str] = Query(None),
    durum: Optional[str] = Query(None),
    oncelik: Optional[str] = Query(None),
    departman_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.SatinAlmaTalep)
    if arama:
        q = q.filter(or_(
            models.SatinAlmaTalep.talep_no.ilike(f"%{arama}%"),
            models.SatinAlmaTalep.aciklama.ilike(f"%{arama}%"),
            models.SatinAlmaTalep.tedarikci.ilike(f"%{arama}%"),
        ))
    if durum:
        q = q.filter(models.SatinAlmaTalep.durum == durum)
    if oncelik:
        q = q.filter(models.SatinAlmaTalep.oncelik == oncelik)
    if departman_id:
        q = q.filter(models.SatinAlmaTalep.departman_id == departman_id)
    liste = q.order_by(models.SatinAlmaTalep.tarih.desc(), models.SatinAlmaTalep.id.desc()).all()
    return {
        "toplam": len(liste),
        "bekleyen": sum(1 for t in liste if t.durum == models.TalepDurum.beklemede),
        "toplam_tutar": round(sum(float(t.tahmini_tutar or 0) for t in liste), 2),
        "veriler": [talep_bilgi(t) for t in liste],
    }


@router.get("/ozet")
def satinalma_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    bugun = date.today()
    yil_basi = date(bugun.year, 1, 1)
    liste = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.tarih >= yil_basi).all()
    dagilim = {}
    for t in liste:
        d = t.durum.value if t.durum else "bilinmiyor"
        dagilim[d] = dagilim.get(d, 0) + 1
    onaylanan = [t for t in liste if t.durum in (
        models.TalepDurum.onaylandi, models.TalepDurum.siparis_verildi, models.TalepDurum.teslim_alindi)]
    return {
        "yillik_talep": len(liste),
        "beklemede": dagilim.get("beklemede", 0),
        "onaylandi": dagilim.get("onaylandi", 0),
        "siparis_verildi": dagilim.get("siparis_verildi", 0),
        "teslim_alindi": dagilim.get("teslim_alindi", 0),
        "reddedildi": dagilim.get("reddedildi", 0),
        "onaylanan_tutar": round(sum(float(t.tahmini_tutar or 0) for t in onaylanan), 2),
        "durum_dagilim": dagilim,
    }


@router.post("", status_code=201)
def talep_olustur(veri: TalepOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if not db.query(models.Personel).filter(models.Personel.id == veri.talep_eden_id).first():
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    tarih = veri.tarih or date.today()
    toplam = sum(float(k.miktar or 0) * float(k.birim_fiyat or 0) for k in veri.kalemler)
    t = models.SatinAlmaTalep(
        talep_no=_sonraki_no(db, tarih.year),
        talep_eden_id=veri.talep_eden_id,
        departman_id=veri.departman_id,
        tarih=tarih,
        ihtiyac_tarihi=veri.ihtiyac_tarihi,
        aciklama=veri.aciklama,
        oncelik=veri.oncelik,
        tahmini_tutar=Decimal(str(round(toplam, 2))),
    )
    db.add(t); db.flush()
    for k in veri.kalemler:
        db.add(models.SatinAlmaKalem(talep_id=t.id, **k.model_dump()))
    db.commit(); db.refresh(t)
    return talep_bilgi(t)


@router.get("/{tid}")
def talep_getir(tid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    return talep_bilgi(t)


@router.post("/{tid}/onayla")
def talep_onayla(tid: int, veri: OnayIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if t.durum != models.TalepDurum.beklemede:
        raise HTTPException(status_code=400, detail="Sadece bekleyen talepler onaylanabilir")
    t.durum = models.TalepDurum.onaylandi
    t.onaylayan_id = kullanici.id
    t.onay_tarihi = datetime.utcnow()
    t.onay_notu = veri.onay_notu
    db.commit(); db.refresh(t)
    return talep_bilgi(t)


@router.post("/{tid}/reddet")
def talep_reddet(tid: int, veri: OnayIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if t.durum != models.TalepDurum.beklemede:
        raise HTTPException(status_code=400, detail="Sadece bekleyen talepler reddedilebilir")
    t.durum = models.TalepDurum.reddedildi
    t.onaylayan_id = kullanici.id
    t.onay_tarihi = datetime.utcnow()
    t.onay_notu = veri.onay_notu
    db.commit(); db.refresh(t)
    return talep_bilgi(t)


@router.post("/{tid}/siparis")
def talep_siparis(tid: int, veri: SiparisIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if t.durum != models.TalepDurum.onaylandi:
        raise HTTPException(status_code=400, detail="Önce talep onaylanmalı")
    t.durum = models.TalepDurum.siparis_verildi
    t.tedarikci = veri.tedarikci
    t.siparis_tarihi = veri.siparis_tarihi or date.today()
    db.commit(); db.refresh(t)
    return talep_bilgi(t)


@router.post("/{tid}/teslim")
def talep_teslim(tid: int, veri: TeslimIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if t.durum != models.TalepDurum.siparis_verildi:
        raise HTTPException(status_code=400, detail="Önce sipariş verilmeli")
    t.durum = models.TalepDurum.teslim_alindi
    t.teslim_tarihi = veri.teslim_tarihi or date.today()
    db.commit(); db.refresh(t)
    return talep_bilgi(t)


@router.delete("/{tid}", status_code=204)
def talep_sil(tid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    t = db.query(models.SatinAlmaTalep).filter(models.SatinAlmaTalep.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    t.durum = models.TalepDurum.iptal
    db.commit()
