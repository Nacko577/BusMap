import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

type Coord = [number, number];

type StoredRoute = {
  line: string;
  coord: Coord[];
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

async function writeJsonAtomic(filePath: string, data: unknown) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

// lightweight meter distance (good enough for filtering)
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

export async function GET() {
  try {
    const response = await fetch(
      "https://ro-suceava.thoreb.com/thoreb-map/xhr_update.php",
      { cache: "no-store" }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
    }

    const data = await response.json();

    const filePath = path.join(process.cwd(), "busCoord.json");
    const existing = await readJsonSafe<Record<string, StoredRoute>>(filePath, {});

    // tune these:
    const MAX_POINTS = 6000;
    const MIN_MOVE_M = 8;     // don’t record tiny jitter
    const MAX_JUMP_M = 350;   // ignore teleports

    for (const [busId, busData] of Object.entries(data as Record<string, any>)) {
      const bus = busData as any;
      if (bus?.["1"] !== "on") continue;

      const lat = Number(bus["2"]);
      const lng = Number(bus["3"]);
      const lineRaw = (bus["4"]?.toString() ?? "").trim();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      // ignore “no line”
      if (!lineRaw || lineRaw === "NO_LINE" || lineRaw.startsWith("NO_") || lineRaw === "0") continue;

      const line = lineRaw;
      const point: Coord = [lat, lng];

      if (!existing[busId]) existing[busId] = { line, coord: [] };

      existing[busId].line = line;

      const arr = existing[busId].coord;
      const last = arr.length ? arr[arr.length - 1] : null;

      if (!last) {
        arr.push(point);
      } else {
        // dedupe
        if (last[0] === point[0] && last[1] === point[1]) continue;

        const d = distMeters(last, point);
        if (d < MIN_MOVE_M) continue;     // jitter
        if (d > MAX_JUMP_M) continue;     // teleport / spike

        arr.push(point);
      }

      if (arr.length > MAX_POINTS) existing[busId].coord = arr.slice(-MAX_POINTS);
    }

    await writeJsonAtomic(filePath, existing);

    // Return live bus data (frontend uses this for markers)
    return NextResponse.json(data);
  } catch (err) {
    console.error("buses route error:", err);
    return NextResponse.json({ error: "Failed to fetch bus data" }, { status: 500 });
  }
}
