const { formatISO, parseISO } = require('date-fns');

function getDateTime(isoString) {
  // If no argument is provided, use the current time
  const date = isoString ? parseISO(isoString) : new Date();
  return formatISO(date, { representation: 'complete' });
}

function calculateCurrent(l1, l2, l3) {
  // Validate inputs
  if ([l1, l2, l3].some(v => typeof v !== 'number' || isNaN(v))) {
    throw new TypeError('All inputs must be numbers');
  }

  // Convert to absolute values (current magnitudes)
  const [i1, i2, i3] = [Math.abs(l1), Math.abs(l2), Math.abs(l3)];

  // Calculate components of the neutral current formula
  const squares = i1 ** 2 + i2 ** 2 + i3 ** 2;
  const products = (i1 * i2) + (i2 * i3) + (i3 * i1);
  
  // Calculate and protect against negative values from floating point precision
  const result = Math.sqrt(Math.max(squares - products, 0));

  // Round to 2 decimal places for practical electrical measurements
  return Math.round(result * 100) / 100;
}

module.exports = { getDateTime, calculateCurrent }

