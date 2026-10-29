import { averageLab, compare, lightnessDiff, labToRgb, hex, sampleImage, SAMPLE_FACES } from './core.mjs';

const $ = id => document.getElementById(id);
const MAX_W = 640, MAX_NOKTA = 6;

const durum = {
  A: null, B: null,           // { data, w, h } — çizilmemiş temiz piksel verisi
  oranA: 0, oranB: 0,
  noktalar: [],               // { x, y } (0-1 arası)
  r: 6,
  fark: null,
};

// ---------- Resim yükleme ----------
function resmiOku(dosya) {
  return new Promise((ok, hata) => {
    const url = URL.createObjectURL(dosya);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); hata(new Error('Bu dosyayı resim olarak açamadım.')); };
    img.src = url;
  });
}

// Resmi istenen boyuta çizip piksellerini alır
function pikseller(kaynak, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(kaynak, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

async function yukle(hangi, dosya) {
  if (!dosya || !dosya.type.startsWith('image/')) return;
  try {
    const img = await resmiOku(dosya);
    durum['img' + hangi] = img;
    durum['oran' + hangi] = img.naturalWidth / img.naturalHeight;
    boyutla();
  } catch (e) { uyar(e.message); }
}

// "Önce" resmi boyutu belirler; "Sonra" aynı boyuta getirilir ki aynı nokta karşılaştırılsın.
function boyutla() {
  const a = durum.imgA, b = durum.imgB;
  const ana = a || b;
  if (!ana) return;
  const s = Math.min(1, MAX_W / ana.naturalWidth);
  const w = Math.max(1, Math.round(ana.naturalWidth * s)), h = Math.max(1, Math.round(ana.naturalHeight * s));
  durum.A = a ? { data: pikseller(a, w, h), w, h } : null;
  durum.B = b ? { data: pikseller(b, w, h), w, h } : null;
  hesapla();
}

function uyar(yazi) {
  $('uyari').hidden = !yazi;
  $('uyari').textContent = yazi || '';
}

// ---------- Çizim ----------
function ciz(hangi) {
  const r = durum[hangi], c = $('tuval' + hangi), kutu = $('kutu' + hangi);
  kutu.querySelector('.bos').hidden = !!r;
  if (!r) { c.width = 0; c.height = 0; return; }
  c.width = r.w; c.height = r.h;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  isaretle(g, r.w, r.h);
}

function isaretle(g, w, h) {
  const r = durum.r;
  const yazi = Math.max(12, Math.round(w / 32));
  durum.noktalar.forEach((n, i) => {
    const x = n.x * w, y = n.y * h;
    g.lineWidth = 2;
    g.strokeStyle = '#000'; g.strokeRect(x - r - 1.5, y - r - 1.5, 2 * r + 3, 2 * r + 3);
    g.strokeStyle = '#ffcf3a'; g.strokeRect(x - r - 0.5, y - r - 0.5, 2 * r + 1, 2 * r + 1);
    g.font = `800 ${yazi}px Rubik, sans-serif`;
    g.fillStyle = '#ffcf3a'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.strokeText(String(i + 1), x + r + 4, y - r);
    g.fillText(String(i + 1), x + r + 4, y - r);
  });
}

function haritaCiz() {
  const c = $('harita'), A = durum.A, f = durum.fark;
  const goster = $('haritaAc').checked && f && A;
  c.hidden = !goster;
  $('tuvalB').hidden = !!goster;
  if (!goster) return;
  c.width = A.w; c.height = A.h;
  const g = c.getContext('2d');
  const out = new ImageData(A.w, A.h);
  for (let p = 0; p < A.w * A.h; p++) {
    const k = p * 4, d = f.dL[p];
    const gri = (A.data[k] * 0.3 + A.data[k + 1] * 0.59 + A.data[k + 2] * 0.11) * 0.35;
    const t = Math.min(1, Math.abs(d) / 25);
    const hedef = d > 0 ? [255, 207, 58] : [95, 215, 255];
    for (let j = 0; j < 3; j++) out.data[k + j] = Math.round(gri * (1 - t) + hedef[j] * t);
    out.data[k + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  isaretle(g, A.w, A.h);
}

// ---------- Hesap ve sonuç ----------
function hesapla() {
  const { A, B } = durum;
  const fark = A && B && Math.abs(durum.oranA - durum.oranB) / durum.oranA > 0.03;
  uyar(fark ? 'İki resmin en-boy oranı farklı. "Sonra" resmini "Önce" boyutuna uydurdum; kırpılmışsa noktalar kayabilir.' : '');
  durum.fark = A && B ? lightnessDiff(A.data, B.data, A.w, A.h) : null;
  ciz('A'); ciz('B'); haritaCiz();
  genelYaz(); noktalariYaz();
}

const sayi = (x, n = 1) => x.toLocaleString('tr-TR', { minimumFractionDigits: n, maximumFractionDigits: n });
const isaretli = x => (x > 0 ? '+' : x < 0 ? '−' : '') + sayi(Math.abs(x));

function genelYaz() {
  const k = $('genel'), f = durum.fark;
  if (!f) {
    k.innerHTML = `<h2>Bütün resim</h2><p class="sessiz">${durum.A || durum.B ? 'Diğer resmi de koyunca' : 'İki resmi koyunca'} burada genel fark çıkacak.</p>`;
    return;
  }
  const a = f.acikOran * 100, d = f.koyuOran * 100;
  const yorum = a >= 10 && a > d * 2 ? 'Resmin bir bölümü belirgin şekilde açılmış.'
    : d >= 10 && d > a * 2 ? 'Resmin bir bölümü belirgin şekilde koyulaşmış.'
    : a + d < 3 ? 'Açıklıkta büyük bir değişiklik yok.' : 'Bazı yerler açılmış, bazı yerler koyulaşmış.';
  k.innerHTML = `<h2>Bütün resim</h2>
    <div class="buyuk">${isaretli(f.ortalama)} <small style="font-size:15px;font-weight:400">ortalama açıklık</small></div>
    <div class="cubuk"><i class="acik" style="width:${a}%"></i><i class="koyu" style="width:${d}%"></i></div>
    <div class="lejant"><span><b style="background:var(--gold)"></b>%${sayi(a, 0)} açılmış</span><span><b style="background:var(--teal)"></b>%${sayi(d, 0)} koyulaşmış</span><span>(5 birimden fazla)</span></div>
    <p class="sessiz" style="margin-top:8px">${yorum} Ortalama, değişmeyen arka planla karışır; yüzler için noktalara bak.</p>`;
}

function noktalariYaz() {
  const ol = $('noktalar');
  $('noktaBos').hidden = durum.noktalar.length > 0;
  ol.innerHTML = '';
  durum.noktalar.forEach((n, i) => {
    const li = document.createElement('li');
    const olc = r => r && averageLab(r.data, r.w, r.h, n.x * r.w, n.y * r.h, durum.r);
    const la = olc(durum.A), lb = olc(durum.B);
    const renk = lab => lab ? `<span class="renk" style="background:${hex(labToRgb(lab))}"></span>` : '<span class="renk" style="background:#000"></span>';
    let bilgi = '<span class="sessiz">İki resim de gerekli.</span>', etiket = '';
    if (la && lb) {
      const c = compare(la, lb);
      etiket = `<span class="etiket ${c.seviye}">ΔE ${sayi(c.dE)}</span>`;
      const grup = !c.ten ? 'cilt rengine benzemiyor, ten açısını göstermiyorum' : c.grupKaydi === 0 ? `ten grubu aynı (${c.grupOnce})`
        : `ten grubu <b>${c.grupOnce} → ${c.grupSonra}</b>`;
      bilgi = `<span class="yazi ${c.seviye}">${c.yazi}</span>${c.yonler.length ? ': ' + c.yonler.join(', ') : ''}.
        <div class="sayilar">L ${sayi(la[0])} → ${sayi(lb[0])} · ${c.ten ? `ten açısı ${sayi(c.itaOnce, 0)}° → ${sayi(c.itaSonra, 0)}° · ` : ''}${grup}</div>`;
    }
    li.innerHTML = `<span class="no">${i + 1}</span>
      <span class="ornekler">${renk(la)}<span class="ok">→</span>${renk(lb)} ${etiket}</span>
      <button class="sil" title="Noktayı sil" aria-label="${i + 1}. noktayı sil">×</button>
      <div class="bilgi">${bilgi}</div>`;
    li.querySelector('.sil').onclick = () => { durum.noktalar.splice(i, 1); hesapla(); };
    ol.append(li);
  });
}

// ---------- Etkileşim ----------
function tikla(e) {
  const c = e.currentTarget;
  if (!c.width) return;
  const b = c.getBoundingClientRect();
  const n = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
  if (durum.noktalar.length >= MAX_NOKTA) durum.noktalar.shift();
  durum.noktalar.push(n);
  hesapla();
}
for (const id of ['tuvalA', 'tuvalB', 'harita']) $(id).addEventListener('click', tikla);

for (const h of ['A', 'B']) {
  $('dosya' + h).addEventListener('change', e => yukle(h, e.target.files[0]));
  const kutu = $('kutu' + h);
  kutu.addEventListener('dragover', e => { e.preventDefault(); kutu.classList.add('surukle'); });
  kutu.addEventListener('dragleave', () => kutu.classList.remove('surukle'));
  kutu.addEventListener('drop', e => { e.preventDefault(); kutu.classList.remove('surukle'); yukle(h, e.dataTransfer.files[0]); });
}

$('yaricap').addEventListener('input', e => {
  durum.r = +e.target.value;
  $('yaricapYazi').textContent = `${2 * durum.r + 1} px`;
  hesapla();
});
$('haritaAc').addEventListener('change', haritaCiz);
$('temizle').onclick = () => { durum.noktalar = []; hesapla(); };

// Uydurma örnek: aynı çizim, ikincisinde yüzler beyazlatılmış
$('ornek').onclick = () => {
  const w = 560, h = 360;
  const yap = duzenli => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(sampleImage(w, h, duzenli), w, h), 0, 0); return c; };
  const a = yap(false), b = yap(true);
  a.naturalWidth = b.naturalWidth = w; a.naturalHeight = b.naturalHeight = h;
  durum.imgA = a; durum.imgB = b; durum.oranA = durum.oranB = w / h;
  durum.noktalar = SAMPLE_FACES.map(s => ({ x: s.x, y: s.y + 0.05 }));
  boyutla();
};

const q = new URLSearchParams(location.search);
if (q.has('ornek')) $('ornek').click();
if (q.has('harita')) { $('haritaAc').checked = true; haritaCiz(); }
hesapla();
