/**
 * /terminos
 * ----------------------------------------------------------------
 * Terminos y Condiciones publicos de ConsulPay.
 *
 * Diseño identico a PoliticaPrivacidad para coherencia visual.
 *
 * IMPORTANTE — campos a actualizar cuando defamos razon social real:
 *   - "Valkyrium Solutions" / contacto
 *   - "valkyriumsolutions@gmail.com"
 *   - VERSION_TOS (en lib/legal.js) cuando cambien clausulas materiales
 *
 * Marco legal aplicable:
 *   - Ley 24.240 de Defensa del Consumidor (cuando aplique)
 *   - Ley 25.326 de Proteccion de Datos Personales
 *   - Codigo Civil y Comercial de la Nacion (Argentina)
 *
 * Notas sobre clausulas comerciales:
 *   - Las comisiones (6% Free, 2% Pro) NO se hardcodean acá porque
 *     pueden cambiar via /config/comisiones. Se mencionan como
 *     "según el plan vigente al momento de cada operación".
 *   - El precio del Plan Pro tampoco se hardcodea ($50.000/mes)
 *     porque sale de env var CONSULPAY_PRECIO_PRO_ARS.
 */

import { Link } from 'react-router-dom';

import './Legal.css';

const FECHA_VIGENCIA = '30 de abril de 2026';

export default function TerminosCondiciones() {
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
            <h1 className="cp-legal__title">Términos y Condiciones</h1>
            <p className="cp-legal__meta">
              Vigentes desde el {FECHA_VIGENCIA}.
            </p>
          </div>

          <section className="cp-legal__section">
            <p>
              Bienvenido a ConsulPay. Estos Términos y Condiciones (en
              adelante, los <strong>"Términos"</strong>) regulan el uso de la
              plataforma ConsulPay (en adelante, <strong>"ConsulPay"</strong>,
              <strong> "nosotros"</strong> o <strong>"la plataforma"</strong>),
              operada por <strong>Valkyrium Solutions</strong>.
            </p>
            <p>
              Al crear una cuenta o utilizar el servicio, aceptás estos
              Términos en su totalidad. Si no estás de acuerdo, te pedimos
              que no utilices la plataforma.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">1. Qué es ConsulPay</h2>
            <p>
              ConsulPay es una plataforma de gestión administrativa para
              consultorios profesionales. Permite registrar profesionales,
              pacientes y sesiones, calcular el reparto económico entre el
              profesional y el consultorio, y procesar los pagos correspondientes
              a través de integraciones con procesadores de pago externos.
            </p>
            <p>
              ConsulPay <strong>no presta servicios profesionales de salud</strong>,
              no almacena historias clínicas, no participa de la relación
              clínica entre profesional y paciente, y no asesora sobre
              diagnósticos, tratamientos o cuestiones médicas. Somos
              exclusivamente un soporte de gestión administrativa.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">2. Quiénes pueden usar la plataforma</h2>
            <p>Para utilizar ConsulPay debés:</p>
            <ul className="cp-legal__list">
              <li>Ser mayor de 18 años.</li>
              <li>
                Si actuás como profesional de la salud, contar con la
                matrícula o habilitación correspondiente vigente en tu
                jurisdicción.
              </li>
              <li>
                Si actuás como administrador o dueño de un consultorio,
                contar con la autoridad legal para gestionar la operación
                administrativa de ese consultorio.
              </li>
              <li>Brindar información verídica al registrarte.</li>
            </ul>
            <p>
              Nos reservamos el derecho de suspender o eliminar cuentas
              cuando detectemos información falsa, usos indebidos o
              violaciones a estos Términos.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">3. Cómo funciona el servicio</h2>
            <p>
              ConsulPay opera con tres tipos de roles principales: dueño de
              consultorio, administrador y profesional. Cada rol tiene
              permisos específicos sobre la plataforma.
            </p>
            <p>
              El registro de sesiones, pacientes y métodos de pago lo
              realizan los administradores del consultorio. Los profesionales
              pueden registrar sus propias sesiones si el administrador les
              otorgó permisos para hacerlo.
            </p>
            <p>
              Los pagos entre profesionales y consultorios se procesan a
              través de un procesador de pagos integrado. ConsulPay actúa
              como intermediario técnico facilitando la operación.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">4. Planes, comisiones y suscripciones</h2>

            <h3 className="cp-legal__subsection-title">4.1 Plan gratuito</h3>
            <p>
              ConsulPay ofrece un plan gratuito que permite acceder a las
              funciones esenciales del servicio. Este plan no requiere pago
              mensual alguno. Cada operación de pago entre profesionales y
              consultorios genera una comisión a favor de ConsulPay,
              calculada como un porcentaje del monto operado, según el plan
              vigente al momento de cada operación.
            </p>

            <h3 className="cp-legal__subsection-title">4.2 Plan Pro</h3>
            <p>
              ConsulPay ofrece un Plan Pro mediante suscripción mensual,
              cuyo precio actual se informa al momento de la contratación
              dentro de la plataforma. Este plan incluye una comisión
              reducida sobre las operaciones de pago.
            </p>
            <p>
              La suscripción se renueva automáticamente cada 30 días desde
              la fecha del último cobro exitoso. Podés cancelar la
              suscripción en cualquier momento desde tu panel: al cancelar,
              mantenés los beneficios del Plan Pro hasta el fin del período
              ya pagado, y luego volvés automáticamente al plan gratuito.
            </p>

            <h3 className="cp-legal__subsection-title">4.3 Cobro y fallos</h3>
            <p>
              Si por algún motivo no podemos cobrar la renovación mensual
              (tarjeta vencida, sin saldo, rechazo del banco u otro), el
              sistema realiza hasta 3 reintentos en un plazo de 3 días.
              Si todos los reintentos fallan, la suscripción se cancela
              automáticamente y el consultorio vuelve al plan gratuito.
            </p>

            <h3 className="cp-legal__subsection-title">4.4 Cambios en planes y comisiones</h3>
            <p>
              ConsulPay se reserva el derecho de modificar los planes y los
              porcentajes de comisión. Cualquier cambio se comunicará con al
              menos 30 días de anticipación a través del email registrado o
              de un aviso destacado en la plataforma. Los cambios en
              comisiones se aplican únicamente a operaciones futuras.
            </p>

            <h3 className="cp-legal__subsection-title">4.5 Reembolsos</h3>
            <p>
              Las suscripciones mensuales no generan derecho a reembolso
              salvo que un error técnico atribuible exclusivamente a
              ConsulPay haya impedido el uso del servicio durante el período
              pagado. En esos casos, podés reclamar el reembolso escribiendo
              a nuestro correo de contacto.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">5. Procesamiento de pagos</h2>
            <p>
              Los pagos online se procesan mediante un procesador de pagos
              externo. Al realizar una operación, los datos de tu medio de
              pago (tarjeta, cuenta bancaria) <strong>no pasan por ni se
              almacenan en ConsulPay</strong>: van directamente al procesador,
              que los maneja bajo sus propios términos y políticas de
              seguridad.
            </p>
            <p>
              ConsulPay no se responsabiliza por:
            </p>
            <ul className="cp-legal__list">
              <li>
                Cargos, comisiones o cobros del procesador de pagos, que
                son ajenos a las comisiones de ConsulPay.
              </li>
              <li>
                Demoras en la acreditación de fondos atribuibles al
                procesador o a entidades bancarias.
              </li>
              <li>
                Disputas, contracargos o reembolsos gestionados directamente
                con el procesador.
              </li>
            </ul>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">6. Responsabilidades del usuario</h2>
            <p>Como usuario de ConsulPay, te comprometés a:</p>
            <ul className="cp-legal__list">
              <li>
                Brindar información verídica y mantenerla actualizada.
              </li>
              <li>
                Mantener la confidencialidad de tu contraseña y notificarnos
                de inmediato ante cualquier acceso no autorizado.
              </li>
              <li>
                Utilizar la plataforma únicamente para fines lícitos y
                conforme a estos Términos.
              </li>
              <li>
                Cumplir con la legislación aplicable a tu actividad,
                incluyendo obligaciones fiscales, laborales y profesionales.
              </li>
              <li>
                Si cargás datos de pacientes, contar con el consentimiento
                de los mismos para hacerlo y respetar la legislación vigente
                en materia de protección de datos personales.
              </li>
              <li>
                No utilizar la plataforma para actividades fraudulentas, de
                lavado de dinero o de cualquier otra forma ilegal.
              </li>
            </ul>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">7. Limitación de responsabilidad</h2>
            <p>
              ConsulPay se ofrece <strong>"tal cual está"</strong>. Hacemos
              esfuerzos razonables para que el servicio funcione de manera
              continua y segura, pero no podemos garantizar que la plataforma
              esté libre de errores, interrupciones o disponible al 100%
              del tiempo.
            </p>
            <p>
              En la máxima medida permitida por la ley, ConsulPay no será
              responsable por:
            </p>
            <ul className="cp-legal__list">
              <li>
                Daños indirectos, lucro cesante, pérdida de datos o
                interrupciones de la actividad profesional o comercial del
                usuario.
              </li>
              <li>
                Decisiones clínicas, profesionales o comerciales tomadas
                por el usuario sobre la base de la información administrativa
                de la plataforma.
              </li>
              <li>
                Inconvenientes ajenos a nuestro control: fallas en
                proveedores de internet, procesadores de pago, entidades
                bancarias, etc.
              </li>
              <li>
                Uso indebido de la plataforma por terceros que hayan
                accedido a una cuenta sin autorización.
              </li>
            </ul>
            <p>
              Nuestra responsabilidad máxima frente al usuario, en cualquier
              caso, queda limitada a los importes efectivamente pagados por
              el usuario a ConsulPay en concepto de suscripción durante los
              tres meses anteriores al hecho que motiva el reclamo.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">8. Suspensión y cancelación de cuentas</h2>
            <p>
              Podemos suspender o cancelar tu cuenta cuando:
            </p>
            <ul className="cp-legal__list">
              <li>Detectemos violaciones a estos Términos.</li>
              <li>Detectemos actividad fraudulenta o sospechosa.</li>
              <li>
                Una autoridad judicial o administrativa lo requiera mediante
                orden formal.
              </li>
              <li>El servicio sea discontinuado total o parcialmente.</li>
            </ul>
            <p>
              Vos podés cancelar tu cuenta en cualquier momento. Si tenés
              una suscripción Pro activa, mantenés los beneficios hasta el
              fin del período pagado.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">9. Propiedad intelectual</h2>
            <p>
              Todos los elementos de ConsulPay (código, diseño, marca,
              logotipos, textos, ícnos) son propiedad de Valkyrium Solutions
              o de sus respectivos titulares y están protegidos por las
              leyes vigentes en materia de propiedad intelectual.
            </p>
            <p>
              No podés copiar, modificar, distribuir, comercializar ni
              utilizar de cualquier otra forma estos elementos sin nuestra
              autorización expresa.
            </p>
            <p>
              Los datos que vos cargás (de tu consultorio, profesionales,
              pacientes, sesiones) siguen siendo tuyos. ConsulPay solo los
              procesa para prestar el servicio según se describe en la
              Política de Privacidad.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">10. Modificaciones a estos Términos</h2>
            <p>
              Podemos actualizar estos Términos para reflejar cambios en el
              servicio, en la legislación o en nuestras prácticas comerciales.
              Cuando hagamos cambios materiales, te notificaremos con al
              menos 30 días de anticipación a través del email registrado o
              de un aviso destacado en la plataforma.
            </p>
            <p>
              Si seguís utilizando el servicio después de la entrada en
              vigencia de los nuevos Términos, se considerará que los
              aceptaste. Si no estás de acuerdo, podés cancelar tu cuenta
              antes de la fecha de vigencia.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">11. Ley aplicable y jurisdicción</h2>
            <p>
              Estos Términos se rigen por la legislación de la República
              Argentina. Cualquier controversia que pueda surgir en relación
              con el servicio será resuelta por los tribunales ordinarios
              de la ciudad correspondiente al domicilio de Valkyrium
              Solutions, salvo disposición legal en contrario que proteja
              al usuario consumidor.
            </p>
          </section>

          <section className="cp-legal__section">
            <h2 className="cp-legal__section-title">12. Contacto</h2>
            <p>
              Para consultas, reclamos o sugerencias relacionadas con estos
              Términos o con el servicio en general, podés escribirnos a{' '}
              <a href="mailto:valkyriumsolutions@gmail.com" className="cp-legal__link">
                valkyriumsolutions@gmail.com
              </a>.
            </p>
          </section>
        </article>

        <footer className="cp-legal__footer">
          <div className="cp-legal__footer-links">
            <Link to="/privacidad" className="cp-legal__footer-link">
              Política de Privacidad
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
