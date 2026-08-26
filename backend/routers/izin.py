from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import date, datetime
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici
from pydantic import BaseModel

router = APIRouter(prefix="/izin", tags=["İzin Yönetimi"])


# ─── Schemas ────────────────────────────────────────────────────────
class IzinTalepOlustur(BaseModel):
    personel_id: int
    tur: models.IzinTur
    baslangic_tarihi: date
    bitis_tarihi: date
    aciklama: Optional[str] = None


class OnayIslem(BaseModel):
    durum: models.IzinDurum   # onaylandi veya reddedildi
    onay_notu: Optional[str] = None


# ─── Yardımcı ───────────────────────────────────────────────────────
def is_gunu_hesapla(baslangic: date, bitis: date) -> int:
    from datetime import timedelta
    toplam = 0
    gun = baslangic
    while gun <= bitis:
        if gun.weekday() < 5:   # Pazartesi–Cuma
            toplam += 1
        gun += timedelta(days=1)
    return toplam


def talep_dict(t: models.IzinTalep) -> dict:
    return {
        "id": t.id,
        "personel_id": t.personel_id,
        "personel_ad": f"{t.personel.ad} {t.personel.soyad}" if t.personel else None,
        "personel_departman": t.personel.departman.ad if t.personel and t.personel.departman else None,
        "tur": t.tur,
        "baslangic_tarihi": str(t.baslangic_tarihi),
        "bitis_tarihi": str(t.bitis_tarihi),
        "gun_sayisi": t.gun_sayisi,
        "aciklama": t.aciklama,
        "durum": t.durum,
        "onaylayan": f"{t.onaylayan.ad} {t.onaylayan.soyad}" if t.onaylayan else None,
        "onay_tarihi": t.onay_tarihi.isoformat() if t.onay_tarihi else None,
        "onay_notu": t.onay_notu,
        "olusturma_tarihi": t.olusturma_tarihi.isoformat() if t.olusturma_tarihi else None,
    }


# ─── Endpoints ──────────────────────────────────────────────────────
@router.get("")
def izin_listesi(
    personel_id: Optional[int] = Query(None),
    durum: Optional[str] = Query(None),
    tur: Optional[str] = Query(None),
    yil: Optional[int] = Query(None),
    sayfa: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.IzinTalep)

    # Personel sadece kendi izinlerini görür
    if kullanici.rol == models.Rol.personel:
        p = db.query(models.Personel).filter(models.Personel.email == kullanici.email).first()
        if p:
            q = q.filter(models.IzinTalep.personel_id == p.id)

    if personel_id:
        q = q.filter(models.IzinTalep.personel_id == personel_id)
    if durum:
        q = q.filter(models.IzinTalep.durum == durum)
    if tur:
        q = q.filter(models.IzinTalep.tur == tur)
    if yil:
        q = q.filter(
            models.IzinTalep.baslangic_tarihi >= date(yil, 1, 1),
            models.IzinTalep.baslangic_tarihi <= date(yil, 12, 31),
        )

    q = q.order_by(models.IzinTalep.olusturma_tarihi.desc())
    toplam = q.count()
    talepler = q.offset((sayfa - 1) * limit).limit(limit).all()
    return {"toplam": toplam, "sayfa": sayfa, "limit": limit, "veriler": [talep_dict(t) for t in talepler]}


@router.post("", status_code=201)
def izin_talep(
    veri: IzinTalepOlustur,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if veri.bitis_tarihi < veri.baslangic_tarihi:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıçtan önce olamaz")

    # Çakışma kontrolü
    cakisan = db.query(models.IzinTalep).filter(
        models.IzinTalep.personel_id == veri.personel_id,
        models.IzinTalep.durum.in_([models.IzinDurum.beklemede, models.IzinDurum.onaylandi]),
        models.IzinTalep.baslangic_tarihi <= veri.bitis_tarihi,
        models.IzinTalep.bitis_tarihi >= veri.baslangic_tarihi,
    ).first()
    if cakisan:
        raise HTTPException(status_code=400, detail="Bu tarihlerle çakışan bir izin talebi mevcut")

    gun = is_gunu_hesapla(veri.baslangic_tarihi, veri.bitis_tarihi)
    talep = models.IzinTalep(
        personel_id=veri.personel_id,
        tur=veri.tur,
        baslangic_tarihi=veri.baslangic_tarihi,
        bitis_tarihi=veri.bitis_tarihi,
        gun_sayisi=gun,
        aciklama=veri.aciklama,
    )
    db.add(talep); db.commit(); db.refresh(talep)
    return talep_dict(talep)


@router.put("/{tid}/onay")
def izin_onayla(
    tid: int,
    islem: OnayIslem,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    if islem.durum not in [models.IzinDurum.onaylandi, models.IzinDurum.reddedildi]:
        raise HTTPException(status_code=400, detail="Geçersiz işlem")

    talep = db.query(models.IzinTalep).filter(models.IzinTalep.id == tid).first()
    if not talep:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if talep.durum != models.IzinDurum.beklemede:
        raise HTTPException(status_code=400, detail="Sadece beklemedeki talepler işlenebilir")

    talep.durum = islem.durum
    talep.onaylayan_id = kullanici.id
    talep.onay_tarihi = datetime.utcnow()
    talep.onay_notu = islem.onay_notu
    db.commit(); db.refresh(talep)
    return talep_dict(talep)


@router.delete("/{tid}", status_code=204)
def izin_iptal(
    tid: int,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    talep = db.query(models.IzinTalep).filter(models.IzinTalep.id == tid).first()
    if not talep:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if talep.durum not in [models.IzinDurum.beklemede]:
        raise HTTPException(status_code=400, detail="Sadece beklemedeki talepler iptal edilebilir")
    talep.durum = models.IzinDurum.iptal
    db.commit()


@router.get("/bakiye/{personel_id}")
def izin_bakiye(
    personel_id: int,
    yil: int = Query(default=None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    hedef_yil = yil or date.today().year
    kullanilan = db.query(models.IzinTalep).filter(
        models.IzinTalep.personel_id == personel_id,
        models.IzinTalep.tur == models.IzinTur.yillik,
        models.IzinTalep.durum == models.IzinDurum.onaylandi,
        models.IzinTalep.baslangic_tarihi >= date(hedef_yil, 1, 1),
        models.IzinTalep.baslangic_tarihi <= date(hedef_yil, 12, 31),
    ).all()
    kullanilan_gun = sum(t.gun_sayisi for t in kullanilan)
    hak = 14
    return {
        "yil": hedef_yil,
        "hak": hak,
        "kullanilan": kullanilan_gun,
        "kalan": max(0, hak - kullanilan_gun),
    }
