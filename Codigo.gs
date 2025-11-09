function doPost(e) {
  var ss = SpreadsheetApp.openById("1RkqnujTGc9aWvScLEW9uyZuSLLgCOn4OTubvUHNyb5M");
  var sheetName = "encuestas_pymes";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  var headers = ["nombre","telefono","sector","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11","fecha_envio"];
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (existing[0] === "" || existing.length < headers.length) {
    sheet.clear();
    sheet.appendRow(headers);
  }
  var data = JSON.parse(e.postData.contents);
  data.fecha_envio = new Date().toLocaleString("es-ES");
  var fila = headers.map(h => data[h] || "");
  sheet.appendRow(fila);
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}
