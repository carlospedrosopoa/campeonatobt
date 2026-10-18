/** Pix "copia e cola" estatico (BR Code), com valor e identificador. */

function crc16Ccitt(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string) {
  const v = value ?? "";
  return `${id}${String(v.length).padStart(2, "0")}${v}`;
}

function asciiMaiusculo(value: string, max: number) {
  const n = (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
  return n.length > max ? n.slice(0, max) : n;
}

export function gerarPixCopiaCola(params: { chave: string; nome: string; cidade: string; valor: number; txid: string; descricao?: string | null }) {
  const txid = params.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const conta = [tlv("00", "br.gov.bcb.pix"), tlv("01", params.chave.trim()), params.descricao ? tlv("02", params.descricao.trim().slice(0, 40)) : ""].join("");
  const base =
    [
      tlv("00", "01"),
      tlv("26", conta),
      tlv("52", "0000"),
      tlv("53", "986"),
      tlv("54", params.valor.toFixed(2)),
      tlv("58", "BR"),
      tlv("59", asciiMaiusculo(params.nome, 25)),
      tlv("60", asciiMaiusculo(params.cidade, 15)),
      tlv("62", tlv("05", txid)),
    ].join("") + "6304";
  return base + crc16Ccitt(base);
}
