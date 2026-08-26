#!/bin/bash
echo "Personel ve İdari İşler Sistemi başlatılıyor..."

# Backend
echo "→ Backend başlatılıyor (port 8000)..."
cd "$(dirname "$0")/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 2

# Frontend
echo "→ Frontend başlatılıyor (port 5500)..."
cd "$(dirname "$0")/frontend"
python3 -m http.server 5500 &
FRONTEND_PID=$!

echo ""
echo "✓ Sistem hazır!"
echo "  Frontend : http://localhost:5500"
echo "  Backend  : http://localhost:8000"
echo "  API Docs : http://localhost:8000/docs"
echo ""
echo "Durdurmak için Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Durduruldu.'" EXIT
wait
