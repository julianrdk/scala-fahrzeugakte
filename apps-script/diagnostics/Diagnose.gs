// Einmalige Diagnose im Apps-Script-Editor über den bestehenden,
// eigentümergeschützten Backend-Einstieg. diagnoseOwnerRead liest nur;
// diagnoseOwnerWrite erzeugt bewusst einen Audit-Prüfeintrag. Beide protokollieren keine
// Fahrzeugdaten, Belege, E-Mail-Adressen, Ressourcen-IDs oder Zugriffstokens.
// Als separate Datei Diagnose.gs hinzufügen; keine Bereitstellung nötig.
function diagnoseOwnerRead() {
  var reader = String(ScalaBackend.readState);
  console.log('Leser: ' + (
    reader.indexOf('Sheets.Spreadsheets.get') >= 0
      ? 'neue Korrektur'
      : 'alter Code'
  ));
  try {
    ScalaBackend.dispatch('read', {});
    console.log('Lesetest: OK');
  } catch (error) {
    console.log('Lesetest: FEHLER: ' + error.message);
  }
}

// Bewusste Schreibprobe: fügt wie der UI-Lese-/Schreibtest ausschließlich
// einen technischen Audit-Prüfeintrag hinzu; keine Ausgaben oder Belege.
function diagnoseOwnerWrite() {
  try {
    var result = ScalaBackend.dispatch('smoke', {});
    console.log('Schreibtest: ' + (result.ok === true ? 'OK' : 'NICHT BESTÄTIGT'));
  } catch (error) {
    console.log('Schreibtest: FEHLER: ' + error.message);
  }
}
