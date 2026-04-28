/**
 * Encriptacion simetrica para secretos guardados en Firestore.
 *
 * Usa AES-256-GCM, que es el AEAD estandar moderno: cifra y autentica
 * en una sola operacion. La key vive en process.env.MP_ENCRYPTION_KEY
 * como 64 caracteres hex (32 bytes). Si la key cambia, los textos
 * cifrados anteriores quedan inutilizables — no rotamos la key sin
 * un plan de migracion.
 *
 * Formato del ciphertext guardado:
 *   { iv: hex(12), tag: hex(16), data: hex(...) }
 *
 * Donde:
 *   iv:   nonce de 12 bytes, generado random por cada encrypt
 *   tag:  authentication tag de 16 bytes
 *   data: ciphertext en hex
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.MP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('MP_ENCRYPTION_KEY no esta configurada en env.');
  }
  if (hex.length !== 64) {
    throw new Error(
      `MP_ENCRYPTION_KEY debe tener 64 caracteres hex (32 bytes). Tiene ${hex.length}.`,
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encripta un string. Devuelve un objeto { iv, tag, data } con todos
 * los componentes en hex, listo para guardar en Firestore.
 */
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('encrypt() requiere un string');
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: ciphertext.toString('hex'),
  };
}

/**
 * Desencripta un objeto { iv, tag, data } previamente generado por
 * encrypt(). Devuelve el plaintext original. Lanza error si:
 *   - El formato esta mal
 *   - El authTag no valida (datos modificados o key incorrecta)
 */
export function decrypt(encryptedObj) {
  if (
    !encryptedObj
    || typeof encryptedObj.iv !== 'string'
    || typeof encryptedObj.tag !== 'string'
    || typeof encryptedObj.data !== 'string'
  ) {
    throw new Error('decrypt() requiere objeto { iv, tag, data } en hex');
  }
  const key = getKey();
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const tag = Buffer.from(encryptedObj.tag, 'hex');
  const ciphertext = Buffer.from(encryptedObj.data, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`IV invalido (largo ${iv.length}, esperado ${IV_LENGTH})`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Tag invalido (largo ${tag.length}, esperado ${TAG_LENGTH})`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
