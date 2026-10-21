export function fmt(value: number, decimals = 2): string {
  return `${value.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USDT`
}

export function pct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function price(value: number, asset: string): string {
  return value.toFixed(asset === 'XRP' ? 4 : 2)
}
