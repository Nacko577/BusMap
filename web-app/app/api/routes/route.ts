import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

type Coord = [number, number];

type StoredRoute = {
  line: string;
  coord: Coord[];
};

type LineRoute = {
  line: string;
  coord: Coord[];
  sourceBusId: string;
};

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

// ----- geometry utils (same logic you had in frontend) -----
function approxMetersPerDegLng(latDeg: number) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}
function approxMetersPerDegLat() {
  return 110540;
}
function distMeters(a: Coord, b: Coord) {
  const lat0 = (a[0] + b[0]) / 2;
  const mx = approxMetersPerDegLng(lat0);
  const my = approxMetersPerDegLat();
  const ax = a[1] * mx, ay = a[0] * my;
  const bx = b[1] * mx, by = b[0] * my;
  return Math.hypot(bx - ax, by - ay);
}

function dedupeConsecutive(coords: Coord[]) {
  if (coords.length <= 1) return coords;
  const out: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const last = out[out.length - 1];
    const cur = coords[i];
    if (last[0] !== cur[0] || last[1] !== cur[1]) out.push(cur);
  }
  return out;
}

function median(nums: number[]) {
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function medianFilter(coords: Coord[], windowSize = 7): Coord[] {
  if (coords.length < windowSize) return coords;
  const half = Math.floor(windowSize / 2);
  const out: Coord[] = [];

  for (let i = 0; i < coords.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(coords.length - 1, i + half);

    const lats: number[] = [];
    const lngs: number[] = [];
    for (let j = start; j <= end; j++) {
      lats.push(coords[j][0]);
      lngs.push(coords[j][1]);
    }
    out.push([median(lats), median(lngs)]);
  }
  return out;
}

function pointToSegDistMeters(p: Coord, a: Coord, b: Coord) {
  const lat0 = (a[0] + b[0] + p[0]) / 3;
  const mx = approxMetersPerDegLng(lat0);
  const my = approxMetersPerDegLat();

  const ax = a[1] * mx, ay = a[0] * my;
  const bx = b[1] * mx, by = b[0] * my;
  const px = p[1] * mx, py = p[0] * my;

  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;

  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);

  const t = c1 / c2;
  const projx = ax + t * vx;
  const projy = ay + t * vy;
  return Math.hypot(px - projx, py - projy);
}

function simplifyRDP(coords: Coord[], epsilonMeters = 6): Coord[] {
  if (coords.length < 3) return coords;

  const keep = new Array(coords.length).fill(false);
  keep[0] = true;
  keep[coords.length - 1] = true;

  const stack: Array<[number, number]> = [[0, coords.length - 1]];

  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let idx = -1;

    for (let i = start + 1; i < end; i++) {
      const d = pointToSegDistMeters(coords[i], coords[start], coords[end]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }

    if (maxDist > epsilonMeters && idx !== -1) {
      keep[idx] = true;
      stack.push([start, idx], [idx, end]);
    }
  }

  return coords.filter((_, i) => keep[i]);
}

function angleDeg(a: Coord, b: Coord, c: Coord) {
  const bax = a[0] - b[0];
  const bay = a[1] - b[1];
  const bcx = c[0] - b[0];
  const bcy = c[1] - b[1];

  const dot = bax * bcx + bay * bcy;
  const mag1 = Math.hypot(bax, bay);
  const mag2 = Math.hypot(bcx, bcy);
  if (mag1 === 0 || mag2 === 0) return 180;

  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function removeSpikes(
  coords: Coord[],
  {
    maxAC = 35,
    minAB = 18,
    minBC = 18,
    minAngle = 55,
    passes = 3,
  }: Partial<{
    maxAC: number;
    minAB: number;
    minBC: number;
    minAngle: number;
    passes: number;
  }> = {}
) {
  if (coords.length < 3) return coords;
  let out = coords;

  for (let pass = 0; pass < passes; pass++) {
    const keep: Coord[] = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const A = keep[keep.length - 1];
      const B = out[i];
      const C = out[i + 1];

      const dAC = distMeters(A, C);
      const dAB = distMeters(A, B);
      const dBC = distMeters(B, C);
      const ang = angleDeg(A, B, C);

      const isSpike = dAC <= maxAC && dAB >= minAB && dBC >= minBC && ang <= minAngle;
      if (!isSpike) keep.push(B);
    }
    keep.push(out[out.length - 1]);
    out = keep;
  }

  return out;
}

function enforceMaxSegment(original: Coord[], simplified: Coord[], maxSeg = 60) {
  if (simplified.length < 2) return simplified;

  const indexOf = new Map<string, number>();
  for (let i = 0; i < original.length; i++) {
    const k = `${original[i][0].toFixed(6)},${original[i][1].toFixed(6)}`;
    if (!indexOf.has(k)) indexOf.set(k, i);
  }
  const idx = (p: Coord) =>
    indexOf.get(`${p[0].toFixed(6)},${p[1].toFixed(6)}`) ?? -1;

  const out: Coord[] = [simplified[0]];

  for (let i = 1; i < simplified.length; i++) {
    const prev = out[out.length - 1];
    const cur = simplified[i];

    if (distMeters(prev, cur) <= maxSeg) {
      out.push(cur);
      continue;
    }

    const a = idx(prev);
    const b = idx(cur);

    if (a !== -1 && b !== -1 && Math.abs(b - a) >= 2) {
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      const slice = original.slice(start, end + 1);
      const forward = a <= b;
      const toInsert = forward ? slice : slice.reverse();
      for (let k = 1; k < toInsert.length; k++) out.push(toInsert[k]);
    } else {
      out.push(cur);
    }
  }

  return out;
}

function cleanRoute(raw: Coord[]) {
  const d = dedupeConsecutive(raw);
  const denoised = medianFilter(d, 7);
  const despiked = removeSpikes(denoised, {
    maxAC: 35,
    minAB: 18,
    minBC: 18,
    minAngle: 55,
    passes: 3,
  });
  const simplified = simplifyRDP(despiked, 6);
  const guarded = enforceMaxSegment(despiked, simplified, 60);
  return guarded.length >= 2 ? guarded : d;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "busCoord.json");
    const raw = await readJsonSafe<Record<string, StoredRoute>>(filePath, {});

    const bestByLine: Record<string, LineRoute> = {};

    for (const [busId, r] of Object.entries(raw)) {
      const line = (r?.line ?? "?").toString().trim() || "?";
      const coord = Array.isArray(r?.coord) ? (r.coord as Coord[]) : [];

      if (coord.length < 2) continue;
      if (line === "NO_LINE" || line.startsWith("NO_") || line === "?" || line === "0") continue;

      const existing = bestByLine[line];
      if (!existing || coord.length > existing.coord.length) {
        bestByLine[line] = { line, coord, sourceBusId: busId };
      }
    }

    // ✅ Clean per-line routes here (backend)
    const cleaned: Record<string, LineRoute> = {};
    for (const [line, route] of Object.entries(bestByLine)) {
      const tail = route.coord.slice(-6000); // safety
      const coord = cleanRoute(tail);
      if (coord.length >= 2) cleaned[line] = { ...route, coord };
    }

    return NextResponse.json(cleaned);
  } catch (err) {
    console.error("routes route error:", err);
    return NextResponse.json({ error: "Failed to read routes" }, { status: 500 });
  }
}
