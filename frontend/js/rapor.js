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

  const YAKA_RENK = { beyaz: '#006CE0', mavi: '#855900' };

  // Tek kategorili donut anlamsız duruyordu; veri yoksa grafik yerine not
  function bosGrafik(id, mesaj) {
    const c = document.getElementById(id);
    if (c) c.parentElement.innerHTML =
      `<div class="grafik-bos">${Ortak.kacir(mesaj)}</div>`;
  }

  function grafikleriTemizle() {
    [grafik1, grafik2, grafik3, grafik4].forEach(g => g && g.destroy());
    grafik1 = grafik2 = grafik3 = grafik4 = null;
  }

  function genelKartlarRender(genel) {
    // Toplam ve aktif personel çoğu zaman aynı sayı; ikisini ayrı kart
    // yapmak yerine pasifi aktif kartının alt bilgisi olarak veriyoruz.
    const pasif = genel.toplam_personel - genel.aktif_personel;
    document.getElementById('rapor-kartlar').innerHTML = Ortak.statGrid([
      { label: 'Aktif Personel', deger: genel.aktif_personel,
        alt: pasif ? `${pasif} pasif · ${genel.toplam_personel} toplam` : 'tamamı aktif',
        renk: '#00802F' },
      { label: 'Bekleyen İzin', deger: genel.bekleyen_izin,
        alt: genel.bekleyen_izin ? 'onay bekliyor' : 'bekleyen yok',
        renk: genel.bekleyen_izin ? '#855900' : '#8C8C94' },
      { label: 'Bu Ay Onaylanan İzin', deger: genel.bu_ay_izin, alt: 'izin talebi', renk: '#006CE0' },
    ]);
  }

  function grafiklerRender(dep, turDagilim, trend, yakaDagilim) {
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

    // 2) Yaka dağılımı — doughnut. Durum dağılımı neredeyse hep tek dilim
    // (%100 aktif) çıkıyordu; beyaz/mavi ayrımı gerçek bir kırılım.
    const yakalar = (yakaDagilim || []).filter(d => d.sayi > 0);
    if (yakalar.length) {
      grafik2 = new Chart(document.getElementById('g-durum'), {
        type: 'doughnut',
        data: {
          labels: yakalar.map(d => d.etiket),
          datasets: [{ data: yakalar.map(d => d.sayi),
            backgroundColor: yakalar.map(d => YAKA_RENK[d.yaka] || '#8C8C94'),
            borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
        },
        options: { responsive:true, cutout:'65%',
          plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, padding:16 } } } },
      });
    } else {
      bosGrafik('g-durum', 'Yaka bilgisi girilmemiş');
    }

    // 3) İzin türü dağılımı — doughnut
    if (!turDagilim.length) { bosGrafik('g-izintur', 'Onaylanmış izin yok'); }
    else grafik3 = new Chart(document.getElementById('g-izintur'), {
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
        <div id="rapor-kartlar">
          <div style="padding:40px;text-align:center;color:var(--gray-400)">Yükleniyor...</div>
        </div>

        <!-- Grafik satırı 1 -->
        <div class="grafik-grid-2" style="margin-top:20px">
          <div class="panel grafik-panel">
            <div class="panel-header">Departmana Göre Personel</div>
            <div class="grafik-alan"><canvas id="g-departman"></canvas></div>
          </div>
          <div class="panel grafik-panel">
            <div class="panel-header">Yaka Dağılımı</div>
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
      const [genel, dep, turDagilim, trend, yakaDagilim] = await Promise.all([
        apiFetch('/rapor/genel'),
        apiFetch('/rapor/departman-dagilim'),
        apiFetch('/rapor/izin-tur-dagilim'),
        apiFetch('/rapor/aylik-izin-trend'),
        apiFetch('/rapor/yaka-dagilim'),
      ]);

      genelKartlarRender(genel);
      grafiklerRender(dep, turDagilim, trend, yakaDagilim);
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
