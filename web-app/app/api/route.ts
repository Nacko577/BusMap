import { NextResponse } from "next/server";

export async function GET() {
    try {
        const response = await fetch('https://ro-suceava.thoreb.com/thoreb-map/xhr_update.php');
        const data = await response.json();
        return NextResponse.json(data);
    } catch(error) {
        return NextResponse.json({ error: 'Failed to fetch bus data'}, { status: 500 });
    }
}