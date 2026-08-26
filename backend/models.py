from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Date, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class Rol(str, enum.Enum):
    admin = "admin"
    yonetici = "yonetici"
    personel = "personel"


class PersonelDurum(str, enum.Enum):
    aktif = "aktif"
    pasif = "pasif"
    izinli = "izinli"


class Cinsiyet(str, enum.Enum):
    erkek = "erkek"
    kadin = "kadin"
    belirtilmemis = "belirtilmemis"


class Departman(Base):
    __tablename__ = "departmanlar"

    id = Column(Integer, primary_key=True, index=True)
    ad = Column(String, unique=True, nullable=False, index=True)
    aciklama = Column(String, nullable=True)
    aktif = Column(Boolean, default=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    personeller = relationship("Personel", back_populates="departman")


class Personel(Base):
    __tablename__ = "personeller"

    id = Column(Integer, primary_key=True, index=True)
    ad = Column(String, nullable=False)
    soyad = Column(String, nullable=False)
    tc_kimlik = Column(String(11), unique=True, nullable=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    telefon = Column(String, nullable=True)
    departman_id = Column(Integer, ForeignKey("departmanlar.id"), nullable=True)
    pozisyon = Column(String, nullable=True)
    ise_baslama_tarihi = Column(Date, nullable=True)
    dogum_tarihi = Column(Date, nullable=True)
    cinsiyet = Column(Enum(Cinsiyet), default=Cinsiyet.belirtilmemis)
    adres = Column(String, nullable=True)
    durum = Column(Enum(PersonelDurum), default=PersonelDurum.aktif)
    maas = Column(Numeric(12, 2), nullable=True)
    notlar = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())
    guncelleme_tarihi = Column(DateTime(timezone=True), onupdate=func.now())

    departman = relationship("Departman", back_populates="personeller")


class PuantajDurum(str, enum.Enum):
    tam        = "tam"
    yarim      = "yarim"
    devamsiz   = "devamsiz"
    izinli     = "izinli"
    resmi_tatil = "resmi_tatil"
    hafta_sonu = "hafta_sonu"


class BordroDurum(str, enum.Enum):
    taslak    = "taslak"
    onaylandi = "onaylandi"
    odendi    = "odendi"


class Puantaj(Base):
    __tablename__ = "puantaj"

    id            = Column(Integer, primary_key=True, index=True)
    personel_id   = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    tarih         = Column(Date, nullable=False)
    giris_saati   = Column(String(5), nullable=True)   # "09:00"
    cikis_saati   = Column(String(5), nullable=True)   # "18:00"
    durum         = Column(Enum(PuantajDurum), default=PuantajDurum.tam)
    fazla_mesai   = Column(Numeric(4, 2), default=0)   # saat
    notlar        = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    personel = relationship("Personel", foreign_keys=[personel_id])


class Bordro(Base):
    __tablename__ = "bordrolar"

    id              = Column(Integer, primary_key=True, index=True)
    personel_id     = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    yil             = Column(Integer, nullable=False)
    ay              = Column(Integer, nullable=False)
    baz_maas        = Column(Numeric(12, 2), nullable=False)
    fazla_mesai_ucr = Column(Numeric(12, 2), default=0)
    prim            = Column(Numeric(12, 2), default=0)
    diger_eklemeler = Column(Numeric(12, 2), default=0)
    brut_maas       = Column(Numeric(12, 2), nullable=False)
    sgk_isci        = Column(Numeric(12, 2), nullable=False)   # %14
    issizlik_isci   = Column(Numeric(12, 2), nullable=False)   # %1
    gelir_vergisi   = Column(Numeric(12, 2), nullable=False)
    damga_vergisi   = Column(Numeric(12, 2), nullable=False)   # %0.759
    net_maas        = Column(Numeric(12, 2), nullable=False)
    calisilan_gun   = Column(Integer, default=0)
    fazla_mesai_saat = Column(Numeric(6, 2), default=0)
    durum           = Column(Enum(BordroDurum), default=BordroDurum.taslak)
    notlar          = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    personel = relationship("Personel", foreign_keys=[personel_id])


class IzinTur(str, enum.Enum):
    yillik = "yillik"
    mazeret = "mazeret"
    hastalik = "hastalik"
    ucretsiz = "ucretsiz"
    dogum = "dogum"
    olum = "olum"
    diger = "diger"


class IzinDurum(str, enum.Enum):
    beklemede = "beklemede"
    onaylandi = "onaylandi"
    reddedildi = "reddedildi"
    iptal = "iptal"


class IzinTalep(Base):
    __tablename__ = "izin_talepler"

    id = Column(Integer, primary_key=True, index=True)
    personel_id = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    tur = Column(Enum(IzinTur), nullable=False)
    baslangic_tarihi = Column(Date, nullable=False)
    bitis_tarihi = Column(Date, nullable=False)
    gun_sayisi = Column(Integer, nullable=False)
    aciklama = Column(String, nullable=True)
    durum = Column(Enum(IzinDurum), default=IzinDurum.beklemede)
    onaylayan_id = Column(Integer, ForeignKey("kullanicilar.id"), nullable=True)
    onay_tarihi = Column(DateTime(timezone=True), nullable=True)
    onay_notu = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    personel = relationship("Personel", foreign_keys=[personel_id])
    onaylayan = relationship("Kullanici", foreign_keys=[onaylayan_id])


class Kullanici(Base):
    __tablename__ = "kullanicilar"

    id = Column(Integer, primary_key=True, index=True)
    ad = Column(String, nullable=False)
    soyad = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    kullanici_adi = Column(String, unique=True, index=True, nullable=False)
    sifre_hash = Column(String, nullable=False)
    rol = Column(Enum(Rol), default=Rol.personel, nullable=False)
    aktif = Column(Boolean, default=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())
    son_giris = Column(DateTime(timezone=True), nullable=True)


# ═══════════════════════════════════════════════════════════════
#  İDARİ İŞLER MODÜLLERİ
# ═══════════════════════════════════════════════════════════════

# ---------- Konaklama & Kiralık Evler ----------

class KonutTur(str, enum.Enum):
    kiralik_daire    = "kiralik_daire"
    lojman           = "lojman"
    misafirhane      = "misafirhane"
    santiye_barakasi = "santiye_barakasi"
    otel             = "otel"


class KonutDurum(str, enum.Enum):
    aktif = "aktif"
    bos   = "bos"
    pasif = "pasif"


class KonutGiderTur(str, enum.Enum):
    kira     = "kira"
    elektrik = "elektrik"
    su       = "su"
    dogalgaz = "dogalgaz"
    internet = "internet"
    aidat    = "aidat"
    tamir    = "tamir"
    temizlik = "temizlik"
    diger    = "diger"


class Konut(Base):
    __tablename__ = "konutlar"

    id                 = Column(Integer, primary_key=True, index=True)
    kod                = Column(String, unique=True, nullable=False, index=True)  # KNT-001
    ad                 = Column(String, nullable=False)
    tur                = Column(Enum(KonutTur), default=KonutTur.kiralik_daire)
    adres              = Column(String, nullable=True)
    il                 = Column(String, nullable=True)
    ilce               = Column(String, nullable=True)
    oda_sayisi         = Column(String, nullable=True)      # "2+1"
    kapasite           = Column(Integer, default=1)         # yatak kapasitesi
    aylik_kira         = Column(Numeric(12, 2), default=0)
    depozito           = Column(Numeric(12, 2), default=0)
    aidat              = Column(Numeric(12, 2), default=0)
    ev_sahibi_ad       = Column(String, nullable=True)
    ev_sahibi_telefon  = Column(String, nullable=True)
    ev_sahibi_iban     = Column(String, nullable=True)
    sozlesme_baslangic = Column(Date, nullable=True)
    sozlesme_bitis     = Column(Date, nullable=True)
    durum              = Column(Enum(KonutDurum), default=KonutDurum.aktif)
    notlar             = Column(String, nullable=True)
    olusturma_tarihi   = Column(DateTime(timezone=True), server_default=func.now())

    konaklamalar = relationship("Konaklama", back_populates="konut")
    giderler     = relationship("KonutGider", back_populates="konut")


class Konaklama(Base):
    __tablename__ = "konaklamalar"

    id            = Column(Integer, primary_key=True, index=True)
    konut_id      = Column(Integer, ForeignKey("konutlar.id"), nullable=False)
    personel_id   = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    giris_tarihi  = Column(Date, nullable=False)
    cikis_tarihi  = Column(Date, nullable=True)
    oda_no        = Column(String, nullable=True)
    aktif         = Column(Boolean, default=True)
    notlar        = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    konut    = relationship("Konut", back_populates="konaklamalar")
    personel = relationship("Personel", foreign_keys=[personel_id])


class KonutGider(Base):
    __tablename__ = "konut_giderleri"

    id            = Column(Integer, primary_key=True, index=True)
    konut_id      = Column(Integer, ForeignKey("konutlar.id"), nullable=False)
    tur           = Column(Enum(KonutGiderTur), default=KonutGiderTur.kira)
    yil           = Column(Integer, nullable=False)
    ay            = Column(Integer, nullable=False)
    tutar         = Column(Numeric(12, 2), nullable=False)
    odendi        = Column(Boolean, default=False)
    odeme_tarihi  = Column(Date, nullable=True)
    aciklama      = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    konut = relationship("Konut", back_populates="giderler")


# ---------- Demirbaş & Zimmet ----------

class DemirbasDurum(str, enum.Enum):
    depoda   = "depoda"
    zimmetli = "zimmetli"
    bakimda  = "bakimda"
    hurda    = "hurda"
    kayip    = "kayip"


class Demirbas(Base):
    __tablename__ = "demirbaslar"

    id            = Column(Integer, primary_key=True, index=True)
    kod           = Column(String, unique=True, nullable=False, index=True)  # DMB-001
    ad            = Column(String, nullable=False)
    kategori      = Column(String, nullable=True)   # Bilgisayar, Telefon, Mobilya...
    marka         = Column(String, nullable=True)
    model         = Column(String, nullable=True)
    seri_no       = Column(String, nullable=True)
    alis_tarihi   = Column(Date, nullable=True)
    alis_bedeli   = Column(Numeric(12, 2), default=0)
    garanti_bitis = Column(Date, nullable=True)
    durum         = Column(Enum(DemirbasDurum), default=DemirbasDurum.depoda)
    lokasyon      = Column(String, nullable=True)   # Merkez Ofis, Şantiye...
    notlar        = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    zimmetler = relationship("Zimmet", back_populates="demirbas")


class Zimmet(Base):
    __tablename__ = "zimmetler"

    id            = Column(Integer, primary_key=True, index=True)
    demirbas_id   = Column(Integer, ForeignKey("demirbaslar.id"), nullable=False)
    personel_id   = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    veris_tarihi  = Column(Date, nullable=False)
    iade_tarihi   = Column(Date, nullable=True)
    aktif         = Column(Boolean, default=True)
    teslim_eden_id = Column(Integer, ForeignKey("kullanicilar.id"), nullable=True)
    notlar        = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    demirbas    = relationship("Demirbas", back_populates="zimmetler")
    personel    = relationship("Personel", foreign_keys=[personel_id])
    teslim_eden = relationship("Kullanici", foreign_keys=[teslim_eden_id])


# ---------- Araç / Filo ----------

class AracDurum(str, enum.Enum):
    aktif   = "aktif"
    bakimda = "bakimda"
    satildi = "satildi"
    pasif   = "pasif"


class YakitTur(str, enum.Enum):
    benzin  = "benzin"
    dizel   = "dizel"
    lpg     = "lpg"
    elektrik = "elektrik"
    hibrit  = "hibrit"


class AracGiderTur(str, enum.Enum):
    yakit   = "yakit"
    bakim   = "bakim"
    lastik  = "lastik"
    sigorta = "sigorta"
    kasko   = "kasko"
    muayene = "muayene"
    ceza    = "ceza"
    hgs     = "hgs"
    diger   = "diger"


class Arac(Base):
    __tablename__ = "araclar"

    id              = Column(Integer, primary_key=True, index=True)
    plaka           = Column(String, unique=True, nullable=False, index=True)
    marka           = Column(String, nullable=True)
    model           = Column(String, nullable=True)
    yil             = Column(Integer, nullable=True)
    tip             = Column(String, nullable=True)   # Binek, Kamyonet, İş Makinesi
    yakit_tur       = Column(Enum(YakitTur), default=YakitTur.dizel)
    km              = Column(Integer, default=0)
    muayene_tarihi  = Column(Date, nullable=True)
    sigorta_bitis   = Column(Date, nullable=True)
    kasko_bitis     = Column(Date, nullable=True)
    durum           = Column(Enum(AracDurum), default=AracDurum.aktif)
    notlar          = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    atamalar = relationship("AracAtama", back_populates="arac")
    giderler = relationship("AracGider", back_populates="arac")


class AracAtama(Base):
    __tablename__ = "arac_atamalari"

    id                = Column(Integer, primary_key=True, index=True)
    arac_id           = Column(Integer, ForeignKey("araclar.id"), nullable=False)
    personel_id       = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    baslangic_tarihi  = Column(Date, nullable=False)
    bitis_tarihi      = Column(Date, nullable=True)
    aktif             = Column(Boolean, default=True)
    notlar            = Column(String, nullable=True)
    olusturma_tarihi  = Column(DateTime(timezone=True), server_default=func.now())

    arac     = relationship("Arac", back_populates="atamalar")
    personel = relationship("Personel", foreign_keys=[personel_id])


class AracGider(Base):
    __tablename__ = "arac_giderleri"

    id        = Column(Integer, primary_key=True, index=True)
    arac_id   = Column(Integer, ForeignKey("araclar.id"), nullable=False)
    tur       = Column(Enum(AracGiderTur), default=AracGiderTur.yakit)
    tarih     = Column(Date, nullable=False)
    tutar     = Column(Numeric(12, 2), nullable=False)
    km        = Column(Integer, nullable=True)
    litre     = Column(Numeric(8, 2), nullable=True)
    aciklama  = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    arac = relationship("Arac", back_populates="giderler")


# ---------- Evrak & Sözleşme ----------

class EvrakYon(str, enum.Enum):
    gelen = "gelen"
    giden = "giden"


class SozlesmeDurum(str, enum.Enum):
    aktif         = "aktif"
    suresi_doldu  = "suresi_doldu"
    feshedildi    = "feshedildi"


class SozlesmeTur(str, enum.Enum):
    kira    = "kira"
    hizmet  = "hizmet"
    tedarik = "tedarik"
    taseron = "taseron"
    sigorta = "sigorta"
    diger   = "diger"


class Evrak(Base):
    __tablename__ = "evraklar"

    id                 = Column(Integer, primary_key=True, index=True)
    evrak_no           = Column(String, nullable=False, index=True)
    yon                = Column(Enum(EvrakYon), default=EvrakYon.gelen)
    tarih              = Column(Date, nullable=False)
    konu               = Column(String, nullable=False)
    gonderen           = Column(String, nullable=True)
    alici              = Column(String, nullable=True)
    kategori           = Column(String, nullable=True)   # Resmi Yazı, Fatura, Tebligat...
    ilgili_personel_id = Column(Integer, ForeignKey("personeller.id"), nullable=True)
    dosya_yolu         = Column(String, nullable=True)
    notlar             = Column(String, nullable=True)
    olusturma_tarihi   = Column(DateTime(timezone=True), server_default=func.now())

    ilgili_personel = relationship("Personel", foreign_keys=[ilgili_personel_id])


class Sozlesme(Base):
    __tablename__ = "sozlesmeler"

    id                  = Column(Integer, primary_key=True, index=True)
    baslik              = Column(String, nullable=False)
    karsi_taraf         = Column(String, nullable=True)
    tur                 = Column(Enum(SozlesmeTur), default=SozlesmeTur.hizmet)
    baslangic_tarihi    = Column(Date, nullable=False)
    bitis_tarihi        = Column(Date, nullable=True)
    bedel               = Column(Numeric(14, 2), default=0)
    para_birimi         = Column(String, default="TRY")
    uyari_gun           = Column(Integer, default=30)   # bitişe kaç gün kala uyar
    durum               = Column(Enum(SozlesmeDurum), default=SozlesmeDurum.aktif)
    sorumlu_personel_id = Column(Integer, ForeignKey("personeller.id"), nullable=True)
    dosya_yolu          = Column(String, nullable=True)
    notlar              = Column(String, nullable=True)
    olusturma_tarihi    = Column(DateTime(timezone=True), server_default=func.now())

    sorumlu = relationship("Personel", foreign_keys=[sorumlu_personel_id])


# ---------- Satın Alma ----------

class TalepDurum(str, enum.Enum):
    beklemede       = "beklemede"
    onaylandi       = "onaylandi"
    reddedildi      = "reddedildi"
    siparis_verildi = "siparis_verildi"
    teslim_alindi   = "teslim_alindi"
    iptal           = "iptal"


class TalepOncelik(str, enum.Enum):
    dusuk  = "dusuk"
    normal = "normal"
    yuksek = "yuksek"
    acil   = "acil"


class SatinAlmaTalep(Base):
    __tablename__ = "satinalma_talepler"

    id              = Column(Integer, primary_key=True, index=True)
    talep_no        = Column(String, unique=True, nullable=False, index=True)  # SAT-2026-001
    talep_eden_id   = Column(Integer, ForeignKey("personeller.id"), nullable=False)
    departman_id    = Column(Integer, ForeignKey("departmanlar.id"), nullable=True)
    tarih           = Column(Date, nullable=False)
    ihtiyac_tarihi  = Column(Date, nullable=True)
    aciklama        = Column(String, nullable=True)
    oncelik         = Column(Enum(TalepOncelik), default=TalepOncelik.normal)
    tahmini_tutar   = Column(Numeric(14, 2), default=0)
    durum           = Column(Enum(TalepDurum), default=TalepDurum.beklemede)
    onaylayan_id    = Column(Integer, ForeignKey("kullanicilar.id"), nullable=True)
    onay_tarihi     = Column(DateTime(timezone=True), nullable=True)
    onay_notu       = Column(String, nullable=True)
    tedarikci       = Column(String, nullable=True)
    siparis_tarihi  = Column(Date, nullable=True)
    teslim_tarihi   = Column(Date, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    talep_eden = relationship("Personel", foreign_keys=[talep_eden_id])
    departman  = relationship("Departman", foreign_keys=[departman_id])
    onaylayan  = relationship("Kullanici", foreign_keys=[onaylayan_id])
    kalemler   = relationship("SatinAlmaKalem", back_populates="talep", cascade="all, delete-orphan")


class SatinAlmaKalem(Base):
    __tablename__ = "satinalma_kalemler"

    id          = Column(Integer, primary_key=True, index=True)
    talep_id    = Column(Integer, ForeignKey("satinalma_talepler.id"), nullable=False)
    urun_ad     = Column(String, nullable=False)
    miktar      = Column(Numeric(10, 2), default=1)
    birim       = Column(String, default="adet")
    birim_fiyat = Column(Numeric(12, 2), default=0)

    talep = relationship("SatinAlmaTalep", back_populates="kalemler")


# ---------- Ofis Malzeme / Sarf Stok ----------

class StokHareketTur(str, enum.Enum):
    giris = "giris"
    cikis = "cikis"
    sayim = "sayim"
    fire  = "fire"


class StokUrun(Base):
    __tablename__ = "stok_urunler"

    id             = Column(Integer, primary_key=True, index=True)
    kod            = Column(String, unique=True, nullable=False, index=True)  # STK-001
    ad             = Column(String, nullable=False)
    kategori       = Column(String, nullable=True)   # Kırtasiye, Temizlik, Mutfak...
    birim          = Column(String, default="adet")
    mevcut_miktar  = Column(Numeric(12, 2), default=0)
    kritik_seviye  = Column(Numeric(12, 2), default=0)
    birim_fiyat    = Column(Numeric(12, 2), default=0)
    raf            = Column(String, nullable=True)
    aktif          = Column(Boolean, default=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    hareketler = relationship("StokHareket", back_populates="urun")


class StokHareket(Base):
    __tablename__ = "stok_hareketler"

    id           = Column(Integer, primary_key=True, index=True)
    urun_id      = Column(Integer, ForeignKey("stok_urunler.id"), nullable=False)
    tur          = Column(Enum(StokHareketTur), default=StokHareketTur.giris)
    miktar       = Column(Numeric(12, 2), nullable=False)
    tarih        = Column(Date, nullable=False)
    personel_id  = Column(Integer, ForeignKey("personeller.id"), nullable=True)  # kime verildi
    belge_no     = Column(String, nullable=True)
    aciklama     = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    urun     = relationship("StokUrun", back_populates="hareketler")
    personel = relationship("Personel", foreign_keys=[personel_id])


# ---------- Ziyaretçi & Toplantı Odası ----------

class Ziyaretci(Base):
    __tablename__ = "ziyaretciler"

    id                 = Column(Integer, primary_key=True, index=True)
    ad_soyad           = Column(String, nullable=False)
    firma              = Column(String, nullable=True)
    telefon            = Column(String, nullable=True)
    ziyaret_edilen_id  = Column(Integer, ForeignKey("personeller.id"), nullable=True)
    amac               = Column(String, nullable=True)
    giris_zamani       = Column(DateTime(timezone=True), server_default=func.now())
    cikis_zamani       = Column(DateTime(timezone=True), nullable=True)
    kart_no            = Column(String, nullable=True)
    notlar             = Column(String, nullable=True)

    ziyaret_edilen = relationship("Personel", foreign_keys=[ziyaret_edilen_id])


class ToplantiOdasi(Base):
    __tablename__ = "toplanti_odalari"

    id       = Column(Integer, primary_key=True, index=True)
    ad       = Column(String, unique=True, nullable=False)
    konum    = Column(String, nullable=True)
    kapasite = Column(Integer, default=0)
    ekipman  = Column(String, nullable=True)   # Projeksiyon, TV, Telekonferans
    aktif    = Column(Boolean, default=True)

    rezervasyonlar = relationship("OdaRezervasyon", back_populates="oda")


class OdaRezervasyon(Base):
    __tablename__ = "oda_rezervasyonlari"

    id               = Column(Integer, primary_key=True, index=True)
    oda_id           = Column(Integer, ForeignKey("toplanti_odalari.id"), nullable=False)
    baslik           = Column(String, nullable=False)
    tarih            = Column(Date, nullable=False)
    baslangic_saat   = Column(String(5), nullable=False)   # "09:00"
    bitis_saat       = Column(String(5), nullable=False)   # "10:30"
    olusturan_id     = Column(Integer, ForeignKey("personeller.id"), nullable=True)
    katilimci_sayisi = Column(Integer, default=0)
    iptal            = Column(Boolean, default=False)
    notlar           = Column(String, nullable=True)
    olusturma_tarihi = Column(DateTime(timezone=True), server_default=func.now())

    oda       = relationship("ToplantiOdasi", back_populates="rezervasyonlar")
    olusturan = relationship("Personel", foreign_keys=[olusturan_id])
