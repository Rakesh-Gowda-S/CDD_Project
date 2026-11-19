function safeCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(headers, rows) {
  return [
    headers.map(safeCell).join(','),
    ...rows.map((row) => row.map(safeCell).join(',')),
  ].join('\r\n')
}
