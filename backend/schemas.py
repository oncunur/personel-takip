from pydantic import BaseModel, EmailStr, Field, field_validator
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


SIFRE_KURALI = (
    "Şifre en az 8 karakter olmalı, en az bir harf ile bir rakam içermeli "
    "ve baştaki/sondaki boşluklar sayılmaz"
)


def sifre_dogrula(sifre: str) -> str:
    """Şifre karmaşıklık kuralını uygular.

    Uzunluk, baştaki ve sondaki boşluklar kırpıldıktan sonra ölçülür;
    aksi halde "       1a" gibi bir değer kuralı geçerdi.
    """
    ozet = sifre.strip()
    if len(ozet) < 8:
        raise ValueError(SIFRE_KURALI)
    if not any(k.isalpha() for k in ozet) or not any(k.isdigit() for k in ozet):
        raise ValueError(SIFRE_KURALI)
    return sifre


class KullaniciOlustur(BaseModel):
    ad: str = Field(min_length=1, max_length=50)
    soyad: str = Field(min_length=1, max_length=50)
    email: EmailStr
    kullanici_adi: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9._-]+$")
    sifre: str
    rol: Rol = Rol.personel

    @field_validator("sifre")
    @classmethod
    def _sifre(cls, v: str) -> str:
        return sifre_dogrula(v)


class KullaniciGuncelle(BaseModel):
    ad: Optional[str] = Field(default=None, min_length=1, max_length=50)
    soyad: Optional[str] = Field(default=None, min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    rol: Optional[Rol] = None
    aktif: Optional[bool] = None


class SifreDegistir(BaseModel):
    """Kullanıcının kendi şifresini değiştirmesi."""
    mevcut_sifre: str
    yeni_sifre: str

    @field_validator("yeni_sifre")
    @classmethod
    def _sifre(cls, v: str) -> str:
        return sifre_dogrula(v)


class SifreSifirla(BaseModel):
    """Yöneticinin başka bir kullanıcının şifresini sıfırlaması."""
    yeni_sifre: str

    @field_validator("yeni_sifre")
    @classmethod
    def _sifre(cls, v: str) -> str:
        return sifre_dogrula(v)


Token.model_rebuild()
