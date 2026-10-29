import assert from 'node:assert/strict';
import { skinLike, rgbToLab, labToRgb, deltaE2000, ita, itaGroup, ITA_GROUPS, averageLab, compare, lightnessDiff, bleach, sampleImage, SAMPLE_FACES, hex } from './core.mjs';

let checks = 0;
const ok = fn => { fn(); checks++; };
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

// 1. sRGB -> Lab bilinen değerler
const w = rgbToLab([255, 255, 255]);
ok(() => near(w[0], 100, 0.01)); ok(() => near(w[1], 0, 0.01)); ok(() => near(w[2], 0, 0.01));
const k = rgbToLab([0, 0, 0]);
ok(() => near(k[0], 0, 0.01));
const red = rgbToLab([255, 0, 0]);
ok(() => near(red[0], 53.24, 0.02)); ok(() => near(red[1], 80.09, 0.03)); ok(() => near(red[2], 67.20, 0.03));
const gri = rgbToLab([119, 119, 119]);
ok(() => near(gri[0], 50.03, 0.05)); ok(() => near(gri[1], 0, 0.01));

// 2. Gidip gelme: Lab -> RGB aynı rengi veriyor
for (const c of [[224, 172, 138], [141, 85, 54], [12, 200, 90], [255, 255, 255], [3, 3, 3]])
  ok(() => assert.deepEqual(labToRgb(rgbToLab(c)), c));

// 3. CIEDE2000: Sharma, Wu, Dalal (2005) tablosundan çiftler
const sharma = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];
for (const [a, b, d] of sharma) {
  ok(() => near(deltaE2000(a, b), d));
  ok(() => near(deltaE2000(b, a), d));                     // sıra fark etmiyor
}
ok(() => assert.equal(deltaE2000([40, 10, 20], [40, 10, 20]), 0));

// 4. ITA° ve gruplar
ok(() => near(ita([50, 0, 20]), 0));
ok(() => near(ita([70, 0, 20]), 45));
ok(() => assert.equal(ITA_GROUPS[itaGroup([80, 5, 10])].ad, 'çok açık'));
ok(() => assert.equal(ITA_GROUPS[itaGroup([30, 10, 20])].ad, 'koyu'));
ok(() => assert.equal(ITA_GROUPS[itaGroup([55, 10, 20])].ad, 'buğday'));

ok(() => assert.ok(skinLike(rgbToLab([224, 172, 138]))));
ok(() => assert.ok(skinLike(rgbToLab([90, 56, 40]))));
ok(() => assert.ok(!skinLike(rgbToLab([70, 125, 150]))));        // mavi arka plan
ok(() => assert.ok(!skinLike(rgbToLab([128, 128, 128]))));       // gri
ok(() => assert.equal(compare(rgbToLab([70, 125, 150]), rgbToLab([80, 135, 160])).ten, false));

// 5. Ortalama renk
const W = 40, H = 20, img = new Uint8ClampedArray(W * H * 4);
for (let p = 0; p < W * H; p++) img.set(p % W < 20 ? [200, 150, 120, 255] : [60, 40, 30, 255], p * 4);
ok(() => near(averageLab(img, W, H, 5, 10, 3)[0], rgbToLab([200, 150, 120])[0], 1e-9));
const kar = averageLab(img, W, H, 19.5, 10, 2);
ok(() => assert.ok(kar[0] < rgbToLab([200, 150, 120])[0] && kar[0] > rgbToLab([60, 40, 30])[0]));
ok(() => assert.ok(averageLab(img, W, H, -50, -50, 2)));            // kenarın dışı köşeye sıkışıyor

// 6. Karşılaştırma ve karar
const once = rgbToLab([141, 85, 54]);
const sonra = rgbToLab(bleach([141, 85, 54], 0.55));
const c = compare(once, sonra);
ok(() => assert.ok(c.dE > 10));
ok(() => assert.equal(c.seviye, 'asiri'));
ok(() => assert.ok(c.dL > 15));
ok(() => assert.ok(c.yonler.some(y => y.includes('açılmış'))));
ok(() => assert.ok(c.yonler.some(y => y.includes('solmuş'))));
ok(() => assert.ok(c.grupKaydi >= 2));
ok(() => assert.equal(c.ten, true));
ok(() => assert.equal(compare(once, once).seviye, 'ayni'));
ok(() => assert.equal(compare(once, once).yonler.length, 0));
ok(() => assert.equal(compare(once, rgbToLab([145, 88, 56])).seviye, 'ayni'));
ok(() => assert.ok(compare(sonra, once).yonler.some(y => y.includes('koyulaşmış'))));

// 7. Örnek resim ve fark haritası
const SW = 120, SH = 80;
const A = sampleImage(SW, SH, false), B = sampleImage(SW, SH, true);
ok(() => assert.equal(A.length, SW * SH * 4));
const diff = lightnessDiff(A, B, SW, SH);
ok(() => assert.ok(diff.ortalama > 0));
ok(() => assert.ok(diff.acikOran > 0.08 && diff.acikOran < 0.4));
ok(() => assert.equal(diff.koyuOran, 0));
ok(() => assert.equal(lightnessDiff(A, A, SW, SH).acikOran, 0));
const yuzFark = SAMPLE_FACES.map(s => compare(averageLab(A, SW, SH, s.x * SW, s.y * SH + 3, 2), averageLab(B, SW, SH, s.x * SW, s.y * SH + 3, 2)));
for (const r of yuzFark) ok(() => assert.ok(r.dE > 5 && r.dL > 5, `${r.dE}`));
// Aynı filtre koyu yüzü açık yüzden daha çok değiştiriyor
ok(() => assert.ok(yuzFark[2].dE > yuzFark[0].dE + 5));
// Arka plan neredeyse aynı kalıyor
const bg = compare(averageLab(A, SW, SH, 3, 3, 2), averageLab(B, SW, SH, 3, 3, 2));
ok(() => assert.ok(bg.dE < 5, `arka plan ${bg.dE}`));

ok(() => assert.equal(hex([255, 0, 16]), '#ff0010'));

console.log(`${checks} kontrol geçti.`);
