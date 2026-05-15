import { getCurrentUser, login, updateCurrentUser } from "../services/auth.service.mjs";

export async function loginController(request, response) {
  const result = await login(request.body);
  response.status(200).json(result);
}

export async function meController(request, response) {
  const user = await getCurrentUser(request.user.id);
  response.status(200).json({ user });
}

export async function updateMeController(request, response) {
  const user = await updateCurrentUser(request.user.id, request.body);
  response.status(200).json({ user });
}

export async function logoutController(_request, response) {
  response.status(200).json({
    message: "Deconnexion cote serveur terminee.",
  });
}
