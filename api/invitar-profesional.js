/**
 * /api/invitar-profesional
 *
 * Endpoint serverless (Vercel Function) que:
 *  1. Valida el Firebase ID token del admin
 *  2. Verifica que el admin efectivamente sea admin del consultorio
 *  3. Crea el doc de invitación en Firestore
 *  4. Envía el email vía Resend
 *
 * Body esperado:
 *  {
 *    email: "maria@mail.com",
 *    nombre: "María Rodríguez",
 *    consultorioId: "abc123",
 *    consultorioNombre: "Consultorio X",
 *    porcentajeOverride: 30
 *  }
 *
 * Headers:
 *  Authorization: Bearer <firebase_id_token>
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

/* ============================================================
   Inicialización única de firebase-admin
   ============================================================ */

/**
 * Firebase Admin SDK se autentica con Application Default Credentials.
 * En Vercel usamos una service account cuyas keys van en env var FIREBASE_ADMIN_KEY
 * como JSON stringificado.
 *
 * Si FIREBASE_ADMIN_KEY no está seteado, intentamos modo "sin credenciales"
 * (funciona para algunos setups con OAuth del proyecto Vercel).
 */
function initAdmin() {
  if (getApps().length > 0) return;

  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) {
    // Fallback: sin service account. Esto solo funciona si Vercel y Firebase
    // están en el mismo proyecto Google Cloud (no es nuestro caso).
    throw new Error(
      'FIREBASE_ADMIN_KEY no está configurado. Agregalo en Vercel Env Vars.',
    );
  }

  const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
  initializeApp({ credential: cert(serviceAccount) });
}

/* ============================================================
   Helper: parsear body JSON
   ============================================================ */
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/* ============================================================
   Helper: enviar respuesta JSON
   ============================================================ */
function jsonResponse(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/* ============================================================
   Template del email
   ============================================================ */
function buildEmailHtml({ nombre, consultorioNombre, adminNombre, porcentaje, aceptarUrl }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Invitación a ${consultorioNombre}</title>
</head>
<body style="margin:0;background:#F5F4EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1C1B17;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F4EE;">
    <tr><td align="center" style="padding:48px 20px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;width:100%;background:#FFFFFF;border:1px solid rgba(28,27,23,0.08);border-radius:14px;overflow:hidden;">
        <tr><td style="padding:36px 40px 28px;">
          <div style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#C15F3C;color:#fff;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:600;text-align:center;line-height:32px;letter-spacing:-0.02em;">C</div>
        </td></tr>

        <tr><td style="padding:0 40px 8px;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:500;letter-spacing:-0.02em;line-height:1.15;color:#1C1B17;">
            Te invitaron a unirte a <em style="color:#C15F3C;">${consultorioNombre}</em>
          </h1>
        </td></tr>

        <tr><td style="padding:16px 40px 0;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#6B6960;">
            ${adminNombre ? `<strong style="color:#1C1B17;">${adminNombre}</strong>` : 'El administrador'} te invitó a unirte al consultorio <strong style="color:#1C1B17;">${consultorioNombre}</strong> en ConsulPay como profesional.
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F4EE;border-radius:10px;">
            <tr>
              <td style="padding:14px 18px;font-size:12px;color:#6B6960;letter-spacing:0.06em;text-transform:uppercase;font-weight:500;">
                Tus datos
              </td>
            </tr>
            <tr><td style="padding:0 18px 14px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-size:13px;color:#6B6960;padding:4px 0;">Nombre</td>
                  <td style="font-size:14px;color:#1C1B17;padding:4px 0;text-align:right;font-weight:500;">${nombre}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6B6960;padding:4px 0;">% que cobra el consultorio</td>
                  <td style="font-size:14px;color:#1C1B17;padding:4px 0;text-align:right;font-weight:500;">${porcentaje}%</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:28px 40px 0;">
          <a href="${aceptarUrl}" style="display:block;background:#C15F3C;color:#fff;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:500;font-size:14.5px;letter-spacing:-0.005em;">
            Aceptar invitación
          </a>
        </td></tr>

        <tr><td style="padding:20px 40px 36px;">
          <p style="margin:0;font-size:12.5px;color:#A39F93;line-height:1.5;">
            Si no esperabas esta invitación podés ignorar este email. El link caduca en 7 días.
          </p>
        </td></tr>
      </table>

      <p style="margin:20px 0 0;font-size:11.5px;color:#A39F93;letter-spacing:0.06em;text-transform:uppercase;">
        ConsulPay · Córdoba, Argentina
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ============================================================
   Handler principal
   ============================================================ */
export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    initAdmin();
  } catch (err) {
    console.error('Error inicializando firebase-admin:', err);
    return jsonResponse(res, 500, {
      error: 'El servidor no está correctamente configurado (FIREBASE_ADMIN_KEY faltante).',
    });
  }

  // Validar auth
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return jsonResponse(res, 401, { error: 'Falta el token de autenticación.' });
  }

  let uid;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (err) {
    console.error('Token inválido:', err);
    return jsonResponse(res, 401, { error: 'Token inválido o expirado.' });
  }

  // Parsear body
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body inválido.' });
  }

  const {
    email,
    nombre,
    consultorioId,
    consultorioNombre,
    porcentajeOverride,
  } = body;

  // Validaciones básicas
  if (!email || !email.includes('@')) {
    return jsonResponse(res, 400, { error: 'Email inválido.' });
  }
  if (!nombre || !nombre.trim()) {
    return jsonResponse(res, 400, { error: 'Nombre del profesional requerido.' });
  }
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  const emailLower = email.trim().toLowerCase();
  const db = getFirestore();

  // Verificar que el usuario autenticado sea admin del consultorio indicado
  const userDoc = await db.collection('usuarios').doc(uid).get();
  if (!userDoc.exists) {
    return jsonResponse(res, 403, { error: 'Tu usuario no existe.' });
  }
  const userData = userDoc.data();
  const esSuperadmin = userData.rol === 'superadmin';
  const esAdminDelConsultorio = userData.rol === 'admin' && userData.consultorioId === consultorioId;
  if (!esSuperadmin && !esAdminDelConsultorio) {
    return jsonResponse(res, 403, { error: 'No sos admin de ese consultorio.' });
  }

  // Verificar que no exista ya una invitación pendiente para ese email+consultorio
  const invitacionId = `${consultorioId}_${emailLower}`;
  const invitacionRef = db.collection('invitaciones_profesional').doc(invitacionId);
  const snap = await invitacionRef.get();
  if (snap.exists && snap.data().estado === 'pendiente') {
    return jsonResponse(res, 409, {
      error: 'Ya existe una invitación pendiente para ese email en este consultorio.',
    });
  }

  // Crear/actualizar invitación
  const now = Date.now();
  const expiraAt = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7 días

  await invitacionRef.set({
    email: emailLower,
    nombre: nombre.trim(),
    consultorioId,
    consultorioNombre: consultorioNombre || '',
    invitadoPorUid: uid,
    invitadoPorNombre: userData.displayName || userData.email || '',
    porcentajeOverride: porcentajeOverride ?? null,
    estado: 'pendiente',
    createdAt: FieldValue.serverTimestamp(),
    expiraAt,
    aceptadaAt: null,
    uidAceptante: null,
  });

  // Construir URL para aceptar
  const origen = req.headers.origin || `https://${req.headers.host}`;
  const aceptarUrl = `${origen}/aceptar-invitacion?id=${encodeURIComponent(invitacionId)}`;

  // Mandar el email vía Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY no está configurada. La invitación se creó pero no se envió email.');
    return jsonResponse(res, 200, {
      ok: true,
      invitacionId,
      emailEnviado: false,
      warning: 'RESEND_API_KEY no está configurada en Vercel. El doc se creó pero no se envió el email.',
      aceptarUrl,
    });
  }

  try {
    const resend = new Resend(apiKey);
    const html = buildEmailHtml({
      nombre: nombre.trim(),
      consultorioNombre: consultorioNombre || 'tu consultorio',
      adminNombre: userData.displayName || '',
      porcentaje: porcentajeOverride ?? '—',
      aceptarUrl,
    });

    await resend.emails.send({
      from: 'ConsulPay <onboarding@resend.dev>',
      to: emailLower,
      subject: `Te invitaron a ${consultorioNombre || 'un consultorio'} en ConsulPay`,
      html,
    });
  } catch (err) {
    console.error('Error enviando email vía Resend:', err);
    return jsonResponse(res, 200, {
      ok: true,
      invitacionId,
      emailEnviado: false,
      warning: 'La invitación se creó pero el email no se pudo enviar. Compartí el link manualmente.',
      aceptarUrl,
    });
  }

  return jsonResponse(res, 200, {
    ok: true,
    invitacionId,
    emailEnviado: true,
    aceptarUrl,
  });
}
