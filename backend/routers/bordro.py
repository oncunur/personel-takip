from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici, yonetici_mi, kullanici_personeli
from pydantic import BaseModel

router = APIRouter(prefix="/bordro", tags=["Bordro"])

# 2024 vergi dilimleri (kümülatif)
VERGI_DILIMLERI = [
    (110_000,  0.15),
    (230_000,  0.20),
    (580_000,  0.27),
    (3_000_000, 0.35),
    (float('inf'), 0.40),
]
SGK_ISCI    = Decimal("0.14")
ISSIZLIK    = Decimal("0.01")
DAMGA       = Decimal("0.00759")
FAZLA_KATSAYI = Decimal("1.5")   # 1 saat fazla mesai = 1.5 saatlik ücret


def gelir_vergisi_hesapla(vergi_matrahi: Decimal) -> Decimal:
    matrah = float(vergi_matrahi)
    vergi = 0.0
    onceki_sinir = 0.0
    for sinir, oran in VERGI_DILIMLERI:
        if matrah <= onceki_sinir:
            break
        dilim = min(matrah, sinir) - onceki_sinir
        vergi += dilim * oran
        onceki_sinir = sinir
    return Decimal(str(round(vergi, 2)))


def bordro_hesapla(baz_maas: Decimal, fazla_mesai_saat: Decimal,
                   prim: Decimal, diger: Decimal, calisilan_gun: int) -> dict:
    gunluk = baz_maas / Decimal("22")
    fiili_maas = gunluk * Decimal(str(calisilan_gun)) if calisilan_gun < 22 else baz_maas
    saatlik = baz_maas / Decimal("176")   # 22 gün × 8 saat
    fazla_ucr = saatlik * FAZLA_KATSAYI * fazla_mesai_saat

    brut = fiili_maas + fazla_ucr + prim + diger
    sgk  = (brut * SGK_ISCI).quantize(Decimal("0.01"))
    isiz = (brut * ISSIZLIK).quantize(Decimal("0.01"))
    matrah = brut - sgk - isiz
    gv   = gelir_vergisi_hesapla(matrah)
    dv   = (brut * DAMGA).quantize(Decimal("0.01"))
    net  = brut - sgk - isiz - gv - dv

    return {
        "baz_maas": float(baz_maas),
        "fazla_mesai_ucr": float(fazla_ucr.quantize(Decimal("0.01"))),
        "prim": float(prim),
        "diger_eklemeler": float(diger),
        "brut_maas": float(brut.quantize(Decimal("0.01"))),
        "sgk_isci": float(sgk),
        "issizlik_isci": float(isiz),
        "gelir_vergisi": float(gv),
        "damga_vergisi": float(dv),
        "net_maas": float(net.quantize(Decimal("0.01"))),
    }


def bordro_dict(b: models.Bordro) -> dict:
    return {
        "id": b.id,
        "personel_id": b.personel_id,
        "personel_ad": f"{b.personel.ad} {b.personel.soyad}" if b.personel else None,
        "personel_departman": b.personel.departman.ad if b.personel and b.personel.departman else None,
        "yil": b.yil, "ay": b.ay,
        "baz_maas": float(b.baz_maas),
        "fazla_mesai_ucr": float(b.fazla_mesai_ucr),
        "prim": float(b.prim),
        "diger_eklemeler": float(b.diger_eklemeler),
        "brut_maas": float(b.brut_maas),
        "sgk_isci": float(b.sgk_isci),
        "issizlik_isci": float(b.issizlik_isci),
        "gelir_vergisi": float(b.gelir_vergisi),
        "damga_vergisi": float(b.damga_vergisi),
        "net_maas": float(b.net_maas),
        "calisilan_gun": b.calisilan_gun,
        "fazla_mesai_saat": float(b.fazla_mesai_saat),
        "durum": b.durum,
        "notlar": b.notlar,
    }


class BordroOlustur(BaseModel):
    personel_id: int
    yil: int
    ay: int
    baz_maas: Decimal
    prim: Decimal = Decimal("0")
    diger_eklemeler: Decimal = Decimal("0")
    calisilan_gun: int = 22
    fazla_mesai_saat: Decimal = Decimal("0")
    notlar: Optional[str] = None


class BordroGuncelle(BaseModel):
    prim: Optional[Decimal] = None
    diger_eklemeler: Optional[Decimal] = None
    calisilan_gun: Optional[int] = None
    fazla_mesai_saat: Optional[Decimal] = None
    durum: Optional[models.BordroDurum] = None
    notlar: Optional[str] = None


@router.get("")
def bordro_listesi(
    yil: Optional[int] = Query(None),
    ay: Optional[int] = Query(None),
    personel_id: Optional[int] = Query(None),
    durum: Optional[str] = Query(None),
    sayfa: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Bordro)

    # Personel yalnızca kendi bordrosunu görür. Kullanıcının Personel kaydı
    # yoksa hiçbir bordro dönmemeli — filtresiz sorgu tüm maaşları açar.
    if not yonetici_mi(kullanici):
        kendi = kullanici_personeli(db, kullanici)
        if kendi is None:
            return {"toplam": 0, "veriler": []}
        q = q.filter(models.Bordro.personel_id == kendi.id)

    if yil:        q = q.filter(models.Bordro.yil == yil)
    if ay:         q = q.filter(models.Bordro.ay == ay)
    if personel_id: q = q.filter(models.Bordro.personel_id == personel_id)
    if durum:      q = q.filter(models.Bordro.durum == durum)
    q = q.order_by(models.Bordro.yil.desc(), models.Bordro.ay.desc())
    toplam = q.count()
    veriler = q.offset((sayfa - 1) * limit).limit(limit).all()
    return {"toplam": toplam, "veriler": [bordro_dict(b) for b in veriler]}


@router.post("", status_code=201)
def bordro_olustur(
    veri: BordroOlustur,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    mevcut = db.query(models.Bordro).filter(
        models.Bordro.personel_id == veri.personel_id,
        models.Bordro.yil == veri.yil,
        models.Bordro.ay == veri.ay,
    ).first()
    if mevcut:
        raise HTTPException(status_code=400, detail="Bu döneme ait bordro zaten mevcut")

    hesap = bordro_hesapla(veri.baz_maas, veri.fazla_mesai_saat, veri.prim, veri.diger_eklemeler, veri.calisilan_gun)
    b = models.Bordro(
        personel_id=veri.personel_id, yil=veri.yil, ay=veri.ay,
        baz_maas=veri.baz_maas,
        fazla_mesai_ucr=Decimal(str(hesap["fazla_mesai_ucr"])),
        prim=veri.prim, diger_eklemeler=veri.diger_eklemeler,
        brut_maas=Decimal(str(hesap["brut_maas"])),
        sgk_isci=Decimal(str(hesap["sgk_isci"])),
        issizlik_isci=Decimal(str(hesap["issizlik_isci"])),
        gelir_vergisi=Decimal(str(hesap["gelir_vergisi"])),
        damga_vergisi=Decimal(str(hesap["damga_vergisi"])),
        net_maas=Decimal(str(hesap["net_maas"])),
        calisilan_gun=veri.calisilan_gun,
        fazla_mesai_saat=veri.fazla_mesai_saat,
        notlar=veri.notlar,
    )
    db.add(b); db.commit(); db.refresh(b)
    return bordro_dict(b)


@router.get("/hesapla")
def bordro_onizle(
    baz_maas: Decimal = Query(...),
    fazla_mesai_saat: Decimal = Query(default=0),
    prim: Decimal = Query(default=0),
    diger: Decimal = Query(default=0),
    calisilan_gun: int = Query(default=22),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    return bordro_hesapla(baz_maas, fazla_mesai_saat, prim, diger, calisilan_gun)


@router.put("/{bid}")
def bordro_guncelle(
    bid: int, veri: BordroGuncelle,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    b = db.query(models.Bordro).filter(models.Bordro.id == bid).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bordro bulunamadı")
    if b.durum == models.BordroDurum.odendi:
        raise HTTPException(status_code=400, detail="Ödenmiş bordro değiştirilemez")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(b, alan, deger)
    # Yeniden hesapla
    if any(f in veri.model_dump(exclude_none=True) for f in ["prim","diger_eklemeler","calisilan_gun","fazla_mesai_saat"]):
        hesap = bordro_hesapla(b.baz_maas, b.fazla_mesai_saat or 0, b.prim or 0, b.diger_eklemeler or 0, b.calisilan_gun or 22)
        for k, v in hesap.items():
            if hasattr(b, k) and k not in ["baz_maas"]:
                setattr(b, k, Decimal(str(v)))
    db.commit(); db.refresh(b)
    return bordro_dict(b)


@router.delete("/{bid}", status_code=204)
def bordro_sil(bid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol != models.Rol.admin:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    b = db.query(models.Bordro).filter(models.Bordro.id == bid).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bordro bulunamadı")
    db.delete(b); db.commit()
