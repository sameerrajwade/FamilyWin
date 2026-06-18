function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('DCX AI Innovation Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function tryFormatDate(val, format) {
  if (!val) return '';
  try {
    var d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), format);
  } catch (e) {
    return String(val);
  }
}

function getCatalogData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AI Catalog');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    rows.push({
      name: String(row[0]),
      type: String(row[1]),
      owner: String(row[2]),
      link: String(row[3] || ''),
      description: String(row[4] || ''),
      dateAdded: tryFormatDate(row[5], 'MMM d, yyyy')
    });
  }
  return rows;
}

function getPresentationsData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Presentations');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    rows.push({
      presenter: String(row[0]),
      topic: String(row[1]),
      date: tryFormatDate(row[2], 'MMM d, yyyy'),
      month: tryFormatDate(row[2], 'MMM'),
      day: tryFormatDate(row[2], 'd'),
      status: String(row[3] || ''),
      description: String(row[4] || ''),
      slidesLink: String(row[5] || '')
    });
  }
  return rows;
}

function getNewsData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('News & Notes');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    rows.push({
      title: String(row[0]),
      summary: String(row[1] || ''),
      addedBy: String(row[2] || ''),
      date: tryFormatDate(row[3], 'MMM d, yyyy'),
      category: String(row[4] || '')
    });
  }
  return rows;
}

function getAllData() {
  return {
    catalog: getCatalogData(),
    presentations: getPresentationsData(),
    news: getNewsData()
  };
}
