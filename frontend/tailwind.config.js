/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#B8F2EC",
          bgLight: "#D9FAF5",
          primary: "#00C7C7",
          secondary: "#36BFCB",
          dark: "#153B43",
          muted: "#64868B",
        },
        glass: {
          surface: "rgba(255, 255, 255, 0.50)",
          surfaceHover: "rgba(255, 255, 255, 0.65)",
          surfaceActive: "rgba(255, 255, 255, 0.80)",
          border: "rgba(255, 255, 255, 0.65)",
          borderSubtle: "rgba(255, 255, 255, 0.35)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Mukta",
          "Noto Sans Devanagari",
          "sans-serif",
        ],
        devanagari: ["Mukta", "Noto Sans Devanagari", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.08)",
        glassHover: "0 12px 40px 0 rgba(31, 38, 135, 0.14)",
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [],
}

