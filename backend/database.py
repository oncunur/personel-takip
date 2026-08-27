import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Veritabanı dosyası her zaman backend/ içinde durur. Göreli yol
# ("sqlite:///./personel.db") sunucunun hangi dizinden başlatıldığına
# bağlıydı; proje kökünden başlatılınca boş bir dosya açılıyor ve tüm
# veriler kaybolmuş gibi görünüyordu. yedek.py zaten mutlak yol
# kullandığı için yedekleme ile uygulama farklı dosyalara bakabiliyordu.
VERITABANI = Path(__file__).resolve().parent / "personel.db"
DATABASE_URL = os.getenv("VERITABANI_URL", f"sqlite:///{VERITABANI}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
