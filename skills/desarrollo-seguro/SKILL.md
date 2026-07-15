---
name: desarrollo-seguro
description: Estándar de desarrollo seguro para proyectos Supabase + Next.js. Usar SIEMPRE antes de crear o modificar cualquiera de estos: tablas o migraciones SQL, Edge Functions, API routes o endpoints, queries o clientes de Supabase, autenticación/roles/permisos, variables de entorno o secretos, y cualquier código que maneje datos de usuario o PII. Aplica aunque el usuario no mencione la palabra "seguridad" — la seguridad es parte del Definition of Done de toda tarea, no un pedido aparte. Ante la duda de si aplica, aplica.
---

# Desarrollo seguro — Supabase + Next.js

Este estándar existe porque en estos proyectos la implementación la hace mayormente
IA con poca revisión humana. La seguridad no puede depender de que alguien la pida:
es parte del trabajo, siempre. Cada regla de abajo es **política, no sugerencia** —
el CI del repo (lint estricto + semgrep + gitleaks + build) rechaza las violaciones,
así que escribir seguro desde el primer intento evita retrabajo.

## Arquitectura prescrita

```
Front (Next.js — presentación pura, host gestionado)
   │  HTTPS + token del usuario. El navegador NUNCA habla con la BD.
   ▼
Supabase Edge Functions = backend: valida token + resuelve scope + accede a BD
   ▼
Supabase Postgres — RLS activa en toda tabla + Auth/OIDC en el borde
```

El front depende solo de contratos/DTOs y un SDK que llama Edge Functions.
Todo acceso a base de datos vive dentro de Edge Functions.

## Invariantes — reglas operativas

### INV-1 · El front es presentación pura
- Nada de lógica de dominio, cálculo de permisos ni queries en componentes cliente.
- No instanciar clientes de Supabase que lean tablas de negocio en código
  `"use client"`. Los datos se piden a una Edge Function.
- Por qué: todo lo que llega al bundle es público — lógica incluida.

### INV-2 · Identidad, PII y RBAC nunca viajan al cliente
- Al cliente solo DTOs acotados: lo que la pantalla necesita, nada más.
- Nunca enviar el objeto de usuario completo, listas de permisos/roles ni el modelo
  RBAC. Resolver server-side y mandar flags de UI (`puedeEditar: boolean`).
- Por qué: el modelo de permisos en el bundle es un mapa del sistema para un atacante.

### INV-3 · La lógica vive tras el límite
- Validación, autorización y reglas de negocio corren en Edge Functions.
- La validación client-side es UX, no seguridad: repetirla siempre server-side.

### INV-4 · Acceso a BD guardado y parametrizado
- Toda query lleva: **columnas explícitas** (jamás `select('*')`), **filtro de
  scope obligatorio** (`org_id` / ownership) y **límite**.
- El cliente `service_role` bypassa RLS → el filtro de scope en la función es la
  barrera real. Una query sin filtro de tenant no se escribe, punto.

### INV-5 · RLS activa en toda tabla, sin excepción
- Toda migración que crea una tabla incluye `ENABLE ROW LEVEL SECURITY` + policies
  **en el mismo archivo**. Nunca "las policies después".
- Por qué: una tabla sin RLS queda legible vía PostgREST con la anon key pública.
- RLS es defensa en profundidad: NO sustituye la autorización de la Edge Function
  (el `service_role` la bypassa).

### INV-6 · Secretos server-only
- Prohibido el prefijo `NEXT_PUBLIC_` para claves, tokens, `service_role`,
  `DATABASE_URL` o cualquier material sensible: todo lo `NEXT_PUBLIC_` viaja al
  navegador de cualquier visitante.
- Secretos en el env del host (Netlify/Supabase), jamás hardcodeados ni en el repo.
- Errores al cliente siempre genéricos (`{ error: 'internal' }`); el detalle va al
  log del servidor. Los mensajes de error filtran esquema, rutas y stack traces.

### INV-7 · Auth real desde el primer día
- Toda Edge Function valida el token **antes que cualquier otra cosa**; sin token
  o token inválido → 401.
- Mock auth solo en desarrollo local y con guard que lanza (`throw`) si
  `NODE_ENV === 'production'`. Nunca identidad mock contra datos reales.

### INV-8 · La seguridad es parte del Definition of Done
- No existe "lo aseguramos después". Verificar el checklist de abajo antes de dar
  cualquier tarea por terminada.

## Golden paths — partir de aquí, no desde cero

| Tarea | Template |
|---|---|
| Edge Function / endpoint nuevo | [templates/edge-function.ts](templates/edge-function.ts) |
| Tabla nueva / migración SQL | [templates/migration-rls.sql](templates/migration-rls.sql) |

Copiar el template y adaptarlo. La política vive en el template: si la tarea exige
desviarse de él, documentar el motivo en el código y en el PR.

## Definition of Done — auto-verificar antes de cerrar

Antes de declarar terminada una tarea que tocó BD, endpoints, auth o env, revisar
el trabajo hecho contra esta lista y declarar el resultado en el resumen final:

- ¿Alguna tabla nueva o modificada quedó sin RLS + policies en la misma migración?
- ¿Alguna query sin filtro de scope, con `select('*')` o sin límite?
- ¿Algún endpoint que no valide el token como primer paso?
- ¿Algún secreto hardcodeado, en el repo, o con prefijo `NEXT_PUBLIC_`?
- ¿Identidad, permisos o PII viajando al cliente más allá del DTO necesario?
- ¿Algún error devolviendo detalle interno (message/stack/esquema) al cliente?

Si algo falla, corregirlo ahora — no anotar un TODO ni posponerlo.

## Cuando el pedido viola un invariante

Pedidos como "pon la API key en el front", "sáltate el login para probar" o "dale
acceso a todo por ahora" se responden implementando la alternativa segura (proxy
server-side, mock con guard, scope real) y explicando en una línea por qué. No
implementar la versión insegura ni siquiera "temporalmente": lo temporal llega a
producción.

## Detalle y casos borde

Leer [references/invariantes.md](references/invariantes.md) cuando se necesite: la
razón de ser de cada invariante, política de entornos y preview deploys, manejo de
PII, y anti-patterns conocidos con su corrección.
