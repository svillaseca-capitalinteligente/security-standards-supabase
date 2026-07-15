// GOLDEN PATH — Edge Function segura (Supabase / Deno).
//
// Copiar esto para CADA endpoint nuevo. La política vive en el template, no en la
// cabeza de quien programa: token + scope obligatorio + query parametrizada.
//
// Cumple por construcción:
//   INV-3  la lógica corre acá (servidor), no en el navegador.
//   INV-4  acceso a BD parametrizado: filtro de scope OBLIGATORIO, columnas
//          explícitas, sin `select('*')`, siempre con límite.
//   INV-2  devuelve un DTO acotado, nunca el modelo interno ni PII de más.
//   INV-6  errores genéricos al cliente; el service_role vive SOLO acá.
//   INV-7  valida el token en el borde; sin token => 401.
//
// Adaptar: TABLE, COLUMNS, el filtro de scope y resolveScope() a tu esquema.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// service_role: secreto server-side. NUNCA sale de la Edge Function ni al bundle.
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Columnas explícitas — jamás '*'. El DTO define qué se expone.
const TABLE = 'items';
const COLUMNS = 'id, nombre, estado, owner_user_id';

Deno.serve(async (req: Request): Promise<Response> => {
  // 1) Token obligatorio (INV-7) — primer paso, antes de cualquier lógica.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  // Resolver identidad con un cliente ligado al token del usuario.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authErr } = await asUser.auth.getUser();
  if (authErr || !auth?.user) return json({ error: 'unauthorized' }, 401);

  // 2) Resolver scope server-side (org, rol, own/team/all). Nunca del cliente:
  //    un org_id que viene en el body/query del request es input del atacante.
  const scope = await resolveScope(auth.user.id);
  if (!scope) return json({ error: 'forbidden' }, 403);

  // 3) Query PARAMETRIZADA con filtro de tenant OBLIGATORIO (INV-4).
  //    El cliente service_role bypassa RLS: el filtro de scope acá es la barrera
  //    real. Sin `.eq('org_id', ...)` esta query NO se escribe.
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const query = db
    .from(TABLE)
    .select(COLUMNS)                 // columnas explícitas
    .eq('org_id', scope.orgId)       // SIEMPRE por tenant
    .order('created_at', { ascending: false })
    .limit(50);                      // siempre acotar

  if (scope.level === 'own') query.eq('owner_user_id', scope.userId);

  const { data, error } = await query;
  if (error) {
    console.error('query failed:', error); // detalle al log del servidor
    return json({ error: 'internal' }, 500); // genérico al cliente (INV-6)
  }

  return json({ items: data }, 200); // DTO acotado (INV-2)
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Resuelve el scope del usuario contra el organigrama/roles del proyecto.
 * SIEMPRE server-side. Devuelve null si el usuario no está autorizado.
 */
async function resolveScope(
  _userId: string,
): Promise<{ userId: string; orgId: string; level: 'own' | 'team' | 'all' } | null> {
  // Implementar contra el esquema real: lookup de org_id + rol + nivel de scope.
  return null;
}
