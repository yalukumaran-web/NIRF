/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F3F8FD",
          100: "#E9F2FB",
          200: "#D8E5F7",
          300: "#B4CAEE",
          400: "#8CACE4",
          500: "#678DD8",
          600: "#4970C8",
          700: "#3A5AAB",
          800: "#334B8A",
          900: "#2E406F",
          950: "#1E2A4A",
        },
        mint: {
          50: "#F0FAF4",
          100: "#E2F5EA",
          200: "#D8EEDF",
          300: "#AFD9C2",
          400: "#82C09F",
          500: "#5AA47E",
          600: "#448763",
          700: "#376D50",
          800: "#2E5742",
          900: "#274838",
          950: "#122820",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(30,42,74,.04), 0 10px 30px -14px rgba(30,42,74,.18)",
        lift: "0 2px 4px rgba(30,42,74,.06), 0 18px 40px -18px rgba(30,42,74,.28)",
        glow: "0 8px 30px -10px rgba(73,112,200,.55)",
        "glow-mint": "0 8px 30px -10px rgba(68,135,99,.55)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          "0%": { opacity: "0", transform: "translateY(-14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-right": {
          "0%": { opacity: "0", transform: "translateX(-14px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "gradient-x": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".55", transform: "scale(.85)" },
        },
        "bounce-x": {
          "0%,100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(3px)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in .5s ease-out both",
        "fade-up": "fade-up .55s cubic-bezier(.16,1,.3,1) both",
        "fade-down": "fade-down .5s cubic-bezier(.16,1,.3,1) both",
        "fade-right": "fade-right .55s cubic-bezier(.16,1,.3,1) both",
        "scale-in": "scale-in .45s cubic-bezier(.16,1,.3,1) both",
        "slide-down": "slide-down .35s cubic-bezier(.16,1,.3,1) both",
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        "bounce-x": "bounce-x 1.6s ease-in-out infinite",
        "spin-slow": "spin-slow 16s linear infinite",
      },
    },
  },
  plugins: [],
};