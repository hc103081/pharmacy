import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--theme-bg)",
        card: "var(--theme-card)",
        accent: "var(--theme-accent)",
        alert: "var(--theme-alert)",
        text: {
          main: "var(--theme-text-main)",
          muted: "var(--theme-text-muted)",
        },
      },
      animation: {
        breathe: "breathe 2s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
        scanline: "scanline 3s linear infinite",
        "pulse-glow": "pulse-glow 1.5s ease-in-out infinite",
        check: "check-pop 0.4s ease-out forwards",
        "particle-flow": "particle-flow 1.8s ease-in-out infinite",
        "line-glow": "line-glow 1.5s ease-in-out infinite",
        "progress-indeterminate": "progress-indeterminate 1.8s ease-in-out infinite",
        "archive-border-pulse": "archive-border-pulse 1.5s ease-in-out infinite",
        "restore-border-pulse": "restore-border-pulse 1.5s ease-in-out infinite",
        "archive-text-shimmer": "archive-text-shimmer 1.5s ease-in-out infinite",
        "archive-scan": "archive-scan-move 2s ease-in-out infinite",
        "restore-scan": "archive-scan-move 2s ease-in-out infinite",
        "text-shimmer": "archive-text-shimmer 1.5s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        scanline: {
          "0%": { top: "-10%" },
          "100%": { top: "110%" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 4px rgba(0, 242, 254, 0.4)" },
          "50%": { boxShadow: "0 0 12px rgba(0, 242, 254, 0.8), 0 0 24px rgba(0, 242, 254, 0.3)" },
        },
        "check-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.3)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "particle-flow": {
          "0%": { transform: "translateX(-100%) scaleX(0.6)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateX(200%) scaleX(0.6)", opacity: "0" },
        },
        "line-glow": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        "progress-indeterminate": {
          "0%": { left: "-40%", width: "40%" },
          "50%": { left: "60%", width: "40%" },
          "100%": { left: "100%", width: "0%" },
        },
        "archive-border-pulse": {
          "0%, 100%": { borderColor: "rgba(0, 242, 254, 0.3)", boxShadow: "0 0 4px rgba(0, 242, 254, 0.2)" },
          "50%": { borderColor: "rgba(0, 242, 254, 0.8)", boxShadow: "0 0 16px rgba(0, 242, 254, 0.5), 0 0 32px rgba(0, 242, 254, 0.15)" },
        },
        "restore-border-pulse": {
          "0%, 100%": { borderColor: "rgba(0, 242, 254, 0.3)", boxShadow: "0 0 4px rgba(0, 242, 254, 0.2)" },
          "50%": { borderColor: "rgba(0, 242, 254, 0.8)", boxShadow: "0 0 16px rgba(0, 242, 254, 0.5), 0 0 32px rgba(0, 242, 254, 0.15)" },
        },
        "archive-text-shimmer": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        archive: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(500%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;