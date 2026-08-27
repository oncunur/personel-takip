"""Demo kadro oluşturur: 10 beyaz yaka, 40 mavi yaka.

Bu üretilmiş veridir; gerçek personel değildir. Temizlemek için:
    python3 demo_veri.py --temizle
"""
import random
import sys
from datetime import date, timedelta

import models
from database import SessionLocal

random.seed(42)     # her çalıştırmada aynı kadro üretilsin

BEYAZ_POZISYON = [
    ("Proje Müdürü", "Yönetim"), ("Şantiye Şefi", "Saha Yönetimi"),
    ("İnşaat Mühendisi", "Teknik Ofis"), ("Makine Mühendisi", "Teknik Ofis"),
    ("Elektrik Mühendisi", "Teknik Ofis"), ("İSG Uzmanı", "İSG"),
    ("Muhasebe Uzmanı", "Muhasebe"), ("İnsan Kaynakları Uzmanı", "İnsan Kaynakları"),
    ("Satın Alma Uzmanı", "Satın Alma"), ("İdari İşler Uzmanı", "İdari İşler"),
]

MAVI_POZISYON = [
    "Kalıpçı", "Demirci", "Betoncu", "Duvarcı", "Sıvacı", "Boyacı",
    "Kaynakçı", "Tesisatçı", "Elektrikçi", "Vinç Operatörü",
    "İş Makinesi Operatörü", "Forklift Operatörü", "Düz İşçi", "Usta Yardımcısı",
]

TURK_AD = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Hasan", "İbrahim", "Osman",
           "Yusuf", "Murat", "Emre", "Fatih", "Serkan", "Kadir", "Volkan",
           "Ayşe", "Fatma", "Emine", "Zeynep", "Elif", "Merve", "Özlem", "Seda"]
TURK_SOYAD = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım",
              "Öztürk", "Aydın", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kurt"]

# Orta Asya ve Kafkas ülkelerinden yaygın ad/soyadlar
YABANCI = {
    "UZ": (["Aziz", "Bobur", "Jasur", "Sherzod", "Otabek", "Rustam", "Farrux", "Sanjar"],
           ["Karimov", "Rahimov", "Yusupov", "Tashkentov", "Nazarov", "Abdullayev"]),
    "KG": (["Nurlan", "Azamat", "Erlan", "Baktiyar", "Talant", "Ulan"],
           ["Bekov", "Осмонов".replace("О", "O"), "Abdyldaev", "Toktogulov", "Sadykov"]),
    "TJ": (["Firdavs", "Bahrom", "Dilshod", "Umed", "Sirojiddin"],
           ["Nazarov", "Rahmonov", "Sharipov", "Qodirov"]),
    "TM": (["Merdan", "Serdar", "Kerim", "Batyr"],
           ["Amanov", "Berdiyev", "Charyyev"]),
    "AZ": (["Elvin", "Rəşad".replace("ə", "e"), "Kamran", "Orxan".replace("x", "h")],
           ["Aliyev", "Mammadov", "Hasanov"]),
    "RU": (["Sergey", "Dmitri", "Andrey"], ["Ivanov", "Petrov", "Sokolov"]),
}


def temizle(db):
    """Demo kayıtlarını siler (e-postası @demo.local ile biten)."""
    demo = db.query(models.Personel).filter(
        models.Personel.email.like("%@demo.local")).all()
    idler = [p.id for p in demo]
    if not idler:
        print("Temizlenecek demo kaydı yok.")
        return

    silinen_konaklama = db.query(models.Konaklama).filter(
        models.Konaklama.personel_id.in_(idler)).delete(synchronize_session=False)
    silinen_puantaj = db.query(models.Puantaj).filter(
        models.Puantaj.personel_id.in_(idler)).delete(synchronize_session=False)
    for p in demo:
        db.delete(p)
    db.commit()
    print(f"{len(demo)} demo personeli, {silinen_konaklama} konaklama ve "
          f"{silinen_puantaj} puantaj kaydı silindi.")


def departman_bul(db, ad):
    d = db.query(models.Departman).filter(models.Departman.ad == ad).first()
    if not d:
        d = models.Departman(ad=ad)
        db.add(d)
        db.commit()
        db.refresh(d)
    return d


def olustur(db):
    bugun = date.today()
    kisiler = []
    kullanilan_eposta = set()

    def eposta(ad, soyad, i):
        temiz = (ad + "." + soyad).lower()
        for a, b in [("ı", "i"), ("ş", "s"), ("ğ", "g"), ("ü", "u"), ("ö", "o"), ("ç", "c")]:
            temiz = temiz.replace(a, b)
        e = f"{temiz}{i}@demo.local"
        return e

    # ── 10 beyaz yaka: Türk vatandaşı, kiralık ev / otel ──
    for i, (pozisyon, dep_ad) in enumerate(BEYAZ_POZISYON, start=1):
        ad = random.choice(TURK_AD)
        soyad = random.choice(TURK_SOYAD)
        dep = departman_bul(db, dep_ad)
        kisiler.append(models.Personel(
            ad=ad, soyad=soyad, email=eposta(ad, soyad, i),
            telefon=f"05{random.randint(30,55)} {random.randint(100,999)} {random.randint(10,99)} {random.randint(10,99)}",
            departman_id=dep.id, pozisyon=pozisyon,
            yaka=models.Yaka.beyaz, uyruk="TR",
            ise_baslama_tarihi=bugun - timedelta(days=random.randint(30, 1200)),
            maas=random.choice([65000, 75000, 85000, 95000, 120000]),
            durum=models.PersonelDurum.aktif,
        ))

    # ── 40 mavi yaka: çoğu yabancı uyruklu, kamplarda kalır ──
    saha = departman_bul(db, "Saha")
    uyruklar = (["UZ"] * 12 + ["KG"] * 8 + ["TJ"] * 6 + ["TM"] * 4 +
                ["AZ"] * 3 + ["RU"] * 2 + ["TR"] * 5)
    random.shuffle(uyruklar)

    for i, uyruk in enumerate(uyruklar, start=11):
        if uyruk == "TR":
            ad, soyad = random.choice(TURK_AD), random.choice(TURK_SOYAD)
            kimlik = {"tc_kimlik": None}
        else:
            adlar, soyadlar = YABANCI[uyruk]
            ad, soyad = random.choice(adlar), random.choice(soyadlar)
            # YKN: 99 ile başlayan 11 hane
            kimlik = {"yabanci_kimlik_no": f"99{random.randint(10**8, 10**9 - 1)}"}

        p = models.Personel(
            ad=ad, soyad=soyad, email=eposta(ad, soyad, i),
            telefon=f"05{random.randint(30,55)} {random.randint(100,999)} {random.randint(10,99)} {random.randint(10,99)}",
            departman_id=saha.id, pozisyon=random.choice(MAVI_POZISYON),
            yaka=models.Yaka.mavi, uyruk=uyruk,
            ise_baslama_tarihi=bugun - timedelta(days=random.randint(15, 900)),
            maas=random.choice([32000, 36000, 40000, 45000]),
            durum=models.PersonelDurum.aktif,
            **kimlik,
        )
        # Yabancılara çalışma izni; bir kısmının süresi yaklaşsın
        if uyruk != "TR":
            gun = random.choice([20, 45, 120, 200, 300, 400, -5])
            p.calisma_izni_no = f"CI-{bugun.year}-{random.randint(1000, 9999)}"
            p.calisma_izni_bitis = bugun + timedelta(days=gun)
            p.ikamet_izni_no = f"IK-{bugun.year}-{random.randint(1000, 9999)}"
            p.ikamet_izni_bitis = bugun + timedelta(days=gun + 30)
            p.pasaport_no = f"{random.choice('ABCU')}{random.randint(10**6, 10**7 - 1)}"
        kisiler.append(p)

    for k in kisiler:
        if k.email in kullanilan_eposta:
            k.email = k.email.replace("@", f"x@")
        kullanilan_eposta.add(k.email)

    db.add_all(kisiler)
    db.commit()
    for k in kisiler:
        db.refresh(k)
    return kisiler


if __name__ == "__main__":
    db = SessionLocal()
    try:
        if "--temizle" in sys.argv:
            temizle(db)
        else:
            mevcut = db.query(models.Personel).filter(
                models.Personel.email.like("%@demo.local")).count()
            if mevcut:
                print(f"Zaten {mevcut} demo kaydı var. Önce --temizle çalıştırın.")
                sys.exit(1)
            kisiler = olustur(db)
            beyaz = sum(1 for k in kisiler if k.yaka == models.Yaka.beyaz)
            mavi = sum(1 for k in kisiler if k.yaka == models.Yaka.mavi)
            print(f"{len(kisiler)} personel oluşturuldu: {beyaz} beyaz yaka, {mavi} mavi yaka")
    finally:
        db.close()
