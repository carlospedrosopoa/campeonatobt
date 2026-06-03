declare module "qrcode" {
  export type QRCodeErrorCorrectionLevel =
    | "low"
    | "medium"
    | "quartile"
    | "high"
    | "L"
    | "M"
    | "Q"
    | "H";

  export type QRCodeStringType = "terminal" | "utf8" | "svg";

  export interface QRCodeToStringOptions {
    type?: QRCodeStringType | undefined;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel | undefined;
    margin?: number | undefined;
    scale?: number | undefined;
    width?: number | undefined;
  }

  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;

  const QRCode: {
    toString: typeof toString;
  };

  export default QRCode;
}
