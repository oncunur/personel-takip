// ─── İzin Yönetimi Modülü ──────────────────────────────────────────
const IzinModul = (() => {
  let personeller = [];
  let filtreDurum = '';
  let filtreTur = '';

  const bugun = new Date();
  const yil = bugun.getFullYear();
})();

function hesaplaGun(e) {
  const b = document.querySelector('[name="baslangic_tarihi"]')?.value;
  const s = document.querySelector('[name="bitis_tarihi"]')?.value;
  const el = document.getElementById('gun-hesap');
  if (!el) return;
  if (b && s && s >= b) {
    const gun = gunHesapla(b, s);
    el.textContent = `→ ${gun} iş günü`;
  } else { el.textContent = ''; }
}

function gunHesapla(bas, bit) {
  let toplam = 0;
  const d = new Date(bas);
  const son = new Date(bit);
  while (d <= son) { if (d.getDay() > 0 && d.getDay() < 6) toplam++; d.setDate(d.getDate()+1); }
  return toplam;
}
