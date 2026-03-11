# Industri arbeidstegning-app

En enkel webapp som lar deg skrive inn mål i millimeter og genererer en ferdig arbeidstegning med:

- Topp-, front- og sidevisning
- Målsetting i mm
- Hullplassering og diameter
- Skisseverktøy for strek, firkant og sirkel (førsteutkast)
- Angre-knapp (fjerner siste skissefigur)
- Blankt ark-modus for fri skissing
- Automatisk merking av figurer (A, B, C ...) med redigerbare målfelt
- U-profil verkstedmodus med toppvisning, snitt og produksjonstabell
- Fri tegning med strek, firkant, sirkel og rør
- Materialvalg per figur (stål, alu, blikk)
- Flytt-verktøy for å dra figurer rundt på arket
- 3D-ekstrudering per figur via sidehåndtak (dra ut dybde)
- PDF-knapp som lager arbeidsark-layout (2D, 3D og måltabell)
- Sammenhengende linjer grupperes som enheter med vinkelstyring i grader mellom streker
- Vinkel-snap ved linjetegning (av, 15°, 30°, 45°, 90°)
- Touch-optimalisert for mobil og PC
- Egen `Dra ut 3D`-modus for enklere ekstrudering direkte på objektet
- Målelinje-verktøy med snapping til objektpunkter (f.eks. sirkel til kant)
- Tittelfelt (delnavn, toleranse, dato, skala)
- Eksport til SVG

## Kjøring

1. Åpne `index.html` i nettleser.
2. Fyll inn mål i venstre panel.
3. Tegningen oppdateres automatisk.
4. Klikk **Last ned SVG** for å eksportere.

## GitHub Pages (stabil oppsett)

1. Legg app-filene i `docs/`:
   - `docs/index.html`
   - `docs/style.css`
   - `docs/app.js`
2. Push til GitHub.
3. Gå til `Settings -> Pages`.
4. Under `Build and deployment`:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` (eller branchen du bruker)
   - `Folder`: `/docs`
5. Vent 1-2 minutter og åpne URL-en GitHub viser.

Feilsjekk:
- `https://<bruker>.github.io/<repo>/style.css`
- `https://<bruker>.github.io/<repo>/app.js`

Hvis en av disse ikke åpner filen direkte, peker Pages til feil mappe/branch.

## Videre utvidelser

- PDF-eksport med fast A3/A4-oppsett
- Flere hull, slisser og gjenger
- DXF-eksport for CAM/CNC
- Lagring av maler per produktfamilie
