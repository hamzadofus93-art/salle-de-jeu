import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccountStatus,
} from "../services/accounts.service.mjs";

export async function listAccountsController(_request, response) {
  const accounts = await listAccounts();
  response.status(200).json({ accounts });
}

export async function createAccountController(request, response) {
  const account = await createAccount(request.user, request.body);
  response.status(201).json({ account });
}

export async function updateAccountStatusController(request, response) {
  const account = await updateAccountStatus(
    request.user,
    request.params.accountId,
    request.body?.isActive,
  );

  response.status(200).json({ account });
}

export async function deleteAccountController(request, response) {
  await deleteAccount(request.user, request.params.accountId);
  response.status(204).send();
}
