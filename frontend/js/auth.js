/**
 * Frontend Authentication Management Script
 * Behavior: Every fresh visit to the app starts at login.html and requires user credentials.
 */

document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname;

  // 1. If on login page, clear any previous session so user MUST sign in again on every visit
  if (currentPage.endsWith('login.html') || document.getElementById('form-login')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  }

  // 2. Tab switching logic for Login / Register
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');

  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => {
      loginTab.style.background = 'var(--grad-primary)';
      loginTab.style.color = '#fff';
      registerTab.style.background = 'transparent';
      registerTab.style.color = 'var(--text-muted)';
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    });

    registerTab.addEventListener('click', () => {
      registerTab.style.background = 'var(--grad-primary)';
      registerTab.style.color = '#fff';
      loginTab.style.background = 'transparent';
      loginTab.style.color = 'var(--text-muted)';
      registerForm.style.display = 'block';
      loginForm.style.display = 'none';
    });
  }

  // 3. Login Form Submission (Authenticates & saves token for active session)
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Authenticating...';

        const res = await API.login(email, password);
        showToast('Login successful! Redirecting to dashboard...', 'success');

        // Save session token
        sessionStorage.setItem('token', res.data.token);
        sessionStorage.setItem('user', JSON.stringify(res.data));
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data));

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 500);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Portal';
      }
    });
  }

  // 4. Register Form Submission (Manual sign in required after creation)
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('register-name').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        await API.register(name, email, password);
        
        registerForm.reset();
        showToast('Account created successfully! Please enter your credentials to sign in.', 'success');

        if (loginTab) {
          loginTab.click();
          const loginEmailInput = document.getElementById('login-email');
          const loginPasswordInput = document.getElementById('login-password');
          if (loginEmailInput) {
            loginEmailInput.value = email;
            if (loginPasswordInput) loginPasswordInput.focus();
          }
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  }
});

// Logout Helper Function
function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  showToast('Logged out of session.', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 300);
}
