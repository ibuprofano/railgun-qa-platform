import { describe, expect, it } from 'vitest';
import { charWidthEm, estimateWordWidth, fallbackColor, interleave, wordCloud, wordSizes } from './word-cloud';
import { wordCloudSvg } from './svg';

const palette = ['#111', '#222', '#333', '#444'];

describe('wordSizes', () => {
  it('grows with the square root of the count between the limits', () => {
    expect(wordSizes([1, 4, 9], 12, 32)).toEqual([12, 22, 32]);
  });

  it('gives every word the same size when all counts are equal', () => {
    const sizes = wordSizes([3, 3, 3], 12, 32);
    expect(new Set(sizes).size).toBe(1);
  });
});

describe('interleave', () => {
  it('alternates largest and smallest', () => {
    const words = [
      { label: 'c', count: 3 },
      { label: 'a', count: 5 },
      { label: 'e', count: 1 },
      { label: 'b', count: 4 },
      { label: 'd', count: 2 },
    ];
    expect(interleave(words).map((w) => w.label)).toEqual(['a', 'e', 'b', 'd', 'c']);
  });

  it('orders ties by label, the same every time', () => {
    const words = [
      { label: 'zeta', count: 2 },
      { label: 'alpha', count: 2 },
      { label: 'mid', count: 2 },
    ];
    expect(interleave(words).map((w) => w.label)).toEqual(['alpha', 'zeta', 'mid']);
    expect(interleave([...words].reverse()).map((w) => w.label)).toEqual(['alpha', 'zeta', 'mid']);
  });
});

describe('wordCloud', () => {
  const words = [
    { key: 't1', label: 'checkout', count: 4, color: 'red' },
    { key: 't2', label: 'ui', count: 1 },
    { key: 't3', label: 'payments', count: 2, color: 'violet' },
    { key: 't4', label: 'authentication', count: 3, color: 'blue' },
  ];

  it('uses the given colour, or the same fallback colour for the same key', () => {
    const geometry = wordCloud({ words, width: 300, palette });
    const ui = geometry.words.find((w) => w.key === 't2')!;
    expect(geometry.words.find((w) => w.key === 't1')!.color).toBe('red');
    expect(ui.color).toBe(fallbackColor('t2', palette));
    expect(wordCloud({ words: [words[1]], width: 100, palette }).words[0].color).toBe(ui.color);
  });

  it('keeps every row within the width', () => {
    const width = 160;
    const geometry = wordCloud({ words, width, palette });
    for (const word of geometry.words) {
      expect(word.x - word.width / 2).toBeGreaterThanOrEqual(-0.1);
      expect(word.x + word.width / 2).toBeLessThanOrEqual(width + 0.1);
      expect(word.width).toBeCloseTo(estimateWordWidth(word.label, word.size), 0);
    }
    expect(new Set(geometry.words.map((w) => w.y)).size).toBeGreaterThan(1);
    expect(geometry.height).toBeGreaterThan(0);
  });

  it('is empty with no words', () => {
    expect(wordCloud({ words: [], width: 100, palette })).toEqual({ width: 100, height: 0, words: [] });
  });
});

describe('wide characters (chart-writer-fixes)', () => {
  it('estimates East Asian wide characters at 1 em and Latin at 0.6 em', () => {
    expect(estimateWordWidth('決済', 10)).toBeCloseTo(20);
    expect(estimateWordWidth('ab', 10)).toBeCloseTo(12);
    expect(estimateWordWidth('決済', 10) / estimateWordWidth('ab', 10)).toBeCloseTo(20 / 12);
    expect(charWidthEm('한'.codePointAt(0)!)).toBe(1);
    expect(charWidthEm('Ａ'.codePointAt(0)!)).toBe(1);
    expect(charWidthEm('ç'.codePointAt(0)!)).toBe(0.6);
  });

  it('counts a surrogate-pair ideograph once, at 1 em', () => {
    expect('𠀋'.length).toBe(2);
    expect(estimateWordWidth('𠀋', 10)).toBeCloseTo(10);
  });

  it('lays out mixed Japanese and Latin tags without overlap, inside the width', () => {
    const width = 400;
    const labels = ['決済', 'search', 'auth', 'モバイル', '認証', 'integração', 'checkout', 'ui'];
    const geometry = wordCloud({ width, palette, words: labels.map((label, i) => ({ key: `k${i}`, label, count: 9 - i })) });
    const rows = new Map<number, typeof geometry.words>();
    for (const w of geometry.words) rows.set(w.y, [...(rows.get(w.y) ?? []), w]);
    for (const row of rows.values()) {
      const spans = row.map((w) => [w.x - w.width / 2, w.x + w.width / 2]).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i += 1) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.1);
      for (const [left, right] of spans) {
        expect(left).toBeGreaterThanOrEqual(-0.1);
        expect(right).toBeLessThanOrEqual(width + 0.1);
      }
    }
    const jp = geometry.words.find((w) => w.label === '決済')!;
    expect(jp.width).toBeCloseTo(2 * jp.size, 0);
  });

  it('shrinks a Japanese tag wider than the cloud to fit', () => {
    const label = 'チェックアウトの決済が失敗する';
    const [word] = wordCloud({ width: 100, palette, words: [{ key: 'x', label, count: 1 }] }).words;
    expect(word.width).toBeLessThanOrEqual(100);
    expect(word.size).toBeCloseTo(Math.floor((100 / label.length) * 10) / 10, 1);
  });
});

describe('wordCloudSvg', () => {
  it('uses only text elements, escaped', () => {
    const svg = wordCloudSvg(wordCloud({ words: [{ key: 'x', label: 'a<b', count: 1 }], width: 100, palette }));
    const elements = [...svg.matchAll(/<([a-z]+)[\s>]/g)].map((m) => m[1]);
    expect(new Set(elements)).toEqual(new Set(['svg', 'g', 'text']));
    expect(svg).toContain('a&lt;b');
  });
});
