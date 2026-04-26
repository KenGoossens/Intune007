export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf9ef",
          100: "#faf0d4",
          200: "#f5e0a8",
          300: "#eecb72",
          400: "#e6b33e",
          500: "#d4a843",
          600: "#b8872a",
          700: "#996824",
          800: "#7d5322",
          900: "#67451f",
          950: "#3a230e",
        },
        gold: {
          400: "#e6b33e",
          500: "#d4a843",
          600: "#b8872a",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
