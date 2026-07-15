# Invariantes — detalle, razón de ser y casos borde

Referencia extendida de la skill `desarrollo-seguro`. Leer la sección que aplique
a la tarea en curso; no hace falta leer todo.

## Índice

1. [INV-1/2/3 — El límite cliente/servidor](#inv-123)
2. [INV-4 — Acceso a BD guardado](#inv-4)
3. [INV-5 — RLS](#inv-5)
4. [INV-6 — Secretos y errores](#inv-6)
5. [INV-7 — Auth real y mock](#inv-7)
6. [Política de entornos y preview deploys](#entornos)
7. [PII y datos de usuario](#pii)
8. [Anti-patterns conocidos](#anti-patterns)

<a name="inv-123"></a>
## 1. INV-1/2/3 — El límite cliente/servidor

**El modelo mental**: todo lo que se importa desde un componente cliente termina
en el bundle de JavaScript, y el bundle es un archivo público que cualquier
visitante puede descargar y leer. No hay "medio privado": o corre en el servidor,
o es público.

Consecuencias prácticas:

- Un archivo `lib/permissions.ts` con la matriz de roles, importado por un
  componente cliente, publica el modelo de autorización completo.
- Un objeto de usuario con `permissions: [...]` serializado a props llega al
  HTML/JSON de la página.
- La "ofuscación" no existe: los bundles se leen con un formateador.

**Qué mandar al cliente**: el DTO mínimo por pantalla. Si la UI necesita saber si
puede mostrar un botón, mandar `puedeEditar: boolean` (calculado server-side), no
la lista de roles para que el cliente lo calcule.

**Marcar módulos server-only**: en proyectos Next, los módulos de dominio,
identidad y acceso a datos llevan `import 'server-only'` en la primera línea.
Con eso, si alguien los importa desde código cliente, el build revienta — el
error se detecta en compilación, no en un pentest.

<a name="inv-4"></a>
## 2. INV-4 — Acceso a BD guardado

Las tres reglas de toda query y su porqué:

| Regla | Por qué |
|---|---|
| Columnas explícitas, no `select('*')` | `*` expone columnas futuras que nadie auditó (un `notas_internas` agregado después viaja solo). El DTO define el contrato. |
| Filtro de scope obligatorio | El `service_role` bypassa RLS. Sin `.eq('org_id', scope.orgId)` la query devuelve datos de TODOS los tenants. |
| Límite siempre | Sin `limit`, un endpoint es un exfiltrador de tabla completa y un DoS de memoria. |

**El scope se resuelve server-side.** Un `org_id` que llega en el body, query
string o header del request es input del atacante — se ignora y se resuelve el
scope real desde el token (`auth.getUser()` → lookup de perfil/rol).

**Inputs del usuario**: validar tipo y forma antes de usar (ideal: un schema tipo
zod). Los IDs que llegan del cliente se usan solo DENTRO del scope ya resuelto
(`.eq('id', inputId).eq('org_id', scope.orgId)`), nunca como scope en sí.

<a name="inv-5"></a>
## 3. INV-5 — RLS

**El vector concreto**: Supabase expone PostgREST en `<proyecto>.supabase.co/rest/v1/`
y la anon key es pública por diseño (viaja en el front). Una tabla sin RLS es
legible y escribible por cualquiera en internet con dos headers. Esto no es
teórico — es el fallo más común en proyectos Supabase.

Reglas:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en la MISMA migración que crea la
  tabla. Sin excepciones, incluidas tablas "internas", de log o "temporales".
- Con RLS activa y cero policies, el default es deny — ese es el estado correcto
  para tablas que solo se acceden vía Edge Functions. Dejar comentario de que es
  intencional.
- Policies con subqueries a tablas de perfil: usar helpers `SECURITY DEFINER`
  (p. ej. `user_belongs_to_org(uuid)`) para evitar recursión de RLS sobre la
  propia tabla de perfiles y para centralizar la lógica.
- RLS es defensa en profundidad. La autorización REAL de la arquitectura
  prescrita vive en la Edge Function (el service_role bypassa RLS). Tener ambas
  es el diseño, no redundancia.

**Verificación**: el test negativo del CI (anon key no puede leer tablas de
negocio) es la evidencia auditable. Si agregas una tabla de negocio, agrégala a
`PROTECTED_TABLES` del workflow.

<a name="inv-6"></a>
## 4. INV-6 — Secretos y errores

**La regla del prefijo**: en Next.js, `NEXT_PUBLIC_*` se inyecta en el bundle en
build time. Es un mecanismo para configuración pública (URL del API, flags de
UI), jamás para material sensible. `SUPABASE_ANON_KEY` es pública por diseño y
puede ser `NEXT_PUBLIC_`; `SERVICE_ROLE`, claves de APIs de pago (OpenAI, etc.),
`DATABASE_URL` y tokens, nunca.

**Dónde viven los secretos**: env del host (Netlify UI / `supabase secrets set`),
nunca en el repo — ni en `.env` commiteado, ni en el historial (gitleaks escanea
el historial completo; un secreto commiteado y borrado sigue ahí y se rota).

**Errores**: al cliente solo `{ error: 'unauthorized' | 'forbidden' | 'invalid_input' | 'internal' }`
con el status HTTP correcto. El `error.message` de Postgres/Supabase filtra
nombres de tablas, columnas y constraints — va a `console.error` (log del
servidor), no a la respuesta.

**Consumo de APIs externas desde el front**: nunca directo (la key viajaría al
navegador). Siempre proxy: Edge Function que tiene la key, valida el token del
usuario, aplica el rate limit propio y llama a la API externa.

<a name="inv-7"></a>
## 5. INV-7 — Auth real y mock

- Toda Edge Function empieza validando el token. La comprobación es
  `auth.getUser()` (verifica firma y expiración server-side), no decodificar el
  JWT a mano ni confiar en claims sin verificar.
- Mock auth (usuarios falsos para desarrollo) solo detrás de un guard que lanza
  en producción:

```ts
if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MOCK_AUTH activo en producción — abortando arranque');
  }
  // ... mock solo aquí
}
```

- Nunca identidad mock contra una base con datos reales, ni siquiera en local.

<a name="entornos"></a>
## 6. Política de entornos y preview deploys

Los preview deploys (Netlify/Vercel) son **URLs públicas** accesibles por
cualquiera que tenga el link. Por lo tanto:

- Un preview nunca apunta a una Supabase con datos reales de clientes. Preview →
  proyecto Supabase de staging con datos sintéticos.
- Ningún entorno público arranca con mock auth activo (el guard de INV-7 debe
  cubrir también previews: usar el contexto del host, no solo `NODE_ENV`).
- Secretos de preview y de prod separados: la key de staging no abre prod.

<a name="pii"></a>
## 7. PII y datos de usuario

- Minimizar: recolectar y exponer solo los campos que la funcionalidad necesita.
- PII (RUT/DNI, teléfono, dirección, email) nunca en: logs del cliente, URLs o
  query strings (quedan en historiales y logs de proxies), ni en DTOs de
  pantallas que no la muestran.
- `console.log` con objetos de usuario completos es una fuga a la consola del
  navegador y a los logs del host — loggear IDs, no objetos.

<a name="anti-patterns"></a>
## 8. Anti-patterns conocidos

| Anti-pattern | Corrección |
|---|---|
| Crear la tabla ahora, "las policies en otra migración" | RLS + policies en la misma migración, siempre |
| `select('*')` "porque es más simple" | Columnas explícitas; el DTO es el contrato |
| `org_id` tomado del body/query del request | Resolver scope desde el token, server-side |
| API key externa con `NEXT_PUBLIC_` "para probar" | Proxy vía Edge Function desde el día uno |
| Devolver `error.message` de Postgres al cliente | Error genérico + detalle a log del servidor |
| "Sáltate el login para avanzar más rápido" | Mock auth con guard de producción, nunca sin guard |
| Objeto de usuario completo a props/estado global del cliente | DTO con flags de UI calculados server-side |
| Secreto commiteado y luego borrado del archivo | Sigue en el historial: rotar la clave, no solo borrarla |
