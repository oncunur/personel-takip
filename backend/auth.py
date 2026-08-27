import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
import models

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY tanimli degil. backend/.env dosyasi olusturun "
        "(ornek icin backend/.env.example dosyasina bakin)."
    )

ALGORITHM = os.getenv("ALGORITHM", "HS256")
TOKEN_SURESI_DAKIKA = int(os.getenv("TOKEN_SURESI_DAKIKA", "480"))  # 8 saat

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def sifre_dogrula(sifre: str, sifre_hash: str) -> bool:
    return pwd_context.verify(sifre, sifre_hash)


def sifre_hashle(sifre: str) -> str:
    return pwd_context.hash(sifre)


def token_olustur(data: dict, sure: Optional[timedelta] = None) -> str:
    payload = data.copy()
    bitis = datetime.utcnow() + (sure or timedelta(minutes=TOKEN_SURESI_DAKIKA))
    # jti: her token benzersiz olsun. Aynı saniyede yapılan iki giriş
    # aynı içeriği üretiyordu; bir cihazdan çıkış diğerini de kapatıyordu.
    payload.update({"exp": bitis, "jti": uuid.uuid4().hex})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def token_coz(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def kullanici_dogrula(db: Session, kullanici_adi: str, sifre: str):
    kullanici = db.query(models.Kullanici).filter(
        models.Kullanici.kullanici_adi == kullanici_adi,
        models.Kullanici.aktif == True
    ).first()
    if not kullanici or not sifre_dogrula(sifre, kullanici.sifre_hash):
        return None
    return kullanici
