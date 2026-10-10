import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let staff;
  try { staff = await requireStaff(); }
  catch { return NextResponse.json({ error: "Não autorizado." }, { status: 401 }); }

  const appointments = await prisma.appointment.findMany({
    where: {
      establishmentId: staff.establishmentId,
      status: "SCHEDULED",
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
  });
  return NextResponse.json({ appointments });
}