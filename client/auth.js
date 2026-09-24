import { registerUser, loginUser } from './utils/api.js';
import { saveToken, saveUser, getToken, getUser } from './utils/auth.js';

function setAuthTab(mode) {
  const isLogin = mode === 'login';
  const tabSignupBtn = document.querySelector('#tab-signup-btn');
  const tabLoginBtn = document.querySelector('#tab-login-btn');
  const panelSignup = document.querySelector('#panel-signup');
  const panelLogin = document.querySelector('#panel-login');

  if (tabSignupBtn && tabLoginBtn && panelSignup && panelLogin) {
    tabSignupBtn.classList.toggle('active', !isLogin);
    tabSignupBtn.setAttribute('aria-selected', !isLogin ? 'true' : 'false');

    tabLoginBtn.classList.toggle('active', isLogin);
    tabLoginBtn.setAttribute('aria-selected', isLogin ? 'true' : 'false');

    panelSignup.classList.toggle('active', !isLogin);
    panelLogin.classList.toggle('active', isLogin);
  }
}

function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const status = params.get('status');
  const banner = document.querySelector('#auth-status-banner');

  if (mode === 'login') {
    setAuthTab('login');
  } else {
    setAuthTab('signup');
  }

  if (status === 'signed_out' && banner) {
    banner.textContent = 'You have been signed out successfully.';
    banner.style.display = 'block';
  } else if (status === 'auth_required' && banner) {
    banner.textContent = 'Please log in or create an account to access this feature.';
    banner.style.display = 'block';
  }
}

function setupFormHandlers() {
  const signupForm = document.querySelector('#signup-form');
  const loginForm = document.querySelector('#login-form');
  const guestBtn = document.querySelector('#guest-continue-btn');

  // Handle Create Account
  if (signupForm) {
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = signupForm.querySelector('button[type="submit"]');
      const msg = signupForm.querySelector('#signup-message');
      const formData = new FormData(signupForm);
      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      msg.textContent = '';
      msg.className = 'form-message';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const result = await registerUser(name, email, password);
        saveToken(result.token);
        saveUser(result.user);
        localStorage.setItem('study_has_visited', 'true');

        // Transition to home
        window.location.replace('./index.html');
      } catch (err) {
        msg.textContent = err.message || 'Could not create account. Please check your details.';
        msg.className = 'form-message error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create account';
      }
    });
  }

  // Handle Log In
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const msg = loginForm.querySelector('#login-message');
      const formData = new FormData(loginForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      msg.textContent = '';
      msg.className = 'form-message';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        const result = await loginUser(email, password);
        saveToken(result.token);
        saveUser(result.user);
        localStorage.setItem('study_has_visited', 'true');

        // Transition to home
        window.location.replace('./index.html');
      } catch (err) {
        msg.textContent = err.message || 'Invalid email or password.';
        msg.className = 'form-message error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in';
      }
    });
  }

  // Handle Explore as Guest
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      localStorage.setItem('study_has_visited', 'true');
      window.location.replace('./index.html');
    });
  }

  // Tab switching clicks
  const tabSignupBtn = document.querySelector('#tab-signup-btn');
  const tabLoginBtn = document.querySelector('#tab-login-btn');

  if (tabSignupBtn) {
    tabSignupBtn.addEventListener('click', () => setAuthTab('signup'));
  }
  if (tabLoginBtn) {
    tabLoginBtn.addEventListener('click', () => setAuthTab('login'));
  }
}

function initAuthPage() {
  // If already logged in, check if user should just return to home
  const token = getToken();
  const user = getUser();
  const params = new URLSearchParams(window.location.search);

  // If already logged in and not coming from an explicit logout/switch
  if (token && user && !params.has('status')) {
    const banner = document.querySelector('#auth-status-banner');
    if (banner) {
      banner.innerHTML = `You are currently logged in as <strong>${user.name}</strong>. <a href="./index.html" style="color: inherit; text-decoration: underline; font-weight: 600; margin-left: 6px;">Go to Home &rarr;</a>`;
      banner.style.display = 'block';
    }
  }

  handleUrlParams();
  setupFormHandlers();
}

initAuthPage();
