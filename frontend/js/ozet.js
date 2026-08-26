// ─── Aylık Puantaj & Bordro Özet Modülü ────────────────────────────────────
const OzetModul = (() => {
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  let secilenYil = new Date().getFullYear();
  let secilenAy  = new Date().getMonth() + 1;

  const DURUM_RENK  = { taslak:'#855900', onaylandi:'#006CE0', odendi:'#00802F' };
  const DURUM_METIN = { taslak:'Taslak', onaylandi:'Onaylandı', odendi:'Ödendi' };


  function tl(n) {
    if (n == null) return '—';
    return '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  async function apiFetch(url) {
    const token = Auth.getToken();
    let res;
    try {
      res = await fetch('http://localhost:8000' + url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
    } catch (e) {
      throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(hataMetni(e));
    }
    return res.json();
  }

  function durumBadge(durum) {
    if (!durum) return `<span style="font-size:11px;color:var(--gray-400)">Bordro Yok</span>`;
    return `<span class="izin-badge" style="background:${DURUM_RENK[durum]}20;color:${DURUM_RENK[durum]}">${DURUM_METIN[durum]}</span>`;
  }

  function toplamSatir(veriler) {
    const calisilan = veriler.reduce((a,v) => a + (v.calisilan_gun||0), 0);
    const devamsiz  = veriler.reduce((a,v) => a + (v.devamsiz_gun||0), 0);
    const izinli    = veriler.reduce((a,v) => a + (v.izinli_gun||0), 0);
    const fm        = veriler.reduce((a,v) => a + (v.fazla_mesai||0), 0);
    const brutTop   = veriler.reduce((a,v) => a + (v.brut_maas||0), 0);
    const kesTop    = veriler.reduce((a,v) => a + ((v.sgk_isci||0)+(v.issizlik_isci||0)+(v.gelir_vergisi||0)+(v.damga_vergisi||0)), 0);
    const netTop    = veriler.reduce((a,v) => a + (v.net_maas||0), 0);
    const bordroSayisi = veriler.filter(v => v.bordro_id).length;
    return `
      <tr class="ozet-toplam-satir">
        <td colspan="3">
          <strong>Toplam</strong>
          <span style="font-size:11px;color:var(--gray-400);margin-left:8px">${veriler.length} personel · ${bordroSayisi} bordro</span>
        </td>
        <td class="ozet-sayi" style="color:#00802F;font-weight:700">${calisilan}</td>
        <td class="ozet-sayi" style="color:#DB0000;font-weight:700">${devamsiz||'—'}</td>
        <td class="ozet-sayi" style="color:#006CE0;font-weight:700">${izinli||'—'}</td>
        <td class="ozet-sayi" style="color:#855900;font-weight:700">${fm > 0 ? fm + 's' : '—'}</td>
        <td class="ozet-sayi"><strong>${tl(brutTop||null)}</strong></td>
        <td class="ozet-sayi" style="color:#DB0000"><strong>${tl(kesTop||null)}</strong></td>
        <td class="ozet-sayi" style="color:#00802F"><strong>${tl(netTop||null)}</strong></td>
        <td></td>
      </tr>`;
  }

  function tabloRender(veriler) {
    const wrap = document.getElementById('ozet-tablo-wrap');
    if (!veriler.length) {
      wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--gray-400)">Bu dönemde aktif personel bulunamadı.</div>`;
      return;
    }

    const satirlar = veriler.map(v => {
      const kesinti = v.brut_maas
        ? (v.sgk_isci||0)+(v.issizlik_isci||0)+(v.gelir_vergisi||0)+(v.damga_vergisi||0)
        : null;
      return `
        <tr>
          <td><strong style="color:var(--gray-800)">${v.ad} ${v.soyad}</strong></td>
          <td><span style="font-size:12px;color:var(--gray-500)">${v.departman||'—'}</span></td>
          <td style="font-size:12px;color:var(--gray-500)">${v.pozisyon||'—'}</td>
          <td class="ozet-sayi" style="color:#00802F;font-weight:600">${v.calisilan_gun}</td>
          <td class="ozet-sayi ${v.devamsiz_gun > 0 ? 'ozet-devamsiz' : 'ozet-sifir'}">${v.devamsiz_gun > 0 ? v.devamsiz_gun : '—'}</td>
          <td class="ozet-sayi ${v.izinli_gun > 0 ? 'ozet-izinli' : 'ozet-sifir'}">${v.izinli_gun > 0 ? v.izinli_gun : '—'}</td>
          <td class="ozet-sayi ${v.fazla_mesai > 0 ? 'ozet-fm' : 'ozet-sifir'}">${v.fazla_mesai > 0 ? v.fazla_mesai + 's' : '—'}</td>
          <td class="ozet-sayi">${tl(v.brut_maas)}</td>
          <td class="ozet-sayi" style="${kesinti ? 'color:#DB0000' : ''}">${tl(kesinti)}</td>
          <td class="ozet-sayi" style="${v.net_maas ? 'color:#00802F;font-weight:600' : ''}">${tl(v.net_maas)}</td>
          <td style="text-align:center">${durumBadge(v.bordro_durum)}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="ozet-tablo">
        <thead>
          <tr class="ozet-baslik-ust">
            <th rowspan="2" style="text-align:left;min-width:140px">Personel</th>
            <th rowspan="2" style="text-align:left;min-width:120px">Departman</th>
            <th rowspan="2" style="text-align:left;min-width:140px">Pozisyon</th>
            <th colspan="4" class="ozet-grup-puantaj">Puantaj</th>
            <th colspan="4" class="ozet-grup-bordro">Bordro</th>
          </tr>
          <tr class="ozet-baslik-alt">
            <th>Çal. Gün</th><th>Devamsız</th><th>İzinli</th><th>FM (s)</th>
            <th>Brüt Maaş</th><th>Kesintiler</th><th>Net Maaş</th><th>Durum</th>
          </tr>
        </thead>
        <tbody>
          ${satirlar}
          ${toplamSatir(veriler)}
        </tbody>
      </table>`;
  }

  async function yukleVeRender() {
    document.getElementById('ozet-tablo-wrap').innerHTML =
      `<div style="padding:48px;text-align:center;color:var(--gray-400)">Yükleniyor…</div>`;
    document.getElementById('ozet-donem-lbl').textContent = `${AYLAR[secilenAy-1]} ${secilenYil}`;
    const data = await apiFetch(`/ozet/aylik?yil=${secilenYil}&ay=${secilenAy}`);
    tabloRender(data.veriler);
  }

  return {
    async yukle() {
      document.getElementById('content-area').innerHTML = `
        <div class="personel-toolbar" style="flex-wrap:wrap;gap:12px;align-items:center">
          <div style="display:flex;align-items:center;gap:8px">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="color:var(--primary)">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" fill="currentColor"/>
            </svg>
            <span style="font-weight:700;color:var(--gray-800)" id="ozet-donem-lbl"></span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <label style="font-size:13px;color:var(--gray-500)">Dönem:</label>
            <select id="ozet-ay-sec" class="filtre-select">
              ${AYLAR.map((a,i) => `<option value="${i+1}" ${i+1===secilenAy?'selected':''}>${a}</option>`).join('')}
            </select>
            <select id="ozet-yil-sec" class="filtre-select">
              ${[2023,2024,2025,2026].map(y => `<option ${y===secilenYil?'selected':''}>${y}</option>`).join('')}
            </select>
            <button class="btn-export" onclick="OzetModul.exportCSV()">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              CSV İndir
            </button>
          </div>
        </div>

        <div class="panel" style="padding:0;overflow-x:auto">
          <div id="ozet-tablo-wrap"></div>
        </div>`;

      document.getElementById('ozet-ay-sec').addEventListener('change', e => {
        secilenAy = parseInt(e.target.value); yukleVeRender();
      });
      document.getElementById('ozet-yil-sec').addEventListener('change', e => {
        secilenYil = parseInt(e.target.value); yukleVeRender();
      });

      yukleVeRender();
    },

    async exportCSV() {
      const data = await apiFetch(`/ozet/aylik?yil=${secilenYil}&ay=${secilenAy}`);
      const veriler = data.veriler;
      const baslik = ['Ad Soyad','Departman','Pozisyon','Çalışılan Gün','Devamsız','İzinli','FM (s)','Brüt Maaş','Kesintiler','Net Maaş','Bordro Durum'];
      const satirlar = [baslik, ...veriler.map(v => {
        const kes = v.brut_maas ? ((v.sgk_isci||0)+(v.issizlik_isci||0)+(v.gelir_vergisi||0)+(v.damga_vergisi||0)).toFixed(2) : '';
        return [`${v.ad} ${v.soyad}`, v.departman||'', v.pozisyon||'',
          v.calisilan_gun, v.devamsiz_gun, v.izinli_gun, v.fazla_mesai,
          v.brut_maas||'', kes, v.net_maas||'', DURUM_METIN[v.bordro_durum]||'Bordro Yok'];
      })];
      const icerik = '﻿' + satirlar.map(r => r.join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([icerik], { type:'text/csv;charset=utf-8;' }));
      a.download = `aylik-ozet-${secilenYil}-${String(secilenAy).padStart(2,'0')}.csv`;
      a.click();
    },
  };
})();
