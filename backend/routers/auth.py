from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import auth as auth_utils
import models
import schemas
from database import get_db

router = APIRouter(prefix="/auth", tags=["Kimlik Doğrulama"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/giris")


def aktif_kullanici(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth_utils.token_coz(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz token")
    kullanici = db.query(models.Kullanici).filter(
        models.Kullanici.kullanici_adi == payload.get("sub"),
        models.Kullanici.aktif == True
    ).first()
    if not kullanici:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kullanıcı bulunamadı")
    return kullanici


def yonetici_yetkisi(kullanici: models.Kullanici = Depends(aktif_kullanici)) -> models.Kullanici:
    """Yalnızca admin ve yönetici rollerinin erişebildiği uç noktalar için bağımlılık."""
    if kullanici.rol not in (models.Rol.admin, models.Rol.yonetici):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yetki yetersiz")
    return kullanici


def admin_yetkisi(kullanici: models.Kullanici = Depends(aktif_kullanici)) -> models.Kullanici:
    """Yalnızca admin rolünün erişebildiği uç noktalar için bağımlılık."""
    if kullanici.rol != models.Rol.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yetki yetersiz")
    return kullanici


def yonetici_mi(kullanici: models.Kullanici) -> bool:
    """Kullanıcı tüm personelin verisini görmeye yetkili mi?"""
    return kullanici.rol in (models.Rol.admin, models.Rol.yonetici)


def kullanici_personeli(db: Session, kullanici: models.Kullanici):
    """Giriş yapan kullanıcıya karşılık gelen Personel kaydı; eşleşme yoksa None.

    Eşleştirme e-posta üzerinden yapılır. Çağıran taraf None durumunu
    mutlaka ele almalıdır: eşleşme yokken filtre atlanırsa personel rolündeki
    kullanıcı herkesin verisini görür.
    """
    return db.query(models.Personel).filter(models.Personel.email == kullanici.email).first()


@router.post("/giris", response_model=schemas.Token)
def giris(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    kullanici = auth_utils.kullanici_dogrula(db, form.username, form.password)
    if not kullanici:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı adı veya şifre hatalı"
        )
    kullanici.son_giris = datetime.utcnow()
    db.commit()
    token = auth_utils.token_olustur({"sub": kullanici.kullanici_adi, "rol": kullanici.rol})
    return {"access_token": token, "token_type": "bearer", "kullanici": kullanici}


@router.get("/ben", response_model=schemas.KullaniciBilgi)
def ben(kullanici: models.Kullanici = Depends(aktif_kullanici)):
    return kullanici


@router.post("/cikis")
def cikis():
    return {"mesaj": "Çıkış başarılı"}


# ─── Kullanıcı yönetimi ─────────────────────────────────────────────

@router.get("/kullanicilar", response_model=List[schemas.KullaniciBilgi])
def kullanici_listesi(
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(admin_yetkisi),
):
    return db.query(models.Kullanici).order_by(models.Kullanici.kullanici_adi).all()


@router.post("/kullanicilar", response_model=schemas.KullaniciBilgi, status_code=201)
def kullanici_olustur(
    veri: schemas.KullaniciOlustur,
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(admin_yetkisi),
):
    if db.query(models.Kullanici).filter(models.Kullanici.kullanici_adi == veri.kullanici_adi).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kayıtlı")
    if db.query(models.Kullanici).filter(models.Kullanici.email == veri.email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")

    k = models.Kullanici(
        ad=veri.ad,
        soyad=veri.soyad,
        email=veri.email,
        kullanici_adi=veri.kullanici_adi,
        sifre_hash=auth_utils.sifre_hashle(veri.sifre),
        rol=veri.rol,
    )
    db.add(k)
    db.commit()
    db.refresh(k)
    return k


@router.put("/kullanicilar/{kid}", response_model=schemas.KullaniciBilgi)
def kullanici_guncelle(
    kid: int,
    veri: schemas.KullaniciGuncelle,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(admin_yetkisi),
):
    k = db.query(models.Kullanici).filter(models.Kullanici.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    degisiklik = veri.model_dump(exclude_none=True)

    # Yönetici kendi yetkisini düşürüp sistemi yönetimsiz bırakamaz.
    if k.id == kullanici.id:
        if degisiklik.get("rol") not in (None, models.Rol.admin):
            raise HTTPException(status_code=400, detail="Kendi rolünüzü değiştiremezsiniz")
        if degisiklik.get("aktif") is False:
            raise HTTPException(status_code=400, detail="Kendi hesabınızı pasife alamazsınız")

    if degisiklik.get("email") and degisiklik["email"] != k.email:
        if db.query(models.Kullanici).filter(models.Kullanici.email == degisiklik["email"]).first():
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")

    _son_admin_korumasi(db, k, degisiklik)

    for alan, deger in degisiklik.items():
        setattr(k, alan, deger)
    db.commit()
    db.refresh(k)
    return k


@router.delete("/kullanicilar/{kid}", status_code=204)
def kullanici_pasife_al(
    kid: int,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(admin_yetkisi),
):
    k = db.query(models.Kullanici).filter(models.Kullanici.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if k.id == kullanici.id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı pasife alamazsınız")
    _son_admin_korumasi(db, k, {"aktif": False})
    k.aktif = False
    db.commit()


def _son_admin_korumasi(db: Session, k: models.Kullanici, degisiklik: dict) -> None:
    """Sistemde aktif admin kalmayacak bir değişikliği engeller."""
    admin_kaybi = (
        k.rol == models.Rol.admin
        and k.aktif
        and (degisiklik.get("aktif") is False or degisiklik.get("rol") not in (None, models.Rol.admin))
    )
    if not admin_kaybi:
        return
    kalan = db.query(models.Kullanici).filter(
        models.Kullanici.rol == models.Rol.admin,
        models.Kullanici.aktif == True,
        models.Kullanici.id != k.id,
    ).count()
    if kalan == 0:
        raise HTTPException(status_code=400, detail="Sistemde en az bir aktif yönetici kalmalı")


# ─── Şifre işlemleri ────────────────────────────────────────────────

@router.post("/sifre-degistir")
def sifre_degistir(
    veri: schemas.SifreDegistir,
    db: Session = Depends(get_db),
    kullanici: models.Kullanici = Depends(aktif_kullanici),
):
    if not auth_utils.sifre_dogrula(veri.mevcut_sifre, kullanici.sifre_hash):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    if veri.yeni_sifre == veri.mevcut_sifre:
        raise HTTPException(status_code=400, detail="Yeni şifre mevcut şifreyle aynı olamaz")

    kullanici.sifre_hash = auth_utils.sifre_hashle(veri.yeni_sifre)
    db.commit()
    return {"mesaj": "Şifreniz değiştirildi"}


@router.post("/kullanicilar/{kid}/sifre-sifirla")
def sifre_sifirla(
    kid: int,
    veri: schemas.SifreSifirla,
    db: Session = Depends(get_db),
    _: models.Kullanici = Depends(admin_yetkisi),
):
    k = db.query(models.Kullanici).filter(models.Kullanici.id == kid).first()
    if not k:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    k.sifre_hash = auth_utils.sifre_hashle(veri.yeni_sifre)
    db.commit()
    return {"mesaj": f"{k.kullanici_adi} kullanıcısının şifresi sıfırlandı"}
