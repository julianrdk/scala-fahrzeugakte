# Freigabe von Änderungen

Der Nutzer möchte Änderungen selbst in GitHub Desktop prüfen und vor dem Hochladen bestätigen.

- Änderungen standardmäßig lokal vorbereiten und sinnvoll prüfen. Dem Nutzer anschließend die konkreten Änderungen zur Durchsicht zeigen.
- Ohne ausdrückliche Freigabe für den jeweiligen Schritt keine Commits erstellen, keine Pushes ausführen und keine Änderungen direkt über die GitHub-API veröffentlichen. Standardmäßig übernimmt der Nutzer Commit und Push selbst in GitHub Desktop.
- Auch Apps-Script-Bereitstellungen, Cloudflare-Veröffentlichungen, das manuelle Starten eines Veröffentlichungsworkflows und Änderungen an produktiven Kontoeinstellungen benötigen die ausdrückliche Freigabe des Nutzers.
- Die bestehenden automatischen Veröffentlichungen nach einem vom Nutzer freigegebenen Push auf main dürfen weiterlaufen. Den Nutzer darauf hinweisen, dass dieser Push die Veröffentlichung auslöst.
- Eine bereits ausdrücklich erteilte Freigabe innerhalb ihres konkreten Umfangs nicht erneut abfragen.
