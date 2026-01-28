import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Coord = [number, number]; // [lat, lng]

function isCoord(x: any): x is Coord {
  return Array.isArray(x) && x.length === 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]);
}

function dedupeConsecutive(coords: Coord[]): Coord[] {
  if (coords.length <= 1) return coords;
  const out: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const last = out[out.length - 1];
    const cur = coords[i];
    if (last[0] !== cur[0] || last[1] !== cur[1]) out.push(cur);
  }
  return out;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = Array.isArray(body?.coords) ? body.coords : [];

    const original: Coord[] = raw.filter(isCoord);
    if (original.length < 2) {
      return NextResponse.json({ coords: original, snapped: false });
    }

    // IMPORTANT: only for OSRM request (doesn't change your stored coords)
    const cleaned = dedupeConsecutive(original);

    // OSRM demo server is sensitive; keep chunks small
    const MAX_POINTS_PER_REQUEST = 60;
    const parts = chunk(cleaned, MAX_POINTS_PER_REQUEST);

    const base = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

    const snappedAll: Coord[] = [];

    for (const part of parts) {
      if (part.length < 2) continue;

      // OSRM expects lon,lat
      const coordString = part.map(([lat, lng]) => `${lng},${lat}`).join(";");

      // radiuses (meters). Increase if it fails to match; decrease if it snaps wrong.
      const radiuses = part.map(() => "50").join(";");

      const url =
        `${base}/match/v1/driving/${coordString}` +
        `?geometries=geojson` +
        `&overview=full` +
        `&gaps=ignore` +
        `&tidy=true` +
        `&radiuses=${radiuses}`;

      let res: Response;
      try {
        res = await fetch(url, { cache: "no-store" });
      } catch {
        // network error -> fallback
        return NextResponse.json({ coords: original, snapped: false, reason: "osrm_network_error" });
      }

      if (!res.ok) {
        // DO NOT 502 the client. Fallback gracefully.
        return NextResponse.json({
          coords: original,
          snapped: false,
          reason: "osrm_http_error",
          osrmStatus: res.status,
        });
      }

      let json: any;
      try {
        json = await res.json();
      } catch {
        return NextResponse.json({ coords: original, snapped: false, reason: "osrm_bad_json" });
      }

      const geom = json?.matchings?.[0]?.geometry?.coordinates as [number, number][] | undefined;
      if (!geom || geom.length < 2) {
        return NextResponse.json({ coords: original, snapped: false, reason: "osrm_no_match" });
      }

      const snappedPart: Coord[] = geom.map(([lon, lat]) => [lat, lon]);

      // stitch (avoid duplicate join point)
      if (snappedAll.length && snappedPart.length) {
        const last = snappedAll[snappedAll.length - 1];
        const first = snappedPart[0];
        if (last[0] === first[0] && last[1] === first[1]) snappedPart.shift();
      }

      snappedAll.push(...snappedPart);
    }

    if (snappedAll.length < 2) {
      return NextResponse.json({ coords: original, snapped: false, reason: "osrm_empty" });
    }

    return NextResponse.json({ coords: snappedAll, snapped: true });
  } catch (err: any) {
    // also fallback instead of failing
    return NextResponse.json({ coords: [], snapped: false, reason: "server_error", message: err?.message });
  }
}
