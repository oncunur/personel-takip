"""Çok uluslu personel kimlik alanları testleri."""
import kimlik
import models
import pytest


# ─── TC kimlik algoritması ───────────────────────────────────────────

@pytest.mark.parametrize("no", ["10000000146", "11111111110", "19191919190"])
def test_gecerli_tc_kabul_edilir(no):
    assert kimlik.tc_kimlik_gecerli(no) is True


@pytest.mark.parametrize("no,neden", [
    ("12345678901", "doğrulama basamakları tutmuyor"),
    ("1234567890", "10 hane"),
    ("123456789012", "12 hane"),
    ("01234567890", "sıfırla başlıyor"),
    ("abcdefghijk", "harf içeriyor"),
    ("", "boş"),
])
def test_gecersiz_tc_reddedilir(no, neden):
    assert kimlik.tc_kimlik_gecerli(no) is False, neden


# ─── YKN ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("no,beklenen", [
    ("99123456780", True),
    ("99000000000", True),
    ("12345678901", False),   # 99 ile başlamıyor
    ("9912345678", False),    # 10 hane
    ("99abcdefghi", False),
])
def test_ykn_bicimi(no, beklenen):
    assert kimlik.ykn_gecerli(no) is beklenen


# ─── Pasaport ────────────────────────────────────────────────────────

@pytest.mark.parametrize("no,beklenen", [
    ("AA1234567", True), ("U12345678", True), ("123456", True),
    ("AB12", False),                       # çok kısa
    ("A" * 21, False),                     # çok uzun
    ("AB-123456", False),                  # tire
])
def test_pasaport_bicimi(no, beklenen):
    assert kimlik.pasaport_gecerli(no) is beklenen


# ─── Uç noktalar ─────────────────────────────────────────────────────

def test_ulke_listesi(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/personel/ulkeler", headers=token("mudur")).json()
    kodlar = {u["kod"] for u in d}
    # Şirkette sık karşılaşılan uyruklar listede olmalı
    for beklenen in ("TR", "UZ", "KG", "TJ", "TM", "RU", "BY", "AZ"):
        assert beklenen in kodlar, f"{beklenen} listede yok"
    assert next(u["ad"] for u in d if u["kod"] == "UZ") == "Özbekistan"


def test_yabanci_personel_kaydi(client, token, kullanici_olustur):
    """Özbek bir çalışan: YKN + pasaport, TC yok."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com",
        "uyruk": "UZ", "yabanci_kimlik_no": "99123456780",
        "pasaport_no": "AB1234567", "pasaport_gecerlilik": "2030-05-01",
    })
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["uyruk"] == "UZ" and d["uyruk_ad"] == "Özbekistan"
    assert d["yabanci_kimlik_no"] == "99123456780"
    assert d["pasaport_no"] == "AB1234567"
    assert d["tc_kimlik"] is None


def test_turk_personel_kaydi(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "tc_kimlik": "10000000146",
    })
    assert r.status_code == 201
    assert r.json()["tc_kimlik"] == "10000000146"


def test_gecersiz_tc_reddedilir_uctan(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Ali", "soyad": "Veli", "email": "ali@sirket.com",
        "tc_kimlik": "12345678901",
    })
    assert r.status_code == 422
    assert "TC kimlik" in r.text


def test_gecersiz_ykn_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Ali", "soyad": "Veli", "email": "ali@sirket.com",
        "yabanci_kimlik_no": "12345678901",
    })
    assert r.status_code == 422


def test_gecersiz_uyruk_reddedilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Ali", "soyad": "Veli", "email": "ali@sirket.com", "uyruk": "ZZ",
    })
    assert r.status_code == 422


def test_bos_kimlik_alanlari_none_olur(client, token, kullanici_olustur):
    """Boş metinler None'a çevrilmeli; aksi halde benzersizlik kısıtı çakışır."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    for i in (1, 2):
        r = client.post("/personel", headers=h, json={
            "ad": f"Kisi{i}", "soyad": "Test", "email": f"kisi{i}@sirket.com",
            "tc_kimlik": "", "yabanci_kimlik_no": "", "pasaport_no": "",
        })
        assert r.status_code == 201, r.text
        assert r.json()["tc_kimlik"] is None


def test_ayni_tc_ikinci_kez_400_verir(client, token, kullanici_olustur):
    """Daha önce 500 dönüyordu; artık anlamlı hata mesajı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    client.post("/personel", headers=h, json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "tc_kimlik": "10000000146"})
    r = client.post("/personel", headers=h, json={
        "ad": "Baska", "soyad": "Kisi", "email": "baska@sirket.com",
        "tc_kimlik": "10000000146"})
    assert r.status_code == 400
    assert "TC kimlik" in r.json()["detail"]


def test_ayni_ykn_ikinci_kez_400_verir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    client.post("/personel", headers=h, json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com",
        "yabanci_kimlik_no": "99123456780"})
    r = client.post("/personel", headers=h, json={
        "ad": "Baska", "soyad": "Kisi", "email": "baska@sirket.com",
        "yabanci_kimlik_no": "99123456780"})
    assert r.status_code == 400
    assert "yabancı kimlik" in r.json()["detail"].lower()


def test_kimlik_numaralari_hassas_alan(client, token, kullanici_olustur, db_session):
    """Personel rolü başkasının kimlik numaralarını görememeli."""
    db_session.add(models.Personel(
        ad="Aziz", soyad="Karimov", email="aziz@sirket.com", uyruk="UZ",
        yabanci_kimlik_no="99123456780", pasaport_no="AB1234567"))
    db_session.commit()

    kullanici_olustur("ayse", models.Rol.personel)
    d = client.get("/personel", headers=token("ayse")).json()
    kayit = next(v for v in d["veriler"] if v["email"] == "aziz@sirket.com")
    assert kayit["yabanci_kimlik_no"] is None
    assert kayit["pasaport_no"] is None
    assert kayit["uyruk"] == "UZ"          # uyruk rehber bilgisi, gizlenmez


def test_kendi_kimligini_gorur(client, token, kullanici_olustur, db_session):
    db_session.add(models.Personel(
        ad="Aziz", soyad="Karimov", email="aziz@sirket.com", uyruk="UZ",
        yabanci_kimlik_no="99123456780"))
    db_session.commit()
    kullanici_olustur("aziz", models.Rol.personel, email="aziz@sirket.com")
    d = client.get("/personel", headers=token("aziz")).json()
    kayit = next(v for v in d["veriler"] if v["email"] == "aziz@sirket.com")
    assert kayit["yabanci_kimlik_no"] == "99123456780"


# ─── Arama ve süzme ──────────────────────────────────────────────────

@pytest.fixture()
def cok_uluslu_ekip(db_session):
    kisiler = [
        models.Personel(ad="Aziz", soyad="Karimov", email="aziz@sirket.com",
                        uyruk="UZ", yabanci_kimlik_no="99123456780", pasaport_no="AB1234567"),
        models.Personel(ad="Nurlan", soyad="Bekov", email="nurlan@sirket.com",
                        uyruk="KG", yabanci_kimlik_no="99123456781"),
        models.Personel(ad="Kemal", soyad="Yilmaz", email="kemal@sirket.com",
                        uyruk="TR", tc_kimlik="10000000146"),
    ]
    db_session.add_all(kisiler)
    db_session.commit()
    return kisiler


def test_uyruga_gore_suzme(client, token, kullanici_olustur, cok_uluslu_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    d = client.get("/personel?uyruk=UZ", headers=token("mudur")).json()
    assert [v["ad"] for v in d["veriler"]] == ["Aziz"]

    d = client.get("/personel?uyruk=TR", headers=token("mudur")).json()
    assert [v["ad"] for v in d["veriler"]] == ["Kemal"]


def test_yonetici_kimlik_numarasiyla_arayabilir(client, token, kullanici_olustur, cok_uluslu_ekip):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")

    d = client.get("/personel?arama=99123456780", headers=h).json()
    assert [v["ad"] for v in d["veriler"]] == ["Aziz"]

    d = client.get("/personel?arama=AB1234567", headers=h).json()
    assert [v["ad"] for v in d["veriler"]] == ["Aziz"]

    d = client.get("/personel?arama=10000000146", headers=h).json()
    assert [v["ad"] for v in d["veriler"]] == ["Kemal"]


def test_personel_rolu_kimlik_numarasiyla_arayamaz(client, token, kullanici_olustur, cok_uluslu_ekip):
    """Görmediği bir alan üzerinden arama yaparak varlığını doğrulayamamalı."""
    kullanici_olustur("ayse", models.Rol.personel)
    d = client.get("/personel?arama=99123456780", headers=token("ayse")).json()
    assert d["toplam"] == 0


def test_ad_aramasi_herkese_acik(client, token, kullanici_olustur, cok_uluslu_ekip):
    kullanici_olustur("ayse", models.Rol.personel)
    d = client.get("/personel?arama=Karimov", headers=token("ayse")).json()
    assert [v["ad"] for v in d["veriler"]] == ["Aziz"]


# ─── Şema güncelleyici ───────────────────────────────────────────────

def test_sema_guncelleyici_eksik_sutunu_ekler(db_session):
    """Alembic yok; modele eklenen sütun mevcut tabloya yansımalı."""
    import sema
    from sqlalchemy import inspect, text

    engine = db_session.get_bind()
    # pasaport_gecerlilik indekssizdir; indeksli sütun düşürmek SQLite'ta
    # indeksi bozar, bu yüzden denetim için o alan kullanılır.
    with engine.begin() as b:
        b.execute(text("ALTER TABLE personeller DROP COLUMN pasaport_gecerlilik"))
    assert "pasaport_gecerlilik" not in {s["name"] for s in inspect(engine).get_columns("personeller")}

    eklenen = sema.eksik_sutunlari_ekle(engine)
    assert "personeller.pasaport_gecerlilik" in eklenen
    assert "pasaport_gecerlilik" in {s["name"] for s in inspect(engine).get_columns("personeller")}


def test_sema_guncelleyici_benzersiz_indeksi_kurar(db_session):
    """unique=True alanlar veritabanı düzeyinde de korunmalı."""
    import sema
    from sqlalchemy import inspect, text

    engine = db_session.get_bind()
    with engine.begin() as b:
        b.execute(text("DROP INDEX IF EXISTS ix_personeller_yabanci_kimlik_no"))
    assert "ix_personeller_yabanci_kimlik_no" not in {
        i["name"] for i in inspect(engine).get_indexes("personeller")}

    eklenen = sema.eksik_sutunlari_ekle(engine)
    assert "indeks:ix_personeller_yabanci_kimlik_no" in eklenen

    indeksler = {i["name"]: i for i in inspect(engine).get_indexes("personeller")}
    # SQLite bu alanı 1 olarak döndürür, sürücüye göre True da olabilir
    assert bool(indeksler["ix_personeller_yabanci_kimlik_no"]["unique"])


# ─── Uyruk ile kimlik türü uyumu ─────────────────────────────────────

@pytest.mark.parametrize("uyruk,tc,ykn,gecerli", [
    ("TR", "10000000146", None, True),          # Türk + TC
    ("TR", None, "99123456780", False),         # Türk + YKN yasak
    ("UZ", None, "99123456780", True),          # Yabancı + YKN
    ("UZ", "10000000146", None, False),         # Yabancı + TC yasak
    ("RU", "10000000146", "99123456780", False),
    (None, "10000000146", None, True),          # uyruk yoksa denetim yok
])
def test_kimlik_kurali(uyruk, tc, ykn, gecerli):
    hata = kimlik.kimlik_kurali_hatasi(uyruk, tc, ykn)
    assert (hata is None) is gecerli


def test_yabanciya_tc_girilemez(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com",
        "uyruk": "UZ", "tc_kimlik": "10000000146"})
    assert r.status_code == 422
    assert "TC kimlik numarası girilemez" in r.text


def test_turke_ykn_girilemez(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "yabanci_kimlik_no": "99123456780"})
    assert r.status_code == 422
    assert "yabancı kimlik numarası girilemez" in r.text.lower()


def test_dogru_eslesmeler_kabul_edilir(client, token, kullanici_olustur):
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    assert client.post("/personel", headers=h, json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "tc_kimlik": "10000000146"}).status_code == 201
    assert client.post("/personel", headers=h, json={
        "ad": "Aziz", "soyad": "Karimov", "email": "aziz@sirket.com",
        "uyruk": "UZ", "yabanci_kimlik_no": "99123456780"}).status_code == 201


def test_uyruk_degistirince_eski_kimlik_kurali_bozarsa_reddedilir(
        client, token, kullanici_olustur, db_session):
    """Yalnızca uyruk güncellenirken kayıttaki TC kural dışı kalmamalı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    olustur = client.post("/personel", headers=h, json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "tc_kimlik": "10000000146"})
    pid = olustur.json()["id"]

    # Uyruğu Özbekistan'a çevirmek, kayıtlı TC ile çelişir
    r = client.put(f"/personel/{pid}", headers=h, json={"uyruk": "UZ"})
    assert r.status_code == 400
    assert "TC kimlik numarası girilemez" in r.json()["detail"]

    # Kayıt bozulmamış olmalı
    d = client.get(f"/personel/{pid}", headers=h).json()
    assert d["uyruk"] == "TR" and d["tc_kimlik"] == "10000000146"


def test_uyruk_ve_kimlik_birlikte_degistirilebilir(client, token, kullanici_olustur):
    """TC silinip YKN verilerek uyruk değişimi mümkün olmalı."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    h = token("mudur")
    pid = client.post("/personel", headers=h, json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "tc_kimlik": "10000000146"}).json()["id"]

    r = client.put(f"/personel/{pid}", headers=h, json={
        "uyruk": "UZ", "tc_kimlik": None, "yabanci_kimlik_no": "99123456780"})
    assert r.status_code == 200, r.text
    assert r.json()["uyruk"] == "UZ"
    assert r.json()["yabanci_kimlik_no"] == "99123456780"


def test_pasaport_her_uyrukta_girilebilir(client, token, kullanici_olustur):
    """Pasaport kısıtlamaya tabi değil; Türk vatandaşının da pasaportu olabilir."""
    kullanici_olustur("mudur", models.Rol.yonetici)
    r = client.post("/personel", headers=token("mudur"), json={
        "ad": "Kemal", "soyad": "Yilmaz", "email": "kemal@sirket.com",
        "uyruk": "TR", "tc_kimlik": "10000000146", "pasaport_no": "U12345678"})
    assert r.status_code == 201
    assert r.json()["pasaport_no"] == "U12345678"
