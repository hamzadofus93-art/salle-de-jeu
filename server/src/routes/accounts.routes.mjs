import { Router } from "express";
import {
  createAccountController,
  deleteAccountController,
  listAccountsController,
  updateAccountManagedTablesController,
  updateAccountStatusController,
} from "../controllers/accounts.controller.mjs";
import { requireAuth, requireSudo } from "../middleware/auth.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";

const router = Router();

router.use(requireAuth, requireSudo);
router.get("/", asyncHandler(listAccountsController));
router.post("/", asyncHandler(createAccountController));
router.patch("/:accountId/status", asyncHandler(updateAccountStatusController));
router.patch("/:accountId/managed-tables", asyncHandler(updateAccountManagedTablesController));
router.delete("/:accountId", asyncHandler(deleteAccountController));

export default router;
