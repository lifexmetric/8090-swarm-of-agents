import axios from "axios";
import { Pool } from "pg";
import { enqueue } from "./worker";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(req: Request) {
  const body = await req.json();
  const result = await axios.post(process.env.PAYMENTS_URL + "/payments", body);
  await pool.query("insert into payments(id) values($1)", [result.data.id]);
  await enqueue("payment.created", result.data);
  return Response.json({ ok: true });
}
