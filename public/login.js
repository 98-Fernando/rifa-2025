document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita el envío normal del formulario
    e.stopPropagation(); // 🔹 Evita que se dispare dos veces

    errorMessage.textContent = '';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
      errorMessage.textContent = 'Por favor, completa todos los campos.';
      return;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 🔥 MUY IMPORTANTE
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          window.location.href = '/admin.html';
          return;
        }
      }

      if (res.status === 401) {
        errorMessage.textContent = 'Usuario o contraseña incorrectos.';
      } else {
        errorMessage.textContent = 'Error en el servidor. Intenta nuevamente.';
      }
    } catch (err) {
      console.error('❌ Error de red:', err);
      errorMessage.textContent = 'No se pudo conectar con el servidor.';
    }
  });
});
