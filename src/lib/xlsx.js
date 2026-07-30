/* ============================================================
   Generador minimo de .xlsx, sin dependencias
   ----------------------------------------------------------------
   Un .xlsx es un ZIP con unos pocos XML adentro. Escribirlo a mano
   son ~100 lineas; meter SheetJS al bundle por una exportacion son
   ~400 KB que paga todo el mundo en cada carga.

   Se genera un CSV? No: con la configuracion regional de Argentina
   Excel espera ';' como separador y con ',' mete todo en una columna.
   Un xlsx de verdad no tiene esa ambiguedad.

   Limitaciones a proposito (alcanza para exportar tablas):
     - una sola hoja
     - todo texto (inlineStr), sin numeros tipados ni formulas
     - ZIP "stored", sin compresion: el archivo pesa un poco mas pero
       no hace falta implementar deflate. Para listados de texto son
       decenas de KB.
   ============================================================ */

/* CRC-32 estandar (el que pide el formato ZIP). La tabla se calcula una
   sola vez, la primera vez que se exporta. */
let TABLA_CRC = null;

function tablaCrc() {
  if (TABLA_CRC) return TABLA_CRC;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  TABLA_CRC = t;
  return t;
}

function crc32(bytes) {
  const t = tablaCrc();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) {
    c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* Los cinco caracteres que XML no perdona dentro de un texto. Sin esto,
   un paciente apellidado "Perez & Cia" rompe el archivo entero. */
function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Los caracteres de control no son validos en XML 1.0 y Excel se niega
    // a abrir el archivo si aparecen. Se descartan en silencio.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/* Nombre de columna de Excel: 0 -> A, 25 -> Z, 26 -> AA. */
function letraColumna(indice) {
  let n = indice;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function hojaXml(filas, anchos) {
  const cols = anchos && anchos.length
    ? `<cols>${anchos.map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const cuerpo = filas.map((fila, f) => {
    const celdas = fila.map((valor, c) => {
      // Una celda vacia no se escribe: ocupa lugar y no aporta nada.
      if (valor === null || valor === undefined || valor === '') return '';
      return `<c r="${letraColumna(c)}${f + 1}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
    }).join('');
    return `<row r="${f + 1}">${celdas}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${cuerpo}</sheetData></worksheet>`;
}

/* ---- ZIP ---- */

function aBytes(texto) {
  return new TextEncoder().encode(texto);
}

function escribirUint32(arr, pos, valor) {
  arr[pos] = valor & 0xFF;
  arr[pos + 1] = (valor >>> 8) & 0xFF;
  arr[pos + 2] = (valor >>> 16) & 0xFF;
  arr[pos + 3] = (valor >>> 24) & 0xFF;
}

function escribirUint16(arr, pos, valor) {
  arr[pos] = valor & 0xFF;
  arr[pos + 1] = (valor >>> 8) & 0xFF;
}

function armarZip(archivos) {
  const entradas = archivos.map((a) => {
    const datos = aBytes(a.contenido);
    return { nombre: aBytes(a.nombre), datos, crc: crc32(datos) };
  });

  let tamLocal = 0;
  let tamCentral = 0;
  for (const e of entradas) {
    tamLocal += 30 + e.nombre.length + e.datos.length;
    tamCentral += 46 + e.nombre.length;
  }

  const salida = new Uint8Array(tamLocal + tamCentral + 22);
  let pos = 0;
  const offsets = [];

  for (const e of entradas) {
    offsets.push(pos);
    escribirUint32(salida, pos, 0x04034B50);      // firma local
    escribirUint16(salida, pos + 4, 20);          // version minima
    escribirUint16(salida, pos + 6, 0x0800);      // flag: nombres en UTF-8
    escribirUint16(salida, pos + 8, 0);           // metodo 0 = stored
    escribirUint16(salida, pos + 10, 0);          // hora
    escribirUint16(salida, pos + 12, 0x0021);     // fecha (1980-01-01)
    escribirUint32(salida, pos + 14, e.crc);
    escribirUint32(salida, pos + 18, e.datos.length);
    escribirUint32(salida, pos + 22, e.datos.length);
    escribirUint16(salida, pos + 26, e.nombre.length);
    escribirUint16(salida, pos + 28, 0);
    pos += 30;
    salida.set(e.nombre, pos); pos += e.nombre.length;
    salida.set(e.datos, pos); pos += e.datos.length;
  }

  const inicioCentral = pos;
  entradas.forEach((e, i) => {
    escribirUint32(salida, pos, 0x02014B50);      // firma del directorio
    escribirUint16(salida, pos + 4, 20);
    escribirUint16(salida, pos + 6, 20);
    escribirUint16(salida, pos + 8, 0x0800);
    escribirUint16(salida, pos + 10, 0);
    escribirUint16(salida, pos + 12, 0);
    escribirUint16(salida, pos + 14, 0x0021);
    escribirUint32(salida, pos + 16, e.crc);
    escribirUint32(salida, pos + 20, e.datos.length);
    escribirUint32(salida, pos + 24, e.datos.length);
    escribirUint16(salida, pos + 28, e.nombre.length);
    escribirUint16(salida, pos + 30, 0);
    escribirUint16(salida, pos + 32, 0);
    escribirUint16(salida, pos + 34, 0);
    escribirUint16(salida, pos + 36, 0);
    escribirUint32(salida, pos + 38, 0);
    escribirUint32(salida, pos + 42, offsets[i]);
    pos += 46;
    salida.set(e.nombre, pos); pos += e.nombre.length;
  });

  escribirUint32(salida, pos, 0x06054B50);        // fin del directorio
  escribirUint16(salida, pos + 4, 0);
  escribirUint16(salida, pos + 6, 0);
  escribirUint16(salida, pos + 8, entradas.length);
  escribirUint16(salida, pos + 10, entradas.length);
  escribirUint32(salida, pos + 12, pos - inicioCentral);
  escribirUint32(salida, pos + 16, inicioCentral);
  escribirUint16(salida, pos + 20, 0);

  return salida;
}

/**
 * Arma un .xlsx de una hoja.
 *
 * @param {string[][]} filas   Matriz de textos. La primera fila es el encabezado.
 * @param {object}     [opts]
 * @param {string}     [opts.hoja]    Nombre de la solapa.
 * @param {number[]}   [opts.anchos]  Ancho de cada columna, en caracteres.
 * @returns {Blob} Listo para descargar.
 */
export function construirXlsx(filas, { hoja = 'Hoja1', anchos } = {}) {
  // Excel rechaza el archivo si el nombre de la solapa tiene : \ / ? * [ ]
  // o pasa de 31 caracteres.
  const nombreHoja = escaparXml(String(hoja).replace(/[:\\/?*[\]]/g, '').slice(0, 31) || 'Hoja1');

  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    {
      nombre: '_rels/.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaXml(filas, anchos) },
  ];

  return new Blob([armarZip(archivos)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Dispara la descarga de un Blob con el nombre dado. */
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el blob queda retenido en memoria hasta que se recarga la pagina.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
