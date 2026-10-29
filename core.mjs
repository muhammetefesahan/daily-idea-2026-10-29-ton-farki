// Ton Farkı: renk hesapları. Ekrandan bağımsız, testle sınanabilir.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const tr1 = x => x.toFixed(1).replace('.', ',');

// --- sRGB <-> CIELAB (D65) ---
const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const WHITE = [0.95047, 1, 1.08883];
const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
const fInv = t => t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);

export function rgbToLab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  const fx = f(X / WHITE[0]), fy = f(Y / WHITE[1]), fz = f(Z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = fInv(fx) * WHITE[0], Y = fInv(fy) * WHITE[1], Z = fInv(fz) * WHITE[2];
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [R, G, B].map(c => Math.round(clamp(toSrgb(clamp(c, 0, 1)), 0, 255)));
}

// --- CIEDE2000 renk farkı (Sharma, Wu, Dalal 2005) ---
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b, a) => { if (b === 0 && a === 0) return 0; const h = deg(Math.atan2(b, a)); return h < 0 ? h + 360 : h; };
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);

  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dh / 2));

  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hm /= 2;
    else hm = hp1 + hp2 < 360 ? (hm + 360) / 2 : (hm - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm))
    + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.20 * Math.cos(rad(4 * hm - 63));
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// --- Bireysel tipoloji açısı (ITA°): cilt renginin açıklık ölçüsü ---
export const ITA_GROUPS = [
  { min: 55, ad: 'çok açık' },
  { min: 41, ad: 'açık' },
  { min: 28, ad: 'orta' },
  { min: 10, ad: 'buğday' },
  { min: -30, ad: 'esmer' },
  { min: -Infinity, ad: 'koyu' },
];
export const ita = ([L, , b]) => deg(Math.atan2(L - 50, b));
export const itaGroup = lab => ITA_GROUPS.findIndex(g => ita(lab) > g.min);

// Ten açısı sadece cilde benzeyen renklerde anlamlı: sarı-kırmızı arası ton, biraz renk.
// Mavi gökyüzü ya da gri duvar için "koyu → çok açık" gibi saçma bir sonuç vermesin.
export function skinLike([, a, b]) {
  const h = deg(Math.atan2(b, a));
  return Math.hypot(a, b) >= 6 && h >= 15 && h <= 100;
}

// --- Bir noktanın çevresindeki ortalama renk ---
// data: RGBA dizisi, (x, y): piksel, r: yarıçap (kare kutu)
export function averageLab(data, w, h, x, y, r = 6) {
  let L = 0, A = 0, B = 0, n = 0;
  const x0 = clamp(Math.round(x) - r, 0, w - 1), x1 = clamp(Math.round(x) + r, 0, w - 1);
  const y0 = clamp(Math.round(y) - r, 0, h - 1), y1 = clamp(Math.round(y) + r, 0, h - 1);
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const k = (j * w + i) * 4;
    if (data[k + 3] < 128) continue;
    const lab = rgbToLab([data[k], data[k + 1], data[k + 2]]);
    L += lab[0]; A += lab[1]; B += lab[2]; n++;
  }
  return n ? [L / n, A / n, B / n] : null;
}

// --- İki rengi karşılaştır ---
export function compare(before, after) {
  const dE = deltaE2000(before, after);
  const dL = after[0] - before[0];
  const C0 = Math.hypot(before[1], before[2]), C1 = Math.hypot(after[1], after[2]);
  const dC = C1 - C0;
  const g0 = itaGroup(before), g1 = itaGroup(after);
  let seviye, yazi;
  if (dE < 2) { seviye = 'ayni'; yazi = 'Gözle fark edilmez'; }
  else if (dE < 5) { seviye = 'az'; yazi = 'Dikkatle bakınca görülür'; }
  else if (dE < 10) { seviye = 'cok'; yazi = 'Açıkça farklı'; }
  else { seviye = 'asiri'; yazi = 'Bambaşka bir renk'; }
  const yonler = [];
  if (dL >= 3) yonler.push(`${tr1(dL)} birim açılmış`);
  if (dL <= -3) yonler.push(`${tr1(-dL)} birim koyulaşmış`);
  if (C0 > 0 && dC / C0 <= -0.15) yonler.push(`rengi %${Math.round(-dC / C0 * 100)} solmuş`);
  if (C0 > 0 && dC / C0 >= 0.15) yonler.push(`rengi %${Math.round(dC / C0 * 100)} doymuş`);
  return {
    dE, dL, dC, seviye, yazi, yonler,
    itaOnce: ita(before), itaSonra: ita(after),
    grupOnce: ITA_GROUPS[g0].ad, grupSonra: ITA_GROUPS[g1].ad,
    grupKaydi: g0 - g1,              // artı: daha açık gruba geçmiş
    ten: skinLike(before) && skinLike(after),
  };
}

// --- Bütün resmin açıklık farkı ---
// İki resim aynı boyutta olmalı. Her piksel için L farkını döndürür.
export function lightnessDiff(a, b, w, h, esik = 5) {
  const dL = new Float32Array(w * h);
  let toplam = 0, n = 0, acik = 0, koyu = 0;
  for (let p = 0; p < w * h; p++) {
    const k = p * 4;
    if (a[k + 3] < 128 || b[k + 3] < 128) continue;
    const d = rgbToLab([b[k], b[k + 1], b[k + 2]])[0] - rgbToLab([a[k], a[k + 1], a[k + 2]])[0];
    dL[p] = d; toplam += d; n++;
    if (d >= esik) acik++; else if (d <= -esik) koyu++;
  }
  return { dL, ortalama: n ? toplam / n : 0, acikOran: n ? acik / n : 0, koyuOran: n ? koyu / n : 0 };
}

// --- "Beyazlatma" filtresi: örnek düzenlenmiş resmi üretmek için ---
export function bleach(rgb, guc = 0.5) {
  const [L, a, b] = rgbToLab(rgb);
  return labToRgb([L + guc * (96 - L) * 0.7, a * (1 - guc * 0.6), b * (1 - guc * 0.7)]);
}

// --- Uydurma örnek: dört yuvarlak "yüz" ---
export const SAMPLE_FACES = [
  { x: 0.2, y: 0.42, r: 0.13, renk: [224, 172, 138] },
  { x: 0.43, y: 0.36, r: 0.15, renk: [176, 118, 82] },
  { x: 0.66, y: 0.42, r: 0.13, renk: [141, 85, 54] },
  { x: 0.84, y: 0.58, r: 0.09, renk: [198, 140, 100] },
];

// Örnek resmi çizer. duzenli=true ise yüzler beyazlatılmış, arka plan biraz parlatılmış olur.
export function sampleImage(w, h, duzenli = false) {
  const data = new Uint8ClampedArray(w * h * 4);
  const bg = (x, y) => [70 + 60 * y, 120 + 50 * x, 150 - 30 * y].map(Math.round);
  const yuzler = SAMPLE_FACES.map(s => ({ ...s, renk: duzenli ? bleach(s.renk, 0.55) : s.renk }));
  const m = Math.min(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = i / w, y = j / h;
    let c = bg(x, y);
    if (duzenli) c = c.map(v => Math.min(255, Math.round(v * 1.04 + 4)));
    for (const s of yuzler) {
      const dx = (i - s.x * w) / m, dy = (j - s.y * h) / m;
      const d = Math.hypot(dx, dy);
      if (d < s.r) {
        // Gözler: koyu küçük noktalar
        const goz = [-0.4, 0.4].some(o => Math.hypot(dx - o * s.r, dy + 0.2 * s.r) < s.r * 0.09);
        c = goz ? [40, 30, 28] : s.renk.map(v => Math.round(v * (1 - 0.18 * (d / s.r) ** 2)));
      } else if (d < s.r + 0.05 && dy > s.r * 0.55) {
        c = [190, 70, 60];  // omuz (kıyafet değişmiyor)
      }
    }
    const k = (j * w + i) * 4;
    data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
  }
  return data;
}

export const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
