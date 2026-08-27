from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth as auth_router
from routers import personel as personel_router
from routers import izin as izin_router
from routers import rapor as rapor_router
from routers import puantaj as puantaj_router
from routers import bordro as bordro_router
from routers import ozet as ozet_router
from routers import konaklama as konaklama_router
from routers import demirbas as demirbas_router
from routers import arac as arac_router
from routers import evrak as evrak_router
from routers import satinalma as satinalma_router
from routers import stok as stok_router
from routers import ziyaretci as ziyaretci_router
from routers import yedekleme as yedek_router
import models
import sema
import auth as auth_utils
from database import SessionLocal

app = FastAPI(title="Personel ve İdari İşler Sistemi", version="2.0.0")

# Frontend statik sunucusu değişken portta çalışabildiği için
# geliştirmede tüm localhost portlarına izin veriyoruz.
app.add_middleware(
    CORSMiddleware,
    # Safari localhost'u ::1'e cozuyor; ayrica uygulama yerel agdaki
    # baska bir cihazdan (telefon, ikinci bilgisayar) da acilabiliyor.
    # Yalnizca loopback ve ozel ag araliklari kabul edilir — internete
    # acik adresler disarida kalir.
    allow_origin_regex=(
        r"http://("
        r"localhost|127\.0\.0\.1|\[::1\]|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(personel_router.router)
app.include_router(izin_router.router)
app.include_router(rapor_router.router)
app.include_router(puantaj_router.router)
app.include_router(bordro_router.router)
app.include_router(ozet_router.router)

# İdari İşler modülleri
app.include_router(konaklama_router.router)
app.include_router(demirbas_router.router)
app.include_router(arac_router.router)
app.include_router(evrak_router.router)
app.include_router(satinalma_router.router)
app.include_router(stok_router.router)
app.include_router(ziyaretci_router.router)
app.include_router(yedek_router.router)


@app.on_event("startup")
def baslangic():
    Base.metadata.create_all(bind=engine)
    # create_all yalnızca eksik tabloları açar; modele sonradan eklenen
    # sütunlar için ayrıca denetim gerekir.
    eklenen = sema.eksik_sutunlari_ekle(engine)
    if eklenen:
        print("✓ Şemaya eklenen sütunlar:", ", ".join(eklenen))
    _admin_olustur()


def _admin_olustur():
    db = SessionLocal()
    try:
        var_mi = db.query(models.Kullanici).filter(
            models.Kullanici.kullanici_adi == "admin"
        ).first()
        if not var_mi:
            admin = models.Kullanici(
                ad="Sistem",
                soyad="Yöneticisi",
                email="admin@sirket.com",
                kullanici_adi="admin",
                sifre_hash=auth_utils.sifre_hashle("Admin1234!"),
                rol=models.Rol.admin,
            )
            db.add(admin)
            db.commit()
            print("✓ Varsayılan admin oluşturuldu: admin / Admin1234!")
    finally:
        db.close()


@app.get("/")
def root():
    return {"mesaj": "Personel ve İdari İşler Sistemi API", "versiyon": "2.0.0"}
