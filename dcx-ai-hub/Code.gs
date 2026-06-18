function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('DCX AI Innovation Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getCatalogData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AI Catalog');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    rows.push({
      name: row[0],
      type: row[1],
      owner: row[2],
      link: row[3],
      description: row[4],
      dateAdded: row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'MMM d, yyyy') : ''
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
    var dateVal = row[2] ? new Date(row[2]) : null;
    rows.push({
      presenter: row[0],
      topic: row[1],
      date: dateVal ? Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
      month: dateVal ? Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'MMM') : '',
      day: dateVal ? Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'd') : '',
      status: row[3],
      slidesLink: row[4] || ''
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
      title: row[0],
      summary: row[1],
      addedBy: row[2],
      date: row[3] ? Utilities.formatDate(new Date(row[3]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
      category: row[4]
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
