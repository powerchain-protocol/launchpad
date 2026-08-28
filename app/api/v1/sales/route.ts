import {listSales} from "@/lib/server/store";export async function GET(){return Response.json({sales:await listSales()})}
