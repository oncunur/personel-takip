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
    const baslik = durum ? METIN[durum] : (g.hafta_sonu ? 'Hafta sonu' : 'Kayıt yok');
    return `<td class="pt-hucre${g.hafta_sonu ? ' pt-hs' : ''}" style="${stil}"
      title="${satir.ad_soyad} · ${g.gun} ${AYLAR[secilenAy-1]} · ${baslik}"
      data-pid="${satir.personel_id}" data-gun="${g.gun}" data-durum="${durum || ''}"
      >${durum ? KOD[durum] : ''}</td>`;
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
          <button class="btn-export" onclick="PuantajModul.exportCSV()">CSV İndir</button>
        </div>
      </div>

      <div class="pt-lejant">
        ${Object.keys(KOD).map(d => `
          <span class="pt-lejant-oge">
            <span class="pt-lejant-kutu" style="background:${RENK[d].zemin};color:${RENK[d].yazi}">${KOD[d]}</span>
            ${METIN[d]}
          </span>`).join('')}
        <span class="pt-lejant-ipucu">Tıkla: durumu değiştir · Çift tıkla: saat ve not</span>
      </div>

      <div class="panel pt-cetvel-sarmal">
        <table class="pt-cetvel">
          <thead>
            <tr>
              <th class="pt-ad-bas">Personel</th>
              ${gunler.map(gunBasligi).join('')}
              <th class="pt-toplam-bas" title="Çalışılan gün">Çal</th>
              <th class="pt-toplam-bas" title="Devamsız gün">Dev</th>
              <th class="pt-toplam-bas" title="İzinli gün">İzn</th>
              <th class="pt-toplam-bas" title="Fazla mesai (saat)">FM</th>
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
                <td class="pt-toplam">${s.fazla_mesai || 0}</td>
              </tr>`).join('')
            : `<tr><td colspan="${gunler.length + 5}" style="text-align:center;padding:40px;color:var(--text-3)">Personel bulunamadı</td></tr>`}
          </tbody>
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

  function toplamlariTazele(satir) {
    const durumlar = Object.values(satir.gunler).map(h => h.durum);
    satir.calisilan = durumlar.filter(d => d === 'tam' || d === 'yarim').length;
    satir.devamsiz  = durumlar.filter(d => d === 'devamsiz').length;
    satir.izinli    = durumlar.filter(d => d === 'izinli').length;

    const tr = document.querySelector(`.pt-hucre[data-pid="${satir.personel_id}"]`)?.closest('tr');
    if (!tr) return;
    const toplamlar = tr.querySelectorAll('.pt-toplam');
    toplamlar[0].textContent = satir.calisilan;
    toplamlar[1].textContent = satir.devamsiz;
    toplamlar[1].classList.toggle('pt-uyari', satir.devamsiz > 0);
    toplamlar[2].textContent = satir.izinli;
  }

  function hucreBoya(td, durum) {
    const r = durum ? RENK[durum] : null;
    td.textContent = durum ? KOD[durum] : '';
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
    hucreBoya(td, yeni);
    td.classList.add('pt-kaydediliyor');

    const tarih = `${secilenYil}-${String(secilenAy).padStart(2,'0')}-${String(gun).padStart(2,'0')}`;
    try {
      if (yeni === null) {
        const kayit = satir.gunler[String(gun)];
        if (kayit.id) await apiFetch(`/puantaj/${kayit.id}`, { method: 'DELETE' });
        satir.gunler[String(gun)] = { id: null, durum: null, fazla_mesai: 0 };
      } else {
        const s = await apiFetch('/puantaj', {
          method: 'POST',
          body: JSON.stringify({ personel_id: satir.personel_id, tarih: tarih, durum: yeni }),
        });
        satir.gunler[String(gun)] = { id: s.id, durum: yeni, fazla_mesai: s.fazla_mesai || 0 };
      }
      toplamlariTazele(satir);
    } catch (err) {
      hucreBoya(td, oncekiDurum);
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
          <div class="form-group"><label>Giriş Saati</label><input type="time" name="giris_saati" value="09:00" /></div>
          <div class="form-group"><label>Çıkış Saati</label><input type="time" name="cikis_saati" value="18:00" /></div>
        </div>
        <div class="form-group"><label>Fazla Mesai (saat)</label>
          <input type="number" name="fazla_mesai" value="${kayit.fazla_mesai || 0}" min="0" max="12" step="0.5" /></div>
        <div class="form-group"><label>Not</label><input name="notlar" placeholder="Opsiyonel..." /></div>
        <div id="pt-form-hata" class="hata-mesaji gizli"></div>
        <div class="modal-footer">
          <button type="button" class="btn-iptal" onclick="PuantajModul.modalKapat()">İptal</button>
          <button type="submit" class="btn-kaydet">Kaydet</button>
        </div>
      </form>`;

    document.getElementById('pt-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const s = await apiFetch('/puantaj', { method: 'POST', body: JSON.stringify({
          personel_id: satir.personel_id, tarih: tarih, durum: fd.get('durum'),
          giris_saati: fd.get('giris_saati') || null, cikis_saati: fd.get('cikis_saati') || null,
          fazla_mesai: parseFloat(fd.get('fazla_mesai')) || 0, notlar: fd.get('notlar') || null,
        })});
        satir.gunler[String(gun)] = { id: s.id, durum: fd.get('durum'), fazla_mesai: s.fazla_mesai || 0 };
        hucreBoya(td, fd.get('durum'));
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

    oncekiAy()  { donemDegistir(-1); },
    sonrakiAy() { donemDegistir(1); },
    modalKapat() { document.getElementById('pt-modal').classList.add('gizli'); },

    exportCSV() {
      const { gunler, personeller } = cetvel;
      const baslik = ['Personel', 'Departman', ...gunler.map(g => g.gun), 'Çalışılan', 'Devamsız', 'İzinli', 'Fazla Mesai'];
      const satirlar = personeller.map(s => [
        s.ad_soyad, s.departman || '',
        ...gunler.map(g => KOD[s.gunler[String(g.gun)].durum] || ''),
        s.calisilan, s.devamsiz, s.izinli, s.fazla_mesai || 0,
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
