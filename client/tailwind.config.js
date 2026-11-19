/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0b1f3a", 900: "#102a4c", 800: "#173b63" }
      }
    }
  },
  plugins: []
};
