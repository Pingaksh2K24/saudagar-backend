export const getPannaType = (panna) => {
  // convert to string (safety)
  panna = String(panna);

  // extract unique digits
  const uniqueDigits = new Set(panna);

  // check based on unique count
  if (uniqueDigits.size === 1) {
    return "triple_panna";
  } else if (uniqueDigits.size === 2) {
    return "double_panna";
  } else if (uniqueDigits.size === 3) {
    return "single_panna";
  } else {
    return "Invalid Panna";
  }
}

// Test examples:
// console.log(getPannaType("123")); // Single Panna
// console.log(getPannaType("112")); // Double Panna
// console.log(getPannaType("111")); // Triple Panna
