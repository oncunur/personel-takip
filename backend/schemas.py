from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
from models import Rol


class GirisIstegi(BaseModel):
    kullanici_adi: str
    sifre: str


class Token(BaseModel):
    access_token: str
    token_type: str
    kullanici: "KullaniciBilgi"


class KullaniciBilgi(BaseModel):
    id: int
    ad: str
    soyad: str
    email: str
    kullanici_adi: str
    rol: Rol
    aktif: bool

    class Config:
        from_attributes = True


class KullaniciOlustur(BaseModel):
    ad: str
    soyad: str
    email: EmailStr
    kullanici_adi: str
    sifre: str
    rol: Rol = Rol.personel


Token.model_rebuild()
