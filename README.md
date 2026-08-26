# Personel ve İdari İşler Sistemi

FastAPI tabanlı backend ve saf HTML/CSS/JS frontend ile çalışan, personel ve idari
işler takip uygulaması.

## Modüller

**Personel**: personel kayıtları, izin yönetimi, puantaj, bordro, raporlar, özet panosu

**İdari işler**: konaklama, demirbaş, araç, evrak, satın alma, stok, ziyaretçi

## Kurulum

Python 3.10+ gerekir.

```bash
pip install -r backend/requirements.txt
```

Ortam değişkenlerini hazırlayın:

```bash
cp backend/.env.example backend/.env
```

Ardından `backend/.env` içindeki `SECRET_KEY` değerini kendi anahtarınızla değiştirin:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`SECRET_KEY` tanımlı değilse uygulama açık bir hata mesajıyla başlamaz.

## Çalıştırma

```bash
./start.sh
```

| Servis | Adres |
| --- | --- |
| Frontend | http://localhost:5500 |
| Backend | http://localhost:8000 |
| API dokümantasyonu | http://localhost:8000/docs |

Backend'i tek başına çalıştırmak için:

```bash
cd backend && python3 -m uvicorn main:app --reload --port 8000
```

## İlk giriş

Veritabanı ilk açılışta otomatik oluşturulur ve varsayılan bir yönetici hesabı eklenir:

- Kullanıcı adı: `admin`
- Parola: `Admin1234!`

**Bu parolayı ilk girişten sonra mutlaka değiştirin.**

## Proje yapısı

```
backend/
  main.py          FastAPI uygulaması, router kayıtları, başlangıç görevleri
  models.py        SQLAlchemy modelleri
  schemas.py       Pydantic şemaları
  database.py      Veritabanı bağlantısı ve oturum yönetimi
  auth.py          JWT üretimi/doğrulaması ve parola hash'leme
  routers/         Modül bazlı API uç noktaları
frontend/
  index.html       Tek sayfa arayüz
  css/             Stiller
  js/              Modül bazlı arayüz mantığı
start.sh           Backend ve frontend'i birlikte başlatır
```

## Veri ve gizlilik

`backend/personel.db` ve `backend/.env` bilerek sürüm kontrolü dışında tutulmuştur
(`.gitignore`). Veritabanı gerçek personel verisi içerdiğinden depoya eklenmemelidir.

## Teknolojiler

FastAPI · SQLAlchemy · SQLite · python-jose (JWT) · passlib/bcrypt · Uvicorn
