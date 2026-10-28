export const nativeLoginKey = 'omni.native-login';

export function hasLoginChallenge(doc) {
  return /DDOS[.\s-]?GUARD|just a moment|attention required|проверка браузера/i.test(doc.title)
    || !!doc.querySelector('[data-login-challenge], .g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], input[name*="captcha" i], img[src*="captcha" i]');
}

function knownLoginForm(doc) {
  const passwords = [...doc.querySelectorAll('form input[type="password"]')];
  if (passwords.length !== 1) return false;
  const password = passwords[0];
  const signature = input => ['name', 'id', 'ng-model', 'autocomplete'].map(key => input.getAttribute(key) || '').join(' ');
  if (/new-password|new[_-]?password|confirm|repeat|reset/i.test(signature(password))) return false;
  const form = password.form;
  if (!form) return false;
  const fields = [...form.querySelectorAll('input')].filter(input => !['hidden', 'checkbox', 'submit', 'button', 'reset'].includes(input.type));
  const username = fields.find(input => ['text', 'email'].includes(input.type) && /username|login|email/i.test(signature(input)));
  if (!username || fields.length !== 2 || form.querySelector('select[required], textarea[required]')) return false;
  const action = form.getAttribute('action');
  if (action) {
    try {
      const target = new URL(action, doc.baseURI);
      if (target.origin !== 'https://omni.top-academy.ru' || !['/login', '/login/index', '/auth/login'].includes(target.pathname)) return false;
    } catch { return false; }
  }
  return true;
}

export function loginPageState(doc, pathname) {
  if (hasLoginChallenge(doc)) return 'official';
  if (pathname.startsWith('/auth/logout')) return 'loading';
  if (/^\/login(?:\/index)?\/?$/.test(pathname)) {
    if (doc.readyState === 'loading') return 'loading';
    if (doc.querySelector('input[autocomplete="one-time-code"], input[name="otp" i], input[name="totp" i], [data-two-factor]')) return 'official';
    // Angular can insert both the form and CSRF metadata after document_idle.
    if (!doc.querySelector('input[type="password"]')) return 'loading';
    if (!knownLoginForm(doc)) return 'official';
    return doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ? 'login' : 'loading';
  }
  if (pathname.startsWith('/login') || doc.querySelector('input[type="password"]')) return 'official';
  return 'workspace';
}
