from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici
from pydantic import BaseModel, EmailStr
from datetime import date
from decimal import Decimal

router = APIRouter(prefix="/personel", tags=["Personel"])


# ---------- Schemas ----------
class DepartmanOlustur(BaseModel):
    ad: str
    aciklama: Optional[str] = None

class DepartmanBilgi(BaseModel):
    id: int
    ad: str
    aciklama: Optional[str]
    aktif: bool
    personel_sayisi: int = 0
    class Config: from_attributes = True

class PersonelOlustur(BaseModel):
    ad: str
    soyad: str
    email: EmailStr
    tc_kimlik: Optional[str] = None
    telefon: Optional[str] = None
    departman_id: Optional[int] = None
    pozisyon: Optional[str] = None
    ise_baslama_tarihi: Optional[date] = None
    dogum_tarihi: Optional[date] = None
    cinsiyet: models.Cinsiyet = models.Cinsiyet.belirtilmemis
    adres: Optional[str] = None
    maas: Optional[Decimal] = None
    notlar: Optional[str] = None

class PersonelGuncelle(BaseModel):
    ad: Optional[str] = None
    soyad: Optional[str] = None
    email: Optional[EmailStr] = None
    tc_kimlik: Optional[str] = None
    telefon: Optional[str] = None
    departman_id: Optional[int] = None
    pozisyon: Optional[str] = None
    ise_baslama_tarihi: Optional[date] = None
    dogum_tarihi: Optional[date] = None
    cinsiyet: Optional[models.Cinsiyet] = None
    adres: Optional[str] = None
    durum: Optional[models.PersonelDurum] = None
    maas: Optional[Decimal] = None
    notlar: Optional[str] = None

class PersonelBilgi(BaseModel):
    id: int
    ad: str
    soyad: str
    email: str
    tc_kimlik: Optional[str]
    telefon: Optional[str]
    departman_id: Optional[int]
    departman_ad: Optional[str] = None
    pozisyon: Optional[str]
    ise_baslama_tarihi: Optional[date]
    dogum_tarihi: Optional[date]
    cinsiyet: models.Cinsiyet
    adres: Optional[str]
    durum: models.PersonelDurum
    maas: Optional[Decimal]
    notlar: Optional[str]
    class Config: from_attributes = True


# ---------- Yardımcı ----------
def personel_bilgi(p: models.Personel) -> dict:
    return {
        "id": p.id,
        "ad": p.ad,
        "soyad": p.soyad,
        "email": p.email,
        "tc_kimlik": p.tc_kimlik,
        "telefon": p.telefon,
        "departman_id": p.departman_id,
        "departman_ad": p.departman.ad if p.departman else None,
        "pozisyon": p.pozisyon,
        "ise_baslama_tarihi": str(p.ise_baslama_tarihi) if p.ise_baslama_tarihi else None,
        "dogum_tarihi": str(p.dogum_tarihi) if p.dogum_tarihi else None,
        "cinsiyet": p.cinsiyet,
        "adres": p.adres,
        "durum": p.durum,
        "maas": float(p.maas) if p.maas else None,
        "notlar": p.notlar,
    }


# ---------- Departman Endpoints ----------
@router.get("/departmanlar", response_model=List[DepartmanBilgi])
def departman_listesi(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    departmanlar = db.query(models.Departman).filter(models.Departman.aktif == True).all()
    sonuc = []
    for d in departmanlar:
        sayim = db.query(models.Personel).filter(
            models.Personel.departman_id == d.id,
            models.Personel.durum == models.PersonelDurum.aktif
        ).count()
        sonuc.append({**d.__dict__, "personel_sayisi": sayim})
    return sonuc


@router.post("/departmanlar", response_model=DepartmanBilgi, status_code=201)
def departman_ekle(veri: DepartmanOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    mevcut = db.query(models.Departman).filter(models.Departman.ad == veri.ad).first()
    if mevcut:
        raise HTTPException(status_code=400, detail="Bu departman zaten mevcut")
    dep = models.Departman(ad=veri.ad, aciklama=veri.aciklama)
    db.add(dep); db.commit(); db.refresh(dep)
    return {**dep.__dict__, "personel_sayisi": 0}


@router.delete("/departmanlar/{dep_id}", status_code=204)
def departman_sil(dep_id: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol != models.Rol.admin:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    dep = db.query(models.Departman).filter(models.Departman.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Departman bulunamadı")
    dep.aktif = False
    db.commit()


# ---------- Personel Endpoints ----------
@router.get("")
def personel_listesi(
    arama: Optional[str] = Query(None),
    departman_id: Optional[int] = Query(None),
    durum: Optional[str] = Query(None),
    sayfa: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Personel)
    if arama:
        q = q.filter(or_(
            models.Personel.ad.ilike(f"%{arama}%"),
            models.Personel.soyad.ilike(f"%{arama}%"),
            models.Personel.email.ilike(f"%{arama}%"),
            models.Personel.pozisyon.ilike(f"%{arama}%"),
        ))
    if departman_id:
        q = q.filter(models.Personel.departman_id == departman_id)
    if durum:
        q = q.filter(models.Personel.durum == durum)
    toplam = q.count()
    personeller = q.offset((sayfa - 1) * limit).limit(limit).all()
    return {"toplam": toplam, "sayfa": sayfa, "limit": limit, "veriler": [personel_bilgi(p) for p in personeller]}


@router.post("", status_code=201)
def personel_ekle(veri: PersonelOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    mevcut = db.query(models.Personel).filter(models.Personel.email == veri.email).first()
    if mevcut:
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
    p = models.Personel(**veri.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return personel_bilgi(p)


@router.get("/{pid}")
def personel_getir(pid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    return personel_bilgi(p)


@router.put("/{pid}")
def personel_guncelle(pid: int, veri: PersonelGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(p, alan, deger)
    db.commit(); db.refresh(p)
    return personel_bilgi(p)


@router.delete("/{pid}", status_code=204)
def personel_sil(pid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol != models.Rol.admin:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    p.durum = models.PersonelDurum.pasif
    db.commit()
