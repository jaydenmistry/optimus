import type { Config } from "tailwindcss";

// Every color is a CSS variable (see globals.css) so light and dark mode
// share one set of class names. Values are RGB channels so Tailwind's
// opacity modifiers (bg-accent/10) keep working.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          "Inter",
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        elevated: token("elevated"),
        fill: token("fill"),
        separator: token("separator"),
        label: {
          DEFAULT: token("label"),
          secondary: token("label-secondary"),
          tertiary: token("label-tertiary"),
        },
        accent: {
          DEFAULT: token("accent"),
          text: token("accent-text"),
          contrast: token("accent-contrast"),
        },
        sys: {
          red: token("red"),
          orange: token("orange"),
          yellow: token("yellow"),
          green: token("green"),
          blue: token("blue"),
          teal: token("teal"),
          gray: token("gray"),
        },
      },
      fontSize: {
        // Apple-style type ramp: [size, line-height, letter-spacing]
        "large-title": ["2.125rem", { lineHeight: "2.5rem", letterSpacing: "-0.022em", fontWeight: "700" }],
        "title-1": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        "title-2": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.017em", fontWeight: "700" }],
        "title-3": ["1.25rem", { lineHeight: "1.5rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        headline: ["1.0625rem", { lineHeight: "1.375rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["1.0625rem", { lineHeight: "1.375rem", letterSpacing: "-0.01em" }],
        callout: ["1rem", { lineHeight: "1.3125rem", letterSpacing: "-0.008em" }],
        subhead: ["0.9375rem", { lineHeight: "1.25rem", letterSpacing: "-0.006em" }],
        footnote: ["0.8125rem", { lineHeight: "1.125rem", letterSpacing: "0" }],
        caption: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0" }],
      },
      opacity: {
        8: "0.08",
        12: "0.12",
        16: "0.16",
        18: "0.18",
        24: "0.24",
        35: "0.35",
        72: "0.72",
      },
      borderRadius: {
        card: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02)",
        float: "0 10px 40px -10px rgb(0 0 0 / 0.25), 0 2px 8px rgb(0 0 0 / 0.08)",
        thumb: "0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-in": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(-12px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "glow-critical": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--red) / 0.45)" },
          "70%": { boxShadow: "0 0 0 12px rgb(var(--red) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--red) / 0)" },
        },
        "glow-warning": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--orange) / 0.35)" },
          "70%": { boxShadow: "0 0 0 10px rgb(var(--orange) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--orange) / 0)" },
        },
        flow: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "14px 0" },
        },
        drift: {
          "0%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(4%, 6%, 0) scale(1.08)" },
          "100%": { transform: "translate3d(-3%, 2%, 0) scale(0.96)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(-4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "sheet-in": "sheet-in 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        "toast-in": "toast-in 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        "pop-in": "pop-in 160ms ease-out",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "glow-critical": "glow-critical 1.6s ease-out infinite",
        "glow-warning": "glow-warning 2.4s ease-out infinite",
        flow: "flow 0.9s linear infinite",
        drift: "drift 22s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};

export default config;
