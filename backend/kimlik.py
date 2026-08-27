"""Kimlik numarası doğrulama ve uyruk listesi.

Şirkette çok uluslu çalışanlar bulunduğu için kimlik bilgisi üç
biçimde tutulabilir:

- TC kimlik numarası — Türk vatandaşları (11 hane, algoritma denetimli)
- YKN (yabancı kimlik numarası) — Türkiye'de ikamet izni alan
  yabancılara verilir, 99 ile başlayan 11 hanedir
- Pasaport numarası — ülkeye göre biçimi değiştiği için yalnızca
  uzunluk ve karakter denetimi yapılır
"""
from typing import Optional


# ─── Uyruklar ───────────────────────────────────────────────────────
# ISO 3166-1 alfa-2 kodu -> Türkçe ülke adı.
# Şirkette sık karşılaşılan ülkeler listenin başında tutulur.
ULKELER: dict = {
    "TR": "Türkiye",
    # Orta Asya ve Kafkaslar
    "UZ": "Özbekistan",
    "KG": "Kırgızistan",
    "TJ": "Tacikistan",
    "TM": "Türkmenistan",
    "KZ": "Kazakistan",
    "AZ": "Azerbaycan",
    "GE": "Gürcistan",
    "AM": "Ermenistan",
    # Doğu Avrupa
    "RU": "Rusya",
    "BY": "Belarus",
    "UA": "Ukrayna",
    "MD": "Moldova",
    "BG": "Bulgaristan",
    "RO": "Romanya",
    # Orta Doğu ve Güney Asya
    "SY": "Suriye",
    "IQ": "Irak",
    "IR": "İran",
    "AF": "Afganistan",
    "PK": "Pakistan",
    "IN": "Hindistan",
    "BD": "Bangladeş",
    # Diğer
    "DE": "Almanya",
    "NL": "Hollanda",
    "GB": "Birleşik Krallık",
    "CN": "Çin",
    "XX": "Diğer",
}


def ulke_adi(kod: Optional[str]) -> Optional[str]:
    return ULKELER.get(kod) if kod else None


# ─── TC kimlik numarası ─────────────────────────────────────────────

def tc_kimlik_gecerli(no: str) -> bool:
    """TC kimlik numarasının resmi doğrulama algoritmasını uygular.

    Kurallar: 11 hane, tamamı rakam, ilk hane sıfır olamaz.
    10. hane = (tek sıraların toplamı * 7 - çift sıraların toplamı) mod 10
    11. hane = ilk on hanenin toplamı mod 10
    """
    if not no or len(no) != 11 or not no.isdigit() or no[0] == "0":
        return False

    haneler = [int(k) for k in no]
    tekler = sum(haneler[0:9:2])    # 1., 3., 5., 7., 9. haneler
    ciftler = sum(haneler[1:8:2])   # 2., 4., 6., 8. haneler

    onuncu = (tekler * 7 - ciftler) % 10
    onbirinci = sum(haneler[:10]) % 10
    return haneler[9] == onuncu and haneler[10] == onbirinci


# ─── Yabancı kimlik numarası (YKN) ──────────────────────────────────

def ykn_gecerli(no: str) -> bool:
    """YKN biçim denetimi: 11 hane ve 99 ile başlar.

    YKN'nin basamak doğrulama algoritması kamuya açık olarak
    yayımlanmadığı için yalnızca biçim denetlenir.
    """
    return bool(no) and len(no) == 11 and no.isdigit() and no.startswith("99")


# ─── Pasaport ───────────────────────────────────────────────────────

def pasaport_gecerli(no: str) -> bool:
    """Pasaport numarası biçimi ülkeden ülkeye değişir.

    Ortak payda: 5–20 karakter, yalnızca harf ve rakam.
    """
    if not no:
        return False
    temiz = no.replace(" ", "")
    return 5 <= len(temiz) <= 20 and temiz.isalnum()
