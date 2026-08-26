from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
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
