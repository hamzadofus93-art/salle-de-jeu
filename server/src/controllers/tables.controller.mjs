import {
  addWaitingPlayer,
  createTable,
  listTables,
  removeWaitingPlayer,
  resetAllWaitingLists,
} from "../services/tables.service.mjs";

export async function listTablesController(_request, response) {
  const tables = await listTables();
  response.status(200).json({ tables });
}

export async function createTableController(request, response) {
  const table = await createTable(request.body, request.user);
  response.status(201).json({ table });
}

export async function addWaitingPlayerController(request, response) {
  const table = await addWaitingPlayer(
    request.params.tableId,
    request.body,
    request.user,
  );
  response.status(201).json({ table });
}

export async function removeWaitingPlayerController(request, response) {
  const table = await removeWaitingPlayer(
    request.params.tableId,
    request.params.entryId,
    request.user,
  );

  response.status(200).json({ table });
}

export async function resetAllWaitingListsController(_request, response) {
  const result = await resetAllWaitingLists();
  response.status(200).json(result);
}
