import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function metersBetween(a: [number, number], b: [number, number]) {
    const R = 6371000; 
    const toRad = (x: number) => (x * Math.PI) / 180;

    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));
}

export async function GET() {
  try {
    // server gets buses from upstream API
    const response = await fetch("https://ro-suceava.thoreb.com/thoreb-map/xhr_update.php", {
      cache: "no-store",
    });

    const data = await response.json(); // upstream object

    // update routes into JSON (busCoord.json)
    const filePath = path.join(process.cwd(), "busCoord.json");
    let existing: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    // Convert upstream -> append coords
    for (const [busId, busData] of Object.entries(data)) {
      const bus = busData as any;

      if (bus?.["1"] !== "on") continue;

      const lat = parseFloat(bus["2"]);
      const lng = parseFloat(bus["3"]);
      const line = bus["4"]?.trim() || "?";

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      if (!existing[busId]) {
        existing[busId] = { line, coord: [] };
      }

      const MAX_JUMP_METERS = 350;

      const saved = existing[busId].coord;
      const next: [number, number] = [lat, lng];
      const last = saved[saved.length - 1];

      if (!last) {
        saved.push(next);
      } else { 
        const distance = metersBetween(last, next);

        if(distance <= MAX_JUMP_METERS) 
          saved.push(next);
      }

      // keep line updated
      existing[busId].line = line;
    }

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    // finally send bus data to client (same format client already parses)
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch bus data" }, { status: 500 });
  }
}
