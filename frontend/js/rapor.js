// ─── Raporlar Modülü ───────────────────────────────────────────────
const RaporModul = (() => {
  let grafik1 = null, grafik2 = null, grafik3 = null, grafik4 = null;

  const AYLAR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const RENKLER = ['#006CE0','#00802F','#855900','#DB0000','#006CE0','#006CE0','#14B8A6','#F97316'];


  const TUR_ETIKET = { yillik:'Yıllık', mazeret:'Mazeret', hastalik:'Hastalık', ucretsiz:'Ücretsiz', dogum:'Doğum', olum:'Ölüm', diger:'Diğer' };
  const DURUM_RENK = { aktif:'#00802F', izinli:'#855900', pasif:'#8C8C94' };
  const DURUM_ETIKET = { aktif:'Aktif', izinli:'İzinli', pasif:'Pasif' };

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

  function grafikleriTemizle() {
    [grafik1, grafik2, grafik3, grafik4].forEach(g => g && g.destroy());
    grafik1 = grafik2 = grafik3 = grafik4 = null;
  }

  function genelKartlarRender(genel) {
    document.getElementById('rapor-kartlar').innerHTML = `
      <div class="rapor-kart" style="border-top:3px solid var(--primary)">
        <div class="rapor-kart-ikon" style="background:var(--primary-light)">
          <svg viewBox="0 0 20 20" fill="#006CE0"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
        </div>
        <div class="rapor-kart-bilgi">
          <span class="rapor-kart-sayi">${genel.toplam_personel}</span>
          <span class="rapor-kart-label">Toplam Personel</span>
        </div>
      </div>
      <div class="rapor-kart" style="border-top:3px solid #00802F">
        <div class="rapor-kart-ikon" style="background:#EFFFF1">
          <svg viewBox="0 0 20 20" fill="#00802F"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        </div>
        <div class="rapor-kart-bilgi">
          <span class="rapor-kart-sayi">${genel.aktif_personel}</span>
          <span class="rapor-kart-label">Aktif Personel</span>
        </div>
      </div>
      <div class="rapor-kart" style="border-top:3px solid #855900">
        <div class="rapor-kart-ikon" style="background:#FFFEF0">
          <svg viewBox="0 0 20 20" fill="#855900"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
        </div>
        <div class="rapor-kart-bilgi">
          <span class="rapor-kart-sayi">${genel.bekleyen_izin}</span>
          <span class="rapor-kart-label">Bekleyen İzin</span>
        </div>
      </div>
      <div class="rapor-kart" style="border-top:3px solid #006CE0">
        <div class="rapor-kart-ikon" style="background:#F5F3FF">
          <svg viewBox="0 0 20 20" fill="#006CE0"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
        </div>
        <div class="rapor-kart-bilgi">
          <span class="rapor-kart-sayi">${genel.bu_ay_izin}</span>
          <span class="rapor-kart-label">Bu Ay Onaylanan İzin</span>
        </div>
      </div>
    `;
  }

  function grafiklerRender(dep, turDagilim, trend, durumDagilim) {
    // 1) Departman dağılımı — yatay bar
    grafik1 = new Chart(document.getElementById('g-departman'), {
      type: 'bar',
      data: {
        labels: dep.map(d => d.departman),
        datasets: [{ label: 'Personel Sayısı', data: dep.map(d => d.sayi),
          backgroundColor: RENKLER, borderRadius: 6, borderSkipped: false }],
      },
      options: { indexAxis:'y', responsive:true, plugins:{ legend:{display:false} },
        scales:{ x:{ beginAtZero:true, ticks:{stepSize:1} } } },
    });

    // 2) Personel durum dağılımı — doughnut
    const aktifDurum = durumDagilim.filter(d => d.sayi > 0);
    grafik2 = new Chart(document.getElementById('g-durum'), {
      type: 'doughnut',
      data: {
        labels: aktifDurum.map(d => DURUM_ETIKET[d.durum] || d.durum),
        datasets: [{ data: aktifDurum.map(d => d.sayi),
          backgroundColor: aktifDurum.map(d => DURUM_RENK[d.durum] || '#8C8C94'),
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { responsive:true, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, padding:16 } } } },
    });

    // 3) İzin türü dağılımı — doughnut
    grafik3 = new Chart(document.getElementById('g-izintur'), {
      type: 'doughnut',
      data: {
        labels: turDagilim.map(t => TUR_ETIKET[t.tur] || t.tur),
        datasets: [{ data: turDagilim.map(t => t.toplam_gun),
          backgroundColor: RENKLER, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { responsive:true, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, padding:16 } } } },
    });

    // 4) Aylık izin trendi — line
    grafik4 = new Chart(document.getElementById('g-trend'), {
      type: 'line',
      data: {
        labels: AYLAR,
        datasets: [
          { label:'Talep Sayısı', data: trend.map(t => t.talep_sayisi),
            borderColor:'#006CE0', backgroundColor:'rgba(79,110,247,.1)',
            fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#006CE0' },
          { label:'Toplam Gün', data: trend.map(t => t.toplam_gun),
            borderColor:'#00802F', backgroundColor:'rgba(34,197,94,.08)',
            fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#00802F' },
        ],
      },
      options: { responsive:true,
        plugins:{ legend:{ position:'top', labels:{ boxWidth:12, padding:16 } } },
        scales:{ y:{ beginAtZero:true, ticks:{stepSize:1} } } },
    });
  }

  function csvIndir(baslik, satirlar) {
    const bom = '﻿';
    const icerik = bom + satirlar.map(r => r.join(',')).join('\n');
    const blob = new Blob([icerik], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${baslik}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return {
    async yukle() {
      grafikleriTemizle();

      document.getElementById('content-area').innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
          <h3 style="font-size:15px;font-weight:600;color:var(--gray-700)">
            ${new Date().getFullYear()} Yılı Özeti
          </h3>
          <div style="display:flex;gap:8px">
            <button class="btn-export" onclick="RaporModul.exportPersonel()">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              Personel CSV
            </button>
            <button class="btn-export" onclick="RaporModul.exportIzin()">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              İzin CSV
            </button>
          </div>
        </div>

        <!-- Genel kartlar -->
        <div class="rapor-kartlar-grid" id="rapor-kartlar">
          <div style="padding:40px;text-align:center;color:var(--gray-400)">Yükleniyor...</div>
        </div>

        <!-- Grafik satırı 1 -->
        <div class="grafik-grid-2" style="margin-top:20px">
          <div class="panel grafik-panel">
            <div class="panel-header">Departmana Göre Personel</div>
            <div class="grafik-alan"><canvas id="g-departman"></canvas></div>
          </div>
          <div class="panel grafik-panel">
            <div class="panel-header">Personel Durum Dağılımı</div>
            <div class="grafik-alan"><canvas id="g-durum"></canvas></div>
          </div>
        </div>

        <!-- Grafik satırı 2 -->
        <div class="grafik-grid-2" style="margin-top:16px">
          <div class="panel grafik-panel">
            <div class="panel-header">İzin Türü Dağılımı (Onaylanan Gün)</div>
            <div class="grafik-alan"><canvas id="g-izintur"></canvas></div>
          </div>
          <div class="panel grafik-panel">
            <div class="panel-header">Aylık İzin Trendi</div>
            <div class="grafik-alan"><canvas id="g-trend"></canvas></div>
          </div>
        </div>
      `;

      // Paralel API çağrıları
      const [genel, dep, turDagilim, trend, durumDagilim] = await Promise.all([
        apiFetch('/rapor/genel'),
        apiFetch('/rapor/departman-dagilim'),
        apiFetch('/rapor/izin-tur-dagilim'),
        apiFetch('/rapor/aylik-izin-trend'),
        apiFetch('/rapor/personel-durum'),
      ]);

      genelKartlarRender(genel);
      grafiklerRender(
        dep       ,
        turDagilim,
        trend     ,
        durumDagilim,
      );
    },

    async exportPersonel() {
      const data = await apiFetch('/personel?limit=500');
      const liste = data ? data.veriler : [
        { ad:'Ayşe', soyad:'Kaya', email:'ayse@sirket.com', telefon:'0532 111 22 33', departman_ad:'Yazılım', pozisyon:'Kıdemli Geliştirici', durum:'aktif', ise_baslama_tarihi:'2021-03-15' },
        { ad:'Mehmet', soyad:'Demir', email:'mehmet@sirket.com', telefon:'0533 222 33 44', departman_ad:'Yazılım', pozisyon:'Frontend Geliştirici', durum:'aktif', ise_baslama_tarihi:'2022-07-01' },
      ];
      const satirlar = [
        ['Ad', 'Soyad', 'E-posta', 'Telefon', 'Departman', 'Pozisyon', 'Durum', 'İşe Başlama'],
        ...liste.map(p => [p.ad, p.soyad, p.email, p.telefon||'', p.departman_ad||'', p.pozisyon||'', p.durum, p.ise_baslama_tarihi||'']),
      ];
      csvIndir('personel-listesi', satirlar);
    },

    async exportIzin() {
      const data = await apiFetch('/izin?limit=500');
      const liste = data ? data.veriler : [];
      const satirlar = [
        ['Personel', 'Departman', 'İzin Türü', 'Başlangıç', 'Bitiş', 'İş Günü', 'Durum', 'Onaylayan'],
        ...liste.map(t => [t.personel_ad, t.personel_departman||'', t.tur, t.baslangic_tarihi, t.bitis_tarihi, t.gun_sayisi, t.durum, t.onaylayan||'']),
      ];
      csvIndir('izin-raporu', satirlar);
    },
  };
})();
