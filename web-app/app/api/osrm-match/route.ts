import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { coords } = await req.json();
    if (!Array.isArray(coords) || coords.length < 2) {
      return NextResponse.json({ snapped: false });
    }

    const coordStr = coords
      .map(([lat, lng]) => `${lng},${lat}`)
      .join(";");

    const url = `https://router.project-osrm.org/match/v1/driving/${coordStr}?geometries=geojson&overview=full`;

    const res = await fetch(url);
    const json = await res.json();

    if (!json.matchings?.[0]?.geometry?.coordinates) {
      return NextResponse.json({ snapped: false });
    }

    const snappedCoords = json.matchings[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    return NextResponse.json({ snapped: true, coords: snappedCoords });
  } catch {
    return NextResponse.json({ snapped: false }, { status: 500 });
  }
}
