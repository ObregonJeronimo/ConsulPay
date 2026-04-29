/**
 * /api/mp/suscripcion-webhook
 *
 * DEPRECATED. Este endpoint existia cuando pensaba que MP permitia
 * varios webhooks por app. En realidad solo permite UNO, asi que
 * todas las notificaciones (pagos + suscripciones) llegan a
 * /api/mp/webhook que routea internamente.
 *
 * Si MP por algun motivo manda una notificacion aca, devolvemos 410
 * Gone para indicar que el recurso fue movido permanentemente.
 *
 * No borramos el archivo del todo por si quedo configurado en algun
 * panel (eventualmente lo borramos cuando confirmemos que MP solo
 * llama a /api/mp/webhook).
 */

import { jsonResponse } from '../_lib/http.js';

export default async function handler(req, res) {
  return jsonResponse(res, 410, {
    error: 'Endpoint deprecated. Usar /api/mp/webhook.',
    deprecatedAt: '2026-04-29',
  });
}
