export function detectLaunch(logs) {
  return logs.some((log) =>
    log.includes("Instruction: Create") ||
    log.includes("CreateEvent")
  );
}

export function detectTrade(logs) {
  if (logs.some((log) => log.includes("Instruction: Buy"))) return "buy";
  if (logs.some((log) => log.includes("Instruction: Sell"))) return "sell";
  return null;
}
