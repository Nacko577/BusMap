/**
 * generateRoutes.mjs
 *
 * Run locally to (re)generate public/routes.json from the collected GPS traces.
 *   node scripts/generateRoutes.mjs
 *
 * Options:
 *   --only 110,113   Only reprocess these comma-separated lines, merging into existing routes.json
 *
 * Requires Node 18+ (built-in fetch). No extra dependencies.
 * After running, commit public/routes.json so Vercel can serve it as a static asset.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------- CLI args ----------
const onlyIdx = process.argv.indexOf("--only");
const onlyLines = onlyIdx !== -1 && process.argv[onlyIdx + 1]
  ? new Set(process.argv[onlyIdx + 1].split(",").map(s => s.trim()))
  : null;

// ---------- geometry utils ----------
function approxMetersPerDegLng(latDeg) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}
function distMeters(a, b) {
  const lat0 = (a[0] + b[0]) / 2;
  const mx = approxMetersPerDegLng(lat0);
  const my = 110540;
  return Math.hypot((b[1] - a[1]) * mx, (b[0] - a[0]) * my);
}

function dedupeConsecutive(coords) {
  if (coords.length <= 1) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const last = out[out.length - 1];
    if (last[0] !== coords[i][0] || last[1] !== coords[i][1]) out.push(coords[i]);
  }
  return out;
}

function median(nums) {
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function medianFilter(coords, windowSize = 7) {
  if (coords.length < windowSize) return coords;
  const half = Math.floor(windowSize / 2);
  return coords.map((_, i) => {
    const s = Math.max(0, i - half), e = Math.min(coords.length - 1, i + half);
    const lats = [], lngs = [];
    for (let j = s; j <= e; j++) { lats.push(coords[j][0]); lngs.push(coords[j][1]); }
    return [median(lats), median(lngs)];
  });
}

function pointToSegDist(p, a, b) {
  const lat0 = (a[0] + b[0] + p[0]) / 3;
  const mx = approxMetersPerDegLng(lat0), my = 110540;
  const ax = a[1]*mx, ay = a[0]*my, bx = b[1]*mx, by = b[0]*my;
  const px = p[1]*mx, py = p[0]*my;
  const vx = bx-ax, vy = by-ay, wx = px-ax, wy = py-ay;
  const c1 = vx*wx + vy*wy;
  if (c1 <= 0) return Math.hypot(px-ax, py-ay);
  const c2 = vx*vx + vy*vy;
  if (c2 <= c1) return Math.hypot(px-bx, py-by);
  const t = c1/c2;
  return Math.hypot(px-(ax+t*vx), py-(ay+t*vy));
}

function simplifyRDP(coords, eps = 6) {
  if (coords.length < 3) return coords;
  const keep = new Array(coords.length).fill(false);
  keep[0] = keep[coords.length-1] = true;
  const stack = [[0, coords.length-1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = s+1; i < e; i++) {
      const d = pointToSegDist(coords[i], coords[s], coords[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx !== -1) { keep[idx] = true; stack.push([s,idx],[idx,e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

function angleDeg(a, b, c) {
  const bax = a[0]-b[0], bay = a[1]-b[1], bcx = c[0]-b[0], bcy = c[1]-b[1];
  const dot = bax*bcx + bay*bcy;
  const mag = Math.hypot(bax,bay) * Math.hypot(bcx,bcy);
  if (mag === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot/mag))) * 180) / Math.PI;
}

function removeSpikes(coords, { maxAC=35, minAB=18, minBC=18, minAngle=55, passes=3 } = {}) {
  let out = coords;
  for (let p = 0; p < passes; p++) {
    const keep = [out[0]];
    for (let i = 1; i < out.length-1; i++) {
      const A = keep[keep.length-1], B = out[i], C = out[i+1];
      const isSpike = distMeters(A,C) <= maxAC && distMeters(A,B) >= minAB &&
                      distMeters(B,C) >= minBC && angleDeg(A,B,C) <= minAngle;
      if (!isSpike) keep.push(B);
    }
    keep.push(out[out.length-1]);
    out = keep;
  }
  return out;
}

function enforceMaxSegment(original, simplified, maxSeg = 60) {
  if (simplified.length < 2) return simplified;
  const indexOf = new Map();
  for (let i = 0; i < original.length; i++) {
    const k = `${original[i][0].toFixed(6)},${original[i][1].toFixed(6)}`;
    if (!indexOf.has(k)) indexOf.set(k, i);
  }
  const idx = p => indexOf.get(`${p[0].toFixed(6)},${p[1].toFixed(6)}`) ?? -1;
  const out = [simplified[0]];
  for (let i = 1; i < simplified.length; i++) {
    const prev = out[out.length-1], cur = simplified[i];
    if (distMeters(prev, cur) <= maxSeg) { out.push(cur); continue; }
    const a = idx(prev), b = idx(cur);
    if (a !== -1 && b !== -1 && Math.abs(b-a) >= 2) {
      const slice = original.slice(Math.min(a,b), Math.max(a,b)+1);
      const toInsert = a <= b ? slice : slice.reverse();
      for (let k = 1; k < toInsert.length; k++) out.push(toInsert[k]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function cleanRoute(raw) {
  const d = dedupeConsecutive(raw);
  const denoised = medianFilter(d, 7);
  const despiked = removeSpikes(denoised);
  const simplified = simplifyRDP(despiked, 6);
  const guarded = enforceMaxSegment(despiked, simplified, 60);
  const result = guarded.length >= 2 ? guarded : d;
  // Cap to avoid runaway point counts from enforceMaxSegment re-inserting raw points
  return result.length > 2000 ? subsample(result, 2000) : result;
}

// ---------- OSRM ----------
function subsample(coords, maxPts) {
  if (coords.length <= maxPts) return coords;
  const out = [coords[0]];
  const step = (coords.length - 1) / (maxPts - 1);
  for (let i = 1; i < maxPts - 1; i++) out.push(coords[Math.round(i * step)]);
  out.push(coords[coords.length - 1]);
  return out;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function snapToRoads(coords, retries = 3) {
  // Route API: finds the actual road path between waypoints.
  // Better than match API for sparse GPS data — no straight-line gaps.
  const sample = subsample(coords, 10);
  const coordStr = sample.map(c => `${c[1].toFixed(5)},${c[0].toFixed(5)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "Ok" && data.routes?.length) {
          const out = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          if (out.length >= 2) return out;
        }
        console.warn(`    OSRM attempt ${attempt}/${retries}: bad response (code=${data.code}, message=${data.message ?? ""})`);
      } else {
        const body = await res.text().then(t => t.slice(0, 200));
        console.warn(`    OSRM attempt ${attempt}/${retries} status ${res.status}: ${body}`);
      }
    } catch (e) {
      console.warn(`    OSRM attempt ${attempt}/${retries} error: ${e.message}`);
    }
    if (attempt < retries) await sleep(attempt * 4000);
  }
  return null;
}

// ---------- main ----------
async function main() {
  const coordPath = join(ROOT, "busCoord.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(coordPath, "utf-8"));
  } catch {
    console.error("Could not read busCoord.json — run the app locally first to collect GPS data.");
    process.exit(1);
  }

  const outPath = join(ROOT, "public", "routes.json");

  // Load existing routes so --only mode can merge into them
  let existingResult = {};
  try {
    existingResult = JSON.parse(readFileSync(outPath, "utf-8"));
  } catch {
    // no existing file, start fresh
  }

  const allByLine = {};
  for (const [, r] of Object.entries(raw)) {
    const line = (r?.line ?? "?").toString().trim() || "?";
    const coord = Array.isArray(r?.coord) ? r.coord : [];
    if (coord.length < 2) continue;
    if (line === "NO_LINE" || line.startsWith("NO_") || line === "?" || line === "0" || line.endsWith(".")) continue;
    if (line === "10500" || line === "999H") continue;
    if (!allByLine[line]) allByLine[line] = [];
    allByLine[line].push(...coord.slice(-6000));
  }

  let lines = Object.keys(allByLine).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (onlyLines) {
    const missing = [...onlyLines].filter(l => !allByLine[l]);
    if (missing.length) console.warn(`Warning: no GPS data found for lines: ${missing.join(", ")}`);
    lines = lines.filter(l => onlyLines.has(l));
    console.log(`--only mode: processing lines ${lines.join(", ")}\n`);
  } else {
    console.log(`Found ${lines.length} lines: ${lines.join(", ")}\n`);
  }

  const result = onlyLines ? { ...existingResult } : {};

  for (const line of lines) {
    await sleep(1000);
    const combined = allByLine[line];
    console.log(`Line ${line}: ${combined.length} combined raw points`);

    const coord = cleanRoute(combined);
    if (coord.length < 2) { console.log("  Skipped (too few points after cleaning)\n"); continue; }
    console.log(`  Cleaned → ${coord.length} points, snapping to roads…`);

    const snapped = await snapToRoads(coord);
    if (snapped) {
      console.log(`  Snapped → ${snapped.length} road points ✓\n`);
      result[line] = { line, coord: snapped };
    } else {
      console.log(`  OSRM failed after all retries, keeping cleaned GPS trace\n`);
      result[line] = { line, coord };
    }
  }

  writeFileSync(outPath, JSON.stringify(result));
  console.log(`Wrote ${Object.keys(result).length} routes → public/routes.json`);
  if (onlyLines) console.log("(Other lines preserved from existing routes.json)");
  console.log("Commit this file and deploy to Vercel.");
}

main().catch(err => { console.error(err); process.exit(1); });
