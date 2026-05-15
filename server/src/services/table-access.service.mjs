import { prisma } from "../db/prisma.mjs";
import { forbidden } from "../utils/http-error.mjs";

export function managedTableWhere(actor) {
  if (actor?.role !== "ADMIN") {
    return {};
  }

  return {
    managers: {
      some: { id: actor.id },
    },
  };
}

export async function assertCanManageTable(actor, tableId) {
  if (actor?.role === "SUDO") {
    return;
  }

  if (actor?.role !== "ADMIN") {
    throw forbidden("Action reservee a l'equipe Phoenix.");
  }

  const canManage = await prisma.gameTable.count({
    where: {
      id: tableId,
      ...managedTableWhere(actor),
    },
  });

  if (!canManage) {
    throw forbidden("Cette table n'est pas assignee a ce compte.");
  }
}
