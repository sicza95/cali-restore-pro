// Smallest touch target in CSS pixels (AGENTS.md). Firefox reports a 44px box as 43.9999px
// (floating-point layout coordinates), so the assertions allow a hundredth of a pixel (#51).
export const touchTarget = 44 - 0.01;
