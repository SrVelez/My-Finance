import { connection } from "next/server";
import { todayISO } from "@/lib/today";

/** Data de hoje no servidor, sempre em tempo de requisição (nunca no shell estático). */
export async function serverToday() {
  await connection();
  return todayISO();
}
