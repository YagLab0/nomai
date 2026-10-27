import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ConsentForm } from '@/components/auth/consent-form';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Autorizar aplicación · nomai' };

// OAuth 2.1 consent screen — Supabase Auth redirects here (Authorization
// Path = /oauth/consent) with ?authorization_id when a third-party client
// (e.g. the Grok connector pointing at the nomai MCP server) starts the
// flow. The user signs in if needed, reviews the client + scopes, and the
// decision posts to /api/oauth/decision which calls approve/deny and sends
// the browser back to the client's redirect_url.
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return (
      <div>
        <h1 className="font-brand text-3xl font-medium leading-tight text-ink">Solicitud inválida</h1>
        <p className="mt-2 text-ink-muted">Falta el parámetro authorization_id.</p>
      </div>
    );
  }

  if (!hasSupabaseEnv) {
    return (
      <div>
        <h1 className="font-brand text-3xl font-medium leading-tight text-ink">Autorización no disponible</h1>
        <p className="mt-2 text-ink-muted">Supabase no está configurado en este entorno.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → through /login, which returns here via `next`.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !details) {
    return (
      <div>
        <h1 className="font-brand text-3xl font-medium leading-tight text-ink">Solicitud inválida</h1>
        <p className="mt-2 text-ink-muted">{error?.message ?? 'La solicitud de autorización no es válida o expiró.'}</p>
      </div>
    );
  }

  // Consent was already granted for these scopes — Supabase returns only the
  // client's redirect_url; forward straight back.
  if (!('authorization_id' in details)) {
    redirect(details.redirect_url);
  }

  const scopes = details.scope?.split(' ').filter(Boolean) ?? [];

  return (
    <div>
      <h1 className="font-brand text-3xl font-medium leading-tight text-ink">
        Autorizar a {details.client.name}
      </h1>
      <p className="mt-2 text-ink-muted">
        Esta aplicación quiere acceder a tu cuenta de nomai en modo lectura: tus reservas, la búsqueda de
        alojamientos y tu wallet del agente.
      </p>

      <dl className="mt-6 flex flex-col gap-2 rounded-[1.25rem] bg-terra-soft px-4 py-3 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium text-terra-deep">Aplicación</dt>
          <dd className="text-ink">{details.client.name}</dd>
        </div>
        {details.client.uri && (
          <div className="flex gap-2">
            <dt className="font-medium text-terra-deep">Sitio</dt>
            <dd className="break-all text-ink">{details.client.uri}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="font-medium text-terra-deep">Vuelve a</dt>
          <dd className="break-all text-ink">{details.redirect_uri}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-terra-deep">Cuenta</dt>
          <dd className="text-ink">{details.user.email}</dd>
        </div>
      </dl>

      {scopes.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">Permisos solicitados</p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-muted">
            {scopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <ConsentForm authorizationId={authorizationId} />
    </div>
  );
}
