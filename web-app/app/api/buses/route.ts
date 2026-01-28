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

export async function GET() {
  try {
    const response = await fetch(
      "https://ro-suceava.thoreb.com/thoreb-map/xhr_update.php",
      { cache: "no-store" }
    );

    const data = await response.json();

    const filePath = path.join(process.cwd(), "busCoord.json");
    const existing = await readJsonSafe<Record<string, StoredRoute>>(filePath, {});

    for (const [busId, busData] of Object.entries(data as Record<string, any>)) {
      const bus = busData as any;

      if (bus?.["1"] !== "on") continue;

      const lat = Number(bus["2"]);
      const lng = Number(bus["3"]);
      const line = bus["4"]?.trim() || "?";

      // No filtering beyond numeric check
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      if (!existing[busId]) {
        existing[busId] = { line, coord: [] };
      }

      existing[busId].line = line;
      existing[busId].coord.push([lat, lng]);

      // keep file size under control
      const MAX_POINTS = 6000;
      if (existing[busId].coord.length > MAX_POINTS) {
        existing[busId].coord = existing[busId].coord.slice(-MAX_POINTS);
      }
    }

    await writeJsonAtomic(filePath, existing);

    // return live bus data (unchanged client logic)
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch bus data" },
      { status: 500 }
    );
  }
}
