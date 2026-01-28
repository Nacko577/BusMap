import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type Coord = [number, number];

type StoredRoute = {
  line: string;
  coord: Coord[];
}

type LineRoute = {
  line: string;
  coord: Coord[];
  sourceBusId: string;
}

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "busCoord.json");
    const raw = await readJsonSafe<Record<string, StoredRoute>>(filePath, {});

    const bestByLine: Record<string, LineRoute> = {};

    for(const [busId, r] of Object.entries(raw)) {
      const line = (r?.line ?? "?").toString().trim() || "?";
      const coord = Array.isArray(r?.coord) ? (r.coord as Coord[]) : [];

      if(coord.length < 2) continue;

      const existing = bestByLine[line];
      if(!existing || coord.length > existing.coord.length) {
        bestByLine[line] = { line, coord, sourceBusId: busId};
      }
    }
    return NextResponse.json(bestByLine);
  } catch (err) {
    return NextResponse.json({ error: "Failed to read routes" }, { status: 500 });
  }
}
