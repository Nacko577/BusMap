import { NextResponse } from "next/server";
import { SUCEAVA_BUS_STOPS, type LatLng, type BusStop } from "@/lib/busStops";

export const runtime = "nodejs";

type BusInput = { id: string; line: string; latitude: number; longitude: number };
type BusRoute = { line: string; coord: LatLng[] };

type PlanResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      kind: "direct" | "transfer";
      lineA: string;
      lineB?: string;
      boardStopId: string;
      transferStopId?: string;
      destStopId: string;
      closestBusId: string | null;
      walkM: number;
      walk: LatLng[];
      rideA: LatLng[];
      rideB?: LatLng[];
    };

// ---------- math ----------
function approxMetersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}
function distMeters(a: LatLng, b: LatLng) {
  const lat0 = (a[0] + b[0]) / 2;
  const mx = approxMetersPerDegLng(lat0);
  return Math.hypot((b[1] - a[1]) * mx, (b[0] - a[0]) * 110540);
}
function intersect(a: string[], b: string[]) {
  const s = new Set(b);
  return a.filter((x) => s.has(x));
}

// ---------- route slicing ----------
function nearestIdx(coords: LatLng[], p: LatLng) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distMeters(coords[i], p);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function cumDists(coords: LatLng[]) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distMeters(coords[i - 1], coords[i]));
  return out;
}

function sliceRoute(route: LatLng[], a: LatLng, b: LatLng): LatLng[] {
  if (route.length < 2) return [];
  const iA = nearestIdx(route, a);
  const iB = nearestIdx(route, b);
  if (iA === iB) return [route[iA]];

  const lo = Math.min(iA, iB), hi = Math.max(iA, iB);
  const cum = cumDists(route);
  const fwdLen = cum[hi] - cum[lo];
  const wrapLen = cum[cum.length - 1] - fwdLen;

  let seg: LatLng[];
  if (wrapLen < fwdLen) {
    seg = [...route.slice(hi), ...route.slice(0, lo + 1)];
    return iA > iB ? seg : seg.slice().reverse();
  }
  seg = route.slice(lo, hi + 1);
  return iA <= iB ? seg : seg.slice().reverse();
}

// ---------- scoring ----------
// Walk is penalised 2.5× more than waiting for a bus.
// A line with no buses running gets a large penalty instead of disqualifying it.
const WALK_WEIGHT = 2.5;
const NO_BUS_PENALTY = 3500;
const TRANSFER_PENALTY = 800;

function score(walkM: number, busDistM: number | null, transfer = false) {
  return walkM * WALK_WEIGHT + (busDistM ?? NO_BUS_PENALTY) + (transfer ? TRANSFER_PENALTY : 0);
}

function closestBusOnLine(
  buses: BusInput[],
  line: string,
  stopPos: LatLng
): { id: string; distM: number } | null {
  let best: { id: string; distM: number } | null = null;
  for (const b of buses) {
    if (b.line !== line) continue;
    const d = distMeters([b.latitude, b.longitude], stopPos);
    if (!best || d < best.distM) best = { id: b.id, distM: d };
  }
  return best;
}

// ---------- planner ----------
type DirectCandidate = {
  kind: "direct";
  lineA: string;
  board: BusStop;
  dest: BusStop;
  closestBusId: string | null;
  walkM: number;
  s: number;
};

type TransferCandidate = {
  kind: "transfer";
  lineA: string;
  lineB: string;
  board: BusStop;
  transfer: BusStop;
  dest: BusStop;
  closestBusId: string | null;
  walkM: number;
  s: number;
};

function findBestPlan(
  me: LatLng,
  dest: BusStop,
  buses: BusInput[]
): DirectCandidate | TransferCandidate | null {
  const MAX_WALK_M = 1200;

  const nearMe = SUCEAVA_BUS_STOPS
    .map((s) => ({ s, walkM: distMeters(me, s.position) }))
    .filter((x) => x.walkM <= MAX_WALK_M && x.s.lines.length > 0)
    .sort((a, b) => a.walkM - b.walkM);

  let bestDirect: DirectCandidate | null = null;
  let bestTransfer: TransferCandidate | null = null;

  for (const { s: board, walkM } of nearMe) {
    for (const lineA of board.lines) {
      if (!lineA) continue;

      // ── Direct ──
      if (dest.lines.includes(lineA)) {
        const bus = closestBusOnLine(buses, lineA, board.position);
        const s = score(walkM, bus?.distM ?? null);
        if (!bestDirect || s < bestDirect.s) {
          bestDirect = { kind: "direct", lineA, board, dest, closestBusId: bus?.id ?? null, walkM, s };
        }
      }

      // ── 1-transfer ──
      // Stops on lineA that also share a line going to dest
      const transferStops = SUCEAVA_BUS_STOPS.filter(
        (t) => t.id !== board.id && t.lines.includes(lineA)
      );
      for (const t of transferStops) {
        const lineBs = intersect(t.lines, dest.lines).filter((l) => l !== lineA);
        if (!lineBs.length) continue;

        // Geometric sanity: transfer stop must be roughly "toward" the destination,
        // not behind us. Allow up to 40% detour.
        const straight = distMeters(board.position, dest.position);
        const via = distMeters(board.position, t.position) + distMeters(t.position, dest.position);
        if (straight > 200 && via > straight * 1.4) continue;

        const bus = closestBusOnLine(buses, lineA, board.position);
        const s = score(walkM, bus?.distM ?? null, true);
        if (!bestTransfer || s < bestTransfer.s) {
          bestTransfer = {
            kind: "transfer",
            lineA,
            lineB: lineBs[0],
            board,
            transfer: t,
            dest,
            closestBusId: bus?.id ?? null,
            walkM,
            s,
          };
        }
      }
    }
  }

  // Prefer direct unless transfer scores noticeably better
  if (bestDirect && bestTransfer) {
    return bestDirect.s <= bestTransfer.s * 1.1 ? bestDirect : bestTransfer;
  }
  return bestDirect ?? bestTransfer;
}

// ---------- OSRM road-following segment ----------
async function roadSegment(from: LatLng, to: LatLng): Promise<LatLng[] | null> {
  try {
    const coords = `${from[1].toFixed(6)},${from[0].toFixed(6)};${to[1].toFixed(6)},${to[0].toFixed(6)}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return (data.routes[0].geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

// ---------- handler ----------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const me = body?.me as LatLng | undefined;
    const destStopId = body?.destStopId as string | undefined;
    const buses: BusInput[] = Array.isArray(body?.buses) ? body.buses : [];

    if (!me || !Array.isArray(me) || me.length !== 2) {
      return NextResponse.json({ ok: false, error: "Missing/invalid `me` (LatLng)." });
    }
    if (!destStopId) {
      return NextResponse.json({ ok: false, error: "Missing `destStopId`." });
    }

    const dest = SUCEAVA_BUS_STOPS.find((s) => s.id === destStopId);
    if (!dest) {
      return NextResponse.json({ ok: false, error: "Destination stop not found." });
    }
    if (!dest.lines.length) {
      return NextResponse.json({ ok: false, error: "That stop has no bus lines assigned yet." });
    }

    const plan = findBestPlan(me, dest, buses);
    if (!plan) {
      return NextResponse.json({
        ok: false,
        error: "No route found within walking distance (1.2 km). Try selecting a different destination.",
      });
    }

    // Fetch route polylines
    const routesRes = await fetch(new URL("/api/routes", req.url), { cache: "no-store" });
    const routes: Record<string, BusRoute> = routesRes.ok ? await routesRes.json() : {};

    const walk: LatLng[] = [me, plan.board.position];

    if (plan.kind === "direct") {
      const coord = routes[plan.lineA]?.coord ?? [];
      const rideA =
        (await roadSegment(plan.board.position, plan.dest.position)) ??
        (coord.length >= 2 ? sliceRoute(coord, plan.board.position, plan.dest.position) : []);
      return NextResponse.json({
        ok: true,
        kind: "direct",
        lineA: plan.lineA,
        boardStopId: plan.board.id,
        destStopId: plan.dest.id,
        closestBusId: plan.closestBusId,
        walkM: Math.round(plan.walkM),
        walk,
        rideA,
      } satisfies PlanResponse);
    }

    // Transfer — route each leg via OSRM in parallel, fall back to GPS slice
    const coordA = routes[plan.lineA]?.coord ?? [];
    const coordB = routes[plan.lineB]?.coord ?? [];
    const [rideA, rideB] = await Promise.all([
      roadSegment(plan.board.position, plan.transfer.position)
        .then((r) => r ?? (coordA.length >= 2 ? sliceRoute(coordA, plan.board.position, plan.transfer.position) : [])),
      roadSegment(plan.transfer.position, plan.dest.position)
        .then((r) => r ?? (coordB.length >= 2 ? sliceRoute(coordB, plan.transfer.position, plan.dest.position) : [])),
    ]);

    return NextResponse.json({
      ok: true,
      kind: "transfer",
      lineA: plan.lineA,
      lineB: plan.lineB,
      boardStopId: plan.board.id,
      transferStopId: plan.transfer.id,
      destStopId: plan.dest.id,
      closestBusId: plan.closestBusId,
      walkM: Math.round(plan.walkM),
      walk,
      rideA,
      rideB,
    } satisfies PlanResponse);
  } catch {
    return NextResponse.json({ ok: false, error: "Planner crashed." }, { status: 500 });
  }
}
