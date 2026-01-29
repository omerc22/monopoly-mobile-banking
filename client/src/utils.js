/**
 * Format a number as Korean Won currency with thousand separators
 * @param {number|string} amount - The amount to format
 * @returns {string} Formatted string like "₩1,500,000"
 */
export function formatMoney(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '₩0';
  return `₩${num.toLocaleString()}`;
}

/**
 * Parse a formatted money string back to a number
 * @param {string} formatted - Formatted string like "₩1,500,000"
 * @returns {number} Raw number like 1500000
 */
export function parseMoney(formatted) {
  if (typeof formatted !== 'string') return 0;
  const cleaned = formatted.replace(/[₩,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}