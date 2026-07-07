import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochrome, light-first palette.
        ink: "#111113", // near-black text & fills
        paper: "#ffffff", // page ground
        surface: "#f5f5f7", // quiet gray panels
        panel: "#ffffff", // cards
        line: "#e4e4e9", // hairline borders
        muted: "#6e6e73", // secondary text
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 17, 19, 0.04), 0 8px 24px rgba(17, 17, 19, 0.05)",
        lift: "0 2px 4px rgba(17, 17, 19, 0.06), 0 16px 40px rgba(17, 17, 19, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
