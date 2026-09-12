rares@test.local
password123


user2@test.local
password123



users
────────────────────────────
id -> UUID , Unique
name -> VARCHAR(50)
email -> VARCHAR(50) , Unique , NOT NULL
password -> VARCHAR(255) NOT NULL
created_at -> timestamp
updated_at -> timestamp

Se foloseste UUID pentru id, nu AUTO_INCREMENT.

----------------------------------------------------------------------


roles
────────────────────────────
id -> bigint , auto-increment
name -> varchar(50)
slug -> varchar(50) , Unique , Not Null
description -> text
created_at -> timestamp
updated_at -> timestamp

Și punem UNIQUE pe slug

Exemplu:
    Owner
    Admin
    User
    Manager

----------------------------------------------------------------------

permissions
────────────────────────────
id -> bigint , auto-increment
name -> varchar(50)
slug -> varchar(50) , Unique , Not Null
description -> text
created_at -> timestamp
updated_at -> timestamp

Din nou, slug trebuie să fie UNIQUE.

Exemplu:
    items.view
    items.create
    items.update
    items.delete

spaces.view
spaces.create
spaces.update
spaces.delete

users.view
users.update

settings.view
settings.update

----------------------------------------------------------------------

user_roles
────────────────────────────
user_id
role_id
created_at

Un user poate avea mai multe roluri.

Exemplu:
    Rares
     ├── owner
     └── admin


----------------------------------------------------------------------


role_permissions
────────────────────────────
role_id
permission_id
created_at

Exemplu:
    admin
     ├── items.view
     ├── items.create
     ├── items.update
     ├── items.delete
     ├── spaces.view
     └── spaces.update


----------------------------------------------------------------------

spaces
────────────────────────────
id -> bigint , auto-increment, Primary Key
user_id -> bigint , not null , Foreign Key -> users.id
name -> varchar(100) , not null
description -> text , not null
icon -> varchar(50) , not null
color -> varchar(20) , not null
created_at
updated_at

Exemplu:
    Personal
    Work
    Finance
    Projects
    Family



---------------------------------------------------------------------

items
────────────────────────────────
id
user_id
space_id

type
title
notes
status
priority

due_at
completed_at

amount
currency

category
priority
recurrence

created_at
updated_at


type:
    task
    note
    expense
    event
    reminder

Exemplu:
    user
    ↓
    space: Finance
    ↓
    item:
        type = expense
        title = Car insurance
        amount = 450
        currency = EUR

________________________________________________________

Aș adăuga status

Cred că merită să-l avem de la început.

status

Pentru că ulterior vei avea:

pending
in_progress
completed
cancelled
archived

În loc să folosim doar:

completed_at

putem avea ambele:

status
completed_at

Asta ne oferă mai multă flexibilitate.



________________________________________________________



priority

Tot în items:

priority

Exemplu:

low
medium
high
urgent


________________________________________________________


Un detaliu foarte important: ștergerea datelor

Trebuie să stabilim de la început relațiile cu:

ON DELETE CASCADE

De exemplu:

user
 ↓
spaces
 ↓
items

Dacă ștergi userul, nu vrei să rămână:

spaces orfane
items orfane

Deci:

users
  ↓ CASCADE
spaces
  ↓ CASCADE
items

La user_roles:

users → user_roles ← roles

ștergerea userului ar trebui să elimine automat relațiile lui din user_roles.

La fel pentru role_permissions.


________________________________________________________



1. UUID vs bigint — aș decide acum

Eu recomand:

UUID

pentru entitățile principale:

users.id
spaces.id
items.id
roles.id
permissions.id

Iar pentru tabelele pivot:

user_roles
role_permissions

putem folosi cheile UUID respective.

Motivul principal nu este doar securitatea. Pentru o aplicație mobilă + API, UUID-urile sunt foarte potrivite și nu depind de secvențe locale.

2. items merită cea mai multă atenție

Aici va sta probabil cea mai mare parte din datele LifeOS.

Aș evita să tratăm toate tipurile identic.

De exemplu:

type = expense

are sens să aibă:

amount
currency

în timp ce:

type = note

nu are nevoie de ele.

Totuși, nu aș separa încă în 5 tabele.

Aș păstra:

items

și aș defini foarte clar ce câmpuri sunt obligatorii în funcție de type.

3. metadata trebuie gândit bine

Aici este unul dintre locurile unde putem face o greșeală de arhitectură.

Nu vreau să ajungem la:

{
  "title": "...",
  "amount": 500,
  "whatever": "...",
  "anotherThing": "...",
  "randomField": "..."
}

și apoi toată aplicația să depindă de JSON.

Aș folosi metadata doar pentru date secundare/extensibile.

Datele importante pentru căutare, sortare, filtrare sau relații trebuie să fie coloane reale:

type
title
status
priority
due_at
amount
currency
category
space_id

În schimb, metadata poate păstra lucruri precum:

{
  "location": "Baia Mare",
  "merchant": "OMV",
  "duration_minutes": 60
}

Asta ne permite să extindem aplicația fără să modificăm schema pentru fiecare mică funcționalitate.

4. Foreign keys + cascade trebuie stabilite atent

De exemplu:

users
  │
  └── spaces
        │
        └── items

Eu aș vrea:

user șters
   ↓
spaces șterse
   ↓
items șterse

dar nu aș aplica CASCADE peste tot automat.

De exemplu:

roles
permissions

sunt date de sistem și nu ar trebui să dispară pentru că un user a fost șters.

Deci:

users → user_roles       CASCADE
roles → user_roles       CASCADE
roles → role_permissions CASCADE
permissions → role_permissions CASCADE

dar:

users → roles

nu există direct.

5. Roles + permissions trebuie proiectate acum

Aici aș merge pe ceva mai serios decât:

admin
user

Aș avea inițial:

Roles
owner
admin
user
Permissions

De exemplu:

users.view
users.create
users.update
users.delete

spaces.view
spaces.create
spaces.update
spaces.delete

items.view
items.create
items.update
items.delete

settings.view
settings.update

Dar există o întrebare arhitecturală importantă:

permission-urile sunt globale sau pot fi limitate la un Space?

De exemplu:

User A
 └── Work Space
       └── poate modifica items

dar:

User A
 └── Personal Space
       └── nu poate modifica items

Dacă vrei ca LifeOS să devină eventual colaborativ — adică să poți invita alte persoane într-un Space — atunci schema trebuie gândită puțin diferit acum.

Aș mai adăuga o decizie la lista ta
12. Ownership / colaborare

Momentan ai:

users
   ↓
spaces
   ↓
items

Asta presupune:

un Space aparține unui singur user.

Dar dacă în viitor vrei:

Work Space
 ├── Rares — owner
 ├── Andrei — editor
 └── Maria — viewer

atunci ar fi mai bine să avem:

users
   ↓
spaces
   ↓
space_members
   ↓
roles

și atunci rolurile pot fi aplicate la nivel de Space.

Asta este o decizie arhitecturală mult mai importantă decât pare.