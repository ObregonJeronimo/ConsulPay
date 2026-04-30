/**
 * /privacidad
 * ----------------------------------------------------------------
 * Politica de Privacidad publica de ConsulPay.
 *
 * Diseño:
 *   - Layout limpio sin sidebar (es una pagina publica)
 *   - Header con logo + back link
 *   - Contenido con tipografia legible (max-width acotado)
 *   - Footer con link a TOS y contacto
 *
 * IMPORTANTE — campos a actualizar cuando defamos razon social real:
 *   - "Valkyrium Solutions" / contacto
 *   - "valkyriumsolutions@gmail.com"
 *   - VERSION_TOS (en lib/legal.js) cuando cambien clausulas materiales
 *
 * Marco legal aplicable:
 *   - Ley 25.326 de Proteccion de Datos Personales (Argentina)
 *   - Ley 24.240 de Defensa del Consumidor
 *   - NO se aplica Ley 26.529 (Derechos del Paciente) porque
 *     ConsulPay no almacena datos clinicos — solo administrativos.
 *     Las notas clinicas las guarda cada profesional en su propio
 *     soporte fuera de la plataforma.
 */

import { Link } from 'react-router-dom';

import './Legal.css';

const FECHA_VIGENCIA = '30 de abril de 2026';

export default function PoliticaPrivacidad() {
  return (
    <div className="cp-legal">
      <header className="cp-legal__header">
        <div className="cp-legal__header-inner">
          <Link to="/inicio" className="cp-legal__brand">
            <div className="cp-legal__brand-mark">C</div>
            <div className="cp-legal__brand-name">ConsulPay</div>
          </Link>
          <Link to="/inicio" className="cp-legal__back">
            ← Volver al inicio
          </Link>
        </div>
      </header>

      <main className="cp-legal__main">
        <article className="cp-legal__article">
          <div className="cp-legal__intro">
            <h1 className="cp-legal__title">Política de Privacidad</h1>
            <p className="cp-legal__meta">
              Vigente desde el {FECHA_VIGENCIA}.
            </p>
          </div>

          <section className="cp-legal__section">
            <p>
              Esta Política de Privacidad describe cómo ConsulPay (en adelante,
              <strong> "ConsulPay"</strong>, <strong>"nosotros"</strong> o{' '}
              <strong>"la plataforma"</strong>) recopila, utiliza, almacena y
              protege la información de quienes utilizan el servicio
              (en adelante, <strong>"vos"</strong> o <strong>"el usuario"</strong>).
            </p>
            <p>
              Al utilizar ConsulPay, aceptás las condiciones descritas en este
              documento. Si no estás de acuerdo con alguna de las disposiciones,
              te pedimos que no utilices el servicio.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">1. Quién es responsable de tus datos</h2>
            <p>
              ConsulPay es operado por <strong>Valkyrium Solutions</strong>.
              Cualquier consulta, reclamo o solicitud relacionada con tus datos
              personales podés realizarla escribiendo a{' '}
              <a href="mailto:valkyriumsolutions@gmail.com" className="cp-legal__link">
                valkyriumsolutions@gmail.com
              </a>.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">2. Qué información recopilamos</h2>
            <p>
              La información que recopilamos depende del rol que tenés en la
              plataforma. Solo solicitamos los datos estrictamente necesarios
              para el funcionamiento del servicio.
            </p>

            <h3 className="cp-legal__subsection-title">2.1 Datos de cuenta</h3>
            <p>
              Cuando creás una cuenta, recopilamos: nombre y apellido, dirección
              de correo electrónico, y los datos de autenticación necesarios
              (contraseña encriptada o identificador del proveedor de inicio de
              sesión, en caso de usar Google).
            </p>

            <h3 className="cp-legal__subsection-title">2.2 Datos del consultorio</h3>
            <p>
              Si sos administrador o dueño de un consultorio, también recopilamos:
              nombre del consultorio, dirección, teléfono de contacto, CUIT, y
              datos para transferencias bancarias (CBU, alias) cuando los cargás
              voluntariamente.
            </p>

            <h3 className="cp-legal__subsection-title">2.3 Datos administrativos de pacientes</h3>
            <p>
              Los administradores del consultorio cargan datos administrativos
              de sus pacientes:{' '}
              <strong>nombre, apellido, DNI, teléfono, email y número de obra
              social</strong>. ConsulPay actúa como mero soporte de gestión
              administrativa.
            </p>
            <p className="cp-legal__highlight">
              <strong>ConsulPay no almacena datos clínicos.</strong> Diagnósticos,
              historiales clínicos, notas de sesión y cualquier otro dato
              relacionado con la salud del paciente quedan en exclusivo poder
              del profesional tratante, fuera de nuestra plataforma. ConsulPay
              no procesa, almacena ni tiene acceso a esa información.
            </p>

            <h3 className="cp-legal__subsection-title">2.4 Datos de sesiones y pagos</h3>
            <p>
              Registramos información administrativa de las sesiones (fecha,
              valor, profesional asignado, paciente asignado y método de pago
              utilizado). Para procesar pagos online, no almacenamos datos de
              tarjetas ni credenciales bancarias: esa información la maneja
              directamente el procesador de pagos (Mercado Pago) bajo sus
              propias políticas.
            </p>

            <h3 className="cp-legal__subsection-title">2.5 Datos técnicos</h3>
            <p>
              Cuando usás la plataforma, registramos automáticamente datos
              técnicos básicos: dirección IP, tipo de navegador y dispositivo,
              fecha y hora de acceso. Estos datos se utilizan para garantizar
              la seguridad del servicio y prevenir abusos.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">3. Para qué usamos tus datos</h2>
            <p>Utilizamos la información recopilada exclusivamente para:</p>
            <ul className="cp-legal__list">
              <li>Prestar el servicio de gestión administrativa de consultorios.</li>
              <li>Procesar pagos entre profesionales y consultorios.</li>
              <li>Gestionar suscripciones al Plan Pro.</li>
              <li>Notificarte sobre cambios importantes en tu cuenta o el servicio.</li>
              <li>Cumplir con obligaciones legales y fiscales aplicables.</li>
              <li>Mejorar la plataforma y prevenir usos indebidos.</li>
            </ul>
            <p>
              <strong>No comercializamos tus datos.</strong> No vendemos, alquilamos
              ni compartimos tu información personal con terceros para fines
              publicitarios.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">4. Cómo protegemos tu información</h2>
            <p>
              Utilizamos infraestructura de proveedores reconocidos a nivel
              internacional, con altos estándares de seguridad y certificaciones
              vigentes. Tus datos viajan siempre cifrados (HTTPS/TLS) y se
              almacenan en bases protegidas con cifrado en reposo.
            </p>
            <p>Aplicamos medidas concretas como:</p>
            <ul className="cp-legal__list">
              <li>Cifrado de datos sensibles (incluyendo credenciales de integraciones de pago).</li>
              <li>Reglas de acceso granulares: cada usuario solo puede ver la información que le corresponde según su rol.</li>
              <li>Auditoría de acciones críticas y monitoreo continuo.</li>
              <li>Copias de seguridad periódicas.</li>
            </ul>
            <p>
              Aunque adoptamos medidas razonables y conformes al estado del
              arte, ningún sistema digital es absolutamente invulnerable. Si
              detectáramos un incidente de seguridad que pudiera afectarte, te
              notificaremos a la brevedad por los canales disponibles.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">5. Con quién compartimos tus datos</h2>
            <p>
              Solo compartimos tus datos con terceros cuando es estrictamente
              necesario para prestar el servicio:
            </p>
            <ul className="cp-legal__list">
              <li>
                <strong>Procesador de pagos:</strong> para que puedas cobrar y
                pagar a través de la plataforma, derivamos los datos mínimos
                necesarios (monto, motivo, identificador del pago) al
                procesador de pagos elegido. Los datos de tu tarjeta o cuenta
                bancaria nunca pasan por nuestros sistemas.
              </li>
              <li>
                <strong>Proveedores de infraestructura:</strong> nuestra
                plataforma corre sobre servicios de empresas que nos proveen
                hosting, base de datos y envío de correos transaccionales. Estos
                proveedores tienen acceso técnico a la información estrictamente
                necesaria para operar el servicio y están obligados por contrato
                a mantener la confidencialidad.
              </li>
              <li>
                <strong>Autoridades competentes:</strong> si una autoridad
                judicial o administrativa lo requiere mediante orden formal,
                podemos vernos obligados a compartir información.
              </li>
            </ul>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">6. Tus derechos sobre tus datos</h2>
            <p>
              De acuerdo con la <strong>Ley 25.326 de Protección de Datos
              Personales</strong>, tenés derecho a:
            </p>
            <ul className="cp-legal__list">
              <li><strong>Acceso:</strong> solicitar una copia de los datos que tenemos sobre vos.</li>
              <li><strong>Rectificación:</strong> corregir datos incorrectos o desactualizados.</li>
              <li><strong>Cancelación:</strong> pedir que eliminemos tus datos cuando ya no sean necesarios.</li>
              <li><strong>Oposición:</strong> oponerte al uso de tus datos en ciertos casos.</li>
            </ul>
            <p>
              Para ejercer cualquiera de estos derechos, escribinos a{' '}
              <a href="mailto:valkyriumsolutions@gmail.com" className="cp-legal__link">
                valkyriumsolutions@gmail.com
              </a>{' '}
              con tu solicitud y la documentación que acredite tu identidad.
              Vamos a responderte dentro de los 10 días hábiles que establece
              la ley.
            </p>
            <p>
              También podés realizar consultas o reclamos ante la{' '}
              <strong>Agencia de Acceso a la Información Pública</strong> (AAIP),
              autoridad de aplicación de la Ley 25.326 en Argentina.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">7. Conservación de los datos</h2>
            <p>
              Conservamos tu información mientras tu cuenta esté activa y
              durante el tiempo razonable necesario para cumplir con
              obligaciones legales, contables y fiscales. Cuando solicitás
              eliminar tu cuenta, procedemos a despersonalizar o eliminar tus
              datos, salvo aquellos que estemos obligados a conservar por ley
              (por ejemplo, registros contables y fiscales que la legislación
              vigente exige conservar por un plazo determinado).
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">8. Cookies y tecnologías similares</h2>
            <p>
              Utilizamos cookies y almacenamiento local en tu navegador
              estrictamente necesarios para el funcionamiento de la plataforma:
              mantener tu sesión iniciada, recordar tus preferencias y proteger
              contra accesos no autorizados. No utilizamos cookies con fines
              publicitarios ni rastreamos tu actividad fuera de ConsulPay.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">9. Menores de edad</h2>
            <p>
              ConsulPay no está dirigido a menores de 18 años. Si sos
              profesional, debés tener mayoría de edad y matrícula habilitada
              para ejercer tu profesión. Si descubrimos que un menor creó una
              cuenta sin autorización, procederemos a eliminarla.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">10. Cambios en esta política</h2>
            <p>
              Podemos actualizar esta política para reflejar cambios en el
              servicio o en la legislación aplicable. Cuando hagamos cambios
              relevantes, te notificaremos con razonable antelación a través
              del email registrado en tu cuenta o mediante un aviso destacado
              en la plataforma. La fecha de vigencia siempre figura al inicio
              de este documento.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">11. Contacto</h2>
            <p>
              Si tenés preguntas, dudas o reclamos sobre esta política o el
              tratamiento de tus datos, podés contactarnos en{' '}
              <a href="mailto:valkyriumsolutions@gmail.com" className="cp-legal__link">
                valkyriumsolutions@gmail.com
              </a>.
            </p>
          </section>
        </article>

        <footer className="cp-legal__footer">
          <div className="cp-legal__footer-links">
            <Link to="/terminos" className="cp-legal__footer-link">
              Términos y Condiciones
            </Link>
            <span className="cp-legal__footer-sep">·</span>
            <Link to="/inicio" className="cp-legal__footer-link">
              Inicio
            </Link>
          </div>
          <div className="cp-legal__footer-meta">
            ConsulPay · Operado por Valkyrium Solutions
          </div>
        </footer>
      </main>
    </div>
  );
}
