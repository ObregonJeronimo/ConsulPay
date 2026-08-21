# Suite de verificación

Renderiza los componentes reales contra jsdom, con Firestore stubeado en
memoria. No toca la base ni necesita credenciales.

## Correr

```bash
cd tests
npm install esbuild react react-dom jsdom react-router-dom
node build.mjs && node suite.bundle.mjs
```

Sale con código 1 si algo falla, así que sirve para un pre-push hook.

## Qué cubre

1. `mpHabilitado` — la regla de "todos los admins vincularon"
2. `nombrePaciente` centralizado
3. Libro de caja — caja MP, selector de mes único, agrupación, cierre, celdas mobile
4. Mis sesiones — orden alfabético con acentos, acciones por fila
5. Marcar como pagado — selección multi-mes y desglose
6. Aprobación del admin — precarga de lo declarado por el profesional
7. Mis pagos — sección de MP condicionada
8. Pagos del admin — pestañas MP condicionadas
9. Directorio de admins — alta, baja y siembra al crear el consultorio
10. Planilla de pacientes — xlsx válido, escapes XML, filtro por método de pago
11. Método renombrado — nombre vivo por id, porcentaje histórico intacto
12. Navegación de meses — futuros habilitados en los modales de cobro
13. Selector de mes — estilos compartidos, visibles en las cinco pantallas
14. Modal de gasto — usa los componentes de formulario del sistema
15. Notificaciones push — service worker, manifest, cron y anti-repetición
16. Ciclos de recordatorios — primera aparición, día del mes, desbordamiento
17. Dashboard — métricas del consultorio y totales por mes de la tabla anual
18. Asignar profesionales — dos listas, orden alfabético, vacíos y accesibilidad
19. Pacientes por profesional — buscador, paginación y regla de no dejar huérfanos
20. Padding de modales — el contenido nunca toca el borde
21. Orden por método de pago — inmediatos antes que diferidos, agrupados
22. Estado por paciente — matriz pacientes × meses de un profesional

## Límite conocido

jsdom no calcula layout: se verifica la estructura del DOM, no cómo se ve.
Para lo visual hace falta un navegador.
