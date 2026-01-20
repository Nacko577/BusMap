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
      const buses = await req.json(); // array of bus objects from frontend
      const filePath = path.join(process.cwd(), "busCoord.json");
  
      // Build JSON object per bus ID
      const busCoords = buses.reduce((acc: any, bus: any) => {
        acc[bus.id] = {
          line: bus.line || "?",
          coord: bus.route && bus.route.length > 0
            ? bus.route
            : [[bus.latitude, bus.longitude]]
        };
        return acc;
      }, {});
  
      fs.writeFileSync(filePath, JSON.stringify(busCoords, null, 2));
  
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: "Failed to save bus data" },
        { status: 500 }
      );
    }
  }