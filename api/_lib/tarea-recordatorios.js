/**
 * Tarea: avisar por push los recordatorios que le tocan a cada profesional.
 *
 * Vivia en api/cron/recordatorios.js como endpoint propio. Se movio a
 * _lib porque Vercel Hobby permite 12 funciones serverless y el proyecto
 * llego al tope: lo que esta en _lib no cuenta como funcion, asi que las
 * dos tareas diarias comparten un solo endpoint (api/cron/diario.js).
 *
 * Una instancia se notifica cuando:
 *   - estado == 'pendiente'
 *   - proximaEn <= ahora   (ya le toca)
 *   - notificadaEn es null o de una vuelta anterior del ciclo
 *
 * Ese ultimo punto evita el problema obvio: sin el, mientras el
 * profesional no acepte el recordatorio, se le mandaria el mismo aviso
 * todos los dias hasta que apague las notificaciones.
 *
 * No usa Cloud Functions a proposito: eso obligaria a pasar Firebase a
 * plan Blaze. Enviar desde aca con la service account que ya existe es
 * gratis y no agrega infraestructura.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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

/* Texto legible de por que una instancia no entra en el envio de hoy.
   Solo se usa para el log del cron. */
function motivoDescarte(inst, ahora) {
  if (inst.estado !== 'pendiente') return `estado ${inst.estado}`;

  const proxima = aFecha(inst.proximaEn);
  if (!proxima) return 'sin proximaEn';
  if (proxima > ahora) {
    const dias = Math.ceil((proxima - ahora) / 86400000);
    return `todavia no le toca (en ${dias} dia${dias === 1 ? '' : 's'}, el ${proxima.toISOString().slice(0, 10)})`;
  }

  const notificada = aFecha(inst.notificadaEn);
  if (notificada) return `ya se aviso el ${notificada.toISOString().slice(0, 10)}`;
  return 'motivo desconocido';
}

/* El titulo lleva la marca siempre. Antes decia solo el nombre del
   recordatorio ("prueba 6 semanal"), y en el celular eso llega sin
   contexto: la URL del sitio aparece chiquita y en gris arriba, asi que
   alguien que recibe varias notificaciones al dia no tiene como saber de
   donde salio. Lo especifico pasa al cuerpo, que es donde hay lugar. */
const MARCA = 'Recordatorio ConsulPay';

function armarMensaje(instancias) {
  if (instancias.length === 1) {
    const i = instancias[0];
    const titulo = i.titulo || 'Tenés un recordatorio pendiente';
    // El guion solo si hay descripcion: sin esto quedaba un " — " colgado.
    const cuerpo = i.descripcion ? `${titulo} — ${i.descripcion}` : titulo;
    return { titulo: MARCA, cuerpo };
  }

  const nombres = instancias.map((i) => i.titulo).filter(Boolean).slice(0, 3).join(' · ');
  const resto = instancias.length > 3 ? ` y ${instancias.length - 3} más` : '';
  return {
    titulo: MARCA,
    cuerpo: `Tenés ${instancias.length} recordatorios: ${nombres}${resto}`,
  };
}

export async function notificarRecordatorios() {
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
    /* Por que se descarto cada una. Sin esto, un cron que devuelve
       "0 a notificar" no dice si es que todavia no les toca, si ya se
       aviso o si el dato esta roto, y hay que ir a mirar Firestore a
       mano para saberlo. */
    const descartadas = [];

    for (const docu of snap.docs) {
      const inst = { id: docu.id, ...docu.data() };
      if (!inst.profesionalUid) {
        descartadas.push({ id: docu.id, motivo: 'sin profesional asignado' });
        continue;
      }
      if (!hayQueNotificar(inst, ahora)) {
        descartadas.push({ id: docu.id, motivo: motivoDescarte(inst, ahora) });
        continue;
      }
      stats.instanciasANotificar += 1;
      if (!porProfesional.has(inst.profesionalUid)) porProfesional.set(inst.profesionalUid, []);
      porProfesional.get(inst.profesionalUid).push(inst);
    }

    if (descartadas.length > 0) stats.descartadas = descartadas;

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
    err.stats = stats;
    throw err;
  }

  return stats;
}
