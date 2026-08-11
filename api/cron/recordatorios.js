/**
 * /api/cron/recordatorios
 *
 * Cron diario. Busca instancias de recordatorio que le tocan al
 * profesional hoy y le manda un push a todos sus dispositivos.
 *
 * Una instancia se notifica cuando:
 *   - estado == 'pendiente'
 *   - proximaEn <= ahora   (ya le toca)
 *   - notificadaEn es null o de una vuelta anterior del ciclo
 *
 * Ese ultimo punto es el que evita el problema obvio: sin el, mientras
 * el profesional no acepte el recordatorio, el cron le mandaria el
 * mismo aviso TODOS los dias hasta que apague las notificaciones. Con
 * notificadaEn, cada aparicion del ciclo avisa una sola vez.
 *
 * No usa Cloud Functions a proposito: eso obligaria a pasar el proyecto
 * de Firebase a plan Blaze. Enviar desde aca con firebase-admin y la
 * service account que ya existe es gratis y no agrega infraestructura.
 *
 * Configurado en vercel.json:
 *   { "path": "/api/cron/recordatorios", "schedule": "0 12 * * *" }
 *   12 UTC = 9 de la manana en Argentina. Vercel Hobby no garantiza la
 *   hora exacta (puede correr dentro de una ventana), lo cual para
 *   recordatorios semanales o mensuales es irrelevante.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse } from '../_lib/http.js';

/* Firestore no deja mandar mas de 30 valores en un 'in', y sendEachForMulticast
   admite hasta 500 tokens por llamada. Ninguno de los dos es un problema al
   volumen de un consultorio, pero conviene no asumirlo. */
const MAX_TOKENS_POR_ENVIO = 500;

function aFecha(valor) {
  if (!valor) return null;
  if (valor.toDate) return valor.toDate();
  if (valor.seconds !== undefined) return new Date(valor.seconds * 1000);
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ¿Hay que avisar de esta instancia?
 * Se avisa una vez por aparicion: si ya se notifico DESPUES de que
 * empezo esta vuelta del ciclo, no se repite.
 */
function hayQueNotificar(inst, ahora) {
  if (inst.estado !== 'pendiente') return false;

  const proxima = aFecha(inst.proximaEn);
  if (!proxima || proxima > ahora) return false;

  const notificada = aFecha(inst.notificadaEn);
  if (!notificada) return true;
  return notificada < proxima;
}

function armarMensaje(instancias) {
  if (instancias.length === 1) {
    const i = instancias[0];
    return {
      titulo: i.titulo || 'Recordatorio',
      cuerpo: i.descripcion || 'Tenés un recordatorio pendiente en ConsulPay.',
    };
  }
  return {
    titulo: `Tenés ${instancias.length} recordatorios`,
    cuerpo: instancias.map((i) => i.titulo).filter(Boolean).slice(0, 3).join(' · '),
  };
}

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${expected}`) {
      return jsonResponse(res, 401, { error: 'No autorizado.' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('CRON_SECRET no configurado en produccion');
    return jsonResponse(res, 500, { error: 'CRON_SECRET no configurado' });
  }

  try {
    initAdmin();
  } catch (err) {
    console.error('initAdmin fallo:', err);
    return jsonResponse(res, 500, { error: 'init_admin_fallo' });
  }

  const db = getFirestore();
  const messaging = getMessaging();
  const ahora = new Date();

  const stats = {
    instanciasRevisadas: 0,
    instanciasANotificar: 0,
    profesionalesNotificados: 0,
    sinTokens: 0,
    pushEnviados: 0,
    pushFallidos: 0,
    tokensLimpiados: 0,
    errores: 0,
  };

  try {
    /* Se filtra por estado en la query y por fecha en memoria: agregar
       el where de proximaEn obligaria a un indice compuesto, y el
       volumen de instancias pendientes es chico. */
    const snap = await db.collection('recordatorios_instancias')
      .where('estado', '==', 'pendiente')
      .get();

    stats.instanciasRevisadas = snap.size;

    // Agrupadas por profesional: si le tocan tres recordatorios el mismo
    // dia recibe un aviso, no tres seguidos.
    const porProfesional = new Map();
    for (const docu of snap.docs) {
      const inst = { id: docu.id, ...docu.data() };
      if (!hayQueNotificar(inst, ahora)) continue;
      if (!inst.profesionalUid) continue;
      stats.instanciasANotificar += 1;
      if (!porProfesional.has(inst.profesionalUid)) porProfesional.set(inst.profesionalUid, []);
      porProfesional.get(inst.profesionalUid).push(inst);
    }

    for (const [uid, instancias] of porProfesional) {
      try {
        const userSnap = await db.collection('usuarios').doc(uid).get();
        if (!userSnap.exists) continue;

        const tokens = (userSnap.data().fcmTokens || []).slice(0, MAX_TOKENS_POR_ENVIO);
        if (tokens.length === 0) {
          stats.sinTokens += 1;
          /* Sin dispositivos no se marca como notificada: si manana
             habilita las notificaciones, le llega igual. */
          continue;
        }

        const { titulo, cuerpo } = armarMensaje(instancias);

        /* Todo va en data y no en notification: asi el service worker
           decide como mostrarlo y el click abre la pantalla que
           corresponde. Con notification, el navegador la muestra solo y
           onBackgroundMessage no llega a correr. */
        const respuesta = await messaging.sendEachForMulticast({
          tokens,
          data: {
            titulo,
            cuerpo,
            url: '/mi-panel',
            tag: `recordatorios-${uid}`,
          },
          webpush: {
            fcmOptions: { link: '/mi-panel' },
          },
        });

        stats.pushEnviados += respuesta.successCount;
        stats.pushFallidos += respuesta.failureCount;
        if (respuesta.successCount > 0) stats.profesionalesNotificados += 1;

        /* Tokens muertos: un navegador desinstalado o con el permiso
           revocado devuelve estos codigos para siempre. Si no se
           limpian, se acumulan y cada envio arrastra fallas eternas. */
        const muertos = [];
        respuesta.responses.forEach((r, i) => {
          const codigo = r.error?.code;
          if (codigo === 'messaging/registration-token-not-registered'
            || codigo === 'messaging/invalid-registration-token'
            || codigo === 'messaging/invalid-argument') {
            muertos.push(tokens[i]);
          }
        });
        if (muertos.length > 0) {
          const { FieldValue } = await import('firebase-admin/firestore');
          await db.collection('usuarios').doc(uid).update({
            fcmTokens: FieldValue.arrayRemove(...muertos),
          });
          stats.tokensLimpiados += muertos.length;
        }

        // Recien ahora se marcan: si el envio fallo entero, se reintenta manana.
        if (respuesta.successCount > 0) {
          const batch = db.batch();
          for (const inst of instancias) {
            batch.update(db.collection('recordatorios_instancias').doc(inst.id), {
              notificadaEn: Timestamp.fromDate(ahora),
            });
          }
          await batch.commit();
        }
      } catch (err) {
        console.error(`Error notificando al profesional ${uid}:`, err);
        stats.errores += 1;
      }
    }
  } catch (err) {
    console.error('Error general del cron de recordatorios:', err);
    return jsonResponse(res, 500, { error: 'cron_fallo', detalle: err.message, stats });
  }

  console.log('Cron recordatorios:', JSON.stringify(stats));
  return jsonResponse(res, 200, { ok: true, stats });
}
