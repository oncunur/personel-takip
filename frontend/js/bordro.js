// ─── Bordro Modülü ─────────────────────────────────────────────────
const BordroModul = (() => {
  const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  let personeller = [];
  let bordrolar = [];

  const DURUM_RENK   = { taslak:'#855900', onaylandi:'#00802F', odendi:'#006CE0' };
  const DURUM_ETIKET = { taslak:'Taslak', onaylandi:'Onaylandı', odendi:'Ödendi' };


  function tl(n) { return '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }

  async function apiFetch(url, opts = {}) {
    const token = Auth.getToken();
    try {
      const res = await fetch('http://localhost:8000' + url, {
        ...opts, headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...(opts.headers||{}) },
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

  function listeRender(bordrolar) {
    const tbody = document.getElementById('bordro-tbody');
    if (!bordrolar.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400)">Bordro bulunamadı</td></tr>`;
      return;
    }
    tbody.innerHTML = bordrolar.map(b => `
      <tr>
        <td>
          <div style="font-weight:600;color:var(--gray-900)">${b.personel_ad}</div>
          <div style="font-size:12px;color:var(--gray-400)">${b.personel_departman||''}</div>
        </td>
        <td style="font-size:13px">${AYLAR[b.ay-1]} ${b.yil}</td>
        <td style="font-size:13px">${tl(b.baz_maas)}</td>
        <td style="font-size:13px;color:#00802F;font-weight:600">${tl(b.brut_maas)}</td>
        <td>
          <div style="font-size:12px;color:var(--gray-500)">SGK: ${tl(b.sgk_isci)}</div>
          <div style="font-size:12px;color:var(--gray-500)">GV: ${tl(b.gelir_vergisi)}</div>
        </td>
        <td style="font-size:14px;font-weight:700;color:var(--primary)">${tl(b.net_maas)}</td>
        <td>
          <span class="durum-badge" style="background:${DURUM_RENK[b.durum]}22;color:${DURUM_RENK[b.durum]}">${DURUM_ETIKET[b.durum]}</span>
        </td>
        <td class="islem-td">
          <button class="btn-ikon" onclick="BordroModul.detayAc(${b.id})" title="Detay">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
          </button>
          ${b.durum==='taslak' ? `
          <button class="btn-ikon" onclick="BordroModul.onayla(${b.id})" title="Onayla">
            <svg viewBox="0 0 20 20" fill="currentColor" style="color:#00802F"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
          </button>` : ''}
          ${b.durum==='onaylandi' ? `
          <button class="btn-ikon" onclick="BordroModul.odendi(${b.id})" title="Ödendi İşaretle">
            <svg viewBox="0 0 20 20" fill="currentColor" style="color:#006CE0"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/></svg>
          </button>` : ''}
          ${b.durum!=='odendi' ? `
          <button class="btn-ikon btn-sil" onclick="BordroModul.sil(${b.id})" title="Sil">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  async function yukleVeRender(filtreler = {}) {
    const params = new URLSearchParams(filtreler).toString();
    const data = await apiFetch(`/bordro?${params}&limit=50`);
    bordrolar = data.veriler;
    listeRender(bordrolar);
  }

  function hesaplamaFormHtml() {
    const bugun = new Date();
    const pOptions = (personeller)
      .map(p => `<option value="${p.id}" data-maas="${p.maas||0}">${p.ad} ${p.soyad}</option>`).join('');
    return `
      <form id="bordro-form" class="modal-form">
        <div class="form-group"><label>Personel *</label>
          <select name="personel_id" id="bf-personel" required onchange="BordroModul.personelSecildi(this)">
            <option value="">Seçiniz</option>${pOptions}
          </select>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Yıl *</label>
            <input type="number" name="yil" value="${bugun.getFullYear()}" required />
          </div>
          <div class="form-group"><label>Ay *</label>
            <select name="ay" required>
              ${AYLAR.map((a,i)=>`<option value="${i+1}" ${i===bugun.getMonth()?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Baz Maaş (₺) *</label>
          <input type="number" name="baz_maas" id="bf-maas" step="0.01" required oninput="BordroModul.onizle()" />
        </div>
        <div class="bordro-puantaj-kutu">
          <div>
            <strong>Puantajdan doldur</strong>
            <span class="hucre-alt" id="bf-puantaj-bilgi">Seçilen personel ve dönemin puantaj verisini aktarır.</span>
          </div>
          <button type="button" class="btn-mini" id="bf-puantaj-btn" onclick="BordroModul.puantajdanDoldur()">Aktar</button>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Çalışılan Gün</label>
            <input type="number" name="calisilan_gun" id="bf-gun" value="22" min="1" max="31" oninput="BordroModul.onizle()" />
          </div>
          <div class="form-group"><label>Fazla Mesai (saat)</label>
            <input type="number" name="fazla_mesai_saat" id="bf-fm" value="0" min="0" step="0.5" oninput="BordroModul.onizle()" />
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Prim (₺)</label>
            <input type="number" name="prim" value="0" step="0.01" oninput="BordroModul.onizle()" />
          </div>
          <div class="form-group"><label>Diğer Eklemeler (₺)</label>
            <input type="number" name="diger_eklemeler" value="0" step="0.01" oninput="BordroModul.onizle()" />
          </div>
        </div>

        <!-- Hesaplama önizleme -->
        <div id="bordro-onizle" class="bordro-onizle-panel gizli">
          <div class="onizle-baslik">Hesaplama Önizleme</div>
          <div class="onizle-satirlar" id="onizle-satirlar"></div>
        </div>

        <div class="form-group"><label>Notlar</label><textarea name="notlar" rows="2"></textarea></div>
        <div id="bordro-form-hata" class="hata-mesaji gizli"></div>
        <div class="modal-footer">
          <button type="button" class="btn-iptal" onclick="BordroModul.modalKapat()">İptal</button>
          <button type="submit" class="btn-kaydet">Bordro Oluştur</button>
        </div>
      </form>
    `;
  }

  let onizleTimeout = null;

  return {
    async yukle() {
      const pData = await apiFetch('/personel?limit=100');
      personeller = pData.veriler;

      const bugun = new Date();
      document.getElementById('content-area').innerHTML = `
        <div class="personel-toolbar">
          <div class="arama-grup">
            <select id="br-filtre-ay" class="filtre-select">
              <option value="">Tüm Aylar</option>
              ${AYLAR.map((a,i)=>`<option value="${i+1}" ${i===bugun.getMonth()?'selected':''}>${a}</option>`).join('')}
            </select>
            <select id="br-filtre-yil" class="filtre-select">
              ${[0,1,2].map(i=>`<option value="${bugun.getFullYear()-i}">${bugun.getFullYear()-i}</option>`).join('')}
            </select>
            <select id="br-filtre-durum" class="filtre-select">
              <option value="">Tüm Durumlar</option>
              <option value="taslak">Taslak</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="odendi">Ödendi</option>
            </select>
          </div>
          <button class="btn-yeni" onclick="BordroModul.yeniAc()">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Bordro Oluştur
          </button>
        </div>

        <div class="panel" style="overflow:hidden">
          <table class="personel-tablo">
            <thead><tr>
              <th>Personel</th><th>Dönem</th><th>Baz Maaş</th><th>Brüt</th>
              <th>Kesintiler</th><th>Net Maaş</th><th>Durum</th><th>İşlem</th>
            </tr></thead>
            <tbody id="bordro-tbody">
              <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400)">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>

        <div id="bordro-modal" class="modal-overlay gizli">
          <div class="modal-kart" style="max-width:600px">
            <div class="modal-header">
              <h3 id="bordro-modal-baslik">Bordro</h3>
              <button class="modal-kapat" onclick="BordroModul.modalKapat()">×</button>
            </div>
            <div id="bordro-modal-icerik"></div>
          </div>
        </div>
      `;

      ['br-filtre-ay','br-filtre-yil','br-filtre-durum'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
          const f = {};
          const ay = document.getElementById('br-filtre-ay').value;
          const yil = document.getElementById('br-filtre-yil').value;
          const durum = document.getElementById('br-filtre-durum').value;
          if (ay) f.ay = ay;
          if (yil) f.yil = yil;
          if (durum) f.durum = durum;
          yukleVeRender(f);
        });
      });

      yukleVeRender({ ay: bugun.getMonth() + 1, yil: bugun.getFullYear() });
    },

    yeniAc() {
      document.getElementById('bordro-modal-baslik').textContent = 'Bordro Oluştur';
      document.getElementById('bordro-modal-icerik').innerHTML = hesaplamaFormHtml();
      document.getElementById('bordro-modal').classList.remove('gizli');
      document.getElementById('bordro-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const veri = {
          personel_id: parseInt(fd.get('personel_id')),
          yil: parseInt(fd.get('yil')), ay: parseInt(fd.get('ay')),
          baz_maas: parseFloat(fd.get('baz_maas')),
          prim: parseFloat(fd.get('prim')) || 0,
          diger_eklemeler: parseFloat(fd.get('diger_eklemeler')) || 0,
          calisilan_gun: parseInt(fd.get('calisilan_gun')) || 22,
          fazla_mesai_saat: parseFloat(fd.get('fazla_mesai_saat')) || 0,
          notlar: fd.get('notlar') || null,
        };
        const hata = document.getElementById('bordro-form-hata');
        try {
          await apiFetch('/bordro', { method:'POST', body: JSON.stringify(veri) });
          this.modalKapat();
          yukleVeRender();
        } catch(err) { hata.textContent = err.message; hata.classList.remove('gizli'); }
      });
    },

    // Bordro çalışılan günü elle isteniyordu; puantajda işlenmiş veri
    // varken onu yeniden girmek hem zaman kaybı hem hata kaynağı.
    async puantajdanDoldur() {
      const form = document.getElementById('bordro-form');
      const pid = form.querySelector('[name=personel_id]').value;
      const yil = form.querySelector('[name=yil]').value;
      const ay = form.querySelector('[name=ay]').value;
      const bilgi = document.getElementById('bf-puantaj-bilgi');
      const btn = document.getElementById('bf-puantaj-btn');

      if (!pid) { bilgi.textContent = 'Önce personel seçin.'; return; }

      btn.disabled = true;
      try {
        const o = await apiFetch(`/bordro/puantaj-ozeti?personel_id=${pid}&yil=${yil}&ay=${ay}`);
        if (!o.kayit_sayisi) {
          bilgi.textContent = 'Bu dönemde puantaj kaydı yok.';
          return;
        }
        document.getElementById('bf-gun').value = o.calisilan_gun;
        document.getElementById('bf-fm').value = o.fazla_mesai;
        if (o.baz_maas && !document.getElementById('bf-maas').value) {
          document.getElementById('bf-maas').value = o.baz_maas;
        }
        const saat = o.toplam_saat % 1 === 0 ? o.toplam_saat : o.toplam_saat.toFixed(1).replace('.', ',');
        bilgi.textContent = `${o.calisilan_gun} gün · ${saat} saat aktarıldı`
          + (o.devamsiz_gun ? ` · ${o.devamsiz_gun} devamsız` : '')
          + (o.izinli_gun ? ` · ${o.izinli_gun} izinli` : '');
        this.onizle();
      } catch (err) {
        bilgi.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    },

    personelSecildi(sel) {
      const opt = sel.options[sel.selectedIndex];
      const maas = opt.dataset.maas;
      if (maas) { document.getElementById('bf-maas').value = maas; this.onizle(); }
    },

    async onizle() {
      clearTimeout(onizleTimeout);
      onizleTimeout = setTimeout(async () => {
        const maas = parseFloat(document.getElementById('bf-maas')?.value);
        if (!maas) return;
        const fm = parseFloat(document.querySelector('[name="fazla_mesai_saat"]')?.value) || 0;
        const prim = parseFloat(document.querySelector('[name="prim"]')?.value) || 0;
        const diger = parseFloat(document.querySelector('[name="diger_eklemeler"]')?.value) || 0;
        const gun = parseInt(document.querySelector('[name="calisilan_gun"]')?.value) || 22;

        const res = await apiFetch(`/bordro/hesapla?baz_maas=${maas}&fazla_mesai_saat=${fm}&prim=${prim}&diger=${diger}&calisilan_gun=${gun}`)
          || _localHesapla(maas, fm, prim, diger, gun);

        const panel = document.getElementById('bordro-onizle');
        const satirlar = document.getElementById('onizle-satirlar');
        if (!panel || !satirlar) return;
        panel.classList.remove('gizli');
        satirlar.innerHTML = `
          <div class="onizle-satir"><span>Brüt Maaş</span><strong>${tl(res.brut_maas)}</strong></div>
          <div class="onizle-satir kesinti"><span>SGK İşçi Payı (%14)</span><span>- ${tl(res.sgk_isci)}</span></div>
          <div class="onizle-satir kesinti"><span>İşsizlik Sigortası (%1)</span><span>- ${tl(res.issizlik_isci)}</span></div>
          <div class="onizle-satir kesinti"><span>Gelir Vergisi</span><span>- ${tl(res.gelir_vergisi)}</span></div>
          <div class="onizle-satir kesinti"><span>Damga Vergisi (%0.759)</span><span>- ${tl(res.damga_vergisi)}</span></div>
          <div class="onizle-satir net"><span>Net Maaş</span><strong>${tl(res.net_maas)}</strong></div>
        `;
      }, 400);
    },

    detayAc(id) {
      const b = bordrolar.find(x => x.id === id) || {};
      document.getElementById('bordro-modal-baslik').textContent = `${b.personel_ad} — ${AYLAR[(b.ay||1)-1]} ${b.yil}`;
      document.getElementById('bordro-modal-icerik').innerHTML = `
        <div class="detay-grid">
          <div class="detay-satir"><span>Baz Maaş</span><strong>${tl(b.baz_maas)}</strong></div>
          <div class="detay-satir"><span>Fazla Mesai Ücreti</span><strong>${tl(b.fazla_mesai_ucr)}</strong></div>
          <div class="detay-satir"><span>Prim</span><strong>${tl(b.prim)}</strong></div>
          <div class="detay-satir"><span>Diğer Eklemeler</span><strong>${tl(b.diger_eklemeler)}</strong></div>
          <div class="detay-satir" style="font-weight:700"><span>Brüt Maaş</span><strong style="color:#00802F">${tl(b.brut_maas)}</strong></div>
          <div class="detay-satir"><span>SGK İşçi (%14)</span><span style="color:#DB0000">- ${tl(b.sgk_isci)}</span></div>
          <div class="detay-satir"><span>İşsizlik (%1)</span><span style="color:#DB0000">- ${tl(b.issizlik_isci)}</span></div>
          <div class="detay-satir"><span>Gelir Vergisi</span><span style="color:#DB0000">- ${tl(b.gelir_vergisi)}</span></div>
          <div class="detay-satir"><span>Damga Vergisi</span><span style="color:#DB0000">- ${tl(b.damga_vergisi)}</span></div>
          <div class="detay-satir" style="font-size:17px;font-weight:700"><span>Net Maaş</span><strong style="color:var(--primary)">${tl(b.net_maas)}</strong></div>
          <div class="detay-satir"><span>Çalışılan Gün</span><strong>${b.calisilan_gun}</strong></div>
          <div class="detay-satir"><span>Durum</span><span class="durum-badge" style="background:${DURUM_RENK[b.durum]}22;color:${DURUM_RENK[b.durum]}">${DURUM_ETIKET[b.durum]}</span></div>
          ${b.notlar ? `<div class="detay-satir detay-tam"><span>Notlar</span><strong>${b.notlar}</strong></div>` : ''}
        </div>
        <div class="modal-footer"><button class="btn-iptal" onclick="BordroModul.modalKapat()">Kapat</button></div>
      `;
      document.getElementById('bordro-modal').classList.remove('gizli');
    },

    async onayla(id) {
      try {
        await apiFetch(`/bordro/${id}`, { method:'PUT', body: JSON.stringify({ durum:'onaylandi' }) });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async odendi(id) {
      if (!confirm('Bu bordroyu "Ödendi" olarak işaretlemek istediğinizden emin misiniz?')) return;
      try {
        await apiFetch(`/bordro/${id}`, { method:'PUT', body: JSON.stringify({ durum:'odendi' }) });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    async sil(id) {
      if (!confirm('Bu bordroyu silmek istediğinizden emin misiniz?')) return;
      try {
        await apiFetch(`/bordro/${id}`, { method:'DELETE' });
        yukleVeRender();
      } catch(err) { alert(err.message); }
    },

    modalKapat() { document.getElementById('bordro-modal').classList.add('gizli'); },
  };
})();

function _localHesapla(maas, fm, prim, diger, gun) {
  const brut = maas * (gun / 22) + (maas / 176) * 1.5 * fm + prim + diger;
  const sgk = brut * 0.14;
  const isiz = brut * 0.01;
  const gv = (brut - sgk - isiz) * 0.15;
  const dv = brut * 0.00759;
  return { brut_maas: brut, sgk_isci: sgk, issizlik_isci: isiz, gelir_vergisi: gv, damga_vergisi: dv, net_maas: brut - sgk - isiz - gv - dv };
}
