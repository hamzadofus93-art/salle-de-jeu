const loginElements = {
  form: document.querySelector("#login-form"),
  username: document.querySelector("#login-username"),
  password: document.querySelector("#login-password"),
  error: document.querySelector("#login-error"),
  submit: document.querySelector("#login-submit"),
};

function showLoginError(message) {
  loginElements.error.textContent = message;
  loginElements.error.hidden = false;
}

function hideLoginError() {
  loginElements.error.hidden = true;
}

function handleLoginSubmit(event) {
  event.preventDefault();

  const username = loginElements.username.value;
  const password = loginElements.password.value;
  const result = window.Auth?.login(username, password);

  if (!result?.ok) {
    showLoginError(result?.error || "Identifiant ou mot de passe incorrect.");
    loginElements.password.select();
    return;
  }

  hideLoginError();
  loginElements.submit.disabled = true;
  window.location.replace("./index.html");
}

loginElements.form?.addEventListener("submit", handleLoginSubmit);
loginElements.username?.addEventListener("input", hideLoginError);
loginElements.password?.addEventListener("input", hideLoginError);
loginElements.username?.focus();
