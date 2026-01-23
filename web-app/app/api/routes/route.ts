import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), "busCoord.json");
    
        if(!fs.existsSync(filePath)) {
          return NextResponse.json({});
        }
    
        const data = fs.readFileSync(filePath, "utf-8");
        return NextResponse.json(JSON.parse(data));
      } catch (err) {
        return NextResponse.json(
          {
            error: "Failed to read routes"
          }, {
            status: 500
          }
        );
      }
}
