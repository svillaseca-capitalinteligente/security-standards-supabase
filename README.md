# Security Standards — Supabase (importable, con dientes)

**Políticas de seguridad** —no "buenas prácticas"— aplicadas a arquitectura y diseño,
para proyectos web sobre **Supabase + Netlify**, importables en cada repo. La
diferencia es el verbo: una buena práctica se **sugiere** (y se ignora); una política
se **hace cumplir** con un gate que rompe el build. No reemplaza a devground: es la
**capa de seguridad que devground no cubre** (su propio `SECURITY.md` la declina). Se
importan juntos.

## Principio de diseño (la diferencia con un doc de "buenas prácticas")

> **La IA produce; la máquina es el portero.**
> No se delega el enforcement al criterio de la IA ni a la disciplina humana —
> justo donde ambos se doblan bajo deadline. Cada invariante tiene un **check
> determinista que rompe el build**. Un estándar sin gates ejecutables es prosa.

## Arquitectura que el estándar prescribe (Supabase nativo, sin servidores propios)

```
Front (presentación pura, host gestionado)
   │  HTTPS + token del usuario — el front NUNCA toca la BD
   ▼
Supabase Edge Functions  = backend: lógica de dominio + acceso a BD guardado
   │  validan token + scope (org_id/ownership); tienen el credencial, el front no
   ▼
Supabase Postgres + RLS activa + Auth/OIDC en el borde
```

- El front depende solo de **contratos/tipos + un SDK** que llama Edge Functions.
- **Todo acceso a BD vive dentro de Edge Functions**: scope obligatorio, columnas
  explícitas, sin `select *`, sin ruta cliente→BD.
- RLS activa en toda tabla (defensa en profundidad; el rol privilegiado la bypassea,
  así que RLS **no** sustituye la autorización de la función).

### Política de entornos (Netlify)

Los **preview deploys de Netlify son URLs públicas**. Política, no sugerencia:

- Un preview **nunca** apunta a una Supabase con **datos reales** de clientes.
- Ningún entorno público (preview/prod) arranca con mock auth activo — el guard
  anti-mock (INV-7) debe fallar el arranque si `NEXT_PUBLIC_MOCK_AUTH` está activo
  fuera de desarrollo.
- Secretos en env de Netlify, nunca en el repo ni con prefijo `NEXT_PUBLIC_`.

## Invariantes (ver el documento de estándares para el detalle)

INV-1 front = presentación pura · INV-2 identidad/PII/RBAC nunca al cliente ·
INV-3 lógica tras el límite (Edge Functions) · INV-4 acceso a BD parametrizado y
guardado · INV-5 RLS activa · INV-6 secretos server-only, sin fingerprint ·
INV-7 auth real, sin mock en entornos con datos · INV-8 la seguridad es parte del
Definition of Done, no se pospone.

## Qué trae (teeth)

| Pieza | Estado | Cierra |
|---|---|---|
| `skills/desarrollo-seguro/` (skill para Claude Code) | ✅ | INV-1..8 en tiempo de generación + DoD auto-verificado (INV-8) |
| `semgrep/security-rules.yml` | ✅ (starter) | INV-4/6/7 (backstop) |
| `.github/workflows/security-gate.yml` (reusable, `workflow_call`) | ✅ | corre lint+build+semgrep+gitleaks+audit + test negativo RLS |
| `eslint/security.config.mjs` (reglas en `error`) | ✅ | INV-1/3 + type-safety |
| `server-only` guard | ⏳ próximo | INV-1/2/3 (build falla) |
| `templates/edge-function/` (golden path) | ✅ | INV-3/4 por construcción |
| Harness RLS + test negativo (anon no lee) | ⏳ próximo | INV-5 (evidencia auditable) |
| SQL RLS por tabla (ENABLE + policies) | ⏳ próximo | INV-5 |
| DoD / PR template | ⏳ próximo | INV-8 |

## Cómo se adopta

**La skill (guía a Claude en tiempo de generación):**

```
/plugin marketplace add svillaseca-capitalinteligente/security-standards-supabase
/plugin install security-standards@security-standards
```

**El CI gate (backstop determinista):**

1. Copiar `templates/github/security-gate-caller.yml` al repo destino como
   `.github/workflows/security-gate.yml` (es un caller de ~25 líneas; la lógica
   vive acá y las mejoras llegan solas — anti-drift).
2. Ajustar `package_manager` y `protected_tables`; configurar los secrets
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` si se usa el test negativo de RLS.
3. Activar branch protection exigiendo el check: **build rojo = no merge**.
   Ese es el estándar, no el doc.

> Requisito: este repo debe permitir reusable workflows hacia los repos destino
> (Settings → Actions → General → Access) o ser público.

> Nota: los checks son deterministas por diseño. Lo que la IA escribe pasa por el
> mismo portero que lo que escribe un humano.
