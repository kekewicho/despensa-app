/** @type {import('tailwindcss').Config} */
export default {
  // *** CRUCIAL: Aquí le decimos a Tailwind dónde encontrar las clases (como 'bg-white', 'text-xl', etc.) ***
  content: [
    "./index.html",
    // Esta línea escanea todos los archivos dentro de la carpeta 'src'
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}