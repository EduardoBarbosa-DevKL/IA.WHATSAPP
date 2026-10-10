import BotaoMarcarCancelamento from "@/components/BotaoMarcarCancelamento";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPosition } from "@/lib/queue";
import ListaFila from "@/components/ListaFila";
import TopBar from "@/components/TopBar";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const establishment = await prisma.establishment.findUnique({
    where: { id: session.user.establishmentId },
    select: { name: true },
  });

  const entries = await prisma.queueEntry.findMany({
    where: {
      establishmentId: session.user.establishmentId,
      status: { in: ["WAITING", "NOTIFIED", "CONFIRMED"] },
    },
    include: { service: true },
    orderBy: { createdAt: "asc" },
  });

  const entriesWithPosition = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      position: await getPosition(entry),
    }))
  );

  return (
    <div className="min-h-screen">
      <TopBar
        establishmentName={establishment?.name ?? "Estabelecimento"}
        role={session.user.role}
      />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6">
          <BotaoMarcarCancelamento
            establishmentId={session.user.establishmentId}
          />
        </div>

        <ListaFila
          initialEntries={entriesWithPosition}
          establishmentId={session.user.establishmentId}
        />
      </main>
    </div>
  );
}