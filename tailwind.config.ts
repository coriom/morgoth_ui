import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#111118",
        surface2: "#1a1a24",
        border: "#2a2a3a",
        primary: "#7c3aed",
        primaryGlow: "#7c3aed33",
        thought: "#6b7280",
        action: "#3b82f6",
        result: "#10b981",
        error: "#ef4444",
        system: "#f59e0b",
        bullish: "#10b981",
        bearish: "#ef4444",
        neutral: "#6b7280",
        textPrimary: "#f1f5f9",
        textSecondary: "#94a3b8",
        textMuted: "#475569",
      },
      borderRadius: {
        lg: "0.75rem",
      },
      boxShadow: {
        glow: "0 0 20px #7c3aed33",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
