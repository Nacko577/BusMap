import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const response = await fetch('https://ro-suceava.thoreb.com/thoreb-map/xhr_update.php');
        const data = await response.json();
        return NextResponse.json(data);
    } catch(error) {
        return NextResponse.json({ error: 'Failed to fetch bus data'}, { status: 500 });
    }
}

export async function POST(req: Request) {
  try {
    const incomingBuses = await req.json();
    const filePath = path.join(process.cwd(), "busCoord.json");

    let existing: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    for (const bus of incomingBuses) {
      if (!bus.route || bus.route.length === 0) continue;

      if (!existing[bus.id]) {
        existing[bus.id] = {
          line: bus.line || "?",
          coord: []
        };
      }

      const saved = existing[bus.id].coord;

      for (const [lat, lng] of bus.route) {
        const last = saved[saved.length - 1];
        if (!last || last[0] !== lat || last[1] !== lng) {
          saved.push([lat, lng]);
        }
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    return NextResponse.json({ success: true });

  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to append bus routes" },
      { status: 500 }
    );
  }
}
