"""Oturum ve giriş güvenliği.

İki koruma sağlar:

1. Token kara listesi — çıkış yapıldığında token geçersiz kılınır.
   Öncesinde "çıkış" yalnızca istemcideki tokenı siliyordu; kopyalanmış
   bir token süresi dolana kadar (8 saat) geçerli kalıyordu.

2. Giriş hız sınırı — aynı kullanıcı adı veya IP için art arda başarısız
   denemeler engellenir. Öncesinde parola deneme saldırısına açıktı.

Durum bellekte tutulur; uygulama yeniden başlatılınca sıfırlanır. Tek
süreçli çalışma için yeterlidir, çok süreçli dağıtımda ortak bir depo
(Redis vb.) gerekir.
"""
import time
from collections import defaultdict
from typing import Dict, List

# ─── Token kara listesi ─────────────────────────────────────────────
# token -> tokenın kendi son kullanma zamanı (unix). Süresi geçen
# kayıtlar temizlenir; kara listenin sonsuza dek büyümesi önlenir.
_kara_liste: Dict[str, float] = {}


def token_iptal_et(token: str, bitis_zamani: float) -> None:
    _temizle()
    _kara_liste[token] = bitis_zamani


def token_iptal_mi(token: str) -> bool:
    _temizle()
    return token in _kara_liste


def _temizle() -> None:
    simdi = time.time()
    for t in [t for t, bitis in _kara_liste.items() if bitis < simdi]:
        _kara_liste.pop(t, None)


def kara_liste_boyutu() -> int:
    _temizle()
    return len(_kara_liste)


# ─── Giriş hız sınırı ───────────────────────────────────────────────
DENEME_SINIRI = 5          # kaç başarısız denemeden sonra kilitlenir
PENCERE_SANIYE = 300       # denemelerin sayıldığı süre (5 dakika)
KILIT_SANIYE = 300         # kilit süresi (5 dakika)

_denemeler: Dict[str, List[float]] = defaultdict(list)
_kilitler: Dict[str, float] = {}


def kilitli_mi(anahtar: str) -> int:
    """Kilitliyse kalan saniyeyi, değilse 0 döner."""
    bitis = _kilitler.get(anahtar)
    if not bitis:
        return 0
    kalan = bitis - time.time()
    if kalan <= 0:
        _kilitler.pop(anahtar, None)
        _denemeler.pop(anahtar, None)
        return 0
    return int(kalan)


def basarisiz_deneme(anahtar: str) -> int:
    """Başarısız denemeyi kaydeder; sınır aşılırsa kilitler.

    Kalan deneme hakkını döner (0 ise kilitlendi).
    """
    simdi = time.time()
    kayitlar = [t for t in _denemeler[anahtar] if simdi - t < PENCERE_SANIYE]
    kayitlar.append(simdi)
    _denemeler[anahtar] = kayitlar

    if len(kayitlar) >= DENEME_SINIRI:
        _kilitler[anahtar] = simdi + KILIT_SANIYE
        return 0
    return DENEME_SINIRI - len(kayitlar)


def basarili_giris(anahtar: str) -> None:
    """Başarılı girişte sayaç sıfırlanır."""
    _denemeler.pop(anahtar, None)
    _kilitler.pop(anahtar, None)


def sifirla() -> None:
    """Testler için tüm durumu temizler."""
    _kara_liste.clear()
    _denemeler.clear()
    _kilitler.clear()
