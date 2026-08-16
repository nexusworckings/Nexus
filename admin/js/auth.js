// Configuración pública de Supabase para el inicio de sesión del panel.
// La autenticación usa una cuenta administradora fija; la interfaz solo solicita
// la contraseña y nunca expone una clave service_role.
const SUPABASE_URL = 'https://iqbbdrgajlhkfbvsvzto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxYmJkcmdhamxoa2ZidnN2enRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NjgxOTEsImV4cCI6MjEwMDM0NDE5MX0.E7WbQSbMHsp_jFq_ZR5DKhOq9RjNzU7bGE-l66qWsYI';

const SESSION_KEY = 'tecno_admin_session';

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  const session = getSession();
  if (!session || !session.access_token) return false;

  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (Date.now() > expiresAt) {
    clearSession();
    return false;
  }

  return true;
}

async function supabaseRequest(path, body) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function login(email, password) {
  const result = await supabaseRequest('/auth/v1/token?grant_type=password', {
    email,
    password,
  });

  if (result.error) {
    throw new Error(result.error_description || result.error || 'Error de autenticación');
  }

  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + result.expires_in,
    user: result.user,
  };
}

export async function doRefreshToken(refreshToken) {
  const result = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
    refresh_token: refreshToken,
  });

  if (result.error) {
    throw new Error('Sesión expirada');
  }

  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + result.expires_in,
    user: result.user,
  };
}

// El correo se mantiene interno para que el formulario solo pida contraseña.
const ADMIN_EMAIL = 'admin@tecnosanjuan.com';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  if (!form) return;

  if (isAuthenticated()) {
    window.location.href = 'index.html';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    try {
      const session = await login(ADMIN_EMAIL, passwordInput.value);
      setSession(session);
      window.location.href = 'index.html';
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('hidden');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar Sesión';
    }
  });
});
