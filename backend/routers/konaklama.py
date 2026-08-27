from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func as sqlfunc
from typing import Optional, List
from datetime import date
from decimal import Decimal
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici

router = APIRouter(prefix="/konaklama", tags=["Konaklama"])


def _yetki(kullanici: models.Kullanici):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")


# ---------- Schemas ----------
class KonutOlustur(BaseModel):
    kod: Optional[str] = None
    ad: str
    tur: models.KonutTur = models.KonutTur.kiralik_daire
    odeme_sorumlusu: models.OdemeSorumlusu = models.OdemeSorumlusu.bykara
    adres: Optional[str] = None
    il: Optional[str] = None
    ilce: Optional[str] = None
    oda_sayisi: Optional[str] = None
    kapasite: int = 1
    aylik_kira: Decimal = Decimal(0)
    gecelik_ucret: Decimal = Decimal(0)
    depozito: Decimal = Decimal(0)
    aidat: Decimal = Decimal(0)
    ev_sahibi_ad: Optional[str] = None
    ev_sahibi_telefon: Optional[str] = None
    ev_sahibi_iban: Optional[str] = None
    sozlesme_baslangic: Optional[date] = None
    sozlesme_bitis: Optional[date] = None
    notlar: Optional[str] = None


class KonutGuncelle(BaseModel):
    kod: Optional[str] = None
    ad: Optional[str] = None
    tur: Optional[models.KonutTur] = None
    odeme_sorumlusu: Optional[models.OdemeSorumlusu] = None
    adres: Optional[str] = None
    il: Optional[str] = None
    ilce: Optional[str] = None
    oda_sayisi: Optional[str] = None
    kapasite: Optional[int] = None
    aylik_kira: Optional[Decimal] = None
    gecelik_ucret: Optional[Decimal] = None
    depozito: Optional[Decimal] = None
    aidat: Optional[Decimal] = None
    ev_sahibi_ad: Optional[str] = None
    ev_sahibi_telefon: Optional[str] = None
    ev_sahibi_iban: Optional[str] = None
    sozlesme_baslangic: Optional[date] = None
    sozlesme_bitis: Optional[date] = None
    durum: Optional[models.KonutDurum] = None
    notlar: Optional[str] = None


class KonaklamaOlustur(BaseModel):
    konut_id: int
    personel_id: int
    giris_tarihi: date
    cikis_tarihi: Optional[date] = None
    oda_no: Optional[str] = None
    # Otel konaklaması için: fatura gelmeden maliyet hesaplanabilsin
    gecelik_ucret: Optional[Decimal] = None
    pansiyon: Optional[str] = None
    rezervasyon_no: Optional[str] = None
    notlar: Optional[str] = None


class KonaklamaGuncelle(BaseModel):
    cikis_tarihi: Optional[date] = None
    oda_no: Optional[str] = None
    gecelik_ucret: Optional[Decimal] = None
    pansiyon: Optional[str] = None
    rezervasyon_no: Optional[str] = None
    notlar: Optional[str] = None


class FaturaIsle(BaseModel):
    """Otelden fatura geldiğinde gerçek tutarı işler."""
    fatura_no: str
    fatura_tarihi: date
    fatura_tutari: Decimal        # vergiler dahil toplam


class CikisIstegi(BaseModel):
    cikis_tarihi: Optional[date] = None


class GiderOlustur(BaseModel):
    konut_id: int
    tur: models.KonutGiderTur = models.KonutGiderTur.kira
    yil: int
    ay: int
    tutar: Decimal
    odendi: bool = False
    odeme_tarihi: Optional[date] = None
    aciklama: Optional[str] = None


# ---------- Yardımcı ----------
def _doluluk(db: Session, konut_id: int) -> int:
    return db.query(models.Konaklama).filter(
        models.Konaklama.konut_id == konut_id,
        models.Konaklama.aktif == True,
    ).count()


def konut_bilgi(db: Session, k: models.Konut) -> dict:
    dolu = _doluluk(db, k.id)
    kapasite = k.kapasite or 0
    return {
        "id": k.id,
        "kod": k.kod,
        "ad": k.ad,
        "tur": k.tur.value if k.tur else None,
        "kamp_mi": k.tur == models.KonutTur.kamp,
        "odeme_sorumlusu": k.odeme_sorumlusu.value if k.odeme_sorumlusu else None,
        "adres": k.adres,
        "il": k.il,
        "ilce": k.ilce,
        "oda_sayisi": k.oda_sayisi,
        "kapasite": kapasite,
        "dolu": dolu,
        "bos_yatak": max(kapasite - dolu, 0),
        "doluluk_yuzde": round(dolu / kapasite * 100) if kapasite else 0,
        "aylik_kira": float(k.aylik_kira or 0),
        "gecelik_ucret": float(k.gecelik_ucret or 0),
        "otel_mi": k.tur == models.KonutTur.otel,
        "depozito": float(k.depozito or 0),
        "aidat": float(k.aidat or 0),
        "ev_sahibi_ad": k.ev_sahibi_ad,
        "ev_sahibi_telefon": k.ev_sahibi_telefon,
        "ev_sahibi_iban": k.ev_sahibi_iban,
        "sozlesme_baslangic": str(k.sozlesme_baslangic) if k.sozlesme_baslangic else None,
        "sozlesme_bitis": str(k.sozlesme_bitis) if k.sozlesme_bitis else None,
        "kalan_gun": (k.sozlesme_bitis - date.today()).days if k.sozlesme_bitis else None,
        "durum": k.durum.value if k.durum else None,
        "notlar": k.notlar,
    }


# ─── Otel konaklama maliyeti ────────────────────────────────────────
# Otel faturalarında konaklama bedeline %10 KDV ve %1 konaklama vergisi
# eklenir. Gecelik ücret vergiler dahil (brüt) tutulur; net ve vergi
# kırılımı buradan üretilir.
KDV_ORANI = 0.10
KONAKLAMA_VERGISI_ORANI = 0.01


def _gece_sayisi(giris, cikis) -> int:
    """Konaklanan gece sayısı. Çıkış yapılmamışsa bugüne kadar sayılır."""
    bitis = cikis or date.today()
    return max((bitis - giris).days, 0)


def _konaklama_maliyeti(kn: models.Konaklama) -> dict:
    """Bir konaklama kaydının maliyetini hesaplar.

    Fatura işlenmişse gerçek tutar esas alınır; işlenmemişse gecelik
    ücret üzerinden tahmin üretilir. Böylece fatura gelmeden de
    elde bir rakam bulunur.
    """
    gece = _gece_sayisi(kn.giris_tarihi, kn.cikis_tarihi)

    # Kayıtta gecelik yoksa konutun varsayılanı kullanılır
    gecelik = kn.gecelik_ucret
    if gecelik is None and kn.konut:
        gecelik = kn.konut.gecelik_ucret
    gecelik = float(gecelik or 0)

    tahmini = round(gecelik * gece, 2)
    faturali = kn.fatura_tutari is not None
    tutar = float(kn.fatura_tutari) if faturali else tahmini

    # Brüt tutardan net ve vergileri ayrıştır
    carpan = 1 + KDV_ORANI + KONAKLAMA_VERGISI_ORANI
    net = round(tutar / carpan, 2) if tutar else 0.0

    return {
        "gece_sayisi": gece,
        "gecelik_ucret": gecelik,
        "tahmini_tutar": tahmini,
        "faturalandi": faturali,
        "tutar": tutar,
        "net_tutar": net,
        "kdv": round(net * KDV_ORANI, 2),
        "konaklama_vergisi": round(net * KONAKLAMA_VERGISI_ORANI, 2),
    }


def konaklama_bilgi(kn: models.Konaklama) -> dict:
    p = kn.personel
    return {
        "id": kn.id,
        "konut_id": kn.konut_id,
        "konut_ad": kn.konut.ad if kn.konut else None,
        "konut_kod": kn.konut.kod if kn.konut else None,
        "personel_id": kn.personel_id,
        "personel_ad": f"{p.ad} {p.soyad}" if p else None,
        "departman": p.departman.ad if p and p.departman else None,
        "telefon": p.telefon if p else None,
        "giris_tarihi": str(kn.giris_tarihi),
        "cikis_tarihi": str(kn.cikis_tarihi) if kn.cikis_tarihi else None,
        "gun_sayisi": _gece_sayisi(kn.giris_tarihi, kn.cikis_tarihi),
        "oda_no": kn.oda_no,
        "pansiyon": kn.pansiyon,
        "rezervasyon_no": kn.rezervasyon_no,
        "fatura_no": kn.fatura_no,
        "fatura_tarihi": str(kn.fatura_tarihi) if kn.fatura_tarihi else None,
        "otel_mi": kn.konut.tur == models.KonutTur.otel if kn.konut else False,
        **_konaklama_maliyeti(kn),
        "aktif": kn.aktif,
        "notlar": kn.notlar,
    }


def _sonraki_kod(db: Session, tur: models.KonutTur = None) -> str:
    """Kamplara KMP-, diğer konutlara KNT- öneki verilir."""
    onek = {
        models.KonutTur.kamp: "KMP",
        models.KonutTur.otel: "OTL",
    }.get(tur, "KNT")
    son = db.query(models.Konut).filter(models.Konut.kod.like(f"{onek}-%")).order_by(
        models.Konut.id.desc()).first()
    if son:
        try:
            sira = int(son.kod.split("-")[1]) + 1
        except (IndexError, ValueError):
            sira = son.id + 1
    else:
        sira = 1
    return f"{onek}-{sira:03d}"


# ---------- Konut Endpoints ----------
@router.get("/konutlar")
def konut_listesi(
    arama: Optional[str] = Query(None),
    tur: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None, description="'kamp' veya 'konut'"),
    odeme_sorumlusu: Optional[str] = Query(None),
    durum: Optional[str] = Query(None),
    il: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Konut)
    if arama:
        q = q.filter(or_(
            models.Konut.ad.ilike(f"%{arama}%"),
            models.Konut.kod.ilike(f"%{arama}%"),
            models.Konut.adres.ilike(f"%{arama}%"),
            models.Konut.ev_sahibi_ad.ilike(f"%{arama}%"),
        ))
    if tur:
        q = q.filter(models.Konut.tur == tur)
    # Beyaz yaka kiralık evlerde, mavi yaka kamplarda kalıyor; iki liste
    # arayüzde ayrı gösterildiği için tek parametreyle ayrılabiliyor.
    if kategori == "kamp":
        q = q.filter(models.Konut.tur == models.KonutTur.kamp)
    elif kategori == "otel":
        q = q.filter(models.Konut.tur == models.KonutTur.otel)
    elif kategori == "konut":
        # Kiralık evler: kamp ve otel dışındakiler
        q = q.filter(models.Konut.tur.notin_([models.KonutTur.kamp, models.KonutTur.otel]))
    if odeme_sorumlusu:
        q = q.filter(models.Konut.odeme_sorumlusu == odeme_sorumlusu)
    if durum:
        q = q.filter(models.Konut.durum == durum)
    if il:
        q = q.filter(models.Konut.il.ilike(f"%{il}%"))
    konutlar = q.order_by(models.Konut.kod).all()
    return {"toplam": len(konutlar), "veriler": [konut_bilgi(db, k) for k in konutlar]}


@router.post("/konutlar", status_code=201)
def konut_ekle(veri: KonutOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    data = veri.model_dump()
    if not data.get("kod"):
        data["kod"] = _sonraki_kod(db, veri.tur)
    if db.query(models.Konut).filter(models.Konut.kod == data["kod"]).first():
        raise HTTPException(status_code=400, detail="Bu kod zaten kayıtlı")
    k = models.Konut(**data)
    db.add(k); db.commit(); db.refresh(k)
    return konut_bilgi(db, k)


@router.get("/konutlar/{kid}")
def konut_getir(kid: int, db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    k = db.query(models.Konut).filter(models.Konut.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Konut bulunamadı")
    bilgi = konut_bilgi(db, k)
    bilgi["sakinler"] = [
        konaklama_bilgi(kn) for kn in
        db.query(models.Konaklama).filter(
            models.Konaklama.konut_id == kid,
            models.Konaklama.aktif == True,
        ).all()
    ]
    giderler = db.query(models.KonutGider).filter(
        models.KonutGider.konut_id == kid
    ).order_by(models.KonutGider.yil.desc(), models.KonutGider.ay.desc()).limit(12).all()
    bilgi["giderler"] = [{
        "id": g.id, "tur": g.tur.value, "yil": g.yil, "ay": g.ay,
        "tutar": float(g.tutar), "odendi": g.odendi,
        "odeme_tarihi": str(g.odeme_tarihi) if g.odeme_tarihi else None,
        "aciklama": g.aciklama,
    } for g in giderler]
    return bilgi


@router.put("/konutlar/{kid}")
def konut_guncelle(kid: int, veri: KonutGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    k = db.query(models.Konut).filter(models.Konut.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Konut bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(k, alan, deger)
    db.commit(); db.refresh(k)
    return konut_bilgi(db, k)


@router.delete("/konutlar/{kid}", status_code=204)
def konut_sil(kid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    k = db.query(models.Konut).filter(models.Konut.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Konut bulunamadı")
    if _doluluk(db, kid) > 0:
        raise HTTPException(status_code=400, detail="Konutta aktif sakin var, önce çıkış yapılmalı")
    k.durum = models.KonutDurum.pasif
    db.commit()


# ---------- Konaklama (Yerleşim) Endpoints ----------
@router.get("/kayitlar")
def konaklama_listesi(
    konut_id: Optional[int] = Query(None),
    personel_id: Optional[int] = Query(None),
    sadece_aktif: bool = Query(True),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Konaklama)
    if konut_id:
        q = q.filter(models.Konaklama.konut_id == konut_id)
    if personel_id:
        q = q.filter(models.Konaklama.personel_id == personel_id)
    if sadece_aktif:
        q = q.filter(models.Konaklama.aktif == True)
    kayitlar = q.order_by(models.Konaklama.giris_tarihi.desc()).all()
    return {"toplam": len(kayitlar), "veriler": [konaklama_bilgi(k) for k in kayitlar]}


@router.post("/kayitlar", status_code=201)
def konaklama_ekle(veri: KonaklamaOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    konut = db.query(models.Konut).filter(models.Konut.id == veri.konut_id).first()
    if not konut:
        raise HTTPException(status_code=404, detail="Konut bulunamadı")
    personel = db.query(models.Personel).filter(models.Personel.id == veri.personel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")

    mevcut = db.query(models.Konaklama).filter(
        models.Konaklama.personel_id == veri.personel_id,
        models.Konaklama.aktif == True,
    ).first()
    if mevcut:
        raise HTTPException(status_code=400, detail=f"Personel zaten '{mevcut.konut.ad}' konutunda kayıtlı")

    if _doluluk(db, veri.konut_id) >= (konut.kapasite or 0):
        raise HTTPException(status_code=400, detail="Konut kapasitesi dolu")

    kn = models.Konaklama(**veri.model_dump())
    db.add(kn); db.commit(); db.refresh(kn)

    sonuc = konaklama_bilgi(kn)
    sonuc["uyari"] = _yaka_uyumu(personel, konut)
    return sonuc


def _yaka_uyumu(personel, konut) -> Optional[str]:
    """Yerleştirme, çalışanın yaka tipiyle uyuşmuyorsa uyarı metni döner.

    Kural katı değil: beyaz yaka kiralık evlerde, mavi yaka kamplarda
    kalır ama istisnalar olabilir. Bu yüzden kayıt engellenmez,
    yalnızca dikkat çekilir.
    """
    if not personel.yaka:
        return None

    # Otel geçici konaklamadır (işe giriş süreci, ev bulunana kadar);
    # her iki yaka için de olağan, uyarı üretilmez.
    if konut.tur == models.KonutTur.otel:
        return None

    kamp_mi = konut.tur == models.KonutTur.kamp
    if personel.yaka == models.Yaka.mavi and not kamp_mi:
        return (f"{personel.ad} {personel.soyad} mavi yaka; genellikle kampta kalır. "
                f"'{konut.ad}' bir kiralık konut.")
    if personel.yaka == models.Yaka.beyaz and kamp_mi:
        return (f"{personel.ad} {personel.soyad} beyaz yaka; genellikle kiralık evde kalır. "
                f"'{konut.ad}' bir kamp.")
    return None


@router.put("/kayitlar/{kid}")
def konaklama_guncelle(kid: int, veri: KonaklamaGuncelle, db: Session = Depends(get_db),
                       kullanici: models.Kullanici = Depends(aktif_kullanici)):
    """Konaklama kaydını günceller (oda, gecelik ücret, pansiyon vb.)."""
    _yetki(kullanici)
    kn = db.query(models.Konaklama).filter(models.Konaklama.id == kid).first()
    if not kn:
        raise HTTPException(status_code=404, detail="Konaklama kaydı bulunamadı")
    for alan, deger in veri.model_dump(exclude_unset=True).items():
        setattr(kn, alan, deger)
    db.commit(); db.refresh(kn)
    return konaklama_bilgi(kn)


@router.post("/kayitlar/{kid}/fatura")
def fatura_isle(kid: int, veri: FaturaIsle, db: Session = Depends(get_db),
                kullanici: models.Kullanici = Depends(aktif_kullanici)):
    """Otel faturasını konaklama kaydına işler.

    Fatura işlendikten sonra tahmini tutarın yerini gerçek tutar alır;
    tahmin ile fatura arasındaki fark da döner, böylece sapma görülür.
    """
    _yetki(kullanici)
    kn = db.query(models.Konaklama).filter(models.Konaklama.id == kid).first()
    if not kn:
        raise HTTPException(status_code=404, detail="Konaklama kaydı bulunamadı")

    # Faturalar oda başına ayrı geldiği için bir fatura numarası tek
    # konaklamaya işlenir; aynı numaranın ikinci kez girilmesi tutarın
    # çift sayılmasına yol açar.
    ayni = db.query(models.Konaklama).filter(
        models.Konaklama.fatura_no == veri.fatura_no,
        models.Konaklama.id != kid,
    ).first()
    if ayni:
        kisi = f"{ayni.personel.ad} {ayni.personel.soyad}" if ayni.personel else "başka bir kayıt"
        raise HTTPException(
            status_code=400,
            detail=f"'{veri.fatura_no}' numaralı fatura zaten {kisi} için işlenmiş "
                   f"({ayni.giris_tarihi} girişli konaklama).",
        )

    onceki = _konaklama_maliyeti(kn)
    kn.fatura_no = veri.fatura_no
    kn.fatura_tarihi = veri.fatura_tarihi
    kn.fatura_tutari = veri.fatura_tutari
    db.commit(); db.refresh(kn)

    sonuc = konaklama_bilgi(kn)
    sonuc["tahminden_fark"] = round(float(veri.fatura_tutari) - onceki["tahmini_tutar"], 2)
    return sonuc


@router.get("/otel-ozeti")
def otel_ozeti(
    yil: Optional[int] = Query(None),
    ay: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    """Otel konaklamalarının kişi bazlı dökümü.

    Kimin kaç gece kaldığı ve maliyeti; fatura kesilmemiş olanlarda
    gecelik ücret üzerinden tahmin gösterilir.
    """
    q = db.query(models.Konaklama).join(models.Konut).filter(
        models.Konut.tur == models.KonutTur.otel
    )
    if yil and ay:
        import calendar
        son = calendar.monthrange(yil, ay)[1]
        # Dönem içinde kesişen konaklamalar
        q = q.filter(
            models.Konaklama.giris_tarihi <= date(yil, ay, son),
            or_(models.Konaklama.cikis_tarihi == None,
                models.Konaklama.cikis_tarihi >= date(yil, ay, 1)),
        )

    kayitlar = [konaklama_bilgi(k) for k in q.order_by(models.Konaklama.giris_tarihi.desc()).all()]

    return {
        "toplam_kayit": len(kayitlar),
        "devam_eden": sum(1 for k in kayitlar if k["aktif"]),
        "toplam_gece": sum(k["gece_sayisi"] for k in kayitlar),
        "faturalanan": sum(1 for k in kayitlar if k["faturalandi"]),
        "faturalanmamis": sum(1 for k in kayitlar if not k["faturalandi"]),
        "toplam_tutar": round(sum(k["tutar"] for k in kayitlar), 2),
        "faturalanan_tutar": round(sum(k["tutar"] for k in kayitlar if k["faturalandi"]), 2),
        "bekleyen_tutar": round(sum(k["tutar"] for k in kayitlar if not k["faturalandi"]), 2),
        "veriler": kayitlar,
    }


@router.post("/kayitlar/{kid}/cikis")
def konaklama_cikis(kid: int, veri: CikisIstegi, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    kn = db.query(models.Konaklama).filter(models.Konaklama.id == kid).first()
    if not kn:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    kn.cikis_tarihi = veri.cikis_tarihi or date.today()
    kn.aktif = False
    db.commit(); db.refresh(kn)
    return konaklama_bilgi(kn)


@router.delete("/kayitlar/{kid}", status_code=204)
def konaklama_sil(kid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    kn = db.query(models.Konaklama).filter(models.Konaklama.id == kid).first()
    if not kn:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    db.delete(kn); db.commit()


# ---------- Gider Endpoints ----------
@router.get("/giderler")
def gider_listesi(
    konut_id: Optional[int] = Query(None),
    yil: Optional[int] = Query(None),
    ay: Optional[int] = Query(None),
    odendi: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.KonutGider)
    if konut_id:
        q = q.filter(models.KonutGider.konut_id == konut_id)
    if yil:
        q = q.filter(models.KonutGider.yil == yil)
    if ay:
        q = q.filter(models.KonutGider.ay == ay)
    if odendi is not None:
        q = q.filter(models.KonutGider.odendi == odendi)
    giderler = q.order_by(models.KonutGider.yil.desc(), models.KonutGider.ay.desc()).all()
    return {
        "toplam": len(giderler),
        "toplam_tutar": round(sum(float(g.tutar) for g in giderler), 2),
        "odenmemis_tutar": round(sum(float(g.tutar) for g in giderler if not g.odendi), 2),
        "veriler": [{
            "id": g.id,
            "konut_id": g.konut_id,
            "konut_ad": g.konut.ad if g.konut else None,
            "tur": g.tur.value,
            "yil": g.yil, "ay": g.ay,
            "tutar": float(g.tutar),
            "odendi": g.odendi,
            "odeme_tarihi": str(g.odeme_tarihi) if g.odeme_tarihi else None,
            "aciklama": g.aciklama,
        } for g in giderler],
    }


@router.post("/giderler", status_code=201)
def gider_ekle(veri: GiderOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    if not db.query(models.Konut).filter(models.Konut.id == veri.konut_id).first():
        raise HTTPException(status_code=404, detail="Konut bulunamadı")
    g = models.KonutGider(**veri.model_dump())
    db.add(g); db.commit(); db.refresh(g)
    return {"id": g.id, "tur": g.tur.value, "yil": g.yil, "ay": g.ay, "tutar": float(g.tutar), "odendi": g.odendi}


@router.post("/giderler/{gid}/ode")
def gider_ode(gid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    g = db.query(models.KonutGider).filter(models.KonutGider.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    g.odendi = True
    g.odeme_tarihi = date.today()
    db.commit()
    return {"id": g.id, "odendi": True, "odeme_tarihi": str(g.odeme_tarihi)}


@router.delete("/giderler/{gid}", status_code=204)
def gider_sil(gid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    _yetki(kullanici)
    g = db.query(models.KonutGider).filter(models.KonutGider.id == gid).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    db.delete(g); db.commit()


# ---------- Özet ----------
@router.get("/ozet")
def konaklama_ozet(db: Session = Depends(get_db), _: models.Kullanici = Depends(aktif_kullanici)):
    konutlar = db.query(models.Konut).filter(models.Konut.durum != models.KonutDurum.pasif).all()
    toplam_kapasite = sum(k.kapasite or 0 for k in konutlar)
    toplam_dolu = db.query(models.Konaklama).filter(models.Konaklama.aktif == True).count()
    aylik_kira = sum(float(k.aylik_kira or 0) for k in konutlar)

    bugun = date.today()
    yaklasan = [
        {"id": k.id, "kod": k.kod, "ad": k.ad, "bitis": str(k.sozlesme_bitis),
         "kalan_gun": (k.sozlesme_bitis - bugun).days}
        for k in konutlar
        if k.sozlesme_bitis and 0 <= (k.sozlesme_bitis - bugun).days <= 60
    ]
    odenmemis = db.query(models.KonutGider).filter(models.KonutGider.odendi == False).all()

    # Kamp ve kiralık ev ayrı raporlanır: mavi yaka kamplarda, beyaz yaka
    # kiralık evlerde kalıyor ve kampların bir kısmının bedelini işveren
    # karşıladığı için şirketin gider yükü farklı.
    kamplar = [k for k in konutlar if k.tur == models.KonutTur.kamp]
    oteller = [k for k in konutlar if k.tur == models.KonutTur.otel]
    evler = [k for k in konutlar if k.tur not in (models.KonutTur.kamp, models.KonutTur.otel)]
    bykara_kamp = [k for k in kamplar if k.odeme_sorumlusu == models.OdemeSorumlusu.bykara]
    isveren_kamp = [k for k in kamplar if k.odeme_sorumlusu == models.OdemeSorumlusu.isveren]

    def _doluluk_topla(liste):
        idler = [k.id for k in liste]
        if not idler:
            return 0
        return db.query(models.Konaklama).filter(
            models.Konaklama.aktif == True,
            models.Konaklama.konut_id.in_(idler),
        ).count()

    return {
        "konut_sayisi": len(konutlar),
        "toplam_kapasite": toplam_kapasite,
        "dolu_yatak": toplam_dolu,
        "bos_yatak": max(toplam_kapasite - toplam_dolu, 0),
        "doluluk_yuzde": round(toplam_dolu / toplam_kapasite * 100) if toplam_kapasite else 0,
        "kamp": {
            "sayi": len(kamplar),
            "kapasite": sum(k.kapasite or 0 for k in kamplar),
            "dolu": _doluluk_topla(kamplar),
            "bykara_sayi": len(bykara_kamp),
            "bykara_kapasite": sum(k.kapasite or 0 for k in bykara_kamp),
            "bykara_dolu": _doluluk_topla(bykara_kamp),
            "isveren_sayi": len(isveren_kamp),
            "isveren_kapasite": sum(k.kapasite or 0 for k in isveren_kamp),
            "isveren_dolu": _doluluk_topla(isveren_kamp),
        },
        "otel": {
            "sayi": len(oteller),
            "kapasite": sum(k.kapasite or 0 for k in oteller),
            "dolu": _doluluk_topla(oteller),
            # Otelde kalan kişi başına günlük maliyet
            "gunluk_maliyet": sum(
                float(k.gecelik_ucret or 0) * _doluluk_topla([k]) for k in oteller
            ),
        },
        "kiralik_ev": {
            "sayi": len(evler),
            "kapasite": sum(k.kapasite or 0 for k in evler),
            "dolu": _doluluk_topla(evler),
            "aylik_kira": sum(float(k.aylik_kira or 0) for k in evler),
        },
        "aylik_kira_toplam": round(aylik_kira, 2),
        "odenmemis_gider_sayisi": len(odenmemis),
        "odenmemis_gider_tutar": round(sum(float(g.tutar) for g in odenmemis), 2),
        "sozlesme_uyarilari": sorted(yaklasan, key=lambda x: x["kalan_gun"]),
    }
