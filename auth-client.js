(function () {
  const cfg = window.APP_CONFIG || {};

  const ACCESS_MESSAGES = {
    no_session: 'Du må logge inn.',
    profile_missing: 'Brukeren mangler profil. Kontakt administrator.',
    user_inactive: 'Brukeren er deaktivert. Kontakt administrator.',
    company_missing: 'Brukeren er ikke koblet til et firma.',
    company_inactive: 'Firmaet er deaktivert. Tilgang er sperret.',
    profile_load_error: 'Kunne ikke hente brukerprofil.',
    company_load_error: 'Kunne ikke hente firmadata.',
  };

  function normalizeBasePath(path) {
    if (!path) return '';
    let p = String(path).trim();
    if (!p) return '';
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  function detectGithubPagesBase() {
    if (!window.location.hostname.endsWith('github.io')) return '';
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length > 0 ? `/${parts[0]}` : '';
  }

  function basePath() {
    return normalizeBasePath(cfg.APP_BASE_PATH) || detectGithubPagesBase();
  }

  function withBase(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath()}${cleanPath}`.replace(/\/+/g, '/');
  }

  function buildLoginUrl(nextPath, reason) {
    const loginPath = withBase('/login/');
    const params = new URLSearchParams();
    if (nextPath) params.set('next', nextPath);
    if (reason) params.set('reason', reason);
    const q = params.toString();
    return q ? `${loginPath}?${q}` : loginPath;
  }

  function buildDashboardUrl() {
    return withBase('/dashboard/');
  }

  function getSupabaseClient() {
    if (!window.supabase?.createClient) return null;
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    if (!window.__APP_SUPABASE_CLIENT__) {
      window.__APP_SUPABASE_CLIENT__ = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    return window.__APP_SUPABASE_CLIENT__;
  }

  async function getSession() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session || null;
  }

  async function signInWithPassword(email, password) {
    const client = getSupabaseClient();
    if (!client) {
      return { data: null, error: new Error('Supabase-konfigurasjon mangler') };
    }
    return client.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
  }

  function getNextPathFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (!next || typeof next !== 'string') return null;
    if (!next.startsWith('/')) return null;
    return next;
  }

  function getReasonFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('reason');
  }

  function getAccessMessage(reason) {
    if (!reason) return '';
    return ACCESS_MESSAGES[reason] || 'Tilgang nektet.';
  }

  function redirectAfterLogin() {
    const next = getNextPathFromQuery();
    window.location.replace(next || buildDashboardUrl());
  }

  async function getCurrentProfile(session) {
    const client = getSupabaseClient();
    const effectiveSession = session || (await getSession());
    if (!client || !effectiveSession?.user?.id) return null;
    const table = cfg.PROFILES_TABLE || 'profiles';
    const { data, error } = await client.from(table).select('*').eq('id', effectiveSession.user.id).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function getCompanyById(companyId) {
    const client = getSupabaseClient();
    if (!client || !companyId) return null;
    const table = cfg.COMPANIES_TABLE || 'companies';
    const { data, error } = await client.from(table).select('*').eq('id', companyId).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function getAccessContext() {
    const session = await getSession();
    if (!session) {
      return { access: false, reason: 'no_session', session: null, profile: null, company: null, role: null };
    }

    let profile;
    try {
      profile = await getCurrentProfile(session);
    } catch (error) {
      return { access: false, reason: 'profile_load_error', session, profile: null, company: null, role: null, error };
    }

    if (!profile) {
      return { access: false, reason: 'profile_missing', session, profile: null, company: null, role: null };
    }

    if (profile.is_active === false) {
      return { access: false, reason: 'user_inactive', session, profile, company: null, role: profile.role || 'user' };
    }

    const role = profile.role || 'user';

    if (role !== 'superadmin') {
      if (!profile.company_id) {
        return { access: false, reason: 'company_missing', session, profile, company: null, role };
      }

      let company;
      try {
        company = await getCompanyById(profile.company_id);
      } catch (error) {
        return { access: false, reason: 'company_load_error', session, profile, company: null, role, error };
      }

      if (!company) {
        return { access: false, reason: 'company_missing', session, profile, company: null, role };
      }

      if (company.is_active === false) {
        return { access: false, reason: 'company_inactive', session, profile, company, role };
      }

      return { access: true, reason: null, session, profile, company, role };
    }

    return { access: true, reason: null, session, profile, company: null, role };
  }

  async function requireAuth(options = {}) {
    const redirect = options.redirect !== false;
    const session = await getSession();
    if (!session && redirect) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(buildLoginUrl(next, 'no_session'));
      return null;
    }
    return session;
  }

  async function requireAppAccess(options = {}) {
    const redirect = options.redirect !== false;
    const nextPath = options.nextPath || `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const ctx = await getAccessContext();

    if (ctx.access) return ctx;

    if (redirect && ctx.session && ctx.reason && ctx.reason !== 'no_session') {
      try {
        await signOut();
      } catch (error) {
        // Ignore signout errors before redirect.
      }
    }

    if (redirect) {
      window.location.replace(buildLoginUrl(nextPath, ctx.reason || 'no_session'));
    }

    return ctx;
  }

  window.AppSupabase = {
    getClient: getSupabaseClient,
    config: cfg,
  };

  window.AppAuth = {
    withBase,
    buildLoginUrl,
    buildDashboardUrl,
    getSession,
    requireAuth,
    requireAppAccess,
    signInWithPassword,
    signOut,
    redirectAfterLogin,
    getCurrentProfile,
    getAccessContext,
    getReasonFromQuery,
    getAccessMessage,
  };
})();
