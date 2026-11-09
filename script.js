
// ============================================
// PHYSICS – GRA EDUKACYJNA Z FIZYKI
// ============================================

// SUPABASE
const SUPABASE_URL = "https://uxfcsizgwsqpxqcrwajk.supabase.co";
const SUPABASE_KEY = "sb_publishable__xHc6XOFGvWBPsfN2TuyAQ_ZxWINXw5";

let db = null;
let channel = null;

if (window.supabase) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ============================================
// BAZA PYTAŃ – 10 ODDZIELNYCH TEMATÓW
// ============================================

const topicQuestions = {

    pomiary: [
        ["Jaka jest podstawowa jednostka długości w SI?", ["Centymetr", "Metr", "Kilometr", "Milimetr"], 1, "Podstawową jednostką długości w SI jest metr (m)."],
        ["Jaką jednostką mierzymy masę?", ["Kilogram", "Litr", "Metr", "Sekunda"], 0, "Podstawową jednostką masy jest kilogram (kg)."],
        ["Ile sekund ma jedna minuta?", ["10", "60", "100", "360"], 1, "Jedna minuta ma 60 sekund."],
        ["Jaka jest jednostka temperatury w SI?", ["Stopień Celsjusza", "Kelwin", "Dżul", "Wat"], 1, "Jednostką temperatury w SI jest kelwin (K)."],
        ["Ile centymetrów ma jeden metr?", ["10", "100", "1000", "50"], 1, "Jeden metr to 100 centymetrów."],
        ["Czym mierzymy temperaturę?", ["Wagą", "Termometrem", "Linijką", "Siłomierzem"], 1, "Temperaturę mierzymy termometrem."],
        ["Jaka jest jednostka objętości w SI?", ["m²", "m³", "kg", "N"], 1, "Jednostką objętości w SI jest metr sześcienny."],
        ["Ile gramów ma kilogram?", ["10", "100", "1000", "10000"], 2, "1 kg = 1000 g."],
        ["Do czego służy siłomierz?", ["Do mierzenia masy", "Do mierzenia siły", "Do mierzenia czasu", "Do mierzenia temperatury"], 1, "Siłomierz mierzy wartość siły."],
        ["Co przedstawia wykres zależności drogi od czasu?", ["Zmianę temperatury", "Przebytą drogę w czasie", "Zmianę masy", "Wartość ciśnienia"], 1, "Wykres s(t) pokazuje, jak zmienia się droga wraz z upływem czasu."]
    ],

    materia: [
        ["Z czego zbudowana jest materia?", ["Z atomów i cząsteczek", "Wyłącznie z wody", "Z samego powietrza", "Z energii świetlnej"], 0, "Materia jest zbudowana z atomów i cząsteczek."],
        ["Jaki stan skupienia ma określony kształt?", ["Gaz", "Ciecz", "Ciało stałe", "Para"], 2, "Ciało stałe ma własny kształt i objętość."],
        ["Jak zachowuje się ciecz w naczyniu?", ["Zachowuje własny kształt", "Przyjmuje kształt naczynia", "Zawsze zamienia się w gaz", "Nie ma objętości"], 1, "Ciecz przyjmuje kształt naczynia, ale zachowuje swoją objętość."],
        ["Co to jest gęstość?", ["Masa przypadająca na jednostkę objętości", "Droga podzielona przez czas", "Siła razy droga", "Temperatura ciała"], 0, "Gęstość obliczamy ze wzoru d = m/V."],
        ["Jaka jest jednostka gęstości w SI?", ["kg/m³", "N", "J", "W"], 0, "Jednostką gęstości w SI jest kg/m³."],
        ["Co dzieje się z większością ciał podczas ogrzewania?", ["Kurczą się", "Rozszerzają się", "Znikają", "Zmniejszają masę do zera"], 1, "Większość substancji rozszerza się podczas ogrzewania."],
        ["Jak nazywa się przejście ze stanu stałego w ciekły?", ["Parowanie", "Skraplanie", "Topnienie", "Krzepnięcie"], 2, "Topnienie to przejście ze stanu stałego w ciekły."],
        ["Jak nazywa się przejście z cieczy w gaz?", ["Parowanie", "Krzepnięcie", "Topnienie", "Resublimacja"], 0, "Parowanie to przejście cieczy w gaz."],
        ["Co jest przykładem gazu?", ["Lód", "Para wodna", "Sól", "Miedź"], 1, "Para wodna jest substancją w stanie gazowym."],
        ["Co oznacza pojęcie dyfuzji?", ["Mieszanie się cząsteczek różnych substancji", "Zamarzanie wody", "Zmianę masy", "Odbicie światła"], 0, "Dyfuzja to samorzutne mieszanie się cząsteczek."]
    ],

    cisnienie: [
        ["Jak obliczamy ciśnienie?", ["p = F/S", "p = m/v", "p = W/t", "p = F · s"], 0, "Ciśnienie obliczamy, dzieląc siłę nacisku przez powierzchnię."],
        ["Jaka jest jednostka ciśnienia?", ["Wat", "Pascal", "Dżul", "Niuton"], 1, "Jednostką ciśnienia jest paskal (Pa)."],
        ["Co stanie się z ciśnieniem, gdy powierzchnia nacisku zmaleje, a siła pozostanie taka sama?", ["Wzrośnie", "Zmaleje", "Nie zmieni się", "Zniknie"], 0, "Mniejsza powierzchnia przy tej samej sile oznacza większe ciśnienie."],
        ["Co to jest ciśnienie hydrostatyczne?", ["Ciśnienie cieczy wynikające z jej ciężaru", "Ciśnienie światła", "Ciśnienie gazu w oponie", "Siła tarcia"], 0, "Ciśnienie hydrostatyczne rośnie wraz z głębokością."],
        ["Co mówi prawo Pascala?", ["Ciśnienie wywierane na ciecz rozchodzi się we wszystkich kierunkach", "Ciała zawsze spadają", "Energia znika", "Światło się odbija"], 0, "Zmiana ciśnienia w zamkniętej cieczy przekazywana jest do całej cieczy."],
        ["Dlaczego statek może pływać?", ["Dzięki sile wyporu", "Dzięki sile magnetycznej", "Dzięki tarciu o wodę", "Dzięki sile elektrycznej"], 0, "Na statek działa siła wyporu skierowana ku górze."],
        ["Jak skierowana jest siła wyporu?", ["W dół", "W górę", "Poziomo", "Zawsze ukośnie"], 1, "Siła wyporu działa pionowo ku górze."],
        ["Od czego zależy ciśnienie hydrostatyczne?", ["Od głębokości i gęstości cieczy", "Od koloru cieczy", "Od kształtu naczynia", "Od oświetlenia"], 0, "Ciśnienie hydrostatyczne zależy od gęstości cieczy, grawitacji i głębokości."],
        ["Jak nazywa się urządzenie wykorzystujące prawo Pascala?", ["Prasa hydrauliczna", "Termometr", "Amperomierz", "Kompas"], 0, "Prasa hydrauliczna wykorzystuje przekazywanie ciśnienia w cieczy."],
        ["Kiedy ciało może tonąć w cieczy?", ["Gdy jego średnia gęstość jest większa od gęstości cieczy", "Gdy jest oświetlone", "Gdy ma jasny kolor", "Gdy jest zimne"], 0, "Ciało o większej gęstości od cieczy może tonąć."]
    ],

    ruch: [
        ["Czym jest prędkość?", ["Stosunkiem drogi do czasu", "Iloczynem masy i czasu", "Siłą działającą na ciało", "Objętością ciała"], 0, "Prędkość obliczamy ze wzoru v = s/t."],
        ["Jaka jest jednostka prędkości w SI?", ["m/s", "kg", "N", "J"], 0, "Jednostką prędkości w SI jest metr na sekundę."],
        ["Ile wynosi 36 km/h w m/s?", ["5 m/s", "10 m/s", "20 m/s", "36 m/s"], 1, "36 km/h = 10 m/s."],
        ["Co to jest ruch jednostajny?", ["Ruch ze stałą prędkością", "Ruch ze stale rosnącą masą", "Ruch bez drogi", "Ruch tylko po okręgu"], 0, "W ruchu jednostajnym prędkość pozostaje stała."],
        ["Jak obliczyć drogę w ruchu jednostajnym?", ["s = v · t", "s = v/t", "s = m · g", "s = F/t"], 0, "Drogę obliczamy, mnożąc prędkość przez czas."],
        ["Samochód jedzie 20 m/s przez 5 s. Jaką drogę pokona?", ["4 m", "25 m", "100 m", "200 m"], 2, "s = 20 · 5 = 100 m."],
        ["Co to jest przyspieszenie?", ["Zmiana prędkości w czasie", "Zmiana koloru", "Masa podzielona przez objętość", "Droga pomnożona przez czas"], 0, "Przyspieszenie opisuje zmianę prędkości w czasie."],
        ["Co oznacza ruch opóźniony?", ["Prędkość maleje", "Prędkość rośnie", "Ciało zawsze stoi", "Masa maleje"], 0, "W ruchu opóźnionym wartość prędkości maleje."],
        ["Czym jest układ odniesienia?", ["Obiektem, względem którego opisujemy ruch", "Jednostką czasu", "Przyrządem do mierzenia masy", "Rodzajem siły"], 0, "Ruch opisujemy względem wybranego układu odniesienia."],
        ["Czy pasażer siedzący w jadącym autobusie jest w ruchu?", ["Względem autobusu nie, względem drogi tak", "Zawsze stoi", "Zawsze porusza się względem autobusu", "Nie można tego określić"], 0, "Opis ruchu zależy od przyjętego układu odniesienia."]
    ],

    sily: [
        ["Jaka jest jednostka siły?", ["Niuton", "Dżul", "Wat", "Pascal"], 0, "Jednostką siły jest niuton (N)."],
        ["Czym mierzymy siłę?", ["Siłomierzem", "Termometrem", "Linijką", "Stoperem"], 0, "Siłę mierzymy siłomierzem."],
        ["Co jest skutkiem działania siły?", ["Zmiana ruchu lub odkształcenie ciała", "Zawsze zmiana koloru", "Zniknięcie masy", "Zmiana jednostki czasu"], 0, "Siła może zmienić ruch lub kształt ciała."],
        ["Co to jest siła wypadkowa?", ["Suma wektorowa wszystkich sił", "Najmniejsza siła", "Masa ciała", "Prędkość ciała"], 0, "Siła wypadkowa jest wynikiem złożenia wszystkich działających sił."],
        ["Ile wynosi siła wypadkowa dwóch sił 5 N i 3 N działających w tę samą stronę?", ["2 N", "8 N", "15 N", "0 N"], 1, "Siły o tym samym kierunku i zwrocie dodajemy: 5 + 3 = 8 N."],
        ["Jak nazywa się siła przyciągająca ciała do Ziemi?", ["Siła ciężkości", "Siła sprężystości", "Siła magnetyczna", "Siła elektryczna"], 0, "Ziemia przyciąga ciała siłą grawitacji."],
        ["Co mówi pierwsza zasada dynamiki Newtona?", ["Ciało zachowuje spoczynek lub ruch jednostajny prostoliniowy, gdy siła wypadkowa jest zerowa", "Każda siła znika", "Prędkość zawsze rośnie", "Masa jest równa zeru"], 0, "To zasada bezwładności."],
        ["Co mówi druga zasada dynamiki Newtona?", ["F = m · a", "W = F · s", "P = W/t", "v = s/t"], 0, "Przyspieszenie zależy od siły wypadkowej i masy ciała."],
        ["Co mówi trzecia zasada dynamiki Newtona?", ["Akcji towarzyszy reakcja", "Energia zawsze znika", "Ciała nie oddziałują", "Prędkość jest stała"], 0, "Siły wzajemnego oddziaływania mają równe wartości i przeciwne zwroty."],
        ["Czym jest tarcie?", ["Siłą przeciwdziałającą względnemu ruchowi powierzchni", "Rodzajem energii", "Jednostką masy", "Rodzajem temperatury"], 0, "Tarcie przeciwdziała ruchowi lub próbie ruchu stykających się powierzchni."]
    ],

    praca_moc: [
        ["Czym jest praca mechaniczna?", ["Iloczynem siły i przesunięcia w kierunku siły", "Iloczynem masy i prędkości", "Ilorazem drogi i czasu", "Sumą siły i masy"], 0, "Praca mechaniczna: W = F · s."],
        ["Jaka jest jednostka pracy?", ["Wat", "Dżul", "Niuton", "Metr"], 1, "Jednostką pracy jest dżul (J)."],
        ["Jakim symbolem oznaczamy pracę?", ["P", "F", "W", "t"], 2, "Pracę oznaczamy literą W."],
        ["Uczeń przesuwa skrzynię siłą 20 N na odległość 3 m. Jaką wykonuje pracę?", ["23 J", "60 J", "6 J", "17 J"], 1, "W = 20 · 3 = 60 J."],
        ["Czym jest moc?", ["Pracą wykonaną w jednostce czasu", "Siłą działającą na ciało", "Długością drogi", "Masą ciała"], 0, "Moc informuje, jak szybko wykonywana jest praca."],
        ["Jaka jest jednostka mocy?", ["Dżul", "Niuton", "Wat", "Sekunda"], 2, "Jednostką mocy jest wat (W)."],
        ["Jak obliczamy moc?", ["P = W · t", "P = W / t", "P = F · t", "P = s / t"], 1, "Moc obliczamy ze wzoru P = W/t."],
        ["Silnik wykonał pracę 600 J w czasie 10 s. Jaka była jego moc?", ["60 W", "6000 W", "610 W", "6 W"], 0, "P = 600/10 = 60 W."],
        ["Ile dżuli ma jeden kilodżul?", ["10 J", "100 J", "1000 J", "10000 J"], 2, "1 kJ = 1000 J."],
        ["Dwie maszyny wykonują taką samą pracę. Która ma większą moc?", ["Ta, która pracuje krócej", "Ta, która pracuje dłużej", "Obie zawsze taką samą", "Nie można określić"], 0, "Większą moc ma maszyna wykonująca tę samą pracę w krótszym czasie."]
    ],

    energia: [
        ["Czym jest energia?", ["Zdolnością do wykonania pracy", "Jednostką czasu", "Rodzajem siły", "Prędkością ciała"], 0, "Energia jest zdolnością układu do wykonania pracy."],
        ["Jaka jest jednostka energii?", ["Wat", "Dżul", "Niuton", "Pascal"], 1, "Jednostką energii jest dżul."],
        ["Od czego zależy energia kinetyczna?", ["Od masy i prędkości ciała", "Tylko od temperatury", "Tylko od wysokości", "Od koloru"], 0, "Energia kinetyczna zależy od masy i kwadratu prędkości."],
        ["Jaki jest wzór na energię kinetyczną?", ["E = mgh", "E = mv²/2", "E = F · s", "E = P · t²"], 1, "Ek = mv²/2."],
        ["Czym jest energia potencjalna grawitacji?", ["Energią związaną z położeniem ciała", "Energią dźwięku", "Energią elektryczną", "Energią światła"], 0, "Energia potencjalna grawitacji zależy od wysokości."],
        ["Jaki jest wzór na energię potencjalną grawitacji?", ["Ep = mgh", "Ep = F/s", "Ep = m/v", "Ep = P/t"], 0, "Ep = m · g · h."],
        ["Co dzieje się z energią kinetyczną spadającego ciała?", ["Zwiększa się", "Zmniejsza się", "Zawsze wynosi zero", "Nie zmienia się"], 0, "Podczas spadania prędkość rośnie, więc rośnie energia kinetyczna."],
        ["Ile dżuli ma 1 kJ?", ["10 J", "100 J", "1000 J", "10000 J"], 2, "1 kJ = 1000 J."],
        ["Co oznacza zasada zachowania energii?", ["Energia zawsze znika", "Energia nie powstaje ani nie ginie, tylko się przemienia", "Energia zawsze rośnie", "Energia jest zerowa"], 1, "Całkowita energia układu izolowanego pozostaje stała."],
        ["Na jaką energię zamienia się energia potencjalna podczas spadania?", ["Kinetyczną", "Chemiczną", "Jądrową", "Dźwiękową"], 0, "Podczas spadania energia potencjalna zamienia się w kinetyczną."]
    ],

    cieplo: [
        ["Czym jest temperatura?", ["Wielkością opisującą stan cieplny ciała", "Jednostką siły", "Rodzajem pracy", "Prędkością ciała w metrach"], 0, "Temperatura opisuje stan cieplny ciała."],
        ["W którą stronę przepływa ciepło?", ["Od ciała cieplejszego do chłodniejszego", "Od zimnego do ciepłego samoistnie", "Zawsze w dół", "Nie przepływa"], 0, "Ciepło samorzutnie przepływa od wyższej temperatury do niższej."],
        ["Jak nazywa się przekazywanie ciepła przez bezpośredni kontakt?", ["Przewodnictwo", "Konwekcja", "Promieniowanie", "Parowanie"], 0, "Przewodnictwo zachodzi dzięki przekazywaniu energii między cząsteczkami."],
        ["Czym jest konwekcja?", ["Przenoszeniem ciepła przez ruch cieczy lub gazu", "Odbiciem światła", "Przepływem prądu", "Zmianą masy"], 0, "Konwekcja polega na przenoszeniu energii wraz z ruchem płynu."],
        ["Jak nazywa się przekazywanie energii cieplnej przez fale elektromagnetyczne?", ["Promieniowanie", "Tarcie", "Topnienie", "Skraplanie"], 0, "Promieniowanie cieplne nie wymaga ośrodka materialnego."],
        ["W jakiej temperaturze wrze woda przy ciśnieniu atmosferycznym?", ["0°C", "50°C", "100°C", "200°C"], 2, "Woda wrze w temperaturze około 100°C przy ciśnieniu normalnym."],
        ["Co dzieje się z energią wewnętrzną podczas ogrzewania?", ["Zwykle rośnie", "Zawsze znika", "Zawsze maleje", "Pozostaje zerowa"], 0, "Ogrzewanie zazwyczaj zwiększa energię wewnętrzną ciała."],
        ["Jak nazywa się przejście gazu w ciecz?", ["Skraplanie", "Parowanie", "Topnienie", "Sublimacja"], 0, "Skraplanie to przejście ze stanu gazowego w ciekły."],
        ["Który materiał jest dobrym przewodnikiem ciepła?", ["Miedź", "Drewno", "Styropian", "Wełna"], 0, "Miedź jest dobrym przewodnikiem ciepła."],
        ["Co jest dobrym izolatorem cieplnym?", ["Styropian", "Miedź", "Aluminium", "Żelazo"], 0, "Styropian słabo przewodzi ciepło."]
    ],

    elektrycznosc: [
        ["Jaka jest jednostka natężenia prądu?", ["Wolt", "Amper", "Om", "Wat"], 1, "Natężenie prądu mierzymy w amperach (A)."],
        ["Jaka jest jednostka napięcia?", ["Amper", "Wolt", "Om", "Dżul"], 1, "Napięcie mierzymy w woltach (V)."],
        ["Czym mierzymy natężenie prądu?", ["Woltomierzem", "Amperomierzem", "Termometrem", "Siłomierzem"], 1, "Amperomierz mierzy natężenie prądu."],
        ["Jak podłączamy amperomierz?", ["Szeregowo", "Równolegle", "Nie podłączamy go do obwodu", "Do obudowy"], 0, "Amperomierz włączamy szeregowo."],
        ["Jak podłączamy woltomierz?", ["Szeregowo", "Równolegle", "Zamiast źródła", "Do bezpiecznika"], 1, "Woltomierz podłączamy równolegle do badanego elementu."],
        ["Co oznacza symbol R?", ["Rezystancję", "Natężenie", "Napięcie", "Moc"], 0, "R oznacza opór elektryczny."],
        ["Jaka jest jednostka oporu elektrycznego?", ["Om", "Wolt", "Amper", "Wat"], 0, "Jednostką oporu jest om (Ω)."],
        ["Co mówi prawo Ohma?", ["U = I · R", "P = W/t", "F = m · a", "v = s/t"], 0, "Prawo Ohma opisuje zależność napięcia, natężenia i oporu."],
        ["Co powstaje wokół przewodnika, przez który płynie prąd?", ["Pole magnetyczne", "Próżnia", "Tylko światło", "Grawitacja"], 0, "Prąd elektryczny wytwarza pole magnetyczne."],
        ["Jakie bieguny ma magnes?", ["Północny i południowy", "Dodatni i ujemny", "Ciepły i zimny", "Lewy i prawy"], 0, "Magnes ma biegun północny i południowy."]
    ],

    fale_optyka: [
        ["Czym jest amplituda drgań?", ["Maksymalnym wychyleniem od położenia równowagi", "Czasem jednego drgania", "Masą ciała", "Prędkością światła"], 0, "Amplituda to maksymalne wychylenie od położenia równowagi."],
        ["Czym jest okres drgań?", ["Czasem jednego pełnego drgania", "Liczbą drgań w sekundzie", "Długością fali", "Maksymalną prędkością"], 0, "Okres to czas wykonania jednego pełnego drgania."],
        ["Jaka jest jednostka częstotliwości?", ["Herc", "Dżul", "Wat", "Niuton"], 0, "Częstotliwość mierzymy w hercach (Hz)."],
        ["Czym jest dźwięk?", ["Falą mechaniczną", "Falą świetlną", "Prądem elektrycznym", "Pole magnetycznym"], 0, "Dźwięk jest falą mechaniczną i wymaga ośrodka."],
        ["Czy dźwięk rozchodzi się w próżni?", ["Tak", "Nie", "Tylko nocą", "Tylko przy wysokiej temperaturze"], 1, "Dźwięk wymaga ośrodka materialnego."],
        ["Jak nazywa się odbicie światła od powierzchni?", ["Odbicie", "Dyfuzja", "Konwekcja", "Parowanie"], 0, "Światło może odbijać się od powierzchni."],
        ["Jak nazywa się zmiana kierunku światła podczas przejścia do innego ośrodka?", ["Załamanie", "Topnienie", "Skraplanie", "Dyfuzja"], 0, "Załamanie światła następuje przy zmianie ośrodka."],
        ["Jakie soczewki skupiają promienie równoległe?", ["Wypukłe", "Wklęsłe", "Płaskie", "Nieprzezroczyste"], 0, "Soczewka skupiająca jest zwykle wypukła."],
        ["Co rozdziela światło białe na barwy?", ["Pryzmat", "Magnes", "Amperomierz", "Zwierciadło płaskie"], 0, "Pryzmat rozszczepia światło białe na barwy."],
        ["Jak nazywa się zjawisko powstawania echa?", ["Odbicie dźwięku", "Załamanie światła", "Topnienie", "Przewodnictwo"], 0, "Echo powstaje wskutek odbicia fal dźwiękowych."]
    ]
};


// ============================================
// PRZYGOTOWANIE PYTAŃ
// ============================================

const allQuestions = [];

for (const topic in topicQuestions) {
    topicQuestions[topic].forEach(item => {
        allQuestions.push({
            topic: topic,
            q: item[0],
            a: item[1],
            correct: item[2],
            explanation: item[3]
        });
    });
}


// ============================================
// ZMIENNE GRY
// ============================================

let role = "";
let roomCode = "";
let nickname = "";
let players = {};
let gameQuestions = [];
let currentQuestion = 0;
let questionDuration = 20;
let questionDeadline = 0;
let timerInterval = null;
let questionEnded = false;
let myAnswer = null;
let gameStarted = false;

const studentId = crypto.randomUUID();


// ============================================
// NAWIGACJA
// ============================================

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.add("hidden");
    });

    const screen = document.getElementById(id);

    if (screen) {
        screen.classList.remove("hidden");
    }
}

function projectorMode() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}


// ============================================
// WYSZUKIWARKA TEMATÓW
// ============================================

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function filterTopics() {

    const input = document.getElementById("topicSearch");
    if (!input) return;

    const search = normalizeText(input.value.trim());

    const topics = document.querySelectorAll(".topic-option");
    const headings = document.querySelectorAll(".topic-heading");

    topics.forEach(topic => {

        const searchableText = normalizeText(
            topic.innerText + " " + (topic.dataset.search || "")
        );

        topic.style.display =
            searchableText.includes(search) ? "flex" : "none";
    });

    headings.forEach(heading => {

        let next = heading.nextElementSibling;
        let visible = false;

        while (next && !next.classList.contains("topic-heading")) {

            if (
                next.classList.contains("topic-option") &&
                next.style.display !== "none"
            ) {
                visible = true;
            }

            next = next.nextElementSibling;
        }

        heading.style.display = visible ? "block" : "none";
    });
}

function updateSelectedTopicCount() {

    const selected = document.querySelectorAll(
        'input[name="topics"]:checked'
    ).length;

    const counter = document.getElementById("selectedTopicCount");

    if (counter) {
        counter.textContent = selected;
    }
}

document.addEventListener("change", event => {

    if (event.target.matches('input[name="topics"]')) {
        updateSelectedTopicCount();
    }
});


// ============================================
// FUNKCJE POMOCNICZE
// ============================================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function shuffle(array) {

    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}


// ============================================
// SUPABASE – KOMUNIKACJA
// ============================================

function sendEvent(event, payload) {

    if (!channel) return;

    channel.send({
        type: "broadcast",
        event: event,
        payload: payload
    });
}

async function connectRoom(code, teacher) {

    if (!db) {
        throw new Error("Nie udało się uruchomić Supabase.");
    }

    if (channel) {
        await db.removeChannel(channel);
        channel = null;
    }

    channel = db.channel("room-" + code, {
        config: {
            broadcast: {
                self: false
            }
        }
    });

    if (teacher) {

        channel
            .on("broadcast", { event: "join" }, ({ payload }) => {

                if (!payload || !payload.id) return;

                players[payload.id] = {
                    id: payload.id,
                    name: payload.name,
                    score: 0,
                    answered: false,
                    lastCorrect: false,
                    lastPoints: 0
                };

                updateLobby();
                updateRanking();

                sendEvent("sync", {
                    started: gameStarted,
                    question: gameStarted ? getQuestionData() : null,
                    deadline: questionDeadline,
                    ended: questionEnded
                });
            })

            .on("broadcast", { event: "answer" }, ({ payload }) => {
                receiveAnswer(payload);
            });

    } else {

        channel
            .on("broadcast", { event: "sync" }, ({ payload }) => {

                if (payload?.started && payload.question) {
                    showStudentQuestion(
                        payload.question,
                        payload.deadline,
                        payload.ended
                    );
                }
            })

            .on("broadcast", { event: "question" }, ({ payload }) => {

                showStudentQuestion(
                    payload.question,
                    payload.deadline,
                    false
                );
            })

            .on("broadcast", { event: "reveal" }, ({ payload }) => {
                showStudentReveal(payload);
            })

            .on("broadcast", { event: "finished" }, ({ payload }) => {
                showStudentResults(payload);
            });
    }

    await new Promise((resolve, reject) => {

        let settled = false;

        const timeout = setTimeout(() => {

            if (!settled) {
                settled = true;
                reject(new Error("Przekroczono czas łączenia z pokojem."));
            }

        }, 12000);

        channel.subscribe(status => {

            if (status === "SUBSCRIBED" && !settled) {
                settled = true;
                clearTimeout(timeout);
                resolve();
            }

            if (
                (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
                !settled
            ) {
                settled = true;
                clearTimeout(timeout);
                reject(new Error("Nie udało się połączyć z pokojem."));
            }
        });
    });
}


// ============================================
// NAUCZYCIEL – TWORZENIE POKOJU
// ============================================

async function createRoom() {

    const error = document.getElementById("teacherError");
    error.textContent = "";

    if (!db) {
        error.textContent = "Brak połączenia z Supabase.";
        return;
    }

    const selectedTopics = Array.from(
        document.querySelectorAll('input[name="topics"]:checked')
    ).map(input => input.value);

    if (selectedTopics.length === 0) {
        error.textContent = "Zaznacz przynajmniej jeden temat.";
        return;
    }

    questionDuration = Number(
        document.getElementById("questionTime").value
    );

    const count = Number(
        document.getElementById("questionCount").value
    );

    const availableQuestions = allQuestions.filter(question =>
        selectedTopics.includes(question.topic)
    );

    if (availableQuestions.length === 0) {
        error.textContent = "W wybranych działach nie ma pytań.";
        return;
    }

    const finalCount = Math.min(count, availableQuestions.length);

    gameQuestions = shuffle(availableQuestions).slice(0, finalCount);

    roomCode = String(
        Math.floor(100000 + Math.random() * 900000)
    );

    role = "teacher";
    players = {};
    gameStarted = false;
    currentQuestion = 0;

    try {

        await connectRoom(roomCode, true);

        document.getElementById("roomCodeDisplay").textContent = roomCode;
        document.getElementById("roomCodeBig").textContent = roomCode;

        document.getElementById("connectionStatus").textContent =
            "Połączono z serwerem";

        updateLobby();

        showScreen("teacherLobby");

    } catch (e) {
        error.textContent = e.message;
    }
}


// ============================================
// POCZEKALNIA NAUCZYCIELA
// ============================================

function updateLobby() {

    const list = document.getElementById("lobbyPlayers");
    const names = Object.values(players);

    document.getElementById("playerCount").textContent = names.length;

    list.innerHTML = names.length
        ? names.map(player =>
            `<div class="player-entry">
                <span>🟢</span>
                ${escapeHTML(player.name)}
            </div>`
        ).join("")
        : "Oczekiwanie na uczniów...";
}


// ============================================
// UCZEŃ – DOŁĄCZANIE DO POKOJU
// ============================================

async function joinRoom() {

    const error = document.getElementById("studentError");
    error.textContent = "";

    if (!db) {
        error.textContent = "Brak połączenia z Supabase.";
        return;
    }

    roomCode = document.getElementById("roomInput").value.trim();
    nickname = document.getElementById("nicknameInput").value.trim();

    if (!/^\d{6}$/.test(roomCode)) {
        error.textContent = "Wpisz prawidłowy sześciocyfrowy kod.";
        return;
    }

    if (nickname.length < 2) {
        error.textContent = "Nick musi mieć co najmniej 2 znaki.";
        return;
    }

    role = "student";

    try {

        await connectRoom(roomCode, false);

        document.getElementById("studentName").textContent = nickname;

        document.getElementById("connectionStatus").textContent =
            "Połączono z pokojem";

        showScreen("studentLobby");

        sendEvent("join", {
            id: studentId,
            name: nickname
        });

    } catch (e) {
        error.textContent = e.message;
    }
}


// ============================================
// START GRY
// ============================================

function startGame() {

    if (Object.keys(players).length === 0) {
        alert("Poczekaj, aż do gry dołączy przynajmniej jeden uczeń.");
        return;
    }

    gameStarted = true;
    currentQuestion = 0;

    startQuestion();
}

function getQuestionData() {

    const question = gameQuestions[currentQuestion];

    return {
        number: currentQuestion + 1,
        total: gameQuestions.length,
        question: question.q,
        answers: question.a,
        correct: question.correct,
        explanation: question.explanation,
        duration: questionDuration,
        topic: question.topic
    };
}


// ============================================
// NAUCZYCIEL – WYŚWIETLENIE PYTANIA
// ============================================

function startQuestion() {

    if (currentQuestion >= gameQuestions.length) {
        finishGame();
        return;
    }

    questionEnded = false;

    Object.values(players).forEach(player => {

        player.answered = false;
        player.lastCorrect = false;
        player.lastPoints = 0;
    });

    const data = getQuestionData();

    questionDeadline = Date.now() + questionDuration * 1000;

    document.getElementById("teacherQuestionNumber").textContent =
        `PYTANIE ${data.number} / ${data.total}`;

    document.getElementById("teacherQuestion").textContent =
        data.question;

    document.getElementById("teacherOptions").innerHTML =
        data.answers.map((answer, index) => `
            <div class="option">
                ${String.fromCharCode(65 + index)}.
                ${escapeHTML(answer)}
            </div>
        `).join("");

    document.getElementById("teacherExplanation").textContent = "";

    document.getElementById("nextButton").classList.add("hidden");

    showScreen("teacherGame");

    updateRanking();
    updateAnswerCount();

    sendEvent("question", {
        question: data,
        deadline: questionDeadline
    });

    startTimer();
}


// ============================================
// TIMER NAUCZYCIELA
// ============================================

function startTimer() {

    clearInterval(timerInterval);

    timerInterval = setInterval(() => {

        const left = Math.max(
            0,
            Math.ceil((questionDeadline - Date.now()) / 1000)
        );

        document.getElementById("teacherTimer").textContent =
            left + " s";

        if (left <= 0) {
            revealQuestion();
        }

    }, 200);
}


// ============================================
// ODBIERANIE ODPOWIEDZI
// ============================================

function receiveAnswer(payload) {

    if (!payload || questionEnded || !gameStarted) return;

    const player = players[payload.id];

    if (!player || player.answered) return;

    player.answered = true;

    const question = gameQuestions[currentQuestion];

    const correct = Number(payload.answer) === question.correct;

    player.lastCorrect = correct;
    player.lastPoints = 0;

    if (correct) {

        const remaining = Math.max(
            0,
            questionDeadline - Date.now()
        );

        const bonus = Math.floor(
            500 * remaining / (questionDuration * 1000)
        );

        player.lastPoints = 1000 + bonus;
        player.score += player.lastPoints;
    }

    updateAnswerCount();
    updateRanking();

    const allAnswered = Object.values(players).every(
        player => player.answered
    );

    if (allAnswered) {
        revealQuestion();
    }
}

function updateAnswerCount() {

    const list = Object.values(players);

    const answered = list.filter(
        player => player.answered
    ).length;

    document.getElementById("answerCount").textContent = answered;
    document.getElementById("gamePlayerCount").textContent = list.length;
}


// ============================================
// ZAKOŃCZENIE PYTANIA
// ============================================

function revealQuestion() {

    if (questionEnded) return;

    questionEnded = true;

    clearInterval(timerInterval);

    const question = gameQuestions[currentQuestion];

    document.getElementById("teacherTimer").textContent = "KONIEC";

    document.getElementById("teacherExplanation").textContent =
        "Poprawna odpowiedź: " +
        question.a[question.correct] +
        ". " +
        question.explanation;

    const options = document.querySelectorAll(
        "#teacherOptions .option"
    );

    options.forEach((option, index) => {

        if (index === question.correct) {
            option.classList.add("correct");
        }
    });

    document.getElementById("nextButton").classList.remove("hidden");

    updateRanking();

    const results = {};

    Object.values(players).forEach(player => {

        results[player.id] = {
            correct: player.lastCorrect,
            points: player.lastPoints
        };
    });

    sendEvent("reveal", {
        correct: question.correct,
        explanation: question.explanation,
        answer: question.a[question.correct],
        ranking: getRanking(),
        results: results
    });
}

function nextQuestion() {

    currentQuestion++;

    startQuestion();
}


// ============================================
// UCZEŃ – ODBIERANIE PYTANIA
// ============================================

function showStudentQuestion(data, deadline, ended) {

    if (!data) return;

    myAnswer = null;

    clearInterval(timerInterval);

    document.getElementById("studentQuestionNumber").textContent =
        `PYTANIE ${data.number} / ${data.total}`;

    document.getElementById("studentQuestion").textContent =
        data.question;

    document.getElementById("studentFeedback").textContent =
        ended
            ? "To pytanie zostało już zakończone."
            : "Wybierz jedną odpowiedź!";

    document.getElementById("studentOptions").innerHTML =
        data.answers.map((answer, index) => `
            <button
                class="option"
                onclick="submitAnswer(${index}, this)"
                ${ended ? "disabled" : ""}
            >
                ${String.fromCharCode(65 + index)}.
                ${escapeHTML(answer)}
            </button>
        `).join("");

    showScreen("studentGame");

    timerInterval = setInterval(() => {

        const left = Math.max(
            0,
            Math.ceil((deadline - Date.now()) / 1000)
        );

        document.getElementById("studentTimer").textContent =
            left + " s";

        if (left <= 0) {

            clearInterval(timerInterval);

            document.querySelectorAll(
                "#studentOptions button"
            ).forEach(button => {
                button.disabled = true;
            });

            document.getElementById("studentFeedback").textContent =
                "Czas minął! Czekaj na wynik.";
        }

    }, 200);
}


// ============================================
// UCZEŃ – WYSYŁANIE ODPOWIEDZI
// ============================================

function submitAnswer(index, button) {

    if (myAnswer !== null) return;

    myAnswer = index;

    document.querySelectorAll(
        "#studentOptions button"
    ).forEach(element => {
        element.disabled = true;
    });

    button.classList.add("selected");

    document.getElementById("studentFeedback").textContent =
        "Odpowiedź wysłana! Czekaj na wynik.";

    sendEvent("answer", {
        id: studentId,
        answer: index
    });
}


// ============================================
// UCZEŃ – WYNIK PYTANIA
// ============================================

function showStudentReveal(data) {

    clearInterval(timerInterval);

    const result = data.results?.[studentId];

    if (result) {

        if (result.correct) {

            document.getElementById("studentFeedback").textContent =
                `DOBRZE! +${result.points} pkt. ${data.explanation}`;

        } else {

            document.getElementById("studentFeedback").textContent =
                `NIESTETY, BŁĄD. ${data.explanation}`;
        }

    } else {

        document.getElementById("studentFeedback").textContent =
            "Poprawna odpowiedź: " +
            data.answer +
            ". " +
            data.explanation;
    }

    document.querySelectorAll(
        "#studentOptions button"
    ).forEach((button, index) => {

        button.disabled = true;

        if (index === data.correct) {
            button.classList.add("correct");
        }

        if (index === myAnswer && index !== data.correct) {
            button.classList.add("wrong");
        }
    });
}


// ============================================
// RANKING
// ============================================

function getRanking() {

    return Object.values(players).sort(
        (a, b) => b.score - a.score
    );
}

function rankingHTML() {

    return getRanking().map((player, index) => `
        <div class="rank-row">
            <span>
                ${index + 1}.
                ${escapeHTML(player.name)}
            </span>

            <strong>${player.score} pkt</strong>
        </div>
    `).join("");
}

function updateRanking() {

    const html = rankingHTML();

    document.getElementById("teacherRanking").innerHTML =
        html || "Brak wyników.";
}


// ============================================
// KONIEC GRY
// ============================================

function finishGame() {

    gameStarted = false;

    clearInterval(timerInterval);

    document.getElementById("finalRanking").innerHTML =
        rankingHTML() || "Brak wyników.";

    showScreen("results");

    sendEvent("finished", {
        ranking: getRanking()
    });
}

function showStudentResults(data) {

    clearInterval(timerInterval);

    document.getElementById("finalRanking").innerHTML =
        (data.ranking || []).map((player, index) => `
            <div class="rank-row">
                <span>
                    ${index + 1}.
                    ${escapeHTML(player.name)}
                </span>

                <strong>${player.score} pkt</strong>
            </div>
        `).join("");

    showScreen("results");
}


// ============================================
// START
// ============================================

updateSelectedTopicCount();
