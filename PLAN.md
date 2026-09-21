# orgOS — Plan (living roadmap)

Document de lucru, actualizat pe măsură ce avansăm. Completează (nu
înlocuiește) `frontend.md` (viziune pe Space), `backendDB.md` (decizii de
schema) și `BACKLOG.md` (idei mici, neurgente). Aici e ordinea reală de
execuție — ce facem, în ce ordine, și de ce.

**Cum se folosește:** la începutul unei sesiuni noi, citește secțiunea
"Status curent" ca să știi exact ce e făcut. Pe măsură ce un task se
termină, mută-l din faza lui în "Done" cu data. Nu renumerota fazele —
doar bifează.

**Poziționare competitivă (de ce contează ordinea asta):** orgOS
concurează cu aplicații verticale specializate (Fuelio/Drivvo pentru
mașină, AnyList/Bring pentru cumpărături, HomeZada/Sortly pentru casă,
YNAB pentru buget) și cu organizatoare de familie generaliste (Cozi).
Diferențiatorul real e un hub unificat, nu N aplicații separate — dar
asta ține doar dacă (a) fiecare Space e la fel de bun ca varianta lui
dedicată, nu o versiune diluată, și (b) infrastructura comună
(notificări, documente, colaborare) funcționează peste tot, nu doar
pe hârtie. De-asta Faza 1 vine înaintea spațiilor noi: un reminder care
nu notifică sau un document care nu se poate atașa subminează toate
Spațiile deodată, nu doar unul.

---

## Scope (actualizat 2026-09-17)

Decizie: **renunțăm deocamdată la Work / Health / Travel / Study.**
Focus exclusiv pe cele 4 Spaces existente — Car, Home, Grocery, Expenses
— până sunt duse la același nivel de profunzime. Fazele 4 (spații noi)
din varianta inițială a acestui plan sunt scoase din scop, nu doar
amânate; se reiau doar dacă cineva decide explicit să redeschidă subiectul.

Ordinea de lucru cerută, în această secvență:
1. Duce Home la paritate cu Car (detaliu mai jos — e imediat următorul pas)
2. Expenses — de la mock la Space real, persistat
3. Pagina principală (Home tab / dashboard) a aplicației — informații agregate relevante cross-space
4. Calendar
5. Buget

## Status curent (Sept 2026)

| Space | Backend | Persistat via API | Frontend | Status |
|---|---|---|---|---|
| Car | CarProfile + Item | Da | Foarte complet — formulare dedicate/categorie, urgency tiers (DUE SOON), renew flow, warranty toggle, batch entry, History+Archive separate | ~90%, reper de calitate |
| Grocery | Item + Recipe + IngredientReference | Da | Foarte complet (liste, smart list, rețete, sharing) | ~90% |
| Home | HomeProfile + Item | Da (tehnic) | **Coajă generică** — un singur form reutilizat cu 2 câmpuri/categorie, fără validare reală, fără urgency/expirare, fără renew, fără History/Archive. Vezi planul detaliat mai jos. | Slab, de refăcut |
| Expenses | — | **Nu — doar mock local, dispare la refresh** | Minim (4 componente prezentaționale) | Stub |
| Budget (tab, nu Space) | BudgetCategory + SavingsGoal | Da | Funcțional | OK, vine ultimul |

Infrastructură cross-cutting care lipsește complet: notificări push,
upload fișiere/poze, flux de invitație pe email pentru useri
inexistenți. RBAC (roluri/permisiuni) există în schema și e seedat, dar
neconectat la nicio verificare reală. Rămân relevante dar **nu blochează**
munca pe Home/Expenses — le abordăm quando ajungem la ele, nu înainte.

---

## Home Space — plan de dezvoltare (pasul imediat următor)

Obiectiv: aceeași profunzime ca Car, pe **4 categorii** — expenses,
maintenance, recurring, supplies. Shopping e deja acoperit de Grocery
space, deci nu se duplică aici.

### Documents — scos din scope-ul imediat (decizie 2026-09-17)

Utilitatea reală a Documents ar fi upload-ul efectiv de fișiere (poza/scan
la asigurare, garanție etc.) — varianta doar-metadate (tip + dată +
notițe, fără fișierul propriu-zis) nu aduce nimic ce userul nu știe deja.
Upload-ul de fișiere aduce însă riscuri de date sensibile (acte cu CNP,
semnătură) care nu sunt încă rezolvate — storage sigur, autentificare pe
fiecare descărcare, criptare la stocare, și mai ales **o găzduire stabilă
cu backup** (setup-ul actual de dev, pe laptop + tunel Cloudflare
temporar, nu e loc unde să ții acte reale/irecuperabile).

Decizie: Documents rămâne **în afara scope-ului Home Space acum** — se
reia ca feature separat, o dată cu Faza 1 (Upload documente/poze) din
planul general, când există și găzduire stabilă. Categoria `documents`
existentă în `homeCategoryConfig.ts` rămâne neatinsă (nu se șterge, doar
nu se dezvoltă acum) până se reia subiectul.

### 1. Formulare dedicate per categorie (înlocuiesc form-ul generic din `homeCategoryConfig.ts`)

- **HomeMaintenanceForm** (model: `CarMaintenanceForm.tsx`) — quick-select
  tip serviciu (Plumbing, Electrical, HVAC/AC, Appliance repair,
  Painting, Pest control, Roof/Gutter, Alt), price, provider, next
  service date, warranty/free toggle. Batch-mode (mai multe servicii
  într-o singură vizită) — opțional, se poate omite în prima iterație
  dacă vrem viteză.
- **HomeExpenseForm** — title, categorie (Utilities, Rent/Mortgage,
  Insurance, Repairs, Alt), amount, date, notes.
- **HomeRecurringForm** — title, categorie, amount, frecvență
  (weekly/monthly/yearly), next due date, notes. Aceasta e categoria care
  se conectează direct la notificările reale din Faza 1 a planului
  general — un "recurring bill" fără notificare e doar o listă pasivă.
  **Decizie confirmată (2026-09-17): marcarea "Plătit" contează în
  totalul lunar cheltuit.** Mecanism (pe modelul renew flow de la Car):
  marcarea "Plătit" nu editează intrarea recurentă în loc, ci (1) creează
  o înregistrare nouă, datată azi, cu suma respectivă — asta e ce intră
  în agregarea "This month" (aceeași logică ce deja sumează Maintenance
  price etc.), și (2) avansează `nextDueDate` pe șablonul recurent cu un
  ciclu (frecvența setată), pentru următorul reminder. Istoricul plăților
  rămâne complet, nu se suprascrie nimic.
- **HomeSupplyForm** — name, categorie, quantity+unit, prag de stoc redus
  (opțional), last restocked date.

### 2. Dashboard real (model: `CarDashboard.tsx`)

- Header cu Back/Edit (există deja via `HomeHeader`).
- Stat cards: This month expenses (există) + un al doilea stat cu sens
  (ex: "Active documents" sau "Due soon count", ca la Car unde al doilea
  stat deschide Expenses-ul agregat).
- Tab-uri pe categorie (All/Expenses/Maintenance/Recurring/Supplies)
  care filtrează RECENT+ALL, exact ca la Car.
- Secțiuni **DUE SOON** / **RECENT (Today)** / **ALL (Last week)**, cu
  empty states — azi Home are doar `HomeNextSection`, un singur bloc plat.

### 3. Motor de urgență (due date)

- Reutilizează logica din `lib/spaces/car/calculations/dashboard.calculations.ts`
  (urgency tiers: light/medium/critical) pentru `HomeRecurringEntry.nextDueDate`
  și (dacă are sens) `HomeMaintenanceEntry.nextServiceDate`.
- Decizie tehnică: extragem tier-logic-ul într-un helper comun
  (`lib/shared/urgency.ts` sau similar) folosit de Car ȘI Home, în loc să
  copiem codul a doua oară — Home fiind al doilea consumator e momentul
  potrivit să nu mai fie hardcodat doar în Car.

### 4. Renew flow pentru Maintenance

- Copiază exact patternul din Car: apăsarea unei alerte "Due soon" pe o
  intervenție de mentenanță deschide un formular nou pre-completat (nu
  editează în loc), vechea înregistrare se arhivează (`renewedFromId`),
  istoricul rămâne intact. (Documents renew flow se reia când se reia
  categoria Documents.)

### 5. History / Archive

- Pagini separate, model `CarHistoryPage.tsx`/`CarArchivePage.tsx`.
- Decizie de viteză: **duplicăm rapid pentru Home acum** (nu extragem
  componentă generică Car+Home încă) — generalizarea vine ulterior, la
  polish (Faza 5 din planul general), ca să nu blocăm progresul pe un
  refactor transversal chiar acum.

### Decizie deschisă (nu blochează, dar merită tranșată curând)

`frontend.md` menționează și Tasks/Chores pentru Home, care azi nu
există nicăieri (Shopping e clar Grocery). Propunere: **le lăsăm în
afara Home Space-ului pentru moment** — le reluăm după ce cele 5
categorii existente ajung la paritate cu Car, ca să nu diluăm efortul.
Confirmă dacă ești de acord sau vrei Tasks/Chores incluse de la început.

---

## Faza 0 — Fix-uri de încredere (rapid, înainte de orice altceva)

Astea nu sunt features — sunt lucruri care fac aplicația să mintă
userul (pare că salvează, nu salvează) sau lasă gunoi în cod de
producție. Se fac primele pentru că afectează încrederea în tot restul.

- [ ] **Expenses nu salvează nimic.** `ExpensesDashboard.tsx` ține
  `entries` în `useState` local, `handleAdd` nu apelează `api.createItem`,
  iar `[id].tsx` nici măcar nu-i pasează `onEntriesChange`. Orice
  cheltuială introdusă dispare la refresh. Fix minim: conectează
  Expenses la `/api/items` după modelul deja folosit de Car/Home
  (`lib/spaces/car/carItems.ts` ca referință), adaugă tipul de item
  lipsă în `Item.php` (comentariul din model chiar spune "add its type
  here once it's migrated onto items"). Acesta e blocking pentru orice
  altceva legat de Expenses/Finance.
- [ ] Verifică dacă `lib/dashboard/monthlyExpenses.ts` mai e importat
  undeva; dacă nu, șterge-l (pare superseded de calculul live din
  `DashboardController`).
- [ ] Elimină `console.log`-urile de debug din `[id].tsx` (`load()` și
  render) și din `api.ts` (`setToken` loghează prefixul tokenului —
  risc mic de securitate în plus față de zgomot).
- [ ] Confirmă că nimic nu mai linkează spre `/search` și, dacă mediul
  permite acum ștergerea fișierului, elimină `search.tsx` de tot în loc
  să rămână un stub gol.

## Faza 1 — Infrastructură cross-cutting (ridică nivelul întregii aplicații)

Astea nu aparțin unui singur Space — le beneficiază toate deodată, și
fără ele orgOS pierde clar în fața aplicațiilor specializate pe exact
funcțiile astea.

- [ ] **Notificări reale pentru remindere/deadline-uri.** `expo-notifications`
  + local scheduling pe baza `due_at` (minim: notificare locală
  programată la creare/update de Item cu `due_at`; push server-side e
  fază 2 dacă vrem sincronizare cross-device). Fără asta, "Recurring
  reminders" din viziunea pentru Home e o promisiune neîndeplinită.
- [ ] **Upload documente/poze.** Cel puțin pentru Car Documents și Home
  Documents (Warranty, ITP, asigurare) — azi se urmăresc doar metadate
  (dată expirare), nu fișierul propriu-zis. Necesită: storage (S3-compatible
  sau local disk pentru MVP), endpoint upload, câmp în `Item.metadata`
  pentru referința fișierului, UI de attach/preview.
- [ ] **Flux real de invitație pe email.** Azi, adăugarea unui membru
  eșuează silențios dacă emailul n-are cont. Minim: dacă emailul nu
  există, creează o invitație în așteptare (tabel nou `invitations` sau
  extensie pe `space_members`/`list_members` cu status `pending`) +
  email de invitație; la înregistrare cu emailul respectiv, activează
  automat accesul. Fără asta, colaborarea family/household — diferențiatorul
  central față de aplicațiile single-user — e ruptă pentru orice
  utilizator nou.
- [ ] **Decizie RBAC: implementează sau elimină.** Tabelele
  `roles`/`permissions`/`role_permissions`/`user_roles` există, sunt
  seedate, dar nimic nu le verifică. Două opțiuni:
  - (A) Conectează-le real, cu distincția owner/editor/viewer pe care
    `backendDB.md` o propunea deja pentru `space_members` (azi e binar
    owner/membru, toți membrii au write complet).
  - (B) Elimină schema RBAC neutilizată ca să reduci suprafața de
    întreținere, și ține accesul ad-hoc (owner/member) așa cum e azi,
    pornind de la premisa că pentru familie/gospodărie owner/member e
    suficient.
  Implicit merg pe (A) doar dacă apare o nevoie reală (ex: vrei
  read-only pentru cineva); altfel (B) e mai simplu de întreținut.
  **Cere-mi input explicit aici înainte să apuc de treaba asta** — e o
  decizie de produs, nu doar tehnică.

## Faza 2 — Finance ca zonă coerentă

Azi există două lucruri separate care ambele vorbesc despre bani:
Budget (tab, cross-space, limite+economii) și Expenses (Space, stub).
Viziunea (`frontend.md`) descrie un Space "Finance" cu Expenses, Income,
Bills, Subscriptions, Recurring payments, Budgets, Savings goals,
Categories — adică Budget-ul de azi + Expenses + bani intrați, unificate.

- [ ] Decizie de produs: Expenses rămâne Space separat de sine stătător,
  sau Expenses + Budget se combină într-un singur Space "Finance" (cu
  Budget tab-ul curent devenind o pagină/tab în interiorul lui, nu o
  secțiune globală separată)? Recomand a doua variantă — reflectă
  direct viziunea din `frontend.md` și elimină suprapunerea conceptuală
  dintre "cheltuieli pe Space" (Car/Home) și "cheltuieli generale".
- [ ] După decizie: adaugă tracking de venituri (`Income`), facturi
  recurente ca prime-class (nu doar `recurrence` pe un Item generic),
  subscripții.
- [ ] Categorii de cheltuieli configurabile de user (azi `category` e
  string liber pe Item).

## Faza 3 — Adâncire Spații existente (din BACKLOG.md, deja specificate)

Mici, bine definite, gata de implementat fără decizii suplimentare mari:

- [ ] Counter cu drag/gesture pentru perioada custom în Car → Expenses
  (`CarExpensesPage.tsx`, `react-native-gesture-handler`/`reanimated`
  deja disponibile).
- [ ] Estimare cost lunar pe "Your Lists" (Grocery) — necesită mai întâi
  decizia de design din BACKLOG (preț manual per produs vs. preț de
  referință din `ingredient_references`); recomand preț manual opțional
  ca prim pas, e mai simplu și mai corect decât o estimare din tabel de
  referință.
- [ ] Restock patterns învățate per produs (Grocery) — Faza 1 din planul
  deja detaliat în BACKLOG.md (adaugă `boughtAt`, normalizare nume
  produs). Fazele 2-4 (sugestii, auto-add, insight-uri diet) vin după ce
  Faza 1 are date reale acumulate.

## Faza 4 — Spații noi

Pornim de la zero pe astea, deci vin după ce infrastructura comună
(Faza 1) există — altfel construim un Space nou peste aceleași lipsuri
(fără notificări, fără documente) pe care le are deja Car/Home.

Ordine recomandată de prioritate (poate fi renegociată):

1. **Work** — cea mai largă aplicabilitate zilnică, cerere clară în
   `frontend.md` (Projects, Tasks, Deadlines, Meetings, Follow-ups,
   Notes, Goals). Risc: se suprapune cu Todoist/Notion — trebuie o
   diferențiere clară de "încă un to-do app" înainte de a începe design-ul
   concret, la fel cum Car a evitat să fie "Notes cu iconițe".
2. **Travel** — workflow foarte diferit (itinerary, rezervări, packing
   list), valoare mare când e folosit, dar folosit rar (doar când
   călătorești) — prioritate mai mică decât ceva zilnic.
3. **Health/Fitness** — viziunea proprie îl marchează cu "????????????"
   (scop incert). Nu începe design-ul concret până nu clarificăm ce
   rămâne în afara scopului (explicit: nu o aplicație medicală).

Pentru fiecare Space nou, înainte de cod: repetă exercițiul deja făcut
pentru Car în `frontend.md` — ce apare sus, ce e pe dashboard, ce intră
prin butonul "+", ce NU construim.

## Faza 5 — Polish transversal (nu urgent, dar cost crescător dacă amânăm)

- [ ] i18n (`react-i18next` + `expo-localization`) — detaliat deja în
  BACKLOG.md secțiunea B. Cu cât se amână mai mult, cu atât mai mult
  cod de migrat. Recomand: pornește infrastructura (fișiere de traducere
  goale, `t()` returnând engleză) în momentul în care începem un Space
  nou (Faza 4), ca noul cod să fie deja translation-ready, în loc de un
  refactor big-bang separat.
- [ ] Seed data pentru Car/Home/Expenses/Budget — azi doar
  Grocery/Recipes sunt seedate; un `migrate --seed` proaspăt dă un
  dashboard gol pentru orice altceva. Util mai ales dacă vine cineva
  nou pe proiect sau facem demo-uri.
- [ ] Refactor pattern-ul copy-paste din `[id].tsx` (save/delete
  optimist repetat de ~9 ori pentru Car+Home) într-un helper generic,
  ideal înainte să adăugăm Expenses/Finance peste același pattern —
  altfel devine 13-14 blocuri aproape identice.

---

## Done

_(niciunul încă)_
