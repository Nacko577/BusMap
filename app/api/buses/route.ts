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

// Normalise a raw bus entry (Thoreb or Karsan format) to a common shape.
// Returns null if the bus is inactive or has no valid position.
function normaliseBus(
  id: string,
  raw: any
): { id: string; lat: number; lng: number; line: string } | null {
  let status: string, lat: number, lng: number, lineRaw: string;

  if (raw?.contact !== undefined) {
    // Karsan format: { contact, journey, lat, lon }
    status = raw.contact;
    lat = Number(raw.lat);
    lng = Number(raw.lon);
    lineRaw = (raw.journey?.toString() ?? "").trim();
  } else {
    // Thoreb format: { "1": status, "2": lat, "3": lng, "4": line }
    status = raw?.["1"] ?? "off";
    lat = Number(raw?.["2"]);
    lng = Number(raw?.["3"]);
    lineRaw = (raw?.["4"]?.toString() ?? "").trim();
  }

  if (status !== "on") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!lineRaw || lineRaw === "NO_LINE" || lineRaw.startsWith("NO_") || lineRaw === "0" || lineRaw.endsWith(".")) return null;

  return { id, lat, lng, line: lineRaw };
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

    const rawData = await response.json();

    // Normalise all buses to a consistent Thoreb-compatible shape
    const normalized: Record<string, any> = {};
    for (const [id, raw] of Object.entries(rawData as Record<string, any>)) {
      const bus = normaliseBus(id, raw);
      if (!bus) continue;
      normalized[id] = { "1": "on", "2": String(bus.lat), "3": String(bus.lng), "4": bus.line };
    }

    const filePath = path.join(process.cwd(), "busCoord.json");
    const existing = await readJsonSafe<Record<string, StoredRoute>>(filePath, {});

    const MAX_POINTS = 6000;
    const MIN_MOVE_M = 8;
    const MAX_JUMP_M = 350;

    for (const [busId, entry] of Object.entries(normalized)) {
      const lat = Number(entry["2"]);
      const lng = Number(entry["3"]);
      const line = entry["4"] as string;
      const point: Coord = [lat, lng];

      // Key by busId so each bus has its own continuous trace.
      // generateRoutes.mjs picks the longest trace per line.
      if (!existing[busId]) existing[busId] = { line, coord: [] };
      existing[busId].line = line;

      const arr = existing[busId].coord;
      const last = arr.length ? arr[arr.length - 1] : null;

      if (!last) {
        arr.push(point);
      } else {
        if (last[0] === point[0] && last[1] === point[1]) continue;
        const d = distMeters(last, point);
        if (d < MIN_MOVE_M) continue;
        if (d > MAX_JUMP_M) continue;
        arr.push(point);
      }

      if (arr.length > MAX_POINTS) existing[busId].coord = arr.slice(-MAX_POINTS);
    }

    // Skip file write on Vercel (read-only filesystem)
    if (!process.env.VERCEL) await writeJsonAtomic(filePath, existing);

    return NextResponse.json(normalized);
  } catch (err) {
    console.error("buses route error:", err);
    return NextResponse.json({ error: "Failed to fetch bus data" }, { status: 500 });
  }
}
