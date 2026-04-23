// Generates a PIX "Copia e Cola" payload (BR Code / EMV) per Bacen spec.
// Reference: Manual do BR Code do Banco Central.

const sanitize = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,\-+/]/g, "")
    .toUpperCase()
    .slice(0, max);

const tlv = (id: string, value: string) => {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
};

const crc16 = (payload: string) => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

export type PixInput = {
  pixKey: string;
  receiverName: string;
  city: string;
  amount: number;
  txid?: string; // up to 25 alphanumeric
  description?: string;
};

export function buildPixPayload({ pixKey, receiverName, city, amount, txid, description }: PixInput): string {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", pixKey.trim()) +
    (description ? tlv("02", sanitize(description, 50)) : "");

  const txidValue = sanitize((txid || "***").replace(/[^A-Za-z0-9]/g, ""), 25) || "***";
  const additional = tlv("05", txidValue);

  const payloadNoCrc =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", sanitize(receiverName, 25)) +
    tlv("60", sanitize(city, 15)) +
    tlv("62", additional) +
    "6304";

  return payloadNoCrc + crc16(payloadNoCrc);
}
