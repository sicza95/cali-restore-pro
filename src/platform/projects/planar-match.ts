import type { Point } from './planar-types';

export type MatchImage = { width: number; height: number; grey: Uint8Array };
type Match = { detail: Point; reference: Point; score: number };

function descriptor(image: MatchImage, x: number, y: number) {
  const data = [];
  for (let dy = -4; dy <= 4; dy += 2)
    for (let dx = -4; dx <= 4; dx += 2) data.push(image.grey[(y + dy) * image.width + x + dx]!);
  const mean = data.reduce((total, value) => total + value, 0) / data.length;
  const spread = Math.hypot(...data.map((value) => value - mean));
  return spread < 45 ? undefined : data.map((value) => (value - mean) / spread);
}

export function proposePlanarMatch(detail: MatchImage, reference: MatchImage) {
  const candidates = [];
  for (let y = 4; y < reference.height - 4; y++) {
    for (let x = 4; x < reference.width - 4; x++) {
      const values = descriptor(reference, x, y);
      if (values) candidates.push({ x, y, values });
    }
  }
  const matches: Match[] = [];
  for (let y = 6; y < detail.height - 6; y += 5) {
    for (let x = 6; x < detail.width - 6; x += 5) {
      const sample = descriptor(detail, x, y);
      if (!sample) continue;
      let best: (typeof candidates)[number] | undefined;
      let first = -1;
      let second = -1;
      for (const candidate of candidates) {
        let score = 0;
        for (let i = 0; i < sample.length; i++) score += sample[i]! * candidate.values[i]!;
        if (score > first) {
          second = first;
          first = score;
          best = candidate;
        } else second = Math.max(second, score);
      }
      if (best && first >= 0.94 && first - second >= 0.035)
        matches.push({ detail: [x, y], reference: [best.x, best.y], score: first });
    }
  }
  const consensus = (a: Match, b: Match) =>
    Math.hypot(
      a.reference[0] - a.detail[0] - b.reference[0] + b.detail[0],
      a.reference[1] - a.detail[1] - b.reference[1] + b.detail[1],
    ) <= 1.5;
  let best: Match[] = [];
  for (const match of matches) {
    const group = matches.filter((other) => consensus(match, other));
    if (group.length > best.length) best = group;
  }
  if (
    best.length < 4 ||
    matches.some(
      (match) =>
        !best.some((member) => consensus(member, match)) &&
        matches.filter((other) => consensus(match, other)).length >= best.length * 0.8,
    )
  )
    return;
  let span = 12;
  let pair: [Match, Match] | undefined;
  best.sort((a, b) => b.score - a.score);
  for (const a of best) {
    for (const b of best) {
      const distance = Math.hypot(b.detail[0] - a.detail[0], b.detail[1] - a.detail[1]);
      if (distance > span) {
        span = distance;
        pair = [a, b];
      }
    }
  }
  return pair;
}
