"""CORS yalnızca yerel adreslere açık olmalı.

Safari localhost'u ::1'e çözdüğü için Origin "http://[::1]:5500" gelebiliyor;
uygulama yerel ağdaki başka bir cihazdan da açılabiliyor. Buna karşılık
internete açık adresler kabul edilmemeli.
"""
import pytest


def _origin(client, kaynak):
    r = client.get("/", headers={"Origin": kaynak})
    return r.headers.get("access-control-allow-origin")


@pytest.mark.parametrize("kaynak", [
    "http://localhost:5500",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://[::1]:5500",          # Safari
    "http://192.168.1.42:5500",   # yerel ağ — telefon
    "http://10.0.0.5:5500",
    "http://172.16.3.9:5500",
])
def test_yerel_kaynaklar_kabul_edilir(client, kaynak):
    assert _origin(client, kaynak) == kaynak


@pytest.mark.parametrize("kaynak", [
    "http://kotu-site.com",
    "http://localhost.kotu-site.com",     # sonek kaçağı
    "http://127.0.0.1.kotu-site.com",
    "http://172.32.0.1:5500",             # özel aralık dışı
    "http://11.0.0.1:5500",
])
def test_disaridan_gelen_kaynaklar_reddedilir(client, kaynak):
    assert _origin(client, kaynak) != kaynak
