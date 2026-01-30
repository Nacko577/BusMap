import { NextResponse } from "next/server";
import { SUCEAVA_BUS_STOPS, type LatLng } from "@/lib/busStops";

export const runtime = "nodejs";

type BusRoute = {
  line: string;
  coord: LatLng[];
  sourceBusId?: string;
};

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
      walk: LatLng[];     // [me, boardStop]
      rideA: LatLng[];    // sliced polyline on lineA
      rideB?: LatLng[];   // sliced polyline on lineB (if transfer)
    };

// ---------- math helpers (fast) ----------
function approxMetersPerDegLng(latDeg: number) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}
function approxMetersPerDegLat() {
  return 110540;
}
function distMeters(a: LatLng, b: LatLng) {
  const lat0 = (a[0] + b[0]) / 2;
  const mx = approxMetersPerDegLng(lat0);
  const my = approxMetersPerDegLat();
  const ax = a[1] * mx,
    ay = a[0] * my;
  const bx = b[1] * mx,
    by = b[0] * my;
  return Math.hypot(bx - ax, by - ay);
}

function intersect(a: string[] = [], b: string[] = []) {
  const sb = new Set(b);
  return a.filter((x) => sb.has(x));
}

function nearestIndexOnPolyline(coords: LatLng[], p: LatLng) {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distMeters(coords[i], p);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function cumulativeDistances(coords: LatLng[]) {
  const out: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    out.push(out[i - 1] + distMeters(coords[i - 1], coords[i]));
  }
  return out;
}

// slice route between stop A and B (choose shorter arc if loop)
function sliceRouteBetweenStops(route: LatLng[], a: LatLng, b: LatLng) {
  if (!route || route.length < 2) return null;

  const iA = nearestIndexOnPolyline(route, a);
  const iB = nearestIndexOnPolyline(route, b);
  if (iA === iB) return [route[iA], route[iA]] as LatLng[];

  const lo = Math.min(iA, iB);
  const hi = Math.max(iA, iB);

  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1];

  const forwardLen = cum[hi] - cum[lo];
  const wrapLen = total - forwardLen;

  if (wrapLen < forwardLen) {
    const seg1 = route.slice(hi);
    const seg2 = route.slice(0, lo + 1);
    const merged = [...seg1, ...seg2];
    return iA <= iB ? merged : merged.slice().reverse();
  }

  const sliced = route.slice(lo, hi + 1);
  return iA <= iB ? sliced : sliced.slice().reverse();
}

function pickBestBoardStop(me: LatLng, destLines: string[]) {
  // choose nearest stop to me that shares a line with destination
  const candidates = SUCEAVA_BUS_STOPS
    .map((s) => ({ s, d: distMeters(me, s.position) }))
    .filter((x) => x.d <= 900 && intersect(x.s.lines, destLines).length > 0)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10);

  return candidates.length ? candidates[0].s : null;
}

function computePlanStops(me: LatLng, destStopId: string) {
  const dest = SUCEAVA_BUS_STOPS.find((s) => s.id === destStopId);
  if (!dest) return { ok: false as const, error: "Destination stop not found." };

  // direct
  const board = pickBestBoardStop(me, dest.lines);
  if (board) {
    const shared = intersect(board.lines, dest.lines).filter(Boolean);
    if (shared.length) {
      return {
        ok: true as const,
        kind: "direct" as const,
        lineA: shared[0],
        board,
        dest,
      };
    }
  }

  // 1 transfer
  const nearStops = SUCEAVA_BUS_STOPS
    .map((s) => ({ s, d: distMeters(me, s.position) }))
    .filter((x) => x.d <= 900 && x.s.lines.length)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((x) => x.s);

  for (const bStop of nearStops) {
    for (const lineA of bStop.lines) {
      if (!lineA) continue;

      // transfer must be on lineA and also share any dest line (lineB)
      const transferCandidates = SUCEAVA_BUS_STOPS.filter((t) => t.lines.includes(lineA));
      for (const t of transferCandidates) {
        const lineBs = intersect(t.lines, dest.lines).filter((x) => x !== lineA);
        if (!lineBs.length) continue;

        return {
          ok: true as const,
          kind: "transfer" as const,
          lineA,
          lineB: lineBs[0],
          board: bStop,
          transfer: t,
          dest,
        };
      }
    }
  }

  return { ok: false as const, error: "No direct or 1-transfer route found with current stop/line data." };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const me = body?.me as LatLng | undefined;
    const destStopId = body?.destStopId as string | undefined;

    if (!me || !Array.isArray(me) || me.length !== 2) {
      const out: PlanResponse = { ok: false, error: "Missing/invalid `me` (LatLng)." };
      return NextResponse.json(out, { status: 400 });
    }
    if (!destStopId) {
      const out: PlanResponse = { ok: false, error: "Missing `destStopId`." };
      return NextResponse.json(out, { status: 400 });
    }

    const planStops = computePlanStops(me, destStopId);
    if (!planStops.ok) {
      const out: PlanResponse = { ok: false, error: planStops.error };
      return NextResponse.json(out, { status: 200 });
    }

    // pull routes from your existing /api/routes
    const routesRes = await fetch(new URL("/api/routes", req.url), { cache: "no-store" });
    if (!routesRes.ok) {
      const out: PlanResponse = { ok: false, error: "Failed to load routes from /api/routes." };
      return NextResponse.json(out, { status: 500 });
    }
    const routes = (await routesRes.json()) as Record<string, BusRoute>;

    const walk = [me, planStops.board.position] as LatLng[];

    if (planStops.kind === "direct") {
      const routeA = routes[planStops.lineA]?.coord;
      if (!routeA || routeA.length < 2) {
        const out: PlanResponse = { ok: false, error: `No route polyline found for line ${planStops.lineA}.` };
        return NextResponse.json(out, { status: 200 });
      }

      const rideA = sliceRouteBetweenStops(routeA, planStops.board.position, planStops.dest.position) ?? [];
      const out: PlanResponse = {
        ok: true,
        kind: "direct",
        lineA: planStops.lineA,
        boardStopId: planStops.board.id,
        destStopId: planStops.dest.id,
        walk,
        rideA,
      };
      return NextResponse.json(out);
    }

    // transfer
    const routeA = routes[planStops.lineA]?.coord;
    const routeB = routes[planStops.lineB]?.coord;

    if (!routeA || routeA.length < 2) {
      const out: PlanResponse = { ok: false, error: `No route polyline found for line ${planStops.lineA}.` };
      return NextResponse.json(out, { status: 200 });
    }
    if (!routeB || routeB.length < 2) {
      const out: PlanResponse = { ok: false, error: `No route polyline found for line ${planStops.lineB}.` };
      return NextResponse.json(out, { status: 200 });
    }

    const rideA = sliceRouteBetweenStops(routeA, planStops.board.position, planStops.transfer.position) ?? [];
    const rideB = sliceRouteBetweenStops(routeB, planStops.transfer.position, planStops.dest.position) ?? [];

    const out: PlanResponse = {
      ok: true,
      kind: "transfer",
      lineA: planStops.lineA,
      lineB: planStops.lineB,
      boardStopId: planStops.board.id,
      transferStopId: planStops.transfer.id,
      destStopId: planStops.dest.id,
      walk,
      rideA,
      rideB,
    };
    return NextResponse.json(out);
  } catch (e) {
    const out: PlanResponse = { ok: false, error: "Planner crashed." };
    return NextResponse.json(out, { status: 500 });
  }
}
