import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { cancelAppointment } from "@/lib/appointments";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  let staff;
  try { staff = await requireStaff(); }
  catch { return NextResponse.json({ error: "Não autorizado." }, { status: 401 }); }

  const result = await cancelAppointment(staff.establishmentId, params.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ message: "Horário cancelado.", notified: result.notified });
}