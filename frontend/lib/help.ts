/**
 * Every "ⓘ" explanation in the app, in one place: how a card, a space, a
 * form or a kind of record works. Opened by <InfoButton topic=... />
 * (components/ui/primitives.tsx) and rendered by HelpHost
 * (components/ui/HelpHost.tsx, mounted once at the root).
 *
 * Rules for the copy: Romanian, sentence case, plain words, what the
 * person SEES and what happens when they act -- never how it's built.
 * Keep the numbers here in sync with the code they describe (the
 * thresholds are named next to each topic).
 */

export type HelpPoint = { title?: string; text: string };
export type HelpTopic = {
  title: string;
  intro?: string;
  points: HelpPoint[];
  /** A first-use tour (lib/tours.ts) this topic can replay: HelpHost then
   * shows "Arată ghidul ...". Typed as a string here to keep help.ts free
   * of an import from tours.ts; HelpHost checks it with tourExists(). */
  tour?: string;
};

const SWIPE: HelpPoint = {
  title: "Glisează pe un rând",
  text: "Spre dreapta îl rezolvi (sau reînnoiești un document), spre stânga îl ștergi. Ștergerea cere mereu confirmare.",
};

export const HELP = {
  /* ---------------- Acasă ---------------- */
  "home.page": {
    title: "Acasă",
    tour: "home",
    intro: "Rezumatul tuturor spațiilor tale, pe un singur ecran.",
    points: [
      { title: "Carduri", text: "Fiecare card arată o parte din aplicație: banii lunii, ce ai de făcut, plățile, mașina, listele. Atinge un card ca să deschizi locul de unde vine." },
      { title: "Personalizare", text: "Ține apăsat pe un card: apare meniul lui (setări, mărime, ascunde). Ține și trage ca să-l muți direct. Creionul sau un loc gol ținut apăsat deschid aranjarea completă." },
      SWIPE,
    ],
  },
  "home.edit": {
    title: "Personalizezi Acasă",
    points: [
      { title: "Mută", text: "Ține apăsat pe ☰ și trage cardul unde vrei." },
      { title: "Ascunde sau setează", text: "Ochiul ascunde cardul fără să-l ștergi. Rotița deschide setările: mărime, culoare, titlu, câte rânduri arată." },
      { title: "Două carduri pe un rând", text: "Două carduri compacte puse unul după altul stau alături." },
      { title: "Salvare", text: "Nimic nu se schimbă până apeși „Gata”. „Renunță” păstrează aranjamentul de dinainte. Aranjamentul se salvează în cont, deci e același pe telefon și pe web." },
      { title: "Resetare", text: "„Resetează Acasă” readuce cardurile inițiale: cheltuit, de făcut, plăți recurente, economii." },
    ],
  },
  "card.spend": {
    title: "Cheltuit în luna asta",
    intro: "Cât ai cheltuit luna asta, din toate spațiile. Cu venitul adăugat în Buget, și cât mai ai din ce ai de cheltuit.",
    points: [
      { title: "Cheltuit", text: "Doar ce ai înregistrat deja: alimentări, service-uri, cumpărături, cheltuieli, facturi plătite. Fiecare culoare e un spațiu." },
      { title: "De plătit", text: "Facturile recurente și ratele la credit, socotite pe lună (o factură săptămânală ≈ 4,33 plăți pe lună). Apar estompate: nu sunt încă plătite, dar le scădem din ce ai de cheltuit din timp." },
      { title: "Planificat", text: "Evenimentele din Calendar care implică o cumpărare, până în ziua lor. Tot estompate: le scădem din ce ai de cheltuit din timp, iar din ziua evenimentului trec la Cheltuit." },
      { title: "Procentul din inel", text: "Cât din ce ai de cheltuit ai folosit deja. Ce rămâne gol din inel e ce mai ai cu adevărat de cheltuit." },
      { title: "Mai ai", text: "Ce ai de cheltuit minus cheltuit, de plătit și planificat, pentru zilele rămase din lună. Sunt aceleași numere ca în Buget." },
      { title: "Fără venit", text: "Nu ai un buget, așa că nu vezi procent și nici Mai ai: doar cât ai cheltuit, pe spații. Adaugă venitul în Buget ca să-l ai." },
      { title: "Grafic", text: "Din setările cardului alegi inel sau bară." },
    ],
  },
  "card.todo": {
    title: "De făcut",
    intro: "Cel mai urgent lucru din fiecare spațiu, sus cel mai întârziat.",
    points: [
      { title: "Ce intră", text: "Sarcini, facturi, mentenanță, documente care expiră, service-uri la mașină (după dată sau kilometri), evenimente din calendar. Tot ce e restant, azi sau în următoarele 7 zile." },
      { title: "Sub fiecare rând", text: "Ce mai așteaptă în același spațiu: „încă 10 restante · 1 azi · 6 în 7 zile · 2 provizii”." },
      { title: "Liste și provizii", text: "Un spațiu fără termene, dar cu produse de cumpărat sau provizii pe terminate, apare cu ele." },
      { title: "Vezi tot", text: "Deschide lista completă, grupată pe restante, azi și zilele următoare." },
      SWIPE,
    ],
  },
  "card.bills": {
    title: "Plăți recurente",
    intro: "Următoarele plăți care se repetă, cele restante primele.",
    points: [
      { title: "Facturi", text: "Din Casă, Plăți recurente. Le scădem din buget din timp, ca „de plătit”." },
      { title: "Mentenanță", text: "Lucrările recurente din Casă, Mentenanță. Costul intră la Cheltuit abia când le marchezi făcute." },
      { title: "Restantă", text: "O plată rămâne pe data ei, cu roșu, până o rezolvi. Nu sare singură la luna următoare." },
      { title: "Plătești mai devreme?", text: "Te întrebăm dacă următoarea scadență se socotește de azi sau păstrează programul." },
      SWIPE,
    ],
  },
  "card.savings": {
    title: "Economii",
    intro: "Cât ai strâns față de obiectivul tău.",
    points: [
      { title: "Cum crește", text: "Pe 1 a fiecărei luni adăugăm ce pui deoparte și ce a rămas necheltuit din luna trecută." },
      { title: "Poate și scădea", text: "Dacă ai cheltuit mai mult decât aveai de cheltuit (cu facturi și rate), diferența se scade." },
      { title: "Și ratele contează", text: "Ratele la credit intră în ce ai de cheltuit. O lună în care ratele te duc peste sumă scade și economiile." },
      { title: "Obiectivul", text: "Îl schimbi din Buget, atingând cardul Economii." },
    ],
  },
  "card.budget": {
    title: "Cheltuit pe spații",
    points: [
      { text: "Cât ai cheltuit luna asta în fiecare spațiu, de la cel mai mare. Doar ce ai înregistrat: facturile de plătit și cumpărăturile planificate nu intră aici." },
      { title: "Bara", text: "Partea spațiului din tot ce ai cheltuit luna asta. Nu e o limită: spațiile nu au bugete separate, toate cheltuiesc din aceeași sumă." },
      { text: "Atinge cardul ca să deschizi Buget." },
    ],
  },
  "card.car": {
    title: "Mașină",
    points: [
      { title: "Kilometraj", text: "Ultimul kilometraj înregistrat, din alimentări, service-uri sau profilul mașinii." },
      { title: "Următorul service", text: "Cel mai apropiat după kilometri, din ce ai trecut la „Următorul service (km)” și câți kilometri mai ai până la el." },
      { title: "Document", text: "Primul document care expiră (RCA, ITP, rovinietă...)." },
      { text: "Mai multe mașini? Adaugă câte un card pentru fiecare, din „Adaugă card”." },
    ],
  },
  "card.grocery": {
    title: "Listă de cumpărături",
    points: [
      { text: "Produsele încă nebifate de pe o listă anume. Alegi lista din setările cardului." },
      { text: "Atinge cardul ca să deschizi lista în Cumpărături." },
    ],
  },
  "card.supplies": {
    title: "Provizii",
    points: [
      { text: "Proviziile din Casă care se termină în curând, estimat din cât de des le cumperi." },
      { text: "Estimarea pornește după a doua cumpărare a aceluiași produs și se rafinează cu fiecare nouă cumpărare." },
    ],
  },
  "card.calendar": {
    title: "Următoarele 7 zile",
    points: [
      { text: "Tot ce are o dată în săptămâna care vine, zi cu zi: sarcini, facturi, documente, service-uri, evenimente." },
      { text: "Atinge o zi ca s-o deschizi în Calendar." },
    ],
  },
  "card.expenses": {
    title: "Cheltuieli",
    points: [{ text: "Cât ai cheltuit luna asta în spațiul Cheltuieli. Atinge cardul ca să-l deschizi și să adaugi o cheltuială." }],
  },
  "home.catalog": {
    title: "Adaugă un card",
    points: [
      { text: "Cardurile sunt grupate: bani, de făcut și spații." },
      { text: "Cardurile Mașină, Listă, Provizii și Cheltuieli se adaugă câte unul pentru fiecare mașină, listă sau spațiu." },
      { text: "„Arată” readuce un card pe care l-ai ascuns." },
    ],
  },
  "home.templates": {
    title: "Șabloane",
    points: [
      { text: "Un șablon îți înlocuiește tot aranjamentul de pe Acasă. Îl poți ajusta după aceea." },
      { text: "Se salvează abia când apeși „Gata”." },
    ],
  },
  "todo.sheet": {
    title: "De făcut",
    points: [
      { text: "Tot ce e restant, azi sau în următoarele zile, din toate spațiile, grupat după zi." },
      { title: "Rezolvă rapid", text: "Sarcinile simple le bifezi direct de aici. Pentru restul, „Deschide” te duce exact unde se rezolvă." },
      { title: "Mementouri", text: "Ratele creditelor din Cheltuieli apar în ziua plății, doar ca să-ți amintească. Nu se bifează și nu devin restante." },
    ],
  },

  /* ---------------- Spații ---------------- */
  "spaces.page": {
    title: "Spații",
    intro: "Fiecare spațiu e o parte din viața ta pe care o organizezi separat.",
    points: [
      { title: "Mașină", text: "Alimentări, service-uri, documente și cheltuieli pentru o mașină. Dacă e în rate, rata ajunge în Cheltuieli, la Credite." },
      { title: "Casă", text: "Sarcini, facturi recurente, mentenanță, provizii și documente pentru o locuință. Una cumpărată în rate are rata în Cheltuieli, la Credite." },
      { title: "Cumpărături", text: "Liste de cumpărături, partajabile, și rețete." },
      { title: "Cheltuieli", text: "Orice altă cheltuială: nume, sumă, dată. Tot aici sunt creditele (rate la bancă sau leasing)." },
      { title: "Starea de pe fiecare spațiu", text: "„3 restante” sau „1 azi” arată cel mai urgent lucru din el." },
      { title: "Editează", text: "Ține apăsat pe un spațiu: Editează, Aranjează sau Șterge. Ține și trage ca să-l muți în grilă. Creionul de sus deschide lista completă. „+” creează unul nou." },
    ],
  },

  "spaces.edit": {
    title: "Editezi spațiile",
    points: [
      { title: "Mută", text: "Ține apăsat pe ☰ și trage spațiul unde vrei. Ordinea e aceeași în grila Spații." },
      { title: "Editează", text: "Creionul de pe rând: nume, iar la Mașină și Casă și detaliile lor." },
      { title: "Șterge", text: "Coșul de pe rând. Se șterge spațiul cu tot ce conține, după confirmare." },
      { title: "Salvare", text: "Ordinea nouă se salvează la „Gata”. „Renunță” o păstrează pe cea veche." },
    ],
  },

  /* ---------------- Calendar ---------------- */
  "calendar.page": {
    title: "Calendar",
    tour: "calendar",
    points: [
      { title: "Culoarea zilelor", text: "Culoarea zilei arată cât din timpul tău liber din ziua aceea e ocupat. Weekendul și sărbătorile încap mai mult decât o zi de lucru. Zilele trecute nu se colorează." },
      { title: "Punctele", text: "Verde: un eveniment al tău. Roșu, pe o zi trecută: a rămas ceva nerezolvat." },
      { title: "Luna", text: "Glisează calendarul stânga-dreapta sau folosește săgețile. „Azi” te aduce înapoi." },
      { title: "Evenimente", text: "Evenimentele tale (zile de naștere, programări) se adaugă cu „+ Eveniment”. Dacă implică o cumpărare, suma intră în cheltuieli." },
    ],
  },
  "calendar.heat": {
    title: "Următoarele 3 luni",
    points: [
      { text: "Fiecare card e o lună în mic: luna asta și următoarele două. Fiecare pătrățel e o zi, colorat ca în calendarul mare: cu cât culoarea e mai intensă, cu atât ai mai mult de făcut în ziua aceea față de timpul liber. O zi fără nimic are doar contur. Atinge o lună ca să sari la ea." },
      { title: "Liniștită, Plină, Prea plină", text: "Sub fiecare lună vezi cât de încărcată e toată luna: până la jumătate din timpul liber e „Liniștită”, peste jumătate e „Plină”, iar peste tot timpul liber e „Prea plină” (cu roșu)." },
      { title: "Timpul liber", text: "Socotim că lucrezi de luni până vineri, 9–17: într-o zi de lucru încap puține lucruri, în weekend și de sărbătorile legale încap de două ori mai multe." },
      { title: "Cât cântărește un lucru", text: "O factură sau o rată: puțin. O sarcină sau un eveniment: ceva mai mult. Un service, ITP-ul, reînnoirea unui document sau o vizită a unui meșter: cel mai mult, și și mai mult într-o zi de lucru, fiindcă trebuie făcute în program." },
      { text: "La lunile viitoare vezi „≈”: e o estimare, din ce e deja programat. Facturile și tot ce se repetă apar la fiecare scadență, lună de lună." },
      { text: "Culoarea zilelor din calendar urmează aceeași regulă: cât din timpul liber al zilei e ocupat. Service-urile programate doar pe kilometri și proviziile n-au o zi anume, așa că nu apar aici." },
    ],
  },
  "calendar.day": {
    title: "De rezolvat",
    points: [
      { text: "Exact ce pică în ziua aleasă în spațiile tale. Evenimentele zilei apar deasupra, ca etichete verzi." },
      { title: "Glisează pe un rând", text: "Spre dreapta ca să rezolvi, spre stânga ca să ștergi. Atinge-l ca să-l deschizi în spațiul lui." },
      { title: "Mementouri", text: "Ratele creditelor din Cheltuieli apar în ziua plății, doar ca să-ți amintească. Nu se bifează și nu devin restante." },
    ],
  },
  "calendar.event": {
    title: "Eveniment nou",
    points: [
      { text: "Un eveniment al tău, care nu ține de un spațiu: o programare, o aniversare, o întâlnire." },
      { title: "Implică o cumpărare", text: "Până în ziua evenimentului, suma apare ca „planificat” (se scade din ce ai de cheltuit din timp). Din ziua lui trece la Cheltuit. Dacă evenimentul se repetă, suma se socotește la fiecare dată, în luna ei. O vezi și în spațiul Cheltuieli, „din Calendar”." },
      { title: "Se repetă", text: "Apare în calendar în fiecare perioadă aleasă." },
      { text: "Lista „Evenimente” arată evenimentele din următoarele 3 luni, fiecare o singură dată." },
      { title: "Data", text: "Pornește de la ziua aleasă în calendar; o poți schimba din câmpul „Data”." },
    ],
  },

  /* ---------------- Buget ---------------- */
  "budget.page": {
    title: "Buget",
    tour: "budget",
    intro: "Cum stai luna asta față de ritmul normal și cât mai poți cheltui pe zi. Dedesubt: venitul, cât ai cheltuit pe spații, economiile și plățile recurente.",
    points: [
      { title: "Cheltuit", text: "Tot ce ai înregistrat luna asta în toate spațiile. Spațiile nu au bugete separate, așa că o cheltuială mare într-unul nu strică restul." },
      { title: "Ritm normal", text: "Cât ar fi firesc să fi cheltuit până azi: ce ai de cheltuit fără facturi și rate, împărțit pe zilele lunii, plus cumpărăturile din Calendar în ziua lor." },
      { title: "Peste sau sub ritm", text: "Diferența, în lei. În primele 5 zile nu o arătăm: o singură cheltuială mare ar strica imaginea." },
      { title: "Cel mult pe zi", text: "Cât mai ai din ce ai de cheltuit, împărțit la zilele rămase, cu azi cu tot." },
      { title: "Facturi și rate", text: "Facturile spațiilor și ratele la credit, socotite pe lună. Le scădem din timp, ca să nu te surprindă." },
      { title: "Planificat în Calendar", text: "Evenimentele care implică o cumpărare, până în ziua lor. Din ziua evenimentului trec la Cheltuit." },
      { title: "Mai ai", text: "Ce ai de cheltuit minus cheltuit, facturi, rate și planificat." },
      { title: "Fără venit setat", text: "Bugetul vine din venit. Până îl adaugi nu ai un buget: vezi doar cât ai cheltuit în fiecare spațiu." },
    ],
  },
  "budget.income": {
    title: "Venitul tău",
    points: [
      { text: "Cât intră în cont pe lună, după taxe. Îl schimbi doar când se schimbă." },
      { title: "Pui deoparte", text: "O sumă fixă pe lună, care merge la Economii pe 1 a lunii. Poate fi și 0." },
      { title: "De cheltuit", text: "Venitul minus ce pui deoparte. Din el vin cheltuielile din spații, facturile și ratele." },
    ],
  },
  "budget.split": {
    title: "Venit, pus deoparte, de cheltuit",
    points: [
      { text: "Cât intră în cont pe lună, după taxe. Îl schimbi doar când se schimbă." },
      { title: "Pui deoparte", text: "O sumă fixă pe lună, care merge la Economii pe 1 a lunii. Poate fi și 0." },
      { title: "De cheltuit", text: "Venitul minus ce pui deoparte. Din el vin cheltuielile din spații, facturile și ratele." },
    ],
  },
  "budget.spaces": {
    title: "Cheltuit pe spații",
    points: [
      { text: "Cât ai cheltuit luna asta în fiecare spațiu, de la cel mai mare. Bara și procentul arată partea lui din tot ce ai cheltuit." },
      { title: "Fără bugete pe spații", text: "Spațiile nu au bugete separate: toate cheltuiesc din aceeași sumă. Așa, o cheltuială mare la mașină nu te dă peste cap la cumpărături. Cum stai cu toate la un loc vezi în „Ritmul lunii”." },
      { title: "Doar ce ai cheltuit", text: "Facturile de plătit și cumpărăturile planificate nu intră aici; le vezi în Ritmul lunii și când deschizi spațiul." },
      { text: "Atinge un spațiu ca să-i vezi cheltuielile pe săptămâni și pe ultimele 4 luni." },
    ],
  },
  "budget.recurring": {
    title: "Plăți recurente",
    intro: "Tot ce se repetă și costă bani, în două feluri.",
    points: [
      { title: "Facturi", text: "Din Casă, Plăți recurente. Le scădem din buget din timp, ca „de plătit”, înainte să le plătești." },
      { title: "Mentenanță recurentă", text: "Din Casă, Mentenanță. Costul intră la Cheltuit abia când o marchezi făcută." },
      { title: "„/ lună”", text: "Cât costă grupa în medie pe lună: o plată săptămânală se socotește × 52 ÷ 12 (≈ 4,33 pe lună), una anuală ÷ 12." },
      SWIPE,
    ],
  },
  "recurring.bill": {
    title: "Facturi",
    points: [
      { text: "Plățile care se repetă din Casă, Plăți recurente: internet, întreținere, abonamente." },
      { text: "Le scădem din buget din timp, ca „de plătit”, chiar înainte să le plătești." },
      { text: "O factură neplătită rămâne pe data ei, cu roșu, până o rezolvi." },
    ],
  },
  "recurring.maintenance": {
    title: "Mentenanță recurentă",
    points: [
      { text: "Lucrările care se repetă din Casă, Mentenanță: curățenie, revizii, filtre." },
      { text: "Nu le scădem din buget din timp. Costul intră la Cheltuit abia când marchezi lucrarea făcută, cu suma de atunci." },
      { text: "Suma „/ lună” e doar o medie, ca să știi cât te costă: o lucrare săptămânală de 80 lei ≈ 347 lei pe lună." },
    ],
  },
  "budget.savings": {
    title: "Economii",
    points: [
      { title: "Cum crește", text: "Pe 1 a fiecărei luni adăugăm ce pui deoparte și ce a rămas necheltuit din luna trecută." },
      { title: "Poate și scădea", text: "Dacă ai cheltuit mai mult decât aveai de cheltuit (cu facturi și rate), diferența se scade." },
      { title: "Și ratele contează", text: "Ratele la credit intră în ce ai de cheltuit. O lună în care ratele te duc peste sumă scade și economiile." },
      { title: "Obiectiv", text: "Atinge cardul ca să pui suma pe care vrei s-o strângi, până când și, dacă vrei, pentru ce. Îți arătăm cât să pui deoparte pe zi, pe săptămână și pe lună." },
      { title: "Ritmul tău", text: "Atinge una dintre sume (pe zi, pe săptămână sau pe lună) ca s-o alegi. Apoi atinge-o de fiecare dată când pui banii deoparte: se adaugă în Economii pe loc, iar „Pui deoparte” din bandă arată estimarea lunii." },
      { title: "Amintiri", text: "Ritmul ales apare în Calendar până la data obiectivului. După 3 zile, săptămâni sau luni la rând îți amintim și pe telefon, la ora 20. Îl oprești din formularul obiectivului." },
    ],
  },
  "budget.credit": {
    title: "Credit",
    points: [
      { text: "Ratele la credit intră în ce ai de cheltuit, ca facturile: le scădem din timp, în zona hașurată din Ritmul lunii." },
      { title: "Nu țin de un spațiu", text: "Un credit legat de mașină sau casă apare lângă ea, dar nu intră în „Cheltuit pe spații”." },
      { title: "Unde le schimbi", text: "Creditele se adaugă și se modifică în spațiul Cheltuieli, la Credite. După ultima rată nu mai contează." },
    ],
  },
  "budget.overview": {
    title: "Luna asta",
    points: [
      { text: "Unde s-au dus banii lunii, pe spații. Spațiile nu au bugete separate: toate cheltuiesc din ce ai de cheltuit." },
      { title: "Cu venitul adăugat", text: "Sus vezi cât ai cheltuit din ce ai de cheltuit, aceeași sumă ca în Buget. Intră și cumpărăturile din Calendar, chiar dacă nu ai un spațiu Cheltuieli." },
      { title: "Lunile trecute", text: "Atinge o lună ca să vezi cât ai cheltuit atunci, pe spații. Ratele apar separat, sub „În afara spațiilor”." },
    ],
  },
  "budget.spaceDetail": {
    title: "Un spațiu în Buget",
    points: [
      { title: "Fără buget separat", text: "Spațiul nu are o limită a lui: tot ce cheltuiești aici se scade din ce ai de cheltuit, împreună cu celelalte spații." },
      { title: "Luna asta", text: "Cât ai cheltuit aici luna asta, pe săptămâni: vezi dacă a fost o cheltuială mare sau puțin câte puțin." },
      { title: "Facturile", text: "Facturile recurente ale spațiului apar separat, ca „de plătit”, până le plătești." },
      { title: "Planificat", text: "Cumpărăturile din evenimentele Calendarului care încă n-au venit. Sunt în listă, dar nu în Cheltuit până în ziua lor." },
      { title: "Ultimele 4 luni", text: "Atinge o lună din grafic ca să vezi doar cheltuielile ei." },
    ],
  },

  /* ---------------- Mașină ---------------- */
  "car.space": {
    title: "Mașină",
    tour: "space_car",
    intro: "Tot ce ține de o mașină: plinuri, service-uri, documente, cheltuieli.",
    points: [
      { title: "Urmează", text: "Documentele care expiră în 45 de zile și service-urile care se apropie (sub 2.000 km sau după dată)." },
      { title: "Ultimele 7 zile", text: "Ce ai înregistrat recent. Mai vechi le găsești în Istoric." },
      { title: "Consum mediu", text: "Se calculează din alimentări, când ai cel puțin două și capacitatea rezervorului în profil." },
      { title: "Kilometraj", text: "Cel mai mare introdus la o alimentare, un service sau de mână. Atinge kilometrajul (sau creionul de lângă el) ca să-l actualizezi." },
      SWIPE,
    ],
  },
  "car.next": {
    title: "Urmează",
    points: [
      { title: "Documente", text: "Apar cu 45 de zile înainte de expirare. Galben sub 45, portocaliu sub 30, roșu sub 15 zile sau expirat." },
      { title: "Service", text: "Apar sub 2.000 km rămași (portocaliu sub 1.000, roșu sub 500) sau când se apropie data." },
      { title: "Reînnoire", text: "Glisează spre dreapta pe un document: noua valabilitate pornește de a doua zi după vechea expirare și are aceeași durată. Documentul vechi merge în Arhivă." },
    ],
  },
  "car.recent": {
    title: "Ultimele 7 zile",
    points: [{ text: "Ce ai înregistrat în ultima săptămână. După 7 zile, înregistrările trec în Istoric. Nu se pierde nimic." }],
  },
  "car.docs": {
    title: "Documente",
    points: [
      { text: "RCA, ITP, rovinietă, CASCO și orice alt document al mașinii, ordonate după expirare." },
      { title: "Valabilitate", text: "Arătăm mereu perioada de valabilitate, nu data la care l-ai introdus în aplicație." },
      { title: "Reînnoire", text: "Glisează spre dreapta. Poți păstra datele vechi (aceeași durată, de după vechea expirare) sau le modifici. Cel vechi trece în Arhivă." },
    ],
  },
  "car.expenses": {
    title: "Cheltuieli mașină",
    points: [
      { text: "Tot ce a costat mașina, din toate formularele: alimentări, service-uri, documente, alte cheltuieli." },
      { text: "Alege perioada sus. Documentele reînnoite se numără și ele: banii au fost cheltuiți." },
    ],
  },
  "car.history": {
    title: "Istoric",
    points: [{ text: "Înregistrările mai vechi de 7 zile, grupate pe luni. Glisează spre stânga ca să ștergi una." }],
  },
  "car.archive": {
    title: "Arhivă",
    points: [{ text: "Documentele și lucrările înlocuite când le-ai reînnoit. Rămân aici pentru evidență și se numără în cheltuieli." }],
  },
  "car.fuelForm": {
    title: "Alimentare",
    points: [
      { title: "Obligatoriu", text: "Doar prețul. Cu litrii completați îți arătăm și prețul pe litru." },
      { title: "Kilometraj", text: "Îl actualizează pe cel al mașinii și ajută la calculul consumului." },
      { title: "Nivel rezervor", text: "Din nivelul înainte și după plin (și capacitatea rezervorului) îți sugerăm câți litri ai pus și calculăm consumul mai exact, mai ales la plinuri parțiale." },
    ],
  },
  "car.maintenanceForm": {
    title: "Service",
    points: [
      { title: "Mai multe lucrări", text: "Adaugă toate lucrările făcute la aceeași vizită, fiecare cu prețul ei." },
      { title: "Următorul service", text: "La kilometri, la dată sau ambele. Te anunțăm când se apropie, oricare vine primul." },
      { title: "În garanție", text: "Se salvează cu preț 0." },
    ],
  },
  "car.documentForm": {
    title: "Document",
    points: [
      { title: "Datele sunt obligatorii", text: "Data emiterii și data expirării. Din ele știm când să te anunțăm și cum se calculează reînnoirea." },
      { title: "Alertă", text: "Documentul apare la „Urmează” cu 45 de zile înainte de expirare." },
      { title: "Cost", text: "Opțional. Dacă îl completezi, intră în cheltuielile mașinii." },
    ],
  },
  "car.expenseForm": {
    title: "Cheltuială mașină",
    points: [{ text: "Orice altceva a costat mașina: spălătorie, parcare, accesorii, amenzi. Doar suma e obligatorie." }],
  },
  "car.odometer": {
    title: "Kilometraj",
    points: [
      { text: "Scrie cât arată acum bordul. Folosim cel mai mare număr dintre ce scrii aici și ce ai trecut la alimentări, service-uri și cheltuieli." },
      { title: "Nu poate scădea", text: "Nu poți trece mai puțin decât ai înregistrat deja la o alimentare sau un service. Ai greșit acolo? Corectează înregistrarea respectivă." },
      { title: "Service-uri", text: "Service-urile programate după km din „Urmează” se recalculează imediat." },
      { title: "Scurtătură", text: "Ține apăsat pe kilometraj ca să deschizi direct actualizarea." },
    ],
  },
  "car.profile": {
    title: "Profilul mașinii",
    points: [
      { text: "Marca, modelul și numărul apar sub numele mașinii." },
      { title: "Culoarea spațiului", text: "Alege o culoare pentru spațiu: pagina lui, butoanele și rândurile lui din Acasă, Spații și Calendar o folosesc. Bugetul păstrează culorile pe tipuri." },
      { title: "Capacitatea rezervorului", text: "Fără ea nu putem calcula consumul mediu." },
      { title: "În rate", text: "La o mașină nouă, bifează „În rate” dacă e în leasing sau credit. Rata lunară se trece în Cheltuieli, la Credite (dacă nu ai un spațiu Cheltuieli, îl creăm, cu numele „Default”). Creditul îl modifici apoi din Cheltuieli › Credite." },
    ],
  },

  /* ---------------- Casă ---------------- */
  "home.space": {
    title: "Casă",
    intro: "Tot ce ține de o locuință, cu ce e urgent primul.",
    points: [
      { title: "Istoric, Documente, Provizii", text: "Butoanele de sub nume. O cifră roșie înseamnă documente expirate sau provizii pe terminate." },
      { title: "Sus", text: "Cât ai cheltuit luna asta în casă (atinge ca să vezi cheltuielile) și cât te costă facturile pe lună (atinge ca să vezi facturile)." },
      { title: "Butoanele", text: "Adaugi direct o sarcină, o factură, o lucrare de mentenanță, o cheltuială sau o provizie." },
      { title: "De rezolvat", text: "Cele mai urgente 5 sarcini, facturi sau lucrări de mentenanță; „Toate…” de dedesubt le arată pe toate, chiar acolo. Cifra de pe fiecare tab: roșu = restante, portocaliu = azi." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să rezolvi, spre stânga ca să ștergi." },
    ],
  },
  "home.scadente": {
    title: "De rezolvat",
    points: [
      { text: "Sarcinile, facturile și lucrările de mentenanță restante, de azi sau din următoarele 7 zile." },
      { title: "Tab-urile", text: "Sarcini, Facturi, Mentenanță. Se deschide pe Sarcini. În fiecare: cele mai urgente 5 (Restante, Azi, Următoarele 7 zile), apoi „Toate…” le desfășoară pe toate, indiferent de stare (și cele mai târzii sau fără dată); „Arată mai puțin” le strânge la loc." },
      { title: "Cifrele", text: "Roșu = câte sunt restante, portocaliu = câte sunt azi. Fără cifră = nimic urgent." },
      { title: "Documente și provizii", text: "Le deschizi din butoanele de sub nume; cifra roșie de pe ele = expirate / pe terminate." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să rezolvi, spre stânga ca să ștergi." },
    ],
  },
  "home.next": {
    title: "Urmează",
    points: [{ text: "Ce vine în Casă în următoarele 14 zile, iar documentele în următoarele 45. Cele mai apropiate primele." }],
  },
  "home.tasks": {
    title: "Sarcini",
    points: [
      { title: "În curând", text: "Sarcinile cu dată în următoarele 10 zile, colorate după urgență." },
      { title: "Toate", text: "Apasă „Ordonează” și trage de ☰ ca să le pui în ordinea ta. „Gata” când ai terminat." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să rezolvi, spre stânga ca să ștergi." },
      { title: "Cumpărare", text: "O sarcină marcată „cumpărare” îți cere suma când o rezolvi. Suma intră în cheltuieli." },
      { title: "Recurentă", text: "După ce o rezolvi, alegi când e data următoare." },
    ],
  },
  "home.taskForm": {
    title: "Sarcină",
    points: [
      { title: "Data", text: "Opțională. Fără dată, sarcina nu apare la „De făcut” sau în Calendar." },
      { title: "E o cumpărare", text: "La rezolvare te întrebăm cât ai plătit. Suma intră în cheltuielile lunii." },
      { title: "Se repetă", text: "După rezolvare, sarcina revine la următoarea dată." },
    ],
  },
  "home.category.expenses": {
    title: "Cheltuieli casă",
    points: [
      { text: "Cheltuieli punctuale pentru casă: reparații, mobilă, electrocasnice. Intră în cheltuielile lunii la data lor." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre stânga ca să ștergi." },
    ],
  },
  "home.category.maintenance": {
    title: "Mentenanță",
    points: [
      { text: "Lucrări la casă, făcute sau programate: revizia centralei, curățenie, schimbat filtre." },
      { title: "Recurentă", text: "Revine la intervalul ales. Când o marchezi făcută, costul de atunci intră la Cheltuit și se programează următoarea." },
      { text: "Nu o scădem din buget din timp, cum facem cu facturile." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să rezolvi, spre stânga ca să ștergi." },
    ],
  },
  "home.category.recurring": {
    title: "Facturi",
    points: [
      { text: "Facturi și abonamente care se repetă: internet, întreținere, curent." },
      { title: "În buget", text: "Le scădem din buget din timp, socotite pe lună, ca „de plătit”." },
      { title: "Restantă", text: "O factură rămâne pe data ei până o rezolvi. Când o plătești, data trece la următoarea." },
      { title: "Plătești mai devreme?", text: "Alegi dacă următoarea scadență se socotește de azi sau păstrează programul." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să rezolvi, spre stânga ca să ștergi." },
    ],
  },
  "home.category.documents": {
    title: "Documente casă",
    points: [
      { text: "Contracte, garanții, asigurări. Data emiterii și cea a expirării sunt obligatorii." },
      { text: "Apar la „De rezolvat” cu 7 zile înainte de expirare; la Categorii vezi câte expiră în 45 de zile. Reînnoirea mută valabilitatea cu aceeași durată." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta ca să reînnoiești, spre stânga ca să ștergi." },
    ],
  },
  "home.supplies": {
    title: "Provizii",
    points: [
      { title: "Estimare", text: "După a doua cumpărare a aceluiași produs estimăm când se termină, din ritmul și cantitatea cumpărată." },
      { title: "Pe terminate", text: "Apar și în Cumpărături, ca sugestii, și pe Acasă." },
      { title: "Am cumpărat", text: "Spune cât ai luat. Fiecare cumpărare face estimarea mai bună. Și „Gata cumpărăturile” din Cumpărături le actualizează." },
      { title: "Gesturi", text: "Atinge un rând ca să vezi detaliile. Ține apăsat pentru acțiuni rapide. Glisează spre dreapta când cumperi din nou („Am cumpărat”), spre stânga ca să ștergi." },
    ],
  },
  "home.supplyForm": {
    title: "Provizie",
    points: [{ text: "Un produs pe care îl ții în casă. Cantitatea și unitatea ajută la estimarea momentului în care se termină." }],
  },
  "home.archive": {
    title: "Istoric",
    points: [{ text: "Tot ce ai rezolvat în Casă: sarcini, facturi plătite, lucrări făcute, cel mai recent primul." }],
  },
  "home.spend": {
    title: "Cheltuieli casă",
    points: [
      { text: "Tot ce a costat casa: cheltuieli, lucrări de mentenanță, sarcini-cumpărare și facturi plătite." },
      { text: "Fiecare plată a unei facturi sau lucrări recurente apare separat, cu data ei." },
    ],
  },
  "home.resolve": {
    title: "Rezolvare",
    points: [
      { text: "Marchezi lucrul ca rezolvat. Suma de data asta intră la Cheltuit." },
      { text: "Dacă se repetă, alegi când e următoarea dată. Altfel trece în Istoric." },
    ],
  },
  "home.profile": {
    title: "Profilul casei",
    points: [
      { text: "Numele și detaliile locuinței apar sus, sub numele spațiului." },
      { title: "Culoarea spațiului", text: "Alege o culoare pentru spațiu: pagina lui, butoanele și rândurile lui din Acasă, Spații și Calendar o folosesc. Bugetul păstrează culorile pe tipuri." },
      { title: "În rate", text: "La o casă nouă cumpărată, bifează „În rate” dacă e pe credit. Rata lunară se trece în Cheltuieli, la Credite (dacă nu ai un spațiu Cheltuieli, îl creăm, cu numele „Default”). Creditul îl modifici apoi din Cheltuieli › Credite." },
    ],
  },

  /* ---------------- Cumpărături ---------------- */
  "grocery.space": {
    title: "Cumpărături",
    points: [
      { title: "Liste", text: "Câte vrei: săptămânală, pentru o ieșire, pentru un eveniment. Alege lista sus." },
      { title: "Coș", text: "Bifează sau glisează spre dreapta un produs când îl pui în coș." },
      { title: "Gata cumpărăturile", text: "Golește coșul (produsele rămân pe listă, nebifate). Opțional, spui cât ai plătit și suma intră în buget." },
      { title: "Sugestii", text: "Proviziile din Casă care se termină îți apar ca sugestii de pus pe listă." },
      { title: "Partajare", text: "O listă partajată o vede și o editează și celălalt. Pe produse apare cine le-a adăugat." },
    ],
  },
  "grocery.list": {
    title: "Editare produse",
    points: [
      { title: "Editează", text: "Ține apăsat pe un produs: nume, cantitate, preț, categorie." },
      { title: "Șterge", text: "Glisează produsul spre stânga." },
    ],
  },
  "grocery.finish": {
    title: "Gata cumpărăturile",
    points: [
      { text: "Produsele din coș se debifează și rămân pe listă, gata pentru data viitoare." },
      { title: "Total plătit", text: "Opțional. Dacă îl scrii, apare ca o cheltuială la Cumpărături în bugetul lunii." },
      { title: "Provizii", text: "Produsele adăugate din sugestiile Casei înregistrează o cumpărare la provizia lor, cu cantitatea de pe listă." },
    ],
  },
  "grocery.newList": {
    title: "Listă nouă",
    points: [{ text: "Fiecare listă își are produsele ei. O poți partaja separat cu cine vrei." }],
  },
  "grocery.product": {
    title: "Produs",
    points: [
      { text: "Categoria se alege automat după nume, dacă îl recunoaștem. O poți schimba." },
      { text: "Cantitatea e opțională: „2 buc.”, „1 kg”." },
    ],
  },
  "grocery.suggestions": {
    title: "Probabil pe terminate",
    points: [{ text: "Proviziile din Casă care după ritmul tău de cumpărare se termină curând. Adaugă-le pe listă cu o atingere." }],
  },
  "grocery.recipes": {
    title: "Rețete",
    points: [
      { text: "Alege o rețetă și vezi ce ingrediente ai deja pe listă și ce lipsește." },
      { title: "Pune pe listă", text: "Adaugă ce lipsește pe lista aleasă, cu o atingere." },
      { title: "Filtre", text: "Restrâng rețetele după bucătărie și tipul mesei." },
    ],
  },
  "grocery.members": {
    title: "Cine vede lista",
    points: [
      { text: "Adaugă pe cineva după adresa de email cu care și-a făcut cont în orgOS. Persoana vede și editează lista." },
      { text: "Când scoți pe cineva, alegi ce se întâmplă cu produsele adăugate de el." },
    ],
  },

  /* ---------------- Cheltuieli ---------------- */
  "expenses.space": {
    title: "Cheltuieli",
    points: [
      { text: "Orice cheltuială care nu ține de mașină, casă sau cumpărături: haine, ieșiri, cadouri." },
      { title: "Adaugă rapid", text: "Scrie ce ai cumpărat și prețul, apoi apasă „+”. Data e azi, dacă n-o schimbi." },
      { text: "Totalul lunii intră în buget, la Cheltuieli." },
      { title: "Din Calendar", text: "Evenimentele care implică o cumpărare apar și aici. Până în ziua lor sunt „planificat” și nu intră în total; din ziua lor intră. Le modifici din Calendar: atinge rândul ca să ajungi la ziua lui." },
      { title: "Lista", text: "Pe pagina asta vezi doar cheltuielile lunii în curs. Cele din lunile trecute rămân salvate." },
      { title: "Graficul", text: "Ultimele 6 luni; în stânga, sumele în lei. Atinge o lună trecută ca să-i vezi cheltuielile. Atinge-o din nou (sau „Doar …” de deasupra listei) ca să revii la luna curentă. Toate, pe orice perioadă, sunt în Detalii." },
      { title: "Glisează pe un rând", text: "Spre stânga ca să ștergi (nu și pe cele din Calendar)." },
    ],
  },
  "expenses.credits": {
    title: "Credite",
    points: [
      { text: "Creditele și leasingurile tale: nume, rata lunară, ziua plății și ultima rată." },
      { title: "Nu sunt cheltuieli", text: "Ratele nu intră în totalul Cheltuielilor. În Buget intră în ce ai de cheltuit, ca facturile, așa că o lună cu rate prea mari scade și Economiile." },
      { title: "Memento", text: "În ziua plății, rata apare în Calendar și la De făcut, doar ca să-ți amintească. Nu trebuie bifată." },
      { title: "Arată-l și în spațiul", text: "Poți lega un credit de Mașină sau Casă; apare acolo doar ca informație." },
      { title: "Încheiate", text: "După ultima rată, creditul trece la Încheiate și nu mai contează." },
    ],
  },
  "expenses.edit": {
    title: "Cheltuială",
    points: [
      { text: "Doar numele și suma sunt obligatorii. Data contează: cheltuiala intră în luna ei." },
    ],
  },

  /* ---------------- Spațiu nou / editat ---------------- */
  "space.edit": {
    title: "Spațiu",
    points: [
      { text: "Tipul spațiului (Mașină, Casă, Cumpărături, Cheltuieli) nu se mai poate schimba după creare." },
      { text: "Culoarea spațiului se vede peste tot unde apare spațiul: în pagina lui, pe Spații, Acasă și în Calendar. Bugetul păstrează culorile pe tipuri." },
      { text: "Ștergerea unui spațiu șterge și tot ce conține." },
    ],
  },
} satisfies Record<string, HelpTopic>;

export type HelpKey = keyof typeof HELP;

// Set by the one <HelpHost /> mounted at the app root (components/ui/
// HelpHost.tsx) -- module-level, like ConfirmHost's, so InfoButton (in
// primitives, which Sheet itself imports) can open it without an import
// cycle back through Sheet.
let helpHandler: ((key: HelpKey) => void) | null = null;

export function setHelpHandler(handler: ((key: HelpKey) => void) | null): void {
  helpHandler = handler;
}

export function showHelp(key: HelpKey): void {
  helpHandler?.(key);
}

/* Whether the help sheet is open -- lib/useAutoTour.ts waits for it to
 * close before starting a tour (never two Modals at once on iOS). Set by
 * HelpHost. */
let helpOpen = false;
const helpListeners = new Set<() => void>();
export function setHelpOpen(open: boolean): void {
  if (helpOpen === open) return;
  helpOpen = open;
  helpListeners.forEach((l) => l());
}
export function isHelpOpen(): boolean {
  return helpOpen;
}
export function subscribeHelp(listener: () => void): () => void {
  helpListeners.add(listener);
  return () => {
    helpListeners.delete(listener);
  };
}
