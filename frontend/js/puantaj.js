// ─── Puantaj Modülü ────────────────────────────────────────────────
const PuantajModul = (() => {
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const GUNLER = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

  let secilenPersonel = null;
  let secilenYil = new Date().getFullYear();
  let secilenAy  = new Date().getMonth() + 1;
  let personeller = [];

  const DURUM_RENK   = { tam:'#22C55E', yarim:'#F59E0B', devamsiz:'#EF4444', izinli:'#4F6EF7', resmi_tatil:'#8B5CF6', hafta_sonu:'#E5E7EB' };
  const DURUM_METIN  = { tam:'Tam', yarim:'Yarım', devamsiz:'Devamsız', izinli:'İzinli', resmi_tatil:'Resmi Tatil', hafta_sonu:'Hf. Sonu' };
  const DURUM_YAZI   = { tam:'white', yarim:'white', devamsiz:'white', izinli:'white', resmi_tatil:'white', hafta_sonu:'#9CA3AF' };

  async function apiFetch(url, opts = {}) {
    const token = Auth.getToken();
    try {
      const res = await fetch('http://localhost:8000' + url, {
        ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(hataMetni(e));
      }
      if (res.status === 204) return { _bos: true };
      return res.json();
    } catch(e) {
      // Ağ/zaman aşımı hatası: sahte veriye düşmek yerine açıkça bildir.
      if (e.name === 'TimeoutError' || e.name === 'TypeError' || e.name === 'AbortError') {
        throw new Error('Sunucuya ulaşılamıyor. Backend çalışıyor mu?');
      }
      throw e;
    }
  }

  function takvimRender(veri) {
    const { gunler, calisilan_gun, devamsiz_gun, izinli_gun, toplam_fazla_mesai } = veri;
    const ilkGun = new Date(secilenYil, secilenAy - 1, 1).getDay();
    const bosluk = (ilkGun === 0 ? 6 : ilkGun - 1);

    let hucreler = '';
    for (let i = 0; i < bosluk; i++) hucreler += `<div></div>`;
    gunler.forEach(g => {
      const d = parseInt(g.tarih.split('-')[2]);
      const durum = g.durum || 'tam';
      const hftSonu = durum === 'hafta_sonu';
      hucreler += `
        <div class="pt-gun ${hftSonu ? 'pt-gun-hftsonu' : 'pt-gun-aktif'}"
             style="${!hftSonu ? `cursor:pointer` : ''}"
             ${!hftSonu ? `onclick="PuantajModul.gunDuzenle('${g.tarih}', '${durum}', ${g.id||'null'})"` : ''}>
          <div class="pt-gun-no">${d}</div>
          ${durum ? `<div class="pt-durum-chip" style="background:${DURUM_RENK[durum]};color:${DURUM_YAZI[durum]}">${DURUM_METIN[durum]||durum}</div>` : '<div class="pt-durum-chip" style="background:#F3F4F6;color:#9CA3AF">—</div>'}
          ${g.fazla_mesai > 0 ? `<div style="font-size:10px;color:#F59E0B;font-weight:600">+${g.fazla_mesai}s</div>` : ''}
        </div>`;
    });

    document.getElementById('pt-takvim').innerHTML = `
      <div class="pt-takvim-hdr">${GUNLER.map(g=>`<div>${g}</div>`).join('')}</div>
      <div class="pt-takvim-grid">${hucreler}</div>
    `;
    document.getElementById('pt-ozet').innerHTML = `
      <div class="pt-ozet-kart" style="border-left:3px solid #22C55E"><span class="stat-sayi">${calisilan_gun}</span><span class="stat-label">Çalışılan Gün</span></div>
      <div class="pt-ozet-kart" style="border-left:3px solid #EF4444"><span class="stat-sayi">${devamsiz_gun}</span><span class="stat-label">Devamsızlık</span></div>
      <div class="pt-ozet-kart" style="border-left:3px solid #4F6EF7"><span class="stat-sayi">${izinli_gun}</span><span class="stat-label">İzinli Gün</span></div>
      <div class="pt-ozet-kart" style="border-left:3px solid #F59E0B"><span class="stat-sayi">${toplam_fazla_mesai}</span><span class="stat-label">Fazla Mesai (saat)</span></div>
    `;
  }

  async function yukleVeRender() {
    if (!secilenPersonel) return;
    document.getElementById('pt-takvim').innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400)">Yükleniyor...</div>`;
    const data = await apiFetch(`/puantaj/aylik?personel_id=${secilenPersonel}&yil=${secilenYil}&ay=${secilenAy}`);
    takvimRender(data);
  }

  return {
    async yukle() {
      const pData = await apiFetch('/personel?limit=100');
      personeller = pData.veriler;
      secilenPersonel = personeller[0]?.id || null;

      document.getElementById('content-area').innerHTML = `
        <div class="pt-toolbar">
          <select id="pt-personel-sec" class="filtre-select" style="min-width:200px">
            ${personeller.map(p => `<option value="${p.id}">${p.ad} ${p.soyad}</option>`).join('')}
          </select>
          <div class="pt-nav">
            <button class="pt-nav-btn" onclick="PuantajModul.oncekiAy()">‹</button>
            <span id="pt-donem-baslik" class="pt-donem">${AYLAR[secilenAy-1]} ${secilenYil}</span>
            <button class="pt-nav-btn" onclick="PuantajModul.sonrakiAy()">›</button>
          </div>
          <button class="btn-export" onclick="PuantajModul.exportCSV()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            CSV İndir
          </button>
        </div>

        <div class="izin-stats-wrap" id="pt-ozet" style="margin-bottom:16px"></div>

        <div class="panel" style="padding:16px">
          <div id="pt-takvim"></div>
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
      `;

      document.getElementById('pt-personel-sec').addEventListener('change', e => {
        secilenPersonel = parseInt(e.target.value);
        yukleVeRender();
      });

      yukleVeRender();
    },

    oncekiAy() {
      if (secilenAy === 1) { secilenAy = 12; secilenYil--; }
      else secilenAy--;
      document.getElementById('pt-donem-baslik').textContent = `${AYLAR[secilenAy-1]} ${secilenYil}`;
      yukleVeRender();
    },

    sonrakiAy() {
      if (secilenAy === 12) { secilenAy = 1; secilenYil++; }
      else secilenAy++;
      document.getElementById('pt-donem-baslik').textContent = `${AYLAR[secilenAy-1]} ${secilenYil}`;
      yukleVeRender();
    },

    gunDuzenle(tarih, mevcutDurum, kayitId) {
      document.getElementById('pt-modal-baslik').textContent = tarih.split('-').reverse().join('.');
      document.getElementById('pt-modal-icerik').innerHTML = `
        <form id="pt-form" class="modal-form">
          <div class="form-group"><label>Durum</label>
            <select name="durum">
              <option value="tam"         ${mevcutDurum==='tam'?'selected':''}>Tam Gün</option>
              <option value="yarim"       ${mevcutDurum==='yarim'?'selected':''}>Yarım Gün</option>
              <option value="devamsiz"    ${mevcutDurum==='devamsiz'?'selected':''}>Devamsız</option>
              <option value="izinli"      ${mevcutDurum==='izinli'?'selected':''}>İzinli</option>
              <option value="resmi_tatil" ${mevcutDurum==='resmi_tatil'?'selected':''}>Resmi Tatil</option>
            </select>
          </div>
          <div class="form-grid-2">
            <div class="form-group"><label>Giriş Saati</label><input type="time" name="giris_saati" value="09:00" /></div>
            <div class="form-group"><label>Çıkış Saati</label><input type="time" name="cikis_saati" value="18:00" /></div>
          </div>
          <div class="form-group"><label>Fazla Mesai (saat)</label><input type="number" name="fazla_mesai" value="0" min="0" max="12" step="0.5" /></div>
          <div class="form-group"><label>Notlar</label><input name="notlar" placeholder="Opsiyonel not..." /></div>
          <div id="pt-form-hata" class="hata-mesaji gizli"></div>
          <div class="modal-footer">
            <button type="button" class="btn-iptal" onclick="PuantajModul.modalKapat()">İptal</button>
            <button type="submit" class="btn-kaydet">Kaydet</button>
          </div>
        </form>
      `;
      document.getElementById('pt-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const veri = { personel_id: secilenPersonel, tarih, durum: fd.get('durum'),
          giris_saati: fd.get('giris_saati') || null, cikis_saati: fd.get('cikis_saati') || null,
          fazla_mesai: parseFloat(fd.get('fazla_mesai')) || 0, notlar: fd.get('notlar') || null };
        try {
          await apiFetch('/puantaj', { method: 'POST', body: JSON.stringify(veri) });
          this.modalKapat(); yukleVeRender();
        } catch(err) {
          const hata = document.getElementById('pt-form-hata');
          hata.textContent = err.message; hata.classList.remove('gizli');
        }
      });
      document.getElementById('pt-modal').classList.remove('gizli');
    },

    modalKapat() { document.getElementById('pt-modal').classList.add('gizli'); },

    async exportCSV() {
      const data = await apiFetch(`/puantaj/aylik?personel_id=${secilenPersonel}&yil=${secilenYil}&ay=${secilenAy}`);
      const veri = data;
      const satirlar = [
        ['Tarih','Durum','Giriş','Çıkış','Fazla Mesai'],
        ...veri.gunler.map(g => [g.tarih, DURUM_METIN[g.durum]||'', g.giris_saati||'', g.cikis_saati||'', g.fazla_mesai||0]),
      ];
      const icerik = '﻿' + satirlar.map(r => r.join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([icerik], { type: 'text/csv;charset=utf-8;' }));
      a.download = `puantaj-${secilenYil}-${String(secilenAy).padStart(2,'0')}.csv`;
      a.click();
    },
  };
})();
