"""Basit şema güncelleyici.

Proje Alembic kullanmıyor; SQLAlchemy'nin create_all işlevi yalnızca
eksik TABLOLARI oluşturur, var olan tabloya yeni SÜTUN eklemez. Bu
yüzden modele alan eklendiğinde mevcut veritabanı geride kalır.

Buradaki kontrol, modeldeki sütunları veritabanındakilerle karşılaştırır
ve eksik olanları ALTER TABLE ile ekler. Veri silmez, sütun düşürmez,
tür değiştirmez — yalnızca ekleme yapar.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from database import Base


def eksik_sutunlari_ekle(engine: Engine) -> list:
    """Modelde olup veritabanında olmayan sütunları ve indeksleri ekler.

    Eklenen öğeleri "tablo.sutun" ve "indeks:ad" biçiminde döner.
    """
    eklenenler = []

    for tablo_adi, tablo in Base.metadata.tables.items():
        denetci = inspect(engine)
        if not denetci.has_table(tablo_adi):
            continue  # create_all zaten oluşturacak

        mevcut = {s["name"] for s in denetci.get_columns(tablo_adi)}
        for sutun in tablo.columns:
            if sutun.name in mevcut:
                continue

            tur = sutun.type.compile(engine.dialect)
            # Var olan satırlar için NOT NULL eklenemez; sonradan gelen
            # sütunlar her zaman NULL kabul eder.
            with engine.begin() as baglanti:
                baglanti.execute(text(f"ALTER TABLE {tablo_adi} ADD COLUMN {sutun.name} {tur}"))
            eklenenler.append(f"{tablo_adi}.{sutun.name}")

        # ALTER TABLE indeks oluşturmaz. Benzersizlik kısıtları da
        # indeksle sağlandığı için bunlar ayrıca kurulmalıdır; aksi halde
        # unique=True olan bir alan veritabanı düzeyinde korumasız kalır.
        denetci = inspect(engine)
        var_olan = {i["name"] for i in denetci.get_indexes(tablo_adi)}
        for indeks in tablo.indexes:
            if indeks.name in var_olan:
                continue
            try:
                indeks.create(bind=engine)
                eklenenler.append(f"indeks:{indeks.name}")
            except Exception:
                # Yinelenen veri varsa benzersiz indeks kurulamaz;
                # şema denetimi bu yüzden başlangıcı durdurmamalı.
                pass

    return eklenenler
