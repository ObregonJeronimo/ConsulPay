# ConsulPay

Sistema web de gestión para consultorios: administración de profesionales, seguimiento de sesiones, cálculo automático de deudas por porcentaje y cobros vía transferencia / Mercado Pago / Ualá.

## Stack

- **Frontend:** React 19 + Vite
- **Routing:** React Router v7
- **Backend / DB:** Firebase (Auth + Firestore)
- **Deploy:** Vercel
- **Tipografía:** Source Serif 4, Inter Tight, JetBrains Mono (via Google Fonts)

## Desarrollo local

```bash
npm install
npm run dev
```

La app queda disponible en `http://localhost:5173`.

## Scripts

| Comando          | Qué hace                                |
| ---------------- | --------------------------------------- |
| `npm run dev`    | Server de desarrollo con HMR            |
| `npm run build`  | Build de producción en `dist/`          |
| `npm run lint`   | ESLint sobre todo el proyecto           |
| `npm run preview`| Sirve el build local para testearlo     |

## Estructura

```
src/
├── App.jsx                     # Router principal
├── main.jsx                    # Entry point
├── styles/                     # Design tokens, reset, globals
├── lib/
│   ├── firebase.js             # Inicialización Firebase
│   └── constants.js            # Enums, formateadores ARS/fechas
├── components/
│   ├── layout/                 # AppShell + Sidebar
│   └── ui/                     # Button, Card, Badge, Metric, Avatar
└── pages/
    └── admin/
        └── Dashboard.jsx       # Vista del dueño del consultorio
```

## Roles

- **Admin** (dueño): panel de control, gestiona profesionales y aprueba altas, ve deudas y confirma pagos.
- **Profesional:** autogestión, ve sus pacientes/sesiones del mes, paga al consultorio.

## Estado del proyecto

🚧 En desarrollo activo. Fase 1: setup + diseño base + dashboard admin con datos mock.

## Deploy

Auto-deploy a Vercel desde la rama `main`.
