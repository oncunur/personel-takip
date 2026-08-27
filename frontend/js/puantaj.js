// ─── Puantaj Modülü ────────────────────────────────────────────────
// Aylık cetvel: satırlar personel, sütunlar ayın günleri. Hücreye
// tıklayınca durum sırayla değişir, çift tıklayınca gün detayı açılır.
const PuantajModul = (() => {
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const GUN_KISA = ['Pz','Pt','Sa','Ça','Pe','Cu','Ct'];

  let secilenYil = new Date().getFullYear();
  let secilenAy  = new Date().getMonth() + 1;
  let filtreDepartman = '';
  let departmanlar = [];
  let cetvel = null;
  // Mesai düzeni sunucudan gelir (08:00-19:00, günlük 10 saat)
  let mesai = { baslangic: '08:00', bitis: '19:00', gunluk_saat: 10, mola_saat: 1 };
  let saatGoster = false;      // hücrede kod yerine saat göster
  let duzenlemeAcik = false;   // cetvel varsayılan olarak salt okunur
  let gecmis = [];             // geri alma yığını (en fazla 20 adım)

  const GECMIS_SINIRI = 20;

  // Hücreye tıklandığında durumların izlediği sıra
  const DONGU = [null, 'tam', 'yarim', 'devamsiz', 'izinli', 'resmi_tatil', 'hafta_sonu'];

  const KOD = { tam:'T', yarim:'Y', devamsiz:'D', izinli:'İ', resmi_tatil:'R', hafta_sonu:'HT' };
  const METIN = {
    tam:'Tam gün', yarim:'Yarım gün', devamsiz:'Devamsız', izinli:'İzinli',
    resmi_tatil:'Resmi tatil', hafta_sonu:'Hafta tatili',
  };
  const RENK = {
    tam:         { zemin:'#EFFFF1', yazi:'#00802F' },
    yarim:       { zemin:'#FFFEF0', yazi:'#855900' },
    devamsiz:    { zemin:'#FFF5F5', yazi:'#DB0000' },
    izinli:      { zemin:'#F0FBFF', yazi:'#006CE0' },
    resmi_tatil: { zemin:'#F3F3F7', yazi:'#424650' },
    hafta_sonu:  { zemin:'#F3F3F7', yazi:'#656871' },
  };

  async function apiFetch(url, opts = {}) {
    const token = Auth.getToken();
    try {
      const res = await fetch('http://localhost:8000' + url, {
        ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(hataMetni(e));
      }
      if (res.status === 204) return { _bos: true };
      return res.json();
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'TypeError' || e.name === 'AbortError') {
        throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
      }
      throw e;
    }
  }

  async function cetvelYukle() {
    const q = new URLSearchParams({ yil: secilenYil, ay: secilenAy });
    if (filtreDepartman) q.set('departman_id', filtreDepartman);
    cetvel = await apiFetch(`/puantaj/cetvel?${q}`);
    if (cetvel.mesai) mesai = cetvel.mesai;
  }

  const saatMetni = s => (s % 1 === 0 ? String(s) : s.toFixed(1).replace('.', ','));

  // "08:00" + 5 saat -> "13:00"
  function saatEkle(hhmm, saat) {
    const [a, b] = hhmm.split(':').map(Number);
    const toplam = a * 60 + b + Math.round(saat * 60);
    const ss = Math.floor(toplam / 60) % 24, dd = toplam % 60;
    return `${String(ss).padStart(2, '0')}:${String(dd).padStart(2, '0')}`;
  }

  function gunBasligi(g) {
    const d = new Date(secilenYil, secilenAy - 1, g.gun);
    return `<th class="pt-gun-bas${g.hafta_sonu ? ' pt-hs' : ''}" title="${g.gun} ${AYLAR[secilenAy-1]}">
      <span class="pt-gun-no">${g.gun}</span>
      <span class="pt-gun-ad">${GUN_KISA[d.getDay()]}</span>
    </th>`;
  }

  function hucre(satir, g) {
    const h = satir.gunler[String(g.gun)];
    const durum = h.durum;
    const r = durum ? RENK[durum] : null;
    const stil = r ? `background:${r.zemin};color:${r.yazi}` : (g.hafta_sonu ? 'background:var(--gray-50)' : '');
    const baslik = durum ? METIN[durum] : (g.hafta_sonu ? 'Hafta tatili' : 'Kayıt yok');
    // Saat sunucudan gelen alandan değil yerel hesaptan okunur; hücre
    // tıklamayla değiştiğinde sunucudaki "saat" değeri bayatlıyordu.
    const saat = hucreSaati(h);
    const saatBilgi = saat ? ` · ${saatMetni(saat)} saat` : '';
    const saatAralik = (h.giris_saati && h.cikis_saati) ? ` · ${h.giris_saati}-${h.cikis_saati}` : '';
    return `<td class="pt-hucre${g.hafta_sonu ? ' pt-hs' : ''}${saatGoster ? ' pt-saat-modu' : ''}" style="${stil}"
      title="${Ortak.kacir(satir.ad_soyad)} · ${g.gun} ${AYLAR[secilenAy-1]} · ${baslik}${saatAralik}${saatBilgi}"
      data-pid="${satir.personel_id}" data-gun="${g.gun}" data-durum="${durum || ''}"
      >${hucreIcerik(durum, saat)}</td>`;
  }

  // Saat modunda 0 saat üreten günler boş kalmasın diye: devamsızlık
  // "0" olarak yazılır (kırmızı zeminde), izin ve hafta tatili ise
  // durum koduyla (İ / HT) gösterilir.
  const SAAT_MODU_YAZI = { devamsiz: '0' };

  function hucreIcerik(durum, saat) {
    if (!durum) return '';
    if (!saatGoster) return KOD[durum];
    if (saat) return saatMetni(saat);
    return SAAT_MODU_YAZI[durum] || KOD[durum];
  }

  function render() {
    const { gunler, personeller } = cetvel;
    O_icerik(`
      <div class="personel-toolbar">
        <div class="arama-grup">
          <div class="pt-nav">
            <button class="pt-nav-btn" onclick="PuantajModul.oncekiAy()">‹</button>
            <span class="pt-donem">${AYLAR[secilenAy-1]} ${secilenYil}</span>
            <button class="pt-nav-btn" onclick="PuantajModul.sonrakiAy()">›</button>
          </div>
          <select id="pt-departman" class="filtre-select">
            <option value="">Tüm Departmanlar</option>
            ${departmanlar.map(d => `<option value="${d.id}" ${filtreDepartman == d.id ? 'selected' : ''}>${Ortak.kacir(d.ad)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-sagda">
          <span style="font-size:12px;color:var(--text-3)">${personeller.length} personel</span>
          <button class="btn-mini" onclick="PuantajModul.gorunumDegistir()">
            ${saatGoster ? 'Durum kodlarını göster' : 'Saatleri göster'}
          </button>
          ${duzenlemeAcik ? `
            <button class="btn-mini" onclick="PuantajModul.topluDoldurAc()">Ayı doldur</button>
            <button class="btn-mini" onclick="PuantajModul.geriAl()" ${gecmis.length ? '' : 'disabled'}
                    title="${gecmis.length ? 'Son değişikliği geri al (Ctrl+Z)' : 'Geri alınacak değişiklik yok'}">
              ↶ Geri al${gecmis.length ? ` (${gecmis.length})` : ''}
            </button>
            <button class="btn-yeni pt-duzenle-acik" onclick="PuantajModul.duzenlemeDegistir()">
              Düzenlemeyi kapat
            </button>` : `
            <button class="btn-mini" onclick="PuantajModul.duzenlemeDegistir()">Düzenle</button>`}
          <button class="btn-export" onclick="PuantajModul.exportCSV()">CSV İndir</button>
        </div>
      </div>

      <div class="pt-lejant">
        ${Object.keys(KOD).map(d => `
          <span class="pt-lejant-oge">
            <span class="pt-lejant-kutu" style="background:${RENK[d].zemin};color:${RENK[d].yazi}">${KOD[d]}</span>
            ${METIN[d]}
          </span>`).join('')}
        <span class="pt-lejant-mesai">
          Mesai ${mesai.baslangic}–${mesai.bitis} · günlük ${saatMetni(mesai.gunluk_saat)} saat
          (${saatMetni(mesai.mola_saat)} saat ara dinlenmesi düşülür)
        </span>
        <span class="pt-lejant-ipucu">
          ${duzenlemeAcik
            ? 'Düzenleme açık — tıkla: durumu değiştir · çift tıkla: saat ve not'
            : 'Salt okunur — değişiklik için "Düzenle" düğmesine basın'}
        </span>
      </div>

      <div class="panel pt-cetvel-sarmal${duzenlemeAcik ? ' pt-duzenlenebilir' : ''}">
        <table class="pt-cetvel">
          <thead>
            <tr>
              <th class="pt-ad-bas">Personel</th>
              ${gunler.map(gunBasligi).join('')}
              <th class="pt-toplam-bas" title="Çalışılan gün">Gün</th>
              <th class="pt-toplam-bas" title="Devamsız gün">Dev</th>
              <th class="pt-toplam-bas" title="İzinli gün">İzn</th>
              <th class="pt-toplam-bas pt-saat-bas" title="Aylık toplam çalışılan saat">Saat</th>
            </tr>
          </thead>
          <tbody>
            ${personeller.length ? personeller.map(s => `
              <tr>
                <td class="pt-ad" title="${Ortak.kacir(s.ad_soyad)}${s.departman ? ' · ' + Ortak.kacir(s.departman) : ''}">
                  <strong>${Ortak.kacir(s.ad_soyad)}</strong>
                </td>
                ${gunler.map(g => hucre(s, g)).join('')}
                <td class="pt-toplam">${s.calisilan}</td>
                <td class="pt-toplam${s.devamsiz ? ' pt-uyari' : ''}">${s.devamsiz}</td>
                <td class="pt-toplam">${s.izinli}</td>
                <td class="pt-toplam pt-saat-toplam">${saatMetni(s.toplam_saat || 0)}</td>
              </tr>`).join('')
            : `<tr><td colspan="${gunler.length + 5}" style="text-align:center;padding:40px;color:var(--text-3)">Personel bulunamadı</td></tr>`}
          </tbody>
          ${personeller.length ? `<tfoot>
            <tr class="pt-toplam-satir">
              <td class="pt-ad"><strong>Toplam</strong></td>
              ${gunler.map(g => {
                const gunToplam = personeller.reduce((t, s) => t + (s.gunler[String(g.gun)].saat || 0), 0);
                return `<td class="pt-hucre pt-gun-toplam${g.hafta_sonu ? ' pt-hs' : ''}"
                  title="${g.gun} ${AYLAR[secilenAy-1]} · toplam ${saatMetni(gunToplam)} saat"
                  >${gunToplam ? saatMetni(gunToplam) : ''}</td>`;
              }).join('')}
              <td class="pt-toplam">${personeller.reduce((t, s) => t + s.calisilan, 0)}</td>
              <td class="pt-toplam">${personeller.reduce((t, s) => t + s.devamsiz, 0)}</td>
              <td class="pt-toplam">${personeller.reduce((t, s) => t + s.izinli, 0)}</td>
              <td class="pt-toplam pt-saat-toplam">${saatMetni(personeller.reduce((t, s) => t + (s.toplam_saat || 0), 0))}</td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>

      <div id="pt-modal" class="modal-overlay gizli">
        <div class="modal-kart" style="max-width:420px">
          <div class="modal-header">
            <h3 id="pt-modal-baslik">Gün Düzenle</h3>
            <button class="modal-kapat" onclick="PuantajModul.modalKapat()">×</button>
          </div>
          <div id="pt-modal-icerik"></div>
        </div>
      </div>
    `);

    document.getElementById('pt-departman').addEventListener('change', async e => {
      filtreDepartman = e.target.value;
      await cetvelYukle();
      render();
    });

    const tablo = document.querySelector('.pt-cetvel tbody');
    tablo.addEventListener('click', e => {
      const td = e.target.closest('.pt-hucre');
      if (td && duzenlemeAcik) durumIlerlet(td);
    });
    tablo.addEventListener('dblclick', e => {
      const td = e.target.closest('.pt-hucre');
      if (td && duzenlemeAcik) gunDetayAc(td);
    });
  }

  // İçerik alanını yaz (Ortak.icerik ile aynı, modül bağımsız kalsın diye ayrı)
  function O_icerik(html) {
    document.getElementById('content-area').innerHTML = html;
  }

  function satirBul(pid) {
    return cetvel.personeller.find(s => s.personel_id === Number(pid));
  }

  // Sunucudaki hesabın aynısı: saat girilmişse farktan mola düşülür,
  // girilmemişse duruma göre standart süre sayılır.
  function hucreSaati(h) {
    if (!h.durum || ['devamsiz', 'izinli', 'resmi_tatil', 'hafta_sonu'].includes(h.durum)) return 0;
    const dk = t => { if (!t) return null; const [a, b] = String(t).split(':'); const s = +a + (+b) / 60; return isNaN(s) ? null : s; };
    const b = dk(h.giris_saati), c = dk(h.cikis_saati);
    if (b !== null && c !== null && c > b) {
      let sure = c - b;
      if (sure > mesai.gunluk_saat / 2) sure -= mesai.mola_saat;
      return Math.round(Math.max(sure, 0) * 100) / 100;
    }
    return h.durum === 'tam' ? mesai.gunluk_saat : mesai.gunluk_saat / 2;
  }

  function toplamlariTazele(satir) {
    const hucreler = Object.values(satir.gunler);
    const durumlar = hucreler.map(h => h.durum);
    satir.calisilan = durumlar.filter(d => d === 'tam' || d === 'yarim').length;
    satir.devamsiz  = durumlar.filter(d => d === 'devamsiz').length;
    satir.izinli    = durumlar.filter(d => d === 'izinli').length;
    satir.toplam_saat = Math.round(hucreler.reduce((t, h) => t + hucreSaati(h), 0) * 100) / 100;

    const tr = document.querySelector(`.pt-hucre[data-pid="${satir.personel_id}"]`)?.closest('tr');
    if (!tr) return;
    const toplamlar = tr.querySelectorAll('.pt-toplam');
    toplamlar[0].textContent = satir.calisilan;
    toplamlar[1].textContent = satir.devamsiz;
    toplamlar[1].classList.toggle('pt-uyari', satir.devamsiz > 0);
    toplamlar[2].textContent = satir.izinli;
    toplamlar[3].textContent = saatMetni(satir.toplam_saat);

    ekipToplamiTazele();
  }

  function ekipToplamiTazele() {
    const tfoot = document.querySelector('.pt-toplam-satir');
    if (!tfoot || !cetvel) return;
    const p = cetvel.personeller;
    const hucreler = tfoot.querySelectorAll('.pt-gun-toplam');
    cetvel.gunler.forEach((g, i) => {
      const t = p.reduce((a, s) => a + hucreSaati(s.gunler[String(g.gun)]), 0);
      if (hucreler[i]) hucreler[i].textContent = t ? saatMetni(t) : '';
    });
    const toplamlar = tfoot.querySelectorAll('.pt-toplam');
    toplamlar[0].textContent = p.reduce((t, s) => t + s.calisilan, 0);
    toplamlar[1].textContent = p.reduce((t, s) => t + s.devamsiz, 0);
    toplamlar[2].textContent = p.reduce((t, s) => t + s.izinli, 0);
    toplamlar[3].textContent = saatMetni(p.reduce((t, s) => t + (s.toplam_saat || 0), 0));
  }

  function hucreBoya(td, durum, h) {
    const r = durum ? RENK[durum] : null;
    const saat = hucreSaati(h || { durum });
    td.textContent = hucreIcerik(durum, saat);
    td.dataset.durum = durum || '';
    td.style.background = r ? r.zemin : (td.classList.contains('pt-hs') ? 'var(--gray-50)' : '');
    td.style.color = r ? r.yazi : '';
  }

  function gunHaftaTatili(gunNo) {
    return !!cetvel.gunler.find(g => g.gun === gunNo)?.hafta_sonu;
  }

  async function durumIlerlet(td) {
    const satir = satirBul(td.dataset.pid);
    const gun = Number(td.dataset.gun);
    const mevcut = td.dataset.durum || null;

    // Hafta tatili günlerinde "kayıtsız" hal zaten HT'dir; bu yüzden
    // döngü null yerine hafta_sonu üzerinden döner.
    const ht = gunHaftaTatili(gun);
    const dongu = ht
      ? ['hafta_sonu', 'tam', 'yarim', 'devamsiz', 'izinli', 'resmi_tatil']
      : DONGU;
    const suanki = ht && !mevcut ? 'hafta_sonu' : mevcut;
    const yeni = dongu[(dongu.indexOf(suanki) + 1) % dongu.length];

    // Önce ekranda göster, sonra kaydet; hata olursa geri al.
    const oncekiDurum = mevcut;
    const oncekiHucre = { ...satir.gunler[String(gun)] };
    hucreBoya(td, yeni, { durum: yeni });
    td.classList.add('pt-kaydediliyor');

    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(gun).padStart(2,'0')}`;
    try {
      if (yeni === null || (ht && yeni === 'hafta_sonu')) {
        // Kaydı sil: normal günde hücre boşalır, pazar gününde HT'ye döner
        const kayit = satir.gunler[String(gun)];
        if (kayit.id) await apiFetch(`/puantaj/${kayit.id}`, { method: 'DELETE' });
        const varsayilan = ht ? 'hafta_sonu' : null;
        satir.gunler[String(gun)] = { id: null, durum: varsayilan, giris_saati: null, cikis_saati: null, fazla_mesai: 0 };
        hucreBoya(td, varsayilan, satir.gunler[String(gun)]);
      } else {
        const s = await apiFetch('/puantaj', {
          method: 'POST',
          body: JSON.stringify({ personel_id: satir.personel_id, tarih: tarih, durum: yeni }),
        });
        satir.gunler[String(gun)] = {
          id: s.id, durum: yeni,
          giris_saati: s.giris_saati, cikis_saati: s.cikis_saati,
          fazla_mesai: s.fazla_mesai || 0,
        };
        hucreBoya(td, yeni, satir.gunler[String(gun)]);
      }
      toplamlariTazele(satir);
      gecmiseEkle({ pid: satir.personel_id, gun, onceki: oncekiHucre });
    } catch (err) {
      hucreBoya(td, oncekiDurum, oncekiHucre);
      alert(err.message);
    } finally {
      td.classList.remove('pt-kaydediliyor');
    }
  }

  let kisayolBagliMi = false;
  function kisayolBagla() {
    if (kisayolBagliMi) return;
    kisayolBagliMi = true;
    document.addEventListener('keydown', e => {
      // Yalnızca puantaj sayfası açıkken ve düzenleme modundayken
      const cetvelGorunur = document.querySelector('.pt-cetvel');
      if (!cetvelGorunur || !duzenlemeAcik) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        gecmisiGeriAl();
      }
    });
  }

  // ── Geri alma ───────────────────────────────────────────────────
  // Her değişiklikten önceki hücre durumu saklanır; geri alma bu
  // durumu sunucuya yeniden yazar (ya da kayıt yoksa siler).
  function gecmiseEkle(adim) {
    gecmis.push(adim);
    if (gecmis.length > GECMIS_SINIRI) gecmis.shift();
    geriAlDugmesiniTazele();
  }

  function geriAlDugmesiniTazele() {
    const dugme = document.querySelector('.toolbar-sagda button[onclick*="geriAl"]');
    if (!dugme) return;
    dugme.disabled = gecmis.length === 0;
    dugme.textContent = gecmis.length ? `↶ Geri al (${gecmis.length})` : '↶ Geri al';
  }

  async function gecmisiGeriAl() {
    const adim = gecmis.pop();
    if (!adim) return;
    geriAlDugmesiniTazele();

    const satir = satirBul(adim.pid);
    const td = document.querySelector(`.pt-hucre[data-pid="${adim.pid}"][data-gun="${adim.gun}"]`);
    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(adim.gun).padStart(2,'0')}`;

    try {
      const suanki = satir.gunler[String(adim.gun)];
      if (!adim.onceki.durum || (gunHaftaTatili(adim.gun) && adim.onceki.durum === 'hafta_sonu' && !adim.onceki.id)) {
        // Önceki hal "kayıt yok" idi: mevcut kaydı sil
        if (suanki.id) await apiFetch(`/puantaj/${suanki.id}`, { method: 'DELETE' });
        satir.gunler[String(adim.gun)] = {
          id: null, durum: gunHaftaTatili(adim.gun) ? 'hafta_sonu' : null,
          giris_saati: null, cikis_saati: null, fazla_mesai: 0,
        };
      } else {
        const s = await apiFetch('/puantaj', { method: 'POST', body: JSON.stringify({
          personel_id: adim.pid, tarih,
          durum: adim.onceki.durum,
          giris_saati: adim.onceki.giris_saati || null,
          cikis_saati: adim.onceki.cikis_saati || null,
        })});
        satir.gunler[String(adim.gun)] = {
          id: s.id, durum: adim.onceki.durum,
          giris_saati: s.giris_saati, cikis_saati: s.cikis_saati,
          fazla_mesai: s.fazla_mesai || 0,
        };
      }
      const h = satir.gunler[String(adim.gun)];
      if (td) hucreBoya(td, h.durum, h);
      toplamlariTazele(satir);
    } catch (err) {
      gecmis.push(adim);          // başarısızsa adımı geri koy
      geriAlDugmesiniTazele();
      alert('Geri alınamadı: ' + err.message);
    }
  }

  function gunDetayAc(td) {
    const satir = satirBul(td.dataset.pid);
    const gun = Number(td.dataset.gun);
    const kayit = satir.gunler[String(gun)];
    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(gun).padStart(2,'0')}`;

    document.getElementById('pt-modal-baslik').textContent =
      `${satir.ad_soyad} — ${gun} ${AYLAR[secilenAy-1]} ${secilenYil}`;
    // Kayıt yoksa varsayılan olarak tam gün açılır; hesabın ve saat
    // alanlarının açılıştaki durumla tutarlı olması için baştan belirlenir.
    const acilisDurum = kayit.durum || 'tam';
    const calisilan = acilisDurum === 'tam' || acilisDurum === 'yarim';
    const acilisGiris = kayit.giris_saati || (calisilan ? mesai.baslangic : '');
    const acilisCikis = kayit.cikis_saati || (
      acilisDurum === 'tam' ? mesai.bitis
      : acilisDurum === 'yarim' ? saatEkle(mesai.baslangic, mesai.gunluk_saat / 2)
      : '');
    const acilisSaat = hucreSaati({ durum: acilisDurum, giris_saati: acilisGiris, cikis_saati: acilisCikis });

    document.getElementById('pt-modal-icerik').innerHTML = `
      <form id="pt-form" class="modal-form">
        <div class="form-group"><label>Durum</label>
          <select name="durum">
            ${Object.keys(KOD).map(d => `<option value="${d}" ${acilisDurum === d ? 'selected' : ''}>${METIN[d]}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Giriş Saati</label>
            <input type="time" name="giris_saati" value="${acilisGiris}" /></div>
          <div class="form-group"><label>Çıkış Saati</label>
            <input type="time" name="cikis_saati" value="${acilisCikis}" /></div>
        </div>
        <div class="pt-hesap-kutu">
          Çalışılan süre: <strong id="pt-hesap">${saatMetni(acilisSaat)} saat</strong>
          <span class="hucre-alt">${saatMetni(mesai.mola_saat)} saat ara dinlenmesi düşülür</span>
        </div>
        <div class="form-group"><label>Not</label><input name="notlar" placeholder="Opsiyonel..." /></div>
        <div id="pt-form-hata" class="hata-mesaji gizli"></div>
        <div class="modal-footer">
          <button type="button" class="btn-iptal" onclick="PuantajModul.modalKapat()">İptal</button>
          <button type="submit" class="btn-kaydet">Kaydet</button>
        </div>
      </form>`;

    // Saat veya durum değişince hesaplanan süreyi anında göster
    const form = document.getElementById('pt-form');
    const hesapTazele = () => {
      const fd = new FormData(form);
      const s = hucreSaati({
        durum: fd.get('durum'),
        giris_saati: fd.get('giris_saati'),
        cikis_saati: fd.get('cikis_saati'),
      });
      document.getElementById('pt-hesap').textContent = `${saatMetni(s)} saat`;
    };

    // Durum değişince saatler o duruma uygun hale getirilir: yarım gün
    // seçiliyken saatlerin tam gün göstermesi çelişkili bir kayıt üretir
    // (hesap saatlerden yapıldığı için 10 saat sayılırdı).
    const durumSec = form.querySelector('select[name=durum]');
    durumSec.addEventListener('change', () => {
      const giris = form.querySelector('input[name=giris_saati]');
      const cikis = form.querySelector('input[name=cikis_saati]');
      const d = durumSec.value;

      if (d === 'tam') {
        giris.value = mesai.baslangic;
        cikis.value = mesai.bitis;
      } else if (d === 'yarim') {
        giris.value = mesai.baslangic;
        cikis.value = saatEkle(mesai.baslangic, mesai.gunluk_saat / 2);
      } else {
        // Çalışılmayan günlerde saat bilgisi anlamsız
        giris.value = '';
        cikis.value = '';
      }
      hesapTazele();
    });

    form.querySelectorAll('input[type=time]')
        .forEach(el => el.addEventListener('change', hesapTazele));

    document.getElementById('pt-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const s = await apiFetch('/puantaj', { method: 'POST', body: JSON.stringify({
          personel_id: satir.personel_id, tarih: tarih, durum: fd.get('durum'),
          giris_saati: fd.get('giris_saati') || null, cikis_saati: fd.get('cikis_saati') || null,
          notlar: fd.get('notlar') || null,
        })});
        satir.gunler[String(gun)] = {
          id: s.id, durum: fd.get('durum'),
          giris_saati: s.giris_saati, cikis_saati: s.cikis_saati,
          fazla_mesai: s.fazla_mesai || 0,
        };
        hucreBoya(td, fd.get('durum'), satir.gunler[String(gun)]);
        toplamlariTazele(satir);
        PuantajModul.modalKapat();
      } catch (err) {
        const hata = document.getElementById('pt-form-hata');
        hata.textContent = err.message;
        hata.classList.remove('gizli');
      }
    });
    document.getElementById('pt-modal').classList.remove('gizli');
  }

  async function donemDegistir(fark) {
    secilenAy += fark;
    if (secilenAy === 0)  { secilenAy = 12; secilenYil--; }
    if (secilenAy === 13) { secilenAy = 1;  secilenYil++; }
    await cetvelYukle();
    render();
  }

  return {
    async yukle() {
      const dep = await apiFetch('/personel/departmanlar');
      departmanlar = dep || [];
      await cetvelYukle();
      render();
      kisayolBagla();
    },

    gorunumDegistir() {
      saatGoster = !saatGoster;
      render();
    },

    // Ay başında 30 gün × personel sayısı kadar hücreye tıklamak yerine
    // tek istekte doldurma. Varsayılan olarak dolu günlere dokunulmaz.
    topluDoldurAc() {
      const g = Ortak.modalAc(`${AYLAR[secilenAy-1]} ${secilenYil} — Toplu Doldur`, `
        <form id="td-form" class="modal-form">
          <div class="form-group"><label>Durum</label>
            <select name="durum">
              <option value="tam">Tam gün (${saatMetni(mesai.gunluk_saat)} saat)</option>
              <option value="yarim">Yarım gün (${saatMetni(mesai.gunluk_saat / 2)} saat)</option>
              <option value="izinli">İzinli</option>
              <option value="resmi_tatil">Resmi tatil</option>
            </select></div>

          <div class="form-group"><label>Kimler için</label>
            <select name="kapsam">
              <option value="hepsi">Cetveldeki tüm personel (${cetvel.personeller.length} kişi)</option>
              ${cetvel.personeller.map(p => `<option value="${p.personel_id}">${Ortak.kacir(p.ad_soyad)}</option>`).join('')}
            </select></div>

          <label class="td-secenek">
            <input type="checkbox" name="mevcutlari_koru" checked />
            <span>Dolu günlere dokunma <span class="hucre-alt">(kapatılırsa mevcut kayıtların üzerine yazılır)</span></span>
          </label>
          <label class="td-secenek">
            <input type="checkbox" name="hafta_tatili_dahil" />
            <span>Hafta tatili günlerini de doldur <span class="hucre-alt">(pazar günleri)</span></span>
          </label>

          ${Ortak.formHata()}${Ortak.modalFooter('Doldur')}
        </form>`);

      g.querySelector('#td-form').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const kapsam = fd.get('kapsam');
        const govde = {
          yil: secilenYil, ay: secilenAy,
          durum: fd.get('durum'),
          mevcutlari_koru: fd.get('mevcutlari_koru') === 'on',
          hafta_tatili_dahil: fd.get('hafta_tatili_dahil') === 'on',
        };
        if (kapsam !== 'hepsi') govde.personel_idler = [Number(kapsam)];

        try {
          const s = await apiFetch('/puantaj/toplu-doldur', { method: 'POST', body: JSON.stringify(govde) });
          Ortak.modalKapat();
          // Toplu değişiklik geri alınamaz; geçmiş temizlenir ki
          // yanıltıcı bir "geri al" düğmesi kalmasın.
          gecmis = [];
          await cetvelYukle();
          render();
          alert(`${s.eklenen} gün eklendi`
            + (s.guncellenen ? `, ${s.guncellenen} gün güncellendi` : '')
            + (s.atlanan ? `, ${s.atlanan} gün atlandı` : '') + '.');
        } catch (err) { Ortak.hataGoster(err.message); }
      };
    },

    duzenlemeDegistir() {
      duzenlemeAcik = !duzenlemeAcik;
      if (!duzenlemeAcik) gecmis = [];   // kilitlenince geçmiş sıfırlanır
      render();
    },

    geriAl() { gecmisiGeriAl(); },

    oncekiAy()  { donemDegistir(-1); },
    sonrakiAy() { donemDegistir(1); },
    modalKapat() { document.getElementById('pt-modal').classList.add('gizli'); },

    exportCSV() {
      const { gunler, personeller } = cetvel;
      const baslik = ['Personel', 'Departman', ...gunler.map(g => g.gun),
                      'Çalışılan Gün', 'Devamsız', 'İzinli', 'Toplam Saat'];
      // Gün hücrelerine hem durum kodu hem saat yazılır: "T 10"
      const satirlar = personeller.map(s => [
        s.ad_soyad, s.departman || '',
        ...gunler.map(g => {
          const h = s.gunler[String(g.gun)];
          if (!h.durum) return '';
          const saat = hucreSaati(h);
          return saat ? `${KOD[h.durum]} ${saatMetni(saat)}` : KOD[h.durum];
        }),
        s.calisilan, s.devamsiz, s.izinli, saatMetni(s.toplam_saat || 0),
      ]);
      satirlar.push([
        'TOPLAM', '',
        ...gunler.map(g => {
          const t = personeller.reduce((a, s) => a + hucreSaati(s.gunler[String(g.gun)]), 0);
          return t ? saatMetni(t) : '';
        }),
        personeller.reduce((t, s) => t + s.calisilan, 0),
        personeller.reduce((t, s) => t + s.devamsiz, 0),
        personeller.reduce((t, s) => t + s.izinli, 0),
        saatMetni(personeller.reduce((t, s) => t + (s.toplam_saat || 0), 0)),
      ]);
      const csv = '﻿' + [baslik, ...satirlar]
        .map(r => r.map(h => `"${String(h).replace(/"/g, '""')}"`).join(';'))
        .join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = `puantaj-cetvel-${secilenYil}-${String(secilenAy).padStart(2,'0')}.csv`;
      a.click();
    },
  };
})();
