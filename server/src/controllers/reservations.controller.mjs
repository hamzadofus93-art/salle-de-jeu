import {
  cancelReservation,
  createReservation,
  listReservations,
  updateReservation,
} from "../services/reservations.service.mjs";

export async function listReservationsController(_request, response) {
  const reservations = await listReservations();
  response.status(200).json({ reservations });
}

export async function createReservationController(request, response) {
  const reservation = await createReservation(request.user, request.body);
  response.status(201).json({ reservation });
}

export async function updateReservationController(request, response) {
  const reservation = await updateReservation(
    request.user,
    request.params.reservationId,
    request.body,
  );
  response.status(200).json({ reservation });
}

export async function cancelReservationController(request, response) {
  const reservation = await cancelReservation(
    request.user,
    request.params.reservationId,
  );
  response.status(200).json({ reservation });
}
