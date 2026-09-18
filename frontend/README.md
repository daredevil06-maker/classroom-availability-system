# Classroom Allocation System - Frontend

Modern, responsive web interface built with **React 19**, **Vite**, and **Tailwind CSS v4** providing role-tailored dashboards for Faculty, Department Heads (HOD), and Campus Administrators.

---

## 🚀 Overview

The frontend client serves three primary user personas:
1. **Faculty / Teachers:**
   - Real-time classroom availability search with dynamic filters (date, time window).
   - Smart booking submission (participants, activity type, rationale).
   - Personal timetable viewer showing recurring curriculum lectures.
   - Live status tracking of requests (Approved, Pending, Reassigned, Cancelled).
   - Direct response interface for reassigned room proposals.
2. **Head of Department (HOD):**
   - Department-wide booking overview and conflict monitoring.
   - Alternative classroom suggestion workflow with real-time constraint validation.
3. **System Administrator:**
   - Classroom inventory manager (register new rooms, edit capacity, equipment, and operational status).
   - Master academic timetable manager (add, inspect, or delete recurring course schedules).
   - Dynamic activity priority weight matrix (adjust priority ratings from 10 to 95).

---

## 🛠️ Tech Stack & Dependencies

- **Framework:** React 19 (`react`, `react-dom`)
- **Build Tool:** Vite 8 (`@vitejs/plugin-react`)
- **Styling:** Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`)
- **Linting:** ESLint 10 with React Hooks and React Refresh plugins

---

## 📂 Key Components & Structure

```text
frontend/
├── public/               # Static assets & SVG icons
├── src/
│   ├── AdminDashboard.jsx # Admin management center (Rooms, Timetable, Priorities)
│   ├── HodDashboard.jsx   # HOD conflict review & room suggestion interface
│   ├── App.jsx            # Teacher portal, authentication, request lifecycle
│   ├── App.css            # Custom CSS enhancements
│   ├── index.css          # Tailwind CSS v4 entry point
│   └── main.jsx           # React root rendering
├── package.json          # Dependencies & scripts
└── vite.config.js         # Vite configuration with Tailwind plugin
```

---

## 💻 Available Scripts

In the `frontend` directory, you can run:

### `npm run dev`
Starts the Vite development server with Hot Module Replacement (HMR) at `http://localhost:5173`.

### `npm run build`
Bundles and optimizes the production build into the `dist/` directory.

### `npm run preview`
Locally previews the production build created by `npm run build`.

### `npm run lint`
Runs ESLint across all `.js` and `.jsx` files to check code quality.

---

## 🔌 API Integration

By default, the frontend interacts with the backend Express server running at:
```text
http://localhost:5000/api
```
JWT tokens obtained during authentication are persisted in `localStorage` and automatically attached to requests in the `Authorization: Bearer <token>` header.
