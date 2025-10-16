document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Detiene el envío estándar del navegador

            errorMessage.textContent = ''; // Limpiar errores

            const formData = new FormData(form);
            const data = Object.fromEntries(formData); // {username: '...', password: '...'}

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
    })
});


                // Si el servidor responde con un código de éxito (como 204)
if (res.ok) {
    const data = await res.json();
    if (data.success) {
        window.location.href = "https://rifa-2025.onrender.com/admin.html";
    }
} else {
    alert("Usuario o contraseña incorrectos");
}
                } else {
                    errorMessage.textContent = 'Error interno del servidor. Intenta de nuevo.';
                }

            } catch (error) {
                console.error("Error de red/servidor:", error);
                errorMessage.textContent = 'Error de conexión. Verifica la URL de tu servicio.';
            }
        });
    }
});
