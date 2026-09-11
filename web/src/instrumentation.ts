export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const originalEmitWarning = process.emitWarning.bind(process);
    const silencedCodes = new Set<string>(["DEP0169"]);
    process.emitWarning = function patchedEmitWarning(
      warning: string | Error,
      options?: any,
      ..._rest: any[]
    ) {
      const code =
        (typeof warning === "object" && warning !== null && (warning as any).code) ||
        (typeof options === "object" && options !== null && (options as any).code) ||
        (typeof options === "string" ? options : undefined);
      if (typeof code === "string" && silencedCodes.has(code)) {
        return;
      }
      return originalEmitWarning(warning as any, options as any);
    };
  }
}
