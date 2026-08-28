from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
import kimlik
from database import get_db
from routers.auth import aktif_kullanici, yonetici_mi, yonetici_yetkisi, kullanici_personeli
from pydantic import BaseModel, EmailStr, field_validator, model_validator
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

class KimlikKarma(BaseModel):
    """Kimlik alanlarının ortak doğrulaması.

    TC kimlik ve YKN biçim denetiminden geçer; pasaport numarası
    ülkeye göre değiştiği için yalnızca karakter denetimi yapılır.
    Boş bırakılan alanlar None'a çevrilir ki benzersizlik kısıtı
    boş metinlerde çakışmasın.
    """

    @field_validator("tc_kimlik", "yabanci_kimlik_no", "pasaport_no", mode="before", check_fields=False)
    @classmethod
    def _bosu_none_yap(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v

    @field_validator("tc_kimlik", check_fields=False)
    @classmethod
    def _tc(cls, v):
        if v and not kimlik.tc_kimlik_gecerli(v):
            raise ValueError("TC kimlik numarası geçersiz (11 hane ve doğrulama basamakları uymalı)")
        return v

    @field_validator("yabanci_kimlik_no", check_fields=False)
    @classmethod
    def _ykn(cls, v):
        if v and not kimlik.ykn_gecerli(v):
            raise ValueError("Yabancı kimlik numarası 99 ile başlayan 11 hane olmalı")
        return v

    @field_validator("pasaport_no", check_fields=False)
    @classmethod
    def _pasaport(cls, v):
        if v and not kimlik.pasaport_gecerli(v):
            raise ValueError("Pasaport numarası 5–20 karakter olmalı ve yalnızca harf/rakam içermeli")
        return v

    @field_validator("uyruk", check_fields=False)
    @classmethod
    def _uyruk(cls, v):
        if v and v not in kimlik.ULKELER:
            raise ValueError("Geçersiz uyruk kodu")
        return v

    @model_validator(mode="after")
    def _uyruk_kimlik_uyumu(self):
        hata = kimlik.kimlik_kurali_hatasi(
            getattr(self, "uyruk", None),
            getattr(self, "tc_kimlik", None),
            getattr(self, "yabanci_kimlik_no", None),
        )
        if hata:
            raise ValueError(hata)
        return self


class PersonelOlustur(KimlikKarma):
    ad: str
    soyad: str
    email: EmailStr
    uyruk: Optional[str] = None
    tc_kimlik: Optional[str] = None
    yabanci_kimlik_no: Optional[str] = None
    pasaport_no: Optional[str] = None
    pasaport_gecerlilik: Optional[date] = None
    calisma_izni_no: Optional[str] = None
    calisma_izni_bitis: Optional[date] = None
    ikamet_izni_no: Optional[str] = None
    ikamet_izni_bitis: Optional[date] = None
    telefon: Optional[str] = None
    departman_id: Optional[int] = None
    pozisyon: Optional[str] = None
    ise_baslama_tarihi: Optional[date] = None
    dogum_tarihi: Optional[date] = None
    cinsiyet: models.Cinsiyet = models.Cinsiyet.belirtilmemis
    yaka: Optional[models.Yaka] = None
    adres: Optional[str] = None
    maas: Optional[Decimal] = None
    notlar: Optional[str] = None

class PersonelGuncelle(KimlikKarma):
    ad: Optional[str] = None
    soyad: Optional[str] = None
    email: Optional[EmailStr] = None
    uyruk: Optional[str] = None
    tc_kimlik: Optional[str] = None
    yabanci_kimlik_no: Optional[str] = None
    pasaport_no: Optional[str] = None
    pasaport_gecerlilik: Optional[date] = None
    calisma_izni_no: Optional[str] = None
    calisma_izni_bitis: Optional[date] = None
    ikamet_izni_no: Optional[str] = None
    ikamet_izni_bitis: Optional[date] = None
    telefon: Optional[str] = None
    departman_id: Optional[int] = None
    pozisyon: Optional[str] = None
    ise_baslama_tarihi: Optional[date] = None
    dogum_tarihi: Optional[date] = None
    cinsiyet: Optional[models.Cinsiyet] = None
    yaka: Optional[models.Yaka] = None
    adres: Optional[str] = None
    durum: Optional[models.PersonelDurum] = None
    maas: Optional[Decimal] = None
    notlar: Optional[str] = None

class PersonelBilgi(BaseModel):
    id: int
    ad: str
    soyad: str
    email: str
    uyruk: Optional[str]
    tc_kimlik: Optional[str]
    yabanci_kimlik_no: Optional[str]
    pasaport_no: Optional[str]
    pasaport_gecerlilik: Optional[date]
    calisma_izni_no: Optional[str]
    calisma_izni_bitis: Optional[date]
    ikamet_izni_no: Optional[str]
    ikamet_izni_bitis: Optional[date]
    telefon: Optional[str]
    departman_id: Optional[int]
    departman_ad: Optional[str] = None
    pozisyon: Optional[str]
    ise_baslama_tarihi: Optional[date]
    dogum_tarihi: Optional[date]
    cinsiyet: models.Cinsiyet
    yaka: Optional[models.Yaka]
    adres: Optional[str]
    durum: models.PersonelDurum
    maas: Optional[Decimal]
    notlar: Optional[str]
    class Config: from_attributes = True


# ---------- Yardımcı ----------
# Yalnızca yöneticilerin ve kaydın sahibinin görebileceği alanlar
HASSAS_ALANLAR = ("tc_kimlik", "yabanci_kimlik_no", "pasaport_no",
                  "pasaport_gecerlilik", "calisma_izni_no", "ikamet_izni_no",
                  "dogum_tarihi", "adres", "maas", "notlar")


def personel_bilgi(p: models.Personel, hassas: bool = True) -> dict:
    """Personel kaydını sözlüğe çevirir.

    hassas=False verildiğinde TC kimlik, doğum tarihi, adres, maaş ve notlar
    alanları None döner; kalan alanlar şirket içi rehber bilgisidir.
    """
    veri = {
        "id": p.id,
        "ad": p.ad,
        "soyad": p.soyad,
        "email": p.email,
        "uyruk": p.uyruk,
        "uyruk_ad": kimlik.ulke_adi(p.uyruk),
        "tc_kimlik": p.tc_kimlik,
        "yabanci_kimlik_no": p.yabanci_kimlik_no,
        "pasaport_no": p.pasaport_no,
        "pasaport_gecerlilik": str(p.pasaport_gecerlilik) if p.pasaport_gecerlilik else None,
        "calisma_izni_no": p.calisma_izni_no,
        "calisma_izni_bitis": str(p.calisma_izni_bitis) if p.calisma_izni_bitis else None,
        "ikamet_izni_no": p.ikamet_izni_no,
        "ikamet_izni_bitis": str(p.ikamet_izni_bitis) if p.ikamet_izni_bitis else None,
        "belge_uyarilari": kimlik.belge_uyarilari(p),
        "telefon": p.telefon,
        "departman_id": p.departman_id,
        "departman_ad": p.departman.ad if p.departman else None,
        "pozisyon": p.pozisyon,
        "ise_baslama_tarihi": str(p.ise_baslama_tarihi) if p.ise_baslama_tarihi else None,
        "dogum_tarihi": str(p.dogum_tarihi) if p.dogum_tarihi else None,
        "cinsiyet": p.cinsiyet,
        "yaka": p.yaka.value if p.yaka else None,
        "adres": p.adres,
        "durum": p.durum,
        "maas": float(p.maas) if p.maas else None,
        "notlar": p.notlar,
    }
    if not hassas:
        for alan in HASSAS_ALANLAR:
            veri[alan] = None
    return veri


def _benzersizlik_denetle(db: Session, email=None, tc=None, ykn=None, haric_id=None) -> None:
    """Benzersiz olması gereken alanları önceden denetler.

    Veritabanı kısıtına bırakılırsa IntegrityError 500 hatasına dönüşür;
    burada anlamlı bir 400 mesajı üretilir.
    """
    denetimler = [
        (models.Personel.email, email, "Bu e-posta zaten kayıtlı"),
        (models.Personel.tc_kimlik, tc, "Bu TC kimlik numarası zaten kayıtlı"),
        (models.Personel.yabanci_kimlik_no, ykn, "Bu yabancı kimlik numarası zaten kayıtlı"),
    ]
    for alan, deger, mesaj in denetimler:
        if not deger:
            continue
        q = db.query(models.Personel).filter(alan == deger)
        if haric_id:
            q = q.filter(models.Personel.id != haric_id)
        if q.first():
            raise HTTPException(status_code=400, detail=mesaj)


# ---------- Referans listeler ----------
@router.get("/belge-uyarilari")
def belge_uyarilari(
    gun: int = Query(kimlik.UYARI_GUN, ge=0, le=365),
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    """Süresi dolmuş veya dolmak üzere olan çalışan belgeleri.

    Çalışma ve ikamet izni süresi geçmiş bir çalışanı çalıştırmak
    yaptırım doğurduğu için bu liste anasayfada uyarı olarak gösterilir.
    """
    personeller = db.query(models.Personel).filter(
        models.Personel.durum != models.PersonelDurum.pasif
    ).all()

    satirlar = []
    for p in personeller:
        for u in kimlik.belge_uyarilari(p, uyari_gun=gun):
            satirlar.append({
                "personel_id": p.id,
                "ad_soyad": f"{p.ad} {p.soyad}",
                "uyruk": p.uyruk,
                "uyruk_ad": kimlik.ulke_adi(p.uyruk),
                **u,
            })

    # Süresi geçmişler en önde, sonra en yakın bitiş
    satirlar.sort(key=lambda x: x["kalan_gun"])
    return {
        "uyari_gun": gun,
        "toplam": len(satirlar),
        "gecmis": sum(1 for x in satirlar if x["durum"] == "gecti"),
        "veriler": satirlar,
    }


@router.get("/ozet")
def personel_ozeti(
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(yonetici_yetkisi),
):
    """Personel listesinin üstünde gösterilen sayılar.

    Yaka dağılımı ve süresi geçmiş belge sayısı ayrı uçlardan
    toplanıyordu; liste sayfası tek çağrıyla açılsın diye birleştirildi.
    """
    aktif = db.query(models.Personel).filter(
        models.Personel.durum == models.PersonelDurum.aktif
    ).all()
    toplam = db.query(func.count(models.Personel.id)).scalar() or 0

    gecmis = yaklasan = 0
    for p in aktif:
        for u in kimlik.belge_uyarilari(p):
            if u["durum"] == "gecti":
                gecmis += 1
            else:
                yaklasan += 1

    return {
        "toplam": toplam,
        "aktif": len(aktif),
        "pasif": toplam - len(aktif),
        "beyaz_yaka": sum(1 for p in aktif if p.yaka == models.Yaka.beyaz),
        "mavi_yaka": sum(1 for p in aktif if p.yaka == models.Yaka.mavi),
        "yaka_girilmemis": sum(1 for p in aktif if p.yaka is None),
        "yabanci": sum(1 for p in aktif if p.uyruk and p.uyruk != "TR"),
        "belge_gecmis": gecmis,
        "belge_yaklasan": yaklasan,
    }


@router.get("/ulkeler")
def ulke_listesi(_: models.Kullanici = Depends(aktif_kullanici)):
    """Uyruk seçimi için ülke listesi (ISO 3166-1 alfa-2)."""
    return [{"kod": k, "ad": a} for k, a in kimlik.ULKELER.items()]


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
    uyruk: Optional[str] = Query(None),
    yaka: Optional[str] = Query(None),
    sayfa: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    q = db.query(models.Personel)
    if arama:
        kosullar = [
            models.Personel.ad.ilike(f"%{arama}%"),
            models.Personel.soyad.ilike(f"%{arama}%"),
            models.Personel.email.ilike(f"%{arama}%"),
            models.Personel.pozisyon.ilike(f"%{arama}%"),
        ]
        # Kimlik numarasıyla arama yalnızca yöneticilere açık; personel
        # rolü bu alanları zaten göremiyor.
        if yonetici_mi(kullanici):
            kosullar += [
                models.Personel.tc_kimlik.ilike(f"%{arama}%"),
                models.Personel.yabanci_kimlik_no.ilike(f"%{arama}%"),
                models.Personel.pasaport_no.ilike(f"%{arama}%"),
            ]
        q = q.filter(or_(*kosullar))
    if departman_id:
        q = q.filter(models.Personel.departman_id == departman_id)
    if durum:
        q = q.filter(models.Personel.durum == durum)
    if uyruk:
        q = q.filter(models.Personel.uyruk == uyruk)
    if yaka:
        q = q.filter(models.Personel.yaka == yaka)
    toplam = q.count()
    personeller = q.offset((sayfa - 1) * limit).limit(limit).all()

    # Personel rolü rehber görünümü alır; kendi kaydını tam görür.
    tam_yetki = yonetici_mi(kullanici)
    kendi = None if tam_yetki else kullanici_personeli(db, kullanici)
    veriler = [
        personel_bilgi(p, hassas=tam_yetki or (kendi is not None and p.id == kendi.id))
        for p in personeller
    ]
    return {"toplam": toplam, "sayfa": sayfa, "limit": limit, "veriler": veriler}


@router.post("", status_code=201)
def personel_ekle(veri: PersonelOlustur, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    _benzersizlik_denetle(db, veri.email, veri.tc_kimlik, veri.yabanci_kimlik_no)
    p = models.Personel(**veri.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return personel_bilgi(p)


@router.get("/{pid}")
def personel_getir(pid: int, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    tam_yetki = yonetici_mi(kullanici)
    if not tam_yetki:
        kendi = kullanici_personeli(db, kullanici)
        tam_yetki = kendi is not None and kendi.id == p.id
    return personel_bilgi(p, hassas=tam_yetki)


@router.put("/{pid}")
def personel_guncelle(pid: int, veri: PersonelGuncelle, db: Session = Depends(get_db), kullanici: models.Kullanici = Depends(aktif_kullanici)):
    if kullanici.rol not in [models.Rol.admin, models.Rol.yonetici]:
        raise HTTPException(status_code=403, detail="Yetki yetersiz")
    p = db.query(models.Personel).filter(models.Personel.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    _benzersizlik_denetle(db, veri.email, veri.tc_kimlik, veri.yabanci_kimlik_no, haric_id=pid)

    # Kısmi güncellemede kural, gelen alanlarla kayıttaki mevcut
    # değerlerin birleşimi üzerinden denetlenir: yalnızca uyruk
    # değiştirildiğinde de eski kimlik numarası kuralı bozabilir.
    # exclude_unset: gönderilmeyen alanlar atlanır, ama açıkça null
    # gönderilen alanlar temizlenebilir. exclude_none kullanılsaydı
    # "TC kimliği sil ve YKN'ye geç" gibi bir güncelleme yapılamazdı.
    degisiklik = veri.model_dump(exclude_unset=True)
    hata = kimlik.kimlik_kurali_hatasi(
        uyruk=degisiklik.get("uyruk", p.uyruk),
        tc=degisiklik.get("tc_kimlik", p.tc_kimlik),
        ykn=degisiklik.get("yabanci_kimlik_no", p.yabanci_kimlik_no),
    )
    if hata:
        raise HTTPException(status_code=400, detail=hata)

    for alan, deger in degisiklik.items():
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
