# 
```text
  _   _ _               _             _                          
 | | | | |             | |           | |                         
 | | | | | _____ _ __ | | __ _ _ __ | |     __ _  __ _  ___ _ __ 
 | | | | |/ / _ \ '_ \| |/ _` | '_ \| |    / _` |/ _` |/ _ \ '__|
 | |_| |   <  __/ |_) | | (_| | | | | |___| (_| | (_| |  __/ |   
  \___/|_|\_\___| .__/|_|\__,_|_| |_|______\__,_|\__, |\___|_|   
                | |                               __/ |          
                |_|                              |___/

UkeplanLager er et effektivt verktøy designet for lærere som ønsker å bruke mindre tid på formatering og mer tid på undervisning. Programmet kombinerer et enkelt skrivebordsprogram med en kraftig database for gjenbruk av undervisningsopplegg.

🚀 Last ned og Installer
------------------------------------------------------------
Du finner den nyeste versjonen under Releases her på GitHub.

    Gå til Siste versjon.

    Last ned filen UkeplanLager.Setup.X.X.X.exe.

    Kjør filen for å installere.

    Programmet oppdaterer seg selv automatisk når nye versjoner legges ut!

✨ Funksjoner
------------------------------------------------------------
📅 Effektiv Planlegger
------------------------------------------------------------
    Enkel redigering: Skriv inn tema, aktiviteter og arbeidskrav i et rent grensesnitt.

    Rik tekst: Støtte for fet skrift, lister, farger og emojis 📝✅.

    Smarte maler: Programmet husker faste undervisningsdager og lekser for hvert fag.

🖼️ Ukeplanvisning (Preview)
------------------------------------------------------------
    Live forhåndsvisning: Se hvordan ukeplanen ser ut mens du skriver.

    Ett-klikks kopiering: Genererer et perfekt formatert bilde av ukeplanen som kan limes rett inn i Teams, OneNote eller e-post.

🗄️ Arkiv og Gjenbruk
------------------------------------------------------------
    Lokal Database: Alle planer lagres lokalt på din maskin (.db-fil).

    Søk: Søk i gamle ukeplaner etter nøkkelord for å finne igjen tidligere opplegg.

    Sist uke-funksjon: Hent opp planen fra forrige uke med ett klikk for å se hva dere gjorde sist.

⏳ Tidslinje
------------------------------------------------------------
    Få en visuell oversikt over alle uker og temaer gjennom året.

    Klikk på en uke i tidslinjen for å se detaljene umiddelbart.



------------------------------------------------------------
🛠️ For utviklere (Teknisk)
------------------------------------------------------------
Prosjektet er bygget med Electron (frontend) og Python Flask (backend).
Krav

    Node.js

    Python 3.x

Kjøre lokalt
Bash

# 1. Installer Node-avhengigheter
npm install

# 2. Installer Python-avhengigheter
pip install -r requirements.txt

# 3. Start applikasjonen
npm start

Bygge ny versjon (.exe)
Bash

# 1. Kompiler Python-backend
python -m PyInstaller --onefile --noconsole --name app app.py

# 2. Bygg Electron-app og installer
npm run build

👤 Forfatter

Laget av Stian Taknæs.

Laget for å gjøre lærerhverdagen enklere.
