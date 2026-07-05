/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    // Prebuilt daisyUI themes only — no custom palette, just light/dark switching.
    themes: ["light", "dark"],
    darkTheme: "dark",
  },
};
