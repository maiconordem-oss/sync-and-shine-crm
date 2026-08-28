function crc16Ccitt(value: string) {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function field(id: string, value: string) {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function normalizeText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function buildPixPayload({
  key,
  amount,
  name,
  city = "SAO PAULO",
}: {
  key: string;
  amount: number;
  name: string;
  city?: string;
}) {
  const merchantAccount = field("00", "BR.GOV.BCB.PIX") + field("01", key.trim());
  const additionalData = field("05", "***");
  const payloadWithoutCrc = [
    "000201",
    field("26", merchantAccount),
    "52040000",
    "5303986",
    field("54", amount.toFixed(2)),
    "5802BR",
    field("59", normalizeText(name, 25) || "PRESTADOR PJ"),
    field("60", normalizeText(city, 15) || "SAO PAULO"),
    field("62", additionalData),
    "6304",
  ].join("");
  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}
