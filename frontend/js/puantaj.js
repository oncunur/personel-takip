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
  let saatGoster = false;   // hücrede kod yerine saat göster

  // Hücreye tıklandığında durumların izlediği sıra
  const DONGU = [null, 'tam', 'yarim', 'devamsiz', 'izinli', 'resmi_tatil'];

  const KOD = { tam:'T', yarim:'Y', devamsiz:'D', izinli:'İ', resmi_tatil:'R' };
  const METIN = { tam:'Tam gün', yarim:'Yarım gün', devamsiz:'Devamsız', izinli:'İzinli', resmi_tatil:'Resmi tatil' };
  const RENK = {
    tam:         { zemin:'#EFFFF1', yazi:'#00802F' },
    yarim:       { zemin:'#FFFEF0', yazi:'#855900' },
    devamsiz:    { zemin:'#FFF5F5', yazi:'#DB0000' },
    izinli:      { zemin:'#F0FBFF', yazi:'#006CE0' },
    resmi_tatil: { zemin:'#F3F3F7', yazi:'#424650' },
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
    const baslik = durum ? METIN[durum] : (g.hafta_sonu ? 'Hafta sonu' : 'Kayıt yok');
    const saatBilgi = h.saat ? ` · ${saatMetni(h.saat)} saat` : '';
    const saatAralik = (h.giris_saati && h.cikis_saati) ? ` · ${h.giris_saati}-${h.cikis_saati}` : '';
    const icerik = durum ? (saatGoster ? (h.saat ? saatMetni(h.saat) : '') : KOD[durum]) : '';
    return `<td class="pt-hucre${g.hafta_sonu ? ' pt-hs' : ''}${saatGoster ? ' pt-saat-modu' : ''}" style="${stil}"
      title="${satir.ad_soyad} · ${g.gun} ${AYLAR[secilenAy-1]} · ${baslik}${saatAralik}${saatBilgi}"
      data-pid="${satir.personel_id}" data-gun="${g.gun}" data-durum="${durum || ''}"
      >${icerik}</td>`;
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
        <span class="pt-lejant-ipucu">Tıkla: durumu değiştir · Çift tıkla: saat ve not</span>
      </div>

      <div class="panel pt-cetvel-sarmal">
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
      if (td) durumIlerlet(td);
    });
    tablo.addEventListener('dblclick', e => {
      const td = e.target.closest('.pt-hucre');
      if (td) gunDetayAc(td);
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
    const saat = h ? hucreSaati(h) : 0;
    td.textContent = durum ? (saatGoster ? (saat ? saatMetni(saat) : '') : KOD[durum]) : '';
    td.dataset.durum = durum || '';
    td.style.background = r ? r.zemin : (td.classList.contains('pt-hs') ? 'var(--gray-50)' : '');
    td.style.color = r ? r.yazi : '';
  }

  async function durumIlerlet(td) {
    const satir = satirBul(td.dataset.pid);
    const gun = Number(td.dataset.gun);
    const mevcut = td.dataset.durum || null;
    const yeni = DONGU[(DONGU.indexOf(mevcut) + 1) % DONGU.length];

    // Önce ekranda göster, sonra kaydet; hata olursa geri al.
    const oncekiDurum = mevcut;
    const oncekiHucre = { ...satir.gunler[String(gun)] };
    hucreBoya(td, yeni, { durum: yeni });
    td.classList.add('pt-kaydediliyor');

    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(gun).padStart(2,'0')}`;
    try {
      if (yeni === null) {
        const kayit = satir.gunler[String(gun)];
        if (kayit.id) await apiFetch(`/puantaj/${kayit.id}`, { method: 'DELETE' });
        satir.gunler[String(gun)] = { id: null, durum: null, giris_saati: null, cikis_saati: null, fazla_mesai: 0 };
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
    } catch (err) {
      hucreBoya(td, oncekiDurum, oncekiHucre);
      alert(err.message);
    } finally {
      td.classList.remove('pt-kaydediliyor');
    }
  }

  function gunDetayAc(td) {
    const satir = satirBul(td.dataset.pid);
    const gun = Number(td.dataset.gun);
    const kayit = satir.gunler[String(gun)];
    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(gun).padStart(2,'0')}`;

    document.getElementById('pt-modal-baslik').textContent =
      `${satir.ad_soyad} — ${gun} ${AYLAR[secilenAy-1]} ${secilenYil}`;
    document.getElementById('pt-modal-icerik').innerHTML = `
      <form id="pt-form" class="modal-form">
        <div class="form-group"><label>Durum</label>
          <select name="durum">
            ${Object.keys(KOD).map(d => `<option value="${d}" ${kayit.durum === d ? 'selected' : ''}>${METIN[d]}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Giriş Saati</label>
            <input type="time" name="giris_saati" value="${kayit.giris_saati || mesai.baslangic}" /></div>
          <div class="form-group"><label>Çıkış Saati</label>
            <input type="time" name="cikis_saati" value="${kayit.cikis_saati || mesai.bitis}" /></div>
        </div>
        <div class="pt-hesap-kutu">
          Çalışılan süre: <strong id="pt-hesap">${saatMetni(hucreSaati(kayit))} saat</strong>
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
    form.querySelectorAll('input[type=time], select[name=durum]')
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
    },

    gorunumDegistir() {
      saatGoster = !saatGoster;
      render();
    },

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
