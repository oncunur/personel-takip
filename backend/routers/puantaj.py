from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
import calendar, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import get_db
from routers.auth import aktif_kullanici, yonetici_yetkisi
from pydantic import BaseModel

router = APIRouter(prefix="/puantaj", tags=["Puantaj"])


# ─── Mesai düzeni ───────────────────────────────────────────────────
# Şirketin çalışma düzeni. Değiştirmek için yalnızca bu blok yeterlidir.
MESAI_BASLANGIC = "08:00"
MESAI_BITIS     = "19:00"
MOLA_SAAT       = 1.0     # ara dinlenmesi, çalışma süresinden düşülür
GUNLUK_MESAI    = 10.0    # 08:00–19:00 arası 11 saat, 1 saat mola düşülür
YARIM_GUN       = GUNLUK_MESAI / 2

# Hafta tatili günü. Cumartesi normal çalışma günüdür; yalnızca pazar
# hafta tatilidir (HT). date.weekday(): pazartesi 0 ... pazar 6.
HAFTA_TATILI_GUNU = 6


def hafta_tatili_mi(gun: date) -> bool:
    return gun.weekday() == HAFTA_TATILI_GUNU

# Fazla mesai ücreti maaşa dahil olduğu için ayrıca hesaplanmaz;
# fazla_mesai alanı yalnızca bilgi amaçlı tutulur.


def _saate_cevir(hhmm: Optional[str]) -> Optional[float]:
    """ "09:30" -> 9.5. Bozuk veya boş değer için None döner."""
    if not hhmm:
        return None
    try:
        saat, dakika = hhmm.split(":")
        return int(saat) + int(dakika) / 60
    except (ValueError, AttributeError):
        return None


def calisilan_saat(durum, giris: Optional[str], cikis: Optional[str]) -> float:
    """Bir günün çalışılan saatini hesaplar.

    Giriş ve çıkış girilmişse aradaki fark alınır ve ara dinlenmesi
    düşülür. Girilmemişse duruma göre standart süre sayılır — kayıtların
    çoğunda saat alanı boş olduğu için bu karma yöntem kullanılır.
    """
    if durum in (models.PuantajDurum.devamsiz, models.PuantajDurum.izinli,
                 models.PuantajDurum.resmi_tatil, models.PuantajDurum.hafta_sonu, None):
        return 0.0

    b, s = _saate_cevir(giris), _saate_cevir(cikis)
    if b is not None and s is not None and s > b:
        sure = s - b
        # Ara dinlenmesi yalnızca yarım günü aşan çalışmalarda düşülür
        if sure > YARIM_GUN:
            sure -= MOLA_SAAT
        return round(max(sure, 0.0), 2)

    return GUNLUK_MESAI if durum == models.PuantajDurum.tam else YARIM_GUN


class PuantajKayit(BaseModel):
    personel_id: int
    tarih: date
    giris_saati: Optional[str] = None
    cikis_saati: Optional[str] = None
    durum: models.PuantajDurum = models.PuantajDurum.tam
    fazla_mesai: Optional[Decimal] = None
    notlar: Optional[str] = None


class PuantajGuncelle(BaseModel):
    giris_saati: Optional[str] = None
    cikis_saati: Optional[str] = None
    durum: Optional[models.PuantajDurum] = None
    fazla_mesai: Optional[Decimal] = None
    notlar: Optional[str] = None


def kayit_dict(k: models.Puantaj) -> dict:
    return {
        "id": k.id,
        "personel_id": k.personel_id,
        "personel_ad": f"{k.personel.ad} {k.personel.soyad}" if k.personel else None,
        "tarih": str(k.tarih),
        "giris_saati": k.giris_saati,
        "cikis_saati": k.cikis_saati,
        "durum": k.durum,
        "fazla_mesai": float(k.fazla_mesai) if k.fazla_mesai else 0,
        "notlar": k.notlar,
    }


@router.get("/aylik")
def aylik_puantaj(
    personel_id: int = Query(...),
    yil: int = Query(...),
    ay: int = Query(...),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(aktif_kullanici),
):
    baslangic = date(yil, ay, 1)
    bitis = date(yil, ay, calendar.monthrange(yil, ay)[1])

    kayitlar = db.query(models.Puantaj).filter(
        models.Puantaj.personel_id == personel_id,
        models.Puantaj.tarih >= baslangic,
        models.Puantaj.tarih <= bitis,
    ).all()

    kayit_map = {str(k.tarih): kayit_dict(k) for k in kayitlar}

    # Her gün için durum üret
    gunler = []
    gun = baslangic
    while gun <= bitis:
        tarih_str = str(gun)
        hafta_sonu = hafta_tatili_mi(gun)
        if tarih_str in kayit_map:
            gunler.append(kayit_map[tarih_str])
        else:
            gunler.append({
                "id": None,
                "personel_id": personel_id,
                "tarih": tarih_str,
                "giris_saati": None,
                "cikis_saati": None,
                "durum": "hafta_sonu" if hafta_sonu else None,
                "fazla_mesai": 0,
                "notlar": None,
            })
        gun += timedelta(days=1)

    for g in gunler:
        g["saat"] = calisilan_saat(g["durum"], g["giris_saati"], g["cikis_saati"])

    calisilan = sum(1 for g in gunler if g["durum"] in ["tam", "yarim"])
    devamsiz  = sum(1 for g in gunler if g["durum"] == "devamsiz")
    izinli    = sum(1 for g in gunler if g["durum"] == "izinli")
    toplam_fazla = sum(g["fazla_mesai"] or 0 for g in gunler)

    return {
        "personel_id": personel_id, "yil": yil, "ay": ay,
        "calisilan_gun": calisilan, "devamsiz_gun": devamsiz,
        "izinli_gun": izinli, "toplam_fazla_mesai": toplam_fazla,
        "toplam_saat": round(sum(g["saat"] for g in gunler), 2),
        "gunler": gunler,
    }


class TopluDoldur(BaseModel):
    """Bir dönemi tek istekte doldurmak için."""
    yil: int
    ay: int
    durum: models.PuantajDurum = models.PuantajDurum.tam
    personel_idler: Optional[List[int]] = None   # boşsa tüm aktif personel
    gunler: Optional[List[int]] = None           # boşsa ayın tüm günleri
    hafta_tatili_dahil: bool = False             # pazar günleri de doldurulsun mu
    mevcutlari_koru: bool = True                 # dolu günlere dokunulmasın mı


@router.post("/toplu-doldur")
def toplu_doldur(
    veri: TopluDoldur,
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    """Bir ayı toplu doldurur.

    Ay başında 30 gün × personel sayısı kadar hücreye tek tek tıklamak
    yerine tek istekte doldurulur. Varsayılan olarak mevcut kayıtlara
    dokunulmaz; yalnızca boş günler işlenir.
    """
    gun_sayisi = calendar.monthrange(veri.yil, veri.ay)[1]

    q = db.query(models.Personel).filter(
        models.Personel.durum != models.PersonelDurum.pasif
    )
    if veri.personel_idler:
        q = q.filter(models.Personel.id.in_(veri.personel_idler))
    personeller = q.all()
    if not personeller:
        raise HTTPException(status_code=400, detail="Eşleşen personel bulunamadı")

    hedef_gunler = veri.gunler or list(range(1, gun_sayisi + 1))
    gecersiz = [g for g in hedef_gunler if not 1 <= g <= gun_sayisi]
    if gecersiz:
        raise HTTPException(status_code=400, detail=f"Ay {gun_sayisi} gün: geçersiz gün {gecersiz}")

    # Mevcut kayıtlar tek sorguda okunur
    mevcut = {}
    for k in db.query(models.Puantaj).filter(
        models.Puantaj.personel_id.in_([p.id for p in personeller]),
        models.Puantaj.tarih >= date(veri.yil, veri.ay, 1),
        models.Puantaj.tarih <= date(veri.yil, veri.ay, gun_sayisi),
    ).all():
        mevcut[(k.personel_id, k.tarih.day)] = k

    eklenen = guncellenen = atlanan = 0
    for p in personeller:
        for g in hedef_gunler:
            gun_tarihi = date(veri.yil, veri.ay, g)
            if hafta_tatili_mi(gun_tarihi) and not veri.hafta_tatili_dahil:
                atlanan += 1
                continue

            kayit = mevcut.get((p.id, g))
            if kayit:
                if veri.mevcutlari_koru:
                    atlanan += 1
                    continue
                kayit.durum = veri.durum
                guncellenen += 1
            else:
                db.add(models.Puantaj(personel_id=p.id, tarih=gun_tarihi, durum=veri.durum))
                eklenen += 1

    db.commit()
    return {
        "personel_sayisi": len(personeller),
        "eklenen": eklenen,
        "guncellenen": guncellenen,
        "atlanan": atlanan,
    }


@router.get("/cetvel")
def aylik_cetvel(
    yil: int = Query(...),
    ay: int = Query(..., ge=1, le=12),
    departman_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    """Tüm personelin aylık puantaj cetveli (personel × gün matrisi).

    Kayıt bulunmayan günler için durum None döner; hafta sonları
    ayrıca işaretlenir ki arayüz onları girişe kapatabilsin.
    """
    gun_sayisi = calendar.monthrange(yil, ay)[1]
    baslangic = date(yil, ay, 1)
    bitis = date(yil, ay, gun_sayisi)

    q = db.query(models.Personel).filter(
        models.Personel.durum != models.PersonelDurum.pasif
    )
    if departman_id:
        q = q.filter(models.Personel.departman_id == departman_id)
    personeller = q.order_by(models.Personel.ad, models.Personel.soyad).all()

    # Tüm kayıtlar tek sorguda: personel sayısı kadar sorgu atmayalım
    kayitlar = db.query(models.Puantaj).filter(
        models.Puantaj.tarih >= baslangic,
        models.Puantaj.tarih <= bitis,
    ).all()

    kayit_map: dict = {}
    for k in kayitlar:
        kayit_map.setdefault(k.personel_id, {})[k.tarih.day] = k

    gunler = [
        {"gun": g, "hafta_sonu": hafta_tatili_mi(date(yil, ay, g))}
        for g in range(1, gun_sayisi + 1)
    ]

    satirlar = []
    for p in personeller:
        kendi = kayit_map.get(p.id, {})
        hucreler = {}
        for g in range(1, gun_sayisi + 1):
            k = kendi.get(g)
            # Kayıt yoksa pazar günleri hafta tatili (HT) sayılır; kayıt
            # varsa o gün çalışılmış olabilir, kaydedilen durum korunur.
            durum = k.durum if k else (
                models.PuantajDurum.hafta_sonu if hafta_tatili_mi(date(yil, ay, g)) else None
            )
            hucreler[str(g)] = {
                "id": k.id if k else None,
                "durum": durum,
                "giris_saati": k.giris_saati if k else None,
                "cikis_saati": k.cikis_saati if k else None,
                "saat": calisilan_saat(durum, k.giris_saati if k else None,
                                       k.cikis_saati if k else None),
                "fazla_mesai": float(k.fazla_mesai) if k and k.fazla_mesai else 0,
            }
        durumlar = [h["durum"] for h in hucreler.values()]
        satirlar.append({
            "personel_id": p.id,
            "ad_soyad": f"{p.ad} {p.soyad}",
            "departman": p.departman.ad if p.departman else None,
            "gunler": hucreler,
            "calisilan": sum(1 for d in durumlar if d in (models.PuantajDurum.tam, models.PuantajDurum.yarim)),
            "devamsiz": sum(1 for d in durumlar if d == models.PuantajDurum.devamsiz),
            "izinli": sum(1 for d in durumlar if d == models.PuantajDurum.izinli),
            "toplam_saat": round(sum(h["saat"] for h in hucreler.values()), 2),
            "fazla_mesai": sum(h["fazla_mesai"] for h in hucreler.values()),
        })

    return {
        "yil": yil, "ay": ay, "gun_sayisi": gun_sayisi,
        "mesai": {
            "baslangic": MESAI_BASLANGIC,
            "bitis": MESAI_BITIS,
            "gunluk_saat": GUNLUK_MESAI,
            "mola_saat": MOLA_SAAT,
        },
        "gunler": gunler, "personeller": satirlar,
    }


@router.post("", status_code=201)
def puantaj_kaydet(
    veri: PuantajKayit,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    mevcut = db.query(models.Puantaj).filter(
        models.Puantaj.personel_id == veri.personel_id,
        models.Puantaj.tarih == veri.tarih,
    ).first()
    if mevcut:
        for alan, deger in veri.model_dump(exclude_none=True).items():
            setattr(mevcut, alan, deger)
        db.commit(); db.refresh(mevcut)
        return kayit_dict(mevcut)
    k = models.Puantaj(**veri.model_dump())
    db.add(k); db.commit(); db.refresh(k)
    return kayit_dict(k)


@router.put("/{kid}")
def puantaj_guncelle(
    kid: int, veri: PuantajGuncelle,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    k = db.query(models.Puantaj).filter(models.Puantaj.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    for alan, deger in veri.model_dump(exclude_none=True).items():
        setattr(k, alan, deger)
    db.commit(); db.refresh(k)
    return kayit_dict(k)


@router.delete("/{kid}", status_code=204)
def puantaj_sil(
    kid: int,
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    """Bir günün puantaj kaydını siler; gün "kayıt yok" durumuna döner."""
    k = db.query(models.Puantaj).filter(models.Puantaj.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    db.delete(k)
    db.commit()
