
"use strict";

/* =========================================
   PHYSICS – USTAWIENIA
========================================= */

const SUPABASE_URL = "https://uxfcsizgwsqpxqcrwajk.supabase.co";
const SUPABASE_KEY = "sb_publishable__xHc6XOFGvWBPsfN2TuyAQ_ZxWINXw5";

const $ = id => document.getElementById(id);

let db = null;
let channel = null;

let role = "";
let roomCode = "";
let nickname = "";
let studentId = crypto.randomUUID();

let players = [];
let gameQuestions = [];
let currentQuestion = 0;
let gameStarted = false;
let questionEnded = false;
let myAnswer = null;
let questionDeadline = 0;
let timerInterval = null;
let selectedTopics = new Set();
let receivedAnswers = {};

let labDragging = null;
let labPotDragging = null;
let labWasDragging = false;

/* =========================================
   POMOCNICZE
========================================= */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[c]);
}

function showScreen(id) {
    const target = $(id);
    if (!target) return;

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.add("hidden");
    });

    target.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(message, good = true) {
    const el = $("connectionStatus");
    if (!el) return;

    el.textContent = "● " + message;
    el.style.color = good ? "#35d39a" : "#ff647c";
}

function sendEvent(event, payload) {
    if (!channel) return Promise.resolve();

    return channel.send({
        type: "broadcast",
        event,
        payload
    });
}

function makeCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

/* =========================================
   SUPABASE
========================================= */

function initializeSupabase() {
    if (!window.supabase) {
        setStatus("Brak biblioteki Supabase", false);
        return;
    }

    try {
        db = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

        setStatus("Połączono z Supabase");
    } catch (error) {
        console.error(error);
        setStatus("Błąd połączenia", false);
    }
}

function closeChannel() {
    if (channel && db) {
        db.removeChannel(channel);
    }

    channel = null;
}

function connectChannel(code) {
    if (!db) return false;

    closeChannel();

    channel = db.channel("physics-room-" + code, {
        config: {
            broadcast: {
                self: false
            }
        }
    });

    channel
        .on("broadcast", { event: "player_join" }, ({ payload }) => {
            if (role !== "teacher") return;

            if (!players.some(p => p.id === payload.id)) {
                players.push({
                    id: payload.id,
                    nickname: payload.nickname,
                    score: 0
                });
            }

            renderLobbyPlayers();

            sendEvent("player_list", { players });
        })

        .on("broadcast", { event: "player_list" }, ({ payload }) => {
            if (role === "student") {
                players = payload.players || [];
            }
        })

        .on("broadcast", { event: "game_start" }, ({ payload }) => {
            if (role === "student") {
                gameQuestions = payload.questions || [];
                showStudentQuestion(payload);
            }
        })

        .on("broadcast", { event: "answer" }, ({ payload }) => {
            if (role !== "teacher") return;

            if (!questionEnded) {
                receivedAnswers[payload.playerId] = payload.answer;
                updateAnswerCount();
            }
        })

        .on("broadcast", { event: "reveal" }, ({ payload }) => {
            if (role === "student") {
                showStudentReveal(payload);
            }
        })

        .on("broadcast", { event: "next_question" }, ({ payload }) => {
            if (role === "student") {
                showStudentQuestion(payload);
            }
        })

        .on("broadcast", { event: "finished" }, ({ payload }) => {
            if (role === "student") {
                showStudentResults(payload);
            }
        })

        .subscribe(status => {
            if (status === "SUBSCRIBED") {
                setStatus("Połączono z pokojem " + code);
            }

            if (status === "CHANNEL_ERROR") {
                setStatus("Błąd kanału pokoju", false);
            }
        });

    return true;
}

/* =========================================
   PYTANIA – KLASA 7 I 8
========================================= */

const topics = [
    { id: "pomiary", name: "Pomiary i wielkości fizyczne", grade: "7" },
    { id: "materia", name: "Właściwości materii", grade: "7" },
    { id: "cisnienie", name: "Ciśnienie i siły w cieczach", grade: "7" },
    { id: "ruch", name: "Ruch i prędkość", grade: "7" },
    { id: "sily", name: "Siły i oddziaływania", grade: "7" },
    { id: "praca_moc", name: "Praca i moc", grade: "8" },
    { id: "energia", name: "Energia", grade: "8" },
    { id: "cieplo", name: "Ciepło i zjawiska cieplne", grade: "8" },
    { id: "elektrycznosc", name: "Elektryczność i magnetyzm", grade: "8" },
    { id: "fale_optyka", name: "Drgania, fale, dźwięk i optyka", grade: "8" }
];

const questionBank = {
    pomiary: [
    ["Jaka jest podstawowa jednostka długości SI?", ["Metr", "Kilogram", "Sekunda", "Litr"], 0, "Jednostką długości jest metr."],
    ["Jakim przyrządem mierzymy masę?", ["Termometrem", "Wagą", "Linijką", "Stoperem"], 1, "Masę mierzymy wagą."],
    ["Ile centymetrów ma metr?", ["10", "100", "1000", "50"], 1, "1 m = 100 cm."],
    ["Jaka jest jednostka czasu SI?", ["Godzina", "Minuta", "Sekunda", "Dzień"], 2, "Jednostką czasu jest sekunda."],
    ["Czym mierzymy temperaturę?", ["Dynamometrem", "Termometrem", "Linijką", "Wagą"], 1, "Temperaturę mierzymy termometrem."],
    ["Jaka jest jednostka masy SI?", ["Gram", "Kilogram", "Newton", "Dżul"], 1, "Jednostką masy jest kilogram."],
    ["Ile milimetrów ma centymetr?", ["1", "10", "100", "1000"], 1, "1 cm = 10 mm."],
    ["Ile metrów ma kilometr?", ["10", "100", "1000", "10000"], 2, "1 km = 1000 m."],
    ["Jaka jest jednostka objętości w układzie SI?", ["Litr", "Metr sześcienny", "Centymetr", "Kilogram"], 1, "Jednostką SI objętości jest m³."],
    ["Czym mierzymy czas?", ["Stoperem", "Wagą", "Termometrem", "Linijką"], 0, "Czas można mierzyć stoperem."],
    ["Jaka jest jednostka temperatury SI?", ["Celsjusz", "Kelwin", "Fahrenheit", "Dżul"], 1, "Jednostką SI temperatury jest kelwin."],
    ["Ile gramów ma kilogram?", ["10", "100", "1000", "10000"], 2, "1 kg = 1000 g."],
    ["Ile sekund ma minuta?", ["30", "60", "100", "120"], 1, "Minuta ma 60 sekund."],
    ["Ile minut ma godzina?", ["30", "60", "90", "100"], 1, "Godzina ma 60 minut."],
    ["Ile godzin ma doba?", ["12", "18", "24", "48"], 2, "Doba ma 24 godziny."],
    ["Czym mierzymy długość ołówka?", ["Linijką", "Wagą", "Amperomierzem", "Termometrem"], 0, "Do pomiaru długości służy linijka."],
    ["Jaką jednostką mierzymy powierzchnię?", ["m", "m²", "m³", "kg"], 1, "Powierzchnię mierzymy w metrach kwadratowych."],
    ["Jaka jest jednostka objętości?", ["m²", "m³", "m/s", "N"], 1, "Objętość mierzymy w metrach sześciennych."],
    ["Ile decymetrów ma metr?", ["1", "10", "100", "1000"], 1, "1 m = 10 dm."],
    ["Ile centymetrów ma decymetr?", ["1", "10", "100", "1000"], 1, "1 dm = 10 cm."],
    ["Ile milimetrów ma metr?", ["10", "100", "1000", "10000"], 2, "1 m = 1000 mm."],
    ["Ile kilogramów ma tona?", ["10", "100", "1000", "10000"], 2, "1 tona = 1000 kg."],
    ["Ile miligramów ma gram?", ["10", "100", "1000", "10000"], 2, "1 g = 1000 mg."],
    ["Jaka jednostka jest większa?", ["Milimetr", "Centymetr", "Metr", "Kilometr"], 3, "Kilometr jest największą z podanych jednostek."],
    ["Jaka jednostka jest najmniejsza?", ["Kilometr", "Metr", "Centymetr", "Milimetr"], 3, "Milimetr jest najmniejszy."],
    ["Jakim przyrządem mierzymy średnicę małego przedmiotu?", ["Suwmiarką", "Termometrem", "Wagą", "Stoperem"], 0, "Suwmiarka pozwala mierzyć małe wymiary."],
    ["Do czego służy mikrometr?", ["Do pomiaru małych grubości", "Do mierzenia czasu", "Do ważenia", "Do mierzenia temperatury"], 0, "Mikrometr mierzy bardzo małe wymiary."],
    ["Co oznacza symbol kg?", ["Kilometr", "Kilogram", "Kelwin", "Kilowat"], 1, "kg to symbol kilograma."],
    ["Co oznacza symbol s?", ["Sekunda", "Siła", "Szerokość", "Stopień"], 0, "s oznacza sekundę."],
    ["Co oznacza symbol m?", ["Masa", "Metr", "Minuta", "Moc"], 1, "m oznacza metr."],
    ["Co oznacza symbol K?", ["Kelwin", "Kilogram", "Kilometr", "Kandela"], 0, "K jest symbolem kelwina."],
    ["Co oznacza symbol A?", ["Amper", "Metr", "Sekunda", "Dżul"], 0, "A oznacza amper."],
    ["Co oznacza symbol mol?", ["Jednostkę ilości substancji", "Jednostkę długości", "Jednostkę siły", "Jednostkę czasu"], 0, "Mol jest jednostką ilości substancji."],
    ["Jaka jest jednostka natężenia światła SI?", ["Kandela", "Lumen", "Luks", "Wat"], 0, "Jednostką natężenia światła jest kandela."],
    ["Co to jest pomiar?", ["Porównanie wielkości z jednostką", "Zgadnięcie wyniku", "Obliczenie masy zawsze", "Zmiana temperatury"], 0, "Pomiar polega na porównaniu z jednostką."],
    ["Co to jest wielkość fizyczna?", ["Cecha, którą można zmierzyć", "Dowolny kolor", "Nazwa przedmiotu", "Rodzaj materiału"], 0, "Wielkość fizyczną można opisać pomiarem."],
    ["Która z podanych wielkości jest fizyczna?", ["Długość", "Piękno", "Smak", "Zapach"], 0, "Długość można zmierzyć."],
    ["Która jednostka służy do pomiaru masy?", ["kg", "m", "s", "K"], 0, "Masę mierzymy w kilogramach."],
    ["Która jednostka służy do pomiaru czasu?", ["N", "s", "kg", "m"], 1, "Czas mierzymy w sekundach."],
    ["Która jednostka służy do pomiaru długości?", ["m", "kg", "J", "W"], 0, "Długość mierzymy w metrach."],
    ["Ile sekund to 2 minuty?", ["60", "90", "120", "180"], 2, "2 × 60 = 120 sekund."],
    ["Ile sekund to 5 minut?", ["100", "200", "300", "500"], 2, "5 × 60 = 300 sekund."],
    ["Ile minut to 2 godziny?", ["60", "100", "120", "180"], 2, "2 × 60 = 120 minut."],
    ["Ile godzin to 180 minut?", ["1", "2", "3", "4"], 2, "180 minut to 3 godziny."],
    ["Ile metrów to 250 cm?", ["0,25", "2,5", "25", "2500"], 1, "250 cm = 2,5 m."],
    ["Ile centymetrów to 3,5 m?", ["35", "350", "3500", "3,5"], 1, "3,5 m = 350 cm."],
    ["Ile metrów to 4 km?", ["40", "400", "4000", "40000"], 2, "4 km = 4000 m."],
    ["Ile kilogramów to 2500 g?", ["0,25", "2,5", "25", "250"], 1, "2500 g = 2,5 kg."],
    ["Ile gramów to 0,5 kg?", ["5", "50", "500", "5000"], 2, "0,5 kg = 500 g."],
    ["Ile milimetrów to 2 cm?", ["2", "10", "20", "200"], 2, "2 cm = 20 mm."],
    ["Ile centymetrów to 120 mm?", ["1,2", "12", "120", "1200"], 1, "120 mm = 12 cm."],
    ["Ile metrów kwadratowych ma kwadrat o boku 2 m?", ["2", "4", "6", "8"], 1, "Pole wynosi 2 × 2 = 4 m²."],
    ["Jak obliczamy pole prostokąta?", ["a+b", "a×b", "2a+2b", "a/b"], 1, "Pole prostokąta to iloczyn boków."],
    ["Jak obliczamy objętość prostopadłościanu?", ["a+b+c", "a×b×c", "2a+2b", "a/b"], 1, "Objętość to iloczyn trzech wymiarów."],
    ["Jaka jest jednostka prędkości SI?", ["m/s", "kg", "N", "J"], 0, "Prędkość mierzymy w metrach na sekundę."],
    ["Jaka jest jednostka siły?", ["Wat", "Newton", "Dżul", "Kelwin"], 1, "Siłę mierzymy w niutonach."],
    ["Jaka jest jednostka energii?", ["Dżul", "Metr", "Sekunda", "Amper"], 0, "Energię mierzymy w dżulach."],
    ["Jaka jest jednostka mocy?", ["Wat", "Newton", "Kilogram", "Paskal"], 0, "Moc mierzymy w watach."],
    ["Jaka jest jednostka ciśnienia?", ["Paskal", "Dżul", "Metr", "Amper"], 0, "Ciśnienie mierzymy w paskalach."],
    ["Jaka jest jednostka częstotliwości?", ["Herc", "Wat", "Newton", "Kelwin"], 0, "Częstotliwość mierzymy w hercach."],
    ["Jaka jest jednostka ładunku elektrycznego?", ["Kulomb", "Wolt", "Om", "Amper"], 0, "Ładunek mierzymy w kulombach."],
    ["Jaka jest jednostka napięcia?", ["Wolt", "Amper", "Om", "Tesla"], 0, "Napięcie mierzymy w woltach."],
    ["Jaka jest jednostka oporu elektrycznego?", ["Om", "Wolt", "Amper", "Wat"], 0, "Opór mierzymy w omach."],
    ["Jaka jest jednostka indukcji magnetycznej?", ["Tesla", "Dżul", "Paskal", "Metr"], 0, "Indukcję magnetyczną mierzymy w teslach."],
    ["Co oznacza przedrostek kilo?", ["100", "1000", "10", "0,001"], 1, "Kilo oznacza tysiąc."],
    ["Co oznacza przedrostek centy?", ["Jedną setną", "Jedną dziesiątą", "Tysiąc", "Sto"], 0, "Centy oznacza 0,01."],
    ["Co oznacza przedrostek mili?", ["Jedną dziesiątą", "Jedną setną", "Jedną tysięczną", "Tysiąc"], 2, "Mili oznacza 0,001."],
    ["Co oznacza przedrostek mega?", ["Tysiąc", "Milion", "Miliard", "Sto"], 1, "Mega oznacza milion."],
    ["Co oznacza przedrostek mikro?", ["10⁻³", "10⁻⁶", "10³", "10⁶"], 1, "Mikro oznacza jedną milionową."],
    ["Ile metrów to 1 milimetr?", ["0,1", "0,01", "0,001", "0,0001"], 2, "1 mm = 0,001 m."],
    ["Ile kilogramów to 1 gram?", ["0,1", "0,01", "0,001", "0,0001"], 2, "1 g = 0,001 kg."],
    ["Ile sekund to pół minuty?", ["15", "20", "30", "45"], 2, "Pół minuty to 30 sekund."],
    ["Ile minut to pół godziny?", ["15", "20", "30", "45"], 2, "Pół godziny to 30 minut."],
    ["Ile godzin to pół doby?", ["6", "10", "12", "18"], 2, "Pół doby to 12 godzin."],
    ["Ile dni ma tydzień?", ["5", "6", "7", "8"], 2, "Tydzień ma 7 dni."],
    ["Ile dni ma zwykły rok?", ["360", "364", "365", "366"], 2, "Zwykły rok ma 365 dni."],
    ["Ile dni ma rok przestępny?", ["364", "365", "366", "367"], 2, "Rok przestępny ma 366 dni."],
    ["Jaką jednostką najwygodniej podać odległość między miastami?", ["Milimetr", "Centymetr", "Kilometr", "Mikrometr"], 2, "Odległości między miastami podaje się zwykle w kilometrach."],
    ["Jaką jednostką podamy grubość kartki?", ["Kilometr", "Metr", "Milimetr", "Kilogram"], 2, "Grubość kartki podajemy w milimetrach."],
    ["Jaką jednostką podamy masę samochodu?", ["Miligram", "Kilogram", "Milimetr", "Sekunda"], 1, "Masę samochodu podaje się w kilogramach."],
    ["Jaką jednostką podamy pojemność butelki?", ["Litr", "Metr", "Newton", "Wat"], 0, "Pojemność butelki często podaje się w litrach."],
    ["Czy litr jest podstawową jednostką objętości SI?", ["Tak", "Nie", "Tylko dla gazów", "Tylko dla cieczy"], 1, "Podstawową jednostką SI jest metr sześcienny."],
    ["Ile litrów ma metr sześcienny?", ["10", "100", "1000", "10000"], 2, "1 m³ = 1000 litrów."],
    ["Ile mililitrów ma litr?", ["10", "100", "1000", "10000"], 2, "1 litr = 1000 ml."],
    ["Ile litrów ma pół metra sześciennego?", ["50", "100", "500", "1000"], 2, "0,5 m³ = 500 litrów."],
    ["Co jest ważne przy poprawnym zapisie wyniku pomiaru?", ["Wartość i jednostka", "Tylko kolor", "Tylko nazwa przyrządu", "Sam wynik bez jednostki"], 0, "Wynik pomiaru powinien zawierać wartość i jednostkę."],
    ["Co to jest dokładność przyrządu?", ["Zdolność do dokładnego pomiaru", "Jego masa", "Jego kolor", "Długość przewodu"], 0, "Dokładność opisuje jakość pomiaru."],
    ["Czym jest błąd pomiaru?", ["Różnicą między wynikiem a wartością rzeczywistą", "Jednostką masy", "Rodzajem temperatury", "Wynikiem mnożenia"], 0, "Błąd pomiaru oznacza odchylenie wyniku od wartości rzeczywistej."],
    ["Dlaczego warto powtarzać pomiar?", ["Aby sprawdzić wiarygodność wyniku", "Aby zmienić jednostkę", "Aby zwiększyć masę", "Aby zatrzymać czas"], 0, "Powtórzenia pomagają wykryć przypadkowe błędy."],
    ["Co to jest średnia arytmetyczna pomiarów?", ["Suma wyników podzielona przez ich liczbę", "Największy wynik", "Najmniejszy wynik", "Różnica wyników"], 0, "Średnią obliczamy przez dodanie wyników i podzielenie przez ich liczbę."],
    ["Wyniki pomiarów to 2 cm, 4 cm i 6 cm. Jaka jest średnia?", ["2 cm", "3 cm", "4 cm", "6 cm"], 2, "Średnia wynosi (2+4+6)/3 = 4 cm."],
    ["Wyniki to 10 s i 20 s. Jaka jest średnia?", ["10 s", "15 s", "20 s", "30 s"], 1, "Średnia wynosi 15 sekund."],
    ["Który przyrząd mierzy ciśnienie atmosferyczne?", ["Barometr", "Termometr", "Waga", "Linijka"], 0, "Ciśnienie atmosferyczne mierzymy barometrem."],
    ["Który przyrząd mierzy wilgotność powietrza?", ["Higrometr", "Dynamometr", "Amperomierz", "Stoper"], 0, "Wilgotność mierzymy higrometrem."],
    ["Który przyrząd mierzy siłę?", ["Dynamometr", "Barometr", "Termometr", "Woltomierz"], 0, "Dynamometr służy do pomiaru siły."],
    ["Który przyrząd mierzy napięcie?", ["Woltomierz", "Amperomierz", "Waga", "Linijka"], 0, "Napięcie mierzymy woltomierzem."],
    ["Który przyrząd mierzy natężenie prądu?", ["Amperomierz", "Woltomierz", "Termometr", "Barometr"], 0, "Natężenie prądu mierzymy amperomierzem."],
    ["Który przyrząd mierzy prędkość pojazdu?", ["Prędkościomierz", "Termometr", "Waga", "Barometr"], 0, "Prędkościomierz pokazuje prędkość pojazdu."],
    ["Co oznacza symbol °C?", ["Stopnie Celsjusza", "Kelwiny", "Dżule", "Waty"], 0, "°C oznacza stopnie Celsjusza."],
    ["Ile wynosi 0°C w przybliżeniu w kelwinach?", ["0 K", "100 K", "273 K", "373 K"], 2, "0°C odpowiada około 273,15 K."],
    ["Ile wynosi 100°C w przybliżeniu w kelwinach?", ["100 K", "273 K", "373 K", "473 K"], 2, "100°C odpowiada około 373,15 K."],
    ["Ile wynosi 20°C w przybliżeniu w kelwinach?", ["20 K", "253 K", "293 K", "320 K"], 2, "20°C to około 293 K."],
    ["Jaka wielkość opisuje, jak długo trwa zjawisko?", ["Czas", "Masa", "Długość", "Gęstość"], 0, "Czas opisuje trwanie zjawiska."],
    ["Jaka wielkość opisuje ilość miejsca zajmowanego przez ciało?", ["Objętość", "Masa", "Temperatura", "Prędkość"], 0, "Objętość określa przestrzeń zajmowaną przez ciało."],
    ["Jaka wielkość opisuje ilość materii w ciele?", ["Masa", "Długość", "Czas", "Temperatura"], 0, "Masa jest miarą ilości materii w ujęciu szkolnym."],
    ["Jaka wielkość określa, jak gorące jest ciało?", ["Temperatura", "Masa", "Długość", "Prędkość"], 0, "Temperatura określa stan cieplny ciała."],
    ["Co jest wynikiem pomiaru długości?", ["Wartość w jednostkach długości", "Wartość w kilogramach", "Wartość w sekundach", "Wartość w amperach"], 0, "Wynik długości podaje się np. w metrach."],
    ["Jaką jednostkę ma pole powierzchni?", ["m²", "m³", "m/s", "kg/m³"], 0, "Pole powierzchni ma jednostkę kwadratową."],
    ["Jaką jednostkę ma objętość?", ["m", "m²", "m³", "m/s"], 2, "Objętość ma jednostkę sześcienną."],
    ["Ile cm² ma 1 dm²?", ["10", "100", "1000", "10000"], 1, "1 dm² = 100 cm²."],
    ["Ile mm² ma 1 cm²?", ["10", "100", "1000", "10000"], 1, "1 cm² = 100 mm²."],
    ["Ile cm³ ma 1 dm³?", ["10", "100", "1000", "10000"], 2, "1 dm³ = 1000 cm³."],
    ["Ile dm³ ma 1 m³?", ["10", "100", "1000", "10000"], 1, "1 m³ = 1000 dm³? Nie: 1 m³ = 1000 dm³."],
    ["Jaki jest symbol jednostki dżul?", ["J", "W", "N", "Pa"], 0, "Dżul oznaczamy literą J."],
    ["Jaki jest symbol jednostki niuton?", ["N", "J", "W", "K"], 0, "Niuton oznaczamy literą N."],
    ["Jaki jest symbol jednostki paskal?", ["Pa", "W", "J", "Hz"], 0, "Paskal oznaczamy Pa."],
    ["Jaki jest symbol jednostki herc?", ["Hz", "N", "Pa", "V"], 0, "Herc oznaczamy Hz."],
    ["Jaki jest symbol jednostki wat?", ["W", "J", "N", "kg"], 0, "Wat oznaczamy literą W."],
    ["Jaki jest symbol jednostki wolt?", ["V", "A", "Ω", "T"], 0, "Wolt oznaczamy literą V."],
    ["Jaki jest symbol jednostki oma?", ["Ω", "V", "A", "W"], 0, "Om oznaczamy grecką literą omega."],
    ["Jaki jest symbol jednostki tesla?", ["T", "N", "J", "Pa"], 0, "Tesla ma symbol T."],
    ["Jaką jednostką wyrażamy gęstość?", ["kg/m³", "m/s", "N", "J"], 0, "Gęstość w układzie SI wyrażamy w kg/m³."],
    ["Co oznacza zapis 5,2 m?", ["5,2 metra", "52 metry", "5,2 kilogramy", "52 sekundy"], 0, "Liczba 5,2 jest wartością, a m jednostką."],
    ["Co oznacza zapis 0,75 kg?", ["750 g", "75 g", "7,5 g", "7500 g"], 0, "0,75 kg = 750 g."],
    ["Co oznacza zapis 2,5 h?", ["150 minut", "25 minut", "120 minut", "250 minut"], 0, "2,5 godziny to 150 minut."]
],

materia: [
    ["Z czego zbudowana jest materia?", ["Z atomów i cząsteczek", "Z fal", "Z próżni", "Z samej energii"], 0, "Materia składa się z atomów i cząsteczek."],
    ["Który stan ma stały kształt i objętość?", ["Gazowy", "Ciekły", "Stały", "Żaden"], 2, "Ciała stałe zachowują kształt i objętość."],
    ["Jak obliczamy gęstość?", ["m/V", "V/t", "F/s", "m·v"], 0, "Gęstość to masa podzielona przez objętość."],
    ["Jednostka gęstości SI to:", ["kg/m³", "N", "J", "W"], 0, "Jednostką jest kg/m³."],
    ["Przejście cieczy w gaz to:", ["Krzepnięcie", "Parowanie", "Topnienie", "Skraplanie"], 1, "To parowanie."],
    ["Co dzieje się z cząsteczkami podczas ogrzewania?", ["Poruszają się szybciej", "Znikają", "Zatrzymują się", "Zmieniają się w atomy"], 0, "Rośnie ich średnia energia ruchu."],
    ["Który stan skupienia ma własną objętość, ale przyjmuje kształt naczynia?", ["Stały", "Ciekły", "Gazowy", "Plazma"], 1, "Ciecz ma własną objętość, ale przyjmuje kształt naczynia."],
    ["Który stan skupienia nie ma własnego kształtu ani objętości?", ["Stały", "Ciekły", "Gazowy", "Żaden"], 2, "Gaz wypełnia dostępną przestrzeń."],
    ["Jak nazywa się przejście ciała stałego w ciecz?", ["Topnienie", "Krzepnięcie", "Skraplanie", "Sublimacja"], 0, "Topnienie to przejście ze stanu stałego w ciekły."],
    ["Jak nazywa się przejście cieczy w ciało stałe?", ["Parowanie", "Krzepnięcie", "Topnienie", "Resublimacja"], 1, "Krzepnięcie to przejście cieczy w ciało stałe."],
    ["Jak nazywa się przejście gazu w ciecz?", ["Skraplanie", "Parowanie", "Topnienie", "Sublimacja"], 0, "Skraplanie to przejście gazu w ciecz."],
    ["Jak nazywa się przejście ciała stałego bezpośrednio w gaz?", ["Sublimacja", "Topnienie", "Krzepnięcie", "Skraplanie"], 0, "Sublimacja omija stan ciekły."],
    ["Jak nazywa się przejście gazu bezpośrednio w ciało stałe?", ["Resublimacja", "Parowanie", "Topnienie", "Skraplanie"], 0, "Resublimacja to przejście gazu w ciało stałe."],
    ["Co jest przykładem topnienia?", ["Lód zamienia się w wodę", "Woda zamarza", "Woda paruje", "Para skrapla się"], 0, "Podczas topnienia lód staje się wodą."],
    ["Co jest przykładem krzepnięcia?", ["Woda zamarza", "Lód topnieje", "Woda wrze", "Para wodna powstaje"], 0, "Zamarzanie wody to krzepnięcie."],
    ["Co jest przykładem parowania?", ["Mokra kałuża wysycha", "Lód zamarza", "Woda zamienia się w lód", "Para tworzy szron"], 0, "Woda z kałuży przechodzi do powietrza jako para."],
    ["Co jest przykładem skraplania?", ["Para tworzy krople na zimnej szybie", "Lód topnieje", "Woda wrze", "Śnieg sublimuje"], 0, "Para wodna skrapla się na chłodnej powierzchni."],
    ["Czy cząsteczki ciała stałego są całkowicie nieruchome?", ["Tak", "Nie, drgają", "Poruszają się swobodnie jak gaz", "Znikają"], 1, "Cząsteczki ciała stałego drgają wokół położeń równowagi."],
    ["Jak poruszają się cząsteczki gazu?", ["Swobodnie i chaotycznie", "Nie poruszają się", "Tylko drgają w miejscu", "Poruszają się po jednej linii"], 0, "Cząsteczki gazu poruszają się chaotycznie."],
    ["Co utrzymuje cząsteczki ciała stałego blisko siebie?", ["Oddziaływania międzycząsteczkowe", "Brak masy", "Światło", "Próżnia"], 0, "Cząsteczki oddziałują ze sobą siłami."],
    ["Co to jest dyfuzja?", ["Samorzutne mieszanie się substancji", "Zamarzanie cieczy", "Zmiana masy", "Pomiar temperatury"], 0, "Dyfuzja polega na samorzutnym mieszaniu się cząsteczek."],
    ["Gdzie dyfuzja zachodzi najszybciej?", ["Zwykle w gazach", "W ciałach stałych", "W próżni", "Nie zachodzi nigdzie"], 0, "W gazach cząsteczki poruszają się szybko i swobodnie."],
    ["Dlaczego zapach perfum rozchodzi się po pokoju?", ["Z powodu dyfuzji", "Z powodu grawitacji wyłącznie", "Z powodu topnienia", "Z powodu krzepnięcia"], 0, "Cząsteczki zapachu mieszają się z powietrzem."],
    ["Co wpływa na szybkość dyfuzji?", ["Temperatura", "Kolor naczynia", "Nazwa substancji", "Kształt liter"], 0, "Wyższa temperatura zwykle przyspiesza dyfuzję."],
    ["Co dzieje się z objętością większości ciał podczas ogrzewania?", ["Rośnie", "Maleje zawsze", "Znika", "Nie może się zmieniać"], 0, "Większość substancji rozszerza się podczas ogrzewania."],
    ["Jak nazywa się zwiększanie wymiarów ciała pod wpływem temperatury?", ["Rozszerzalność cieplna", "Dyfuzja", "Kondensacja", "Sprężystość"], 0, "To zjawisko nazywa się rozszerzalnością cieplną."],
    ["Co zwykle dzieje się z ciałem podczas ochładzania?", ["Kurczy się", "Zawsze rośnie", "Znika", "Zmienia się w gaz"], 0, "Większość ciał kurczy się podczas ochładzania."],
    ["Dlaczego na mostach stosuje się szczeliny dylatacyjne?", ["Aby umożliwić rozszerzanie i kurczenie", "Aby zmniejszyć masę", "Aby zatrzymać wiatr", "Aby zwiększyć tarcie"], 0, "Szczeliny pozwalają konstrukcji zmieniać długość pod wpływem temperatury."],
    ["Co to jest atom?", ["Podstawowy składnik pierwiastka", "Rodzaj cieczy", "Jednostka siły", "Rodzaj fali"], 0, "Atom jest podstawową jednostką pierwiastka chemicznego."],
    ["Z jakich cząstek składa się jądro atomowe?", ["Protonów i neutronów", "Elektronów i fotonów", "Tylko elektronów", "Tylko neutronów"], 0, "Jądro zawiera protony i neutrony."],
    ["Jaki ładunek ma proton?", ["Dodatni", "Ujemny", "Obojętny", "Zmienny"], 0, "Proton ma ładunek dodatni."],
    ["Jaki ładunek ma elektron?", ["Ujemny", "Dodatni", "Obojętny", "Nie ma masy"], 0, "Elektron ma ładunek ujemny."],
    ["Jaki ładunek ma neutron?", ["Obojętny", "Dodatni", "Ujemny", "Podwójny"], 0, "Neutron nie ma ładunku elektrycznego."],
    ["Gdzie znajdują się elektrony w atomie?", ["Wokół jądra", "W jądrze", "Poza atomem zawsze", "Tylko między atomami"], 0, "Elektrony tworzą chmurę elektronową wokół jądra."],
    ["Co to jest cząsteczka?", ["Zespół połączonych atomów", "Pojedynczy proton", "Rodzaj siły", "Jednostka temperatury"], 0, "Cząsteczka składa się z połączonych atomów."],
    ["Cząsteczka wody ma wzór:", ["H₂O", "CO₂", "O₂", "NaCl"], 0, "Woda składa się z dwóch atomów wodoru i jednego tlenu."],
    ["Jaki pierwiastek ma symbol O?", ["Tlen", "Wodór", "Węgiel", "Azot"], 0, "O to symbol tlenu."],
    ["Jaki pierwiastek ma symbol H?", ["Wodór", "Hel", "Tlen", "Węgiel"], 0, "H to symbol wodoru."],
    ["Jaki pierwiastek ma symbol C?", ["Węgiel", "Wapń", "Chlor", "Miedź"], 0, "C to symbol węgla."],
    ["Jaki pierwiastek ma symbol Fe?", ["Żelazo", "Fluor", "Fosfor", "Wodór"], 0, "Fe to symbol żelaza."],
    ["Jaki pierwiastek ma symbol Au?", ["Złoto", "Srebro", "Glin", "Argon"], 0, "Au to symbol złota."],
    ["Jaki pierwiastek ma symbol Ag?", ["Srebro", "Złoto", "Siarka", "Glin"], 0, "Ag to symbol srebra."],
    ["Co to jest pierwiastek chemiczny?", ["Substancja z atomów o tej samej liczbie protonów", "Mieszanina dowolnych cieczy", "Rodzaj energii", "Jednostka masy"], 0, "Pierwiastek określa liczba protonów w jądrze."],
    ["Co to jest związek chemiczny?", ["Substancja złożona z różnych pierwiastków połączonych chemicznie", "Dowolna mieszanina", "Pojedynczy atom", "Czysty metal"], 0, "Związek chemiczny zawiera co najmniej dwa pierwiastki połączone chemicznie."],
    ["Czy powietrze jest czystym pierwiastkiem?", ["Tak", "Nie, jest mieszaniną gazów", "Jest metalem", "Jest cieczą"], 1, "Powietrze to mieszanina różnych gazów."],
    ["Czy woda destylowana jest mieszaniną wielu substancji?", ["Nie, jest prawie czystą wodą", "Tak, jest stopem", "Jest metalem", "Jest gazem"], 0, "Woda destylowana zawiera bardzo mało rozpuszczonych substancji."],
    ["Co to jest mieszanina?", ["Połączenie co najmniej dwóch substancji", "Zawsze jeden pierwiastek", "Pojedynczy atom", "Jednostka objętości"], 0, "Mieszanina składa się z kilku substancji."],
    ["Jak można rozdzielić piasek od wody?", ["Przez filtrację", "Przez magnes zawsze", "Przez zamrażanie powietrza", "Przez pomiar masy"], 0, "Filtr zatrzymuje piasek, a przepuszcza wodę."],
    ["Jak można oddzielić sól od wody?", ["Przez odparowanie wody", "Przez magnes", "Przez przesiewanie", "Przez użycie linijki"], 0, "Po odparowaniu wody sól pozostaje w naczyniu."],
    ["Jak nazywa się przejście substancji do roztworu?", ["Rozpuszczanie", "Krzepnięcie", "Topnienie", "Resublimacja"], 0, "Rozpuszczanie polega na tworzeniu roztworu."],
    ["Co jest rozpuszczalnikiem w wodnym roztworze soli?", ["Woda", "Sól", "Piasek", "Powietrze"], 0, "Woda jest rozpuszczalnikiem."],
    ["Co jest substancją rozpuszczoną w słonej wodzie?", ["Sól", "Woda", "Tlen", "Szkło"], 0, "Sól jest substancją rozpuszczoną."],
    ["Czy cukier rozpuszcza się w wodzie?", ["Tak", "Nie", "Tylko w oleju", "Tylko w gazie"], 0, "Cukier rozpuszcza się w wodzie."],
    ["Czy piasek rozpuszcza się w wodzie?", ["Nie", "Tak, całkowicie", "Zmienia się w sól", "Zmienia się w gaz"], 0, "Piasek nie rozpuszcza się w wodzie."],
    ["Co oznacza roztwór nasycony?", ["Nie można rozpuścić więcej substancji w danych warunkach", "Nie zawiera rozpuszczalnika", "Jest zawsze gazem", "Nie ma masy"], 0, "Roztwór nasycony zawiera maksymalną ilość substancji rozpuszczonej w danych warunkach."],
    ["Co zwykle dzieje się z rozpuszczalnością wielu ciał stałych w wodzie przy ogrzewaniu?", ["Rośnie", "Zawsze maleje", "Znika", "Nie może się zmieniać"], 0, "Dla wielu ciał stałych rozpuszczalność rośnie wraz z temperaturą."],
    ["Co to jest gęstość?", ["Masa przypadająca na jednostkę objętości", "Objętość przypadająca na czas", "Siła na powierzchnię", "Droga w czasie"], 0, "Gęstość określa masę jednostki objętości."],
    ["Jak obliczyć gęstość?", ["ρ=m/V", "ρ=V/m", "ρ=m×V", "ρ=F/S"], 0, "Gęstość to masa podzielona przez objętość."],
    ["Ciało ma masę 2 kg i objętość 1 m³. Jaka jest gęstość?", ["1 kg/m³", "2 kg/m³", "3 kg/m³", "0,5 kg/m³"], 1, "ρ = 2/1 = 2 kg/m³."],
    ["Ciało ma masę 10 kg i objętość 2 m³. Jaka jest gęstość?", ["2 kg/m³", "5 kg/m³", "10 kg/m³", "20 kg/m³"], 1, "ρ = 10/2 = 5 kg/m³."],
    ["Ciało ma masę 6 kg i objętość 3 m³. Jaka jest gęstość?", ["2 kg/m³", "3 kg/m³", "9 kg/m³", "18 kg/m³"], 0, "ρ = 6/3 = 2 kg/m³."],
    ["Ciało ma masę 4 kg i objętość 2 m³. Jaka jest gęstość?", ["1 kg/m³", "2 kg/m³", "4 kg/m³", "8 kg/m³"], 1, "ρ = 4/2 = 2 kg/m³."],
    ["Jaka jest jednostka gęstości SI?", ["kg/m³", "kg/m²", "m/s", "N/m"], 0, "Jednostką gęstości jest kilogram na metr sześcienny."],
    ["Która substancja ma zwykle większą gęstość?", ["Ołów", "Styropian", "Powietrze", "Korek"], 0, "Ołów ma znacznie większą gęstość niż pozostałe materiały."],
    ["Dlaczego drewno często pływa na wodzie?", ["Ma mniejszą gęstość niż woda", "Nie ma masy", "Nie działa na nie grawitacja", "Jest zawsze puste"], 0, "Drewno o gęstości mniejszej od wody może pływać."],
    ["Dlaczego kamień zwykle tonie w wodzie?", ["Ma większą gęstość niż woda", "Nie ma objętości", "Nie działa na niego wypór", "Jest gazem"], 0, "Gęstość kamienia jest zwykle większa od gęstości wody."],
    ["Czy wszystkie metale mają taką samą gęstość?", ["Tak", "Nie", "Tylko w stanie ciekłym", "Tylko w próżni"], 1, "Różne metale mają różne gęstości."],
    ["Co to jest masa?", ["Wielkość fizyczna związana z ilością materii i bezwładnością", "Objętość ciała", "Temperatura ciała", "Długość ciała"], 0, "Masa jest miarą bezwładności ciała."],
    ["Czy masa ciała zmienia się po przeniesieniu na Księżyc?", ["Nie", "Tak, staje się sześć razy większa", "Znika", "Zawsze maleje do zera"], 0, "Masa pozostaje taka sama, choć ciężar jest mniejszy."],
    ["Co to jest ciężar ciała?", ["Siła, z jaką ciało naciska na podłoże lub działa na zawieszenie", "Objętość ciała", "Gęstość ciała", "Temperatura ciała"], 0, "Ciężar jest siłą związaną z oddziaływaniem grawitacyjnym."],
    ["Czy masa i ciężar oznaczają to samo?", ["Tak", "Nie", "Tylko na Ziemi", "Tylko w wodzie"], 1, "Masa i ciężar są różnymi wielkościami fizycznymi."],
    ["Co to jest bezwładność?", ["Zdolność ciała do przeciwstawiania się zmianie ruchu", "Zdolność do świecenia", "Zmiana stanu skupienia", "Rodzaj temperatury"], 0, "Bezwładność wiąże się z oporem ciała wobec zmiany ruchu."],
    ["Które ciało ma większą bezwładność?", ["Ciało o większej masie", "Ciało o mniejszej masie", "Ciała zawsze mają taką samą", "Ciało o większej temperaturze"], 0, "Większa masa oznacza większą bezwładność."],
    ["Co to jest ciśnienie gazu?", ["Skutek zderzeń cząsteczek gazu ze ściankami", "Masa gazu", "Kolor gazu", "Temperatura metalu"], 0, "Cząsteczki gazu uderzają w ścianki naczynia."],
    ["Co się dzieje z ciśnieniem gazu w zamkniętym naczyniu, gdy wzrasta temperatura i objętość jest stała?", ["Zwykle rośnie", "Zawsze maleje", "Nie zmienia się", "Spada do zera"], 0, "Szybsze cząsteczki częściej i silniej uderzają w ścianki."],
    ["Co się dzieje z gazem podczas sprężania?", ["Zmniejsza się jego objętość", "Znika jego masa", "Zawsze zamarza", "Zmienia się w metal"], 0, "Sprężanie polega na zmniejszaniu objętości gazu."],
    ["Czy gazy można sprężać?", ["Tak", "Nie", "Tylko pod wodą", "Tylko w kosmosie"], 0, "Gazy można znacznie sprężać."],
    ["Czy ciecze są łatwo ściśliwe?", ["Nie, są bardzo mało ściśliwe", "Tak, jak gazy", "Zawsze znikają", "Nie mają objętości"], 0, "Ciecze są znacznie mniej ściśliwe niż gazy."],
    ["Co to jest plazma?", ["Zjonizowany gaz", "Ciało stałe", "Zamarznięta ciecz", "Mieszanina piasku i wody"], 0, "Plazma zawiera swobodne elektrony i jony."],
    ["Gdzie występuje plazma?", ["W gwiazdach", "W drewnie", "W lodzie", "W zwykłej soli"], 0, "Gwiazdy składają się głównie z plazmy."],
    ["Czy powietrze ma masę?", ["Tak", "Nie", "Tylko w nocy", "Tylko w zamkniętym pokoju"], 0, "Powietrze jest materią i ma masę."],
    ["Czy powietrze zajmuje objętość?", ["Tak", "Nie", "Tylko pod wodą", "Tylko po ogrzaniu"], 0, "Powietrze zajmuje przestrzeń."],
    ["Co to jest próżnia?", ["Obszar bez materii lub z bardzo małą jej ilością", "Rodzaj cieczy", "Gęsty gaz", "Metal"], 0, "Próżnia oznacza brak materii lub jej bardzo małą ilość."],
    ["Czy dźwięk rozchodzi się w próżni?", ["Nie", "Tak", "Tylko bardzo szybko", "Tylko w nocy"], 0, "Dźwięk potrzebuje ośrodka materialnego."],
    ["Czy światło może rozchodzić się w próżni?", ["Tak", "Nie", "Tylko w wodzie", "Tylko w powietrzu"], 0, "Światło elektromagnetyczne rozchodzi się w próżni."],
    ["Co to jest stan skupienia?", ["Postać fizyczna substancji", "Rodzaj masy", "Jednostka siły", "Rodzaj przyrządu"], 0, "Stan skupienia opisuje fizyczną postać materii."],
    ["Ile podstawowych stanów skupienia poznaje się w szkole?", ["Dwa", "Trzy", "Pięć", "Dziesięć"], 1, "Najczęściej omawia się ciała stałe, ciecze i gazy."],
    ["Czy substancja może zmieniać stan skupienia?", ["Tak", "Nie", "Tylko raz", "Tylko w kosmosie"], 0, "Zmiana temperatury lub ciśnienia może powodować zmianę stanu skupienia."],
    ["Czy podczas topnienia czystej substancji temperatura może pozostawać stała?", ["Tak, podczas przemiany fazowej", "Nie, zawsze rośnie", "Zawsze spada", "Znika"], 0, "Podczas topnienia czystej substancji temperatura pozostaje stała przy stałym ciśnieniu."],
    ["Czy podczas wrzenia czystej cieczy temperatura może pozostawać stała?", ["Tak, przy stałym ciśnieniu", "Nie, zawsze rośnie", "Zawsze spada", "Zależy od koloru"], 0, "Podczas wrzenia temperatura czystej substancji pozostaje stała przy stałym ciśnieniu."],
    ["Czy parowanie zachodzi tylko w temperaturze wrzenia?", ["Nie, może zachodzić w każdej temperaturze", "Tak", "Tylko poniżej zera", "Tylko w próżni"], 0, "Parowanie zachodzi z powierzchni cieczy w różnych temperaturach."],
    ["Gdzie zachodzi parowanie?", ["Na powierzchni cieczy", "W całej objętości wyłącznie", "Tylko na dnie", "W jądrze atomu"], 0, "Parowanie zachodzi na powierzchni cieczy."],
    ["Gdzie zachodzi wrzenie?", ["W całej objętości cieczy", "Tylko na powierzchni", "Tylko na dnie", "Poza cieczą"], 0, "Podczas wrzenia pęcherzyki pary powstają w całej objętości cieczy."],
    ["Co przyspiesza parowanie?", ["Wyższa temperatura", "Niższa powierzchnia", "Brak ruchu powietrza zawsze", "Zmniejszenie temperatury"], 0, "Wyższa temperatura przyspiesza parowanie."],
    ["Co jeszcze przyspiesza parowanie?", ["Większa powierzchnia cieczy", "Mniejsza powierzchnia", "Zamknięcie naczynia", "Obniżenie temperatury"], 0, "Większa powierzchnia ułatwia ucieczkę cząsteczek."],
    ["Dlaczego mokre ubrania schną szybciej na wietrze?", ["Wiatr usuwa wilgotne powietrze znad tkaniny", "Wiatr zwiększa masę wody", "Wiatr zamienia wodę w lód", "Wiatr zatrzymuje parowanie"], 0, "Ruch powietrza przyspiesza parowanie."],
    ["Dlaczego woda w górach wrze w niższej temperaturze?", ["Ciśnienie atmosferyczne jest niższe", "Grawitacja znika", "Woda ma inną masę", "Powietrze nie istnieje"], 0, "Niższe ciśnienie obniża temperaturę wrzenia."],
    ["Co to jest temperatura wrzenia?", ["Temperatura, w której ciecz wrze", "Temperatura zamarzania", "Temperatura topnienia metalu zawsze", "Temperatura ciała człowieka"], 0, "To temperatura rozpoczęcia wrzenia przy danym ciśnieniu."],
    ["Co to jest temperatura topnienia?", ["Temperatura, w której ciało stałe zaczyna się topić", "Temperatura wrzenia", "Temperatura powietrza", "Temperatura zamarzania gazu"], 0, "Temperatura topnienia określa przejście ciała stałego w ciecz."],
    ["Czy lód i ciekła woda mogą występować jednocześnie?", ["Tak", "Nie", "Tylko w próżni", "Tylko przy 100°C"], 0, "W pobliżu temperatury topnienia mogą współistnieć lód i woda."],
    ["Co to jest kryształ?", ["Ciało stałe o uporządkowanej strukturze", "Rodzaj gazu", "Ciecz bez objętości", "Mieszanina powietrza"], 0, "W krysztale cząstki są uporządkowane w strukturze."],
    ["Czy szkło jest ciałem stałym?", ["Tak", "Nie, jest gazem", "Jest cieczą w temperaturze pokojowej", "Jest plazmą"], 0, "Szkło w temperaturze pokojowej jest ciałem stałym, amorficznym."],
    ["Co oznacza, że ciało jest sprężyste?", ["Może wrócić do pierwotnego kształtu po usunięciu siły", "Zawsze pęka", "Nie ma masy", "Zawsze paruje"], 0, "Ciało sprężyste odzyskuje kształt po ustaniu odkształcenia."],
    ["Co to jest odkształcenie?", ["Zmiana kształtu lub wymiarów ciała", "Zmiana jednostki", "Zmiana koloru światła", "Pomiar czasu"], 0, "Odkształcenie oznacza zmianę kształtu lub wymiarów."],
    ["Co to jest ciało plastyczne?", ["Ciało, które zachowuje odkształcenie po ustaniu siły", "Ciało zawsze sprężyste", "Gaz", "Ciecz"], 0, "Ciało plastyczne nie wraca całkowicie do pierwotnego kształtu."],
    ["Co to jest twardość materiału?", ["Odporność na zarysowanie lub wgniatanie", "Jego temperatura", "Jego objętość", "Jego prędkość"], 0, "Twardość opisuje odporność materiału na uszkodzenia powierzchni."],
    ["Który materiał jest zwykle dobrym izolatorem elektrycznym?", ["Guma", "Miedź", "Aluminium", "Srebro"], 0, "Guma słabo przewodzi prąd elektryczny."],
    ["Który materiał jest dobrym przewodnikiem elektrycznym?", ["Miedź", "Guma", "Szkło", "Drewno suche"], 0, "Miedź dobrze przewodzi prąd."],
    ["Czy wszystkie ciała stałe przewodzą prąd?", ["Nie", "Tak", "Tylko małe", "Tylko przezroczyste"], 0, "Wiele ciał stałych jest izolatorami."],
    ["Czy woda destylowana przewodzi prąd tak dobrze jak metal?", ["Nie", "Tak", "Lepiej niż miedź", "Jest nadprzewodnikiem"], 0, "Czysta woda destylowana przewodzi prąd bardzo słabo."],
    ["Dlaczego słona woda przewodzi prąd?", ["Zawiera ruchliwe jony", "Zawiera wyłącznie cząsteczki cukru", "Nie ma cząsteczek", "Jest metalem"], 0, "Rozpuszczone jony umożliwiają przewodzenie prądu."],
    ["Co to jest korozja?", ["Stopniowe niszczenie materiału wskutek reakcji z otoczeniem", "Topnienie lodu", "Parowanie wody", "Ruch cząsteczek gazu"], 0, "Korozja to niszczenie materiału, np. rdza na żelazie."],
    ["Co powstaje podczas rdzewienia żelaza?", ["Tlenki żelaza", "Czysta miedź", "Sól kuchenna", "Wodór"], 0, "Rdza składa się głównie z uwodnionych tlenków żelaza."],
    ["Co może przyspieszać rdzewienie żelaza?", ["Wilgoć i tlen", "Próżnia", "Brak wody", "Suchy azot"], 0, "Wilgoć i tlen sprzyjają korozji żelaza."],
    ["Dlaczego aluminium często jest odporne na dalszą korozję?", ["Tworzy ochronną warstwę tlenku", "Nie reaguje z niczym", "Nie ma atomów", "Jest gazem"], 0, "Warstwa tlenku aluminium chroni metal przed dalszym utlenianiem."],
    ["Co to jest stop metali?", ["Mieszanina metalu z innymi pierwiastkami", "Czysty gaz", "Rodzaj cieczy", "Pojedynczy atom"], 0, "Stop to materiał zawierający co najmniej jeden metal i inne składniki."],
    ["Z czego głównie składa się stal?", ["Z żelaza i węgla", "Z miedzi i złota", "Z tlenu i helu", "Z sodu i chloru"], 0, "Stal jest stopem żelaza z węglem."],
    ["Co to jest mosiądz?", ["Stop miedzi i cynku", "Stop żelaza i węgla", "Czyste aluminium", "Związek wodoru i tlenu"], 0, "Mosiądz jest stopem miedzi i cynku."],
    ["Co to jest brąz?", ["Stop miedzi i cyny", "Stop żelaza i tlenu", "Czyste srebro", "Mieszanina wody i soli"], 0, "Brąz tradycyjnie jest stopem miedzi i cyny."],
    ["Który materiał jest naturalnym izolatorem cieplnym?", ["Wełna", "Miedź", "Aluminium", "Srebro"], 0, "Wełna zatrzymuje powietrze i ogranicza przepływ ciepła."],
    ["Dlaczego styropian dobrze izoluje?", ["Zawiera dużo uwięzionego powietrza", "Jest zrobiony z metalu", "Ma bardzo dużą gęstość", "Przewodzi ciepło najlepiej"], 0, "Powietrze w strukturze styropianu ogranicza przewodzenie ciepła."],
    ["Który stan skupienia ma zwykle największą ściśliwość?", ["Gazowy", "Ciekły", "Stały", "Wszystkie taką samą"], 0, "Gazy można łatwo sprężać w porównaniu z cieczami i ciałami stałymi."],
    ["Co oznacza, że substancja jest jednorodna?", ["Ma jednakowy skład i właściwości w całej objętości", "Składa się z widocznych warstw", "Jest zawsze gazem", "Nie ma masy"], 0, "Substancja jednorodna ma taki sam skład w każdym miejscu."],
    ["Co jest przykładem mieszaniny niejednorodnej?", ["Piasek z wodą", "Woda destylowana", "Czysty tlen", "Czysta miedź"], 0, "Składniki piasku i wody można odróżnić."],
    ["Co jest przykładem mieszaniny jednorodnej?", ["Sól rozpuszczona w wodzie", "Piasek z wodą", "Olej z wodą", "Żwir z piaskiem"], 0, "Po rozpuszczeniu soli powstaje jednorodny roztwór."],
    ["Czy olej miesza się całkowicie z wodą?", ["Nie", "Tak", "Tylko po zamrożeniu", "Tylko w próżni"], 0, "Olej i woda tworzą oddzielne warstwy."],
    ["Dlaczego olej unosi się na wodzie?", ["Ma mniejszą gęstość", "Ma większą gęstość", "Nie ma masy", "Jest ciałem stałym"], 0, "Olej ma zwykle mniejszą gęstość od wody."],
    ["Co to jest osad?", ["Substancja stała oddzielająca się z cieczy", "Rodzaj gazu", "Jednostka temperatury", "Czysty metal"], 0, "Osad może powstać np. podczas reakcji w roztworze."],
    ["Jak nazywa się oddzielanie składników mieszaniny przez różną temperaturę wrzenia?", ["Destylacja", "Filtracja", "Magnesowanie", "Przesiewanie"], 0, "Destylacja wykorzystuje różnice temperatur wrzenia."],
    ["Jak można oddzielić opiłki żelaza od piasku?", ["Magnesem", "Termometrem", "Linijką", "Wodą destylowaną zawsze"], 0, "Żelazo jest przyciągane przez magnes."],
    ["Jak można oddzielić kamyki od piasku?", ["Przez przesiewanie", "Przez destylację", "Przez parowanie", "Przez skraplanie"], 0, "Sito pozwala oddzielić składniki o różnej wielkości."],
    ["Co to jest rozpuszczalność?", ["Maksymalna ilość substancji, którą można rozpuścić w określonych warunkach", "Masa naczynia", "Temperatura wrzenia", "Objętość gazu"], 0, "Rozpuszczalność określa ilość substancji, która może utworzyć roztwór."],
    ["Czy każdy gaz rozpuszcza się w wodzie tak samo?", ["Nie", "Tak", "Tylko w gorącej wodzie", "Żaden gaz się nie rozpuszcza"], 0, "Różne gazy mają różną rozpuszczalność."],
    ["Co zwykle dzieje się z rozpuszczalnością gazów w wodzie podczas ogrzewania?", ["Maleje", "Rośnie zawsze", "Nie zmienia się", "Staje się nieskończona"], 0, "Wiele gazów gorzej rozpuszcza się w cieplejszej wodzie."],
    ["Dlaczego napój gazowany po ogrzaniu szybciej traci gaz?", ["Dwutlenek węgla gorzej rozpuszcza się w cieplejszym napoju", "Cukier zamienia się w metal", "Woda zwiększa masę", "Tlen zamienia się w sól"], 0, "Wyższa temperatura zmniejsza rozpuszczalność gazu."],
    ["Co oznacza symbol CO₂?", ["Dwutlenek węgla", "Tlen", "Wodór", "Azot"], 0, "CO₂ to cząsteczka z jednym atomem węgla i dwoma tlenu."],
    ["Co oznacza symbol O₂?", ["Tlen cząsteczkowy", "Woda", "Dwutlenek węgla", "Wodór"], 0, "O₂ składa się z dwóch atomów tlenu."],
    ["Co oznacza symbol NaCl?", ["Chlorek sodu", "Woda", "Dwutlenek węgla", "Tlenek żelaza"], 0, "NaCl to sól kuchenna."],
    ["Jaki jest wzór chemiczny amoniaku?", ["NH₃", "H₂O", "CO₂", "O₂"], 0, "Amoniak ma wzór NH₃."],
    ["Jaki jest wzór chemiczny metanu?", ["CH₄", "CO₂", "NaCl", "H₂O"], 0, "Metan ma wzór CH₄."],
    ["Czy atom jest elektrycznie obojętny, gdy ma tyle samo protonów co elektronów?", ["Tak", "Nie", "Tylko w gazie", "Tylko w metalu"], 0, "Ładunki protonów i elektronów równoważą się."],
    ["Jak nazywa się atom, który zyskał lub stracił elektrony?", ["Jon", "Cząsteczka wody", "Neutron", "Izotop zawsze"], 0, "Jon ma ładunek elektryczny wskutek zmiany liczby elektronów."],
    ["Jak nazywa się jon dodatni?", ["Kation", "Anion", "Neutron", "Foton"], 0, "Kation ma ładunek dodatni."],
    ["Jak nazywa się jon ujemny?", ["Anion", "Kation", "Proton", "Atom obojętny"], 0, "Anion ma ładunek ujemny."],
    ["Co to jest izotop?", ["Odmiana atomu o tej samej liczbie protonów, ale innej liczbie neutronów", "Atom bez jądra", "Cząsteczka wody", "Rodzaj mieszaniny"], 0, "Izotopy tego samego pierwiastka różnią się liczbą neutronów."],
    ["Co określa liczba atomowa?", ["Liczbę protonów w jądrze", "Liczbę cząsteczek", "Objętość atomu", "Temperaturę atomu"], 0, "Liczba atomowa jest równa liczbie protonów."],
    ["Co to jest układ okresowy pierwiastków?", ["Tabela pierwiastków chemicznych", "Tabela jednostek SI", "Lista rodzajów energii", "Mapa temperatur"], 0, "Układ okresowy porządkuje pierwiastki chemiczne."],
    ["Czy materia może powstać z niczego w zwykłych procesach fizycznych?", ["Nie", "Tak, zawsze", "Tylko w cieczy", "Tylko w gazie"], 0, "W zwykłych procesach obowiązuje zasada zachowania masy."],
    ["Co mówi zasada zachowania masy w reakcji chemicznej?", ["Łączna masa substratów równa się masie produktów", "Masa zawsze rośnie", "Masa zawsze maleje", "Masa znika"], 0, "W układzie zamkniętym masa jest zachowana."],
    ["Czy podczas zmiany stanu skupienia masa próbki w zamkniętym układzie się zmienia?", ["Nie", "Tak, zawsze rośnie", "Zawsze maleje", "Staje się zerowa"], 0, "Zmiana stanu skupienia nie zmienia ilości substancji."],
    ["Co to jest masa właściwa?", ["Inna nazwa gęstości", "Inna nazwa temperatury", "Jednostka siły", "Rodzaj energii"], 0, "Masa właściwa to dawna nazwa gęstości."],
    ["Jeśli objętość ciała wzrośnie, a masa pozostanie stała, co stanie się z gęstością?", ["Zmniejszy się", "Zwiększy się", "Nie zmieni się", "Będzie równa zeru zawsze"], 0, "Gęstość to masa podzielona przez objętość."],
    ["Jeśli masa ciała wzrośnie, a objętość pozostanie stała, co stanie się z gęstością?", ["Zwiększy się", "Zmniejszy się", "Nie zmieni się", "Zniknie"], 0, "Większa masa przy tej samej objętości oznacza większą gęstość."],
    ["Dwa ciała mają taką samą objętość. Które ma większą gęstość?", ["To o większej masie", "To o mniejszej masie", "Zawsze oba", "To o jaśniejszym kolorze"], 0, "Przy tej samej objętości większa masa oznacza większą gęstość."],
    ["Dwa ciała mają taką samą masę. Które ma większą gęstość?", ["To o mniejszej objętości", "To o większej objętości", "Zawsze oba", "To o większej temperaturze"], 0, "Przy tej samej masie mniejsza objętość oznacza większą gęstość."],
    ["Co stanie się z lodem w temperaturze pokojowej?", ["Zacznie topnieć", "Zacznie wrzeć", "Zamieni się w metal", "Zniknie bez śladu"], 0, "Lód ogrzewa się i przechodzi w wodę."],
    ["Dlaczego lód pływa po wodzie?", ["Ma mniejszą gęstość niż ciekła woda", "Ma większą gęstość niż woda", "Nie ma masy", "Jest gazem"], 0, "Lód ma mniejszą gęstość niż ciekła woda."],
    ["Czy woda zwiększa objętość podczas zamarzania?", ["Tak", "Nie", "Zawsze zmniejsza", "Zmienia się w gaz"], 0, "Woda rozszerza się podczas zamarzania."],
    ["Jak nazywa się nietypowe zachowanie wody w pobliżu 4°C?", ["Anomalia rozszerzalności wody", "Dyfuzja", "Sublimacja", "Jonizacja"], 0, "Woda ma największą gęstość w pobliżu 4°C."],
    ["Dlaczego jeziora zamarzają najpierw od powierzchni?", ["Lód ma mniejszą gęstość i unosi się", "Woda na dnie jest zawsze zimniejsza", "Grawitacja działa tylko na powierzchni", "Lód jest cięższy od wody"], 0, "Lód unosi się i tworzy warstwę na powierzchni."],
    ["Co oznacza, że substancja jest lotna?", ["Łatwo przechodzi w stan gazowy", "Jest zawsze ciałem stałym", "Nie ma masy", "Nie reaguje z niczym"], 0, "Substancje lotne łatwo parują."],
    ["Co to jest lepkość cieczy?", ["Opór cieczy przeciw płynięciu", "Jej masa", "Jej temperatura wrzenia", "Jej kolor"], 0, "Lepkość opisuje opór wewnętrzny cieczy podczas przepływu."],
    ["Która ciecz jest zwykle bardziej lepka?", ["Miód", "Woda", "Alkohol etylowy", "Benzyna"], 0, "Miód płynie wolniej niż woda z powodu większej lepkości."],
    ["Co to jest napięcie powierzchniowe?", ["Zjawisko związane z siłami międzycząsteczkowymi na powierzchni cieczy", "Jednostka napięcia elektrycznego", "Masa powierzchni", "Rodzaj ciśnienia gazu"], 0, "Napięcie powierzchniowe wynika z oddziaływań cząsteczek cieczy."],
    ["Dlaczego niektóre owady mogą chodzić po powierzchni wody?", ["Dzięki napięciu powierzchniowemu", "Dzięki temu, że nie mają masy", "Dzięki wrzeniu wody", "Dzięki próżni"], 0, "Napięcie powierzchniowe może utrzymać lekkie owady."],
    ["Co to jest menisk?", ["Zakrzewiona powierzchnia cieczy przy ściankach naczynia", "Rodzaj atomu", "Jednostka objętości", "Rodzaj gazu"], 0, "Menisk to zakrzywienie powierzchni cieczy w naczyniu."],
    ["Co to jest kapilarność?", ["Podnoszenie lub obniżanie cieczy w wąskich rurkach", "Zmiana masy", "Przewodzenie prądu", "Ruch planet"], 0, "Kapilarność wynika z napięcia powierzchniowego i oddziaływań z powierzchnią."],
    ["Dlaczego woda może podciągać się w cienkiej rurce?", ["Dzięki zjawisku kapilarności", "Dzięki zamarzaniu", "Dzięki sile magnetycznej", "Dzięki światłu"], 0, "Woda może unosić się w wąskich rurkach wskutek kapilarności."],
    ["Co to jest porowatość materiału?", ["Obecność małych przestrzeni i porów", "Jego temperatura", "Jego kolor", "Jego prędkość"], 0, "Pory to niewielkie przestrzenie wewnątrz materiału."],
    ["Dlaczego gąbka może wchłaniać wodę?", ["Ma liczne pory", "Jest metalem", "Nie ma objętości", "Jest gazem"], 0, "Pory gąbki mogą zatrzymywać wodę."],
    ["Co oznacza, że materiał jest higroskopijny?", ["Pochłania wilgoć z otoczenia", "Nie ma masy", "Zawsze przewodzi prąd", "Nie zmienia objętości"], 0, "Materiały higroskopijne pochłaniają wilgoć."],
    ["Która substancja jest higroskopijna?", ["Żel krzemionkowy", "Szkło", "Miedź", "Złoto"], 0, "Żel krzemionkowy pochłania wilgoć i jest używany jako pochłaniacz."],
    ["Co to jest materiał kompozytowy?", ["Materiał złożony z co najmniej dwóch różnych składników", "Czysty pierwiastek", "Rodzaj gazu", "Pojedyncza cząsteczka"], 0, "Kompozyt łączy składniki o różnych właściwościach."],
    ["Przykładem kompozytu jest:", ["Żelbet", "Czysta miedź", "Woda destylowana", "Tlen"], 0, "Żelbet łączy beton i stal."],
    ["Co jest głównym składnikiem szkła sodowo-wapniowego?", ["Krzemionka", "Żelazo", "Węgiel", "Miedź"], 0, "Podstawowym składnikiem szkła jest krzemionka."],
    ["Z czego wytwarza się papier?", ["Głównie z włókien celulozowych", "Z czystego żelaza", "Z helu", "Z rtęci"], 0, "Papier powstaje głównie z włókien celulozy."],
    ["Co to jest celuloza?", ["Substancja budująca ściany komórkowe roślin", "Rodzaj metalu", "Gaz szlachetny", "Jednostka masy"], 0, "Celuloza jest składnikiem ścian komórkowych roślin."],
    ["Co to jest biodegradacja?", ["Rozkład substancji przez organizmy", "Topnienie metalu", "Zamarzanie wody", "Pomiar gęstości"], 0, "Biodegradacja to rozkład przez mikroorganizmy i inne organizmy."],
    ["Który materiał jest zwykle biodegradowalny?", ["Papier", "Szkło", "Aluminium", "Polietylen zawsze"], 0, "Papier może ulegać biodegradacji."],
    ["Czy szkło rozkłada się biologicznie tak jak papier?", ["Nie", "Tak", "Tylko w wodzie", "Tylko w ciemności"], 0, "Szkło nie ulega typowej biodegradacji."],
    ["Co to jest recykling?", ["Ponowne przetwarzanie odpadów", "Spalanie wszystkich materiałów", "Zwiększanie masy", "Zamiana ciał w gaz"], 0, "Recykling pozwala odzyskiwać surowce."],
    ["Dlaczego warto segregować odpady?", ["Ułatwia odzysk i recykling materiałów", "Zwiększa ilość śmieci", "Zmienia masę atomów", "Zatrzymuje dyfuzję"], 0, "Segregacja ułatwia ponowne wykorzystanie surowców."],
    ["Co to jest surowiec?", ["Materiał wykorzystywany do produkcji", "Jednostka temperatury", "Rodzaj fali", "Przyrząd pomiarowy"], 0, "Surowce służą do wytwarzania produktów."],
    ["Który z podanych materiałów jest metalem?", ["Aluminium", "Szkło", "Drewno", "Guma"], 0, "Aluminium jest metalem."],
    ["Który z podanych materiałów jest niemetalem?", ["Siarka", "Miedź", "Żelazo", "Aluminium"], 0, "Siarka jest niemetalem."],
    ["Który materiał jest przezroczysty?", ["Czyste szkło", "Drewno", "Beton", "Stal"], 0, "Czyste szkło przepuszcza światło."],
    ["Który materiał jest zwykle nieprzezroczysty?", ["Drewno", "Czyste szkło", "Czysta woda", "Powietrze"], 0, "Drewno nie przepuszcza światła w typowych warunkach."],
    ["Co oznacza przewodnictwo cieplne materiału?", ["Zdolność do przekazywania energii cieplnej", "Zdolność do odbijania dźwięku", "Zdolność do ważenia", "Zdolność do świecenia"], 0, "Przewodnictwo cieplne opisuje transport energii cieplnej."],
    ["Który materiał dobrze przewodzi ciepło?", ["Miedź", "Styropian", "Drewno", "Wełna"], 0, "Miedź jest dobrym przewodnikiem ciepła."],
    ["Który materiał jest dobrym izolatorem cieplnym?", ["Styropian", "Miedź", "Srebro", "Aluminium"], 0, "Styropian ogranicza przepływ ciepła."],
    ["Dlaczego uchwyty garnków wykonuje się często z tworzyw izolacyjnych?", ["Aby ograniczyć nagrzewanie uchwytu", "Aby zwiększyć przewodzenie ciepła", "Aby zwiększyć masę garnka", "Aby zmienić stan skupienia"], 0, "Izolator utrudnia przepływ ciepła do dłoni."],
    ["Co to jest przewodnik elektryczny?", ["Materiał, przez który łatwo płynie prąd", "Materiał, który zawsze jest przezroczysty", "Materiał bez atomów", "Rodzaj cieczy"], 0, "Przewodnik umożliwia przepływ ładunków elektrycznych."],
    ["Co to jest izolator elektryczny?", ["Materiał utrudniający przepływ prądu", "Materiał przewodzący najlepiej", "Rodzaj magnesu", "Jednostka energii"], 0, "Izolator ma bardzo mało swobodnych nośników ładunku."],
    ["Który materiał jest izolatorem elektrycznym?", ["Plastik", "Miedź", "Srebro", "Aluminium"], 0, "Plastik jest izolatorem elektrycznym."],
    ["Który materiał jest dobrym przewodnikiem elektrycznym?", ["Srebro", "Guma", "Szkło", "Suchy papier"], 0, "Srebro bardzo dobrze przewodzi prąd."],
    ["Czy materia składa się z cząstek, które są w ciągłym ruchu?", ["Tak", "Nie", "Tylko w gazach", "Tylko w próżni"], 0, "Cząstki materii są w ciągłym ruchu, choć jego charakter zależy od stanu skupienia."],
    ["Co zwykle zwiększa energię kinetyczną cząsteczek?", ["Podwyższenie temperatury", "Obniżenie temperatury", "Zmniejszenie masy naczynia", "Zmiana koloru"], 0, "Wyższa temperatura oznacza większą średnią energię kinetyczną cząsteczek."],
    ["Czy temperatura jest miarą średniej energii ruchu cząsteczek?", ["Tak, w ujęciu mikroskopowym", "Nie", "Jest miarą masy", "Jest miarą długości"], 0, "Temperatura jest związana ze średnią energią kinetyczną chaotycznego ruchu cząstek."],
    ["Co dzieje się z ruchem cząsteczek podczas ochładzania?", ["Średnio zwalnia", "Zawsze przyspiesza", "Zatrzymuje się całkowicie w każdej temperaturze", "Cząsteczki znikają"], 0, "Ochładzanie zmniejsza średnią energię kinetyczną cząsteczek."],
    ["Czy w temperaturze zera bezwzględnego ruch termiczny jest minimalny?", ["Tak", "Nie", "Jest maksymalny", "Nie ma związku z temperaturą"], 0, "Zero bezwzględne to najniższa możliwa temperatura."],
    ["Ile wynosi zero bezwzględne w skali Celsjusza w przybliżeniu?", ["0°C", "-100°C", "-273°C", "273°C"], 2, "Zero bezwzględne to około -273,15°C."],
    ["Jaka jest wartość zera bezwzględnego w kelwinach?", ["0 K", "100 K", "273 K", "373 K"], 0, "Zero bezwzględne wynosi 0 K."],
    ["Co to jest model cząsteczkowy materii?", ["Opis materii jako zbioru cząstek", "Model Układu Słonecznego", "Przyrząd do ważenia", "Rodzaj magnesu"], 0, "Model cząsteczkowy wyjaśnia właściwości materii ruchem i oddziaływaniami cząstek."],
    ["Dlaczego gaz wypełnia całe naczynie?", ["Cząsteczki poruszają się swobodnie i rozprzestrzeniają", "Cząsteczki są nieruchome", "Gaz ma stały kształt", "Gaz nie ma objętości"], 0, "Cząsteczki gazu poruszają się chaotycznie i wypełniają dostępną przestrzeń."],
    ["Dlaczego ciecz przyjmuje kształt naczynia?", ["Jej cząsteczki mogą przemieszczać się względem siebie", "Cząsteczki są nieruchome", "Ciecz nie ma objętości", "Ciecz jest zawsze gazem"], 0, "Cząsteczki cieczy mogą zmieniać wzajemne położenie."],
    ["Dlaczego ciało stałe zachowuje kształt?", ["Cząsteczki są silnie związane i drgają wokół położeń równowagi", "Cząsteczki poruszają się jak gaz", "Nie ma w nim cząsteczek", "Nie działa na nie grawitacja"], 0, "Cząsteczki ciała stałego pozostają blisko siebie."],
    ["Co to jest atomowa teoria budowy materii?", ["Koncepcja, że materia składa się z atomów", "Teoria, że materia składa się tylko ze światła", "Teoria, że nie ma cząsteczek", "Prawo ruchu planet"], 0, "Materia jest zbudowana z atomów i ich połączeń."],
    ["Czy atomy różnych pierwiastków są identyczne?", ["Nie", "Tak, zawsze", "Różnią się tylko kolorem", "Nie mają żadnych różnic"], 0, "Atomy pierwiastków różnią się m.in. liczbą protonów."],
    ["Co określa rodzaj pierwiastka?", ["Liczba protonów w jądrze", "Liczba atomów w próbce", "Temperatura", "Objętość próbki"], 0, "Liczba protonów określa liczbę atomową pierwiastka."],
    ["Czy cząsteczka tlenu O₂ składa się z dwóch atomów?", ["Tak", "Nie", "Z trzech", "Z czterech"], 0, "O₂ zawiera dwa atomy tlenu."],
    ["Czy cząsteczka ozonu O₃ składa się z trzech atomów tlenu?", ["Tak", "Nie", "Z dwóch atomów", "Z jednego atomu"], 0, "Ozon O₃ składa się z trzech atomów tlenu."],
    ["Co jest przykładem czystej substancji?", ["Czysty tlen", "Powietrze", "Woda z piaskiem", "Mleko"], 0, "Czysty tlen jest substancją chemiczną."],
    ["Co jest przykładem mieszaniny?", ["Powietrze", "Czyste złoto", "Czysty tlen", "Woda destylowana"], 0, "Powietrze jest mieszaniną gazów."],
    ["Czy mleko jest mieszaniną?", ["Tak", "Nie, jest pierwiastkiem", "Jest czystym metalem", "Jest gazem"], 0, "Mleko jest złożoną mieszaniną, m.in. emulsją i koloidem."],
    ["Co to jest emulsja?", ["Mieszanina dwóch cieczy, z których jedna jest rozproszona w drugiej", "Czysty pierwiastek", "Rodzaj kryształu", "Gaz szlachetny"], 0, "Emulsja zawiera drobne krople jednej cieczy w drugiej."],
    ["Co to jest zawiesina?", ["Mieszanina, w której cząstki stałe są rozproszone w cieczy", "Czysty gaz", "Stop metali", "Pojedynczy atom"], 0, "W zawiesinie cząstki mogą z czasem opadać."],
    ["Co to jest roztwór?", ["Jednorodna mieszanina", "Zawsze ciało stałe", "Pojedynczy atom", "Rodzaj siły"], 0, "Roztwór jest mieszaniną jednorodną."],
    ["Czy sól rozpuszczona w wodzie tworzy roztwór?", ["Tak", "Nie", "Tworzy metal", "Tworzy gaz"], 0, "Sól rozpuszcza się w wodzie, tworząc roztwór."],
    ["Co stanie się z solą po odparowaniu wody z roztworu?", ["Pozostanie sól", "Sól zniknie", "Sól zamieni się w tlen", "Powstanie miedź"], 0, "Woda odparuje, a sól pozostanie w naczyniu."],
    ["Czy masa roztworu jest sumą masy rozpuszczalnika i substancji rozpuszczonej?", ["Tak, w układzie bez strat", "Nie, zawsze jest mniejsza", "Zawsze jest większa", "Zależy od koloru"], 0, "Masy składników sumują się, jeśli nic nie ucieka z układu."],
],
    cisnienie: [
["Jak obliczamy ciśnienie?", ["p=F/S", "p=m/V", "p=W/t", "p=s/t"], 0, "Ciśnienie to siła nacisku podzielona przez powierzchnię."],
["Jaka jest jednostka ciśnienia w układzie SI?", ["Dżul", "Paskal", "Wat", "Newton"], 1, "Jednostką ciśnienia jest paskal (Pa)."],
["Co oznacza symbol p we wzorach fizycznych?", ["Moc", "Ciśnienie", "Prędkość", "Pracę"], 1, "Symbol p oznacza ciśnienie."],
["Co oznacza symbol F we wzorze p=F/S?", ["Siłę", "Czas", "Masę", "Objętość"], 0, "F oznacza siłę nacisku."],
["Co oznacza symbol S we wzorze na ciśnienie?", ["Drogę", "Powierzchnię", "Prędkość", "Temperaturę"], 1, "S oznacza pole powierzchni, na którą działa siła."],
["Co stanie się z ciśnieniem, gdy zwiększymy siłę nacisku?", ["Zmniejszy się", "Wzrośnie", "Nie zmieni się", "Zniknie"], 1, "Większa siła przy tej samej powierzchni oznacza większe ciśnienie."],
["Co stanie się z ciśnieniem, gdy zwiększymy powierzchnię nacisku?", ["Wzrośnie", "Zmniejszy się", "Podwoi się zawsze", "Nie zmieni się"], 1, "Większa powierzchnia przy tej samej sile zmniejsza ciśnienie."],
["Ile paskali ma jeden kilopaskal?", ["10", "100", "1000", "10000"], 2, "1 kPa = 1000 Pa."],
["Jakim przyrządem mierzymy ciśnienie atmosferyczne?", ["Termometrem", "Barometrem", "Dynamometrem", "Amperomierzem"], 1, "Ciśnienie atmosferyczne mierzymy barometrem."],
["Jak nazywa się ciśnienie wywierane przez powietrze?", ["Hydrostatyczne", "Atmosferyczne", "Elektryczne", "Akustyczne"], 1, "Powietrze wywiera ciśnienie atmosferyczne."],
["Co dzieje się z ciśnieniem cieczy wraz ze wzrostem głębokości?", ["Maleje", "Rośnie", "Nie zmienia się", "Znika"], 1, "Im głębiej, tym większe ciśnienie hydrostatyczne."],
["Od czego zależy ciśnienie hydrostatyczne?", ["Od głębokości i gęstości cieczy", "Od koloru cieczy", "Od kształtu dna", "Od oświetlenia"], 0, "Ciśnienie hydrostatyczne zależy od gęstości cieczy, głębokości i grawitacji."],
["Jaki jest wzór na ciśnienie hydrostatyczne?", ["p=ρgh", "p=F/S", "p=m·a", "p=W/t"], 0, "Ciśnienie hydrostatyczne obliczamy ze wzoru p=ρgh."],
["Co oznacza ρ we wzorze p=ρgh?", ["Prędkość", "Gęstość cieczy", "Ciśnienie", "Moc"], 1, "Rho oznacza gęstość cieczy."],
["Co oznacza h we wzorze na ciśnienie hydrostatyczne?", ["Wysokość słupa cieczy", "Masę", "Czas", "Temperaturę"], 0, "h oznacza głębokość lub wysokość słupa cieczy."],
["Co oznacza g we wzorze p=ρgh?", ["Gęstość", "Przyspieszenie ziemskie", "Objętość", "Siłę tarcia"], 1, "g oznacza przyspieszenie ziemskie."],
["W jakiej cieczy ciśnienie na tej samej głębokości jest większe?", ["W mniej gęstej", "W bardziej gęstej", "Zawsze takie samo", "Zależy od koloru"], 1, "Większa gęstość cieczy oznacza większe ciśnienie hydrostatyczne."],
["Czy ciśnienie hydrostatyczne zależy od kształtu naczynia?", ["Tak", "Nie", "Tylko w wysokim naczyniu", "Tylko w szerokim"], 1, "Na tej samej głębokości w tej samej cieczy ciśnienie jest takie samo."],
["Co to jest siła wyporu?", ["Siła skierowana ku górze działająca na zanurzone ciało", "Siła tarcia", "Siła elektryczna", "Siła magnetyczna"], 0, "Siła wyporu działa przeciwnie do ciężaru."],
["Które prawo opisuje siłę wyporu?", ["Prawo Ohma", "Prawo Archimedesa", "Prawo odbicia", "Prawo Hooke'a"], 1, "Siłę wyporu opisuje prawo Archimedesa."],
["Od czego zależy siła wyporu?", ["Od ciężaru wypartej cieczy", "Od koloru ciała", "Od kształtu planety", "Od temperatury powietrza"], 0, "Siła wyporu jest równa ciężarowi wypartej cieczy."],
["Dlaczego statek może pływać po wodzie?", ["Działa na niego siła wyporu", "Nie ma ciężaru", "Nie działa na niego grawitacja", "Woda nie ma masy"], 0, "Siła wyporu może równoważyć ciężar statku."],
["Kiedy ciało tonie w cieczy?", ["Gdy jego średnia gęstość jest większa od gęstości cieczy", "Gdy jest lekkie", "Gdy ma jasny kolor", "Gdy jest małe"], 0, "Ciało tonie, gdy jego średnia gęstość jest większa od gęstości cieczy."],
["Kiedy ciało pływa zanurzone w cieczy?", ["Gdy siła wyporu równoważy ciężar", "Gdy nie ma masy", "Gdy nie ma objętości", "Gdy nie działa ciśnienie"], 0, "Równowaga sił pozwala ciału utrzymywać się w cieczy."],
["Co dzieje się z ciałem o gęstości mniejszej niż gęstość wody?", ["Zwykle wypływa na powierzchnię", "Zawsze tonie", "Natychmiast paruje", "Zmienia się w gaz"], 0, "Mniejsza średnia gęstość sprzyja pływaniu."],
["Jak nazywa się przyrząd do pomiaru ciśnienia gazu w zamkniętym zbiorniku?", ["Manometr", "Waga", "Linijka", "Stoper"], 0, "Manometr służy do pomiaru ciśnienia gazów i cieczy."],
["Jakie ciśnienie panuje w przybliżeniu na poziomie morza?", ["1013 hPa", "10 hPa", "10 000 hPa", "1 hPa"], 0, "Standardowe ciśnienie atmosferyczne wynosi około 1013 hPa."],
["Co zwykle dzieje się z ciśnieniem atmosferycznym podczas wchodzenia na wysoką górę?", ["Maleje", "Rośnie", "Nie zmienia się", "Staje się zerowe"], 0, "Wraz z wysokością ciśnienie atmosferyczne zazwyczaj maleje."],
["Dlaczego uszy mogą się zatykać podczas lotu samolotem?", ["Zmienia się ciśnienie powietrza", "Zmienia się masa człowieka", "Znika grawitacja", "Zmienia się prędkość światła"], 0, "Zmiany ciśnienia po obu stronach błony bębenkowej powodują uczucie zatkania."],
["Dlaczego ostre noże łatwiej tną?", ["Mają małą powierzchnię ostrza i wywierają duże ciśnienie", "Mają większą masę zawsze", "Nie działają na nie siły", "Zmniejszają tarcie do zera"], 0, "Mała powierzchnia kontaktu zwiększa ciśnienie."],
["Dlaczego narty zmniejszają zapadanie się w śniegu?", ["Rozkładają ciężar na większą powierzchnię", "Zmniejszają grawitację", "Zwiększają masę narciarza", "Usuwają tarcie"], 0, "Większa powierzchnia zmniejsza nacisk na jednostkę powierzchni."],
["Dlaczego gąsienice czołgu są szerokie?", ["Aby zmniejszyć ciśnienie na podłoże", "Aby zwiększyć ciężar", "Aby zmniejszyć objętość", "Aby zwiększyć temperaturę"], 0, "Szerokie gąsienice rozkładają ciężar na większą powierzchnię."],
["Dlaczego szpilka ma ostry koniec?", ["Aby uzyskać duże ciśnienie na małej powierzchni", "Aby zmniejszyć siłę", "Aby zwiększyć masę", "Aby zmniejszyć temperaturę"], 0, "Mała powierzchnia ostrza powoduje duże ciśnienie."],
["Co to jest próżnia?", ["Obszar o bardzo małej ilości cząsteczek", "Bardzo gęsta ciecz", "Rodzaj metalu", "Rodzaj ciśnienia"], 0, "Próżnia to przestrzeń, w której jest bardzo mało materii."],
["Czy w próżni występuje ciśnienie atmosferyczne?", ["Nie, nie ma tam atmosfery", "Tak, zawsze takie samo", "Tylko w nocy", "Tylko blisko Ziemi"], 0, "Ciśnienie atmosferyczne pochodzi od atmosfery."],
["Co pokazuje doświadczenie z półkulami magdeburskimi?", ["Działanie ciśnienia atmosferycznego", "Prawo Ohma", "Rozchodzenie się światła", "Przewodnictwo cieplne"], 0, "Ciśnienie atmosferyczne mocno dociska połączone półkule."],
["Co to jest ciśnienie bezwzględne?", ["Ciśnienie liczone względem próżni", "Ciśnienie liczone tylko względem wody", "Ciśnienie w oponie bez jednostki", "Ciśnienie wyłącznie atmosferyczne"], 0, "Ciśnienie bezwzględne jest odniesione do próżni."],
["Co to jest ciśnienie względne?", ["Różnica między ciśnieniem bezwzględnym a atmosferycznym", "Ciśnienie w próżni", "Ciśnienie hydrostatyczne zawsze", "Ciśnienie bez jednostki"], 0, "Ciśnienie względne określa różnicę względem atmosfery."],
["W jakiej jednostce można podać ciśnienie?", ["Pa", "kg", "m/s", "J"], 0, "Paskal jest jednostką ciśnienia."],
["Ile paskali to 1 hektopaskal?", ["10 Pa", "100 Pa", "1000 Pa", "10 000 Pa"], 1, "1 hPa = 100 Pa."],
["Ile paskali to 2 kPa?", ["20 Pa", "200 Pa", "2000 Pa", "20 000 Pa"], 2, "2 kPa = 2000 Pa."],
["Siła 100 N działa na powierzchnię 1 m². Jakie jest ciśnienie?", ["10 Pa", "100 Pa", "1000 Pa", "1 Pa"], 1, "p=100 N/1 m²=100 Pa."],
["Siła 200 N działa na 2 m². Jakie jest ciśnienie?", ["50 Pa", "100 Pa", "200 Pa", "400 Pa"], 1, "p=200/2=100 Pa."],
["Siła 50 N działa na 0,5 m². Jakie jest ciśnienie?", ["25 Pa", "50 Pa", "100 Pa", "250 Pa"], 1, "p=50/0,5=100 Pa."],
["Ciśnienie wynosi 100 Pa, a powierzchnia 2 m². Jaka działa siła?", ["50 N", "100 N", "200 N", "400 N"], 2, "F=p·S=100·2=200 N."],
["Ciśnienie wynosi 500 Pa, a powierzchnia 0,2 m². Jaka działa siła?", ["10 N", "50 N", "100 N", "250 N"], 2, "F=500·0,2=100 N."],
["Siła 300 N wywiera ciśnienie 100 Pa. Jaka jest powierzchnia?", ["0,3 m²", "3 m²", "30 m²", "300 m²"], 1, "S=F/p=300/100=3 m²."],
["Siła 100 N działa na 0,01 m². Jakie jest ciśnienie?", ["100 Pa", "1000 Pa", "10 000 Pa", "100 000 Pa"], 2, "p=100/0,01=10 000 Pa."],
["Jeśli siła wzrośnie dwukrotnie, a powierzchnia pozostanie taka sama, ciśnienie:", ["Zmniejszy się dwukrotnie", "Wzrośnie dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 1, "Ciśnienie jest wprost proporcjonalne do siły."],
["Jeśli powierzchnia wzrośnie dwukrotnie, a siła pozostanie taka sama, ciśnienie:", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 1, "Ciśnienie jest odwrotnie proporcjonalne do powierzchni."],
["Jeśli siła i powierzchnia wzrosną dwukrotnie, ciśnienie:", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 2, "Takie same proporcjonalne zmiany siły i powierzchni nie zmieniają ciśnienia."],
["Jak nazywa się zjawisko przekazywania ciśnienia w cieczy?", ["Prawo Pascala", "Prawo Archimedesa", "Prawo Ohma", "Prawo Newtona"], 0, "Prawo Pascala opisuje przekazywanie ciśnienia w zamkniętej cieczy."],
["Co mówi prawo Pascala?", ["Ciśnienie wywierane na ciecz w zamkniętym naczyniu rozchodzi się jednakowo we wszystkich kierunkach", "Ciśnienie zawsze maleje", "Ciecze nie wywierają ciśnienia", "Siła wyporu jest zerowa"], 0, "Zmiana ciśnienia w zamkniętej cieczy jest przekazywana w każdym kierunku."],
["Gdzie wykorzystuje się prawo Pascala?", ["W prasie hydraulicznej", "W termometrze", "W kompasie", "W lornetce"], 0, "Prasa hydrauliczna wykorzystuje przekazywanie ciśnienia przez ciecz."],
["Jak działa podnośnik hydrauliczny?", ["Wykorzystuje ciśnienie cieczy", "Wykorzystuje wyłącznie magnes", "Wykorzystuje światło", "Wykorzystuje parowanie"], 0, "Ciśnienie cieczy pozwala uzyskać dużą siłę na większym tłoku."],
["W którym miejscu cieczy ciśnienie jest największe?", ["Najbliżej powierzchni", "Najgłębiej", "Wszędzie takie samo", "Pośrodku zawsze"], 1, "Ciśnienie hydrostatyczne rośnie z głębokością."],
["Czy ciśnienie cieczy działa tylko w dół?", ["Tak", "Nie, działa we wszystkich kierunkach", "Tylko w górę", "Tylko na dno"], 1, "Ciśnienie w cieczy działa we wszystkich kierunkach."],
["Dlaczego tamy są grubsze u dołu?", ["Bo ciśnienie wody jest większe na większej głębokości", "Bo woda jest cięższa na dnie", "Bo na górze nie ma wody", "Bo grawitacja działa tylko na dole"], 0, "Dolna część tamy musi wytrzymać większe ciśnienie."],
["Co stanie się z ciśnieniem na tej samej głębokości po zmianie kształtu naczynia?", ["Zmieni się zawsze", "Nie zmieni się, jeśli ciecz i głębokość są takie same", "Zniknie", "Zależy od koloru naczynia"], 1, "Ciśnienie hydrostatyczne nie zależy od kształtu naczynia."],
["Która ciecz wywiera większe ciśnienie na tej samej głębokości: woda czy rtęć?", ["Woda", "Rtęć", "Takie samo", "Żadna"], 1, "Rtęć ma znacznie większą gęstość niż woda."],
["Jak zachowuje się siła wyporu podczas zanurzania ciała coraz głębiej w wodzie, gdy ciało jest całkowicie zanurzone?", ["Zwykle pozostaje taka sama", "Zawsze rośnie", "Zawsze maleje", "Staje się zerowa"], 0, "Dla całkowicie zanurzonego ciała w nieściśliwej cieczy siła wyporu nie zależy od głębokości."],
["Co jest równe sile wyporu według prawa Archimedesa?", ["Ciężar wypartej cieczy", "Masa ciała", "Objętość ciała", "Ciśnienie atmosferyczne"], 0, "Siła wyporu jest równa ciężarowi wypartego płynu."],
["Jeśli ciało wypiera więcej wody, siła wyporu:", ["Zwykle jest większa", "Zawsze maleje", "Jest zerowa", "Nie zależy od ilości wody"], 0, "Większa objętość wypartej cieczy oznacza większą siłę wyporu."],
["Co oznacza, że ciało jest w równowadze w cieczy?", ["Siły działające na nie się równoważą", "Nie działa na nie żadna siła", "Nie ma masy", "Nie ma objętości"], 0, "Wypadkowa sił działających na ciało jest równa zeru."],
["Czy powietrze wywiera ciśnienie?", ["Nie", "Tak", "Tylko podczas burzy", "Tylko zimą"], 1, "Powietrze ma masę i wywiera ciśnienie."],
["Dlaczego balon meteorologiczny zwiększa objętość podczas wznoszenia?", ["Na zewnątrz spada ciśnienie", "Rośnie masa gazu", "Znika grawitacja", "Powietrze staje się cieczą"], 0, "Mniejsze ciśnienie zewnętrzne pozwala gazowi rozszerzać balon."],
["Dlaczego opakowania mogą pękać na dużej wysokości?", ["Różnica ciśnień może je rozciągać", "Znika ich masa", "Zwiększa się grawitacja", "Zmienia się ich kolor"], 0, "Różnica między ciśnieniem wewnątrz i na zewnątrz może deformować opakowanie."],
["Co to jest ssanie w potocznym znaczeniu, np. przez słomkę?", ["Obniżenie ciśnienia w ustach, a powietrze naciska na napój", "Zniknięcie grawitacji", "Zwiększenie masy napoju", "Zamiana napoju w gaz"], 0, "Ciśnienie atmosferyczne wypycha napój w górę słomki, gdy ciśnienie w niej jest mniejsze."],
["Czy pompa próżniowa może usunąć całe powietrze z komory?", ["W praktyce można uzyskać bardzo niskie ciśnienie, ale nie idealną próżnię", "Zawsze usuwa wszystko", "Nie usuwa żadnego gazu", "Zamienia powietrze w wodę"], 0, "W praktyce osiąga się próżnię o określonym stopniu."],
["Co dzieje się z temperaturą wrzenia wody na dużej wysokości?", ["Zwykle maleje", "Zawsze rośnie", "Nie zmienia się", "Staje się ujemna"], 0, "Niższe ciśnienie atmosferyczne obniża temperaturę wrzenia wody."],
["Dlaczego w szybkowarze woda może osiągnąć temperaturę powyżej 100°C?", ["Panuje w nim podwyższone ciśnienie", "Nie ma w nim grawitacji", "Woda nie ma masy", "Para jest zimniejsza"], 0, "Wyższe ciśnienie podnosi temperaturę wrzenia wody."],
["Co mierzy barometr?", ["Ciśnienie atmosferyczne", "Masę", "Natężenie prądu", "Długość"], 0, "Barometr służy do pomiaru ciśnienia atmosferycznego."],
["Co mierzy manometr?", ["Ciśnienie gazu lub cieczy", "Temperaturę", "Prędkość", "Moc"], 0, "Manometr mierzy ciśnienie w układach."],
["Jak nazywa się jednostka ciśnienia równa N/m²?", ["Paskal", "Dżul", "Wat", "Om"], 0, "1 Pa = 1 N/m²."],
["Jaki jest symbol jednostki paskal?", ["P", "Pa", "Ps", "Pk"], 1, "Symbol paskala to Pa."],
["Czy 1000 Pa to 1 kPa?", ["Tak", "Nie", "To 10 kPa", "To 100 kPa"], 0, "Przedrostek kilo oznacza tysiąc."],
["Jakie ciśnienie wywiera siła 10 N na powierzchnię 2 m²?", ["5 Pa", "10 Pa", "20 Pa", "40 Pa"], 0, "p=10/2=5 Pa."],
["Jakie ciśnienie wywiera siła 60 N na powierzchnię 3 m²?", ["10 Pa", "20 Pa", "30 Pa", "180 Pa"], 1, "p=60/3=20 Pa."],
["Jakie ciśnienie wywiera siła 400 N na powierzchnię 4 m²?", ["10 Pa", "40 Pa", "100 Pa", "1600 Pa"], 2, "p=400/4=100 Pa."],
["Jakie ciśnienie wywiera siła 1000 N na powierzchnię 0,5 m²?", ["500 Pa", "1000 Pa", "2000 Pa", "5000 Pa"], 2, "p=1000/0,5=2000 Pa."],
["Jaka siła działa na powierzchnię 0,5 m² przy ciśnieniu 200 Pa?", ["50 N", "100 N", "200 N", "400 N"], 1, "F=p·S=200·0,5=100 N."],
["Jaka siła działa na powierzchnię 3 m² przy ciśnieniu 50 Pa?", ["15 N", "53 N", "150 N", "300 N"], 2, "F=50·3=150 N."],
["Jaka powierzchnia jest potrzebna, aby siła 100 N wywołała ciśnienie 20 Pa?", ["2 m²", "5 m²", "20 m²", "200 m²"], 1, "S=F/p=100/20=5 m²."],
["Jaka powierzchnia jest potrzebna, aby siła 60 N wywołała ciśnienie 30 Pa?", ["0,5 m²", "2 m²", "30 m²", "90 m²"], 1, "S=60/30=2 m²."],
["Jakie ciśnienie wywiera siła 20 N na 0,1 m²?", ["2 Pa", "20 Pa", "200 Pa", "2000 Pa"], 2, "p=20/0,1=200 Pa."],
["Jakie ciśnienie wywiera siła 5 N na 0,01 m²?", ["5 Pa", "50 Pa", "500 Pa", "5000 Pa"], 2, "p=5/0,01=500 Pa."],
["Jeśli powierzchnia zmaleje czterokrotnie przy tej samej sile, ciśnienie:", ["Zmaleje czterokrotnie", "Wzrośnie czterokrotnie", "Nie zmieni się", "Zniknie"], 1, "Mniejsza powierzchnia powoduje większe ciśnienie."],
["Jeśli siła zmaleje dwukrotnie przy tej samej powierzchni, ciśnienie:", ["Zmaleje dwukrotnie", "Wzrośnie dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Ciśnienie jest proporcjonalne do siły."],
["Które ciało wywiera większe ciśnienie przy takim samym ciężarze?", ["Stojące na mniejszej powierzchni", "Stojące na większej powierzchni", "Oba zawsze takie samo", "To zależy od koloru"], 0, "Mniejsza powierzchnia oznacza większe ciśnienie."],
["Dlaczego budynki mają szerokie fundamenty?", ["Aby rozłożyć ciężar na większej powierzchni", "Aby zwiększyć ciśnienie", "Aby zmniejszyć grawitację", "Aby zwiększyć temperaturę"], 0, "Większa powierzchnia fundamentów zmniejsza nacisk na grunt."],
["Dlaczego człowiek na rakietach śnieżnych mniej zapada się w śniegu?", ["Zwiększa powierzchnię podparcia", "Zmniejsza swoją masę", "Zwiększa grawitację", "Zmniejsza objętość śniegu"], 0, "Większa powierzchnia zmniejsza ciśnienie."],
["Czy ciśnienie w cieczy na tej samej głębokości jest takie samo w każdym kierunku?", ["Tak", "Nie", "Tylko w dół", "Tylko w górę"], 0, "W spoczywającej cieczy ciśnienie w punkcie działa jednakowo we wszystkich kierunkach."],
["Jak nazywa się powierzchnia cieczy pozostającej w spoczynku?", ["Swobodna powierzchnia cieczy", "Powierzchnia tarcia", "Powierzchnia magnetyczna", "Ognisko"], 0, "To granica cieczy i otaczającego ją gazu."],
["Co wpływa na wartość ciśnienia atmosferycznego?", ["Wysokość nad poziomem morza i warunki pogodowe", "Kolor nieba wyłącznie", "Masa człowieka", "Długość dnia"], 0, "Ciśnienie atmosferyczne zależy m.in. od wysokości i pogody."],
["Czy ciśnienie atmosferyczne jest większe na poziomie morza niż na wysokiej górze?", ["Zwykle tak", "Zwykle nie", "Jest zawsze identyczne", "Na górze wynosi zero"], 0, "Na większej wysokości nad poziomem morza ciśnienie zwykle jest niższe."],
["Co powoduje nacisk powietrza na powierzchnię Ziemi?", ["Ciężar atmosfery", "Światło słoneczne wyłącznie", "Pole magnetyczne", "Ruch Księżyca"], 0, "Atmosfera ma masę, a grawitacja nadaje jej ciężar."],
["Czy ciśnienie atmosferyczne działa na człowieka?", ["Tak, z każdej strony", "Nie", "Tylko na głowę", "Tylko na stopy"], 0, "Powietrze naciska na ciało ze wszystkich stron."],
["Dlaczego człowiek nie jest zgniatany przez ciśnienie atmosferyczne?", ["Ciśnienie wewnętrzne organizmu równoważy ciśnienie zewnętrzne", "Nie działa grawitacja", "Człowiek nie ma objętości", "Powietrze nie ma masy"], 0, "Ciśnienia po obu stronach tkanek w dużej mierze się równoważą."],
["Co oznacza skrót hPa?", ["Hektopaskal", "Hektometr", "Herc na amper", "Hydroaktywny paskal"], 0, "hPa to hektopaskal, czyli 100 paskali."],
["Jak zmienia się ciśnienie hydrostatyczne, gdy głębokość wzrośnie dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Ciśnienie hydrostatyczne jest proporcjonalne do głębokości."],
["Jak zmienia się ciśnienie hydrostatyczne, gdy gęstość cieczy wzrośnie dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Zniknie"], 0, "Ciśnienie hydrostatyczne jest proporcjonalne do gęstości cieczy."],
["Jakie ciśnienie hydrostatyczne wywiera woda na głębokości 1 m? Przyjmij ρ=1000 kg/m³ i g≈10 m/s².", ["1000 Pa", "5000 Pa", "10 000 Pa", "100 000 Pa"], 2, "p=1000·10·1=10 000 Pa."],
["Jakie ciśnienie hydrostatyczne wywiera woda na głębokości 2 m? Przyjmij g≈10 m/s².", ["2000 Pa", "10 000 Pa", "20 000 Pa", "40 000 Pa"], 2, "p=1000·10·2=20 000 Pa."],
["Jakie ciśnienie hydrostatyczne wywiera woda na głębokości 5 m? Przyjmij g≈10 m/s².", ["5000 Pa", "10 000 Pa", "50 000 Pa", "100 000 Pa"], 2, "p=1000·10·5=50 000 Pa."],
["Na jakiej głębokości w wodzie ciśnienie hydrostatyczne wynosi 20 000 Pa? Przyjmij g≈10 m/s².", ["1 m", "2 m", "4 m", "20 m"], 1, "h=p/(ρg)=20 000/(1000·10)=2 m."],
["Jakie ciśnienie hydrostatyczne wywiera ciecz o gęstości 800 kg/m³ na głębokości 2 m? Przyjmij g≈10 m/s².", ["800 Pa", "1600 Pa", "8000 Pa", "16 000 Pa"], 3, "p=800·10·2=16 000 Pa."],
["Jaka jest główna przyczyna działania siły wyporu?", ["Różnica ciśnień działających na różne części zanurzonego ciała", "Brak grawitacji", "Tarcie o dno", "Pole magnetyczne"], 0, "Ciśnienie na większej głębokości jest większe, co daje wypadkową siłę ku górze."],
["Czy siła wyporu działa w gazach?", ["Tak", "Nie", "Tylko w próżni", "Tylko w wodzie"], 0, "Powietrze również wywiera siłę wyporu."],
["Dlaczego balon z helem unosi się w powietrzu?", ["Siła wyporu jest większa od ciężaru balonu", "Hel nie ma masy", "Nie działa grawitacja", "Balon nie ma objętości"], 0, "Balon wypiera powietrze, a siła wyporu może przewyższyć jego ciężar."],
["Który gaz jest zwykle lżejszy od powietrza i może unosić balony?", ["Hel", "Dwutlenek węgla", "Tlen", "Argon"], 0, "Hel ma mniejszą gęstość niż powietrze."],
["Co stanie się z balonem wypełnionym powietrzem, jeśli jego średnia gęstość jest większa od otoczenia?", ["Opadnie", "Wzniesie się", "Zatrzyma czas", "Zniknie"], 0, "Jeśli ciężar przewyższa siłę wyporu, balon opada."],
["Dlaczego łódź podwodna może zanurzać się i wynurzać?", ["Zmienia ilość wody w zbiornikach balastowych", "Wyłącza grawitację", "Zmienia kolor", "Usuwa wodę z oceanu"], 0, "Zmiana ilości wody w zbiornikach zmienia średnią gęstość łodzi."],
["Co oznacza, że ciało ma pływalność dodatnią?", ["Siła wyporu może przewyższać ciężar", "Ciało zawsze tonie", "Ciało nie ma masy", "Nie działa na nie ciśnienie"], 0, "Dodatnia pływalność oznacza tendencję do unoszenia się."],
["Co oznacza, że ciało ma pływalność ujemną?", ["Jego ciężar przewyższa siłę wyporu", "Nie ma objętości", "Nie ma gęstości", "Zawsze unosi się"], 0, "Ujemna pływalność powoduje opadanie."],
["Co oznacza pływalność obojętna?", ["Ciężar jest równy sile wyporu", "Siła wyporu jest zerowa", "Ciężar jest zerowy", "Ciało natychmiast tonie"], 0, "Przy pływalności obojętnej ciało pozostaje na tej samej głębokości."],
["Czy woda w jeziorze wywiera ciśnienie na ściany zbiornika?", ["Tak", "Nie", "Tylko na dno", "Tylko podczas deszczu"], 0, "Ciecz wywiera ciśnienie na dno i ściany naczynia."],
["Dlaczego otwór w dolnej części zbiornika wyrzuca wodę dalej niż otwór u góry?", ["Ciśnienie wody jest tam większe", "Woda jest tam lżejsza", "Grawitacja tam nie działa", "Temperatura jest zawsze większa"], 0, "Większa głębokość oznacza większe ciśnienie hydrostatyczne."]
],
   ruch: [
["Jak obliczamy prędkość?", ["v=s/t", "v=F/m", "v=m/V", "v=W/t"], 0, "Prędkość to droga podzielona przez czas."],
["Jaka jest jednostka prędkości w układzie SI?", ["km/h", "m/s", "kg", "N"], 1, "Jednostką SI jest metr na sekundę."],
["Co oznacza symbol v?", ["Prędkość", "Siłę", "Masę", "Czas"], 0, "v oznacza prędkość."],
["Co oznacza symbol s we wzorze v=s/t?", ["Czas", "Drogę", "Prędkość", "Przyspieszenie"], 1, "s oznacza przebytą drogę."],
["Co oznacza symbol t?", ["Temperaturę", "Czas", "Siłę", "Masę"], 1, "t oznacza czas."],
["Jak obliczamy drogę w ruchu jednostajnym?", ["s=v·t", "s=v/t", "s=t/v", "s=F·m"], 0, "Drogę obliczamy, mnożąc prędkość przez czas."],
["Jak obliczamy czas ruchu przy znanej drodze i prędkości?", ["t=s/v", "t=s·v", "t=v/s", "t=F·s"], 0, "Czas to droga podzielona przez prędkość."],
["Co oznacza ruch jednostajny?", ["Ruch ze stałą prędkością", "Ruch bez czasu", "Ruch bez drogi", "Ruch ze stale rosnącą masą"], 0, "W ruchu jednostajnym prędkość się nie zmienia."],
["Co oznacza ruch zmienny?", ["Prędkość zmienia się w czasie", "Prędkość zawsze wynosi zero", "Ciało nie zmienia położenia", "Nie działa grawitacja"], 0, "W ruchu zmiennym prędkość nie jest stała."],
["Co to jest przyspieszenie?", ["Zmiana prędkości w czasie", "Droga podzielona przez masę", "Siła podzielona przez powierzchnię", "Masa razy objętość"], 0, "Przyspieszenie opisuje, jak szybko zmienia się prędkość."],
["Jaka jest jednostka przyspieszenia SI?", ["m/s", "m/s²", "km", "kg/s"], 1, "Jednostką przyspieszenia jest metr na sekundę do kwadratu."],
["Jak obliczamy przyspieszenie?", ["a=Δv/t", "a=s·t", "a=m/V", "a=W/t"], 0, "Przyspieszenie to zmiana prędkości podzielona przez czas."],
["Co oznacza ruch prostoliniowy?", ["Ruch po linii prostej", "Ruch po okręgu", "Ruch bez zmiany położenia", "Ruch tylko w dół"], 0, "Tor ruchu jest linią prostą."],
["Co oznacza tor ruchu?", ["Linia, po której porusza się ciało", "Masa ciała", "Czas ruchu", "Siła działająca na ciało"], 0, "Tor to linia wyznaczana przez kolejne położenia ciała."],
["Co to jest droga?", ["Długość przebytego toru", "Zmiana temperatury", "Masa ciała", "Siła ciężkości"], 0, "Droga określa długość przebytej trasy."],
["Co to jest przemieszczenie?", ["Zmiana położenia wraz z kierunkiem", "Całkowita długość toru zawsze", "Masa razy prędkość", "Czas ruchu"], 0, "Przemieszczenie jest wektorem od położenia początkowego do końcowego."],
["Czy droga i przemieszczenie zawsze są sobie równe?", ["Tak", "Nie", "Tylko w ruchu po okręgu", "Tylko podczas postoju"], 1, "Droga zależy od całego toru, a przemieszczenie od położeń początkowego i końcowego."],
["Co to jest prędkość średnia?", ["Całkowita droga podzielona przez całkowity czas", "Największa prędkość", "Prędkość w jednej sekundzie zawsze", "Zmiana masy w czasie"], 0, "Prędkość średnia to całkowita droga podzielona przez całkowity czas."],
["Jaką drogę pokona ciało jadące 5 m/s przez 4 s?", ["9 m", "20 m", "1,25 m", "40 m"], 1, "s=5·4=20 m."],
["Samochód przejechał 100 km w 2 godziny. Jaka była prędkość średnia?", ["25 km/h", "50 km/h", "100 km/h", "200 km/h"], 1, "v=100/2=50 km/h."],
["Rowerzysta przejechał 30 km w 3 godziny. Jaka była jego prędkość średnia?", ["5 km/h", "10 km/h", "15 km/h", "30 km/h"], 1, "v=30/3=10 km/h."],
["Pies biegnie z prędkością 2 m/s przez 10 s. Jaką drogę pokona?", ["5 m", "10 m", "20 m", "40 m"], 2, "s=2·10=20 m."],
["Pociąg jedzie 20 m/s przez 5 s. Jaką drogę pokona?", ["25 m", "50 m", "100 m", "200 m"], 2, "s=20·5=100 m."],
["Ciało pokonało 60 m w 10 s. Jaka była prędkość?", ["3 m/s", "6 m/s", "10 m/s", "60 m/s"], 1, "v=60/10=6 m/s."],
["Biegacz pokonał 400 m w 80 s. Jaka była jego prędkość?", ["2 m/s", "4 m/s", "5 m/s", "8 m/s"], 2, "v=400/80=5 m/s."],
["Ile czasu zajmie pokonanie 100 m z prędkością 5 m/s?", ["5 s", "10 s", "20 s", "50 s"], 2, "t=100/5=20 s."],
["Ile czasu zajmie pokonanie 60 km z prędkością 30 km/h?", ["1 h", "2 h", "3 h", "4 h"], 1, "t=60/30=2 h."],
["Jaką drogę pokona samochód jadący 80 km/h przez 2 h?", ["40 km", "80 km", "160 km", "240 km"], 2, "s=80·2=160 km."],
["Jaką drogę pokona rowerzysta jadący 15 km/h przez 4 h?", ["19 km", "30 km", "45 km", "60 km"], 3, "s=15·4=60 km."],
["Jaką prędkość ma ciało, które pokonało 150 m w 30 s?", ["2 m/s", "5 m/s", "10 m/s", "30 m/s"], 1, "v=150/30=5 m/s."],
["Ile metrów na sekundę to 36 km/h?", ["5 m/s", "10 m/s", "20 m/s", "36 m/s"], 1, "Aby zamienić km/h na m/s, dzielimy przez 3,6."],
["Ile km/h to 10 m/s?", ["10 km/h", "18 km/h", "36 km/h", "100 km/h"], 2, "10·3,6=36 km/h."],
["Ile m/s to 72 km/h?", ["10 m/s", "20 m/s", "36 m/s", "72 m/s"], 1, "72/3,6=20 m/s."],
["Ile km/h to 5 m/s?", ["5 km/h", "10 km/h", "18 km/h", "50 km/h"], 2, "5·3,6=18 km/h."],
["Ile m/s to 18 km/h?", ["2 m/s", "5 m/s", "10 m/s", "18 m/s"], 1, "18/3,6=5 m/s."],
["Ile km/h to 15 m/s?", ["15 km/h", "36 km/h", "54 km/h", "72 km/h"], 2, "15·3,6=54 km/h."],
["Która prędkość jest większa?", ["10 m/s", "20 km/h", "Są równe", "Nie da się porównać"], 0, "10 m/s to 36 km/h, więc jest większe niż 20 km/h."],
["Która prędkość jest większa?", ["5 m/s", "10 km/h", "Są równe", "Obie wynoszą zero"], 0, "5 m/s to 18 km/h, czyli więcej niż 10 km/h."],
["Czy ciało w spoczynku ma prędkość równą zero względem obserwatora?", ["Tak", "Nie", "Zawsze ma 1 m/s", "Zależy tylko od masy"], 0, "Względem danego obserwatora ciało w spoczynku nie zmienia położenia."],
["Czy ruch i spoczynek zależą od układu odniesienia?", ["Tak", "Nie", "Tylko w kosmosie", "Tylko dla samochodów"], 0, "To samo ciało może być w ruchu względem jednego obiektu i w spoczynku względem innego."],
["Co jest układem odniesienia?", ["Obiekt lub układ, względem którego opisujemy ruch", "Jednostka masy", "Rodzaj siły", "Przyrząd do pomiaru temperatury"], 0, "Układ odniesienia pozwala określić położenie i ruch ciała."],
["Pasażer siedzący w jadącym autobusie jest w spoczynku względem:", ["Autobusu", "Drogi", "Drzewa przy drodze", "Przystanku"], 0, "Względem autobusu pasażer nie zmienia położenia."],
["Pasażer jadącego autobusu jest w ruchu względem:", ["Siedzenia", "Autobusu", "Drogi", "Własnego plecaka leżącego obok"], 2, "Względem drogi jego położenie się zmienia."],
["Co to jest ruch jednostajnie przyspieszony?", ["Ruch ze stałym przyspieszeniem", "Ruch ze stałą masą", "Ruch bez prędkości", "Ruch bez czasu"], 0, "W takim ruchu prędkość zmienia się o jednakową wartość w równych odstępach czasu."],
["Co to jest ruch jednostajnie opóźniony?", ["Ruch ze stałym ujemnym przyspieszeniem względem kierunku ruchu", "Ruch ze stale rosnącą prędkością", "Ruch bez tarcia", "Ruch po okręgu zawsze"], 0, "W ruchu jednostajnie opóźnionym szybkość maleje w równych odstępach czasu o jednakową wartość."],
["Co oznacza przyspieszenie 2 m/s²?", ["Prędkość zmienia się o 2 m/s w każdej sekundzie", "Ciało pokonuje 2 m zawsze", "Ciało ma masę 2 kg", "Prędkość wynosi zawsze 2 m/s"], 0, "Przyspieszenie określa zmianę prędkości w czasie."],
["Prędkość wzrosła z 0 do 10 m/s w 5 s. Jakie było przyspieszenie?", ["1 m/s²", "2 m/s²", "5 m/s²", "10 m/s²"], 1, "a=(10-0)/5=2 m/s²."],
["Prędkość wzrosła z 5 do 15 m/s w 2 s. Jakie było przyspieszenie?", ["2 m/s²", "5 m/s²", "10 m/s²", "20 m/s²"], 1, "a=(15-5)/2=5 m/s²."],
["Prędkość zmalała z 20 do 10 m/s w 5 s. Jakie było przyspieszenie?", ["-2 m/s²", "-5 m/s²", "2 m/s²", "10 m/s²"], 0, "a=(10-20)/5=-2 m/s²."],
["Ciało zwiększa prędkość. Jak nazywamy taki ruch?", ["Przyspieszonym", "Opóźnionym", "Jednostajnym zawsze", "Spoczynkiem"], 0, "W ruchu przyspieszonym szybkość rośnie."],
["Ciało zmniejsza prędkość. Jak nazywamy taki ruch?", ["Przyspieszonym", "Opóźnionym", "Jednostajnym", "Drgającym"], 1, "W ruchu opóźnionym szybkość maleje."],
["Czy ciało poruszające się po okręgu może mieć zmieniającą się prędkość wektorową mimo stałej szybkości?", ["Tak", "Nie", "Tylko gdy stoi", "Tylko w próżni"], 0, "Zmienia się kierunek wektora prędkości."],
["Jak nazywamy ruch po okręgu?", ["Ruch po torze kołowym", "Ruch prostoliniowy", "Spoczynek", "Ruch harmoniczny zawsze"], 0, "W ruchu po okręgu tor ma kształt okręgu."],
["Co jest przykładem ruchu po okręgu?", ["Końcówka wskazówki zegara", "Spadający kamień", "Pociąg na prostej", "Winda jadąca pionowo"], 0, "Końcówka wskazówki porusza się po okręgu."],
["Co to jest okres obrotu?", ["Czas jednego pełnego obrotu", "Liczba metrów", "Prędkość maksymalna", "Masa obracającego się ciała"], 0, "Okres oznacza czas jednego pełnego cyklu lub obrotu."],
["Jaka jest jednostka okresu?", ["Sekunda", "Metr", "Kilogram", "Newton"], 0, "Okres jest czasem, więc jego jednostką jest sekunda."],
["Co to jest częstotliwość obrotów?", ["Liczba obrotów w jednostce czasu", "Czas jednego obrotu", "Długość okręgu", "Masa koła"], 0, "Częstotliwość mówi, ile cykli zachodzi w jednostce czasu."],
["Jaka jest jednostka częstotliwości?", ["Herc", "Metr", "Dżul", "Paskal"], 0, "Jednostką częstotliwości jest herc."],
["Jaki jest związek między okresem a częstotliwością?", ["f=1/T", "f=T", "f=T²", "f=2T"], 0, "Częstotliwość jest odwrotnością okresu."],
["Jeśli okres wynosi 2 s, jaka jest częstotliwość?", ["0,5 Hz", "1 Hz", "2 Hz", "4 Hz"], 0, "f=1/2=0,5 Hz."],
["Jeśli częstotliwość wynosi 5 Hz, jaki jest okres?", ["0,2 s", "1 s", "5 s", "10 s"], 0, "T=1/5=0,2 s."],
["Co to jest ruch drgający?", ["Ruch powtarzający się wokół położenia równowagi", "Ruch wyłącznie po prostej", "Ruch bez przyspieszenia", "Ruch tylko w dół"], 0, "Ruch drgający odbywa się wokół położenia równowagi."],
["Co to jest amplituda drgań?", ["Maksymalne wychylenie od położenia równowagi", "Czas jednego drgania", "Liczba drgań", "Masa wahadła"], 0, "Amplituda to największe wychylenie od położenia równowagi."],
["Co to jest wahadło?", ["Ciało zawieszone tak, że może wykonywać drgania", "Przyrząd do pomiaru masy", "Rodzaj silnika", "Rodzaj soczewki"], 0, "Wahadło może wykonywać ruch drgający."],
["Od czego zależy okres drgań wahadła matematycznego?", ["Od długości wahadła i przyspieszenia ziemskiego", "Od koloru ciężarka", "Od masy ciężarka", "Od materiału nici"], 0, "Dla małych wychyleń okres zależy od długości i grawitacji."],
["Co zwykle stanie się z okresem wahadła, gdy zwiększymy jego długość?", ["Wzrośnie", "Zmniejszy się", "Nie zmieni się", "Będzie równy zero"], 0, "Dłuższe wahadło ma większy okres drgań."],
["Co to jest prędkość chwilowa?", ["Prędkość w danym momencie", "Średnia prędkość z całej podróży", "Największa droga", "Zmiana masy w czasie"], 0, "Prędkość chwilowa opisuje ruch w konkretnej chwili."],
["Co pokazuje prędkościomierz samochodu?", ["Prędkość chwilową", "Drogę całkowitą", "Przyspieszenie ziemskie", "Masę samochodu"], 0, "Prędkościomierz wskazuje aktualną prędkość pojazdu."],
["Co mierzy licznik kilometrów w samochodzie?", ["Przebytą drogę", "Prędkość chwilową", "Przyspieszenie", "Czas reakcji"], 0, "Licznik kilometrów pokazuje przebytą drogę."],
["Jakim przyrządem mierzymy czas?", ["Stoperem", "Dynamometrem", "Termometrem", "Barometrem"], 0, "Stoper służy do pomiaru czasu."],
["Jakim przyrządem mierzymy długość drogi na krótkim odcinku?", ["Linijką lub taśmą mierniczą", "Amperomierzem", "Termometrem", "Kompasem"], 0, "Długość mierzymy przyrządami do pomiaru odległości."],
["Czy prędkość jest wielkością skalarną czy wektorową?", ["Wektorową", "Skalarną", "Nie jest wielkością fizyczną", "Jest jednostką"], 0, "Prędkość wektorowa ma wartość, kierunek i zwrot."],
["Czy szybkość jest wielkością skalarną czy wektorową?", ["Skalarną", "Wektorową", "Zawsze ujemną", "Nie ma jednostki"], 0, "Szybkość opisuje wartość prędkości bez kierunku."],
["Co oznacza prędkość 0 m/s?", ["Ciało chwilowo nie zmienia położenia względem układu odniesienia", "Ciało porusza się najszybciej", "Ciało ma nieskończoną drogę", "Ciało nie ma masy"], 0, "Prędkość równa zero oznacza spoczynek w danym układzie odniesienia."],
["Czy prędkość może mieć wartość ujemną w opisie ruchu po jednej osi?", ["Tak", "Nie", "Tylko dla światła", "Tylko dla dźwięku"], 0, "Znak prędkości może wskazywać kierunek ruchu względem przyjętej osi."],
["Co oznacza ujemne przyspieszenie?", ["Przyspieszenie skierowane przeciwnie do dodatniego zwrotu osi", "Zawsze zmniejszanie szybkości", "Brak ruchu", "Ujemną masę"], 0, "Znak przyspieszenia zależy od przyjętego układu osi."],
["Czy ciało może mieć przyspieszenie, gdy jego szybkość jest stała?", ["Tak, jeśli zmienia się kierunek ruchu", "Nie, nigdy", "Tylko gdy stoi", "Tylko na prostej"], 0, "W ruchu po okręgu kierunek prędkości się zmienia, więc występuje przyspieszenie."],
["Jak nazywa się przyspieszenie w ruchu po okręgu skierowane do środka okręgu?", ["Dośrodkowe", "Grawitacyjne zawsze", "Styczne zawsze", "Opóźniające"], 0, "Przyspieszenie dośrodkowe jest skierowane do środka okręgu."],
["Co może zmienić ruch ciała?", ["Działająca na nie niezrównoważona siła", "Sam kolor ciała", "Nazwa ciała", "Jego numer seryjny"], 0, "Wypadkowa siła może zmienić prędkość lub kierunek ruchu."],
["Czy przy braku wypadkowej siły ciało może poruszać się ruchem jednostajnym prostoliniowym?", ["Tak", "Nie", "Tylko jeśli jest bardzo lekkie", "Tylko w wodzie"], 0, "Wynika to z pierwszej zasady dynamiki Newtona."],
["Jak nazywa się pierwsza zasada dynamiki Newtona?", ["Zasada bezwładności", "Prawo Archimedesa", "Prawo Ohma", "Prawo odbicia"], 0, "Pierwsza zasada dynamiki to zasada bezwładności."],
["Co to jest bezwładność?", ["Tendencja ciała do zachowania dotychczasowego stanu ruchu", "Zdolność do świecenia", "Przewodzenie ciepła", "Zdolność do odbijania światła"], 0, "Bezwładność oznacza opór wobec zmiany ruchu."],
["Od czego zależy bezwładność ciała?", ["Od jego masy", "Od koloru", "Od temperatury otoczenia wyłącznie", "Od kształtu liter"], 0, "Im większa masa, tym większa bezwładność."],
["Co to jest ruch względny?", ["Opis ruchu zależny od wybranego układu odniesienia", "Ruch bez prędkości", "Ruch tylko w próżni", "Ruch bez toru"], 0, "Ruch opisujemy względem wybranego obserwatora lub obiektu."],
["Samochód jedzie 60 km/h przez 30 minut. Jaką drogę pokona?", ["15 km", "30 km", "60 km", "120 km"], 1, "30 minut to 0,5 h, więc s=60·0,5=30 km."],
["Pociąg jedzie 90 km/h przez 20 minut. Jaką drogę pokona?", ["15 km", "20 km", "30 km", "45 km"], 2, "20 minut to 1/3 godziny, więc s=90/3=30 km."],
["Rowerzysta jedzie 12 km/h przez 15 minut. Jaką drogę pokona?", ["1 km", "2 km", "3 km", "4 km"], 2, "15 minut to 0,25 h, więc s=12·0,25=3 km."],
["Samochód pokonał 240 km w 3 godziny. Jaka była średnia prędkość?", ["60 km/h", "70 km/h", "80 km/h", "90 km/h"], 2, "v=240/3=80 km/h."],
["Biegacz pokonał 100 m w 20 s. Ile wynosi jego prędkość?", ["2 m/s", "5 m/s", "10 m/s", "20 m/s"], 1, "v=100/20=5 m/s."],
["Ciało porusza się z prędkością 3 m/s przez 12 s. Jaką drogę pokona?", ["15 m", "24 m", "36 m", "48 m"], 2, "s=3·12=36 m."],
["Ile czasu potrzeba, aby przejechać 150 km z prędkością 50 km/h?", ["1 h", "2 h", "3 h", "5 h"], 2, "t=150/50=3 h."],
["Samolot leci 800 km/h przez 2 godziny. Jaką drogę pokona?", ["400 km", "800 km", "1200 km", "1600 km"], 3, "s=800·2=1600 km."],
["Ciało pokonało 500 m w 100 s. Jaka jest jego prędkość?", ["2 m/s", "5 m/s", "10 m/s", "50 m/s"], 1, "v=500/100=5 m/s."],
["Prędkość wzrosła z 10 m/s do 30 m/s w 4 s. Jakie jest przyspieszenie?", ["2 m/s²", "5 m/s²", "10 m/s²", "20 m/s²"], 1, "a=(30-10)/4=5 m/s²."],
["Prędkość wzrosła z 2 m/s do 8 m/s w 3 s. Jakie jest przyspieszenie?", ["1 m/s²", "2 m/s²", "3 m/s²", "6 m/s²"], 1, "a=(8-2)/3=2 m/s²."],
["Prędkość zmalała z 15 m/s do 5 m/s w 2 s. Jakie jest przyspieszenie?", ["-5 m/s²", "-2 m/s²", "5 m/s²", "10 m/s²"], 0, "a=(5-15)/2=-5 m/s²."],
["Ciało startuje z miejsca i przyspiesza 3 m/s² przez 4 s. Jaką osiągnie prędkość?", ["3 m/s", "7 m/s", "12 m/s", "16 m/s"], 2, "v=a·t=3·4=12 m/s."],
["Ciało startuje z miejsca i przyspiesza 2 m/s² przez 5 s. Jaką osiągnie prędkość?", ["5 m/s", "7 m/s", "10 m/s", "20 m/s"], 2, "v=2·5=10 m/s."],
["Jak nazywa się wykres przedstawiający zależność drogi od czasu?", ["Wykres s(t)", "Wykres F(m)", "Wykres T(U)", "Wykres p(V)"], 0, "Wykres s(t) pokazuje, jak zmienia się droga w czasie."],
["Na wykresie drogi od czasu linia pozioma oznacza:", ["Spoczynek", "Stałe przyspieszenie dodatnie", "Ruch coraz szybszy", "Ruch po okręgu"], 0, "Droga się nie zmienia, więc ciało pozostaje w spoczynku."],
["Na wykresie prędkości od czasu linia pozioma oznacza:", ["Stałą prędkość", "Stałe zwiększanie prędkości", "Brak czasu", "Zmianę masy"], 0, "Prędkość nie zmienia się w czasie."],
["Na wykresie prędkości od czasu linia rosnąca oznacza:", ["Wzrost prędkości", "Spoczynek", "Stałą drogę", "Zmniejszanie masy"], 0, "Wartość prędkości rośnie w czasie."],
["Co oznacza pole pod wykresem prędkości od czasu dla ruchu w jednym kierunku?", ["Przebytą drogę", "Masę", "Temperaturę", "Siłę"], 0, "Pole pod wykresem v(t) odpowiada przebytej drodze, gdy prędkość jest nieujemna."],
["Co oznacza nachylenie wykresu prędkości od czasu?", ["Przyspieszenie", "Masę", "Temperaturę", "Ciśnienie"], 0, "Nachylenie wykresu v(t) określa przyspieszenie."],
["Jak nazywa się ruch, w którym ciało pokonuje równe drogi w równych odstępach czasu?", ["Jednostajny", "Jednostajnie przyspieszony", "Drgający", "Losowy"], 0, "To definicja ruchu jednostajnego."],
["Jak nazywa się ruch, w którym prędkość rośnie o tę samą wartość w każdej sekundzie?", ["Jednostajnie przyspieszony", "Jednostajny", "Opóźniony zawsze", "Po okręgu zawsze"], 0, "Stały przyrost prędkości w równych odstępach czasu oznacza stałe przyspieszenie."],
["Czy spadające swobodnie ciało w pobliżu Ziemi przyspiesza?", ["Tak", "Nie", "Tylko w wodzie", "Tylko przy wietrze"], 0, "W swobodnym spadku działa przyspieszenie ziemskie, jeśli pomijamy opór powietrza."],
["Ile wynosi w przybliżeniu przyspieszenie ziemskie?", ["1 m/s²", "5 m/s²", "9,81 m/s²", "100 m/s²"], 2, "Przy powierzchni Ziemi g wynosi około 9,81 m/s²."],
["Co wpływa na ruch spadającego piórka w powietrzu?", ["Opór powietrza", "Tylko kolor piórka", "Brak grawitacji", "Pole elektryczne zawsze"], 0, "Opór powietrza mocno wpływa na ruch lekkiego piórka."],
["Dlaczego piórko i kamień spadają inaczej w powietrzu?", ["Opór powietrza ma różny wpływ na ich ruch", "Kamień nie podlega grawitacji", "Piórko nie ma masy", "Ziemia przyciąga tylko kamień"], 0, "Opór powietrza w stosunku do ciężaru piórka jest znacznie większy."],
["Jak spadają piórko i kamień w próżni z tej samej wysokości?", ["Jednocześnie", "Kamień zawsze pierwszy", "Piórko zawsze pierwsze", "Nie spadają"], 0, "W próżni nie ma oporu powietrza, więc oba ciała spadają z takim samym przyspieszeniem."],
["Co to jest prędkość graniczna?", ["Stała prędkość osiągana, gdy opór powietrza równoważy ciężar", "Największa możliwa prędkość światła", "Prędkość równa zero", "Prędkość dźwięku"], 0, "Przy prędkości granicznej wypadkowa siła może być równa zeru."],
["Czy samochód może mieć stałą szybkość, ale zmieniać kierunek jazdy?", ["Tak", "Nie", "Tylko na prostej", "Tylko podczas postoju"], 0, "Na zakręcie kierunek prędkości się zmienia."],
["Co jest przykładem ruchu okresowego?", ["Ruch wskazówki zegara", "Jednorazowy skok", "Zatrzymanie roweru", "Spadanie kamienia"], 0, "Ruch okresowy powtarza się w równych odstępach czasu."],
["Co oznacza częstotliwość 2 Hz?", ["Dwa cykle na sekundę", "Dwa metry na sekundę", "Dwie sekundy na cykl", "Dwa kilogramy"], 0, "2 Hz oznacza dwa powtórzenia w każdej sekundzie."],
["Jeśli ciało wykonuje 10 drgań w 5 sekund, jaka jest częstotliwość?", ["1 Hz", "2 Hz", "5 Hz", "10 Hz"], 1, "f=10/5=2 Hz."],
["Jeśli ciało wykonuje 20 obrotów w 10 sekund, jaka jest częstotliwość obrotów?", ["1 Hz", "2 Hz", "10 Hz", "20 Hz"], 1, "f=20/10=2 Hz."],
["Ile czasu trwa 5 pełnych obrotów, jeśli jeden obrót trwa 2 sekundy?", ["2 s", "5 s", "7 s", "10 s"], 3, "Czas=5·2=10 s."],
["Jaki jest okres ruchu, jeśli częstotliwość wynosi 4 Hz?", ["0,25 s", "0,5 s", "2 s", "4 s"], 0, "T=1/4=0,25 s."],
["Jaka jest częstotliwość, jeśli okres wynosi 0,5 s?", ["0,5 Hz", "1 Hz", "2 Hz", "5 Hz"], 2, "f=1/0,5=2 Hz."],
["Co to jest ruch harmoniczny?", ["Szczególny rodzaj ruchu drgającego", "Ruch tylko po prostej", "Ruch bez okresu", "Ruch jednostajny po linii prostej"], 0, "Ruch harmoniczny jest idealnym ruchem drgającym opisywanym funkcją sinusoidalną lub cosinusoidalną."],
["Czy ruch Ziemi wokół Słońca jest ruchem okresowym?", ["Tak", "Nie", "Tylko w dzień", "Tylko zimą"], 0, "Ziemia powtarza obieg wokół Słońca w przybliżeniu co rok."],
["Ile mniej więcej trwa jeden obieg Ziemi wokół Słońca?", ["24 godziny", "30 dni", "365 dni", "12 godzin"], 2, "Pełny obieg trwa około jednego roku."],
["Ile trwa jeden obrót Ziemi wokół własnej osi w przybliżeniu?", ["24 godziny", "7 dni", "30 dni", "365 dni"], 0, "Jeden obrót Ziemi trwa około doby."],
["Co jest przykładem ruchu postępowego?", ["Winda jadąca w górę", "Wirujące koło", "Obracający się wentylator", "Wskazówka zegara"], 0, "W ruchu postępowym ciało przemieszcza się bez konieczności obracania całego obiektu."],
["Co jest przykładem ruchu obrotowego?", ["Wirujące koło roweru", "Pasażer idący prosto", "Spadający kamień bez obrotu", "Winda jadąca w dół"], 0, "Koło obraca się wokół swojej osi."],
["Co jest przykładem ruchu złożonego?", ["Koło roweru jadącego po drodze", "Książka leżąca na stole", "Kamień nieruchomy na ziemi", "Zegar bez wskazówek"], 0, "Punkty koła wykonują ruch obrotowy i postępowy."],
["Czy ciało może jednocześnie wykonywać ruch postępowy i obrotowy?", ["Tak", "Nie", "Tylko w próżni", "Tylko w wodzie"], 0, "Przykładem jest toczące się koło."],
["Co oznacza, że dwa ciała poruszają się z taką samą prędkością wektorową?", ["Mają taką samą wartość, kierunek i zwrot prędkości", "Mają taką samą masę", "Pokonują zawsze tę samą drogę", "Poruszają się po różnych torach"], 0, "Prędkość wektorowa uwzględnia wartość, kierunek i zwrot."],
["Dwa samochody jadą w tę samą stronę z prędkościami 60 km/h i 80 km/h. Jaka jest ich prędkość względna?", ["10 km/h", "20 km/h", "60 km/h", "140 km/h"], 1, "Przy ruchu w tę samą stronę odejmujemy prędkości: 80-60=20 km/h."],
["Dwa samochody jadą naprzeciw siebie z prędkościami 60 km/h i 80 km/h. Jaka jest prędkość zbliżania?", ["20 km/h", "60 km/h", "80 km/h", "140 km/h"], 3, "Przy ruchu naprzeciw siebie dodajemy wartości prędkości."],
["Co to jest ruch jednostajny po okręgu?", ["Ruch po okręgu ze stałą szybkością", "Ruch po prostej ze stałą prędkością", "Ruch bez przyspieszenia", "Ruch bez toru"], 0, "Szybkość jest stała, ale kierunek prędkości się zmienia."],
["Czy ciało poruszające się jednostajnie po okręgu ma przyspieszenie?", ["Tak", "Nie", "Tylko gdy zwiększa szybkość", "Tylko gdy zmniejsza szybkość"], 0, "Zmiana kierunku prędkości oznacza występowanie przyspieszenia dośrodkowego."],
["W którą stronę skierowane jest przyspieszenie dośrodkowe?", ["Do środka okręgu", "Na zewnątrz okręgu", "Zawsze pionowo w dół", "Zawsze zgodnie z ruchem"], 0, "Przyspieszenie dośrodkowe jest skierowane ku środkowi okręgu."],
["Co jest przykładem ruchu niejednostajnego?", ["Samochód przyspieszający na starcie", "Samochód jadący ze stałą prędkością po prostej", "Wózek stojący", "Pociąg jadący ze stałą prędkością"], 0, "Podczas przyspieszania prędkość się zmienia."],
["Co oznacza, że ruch jest opisywany względem Ziemi?", ["Ziemia jest przyjętym układem odniesienia", "Ciało nie porusza się", "Nie działa grawitacja", "Czas nie płynie"], 0, "Położenie i ruch opisujemy względem powierzchni Ziemi."],
["Czy prędkość dźwięku w powietrzu jest stała w każdych warunkach?", ["Nie, zależy m.in. od temperatury", "Tak, zawsze wynosi 300 000 km/s", "Zależy tylko od koloru powietrza", "Jest zawsze równa zeru"], 0, "Prędkość dźwięku w powietrzu zależy m.in. od temperatury."],
["Czy światło porusza się szybciej niż dźwięk?", ["Tak", "Nie", "Mają zawsze tę samą prędkość", "Dźwięk jest szybszy w próżni"], 0, "Światło w próżni porusza się znacznie szybciej niż dźwięk w powietrzu."],
["Dlaczego najpierw widzimy błysk pioruna, a potem słyszymy grzmot?", ["Światło dociera szybciej niż dźwięk", "Dźwięk nie istnieje podczas burzy", "Piorun wytwarza światło wcześniej", "Powietrze zatrzymuje dźwięk"], 0, "Prędkość światła jest dużo większa od prędkości dźwięku."],
["Co to jest droga hamowania?", ["Droga przebyta od rozpoczęcia hamowania do zatrzymania", "Droga od domu do pracy", "Droga pokonana w jednej sekundzie", "Długość samochodu"], 0, "Droga hamowania to odcinek pokonany podczas hamowania."],
["Od czego zależy droga hamowania samochodu?", ["Od prędkości, przyczepności i warunków hamowania", "Tylko od koloru samochodu", "Tylko od liczby pasażerów", "Od marki radia"], 0, "Na drogę hamowania wpływają m.in. prędkość, stan nawierzchni i hamulców."],
["Co zwykle dzieje się z drogą hamowania, gdy prędkość początkowa wzrośnie dwukrotnie przy tych samych warunkach hamowania?", ["Może wzrosnąć około czterokrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Zwiększy się tylko o metr"], 0, "W idealnym modelu droga hamowania jest proporcjonalna do kwadratu prędkości."],
["Dlaczego mokra droga zwiększa ryzyko poślizgu?", ["Zmniejsza przyczepność opon", "Zwiększa masę samochodu", "Wyłącza grawitację", "Zmniejsza prędkość światła"], 0, "Woda może zmniejszyć tarcie między oponą a nawierzchnią."],
["Co to jest czas reakcji kierowcy?", ["Czas od zauważenia zagrożenia do rozpoczęcia reakcji", "Czas wymiany opon", "Czas jazdy do celu", "Czas pracy silnika"], 0, "Czas reakcji wpływa na drogę przebytą przed rozpoczęciem hamowania."],
["Jak nazywamy drogę przebytą w czasie reakcji kierowcy?", ["Drogą reakcji", "Drogą optyczną", "Drogą okrężną", "Drogą dźwięku"], 0, "Droga reakcji to odcinek pokonany przed rozpoczęciem hamowania."],
["Co to jest całkowita droga zatrzymania?", ["Droga reakcji plus droga hamowania", "Tylko droga hamowania", "Tylko droga reakcji", "Droga do najbliższego skrzyżowania"], 0, "Całkowita droga zatrzymania jest sumą drogi reakcji i hamowania."],
["Czy większa prędkość oznacza zwykle dłuższą drogę reakcji przy tym samym czasie reakcji?", ["Tak", "Nie", "Droga reakcji zawsze wynosi zero", "Zależy tylko od koloru auta"], 0, "Przy tym samym czasie reakcji większa prędkość oznacza dłuższą drogę reakcji."],
["Samochód jedzie 20 m/s. Ile metrów pokona w czasie reakcji 1 s?", ["10 m", "20 m", "30 m", "40 m"], 1, "s=v·t=20·1=20 m."],
["Samochód jedzie 10 m/s. Ile metrów pokona w czasie reakcji 2 s?", ["5 m", "10 m", "20 m", "40 m"], 2, "s=10·2=20 m."],
["Co jest przyczyną ruchu planet wokół Słońca?", ["Oddziaływanie grawitacyjne", "Siła tarcia o przestrzeń", "Ciśnienie atmosferyczne", "Pole elektryczne Ziemi"], 0, "Grawitacja Słońca utrzymuje planety na orbitach."],
["Jak nazywa się tor ruchu planety wokół Słońca?", ["Orbita", "Amplituda", "Ognisko soczewki", "Powierzchnia"], 0, "Orbita to tor ruchu ciała wokół innego ciała."],
["Czy orbita Ziemi jest idealnym okręgiem?", ["Nie, jest elipsą o małym mimośrodzie", "Tak, idealnym okręgiem", "Jest linią prostą", "Nie ma określonego kształtu"], 0, "Orbita Ziemi jest lekko spłaszczoną elipsą."],
["Co oznacza prędkość orbitalna?", ["Prędkość ciała poruszającego się po orbicie", "Prędkość dźwięku", "Prędkość obrotu wskazówki", "Prędkość reakcji"], 0, "Prędkość orbitalna jest prędkością ruchu po orbicie."],
["Czy satelita na orbicie cały czas spada w kierunku Ziemi?", ["Tak, ale jego ruch poziomy sprawia, że stale ją omija", "Nie działa na niego grawitacja", "Nie porusza się", "Jest poza zasięgiem wszystkich sił"], 0, "Satelita jest w ciągłym swobodnym spadku wokół Ziemi."],
["Co opisuje pierwsza zasada dynamiki Newtona w kontekście ruchu?", ["Ciało zachowuje spoczynek lub ruch jednostajny prostoliniowy, gdy wypadkowa siła jest zerowa", "Każda siła znika", "Prędkość zawsze rośnie", "Masa zależy od czasu"], 0, "To zasada bezwładności."],
["Jaki jest związek siły, masy i przyspieszenia?", ["F=m·a", "F=m/a", "F=a/m", "F=m+ a"], 0, "Druga zasada dynamiki Newtona mówi, że F=m·a."],
["Jaka siła wypadkowa działa na ciało o masie 2 kg i przyspieszeniu 3 m/s²?", ["2 N", "3 N", "5 N", "6 N"], 3, "F=2·3=6 N."],
["Jakie przyspieszenie uzyska ciało o masie 4 kg pod wpływem siły 20 N?", ["2 m/s²", "5 m/s²", "10 m/s²", "80 m/s²"], 1, "a=F/m=20/4=5 m/s²."],
["Jaką masę ma ciało, na które działa siła 10 N i które uzyskuje przyspieszenie 2 m/s²?", ["2 kg", "5 kg", "10 kg", "20 kg"], 1, "m=F/a=10/2=5 kg."],
["Czy większa siła przy tej samej masie powoduje większe przyspieszenie?", ["Tak", "Nie", "Zawsze zmniejsza przyspieszenie", "Nie ma związku"], 0, "Z drugiej zasady dynamiki a=F/m."],
["Czy większa masa przy tej samej sile powoduje mniejsze przyspieszenie?", ["Tak", "Nie", "Zawsze większe", "Nie ma związku"], 0, "Przyspieszenie jest odwrotnie proporcjonalne do masy przy stałej sile."]
],
    sily: [
    ["Jednostka siły to:", ["Dżul", "Newton", "Wat", "Kilogram"], 1, "Siłę mierzymy w niutonach."],
    ["Czym mierzymy siłę?", ["Termometrem", "Dynamometrem", "Stoperem", "Wagą"], 1, "Siłę mierzymy dynamometrem."],
    ["Przyspieszenie ziemskie wynosi około:", ["9,81 m/s²", "100 m/s²", "1 m/s", "300 km/s"], 0, "g ≈ 9,81 m/s²."],
    ["Druga zasada dynamiki Newtona:", ["F=m·a", "W=F·s", "P=W/t", "v=s/t"], 0, "Siła wypadkowa jest iloczynem masy i przyspieszenia."],
    ["Tarcie:", ["Przeciwdziała ruchowi", "Zawsze przyspiesza", "Jest światłem", "Nie istnieje"], 0, "Tarcie przeciwdziała ruchowi względnemu powierzchni."],
    ["Siła przyciągająca do Ziemi to:", ["Opór", "Ciężkości", "Sprężystości", "Nacisku"], 1, "To siła ciężkości."],
    ["Co jest skutkiem działania siły?", ["Zmiana ruchu lub odkształcenie", "Zmiana koloru", "Zniknięcie masy", "Zmiana czasu"], 0, "Siła może zmienić ruch ciała albo jego kształt."],
    ["Co oznacza symbol F we wzorach fizycznych?", ["Energię", "Siłę", "Moc", "Czas"], 1, "F jest symbolem siły."],
    ["Jaka jest jednostka masy w układzie SI?", ["Newton", "Kilogram", "Dżul", "Wat"], 1, "Jednostką masy jest kilogram."],
    ["Jeżeli na ciało działają dwie równe siły w przeciwnych kierunkach, to ich siła wypadkowa wynosi:", ["0 N", "1 N", "10 N", "100 N"], 0, "Równe siły przeciwnie skierowane się równoważą."],
    ["Siła wypadkowa to:", ["Suma wektorowa sił działających na ciało", "Największa z sił", "Masa ciała", "Prędkość ciała"], 0, "Uwzględnia wartości i kierunki wszystkich sił."],
    ["Co opisuje pierwsza zasada dynamiki Newtona?", ["Bezwładność", "Prawo odbicia", "Przewodnictwo", "Rozszerzalność"], 0, "Ciało pozostaje w spoczynku lub ruchu jednostajnym prostoliniowym, gdy siła wypadkowa jest zerowa."],
    ["Jak nazywamy tendencję ciała do zachowania dotychczasowego ruchu?", ["Bezwładność", "Sprężystość", "Dyfuzja", "Wypór"], 0, "Bezwładność oznacza opór ciała przed zmianą ruchu."],
    ["Co stanie się z pasażerem podczas gwałtownego hamowania samochodu?", ["Będzie przemieszczał się do przodu", "Zostanie przyciągnięty do tyłu", "Zniknie jego ciężar", "Zatrzyma się przed samochodem"], 0, "To skutek bezwładności."],
    ["Jeżeli masa ciała wzrośnie, a siła pozostanie taka sama, przyspieszenie:", ["Zmniejszy się", "Zwiększy się", "Nie zmieni się", "Zawsze wyniesie zero"], 0, "Z zależności a = F/m wynika, że większa masa oznacza mniejsze przyspieszenie."],
    ["Jeżeli siła działająca na ciało wzrośnie dwukrotnie, a masa pozostanie stała, przyspieszenie:", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Zniknie"], 0, "Przy stałej masie przyspieszenie jest proporcjonalne do siły."],
    ["Jaką siłę wypadkową uzyskamy, gdy w tę samą stronę działają siły 5 N i 3 N?", ["2 N", "8 N", "15 N", "0 N"], 1, "Siły o tym samym kierunku i zwrocie dodajemy: 5 + 3 = 8 N."],
    ["Jaką siłę wypadkową uzyskamy, gdy przeciwnie działają siły 10 N i 4 N?", ["14 N", "40 N", "6 N", "0 N"], 2, "Odejmujemy wartości sił: 10 - 4 = 6 N."],
    ["Na ciało o masie 2 kg działa siła 10 N. Jakie jest przyspieszenie?", ["5 m/s²", "20 m/s²", "8 m/s²", "12 m/s²"], 0, "a = F/m = 10/2 = 5 m/s²."],
    ["Na ciało o masie 4 kg działa siła 20 N. Jakie jest przyspieszenie?", ["4 m/s²", "5 m/s²", "16 m/s²", "80 m/s²"], 1, "a = 20/4 = 5 m/s²."],
    ["Jaką siłę trzeba przyłożyć do ciała o masie 3 kg, aby nadać mu przyspieszenie 2 m/s²?", ["5 N", "6 N", "9 N", "12 N"], 1, "F = m·a = 3·2 = 6 N."],
    ["Co jest przykładem siły sprężystości?", ["Siła rozciągniętej gumki", "Siła światła", "Temperatura wody", "Masa kamienia"], 0, "Odkształcona gumka dąży do powrotu do pierwotnego kształtu."],
    ["Co powoduje siłę oporu powietrza?", ["Oddziaływanie ciała z powietrzem", "Brak grawitacji", "Pole magnetyczne Ziemi", "Zmiana masy"], 0, "Powietrze oddziałuje z poruszającym się ciałem."],
    ["Kiedy opór powietrza jest zwykle większy?", ["Przy większej prędkości", "Przy zerowej prędkości", "Gdy nie ma powietrza", "Zawsze jest taki sam"], 0, "Opór powietrza zazwyczaj rośnie wraz z prędkością."],
    ["Dlaczego spadochroniarz opada wolniej po otwarciu spadochronu?", ["Rośnie opór powietrza", "Zmniejsza się grawitacja", "Znika masa", "Zwiększa się siła ciężkości"], 0, "Duża powierzchnia spadochronu zwiększa opór powietrza."],
    ["Co jest źródłem siły ciężkości?", ["Oddziaływanie grawitacyjne", "Tarcie", "Prąd elektryczny", "Dźwięk"], 0, "Siła ciężkości wynika z przyciągania grawitacyjnego."],
    ["Ciężar ciała to:", ["Siła, z jaką ciało działa na podłoże lub zawieszenie", "Objętość ciała", "Temperatura ciała", "Prędkość ciała"], 0, "Ciężar jest siłą wywieraną przez ciało na podłoże lub zawieszenie."],
    ["Czy masa i ciężar oznaczają to samo?", ["Nie", "Tak", "Tylko na Ziemi", "Tylko w kosmosie"], 0, "Masa jest wielkością opisującą bezwładność, a ciężar jest siłą."],
    ["Czy masa ciała zmienia się po przeniesieniu go na Księżyc?", ["Nie", "Tak, rośnie", "Tak, maleje do zera", "Zależy od koloru"], 0, "Masa pozostaje taka sama niezależnie od miejsca."],
    ["Ciężar ciała na Księżycu w porównaniu z Ziemią jest:", ["Mniejszy", "Większy", "Taki sam", "Zawsze równy zeru"], 0, "Przyspieszenie grawitacyjne na Księżycu jest mniejsze."],
    ["Co oznacza symbol g?", ["Przyspieszenie ziemskie", "Gęstość", "Energię", "Moc"], 0, "Symbol g oznacza przyspieszenie grawitacyjne."],
    ["Jaka jest przybliżona wartość g na Ziemi?", ["9,81 m/s²", "3 m/s²", "20 m/s²", "100 m/s²"], 0, "Przy powierzchni Ziemi g wynosi około 9,81 m/s²."],
    ["Jak obliczamy ciężar ciała blisko powierzchni Ziemi?", ["Q = m·g", "Q = m/V", "Q = s/t", "Q = U·I"], 0, "Ciężar obliczamy jako iloczyn masy i przyspieszenia grawitacyjnego."],
    ["Jaki jest ciężar ciała o masie 2 kg przy g ≈ 10 m/s²?", ["20 N", "2 N", "10 N", "200 N"], 0, "Q = 2·10 = 20 N."],
    ["Jaki jest ciężar ciała o masie 5 kg przy g ≈ 10 m/s²?", ["5 N", "15 N", "50 N", "500 N"], 2, "Q = 5·10 = 50 N."],
    ["Co oznacza, że siła jest wielkością wektorową?", ["Ma wartość, kierunek i zwrot", "Ma tylko wartość", "Nie ma jednostki", "Zawsze jest dodatnia"], 0, "Siła jest opisywana wartością, kierunkiem i zwrotem."],
    ["Co oznacza kierunek działania siły?", ["Prostą, wzdłuż której działa siła", "Jej temperaturę", "Masę ciała", "Czas działania"], 0, "Kierunek określa prostą działania siły."],
    ["Co oznacza zwrot siły?", ["Stronę, w którą działa siła na danej prostej", "Jej jednostkę", "Jej masę", "Jej temperaturę"], 0, "Zwrot wskazuje, w którą stronę skierowana jest siła."],
    ["Jak przedstawiamy siłę na rysunku?", ["Za pomocą strzałki", "Za pomocą koła", "Za pomocą tabeli temperatur", "Za pomocą fali dźwiękowej"], 0, "Siłę przedstawia się jako wektor, czyli strzałkę."],
    ["Punkt przyłożenia siły to:", ["Miejsce, w którym siła działa na ciało", "Środek Ziemi", "Koniec linijki", "Jednostka siły"], 0, "Punkt przyłożenia wskazuje miejsce działania siły."],
    ["Co może spowodować zbyt duża siła działająca na przedmiot?", ["Trwałe odkształcenie lub zniszczenie", "Zniknięcie grawitacji", "Zmianę czasu", "Zmniejszenie temperatury zawsze do zera"], 0, "Duża siła może trwale odkształcić lub uszkodzić ciało."],
    ["Odkształcenie sprężyste oznacza, że ciało:", ["Wraca do pierwotnego kształtu po ustaniu siły", "Zawsze pęka", "Zmienia się w ciecz", "Traci całą masę"], 0, "Po usunięciu siły ciało odzyskuje pierwotny kształt."],
    ["Odkształcenie plastyczne oznacza, że ciało:", ["Nie wraca całkowicie do pierwotnego kształtu", "Zawsze wraca do pierwotnego kształtu", "Znika", "Nie zmienia kształtu"], 0, "Odkształcenie plastyczne pozostaje po ustaniu działania siły."],
    ["Co jest przykładem odkształcenia plastycznego?", ["Ugniecenie plasteliny", "Rozciągnięcie sprężyny w granicach sprężystości", "Drgania wahadła", "Ruch piłki"], 0, "Plastelina zachowuje nadany jej kształt."],
    ["Co jest przykładem odkształcenia sprężystego?", ["Rozciągnięcie sprężyny", "Zgniecenie gliny na stałe", "Złamanie patyka", "Pęknięcie szkła"], 0, "Sprężyna może wrócić do poprzedniego kształtu."],
    ["Tarcie statyczne występuje, gdy:", ["Powierzchnie nie przesuwają się względem siebie", "Ciało zawsze spada", "Nie ma kontaktu powierzchni", "Ciało świeci"], 0, "Tarcie statyczne przeciwdziała rozpoczęciu poślizgu."],
    ["Tarcie kinetyczne występuje, gdy:", ["Powierzchnie przesuwają się względem siebie", "Ciało jest nieruchome względem podłoża", "Nie ma kontaktu", "Nie działa żadna siła"], 0, "Tarcie kinetyczne pojawia się podczas poślizgu."],
    ["Jak można zmniejszyć tarcie między ruchomymi częściami maszyny?", ["Stosując smar", "Zwiększając chropowatość", "Dociskając je mocniej", "Dodając piasek"], 0, "Smar zmniejsza tarcie między powierzchniami."],
    ["Jak można zwiększyć tarcie między butem a podłożem?", ["Zastosować bieżnikowaną podeszwę", "Wygładzić podeszwę", "Pokryć podłogę lodem", "Usunąć podeszwę"], 0, "Bieżnik poprawia przyczepność."],
    ["Dlaczego na lodzie łatwo się poślizgnąć?", ["Tarcie jest małe", "Grawitacja nie działa", "Masa znika", "Nie ma siły nacisku"], 0, "Na gładkim lodzie tarcie jest niewielkie."],
    ["Jaka siła utrzymuje książkę na stole?", ["Siła reakcji podłoża", "Siła magnetyczna", "Siła elektryczna", "Siła wyporu powietrza"], 0, "Stół działa na książkę siłą nacisku skierowaną ku górze."],
    ["Jak nazywa się siła, z jaką podłoże działa na ciało?", ["Siła reakcji podłoża", "Siła ciężkości", "Siła oporu", "Siła magnetyczna"], 0, "Podłoże wywiera na ciało siłę reakcji."],
    ["Co dzieje się z ciałem, gdy siła wypadkowa jest równa zero?", ["Może pozostawać w spoczynku lub poruszać się ruchem jednostajnym prostoliniowym", "Zawsze przyspiesza", "Zawsze zwalnia", "Zaczyna wirować"], 0, "Wypadkowa równa zero oznacza brak przyspieszenia."],
    ["Czy ciało poruszające się ze stałą prędkością musi mieć działającą siłę wypadkową?", ["Nie", "Tak, zawsze", "Tylko w nocy", "Tylko w próżni"], 0, "Przy stałej prędkości wypadkowa sił może wynosić zero."],
    ["Co jest potrzebne, aby zmienić prędkość ciała?", ["Niezrównoważona siła wypadkowa", "Wyłącznie wysoka temperatura", "Zmiana koloru", "Zmiana objętości"], 0, "Siła wypadkowa powoduje przyspieszenie, czyli zmianę prędkości."],
    ["Jak nazywamy zmianę kierunku prędkości?", ["Zmianą ruchu", "Zmianą masy", "Parowaniem", "Topnieniem"], 0, "Zmiana kierunku oznacza zmianę wektora prędkości."],
    ["Czy ciało poruszające się po okręgu ze stałą szybkością ma przyspieszenie?", ["Tak", "Nie", "Tylko gdy zwiększa masę", "Tylko w próżni"], 0, "Zmienia się kierunek prędkości, więc występuje przyspieszenie."],
    ["Jaka siła może zapewniać ruch po okręgu?", ["Siła dośrodkowa", "Siła wyporu", "Siła elektryczna zawsze", "Siła parcia"], 0, "Siła dośrodkowa jest skierowana do środka okręgu."],
    ["W którą stronę skierowana jest siła dośrodkowa?", ["Do środka okręgu", "Na zewnątrz okręgu", "Zawsze pionowo w dół", "Zawsze zgodnie z ruchem"], 0, "Siła dośrodkowa jest skierowana ku środkowi toru."],
    ["Co utrzymuje Księżyc na orbicie wokół Ziemi?", ["Grawitacja", "Tarcie o powietrze", "Siła sprężystości", "Siła wyporu"], 0, "Grawitacyjne przyciąganie Ziemi zakrzywia tor Księżyca."],
    ["Jak zmienia się siła grawitacji między dwoma ciałami, gdy zwiększamy ich masy?", ["Rośnie", "Maleje", "Zawsze znika", "Nie zależy od mas"], 0, "Siła grawitacji rośnie wraz z masami oddziałujących ciał."],
    ["Jak zmienia się siła grawitacji, gdy zwiększamy odległość między ciałami?", ["Maleje", "Rośnie", "Nie zmienia się", "Staje się nieskończona"], 0, "Siła grawitacji maleje wraz ze wzrostem odległości."],
    ["Które ciała przyciągają się grawitacyjnie?", ["Wszystkie ciała mające masę", "Tylko planety", "Tylko magnesy", "Tylko ciała metalowe"], 0, "Grawitacja działa między wszystkimi ciałami mającymi masę."],
    ["Co opisuje prawo powszechnego ciążenia?", ["Grawitacyjne przyciąganie mas", "Przepływ prądu", "Odbicie światła", "Przewodzenie ciepła"], 0, "Prawo opisuje siłę przyciągania między masami."],
    ["Co się stanie z siłą ciężkości działającą na ciało, jeśli jego masa wzrośnie dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Spadnie do zera"], 0, "Przy tym samym g ciężar jest proporcjonalny do masy."],
    ["Jak nazywamy siłę, która przeciwdziała przesuwaniu ciała w cieczy lub gazie?", ["Siła oporu ośrodka", "Siła sprężystości", "Siła nacisku", "Siła magnetyczna"], 0, "Opór ośrodka przeciwdziała ruchowi ciała."],
    ["Co wpływa na wartość oporu powietrza?", ["Kształt, powierzchnia i prędkość ciała", "Wyłącznie kolor", "Wyłącznie masa Ziemi", "Dzień tygodnia"], 0, "Opór zależy między innymi od kształtu, powierzchni i prędkości."],
    ["Dlaczego samochody mają opływowe kształty?", ["Aby zmniejszyć opór powietrza", "Aby zwiększyć masę", "Aby wyłączyć grawitację", "Aby zwiększyć tarcie o powietrze"], 0, "Opływowy kształt ogranicza opór powietrza."],
    ["Co to jest siła nacisku?", ["Siła, z jaką ciało naciska na powierzchnię", "Siła światła", "Energia ruchu", "Temperatura powierzchni"], 0, "Siła nacisku działa na powierzchnię styku."],
    ["W jakim kierunku zwykle działa siła nacisku na poziomy stół?", ["Prostopadle do powierzchni stołu", "Równolegle do stołu", "Po okręgu", "Zawsze w lewo"], 0, "Siła nacisku jest prostopadła do powierzchni styku."],
    ["Co to jest siła wyporu?", ["Siła działająca na ciało zanurzone w płynie lub gazie, skierowana ku górze", "Siła tarcia o podłoże", "Siła przyciągania magnesu", "Siła napędowa silnika"], 0, "Siła wyporu działa przeciwnie do ciężaru w typowych warunkach."],
    ["Od czego zależy siła wyporu w cieczy?", ["Od gęstości cieczy i objętości wypartej cieczy", "Od koloru przedmiotu", "Od temperatury światła", "Od długości cienia"], 0, "Z prawa Archimedesa: Fw = ρ·g·V."],
    ["Kiedy ciało pływa na powierzchni cieczy?", ["Gdy jego średnia gęstość jest mniejsza od gęstości cieczy", "Gdy nie ma masy", "Gdy nie działa na nie żadna siła", "Gdy jest zawsze metalowe"], 0, "Ciało o mniejszej średniej gęstości może pływać."],
    ["Kiedy ciało tonie w cieczy?", ["Gdy jego średnia gęstość jest większa od gęstości cieczy", "Gdy jest oświetlone", "Gdy ma jasny kolor", "Gdy nie ma objętości"], 0, "Większa średnia gęstość sprzyja tonięciu."],
    ["Co jest przykładem działania siły magnetycznej?", ["Przyciąganie spinacza przez magnes", "Spadanie jabłka", "Rozciąganie gumki", "Hamowanie roweru"], 0, "Magnes może przyciągać ferromagnetyki, np. żelazo."],
    ["Które materiały są silnie przyciągane przez zwykły magnes?", ["Żelazo, nikiel i kobalt", "Drewno, szkło i papier", "Woda, cukier i sól", "Guma, plastik i kreda"], 0, "Żelazo, nikiel i kobalt są ferromagnetykami."],
    ["Jak zachowują się jednakowe bieguny magnesów?", ["Odpychają się", "Przyciągają się", "Nie oddziałują", "Zawsze się łamią"], 0, "Bieguny jednoimienne się odpychają."],
    ["Jak zachowują się różne bieguny magnesów?", ["Przyciągają się", "Odpychają się", "Nie oddziałują", "Znikają"], 0, "Bieguny różnoimienne się przyciągają."],
    ["Jak nazywamy siłę, z jaką naładowane elektrycznie ciała oddziałują na siebie?", ["Siła elektrostatyczna", "Siła ciężkości", "Siła tarcia", "Siła wyporu"], 0, "Ładunki elektryczne oddziałują siłami elektrostatycznymi."],
    ["Jak zachowują się ładunki jednoimienne?", ["Odpychają się", "Przyciągają się", "Nie oddziałują", "Zawsze neutralizują się"], 0, "Ładunki o takim samym znaku odpychają się."],
    ["Jak zachowują się ładunki różnoimienne?", ["Przyciągają się", "Odpychają się", "Nie oddziałują", "Zamieniają się w masę"], 0, "Ładunki o przeciwnych znakach przyciągają się."],
    ["Co to jest siła reakcji?", ["Siła, którą ciało wywiera w odpowiedzi na oddziaływanie drugiego ciała", "Zawsze siła tarcia", "Jednostka energii", "Rodzaj temperatury"], 0, "Oddziaływania występują wzajemnie, zgodnie z trzecią zasadą Newtona."],
    ["Trzecia zasada dynamiki Newtona mówi, że:", ["Akcji towarzyszy równa co do wartości i przeciwnie skierowana reakcja", "Siła zawsze wynosi zero", "Masa zależy od prędkości", "Energia zawsze rośnie"], 0, "Siły wzajemnego oddziaływania mają równe wartości i przeciwne zwroty."],
    ["Czy siły akcji i reakcji działają na to samo ciało?", ["Nie, działają na dwa różne ciała", "Tak, zawsze", "Tylko w próżni", "Tylko na Ziemi"], 0, "Siły akcji i reakcji działają na różne ciała."],
    ["Dlaczego podczas chodzenia możemy iść do przodu?", ["Odpychamy podłoże do tyłu, a podłoże działa na nas do przodu", "Nie działa żadna siła", "Grawitacja pcha nas do przodu", "Powietrze ciągnie nas za ubranie"], 0, "Podłoże działa na stopę siłą tarcia skierowaną do przodu."],
    ["Co umożliwia rakiecie poruszanie się do przodu?", ["Wyrzucanie gazów w przeciwną stronę", "Przyciąganie przez powietrze", "Brak masy", "Tarcie o chmury"], 0, "Raketa wyrzuca gazy do tyłu, a gazy działają na nią siłą reakcji."],
    ["Jaka siła działa na spadający swobodnie przedmiot, pomijając opór powietrza?", ["Siła ciężkości", "Siła tarcia", "Siła magnetyczna", "Siła sprężystości"], 0, "W spadku swobodnym pomijając opór działa grawitacja."],
    ["Jak nazywamy spadek ciała, gdy działa na nie tylko grawitacja?", ["Spadek swobodny", "Ruch jednostajny", "Ruch poślizgowy", "Drgania"], 0, "Spadek swobodny odbywa się pod wpływem samej grawitacji."],
    ["Czy w próżni cięższe ciało spada szybciej od lżejszego?", ["Nie, spadają z takim samym przyspieszeniem", "Tak, zawsze", "Lżejsze nie spada", "Żadne nie spada"], 0, "Bez oporu powietrza wszystkie ciała spadają z tym samym przyspieszeniem g."],
    ["Dlaczego piórko spada wolniej niż metalowa kulka w powietrzu?", ["Działa na nie duży opór powietrza w stosunku do jego ciężaru", "Nie działa na nie grawitacja", "Piórko nie ma masy", "Metal przyciąga Ziemię mocniej"], 0, "Opór powietrza ma znacznie większy wpływ na ruch piórka."],
    ["Co to jest równowaga sił?", ["Stan, w którym siła wypadkowa wynosi zero", "Stan, w którym działa tylko jedna siła", "Stan braku masy", "Stan braku grawitacji"], 0, "Siły równoważą się, gdy ich wypadkowa wynosi zero."],
    ["Na ciało działają siły 7 N w prawo i 7 N w lewo. Jaka jest siła wypadkowa?", ["0 N", "7 N", "14 N", "49 N"], 0, "Siły mają równe wartości i przeciwne zwroty."],
    ["Na ciało działają siły 12 N i 5 N w tę samą stronę. Jaka jest wypadkowa?", ["7 N", "17 N", "60 N", "0 N"], 1, "Dodajemy siły: 12 + 5 = 17 N."],
    ["Na ciało działają przeciwnie siły 15 N i 9 N. Jaka jest wypadkowa?", ["24 N", "6 N", "135 N", "0 N"], 1, "Odejmujemy: 15 - 9 = 6 N."],
    ["Na ciało o masie 10 kg działa siła wypadkowa 30 N. Oblicz przyspieszenie.", ["3 m/s²", "30 m/s²", "300 m/s²", "0,3 m/s²"], 0, "a = F/m = 30/10 = 3 m/s²."],
    ["Jaka siła nada ciału o masie 5 kg przyspieszenie 4 m/s²?", ["9 N", "20 N", "1,25 N", "25 N"], 1, "F = m·a = 5·4 = 20 N."],
    ["Ciało o masie 8 kg przyspiesza z wartością 2 m/s². Siła wypadkowa wynosi:", ["4 N", "10 N", "16 N", "20 N"], 2, "F = 8·2 = 16 N."],
    ["Jeśli siła wypadkowa działająca na ciało jest skierowana zgodnie z ruchem, ciało:", ["Zwiększa szybkość", "Zawsze się zatrzymuje", "Zmniejsza masę", "Zmienia stan skupienia"], 0, "Przyspieszenie ma wtedy zwrot zgodny z prędkością."],
    ["Jeśli siła wypadkowa działa przeciwnie do prędkości, ciało:", ["Zwykle zwalnia", "Zawsze przyspiesza", "Zwiększa masę", "Znika"], 0, "Przyspieszenie skierowane przeciwnie do prędkości zmniejsza szybkość."],
    ["Co jest przykładem siły napędowej samochodu?", ["Siła tarcia działająca na koła od podłoża", "Siła wyporu w wodzie", "Siła magnetyczna Ziemi", "Siła nacisku dachu"], 0, "Tarcie statyczne podłoża o napędzane koła może napędzać samochód."],
    ["Dlaczego opony samochodowe mają bieżnik?", ["Aby poprawiać przyczepność i odprowadzać wodę", "Aby zmniejszać masę samochodu do zera", "Aby zwiększać opór powietrza", "Aby wyłączać hamulce"], 0, "Bieżnik pomaga zachować przyczepność, zwłaszcza na mokrej nawierzchni."],
    ["Co się dzieje z siłą tarcia, gdy zwiększamy nacisk powierzchni na siebie?", ["Zwykle rośnie", "Zawsze znika", "Zawsze jest zerowa", "Zamienia się w ciężar"], 0, "W typowym modelu tarcie jest proporcjonalne do siły nacisku."],
    ["Czy siła tarcia zawsze jest szkodliwa?", ["Nie, bywa potrzebna", "Tak, zawsze", "Nie istnieje", "Jest potrzebna tylko w kosmosie"], 0, "Tarcie umożliwia m.in. chodzenie i hamowanie."],
    ["Która sytuacja pokazuje użyteczne tarcie?", ["Hamowanie roweru", "Poślizg na lodzie", "Zużywanie łożyska", "Nagrzewanie niepotrzebnej części"], 0, "Tarcie między klockami hamulcowymi a obręczą lub tarczą pozwala hamować."],
    ["Dlaczego stosuje się łożyska kulkowe?", ["Aby zmniejszyć tarcie", "Aby zwiększyć ciężar", "Aby zwiększyć opór powietrza", "Aby zatrzymać ruch"], 0, "Łożyska ograniczają tarcie ślizgowe, zastępując je głównie toczeniem."],
    ["Jak nazywa się tarcie występujące podczas toczenia?", ["Tarcie toczne", "Tarcie elektryczne", "Tarcie świetlne", "Tarcie hydrostatyczne"], 0, "Tarcie toczne występuje, gdy ciało toczy się po powierzchni."],
    ["Które tarcie jest zwykle mniejsze dla tych samych powierzchni: ślizgowe czy toczne?", ["Toczne", "Ślizgowe", "Zawsze są równe", "Żadne nie występuje"], 0, "Tarcie toczne jest zazwyczaj mniejsze od ślizgowego."],
    ["Co to jest dynamometr?", ["Przyrząd do pomiaru siły", "Przyrząd do pomiaru temperatury", "Przyrząd do pomiaru czasu", "Przyrząd do pomiaru objętości"], 0, "Dynamometr mierzy siłę, często dzięki odkształceniu sprężyny."],
    ["Na jakiej zasadzie działa typowy dynamometr sprężynowy?", ["Wydłużenie sprężyny zależy od przyłożonej siły", "Zmienia się kolor sprężyny", "Mierzy temperaturę", "Mierzy natężenie prądu"], 0, "W zakresie sprężystości wydłużenie sprężyny jest proporcjonalne do siły."],
    ["Co oznacza wskazanie dynamometru 5 N?", ["Działa siła o wartości 5 niutonów", "Masa wynosi 5 kg", "Temperatura wynosi 5°C", "Prędkość wynosi 5 m/s"], 0, "Niuton jest jednostką siły."],
    ["Jaka siła jest potrzebna, aby utrzymać nieruchomo ciało zawieszone na sznurku, jeśli jego ciężar wynosi 20 N?", ["20 N w górę", "10 N w dół", "40 N w dół", "0 N"], 0, "Napięcie sznurka równoważy ciężar ciała."],
    ["Jak nazywamy siłę działającą w napiętym sznurku?", ["Siła napięcia", "Siła wyporu", "Siła magnetyczna", "Siła dośrodkowa"], 0, "Napięty sznurek przekazuje siłę wzdłuż swojej długości."],
    ["Czy sznurek może pchać tak jak sztywny pręt?", ["Nie, napięty sznurek może ciągnąć", "Tak, zawsze", "Tylko w wodzie", "Tylko gdy jest gorący"], 0, "Sznurek przenosi naprężenie rozciągające, a nie ściskanie."],
    ["Co oznacza siła wypadkowa 0 N dla ciała pozostającego w spoczynku?", ["Ciało pozostaje w spoczynku, jeśli warunki się nie zmienią", "Ciało natychmiast wybucha", "Ciało zawsze zaczyna przyspieszać", "Ciało traci masę"], 0, "Zgodnie z pierwszą zasadą dynamiki ciało zachowuje spoczynek."],
    ["Który przykład przedstawia działanie siły sprężystości?", ["Łuk po naciągnięciu cięciwy", "Kamień leżący na ziemi", "Światło latarki", "Woda w szklance"], 0, "Odkształcony łuk działa siłą sprężystości."],
    ["Co stanie się z rozciągniętą sprężyną po puszczeniu, jeśli nie przekroczono granicy sprężystości?", ["Wróci do pierwotnej długości", "Pozostanie na zawsze rozciągnięta", "Zamieni się w ciecz", "Zniknie"], 0, "Sprężyna odzyskuje pierwotny kształt w zakresie sprężystości."],
    ["Od czego zależy siła sprężystości sprężyny?", ["Od jej odkształcenia i sztywności", "Od koloru", "Od pory dnia", "Od dźwięku"], 0, "W prawie Hooke’a siła jest proporcjonalna do odkształcenia."],
    ["Prawo Hooke’a w prostym zapisie ma postać:", ["F = k·x", "F = m/V", "F = s/t", "F = U·I"], 0, "Wartość siły sprężystości jest proporcjonalna do wydłużenia lub ściśnięcia."],
    ["Co oznacza symbol k w prawie Hooke’a?", ["Współczynnik sprężystości sprężyny", "Masę", "Prędkość", "Temperaturę"], 0, "k określa sztywność sprężyny."],
    ["Co oznacza symbol x w prawie Hooke’a?", ["Wydłużenie lub odkształcenie sprężyny", "Czas", "Moc", "Gęstość"], 0, "x opisuje zmianę długości sprężyny względem położenia równowagi."],
    ["Która siła powoduje, że puszczona piłka spada na podłogę?", ["Siła ciężkości", "Siła magnetyczna", "Siła elektryczna", "Siła sprężystości powietrza"], 0, "Ziemia przyciąga piłkę grawitacyjnie."],
    ["Dlaczego astronauta na orbicie wydaje się nieważki?", ["On i statek znajdują się w stanie ciągłego swobodnego spadku", "Nie działa tam grawitacja", "Astronauta nie ma masy", "Znikają wszystkie siły"], 0, "Wrażenie nieważkości wynika ze wspólnego swobodnego spadku."],
    ["Czy na orbicie okołoziemskiej działa grawitacja?", ["Tak", "Nie", "Tylko w dzień", "Tylko na powierzchni stacji"], 0, "Grawitacja utrzymuje stację kosmiczną na orbicie."],
    ["Co powoduje przypływy i odpływy mórz?", ["Głównie grawitacyjne oddziaływanie Księżyca i Słońca", "Siła tarcia piasku", "Pole elektryczne chmur", "Ruch samochodów"], 0, "Grawitacja Księżyca i Słońca wpływa na poziom mórz."],
    ["Która z wymienionych sił jest siłą kontaktową?", ["Tarcie", "Grawitacja", "Siła elektrostatyczna na odległość", "Siła magnetyczna na odległość"], 0, "Tarcie wymaga kontaktu powierzchni."],
    ["Która z wymienionych sił może działać na odległość?", ["Grawitacja", "Siła nacisku", "Tarcie ślizgowe", "Siła napięcia sznurka"], 0, "Grawitacja działa bez bezpośredniego kontaktu ciał."],
    ["Co oznacza, że siła ma wartość 1 N?", ["Nadaje masie 1 kg przyspieszenie 1 m/s²", "Przesuwa ciało zawsze o 1 m", "Ma masę 1 kg", "Działa przez 1 sekundę"], 0, "1 N = 1 kg·m/s²."],
    ["Jaką jednostkę ma przyspieszenie?", ["m/s²", "m/s", "kg/m³", "N·m"], 0, "Przyspieszenie mierzymy w metrach na sekundę do kwadratu."],
    ["Co oznacza ujemne przyspieszenie?", ["Zwrot przyspieszenia jest przeciwny do przyjętego zwrotu osi", "Ciało ma ujemną masę", "Nie działa żadna siła", "Ciało nie może się poruszać"], 0, "Znak przyspieszenia zależy od przyjętego układu odniesienia."],
    ["Czy ciało może mieć przyspieszenie, mimo że jego szybkość jest stała?", ["Tak, gdy zmienia kierunek ruchu", "Nie, nigdy", "Tylko gdy stoi", "Tylko w próżni"], 0, "Zmiana kierunku prędkości oznacza przyspieszenie."],
    ["Jak nazywa się siła skierowana przeciwnie do ruchu ciała w płynie?", ["Opór ośrodka", "Siła ciężkości", "Siła sprężystości", "Siła reakcji"], 0, "Opór ośrodka przeciwdziała ruchowi względem płynu."],
    ["Dlaczego rowerzysta pochyla się podczas szybkiego zakrętu?", ["Aby zachować równowagę podczas ruchu po łuku", "Aby zmniejszyć masę", "Aby wyłączyć tarcie", "Aby zatrzymać grawitację"], 0, "Pochylenie pomaga zrównoważyć momenty sił i utrzymać tor jazdy."],
    ["Co jest siłą dośrodkową dla samochodu jadącego po płaskim zakręcie?", ["Siła tarcia między oponami a jezdnią", "Siła wyporu", "Siła ciężkości sama w sobie", "Siła nacisku dachu"], 0, "Tarcie zapewnia siłę skierowaną do środka zakrętu."],
    ["Co może się stać, gdy tarcie opon o jezdnię jest zbyt małe na zakręcie?", ["Samochód może wpaść w poślizg", "Samochód zwiększy masę", "Zniknie ciężar", "Silnik przestanie istnieć"], 0, "Za małe tarcie nie zapewnia wymaganej siły dośrodkowej."],
    ["Dlaczego łatwiej przesunąć ciężką szafę na rolkach?", ["Rolki zmniejszają opór ruchu dzięki tarciu tocznemu", "Zmniejszają masę szafy", "Wyłączają grawitację", "Zwiększają siłę ciężkości"], 0, "Tarcie toczne jest zwykle mniejsze od ślizgowego."],
    ["Jaka siła działa na ciało zanurzone w wodzie i skierowana jest ku górze?", ["Siła wyporu", "Siła tarcia", "Siła dośrodkowa", "Siła magnetyczna"], 0, "Woda wywiera na zanurzone ciało siłę wyporu."],
    ["Jeśli siła wyporu jest większa od ciężaru ciała, to ciało:", ["Porusza się ku górze", "Zawsze tonie", "Nie ma masy", "Zatrzymuje czas"], 0, "Wypadkowa siła jest skierowana ku górze."],
    ["Jeśli siła wyporu jest równa ciężarowi ciała, ciało może:", ["Pozostawać w równowadze", "Zawsze przyspieszać w dół", "Zniknąć", "Zwiększać objętość bez końca"], 0, "Równe i przeciwnie skierowane siły równoważą się."],
    ["Co to jest siła odśrodkowa w opisie ruchu w obracającym się układzie?", ["Siła pozorna skierowana od środka obrotu", "Siła grawitacji", "Siła tarcia zawsze", "Siła sprężystości"], 0, "W układzie obracającym się wprowadza się siłę pozorną skierowaną na zewnątrz."],
    ["Co odczuwamy, gdy autobus rusza gwałtownie do przodu?", ["Wychylenie ciała do tyłu względem autobusu", "Wychylenie do przodu", "Zanik masy", "Brak bezwładności"], 0, "Ciało pasażera z powodu bezwładności dąży do zachowania spoczynku."],
    ["Dlaczego pasy bezpieczeństwa są ważne podczas hamowania?", ["Powstrzymują ciało pasażera przed dalszym ruchem do przodu", "Zmniejszają masę pasażera", "Wyłączają grawitację", "Zwiększają prędkość auta"], 0, "Pasy działają siłą, która zmienia ruch pasażera."],
    ["Co to jest siła wypadkowa dwóch sił prostopadłych o wartościach 3 N i 4 N?", ["5 N", "7 N", "1 N", "12 N"], 0, "Wartość wypadkowej wynosi √(3² + 4²) = 5 N."],
    ["Dwie siły prostopadłe mają wartości 6 N i 8 N. Jaka jest wartość ich wypadkowej?", ["10 N", "14 N", "2 N", "48 N"], 0, "√(6² + 8²) = 10 N."],
    ["Na ciało o masie 2 kg działa siła 6 N. Przyspieszenie wynosi:", ["3 m/s²", "12 m/s²", "8 m/s²", "0,3 m/s²"], 0, "a = 6/2 = 3 m/s²."],
    ["Na ciało działa siła 18 N, a jego przyspieszenie wynosi 3 m/s². Masa ciała to:", ["6 kg", "15 kg", "21 kg", "54 kg"], 0, "m = F/a = 18/3 = 6 kg."],
    ["Jaką siłę wypadkową trzeba przyłożyć do ciała o masie 12 kg, aby uzyskać przyspieszenie 0,5 m/s²?", ["6 N", "12 N", "24 N", "0,5 N"], 0, "F = 12·0,5 = 6 N."],
    ["Która sytuacja jest przykładem równowagi sił?", ["Książka nieruchomo leżąca na stole", "Spadający kamień", "Przyspieszający samochód", "Startująca rakieta"], 0, "Ciężar książki równoważy reakcja stołu."],
    ["Co dzieje się z siłą ciężkości podczas oddalania się od Ziemi?", ["Maleje", "Rośnie bez ograniczeń", "Pozostaje zawsze taka sama", "Zmienia się w tarcie"], 0, "Siła grawitacji maleje wraz z odległością od środka Ziemi."],
    ["Które stwierdzenie o sile i przyspieszeniu jest prawdziwe?", ["Przyspieszenie ma kierunek siły wypadkowej", "Przyspieszenie zawsze jest pionowe", "Przyspieszenie nie zależy od siły", "Przyspieszenie ma jednostkę niutona"], 0, "Zgodnie z drugą zasadą Newtona przyspieszenie ma zwrot siły wypadkowej."],
    ["Co stanie się z przyspieszeniem, jeśli masa wzrośnie trzykrotnie przy tej samej sile?", ["Zmniejszy się trzykrotnie", "Wzrośnie trzykrotnie", "Nie zmieni się", "Wzrośnie dziewięciokrotnie"], 0, "a = F/m, więc trzykrotny wzrost masy zmniejsza przyspieszenie trzykrotnie."],
    ["Co stanie się z przyspieszeniem, jeśli siła i masa wzrosną dwukrotnie?", ["Pozostanie takie samo", "Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Wzrośnie czterokrotnie"], 0, "Stosunek F/m pozostaje taki sam."],
    ["Który przykład pokazuje działanie siły nacisku?", ["Książka naciska na blat stołu", "Światło odbija się od lustra", "Woda paruje", "Dźwięk rozchodzi się w powietrzu"], 0, "Książka wywiera na stół siłę nacisku."],
    ["Czy siła ciężkości działa na ciało znajdujące się w wodzie?", ["Tak", "Nie", "Tylko gdy ciało tonie", "Tylko gdy ciało jest metalowe"], 0, "Grawitacja działa również na ciała zanurzone w cieczy."],
    ["Co jest skutkiem działania siły hamowania na samochód?", ["Zmniejszenie prędkości", "Zwiększenie masy", "Zanik tarcia", "Zmiana objętości"], 0, "Siła hamowania powoduje przyspieszenie skierowane przeciwnie do ruchu."],
    ["Jak nazywa się siła, która przeciwdziała poślizgowi stopy podczas chodzenia?", ["Tarcie statyczne", "Tarcie kinetyczne", "Siła wyporu", "Siła magnetyczna"], 0, "Tarcie statyczne zapobiega ślizganiu się stopy po podłożu."],
    ["Dlaczego na mokrej drodze droga hamowania może być dłuższa?", ["Zmniejsza się przyczepność opon", "Zwiększa się masa samochodu", "Znika siła ciężkości", "Silnik działa wolniej zawsze"], 0, "Mniejsze tarcie może zmniejszyć skuteczność hamowania."],
    ["Które stwierdzenie o tarciu jest prawdziwe?", ["Może powodować nagrzewanie powierzchni", "Zawsze obniża temperaturę", "Nie zależy od kontaktu powierzchni", "Występuje tylko w próżni"], 0, "Praca siły tarcia często zamienia energię mechaniczną w wewnętrzną."],
    ["Co jest przykładem siły oporu wody?", ["Opór działający na pływaka", "Ciężar pływaka", "Siła nacisku stóp na dno", "Siła magnetyczna"], 0, "Woda przeciwdziała ruchowi pływaka."],
    ["Dlaczego kształt kropli deszczu podczas spadania może się zmieniać?", ["Działają na nią siły napięcia powierzchniowego i oporu powietrza", "Nie działa na nią grawitacja", "Nie ma masy", "Zawsze jest idealną kulą"], 0, "Na kroplę działają różne siły, które wpływają na jej kształt."],
    ["Które zdanie najlepiej opisuje siłę?", ["Oddziaływanie mogące zmienić ruch lub kształt ciała", "Ilość materii w ciele", "Energia przypadająca na sekundę", "Długość drogi"], 0, "Siła opisuje oddziaływanie między ciałami."],
    ["Jaka jest wartość siły wypadkowej, gdy siły 4 N i 9 N działają w przeciwnych kierunkach?", ["5 N", "13 N", "36 N", "0 N"], 0, "Wartość wypadkowej to różnica: 9 - 4 = 5 N."],
    ["Jaka jest wartość siły wypadkowej, gdy siły 4 N i 9 N działają w tę samą stronę?", ["5 N", "13 N", "36 N", "0 N"], 1, "Siły zgodnie skierowane dodajemy: 4 + 9 = 13 N."],
    ["Ciało o masie 6 kg ma przyspieszenie 5 m/s². Jaka działa na nie siła wypadkowa?", ["30 N", "11 N", "1,2 N", "60 N"], 0, "F = 6·5 = 30 N."],
    ["Ciało o masie 20 kg porusza się bez przyspieszenia. Jaka jest siła wypadkowa?", ["0 N", "20 N", "200 N", "2 N"], 0, "Brak przyspieszenia oznacza zerową siłę wypadkową."],
    ["Co oznacza swobodny spadek w fizyce?", ["Ruch pod wpływem samej siły grawitacji", "Ruch bez żadnej siły", "Ruch tylko w wodzie", "Ruch z prędkością zerową"], 0, "W spadku swobodnym pomija się opór ośrodka."],
    ["Które ciało ma większą bezwładność?", ["Ciało o większej masie", "Ciało o mniejszej masie", "Ciało o większej temperaturze zawsze", "Ciało o jaśniejszym kolorze"], 0, "Bezwładność rośnie wraz z masą."],
    ["Dlaczego trudno wprawić w ruch załadowaną ciężarówkę?", ["Ma dużą masę i bezwładność", "Nie działa na nią grawitacja", "Nie ma tarcia", "Ma zerowy ciężar"], 0, "Duża masa oznacza dużą bezwładność."],
    ["Co stanie się z ciałem, jeśli siła wypadkowa będzie stała i niezerowa?", ["Będzie poruszać się z przyspieszeniem", "Zawsze pozostanie w spoczynku", "Zawsze będzie miało stałą prędkość", "Straci masę"], 0, "Stała niezerowa siła wypadkowa powoduje przyspieszenie."],
    ["Czy siła może zmienić kierunek ruchu bez zmiany wartości szybkości?", ["Tak", "Nie", "Tylko gdy ciało stoi", "Tylko gdy ciało jest gazem"], 0, "Przykładem jest ruch jednostajny po okręgu."],
    ["Jaką rolę pełni siła tarcia podczas jazdy samochodu po zakręcie?", ["Może zapewniać siłę dośrodkową", "Zawsze zatrzymuje samochód", "Zmniejsza masę auta", "Powoduje zanik ciężaru"], 0, "Tarcie opon o drogę może kierować samochód po łuku."],
    ["Co oznacza, że siła jest równa 10 N?", ["Jej wartość wynosi dziesięć niutonów", "Ciało ma masę 10 kg", "Ciało porusza się 10 m/s", "Praca wynosi 10 J"], 0, "Niuton jest jednostką wartości siły."],
    ["Która wielkość nie jest jednostką siły?", ["Kilogram", "Newton", "N", "kN"], 0, "Kilogram jest jednostką masy, a nie siły."],
    ["Ile niutonów ma jeden kiloniuton?", ["1000 N", "100 N", "10 N", "0,1 N"], 0, "Przedrostek kilo oznacza tysiąc."],
    ["Siła 2500 N to:", ["2,5 kN", "25 kN", "250 kN", "0,25 kN"], 0, "2500 N = 2,5 kN."],
    ["Co wskazuje dynamometr, gdy zawiesimy na nim ciężarek i układ jest nieruchomy?", ["Wartość siły napięcia równoważącej ciężar", "Objętość ciężarka", "Temperaturę ciężarka", "Prędkość ciężarka"], 0, "W stanie równowagi napięcie sprężyny równoważy ciężar."],
    ["Jaki jest zwrot siły ciężkości?", ["W stronę środka Ziemi", "Zawsze poziomo", "W stronę Słońca", "Zawsze zgodnie z ruchem"], 0, "Siła ciężkości jest skierowana ku środkowi Ziemi."],
    ["Co dzieje się z ciężarem ciała na planecie o mniejszym przyspieszeniu grawitacyjnym?", ["Jest mniejszy", "Jest większy", "Pozostaje zawsze taki sam", "Zależy tylko od koloru"], 0, "Ciężar Q = m·g, więc mniejsze g oznacza mniejszy ciężar."],
    ["Jak nazywamy oddziaływanie, które powoduje spadanie przedmiotów na Ziemię?", ["Grawitacyjne", "Magnetyczne", "Elektrostatyczne", "Sprężyste"], 0, "Grawitacja przyciąga ciała posiadające masę."],
    ["Która sytuacja ilustruje trzecią zasadę Newtona?", ["Pływak odpycha wodę do tyłu, a woda pcha go do przodu", "Kamień spada na ziemię", "Książka leży na stole", "Lód topnieje"], 0, "Siły wzajemnego oddziaływania mają równe wartości i przeciwne zwroty."],
    ["Dlaczego podczas skoku człowiek odpycha się od podłoża?", ["Podłoże działa na niego siłą reakcji skierowaną w górę", "Podłoże zmniejsza jego masę", "Grawitacja przestaje działać", "Powietrze go zasysa"], 0, "Człowiek naciska na podłoże, a podłoże działa siłą reakcji."],
    ["Co jest przykładem siły oporu powietrza?", ["Powietrze hamujące spadający liść", "Ziemia przyciągająca kamień", "Magnes przyciągający spinacz", "Stół podpierający książkę"], 0, "Powietrze przeciwdziała ruchowi liścia."],
    ["Który sposób zwiększa opór powietrza spadochronu?", ["Zwiększenie powierzchni czaszy", "Zmniejszenie powierzchni czaszy", "Usunięcie czaszy", "Zmniejszenie gęstości powietrza do zera"], 0, "Większa powierzchnia zwiększa opór powietrza."],
    ["Jak nazywamy siłę, która powstaje wskutek kontaktu dwóch powierzchni i utrudnia ich przesuwanie?", ["Siła tarcia", "Siła grawitacji", "Siła wyporu", "Siła magnetyczna"], 0, "Tarcie działa między stykającymi się powierzchniami."],
    ["Co może być skutkiem zbyt dużego tarcia w silniku?", ["Nagrzewanie i zużywanie części", "Zmniejszenie masy do zera", "Zanik grawitacji", "Wzrost prędkości światła"], 0, "Tarcie powoduje straty energii i zużycie elementów."],
    ["Dlaczego smarowanie łańcucha rowerowego jest korzystne?", ["Zmniejsza tarcie i zużycie", "Zwiększa ciężar roweru", "Wyłącza siłę napędową", "Zwiększa opór powietrza"], 0, "Smar ogranicza tarcie między ruchomymi elementami."],
    ["Co to jest przyczepność?", ["Zdolność powierzchni do zapewniania odpowiedniego tarcia", "Masa pojazdu", "Wartość temperatury", "Prędkość dźwięku"], 0, "Przyczepność zależy m.in. od tarcia między oponą a nawierzchnią."],
    ["Jaką siłę musi pokonać człowiek, przesuwając skrzynię po podłodze?", ["Między innymi siłę tarcia", "Siłę światła", "Siłę wyporu kosmicznego", "Siłę dźwięku"], 0, "Tarcie przeciwdziała przesuwaniu skrzyni."],
    ["Czy siła tarcia może być skierowana zgodnie z ruchem ciała?", ["Tak, w niektórych sytuacjach", "Nie, nigdy", "Tylko w próżni", "Tylko dla ciał nieruchomych"], 0, "Przykładem jest tarcie statyczne napędzające koła samochodu."],
    ["Co to jest siła dośrodkowa?", ["Wypadkowa siła skierowana do środka toru krzywoliniowego", "Siła skierowana zawsze na zewnątrz", "Siła ciężkości na równiku", "Siła działająca tylko w wodzie"], 0, "Siła dośrodkowa zmienia kierunek prędkości w ruchu po okręgu."],
    ],
    praca_moc: [
    ["Praca mechaniczna to:", ["W=F·s", "m·v", "s/t", "F/m"], 0, "Praca to siła razy przesunięcie w kierunku działania siły."],
    ["Jednostka pracy to:", ["Wat", "Dżul", "Niuton", "Metr"], 1, "Jednostką pracy jest dżul."],
    ["Moc to:", ["Praca w czasie", "Siła", "Masa", "Droga"], 0, "Moc opisuje szybkość wykonywania pracy."],
    ["Jak obliczamy moc?", ["P=W·t", "P=W/t", "P=F·t", "P=s/t"], 1, "Moc obliczamy, dzieląc pracę przez czas."],
    ["600 J w 10 s to moc:", ["60 W", "6000 W", "610 W", "6 W"], 0, "P = 600/10 = 60 W."],
    ["1 kW to:", ["10 W", "100 W", "1000 W", "10000 W"], 2, "1 kW = 1000 W."],
    ["Co oznacza symbol W we wzorze na pracę?", ["Pracę", "Moc", "Masę", "Prędkość"], 0, "W jest symbolem pracy mechanicznej."],
    ["Co oznacza symbol P?", ["Ciśnienie", "Moc", "Pęd", "Przyspieszenie"], 1, "P oznacza moc."],
    ["Jaka jest jednostka mocy w układzie SI?", ["Dżul", "Wat", "Newton", "Kilogram"], 1, "Jednostką mocy jest wat."],
    ["Jeden wat oznacza:", ["Jeden dżul na sekundę", "Jeden niuton na metr", "Jeden kilogram na sekundę", "Jeden metr na sekundę"], 0, "1 W = 1 J/s."],
    ["Kiedy wykonywana jest praca mechaniczna?", ["Gdy siła powoduje przesunięcie ciała", "Gdy ciało ma masę", "Gdy ciało ma temperaturę", "Gdy ciało jest oświetlone"], 0, "Praca mechaniczna jest wykonywana, gdy siła powoduje przemieszczenie."],
    ["Czy trzymanie ciężkiej torby nieruchomo oznacza wykonywanie pracy mechanicznej nad torbą?", ["Nie", "Tak, zawsze", "Tylko przez minutę", "Tylko gdy torba jest ciężka"], 0, "Nie ma przesunięcia torby, więc praca mechaniczna nad nią wynosi zero."],
    ["Czy podczas przesuwania skrzyni po podłodze wykonywana jest praca?", ["Tak", "Nie", "Tylko jeśli skrzynia jest pusta", "Tylko na zewnątrz"], 0, "Siła powoduje przesunięcie skrzyni."],
    ["Co jest potrzebne do obliczenia pracy przy stałej sile równoległej do ruchu?", ["Siła i droga", "Masa i temperatura", "Prędkość i czas", "Objętość i gęstość"], 0, "Praca zależy od siły i przesunięcia."],
    ["Jaką pracę wykonuje siła 10 N na drodze 2 m?", ["5 J", "12 J", "20 J", "100 J"], 2, "W = F·s = 10·2 = 20 J."],
    ["Jaką pracę wykonuje siła 5 N na drodze 4 m?", ["9 J", "20 J", "1,25 J", "40 J"], 1, "W = 5·4 = 20 J."],
    ["Siła 20 N przesuwa ciało o 3 m. Praca wynosi:", ["23 J", "60 J", "17 J", "6 J"], 1, "W = 20·3 = 60 J."],
    ["Jaką siłę zastosowano, jeśli wykonano pracę 100 J na drodze 5 m?", ["20 N", "50 N", "500 N", "5 N"], 0, "F = W/s = 100/5 = 20 N."],
    ["Na jaką drogę przesunięto ciało, jeśli siła 10 N wykonała pracę 80 J?", ["8 m", "10 m", "800 m", "0,8 m"], 0, "s = W/F = 80/10 = 8 m."],
    ["Jaką pracę wykonuje siła 100 N na drodze 10 m?", ["10 J", "100 J", "1000 J", "10000 J"], 2, "W = 100·10 = 1000 J."],
    ["Jaką pracę wykonuje siła 2 N na drodze 5 m?", ["7 J", "10 J", "2,5 J", "25 J"], 1, "W = 2·5 = 10 J."],
    ["Jaką pracę wykonuje siła 50 N na drodze 2 m?", ["25 J", "52 J", "100 J", "200 J"], 2, "W = 50·2 = 100 J."],
    ["Jeśli siła wynosi 0 N, to praca wykonana przez tę siłę wynosi:", ["0 J", "1 J", "100 J", "Zawsze 10 J"], 0, "Bez siły wykonującej pracę praca wynosi zero."],
    ["Jeśli ciało nie przemieszcza się, praca mechaniczna wykonana nad nim wynosi:", ["0 J", "Zawsze 1 J", "Zawsze 100 J", "Zależy tylko od masy"], 0, "Brak przesunięcia oznacza zerową pracę mechaniczną."],
    ["Co dzieje się z pracą, jeśli przy tej samej sile zwiększymy drogę dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Spadnie do zera"], 0, "Praca jest proporcjonalna do drogi."],
    ["Co dzieje się z pracą, jeśli przy tej samej drodze zwiększymy siłę dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Zniknie"], 0, "Praca jest proporcjonalna do siły."],
    ["Jaka jest praca siły prostopadłej do kierunku przesunięcia?", ["0 J", "Zawsze dodatnia", "Zawsze ujemna", "Zawsze 100 J"], 0, "Siła prostopadła do przesunięcia nie wykonuje pracy mechanicznej."],
    ["Kiedy praca siły jest ujemna?", ["Gdy siła działa przeciwnie do przesunięcia", "Gdy siła działa zgodnie z przesunięciem", "Gdy ciało stoi", "Gdy siła wynosi zero"], 0, "Siła skierowana przeciwnie do przesunięcia wykonuje pracę ujemną."],
    ["Kiedy praca siły jest dodatnia?", ["Gdy siła ma składową zgodną z przesunięciem", "Gdy siła jest zawsze zerowa", "Gdy ciało nie porusza się", "Gdy siła jest prostopadła do przesunięcia"], 0, "Siła skierowana zgodnie z przesunięciem wykonuje pracę dodatnią."],
    ["Jaką pracę wykonuje siła tarcia podczas przesuwania skrzyni po podłodze?", ["Zwykle ujemną", "Zawsze dodatnią", "Zawsze zerową", "Nie wykonuje pracy nigdy"], 0, "Tarcie działa przeciwnie do przesunięcia."],
    ["Co jest przykładem wykonywania pracy przeciwko sile ciężkości?", ["Podnoszenie plecaka", "Trzymanie plecaka nieruchomo", "Patrzenie na plecak", "Oświetlanie plecaka"], 0, "Podczas podnoszenia trzeba działać przeciwko sile ciężkości."],
    ["Jaką pracę wykonuje siła ciężkości podczas podnoszenia ciała?", ["Ujemną", "Dodatnią", "Zawsze zerową", "Nieskończoną"], 0, "Siła ciężkości działa przeciwnie do przesunięcia w górę."],
    ["Jaką pracę wykonuje siła ciężkości podczas swobodnego spadania?", ["Dodatnią", "Ujemną", "Zerową", "Nieokreśloną zawsze"], 0, "Siła ciężkości działa zgodnie z kierunkiem ruchu spadającego ciała."],
    ["Co oznacza 1 dżul?", ["Praca siły 1 N na drodze 1 m w jej kierunku", "Moc 1 W przez godzinę", "Siła 1 kg", "Droga 1 km"], 0, "1 J = 1 N·m."],
    ["Ile dżuli ma 1 kilodżul?", ["10 J", "100 J", "1000 J", "10000 J"], 2, "1 kJ = 1000 J."],
    ["Ile dżuli ma 2 kJ?", ["200 J", "2000 J", "20 J", "20000 J"], 1, "2 kJ = 2000 J."],
    ["Ile kilodżuli stanowi 5000 J?", ["5 kJ", "50 kJ", "500 kJ", "0,5 kJ"], 0, "5000 J = 5 kJ."],
    ["Ile dżuli ma 1 megadżul?", ["1000 J", "10000 J", "100000 J", "1000000 J"], 3, "1 MJ = 1 000 000 J."],
    ["Co oznacza moc 100 W?", ["Wykonywanie pracy 100 J w każdej sekundzie", "Wykonywanie pracy 100 J w godzinę", "Siłę 100 N", "Masę 100 kg"], 0, "100 W oznacza 100 J pracy na sekundę."],
    ["Urządzenie wykonuje pracę 200 J w 4 s. Jego moc wynosi:", ["50 W", "200 W", "800 W", "25 W"], 0, "P = 200/4 = 50 W."],
    ["Silnik wykonuje pracę 900 J w 3 s. Jego moc wynosi:", ["30 W", "300 W", "2700 W", "903 W"], 1, "P = 900/3 = 300 W."],
    ["Urządzenie o mocy 50 W pracuje przez 10 s. Wykonana praca wynosi:", ["5 J", "60 J", "500 J", "5000 J"], 2, "W = P·t = 50·10 = 500 J."],
    ["Silnik o mocy 100 W pracuje przez 5 s. Wykonana praca wynosi:", ["20 J", "105 J", "500 J", "1000 J"], 2, "W = 100·5 = 500 J."],
    ["Ile czasu potrzeba, aby urządzenie o mocy 100 W wykonało pracę 500 J?", ["5 s", "50 s", "500 s", "0,2 s"], 0, "t = W/P = 500/100 = 5 s."],
    ["Urządzenie wykonało 1200 J pracy z mocą 200 W. Jak długo pracowało?", ["6 s", "12 s", "240 s", "1400 s"], 0, "t = 1200/200 = 6 s."],
    ["Dwa urządzenia wykonują tę samą pracę. Które ma większą moc?", ["To, które wykona pracę w krótszym czasie", "To, które pracuje dłużej", "Oba zawsze mają taką samą moc", "To, które ma większą masę"], 0, "Większa moc oznacza wykonanie tej samej pracy w krótszym czasie."],
    ["Czy większa moc zawsze oznacza większą wykonaną pracę?", ["Nie, zależy również od czasu", "Tak, zawsze", "Nie, moc nie ma związku z pracą", "Tak, ale tylko w próżni"], 0, "Praca zależy od mocy i czasu działania."],
    ["Które urządzenie ma większą moc?", ["Urządzenie wykonujące 1000 J w 2 s", "Urządzenie wykonujące 1000 J w 10 s", "Oba mają taką samą moc", "Nie można porównać"], 0, "Pierwsze ma moc 500 W, drugie 100 W."],
    ["Moc 2 kW jest równa:", ["200 W", "2000 W", "20 W", "20000 W"], 1, "2 kW = 2000 W."],
    ["Moc 0,5 kW jest równa:", ["5 W", "50 W", "500 W", "5000 W"], 2, "0,5 kW = 500 W."],
    ["Moc 3 MW jest równa:", ["300 W", "3000 W", "300000 W", "3000000 W"], 3, "1 MW = 1 000 000 W, więc 3 MW = 3 000 000 W."],
    ["Które urządzenie zwykle ma większą moc?", ["Czajnik elektryczny", "Zegarek elektroniczny", "Mała dioda LED", "Pilot do telewizora"], 0, "Czajnik pobiera znacznie większą moc niż małe urządzenia elektroniczne."],
    ["Co oznacza moc znamionowa urządzenia?", ["Moc określona przez producenta dla przewidzianych warunków pracy", "Maksymalna masa urządzenia", "Długość przewodu", "Temperatura obudowy"], 0, "Moc znamionowa określa parametr pracy urządzenia."],
    ["Czy moc można wyrażać w kilowatach?", ["Tak", "Nie", "Tylko w fizyce jądrowej", "Tylko dla silników"], 0, "Kilowat jest wielokrotnością wata."],
    ["Ile watów ma 1 megawat?", ["1000 W", "10000 W", "100000 W", "1000000 W"], 3, "1 MW = 1 000 000 W."],
    ["Co oznacza skrót kW?", ["Kilowat", "Kilowolt", "Kilowatogodzina", "Kiloniuton"], 0, "kW to jednostka mocy."],
    ["Co oznacza skrót kWh?", ["Kilowatogodzinę", "Kilowat", "Kiloniuton", "Kilogram na godzinę"], 0, "kWh jest jednostką energii, a nie mocy."],
    ["Czy kilowatogodzina jest jednostką energii?", ["Tak", "Nie, jest jednostką siły", "Nie, jest jednostką mocy", "Jest jednostką czasu"], 0, "Kilowatogodzina określa ilość energii."],
    ["Jedna kilowatogodzina to:", ["1000 J", "3600 J", "3 600 000 J", "36 000 J"], 2, "1 kWh = 1000 W × 3600 s = 3 600 000 J."],
    ["Ile energii zużyje urządzenie o mocy 1 kW przez 2 godziny?", ["1 kWh", "2 kWh", "3 kWh", "0,5 kWh"], 1, "Energia = moc × czas = 1 kW × 2 h = 2 kWh."],
    ["Ile energii zużyje urządzenie o mocy 2 kW przez 3 godziny?", ["5 kWh", "6 kWh", "2 kWh", "9 kWh"], 1, "2 kW × 3 h = 6 kWh."],
    ["Żarówka o mocy 100 W świeci przez 10 godzin. Ile energii zużyje?", ["0,1 kWh", "1 kWh", "10 kWh", "100 kWh"], 1, "100 W = 0,1 kW, a 0,1 × 10 h = 1 kWh."],
    ["Urządzenie o mocy 500 W działa przez 2 godziny. Ile energii zużyje?", ["0,5 kWh", "1 kWh", "2 kWh", "5 kWh"], 1, "500 W = 0,5 kW, więc 0,5 × 2 = 1 kWh."],
    ["Co oznacza większe zużycie energii elektrycznej?", ["Większą ilość pobranej energii", "Zawsze większą moc źródła", "Mniejszy czas pracy", "Zanik napięcia"], 0, "Zużycie energii zależy od mocy urządzenia i czasu pracy."],
    ["Jak obliczamy energię zużytą przez urządzenie o stałej mocy?", ["E=P·t", "E=P/t", "E=F/m", "E=s/t"], 0, "Energia jest iloczynem mocy i czasu."],
    ["Urządzenie o mocy 1000 W pracuje przez 30 minut. Zużywa:", ["0,5 kWh", "1 kWh", "2 kWh", "30 kWh"], 0, "30 minut to 0,5 godziny; 1 kW × 0,5 h = 0,5 kWh."],
    ["Silnik wykonuje pracę 4000 J w 20 s. Jego moc to:", ["20 W", "200 W", "2000 W", "80000 W"], 1, "P = 4000/20 = 200 W."],
    ["Jaką pracę wykona silnik o mocy 300 W w czasie 10 s?", ["30 J", "300 J", "3000 J", "30000 J"], 2, "W = P·t = 300·10 = 3000 J."],
    ["Jaką moc ma urządzenie wykonujące 1500 J pracy w 5 s?", ["300 W", "750 W", "150 W", "7500 W"], 0, "P = 1500/5 = 300 W."],
    ["Ile pracy wykona urządzenie o mocy 20 W w 30 sekund?", ["50 J", "600 J", "6000 J", "10 J"], 1, "W = 20·30 = 600 J."],
    ["Jaką moc ma urządzenie, które w 60 s wykonało pracę 6000 J?", ["10 W", "60 W", "100 W", "360 W"], 2, "P = 6000/60 = 100 W."],
    ["W jakiej jednostce wyrażamy energię elektryczną na rachunku za prąd?", ["kWh", "kW", "A", "V"], 0, "Energia elektryczna jest rozliczana zwykle w kilowatogodzinach."],
    ["Co oznacza 2 kWh energii?", ["Energię zużytą przez urządzenie 2 kW pracujące godzinę", "Moc 2 W", "Prąd o natężeniu 2 A", "Napięcie 2 V"], 0, "2 kW przez godzinę daje 2 kWh energii."],
    ["Które urządzenie może wykonać tę samą pracę szybciej?", ["Urządzenie o większej mocy", "Urządzenie o mniejszej mocy", "Urządzenie wyłączone", "Urządzenie o mniejszej masie zawsze"], 0, "Większa moc oznacza szybsze wykonywanie pracy."],
    ["Czy człowiek wykonuje pracę mechaniczną, gdy wchodzi po schodach?", ["Tak", "Nie", "Tylko gdy biegnie", "Tylko gdy niesie plecak"], 0, "Podczas wchodzenia człowiek podnosi swoje ciało przeciwko grawitacji."],
    ["Czy człowiek wykonuje pracę mechaniczną, gdy stoi nieruchomo z plecakiem?", ["Nie wykonuje pracy mechanicznej nad plecakiem", "Tak, zawsze", "Wykonuje pracę 1000 J", "Wykonuje pracę ujemną"], 0, "Plecak nie przemieszcza się, więc praca mechaniczna nad nim jest zerowa."],
    ["Co jest przykładem pracy dodatniej wykonywanej przez siłę?", ["Ciągnięcie sanek do przodu", "Hamowanie roweru", "Tarcie przeciwdziałające ruchowi", "Trzymanie nieruchomego przedmiotu"], 0, "Siła ciągnąca działa zgodnie z przesunięciem sanek."],
    ["Co jest przykładem pracy ujemnej?", ["Siła hamująca poruszający się rower", "Siła napędzająca samochód", "Podnoszenie książki", "Ciągnięcie wózka do przodu"], 0, "Siła hamowania działa przeciwnie do przesunięcia."],
    ["Czy siła dośrodkowa wykonuje pracę w ruchu jednostajnym po okręgu?", ["Nie, ponieważ jest prostopadła do chwilowego przesunięcia", "Tak, zawsze dodatnią", "Tak, zawsze ujemną", "Zależy tylko od koloru ciała"], 0, "Siła dośrodkowa zmienia kierunek prędkości, ale nie wykonuje pracy w tym ruchu."],
    ["Jaką pracę wykonuje siła 15 N na drodze 6 m w swoim kierunku?", ["21 J", "90 J", "9 J", "60 J"], 1, "W = 15·6 = 90 J."],
    ["Jaką pracę wykonuje siła 8 N na drodze 12 m?", ["20 J", "96 J", "4 J", "120 J"], 1, "W = 8·12 = 96 J."],
    ["Jaką siłę zastosowano, wykonując pracę 300 J na drodze 10 m?", ["30 N", "3000 N", "310 N", "3 N"], 0, "F = 300/10 = 30 N."],
    ["Na jaką drogę działała siła 25 N, jeśli wykonała pracę 500 J?", ["20 m", "25 m", "475 m", "2 m"], 0, "s = 500/25 = 20 m."],
    ["Jaką pracę wykonuje siła 40 N na drodze 0,5 m?", ["20 J", "40 J", "80 J", "0,5 J"], 0, "W = 40·0,5 = 20 J."],
    ["Jaką pracę wykonuje siła 200 N na drodze 0,1 m?", ["20 J", "200 J", "2 J", "2000 J"], 0, "W = 200·0,1 = 20 J."],
    ["Ile wynosi moc, gdy praca 240 J została wykonana w 2 minuty?", ["2 W", "120 W", "240 W", "480 W"], 0, "2 minuty to 120 s; P = 240/120 = 2 W."],
    ["Ile czasu potrzeba na wykonanie pracy 1000 J przy mocy 50 W?", ["20 s", "50 s", "500 s", "0,05 s"], 0, "t = 1000/50 = 20 s."],
    ["Urządzenie o mocy 2 W pracuje przez 5 sekund. Wykonuje pracę:", ["10 J", "2,5 J", "7 J", "25 J"], 0, "W = 2·5 = 10 J."],
    ["Co jest większą mocą?", ["1000 W", "1 W", "10 W", "100 W"], 0, "1000 W jest największą z podanych wartości."],
    ["Ile watów ma 0,25 kW?", ["25 W", "250 W", "2500 W", "2,5 W"], 1, "0,25 kW = 250 W."],
    ["Ile kilowatów ma 7500 W?", ["7,5 kW", "75 kW", "0,75 kW", "750 kW"], 0, "7500 W = 7,5 kW."],
    ["Jaką energię w dżulach odpowiada 1 Wh?", ["3600 J", "1000 J", "60 J", "360 J"], 0, "1 Wh = 1 W × 3600 s = 3600 J."],
    ["Ile dżuli odpowiada 2 Wh?", ["7200 J", "3600 J", "2000 J", "720 J"], 0, "2 × 3600 J = 7200 J."],
    ["Ile energii zużyje urządzenie 100 W w ciągu 5 godzin?", ["0,5 kWh", "5 kWh", "50 kWh", "0,05 kWh"], 0, "0,1 kW × 5 h = 0,5 kWh."],
    ["Ile energii zużyje urządzenie 2 kW w ciągu 15 minut?", ["0,5 kWh", "2 kWh", "8 kWh", "0,25 kWh"], 0, "15 minut to 0,25 h; 2 × 0,25 = 0,5 kWh."],
    ["Która żarówka zużyje więcej energii w tym samym czasie?", ["100 W", "40 W", "Obie tyle samo", "Nie można porównać"], 0, "Przy tym samym czasie żarówka o większej mocy zużywa więcej energii."],
    ["Co oznacza sprawność urządzenia?", ["Stosunek energii lub pracy użytecznej do dostarczonej", "Jego masę", "Jego napięcie", "Czas od uruchomienia"], 0, "Sprawność określa, jaka część dostarczonej energii jest wykorzystana użytecznie."],
    ["Czy sprawność rzeczywistego urządzenia może wynosić 100%?", ["W praktyce nie", "Zawsze tak", "Zawsze więcej niż 100%", "Tylko w silniku"], 0, "W rzeczywistych urządzeniach występują straty energii."],
    ["Jak zwykle podajemy sprawność urządzenia?", ["W procentach", "W niutonach", "W metrach", "W amperach"], 0, "Sprawność często wyraża się procentowo."],
    ["Urządzenie otrzymało 100 J energii, a użytecznie wykorzystało 80 J. Jego sprawność wynosi:", ["80%", "20%", "100%", "180%"], 0, "η = 80/100 × 100% = 80%."],
    ["Urządzenie ma sprawność 50% i otrzymuje 200 J energii. Ile energii wykorzystuje użytecznie?", ["100 J", "50 J", "150 J", "200 J"], 0, "50% z 200 J to 100 J."],
    ["Co nazywamy stratami energii w urządzeniu?", ["Energię przekazaną do otoczenia w mniej użytecznej postaci", "Energię, która powstaje z niczego", "Masę urządzenia", "Moc znamionową"], 0, "Część energii może zostać rozproszona, np. jako ciepło."],
    ["Dlaczego silnik elektryczny może się nagrzewać podczas pracy?", ["Część energii zamienia się w energię wewnętrzną", "Energia znika", "Masa silnika rośnie", "Nie działa prąd"], 0, "Straty energii powodują między innymi nagrzewanie silnika."],
    ["Który silnik ma większą moc, jeśli oba wykonują 1000 J pracy?", ["Ten, który robi to w 2 s", "Ten, który robi to w 10 s", "Oba mają taką samą moc", "Nie da się określić"], 0, "Pierwszy ma moc 500 W, a drugi 100 W."],
    ["Co oznacza moc 1 KM w przybliżeniu?", ["Około 736 W", "Około 10 W", "Około 100 W", "Około 10 000 W"], 0, "Koń mechaniczny odpowiada około 735,5 W."],
    ["Czy moc silnika samochodu informuje o jego zdolności do wykonywania pracy w czasie?", ["Tak", "Nie", "Informuje tylko o masie", "Informuje tylko o pojemności"], 0, "Moc określa tempo wykonywania pracy."],
    ["Jaką pracę wykonuje siła 50 N, gdy przesunięcie wynosi 0 m?", ["0 J", "50 J", "100 J", "Nieskończenie dużo"], 0, "Brak przesunięcia oznacza zerową pracę mechaniczną."],
    ["Co jest jednostką pracy i energii?", ["Dżul", "Wat", "Amper", "Paskal"], 0, "Praca i energia mają tę samą jednostkę: dżul."],
    ["Czy praca mechaniczna może być ujemna?", ["Tak", "Nie", "Tylko w kosmosie", "Tylko dla gazów"], 0, "Praca jest ujemna, gdy siła działa przeciwnie do przesunięcia."],
    ["Jaką pracę wykonuje siła 30 N na drodze 4 m, jeśli działa pod kątem 90° do przesunięcia?", ["0 J", "120 J", "34 J", "7,5 J"], 0, "Siła prostopadła do przesunięcia nie wykonuje pracy."],
    ["Jaką pracę wykonuje siła 10 N na drodze 5 m, gdy działa zgodnie z ruchem?", ["50 J", "2 J", "15 J", "0 J"], 0, "W = 10·5 = 50 J."],
    ["Jaką pracę wykonuje siła 10 N na drodze 5 m, gdy działa przeciwnie do ruchu?", ["-50 J", "50 J", "0 J", "15 J"], 0, "Praca ma znak ujemny, ponieważ siła działa przeciwnie do przesunięcia."],
    ["Jaką moc ma urządzenie, które wykonało 3600 J pracy w ciągu minuty?", ["60 W", "360 W", "600 W", "216000 W"], 0, "Minuta to 60 s; 3600/60 = 60 W."],
    ["Ile pracy wykona urządzenie o mocy 2 kW przez 10 sekund?", ["20000 J", "2000 J", "200 J", "20 J"], 0, "2 kW = 2000 W; W = 2000·10 = 20000 J."],
    ["Ile czasu potrzeba urządzeniu o mocy 500 W na wykonanie 2500 J pracy?", ["5 s", "10 s", "50 s", "1250 s"], 0, "t = 2500/500 = 5 s."],
    ["Jaką moc ma urządzenie wykonujące 12 kJ pracy w 60 s?", ["200 W", "720 W", "20 W", "1200 W"], 0, "12 kJ = 12000 J; 12000/60 = 200 W."],
    ["Jaką pracę wykonuje silnik o mocy 5 kW w ciągu 2 s?", ["10000 J", "2500 J", "5000 J", "1000 J"], 0, "5 kW = 5000 W; 5000·2 = 10000 J."],
    ["Która wielkość określa szybkość wykonywania pracy?", ["Moc", "Masa", "Droga", "Ciśnienie"], 0, "Moc określa pracę wykonaną w jednostce czasu."],
    ["Czy podnoszenie przedmiotu na większą wysokość wymaga większej pracy przeciwko grawitacji?", ["Tak", "Nie", "Zawsze wymaga zerowej pracy", "Zależy tylko od koloru"], 0, "Przy tej samej masie większa wysokość oznacza większy przyrost energii potencjalnej."],
    ["Jaką pracę trzeba wykonać, aby podnieść ciało o ciężarze 10 N na wysokość 2 m?", ["20 J", "5 J", "12 J", "100 J"], 0, "W = F·h = 10·2 = 20 J."],
    ["Jaką pracę wykonujemy, podnosząc ciało o ciężarze 50 N na wysokość 3 m?", ["150 J", "53 J", "100 J", "15 J"], 0, "W = 50·3 = 150 J."],
    ["Ile pracy wykonano, podnosząc ciało o ciężarze 100 N na wysokość 0,5 m?", ["50 J", "100 J", "200 J", "5 J"], 0, "W = 100·0,5 = 50 J."],
    ["Co dzieje się z energią potencjalną ciała podczas podnoszenia?", ["Rośnie", "Maleje", "Zawsze wynosi zero", "Zamienia się w masę"], 0, "Podnoszenie zwiększa wysokość, a więc energię potencjalną grawitacji."],
    ["Co dzieje się z energią potencjalną podczas opuszczania ciała?", ["Maleje", "Rośnie", "Nie może się zmienić", "Zawsze znika"], 0, "Zmniejsza się wysokość ciała."],
    ["Co jest przykładem zamiany pracy mechanicznej na energię wewnętrzną?", ["Pocieranie dłoni i ich ogrzewanie", "Odbicie światła od lustra", "Rozchodzenie się dźwięku", "Przyciąganie magnesu"], 0, "Praca tarcia powoduje wzrost energii wewnętrznej dłoni."],
    ["Dlaczego hamulce rowerowe nagrzewają się podczas hamowania?", ["Tarcie zamienia część energii mechanicznej w wewnętrzną", "Energia znika", "Masa klocków rośnie", "Powstaje dodatkowa grawitacja"], 0, "Tarcie podczas hamowania powoduje nagrzewanie elementów."],
    ["Co oznacza, że urządzenie ma moc 0 W?", ["W danej chwili nie wykonuje pracy", "Ma energię nieskończoną", "Zawsze jest uszkodzone", "Ma masę równą zero"], 0, "Moc zerowa oznacza brak wykonywania pracy w danej chwili."],
    ["Jaką energię zużywa urządzenie 1000 W przez 1 sekundę?", ["1000 J", "1 J", "100 J", "3600 J"], 0, "1000 W = 1000 J/s, więc w sekundę zużywa 1000 J."],
    ["Jaką pracę wykona urządzenie o mocy 1 W w czasie 1 godziny?", ["3600 J", "60 J", "1000 J", "1 J"], 0, "Godzina ma 3600 sekund, więc W = 1·3600 = 3600 J."],
    ["Co jest większe: 1 kWh czy 1 MJ?", ["1 kWh", "1 MJ", "Są równe", "Nie można porównać"], 0, "1 kWh = 3,6 MJ, więc jest większa od 1 MJ."],
    ["Jaką energię w kWh zużyje urządzenie 2 kW przez pół godziny?", ["1 kWh", "2 kWh", "0,5 kWh", "4 kWh"], 0, "2 kW × 0,5 h = 1 kWh."],
    ["Ile energii zużyje grzejnik o mocy 1,5 kW przez 4 godziny?", ["6 kWh", "4 kWh", "1,5 kWh", "5,5 kWh"], 0, "1,5 × 4 = 6 kWh."],
    ["Co pozwala ograniczyć zużycie energii przez oświetlenie?", ["Stosowanie energooszczędnych źródeł światła", "Pozostawianie wszystkich lamp włączonych", "Używanie żarówek o większej mocy", "Zasłanianie okien w dzień"], 0, "Wydajne źródła światła pozwalają uzyskać oświetlenie przy mniejszym poborze energii."],
    ["Czy urządzenie o większej mocy zawsze zużyje więcej energii?", ["Nie, zależy też od czasu pracy", "Tak, zawsze", "Nie, moc nie ma znaczenia", "Tylko jeśli jest ciężkie"], 0, "Energia zależy od iloczynu mocy i czasu."],
    ["Dwa urządzenia mają tę samą moc, ale jedno pracuje dwa razy dłużej. Które zużyje więcej energii?", ["To pracujące dwa razy dłużej", "To pracujące krócej", "Oba zużyją tyle samo", "Żadne nie zużyje energii"], 0, "Przy tej samej mocy energia jest proporcjonalna do czasu."],
    ["Jaka jest praca wykonana przez siłę 4 N na drodze 7 m?", ["28 J", "11 J", "3 J", "14 J"], 0, "W = 4·7 = 28 J."],
    ["Jaka jest praca wykonana przez siłę 12 N na drodze 0,5 m?", ["6 J", "12 J", "24 J", "0,5 J"], 0, "W = 12·0,5 = 6 J."],
    ["Jaką siłę trzeba przyłożyć, aby wykonać pracę 60 J na drodze 3 m?", ["20 N", "180 N", "63 N", "10 N"], 0, "F = 60/3 = 20 N."],
    ["Jaką drogę pokona ciało, jeśli siła 40 N wykonała pracę 200 J?", ["5 m", "8 m", "160 m", "240 m"], 0, "s = 200/40 = 5 m."],
    ["Jaką moc ma silnik wykonujący 15 000 J pracy w 30 sekund?", ["500 W", "450 W", "1500 W", "50 W"], 0, "P = 15000/30 = 500 W."],
    ["Ile pracy wykona urządzenie 250 W w czasie 4 sekund?", ["1000 J", "250 J", "62,5 J", "4000 J"], 0, "W = 250·4 = 1000 J."],
    ["Jak długo musi pracować urządzenie 100 W, aby wykonać 2000 J pracy?", ["20 s", "10 s", "200 s", "20000 s"], 0, "t = 2000/100 = 20 s."],
    ["Jaka moc jest potrzebna do wykonania 5000 J pracy w 10 sekund?", ["500 W", "50 W", "5000 W", "50000 W"], 0, "P = 5000/10 = 500 W."],
    ["Co jest jednostką energii w układzie SI?", ["Dżul", "Wat", "Niuton", "Amper"], 0, "Energię mierzymy w dżulach."],
    ["Co jest jednostką mocy?", ["Wat", "Dżul", "Paskal", "Kilogram"], 0, "Moc mierzymy w watach."],
    ["Jaką moc ma urządzenie, które wykonuje 1 J pracy w ciągu 1 sekundy?", ["1 W", "1 J", "1 N", "1 kW"], 0, "1 W = 1 J/s."],
    ["Która sytuacja nie oznacza wykonania pracy mechanicznej nad przedmiotem?", ["Trzymanie nieruchomego pudełka", "Podnoszenie pudełka", "Przesuwanie pudełka", "Ciągnięcie pudełka po podłodze"], 0, "Jeśli pudełko się nie przemieszcza, praca mechaniczna nad nim wynosi zero."],
    ["Co oznacza sprawność 75%?", ["75% dostarczonej energii jest wykorzystane użytecznie", "Urządzenie ma moc 75 W", "Urządzenie pracuje 75 sekund", "75% energii powstaje z niczego"], 0, "Sprawność to stosunek energii użytecznej do dostarczonej."],
    ["Jeżeli urządzenie pobiera 400 J energii i oddaje użytecznie 300 J, ile energii stanowią straty?", ["100 J", "300 J", "400 J", "700 J"], 0, "Straty = 400 - 300 = 100 J."],
    ["Urządzenie ma sprawność 80%. Ile energii użytecznej uzyska z 500 J?", ["400 J", "100 J", "500 J", "80 J"], 0, "0,8 × 500 J = 400 J."],
    ["Co najczęściej dzieje się z częścią energii podczas pracy maszyny?", ["Rozprasza się między innymi w postaci ciepła", "Znika całkowicie", "Zamienia się w masę bez ograniczeń", "Zawsze staje się światłem"], 0, "Część energii jest przekazywana do otoczenia, np. jako ciepło."],
    ["Dlaczego warto wyłączać nieużywane urządzenia elektryczne?", ["Aby ograniczyć niepotrzebne zużycie energii", "Aby zwiększyć ich moc", "Aby zwiększyć napięcie w sieci", "Aby zwiększyć masę urządzeń"], 0, "Wyłączone urządzenia nie pobierają energii na wykonywanie zbędnej pracy."],
    ["Jak obliczyć koszt energii elektrycznej, jeśli znamy zużycie w kWh i cenę za 1 kWh?", ["Pomnożyć zużycie przez cenę jednostkową", "Podzielić moc przez czas", "Dodać napięcie do natężenia", "Pomnożyć masę przez prędkość"], 0, "Koszt to liczba zużytych kWh pomnożona przez cenę jednej kWh."],
    ],
    energia: [
    // 1–10
    ["Energię poruszającego się ciała nazywamy:", ["Kinetyczną", "Chemiczną", "Jądrową", "Cieplną"], 0, "To energia kinetyczna."],
    ["Energia potencjalna grawitacji zależy od:", ["Masy i wysokości", "Koloru", "Temperatury", "Kształtu"], 0, "Ep = mgh."],
    ["Zasada zachowania energii mówi, że:", ["Energia nie ginie", "Energia zawsze rośnie", "Energia znika", "Nie może się zmieniać"], 0, "Energia zmienia postać, ale nie ginie."],
    ["Rozciągnięta sprężyna ma energię:", ["Sprężystości", "Jądrową", "Dźwiękową", "Kinetyczną"], 0, "To energia potencjalna sprężystości."],
    ["Jednostka energii to:", ["N", "J", "m", "s"], 1, "Jednostką energii jest dżul."],
    ["Podczas spadania swobodnego:", ["Ep zmienia się w Ek", "Energia znika", "Masa rośnie", "Prędkość maleje"], 0, "Energia potencjalna zmienia się w kinetyczną."],
    ["Które ciało ma energię kinetyczną?", ["Jadący samochód", "Leżący kamień", "Stojący stół", "Wiszący obraz"], 0, "Poruszający się samochód ma energię kinetyczną."],
    ["Energia potencjalna grawitacji rośnie, gdy:", ["Rośnie wysokość", "Maleje masa", "Maleje wysokość", "Znika grawitacja"], 0, "Im większa wysokość, tym większa energia potencjalna."],
    ["Energia chemiczna jest zgromadzona między innymi:", ["W paliwie", "W pustej przestrzeni", "W cieniu", "W dźwięku"], 0, "Paliwa zawierają energię chemiczną."],
    ["Energia elektryczna może zamienić się w:", ["Cieplną", "Tylko grawitacyjną", "Tylko jądrową", "Żadną inną"], 0, "Przykładem jest grzałka zamieniająca energię elektryczną w cieplną."],

    // 11–20
    ["Jaka energia jest zgromadzona w naładowanym akumulatorze?", ["Chemiczna", "Dźwiękowa", "Grawitacyjna", "Sprężystości"], 0, "Akumulator magazynuje energię chemiczną."],
    ["Które urządzenie zamienia energię elektryczną na mechaniczną?", ["Silnik elektryczny", "Grzejnik", "Żarówka", "Termometr"], 0, "Silnik elektryczny wytwarza ruch."],
    ["W elektrowni wodnej energia wody napędza:", ["Turbinę", "Termometr", "Lustro", "Baterię"], 0, "Spadająca lub płynąca woda napędza turbinę."],
    ["Energia wiatru jest przykładem energii:", ["Odnawialnej", "Jądrowej", "Chemicznej", "Nieistniejącej"], 0, "Wiatr jest odnawialnym źródłem energii."],
    ["Energia promieniowania słonecznego może być zamieniana na elektryczną przez:", ["Panel fotowoltaiczny", "Dynamometr", "Termometr", "Dźwignię"], 0, "Ogniwa fotowoltaiczne przekształcają światło w energię elektryczną."],
    ["Co jest przykładem energii jądrowej?", ["Energia uwalniana w reaktorze", "Energia ruchu roweru", "Energia rozciągniętej gumy", "Energia dźwięku"], 0, "W reaktorze energia jest uwalniana podczas reakcji jądrowych."],
    ["Energia mechaniczna jest sumą:", ["Kinetycznej i potencjalnej", "Cieplnej i chemicznej", "Elektrycznej i jądrowej", "Dźwiękowej i świetlnej"], 0, "Energia mechaniczna to suma energii kinetycznej i potencjalnej."],
    ["Które ciało ma energię potencjalną sprężystości?", ["Ściśnięta sprężyna", "Spadająca piłka", "Płynąca rzeka", "Świecąca żarówka"], 0, "Odkształcona sprężyna magazynuje energię sprężystości."],
    ["Energia kinetyczna zależy od:", ["Masy i prędkości", "Koloru i kształtu", "Temperatury i ciśnienia", "Wysokości i koloru"], 0, "Ek = mv²/2."],
    ["Co stanie się z energią kinetyczną samochodu, gdy jego prędkość wzrośnie dwukrotnie?", ["Wzrośnie czterokrotnie", "Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się"], 0, "Energia kinetyczna zależy od kwadratu prędkości."],

    // 21–30
    ["Samochód o masie 1000 kg jedzie z prędkością 2 m/s. Jaka jest jego energia kinetyczna?", ["2000 J", "1000 J", "4000 J", "500 J"], 0, "Ek = 1000 × 2² / 2 = 2000 J."],
    ["Ciało o masie 2 kg znajduje się na wysokości 5 m. Przyjmij g = 10 m/s². Ile wynosi Ep?", ["100 J", "10 J", "50 J", "25 J"], 0, "Ep = 2 × 10 × 5 = 100 J."],
    ["Piłka leży na podłodze i się nie porusza. Jej energia kinetyczna wynosi:", ["0 J", "1 J", "10 J", "100 J"], 0, "Ciało w spoczynku ma zerową energię kinetyczną."],
    ["Co dzieje się z energią podczas hamowania roweru?", ["Zmienia się głównie w cieplną", "Całkowicie znika", "Zmienia się w jądrową", "Zamienia się w masę"], 0, "Tarcie podczas hamowania powoduje ogrzewanie elementów."],
    ["Energia potencjalna piłki jest największa:", ["W najwyższym punkcie", "Tuż przed uderzeniem o ziemię", "Na poziomie podłogi", "Gdy się zatrzyma na ziemi"], 0, "Największa wysokość oznacza największą energię potencjalną."],
    ["Co oznacza symbol Ek?", ["Energię kinetyczną", "Energię chemiczną", "Energię cieplną", "Energię elektryczną"], 0, "Ek oznacza energię kinetyczną."],
    ["Co oznacza symbol Ep?", ["Energię potencjalną", "Energię dźwięku", "Moc", "Ciśnienie"], 0, "Ep oznacza energię potencjalną."],
    ["Jaka jest jednostka energii w układzie SI?", ["Dżul", "Wat", "Newton", "Amper"], 0, "Dżul jest jednostką energii."],
    ["Ile dżuli ma 1 kilodżul?", ["1000 J", "100 J", "10 J", "10 000 J"], 0, "1 kJ = 1000 J."],
    ["Ile dżuli ma 1 megadżul?", ["1 000 000 J", "1000 J", "10 000 J", "100 000 J"], 0, "1 MJ = 1 000 000 J."],

    // 31–40
    ["Energia sprężystości rośnie, gdy:", ["Bardziej odkształcamy sprężynę", "Sprężyna znika", "Zmniejszamy jej masę", "Obniżamy temperaturę zawsze do zera"], 0, "Większe odkształcenie sprężyny oznacza większą energię sprężystości."],
    ["Co napędza wiatrak?", ["Energia kinetyczna wiatru", "Energia dźwięku", "Energia światła", "Energia sprężystości"], 0, "Ruch powietrza przekazuje energię łopatkom wiatraka."],
    ["W elektrowni cieplnej energia chemiczna paliwa zamienia się najpierw głównie w:", ["Cieplną", "Dźwiękową", "Grawitacyjną", "Sprężystości"], 0, "Spalanie paliwa uwalnia energię cieplną."],
    ["W żarówce energia elektryczna zamienia się w:", ["Świetlną i cieplną", "Tylko mechaniczną", "Tylko grawitacyjną", "Jądrową"], 0, "Żarówka emituje światło i wydziela ciepło."],
    ["W głośniku energia elektryczna zamienia się w:", ["Dźwiękową", "Grawitacyjną", "Chemiczną", "Jądrową"], 0, "Głośnik przekształca sygnał elektryczny w dźwięk."],
    ["W mikrofonie energia dźwięku jest zamieniana na:", ["Elektryczną", "Grawitacyjną", "Jądrową", "Sprężystości"], 0, "Mikrofon zamienia drgania akustyczne na sygnał elektryczny."],
    ["Podczas pocierania dłoni energia mechaniczna zamienia się w:", ["Cieplną", "Jądrową", "Grawitacyjną", "Świetlną"], 0, "Tarcie powoduje wzrost temperatury dłoni."],
    ["W spadającym kamieniu energia potencjalna:", ["Maleje", "Rośnie", "Jest zawsze zerowa", "Zamienia się w masę"], 0, "Wraz ze spadkiem wysokości maleje energia potencjalna."],
    ["W spadającym kamieniu energia kinetyczna:", ["Rośnie", "Maleje zawsze", "Znika", "Nie istnieje"], 0, "Podczas spadania prędkość rośnie, więc rośnie energia kinetyczna."],
    ["W idealnym wahadle bez oporów całkowita energia mechaniczna:", ["Jest stała", "Ciągle rośnie", "Ciągle maleje", "Jest zawsze zerowa"], 0, "Bez strat energii suma Ek i Ep pozostaje stała."],

    // 41–50
    ["Na szczycie toru kolejki górskiej wagonik ma dużą:", ["Energię potencjalną", "Energię chemiczną", "Energię jądrową", "Energię dźwięku"], 0, "Duża wysokość oznacza dużą energię potencjalną."],
    ["U podniesionego młotka zgromadzona jest energia:", ["Potencjalna grawitacji", "Dźwiękowa", "Elektryczna", "Chemiczna"], 0, "Podniesiony młotek ma energię wynikającą z wysokości."],
    ["Które źródło energii jest nieodnawialne?", ["Węgiel kamienny", "Wiatr", "Światło słoneczne", "Pływy morskie"], 0, "Węgiel powstaje przez bardzo długi czas i jego zasoby są ograniczone."],
    ["Które źródło energii jest odnawialne?", ["Energia geotermalna", "Ropa naftowa", "Węgiel brunatny", "Gaz ziemny"], 0, "Energia geotermalna pochodzi z ciepła wnętrza Ziemi."],
    ["Biomasa może być wykorzystywana jako:", ["Źródło energii", "Izolator elektryczny zawsze", "Jednostka mocy", "Przyrząd pomiarowy"], 0, "Biomasa może być spalana lub przetwarzana na biopaliwa."],
    ["Energia geotermalna pochodzi:", ["Z wnętrza Ziemi", "Z Księżyca", "Z wiatru", "Z fal radiowych"], 0, "Geotermia wykorzystuje ciepło zgromadzone we wnętrzu Ziemi."],
    ["Energia pływów morskich jest związana między innymi z:", ["Oddziaływaniem grawitacyjnym Księżyca", "Tarciem o asfalt", "Spalaniem węgla", "Pole magnetycznym lodu"], 0, "Pływy są wywoływane głównie przez grawitacyjne oddziaływanie Księżyca i Słońca."],
    ["Co jest głównym źródłem energii dla większości procesów na powierzchni Ziemi?", ["Słońce", "Węgiel", "Baterie", "Wnętrze Księżyca"], 0, "Promieniowanie słoneczne napędza wiele procesów na Ziemi."],
    ["Rośliny magazynują energię słoneczną w procesie:", ["Fotosyntezy", "Parowania", "Kondensacji", "Tarcia"], 0, "Fotosynteza przekształca energię światła w energię chemiczną."],
    ["Energia zawarta w pożywieniu jest przede wszystkim:", ["Chemiczna", "Grawitacyjna", "Dźwiękowa", "Magnetyczna"], 0, "Organizm uwalnia energię chemiczną z pokarmu."],

    // 51–60
    ["Podczas pracy mięśni energia chemiczna organizmu zamienia się między innymi w:", ["Mechaniczną i cieplną", "Jądrową", "Grawitacyjną wyłącznie", "Energię próżni"], 0, "Mięśnie wykonują pracę i wydzielają ciepło."],
    ["Co oznacza sprawność urządzenia?", ["Stosunek energii użytecznej do dostarczonej", "Jego masę", "Jego kolor", "Czas produkcji"], 0, "Sprawność określa, jaka część dostarczonej energii jest wykorzystana użytecznie."],
    ["Czy sprawność rzeczywistego urządzenia może wynosić 120%?", ["Nie", "Tak, zawsze", "Tylko zimą", "Tylko w silniku"], 0, "Sprawność urządzenia nie może przekroczyć 100%."],
    ["Urządzenie otrzymało 100 J energii i oddało 80 J energii użytecznej. Jaka jest sprawność?", ["80%", "20%", "100%", "180%"], 0, "η = 80/100 × 100% = 80%."],
    ["Jeśli sprawność urządzenia wynosi 50%, to z 200 J energii wejściowej uzyskamy użytecznie:", ["100 J", "50 J", "200 J", "400 J"], 0, "50% z 200 J to 100 J."],
    ["Dlaczego w urządzeniach występują straty energii?", ["Część energii rozprasza się, np. jako ciepło", "Energia przestaje istnieć", "Masa zawsze znika", "Grawitacja zanika"], 0, "Część energii trafia do otoczenia w mniej użytecznej postaci."],
    ["Czy energia może być przekazywana między ciałami?", ["Tak", "Nie", "Tylko w próżni", "Tylko w nocy"], 0, "Energia może być przekazywana na różne sposoby."],
    ["Co oznacza przemiana energii?", ["Zmianę jednej postaci energii w inną", "Zniknięcie materii", "Zmianę jednostki masy", "Zatrzymanie czasu"], 0, "Energia może zmieniać swoją postać."],
    ["W elektrowni wiatrowej energia ruchu powietrza zamienia się najpierw w:", ["Mechaniczną energię obrotu turbiny", "Energię chemiczną paliwa", "Energię jądrową", "Energię grawitacyjną"], 0, "Wiatr obraca łopaty turbiny."],
    ["W generatorze energia mechaniczna jest zamieniana na:", ["Elektryczną", "Chemiczną", "Grawitacyjną", "Dźwiękową wyłącznie"], 0, "Generator przekształca ruch w energię elektryczną."],

    // 61–70
    ["W elektrowni jądrowej energia z reakcji jądrowych jest wykorzystywana do ogrzewania:", ["Wody", "Piasku na pustyni", "Powietrza w balonie", "Lodu w zamrażarce"], 0, "Energia jądrowa ogrzewa wodę, której para napędza turbinę."],
    ["W elektrowni jądrowej turbina napędza:", ["Generator", "Termometr", "Chłodnicę samochodową", "Wagę"], 0, "Turbina przekazuje ruch obrotowy generatorowi."],
    ["Energia elektryczna w baterii jest uzyskiwana dzięki:", ["Reakcjom chemicznym", "Tarciu o podłogę", "Odbiciu światła", "Grawitacji Księżyca"], 0, "Reakcje chemiczne w ogniwie wytwarzają napięcie."],
    ["Panele fotowoltaiczne zamieniają energię:", ["Promieniowania na elektryczną", "Dźwiękową na cieplną", "Mechaniczną na jądrową", "Cieplną na grawitacyjną"], 0, "Ogniwa fotowoltaiczne wykorzystują światło do wytwarzania prądu."],
    ["Kolektor słoneczny służy głównie do uzyskiwania:", ["Ciepła", "Dźwięku", "Ruchu mechanicznego", "Pola magnetycznego"], 0, "Kolektor ogrzewa wodę lub inny płyn dzięki promieniowaniu słonecznemu."],
    ["Energia zgromadzona w benzynie jest uwalniana podczas:", ["Spalania", "Zamarzania", "Odbicia", "Magnesowania"], 0, "Podczas spalania energia chemiczna paliwa zostaje uwolniona."],
    ["W silniku spalinowym energia chemiczna paliwa zamienia się w:", ["Mechaniczną i cieplną", "Wyłącznie świetlną", "Wyłącznie dźwiękową", "Grawitacyjną"], 0, "Spalanie napędza tłoki, a część energii rozprasza się jako ciepło."],
    ["Które urządzenie magazynuje energię elektryczną w postaci chemicznej?", ["Akumulator", "Lustro", "Dynamometr", "Soczewka"], 0, "Akumulator magazynuje energię dzięki reakcjom chemicznym."],
    ["Energia zgromadzona w wysoko podniesionej wodzie może zostać wykorzystana w:", ["Elektrowni wodnej", "Mikrofonie", "Termometrze", "Lustrze"], 0, "Spadająca woda napędza turbiny elektrowni."],
    ["Dlaczego izolujemy termicznie domy?", ["Aby ograniczyć straty energii cieplnej", "Aby zwiększyć hałas", "Aby zwiększyć masę domu", "Aby zatrzymać grawitację"], 0, "Izolacja ogranicza ucieczkę ciepła do otoczenia."],

    // 71–80
    ["Co oznacza oszczędzanie energii?", ["Ograniczanie niepotrzebnego zużycia", "Zwiększanie strat", "Pozostawianie świateł włączonych", "Używanie urządzeń bez przerwy"], 0, "Oszczędzanie energii polega na unikaniu zbędnego zużycia."],
    ["Które działanie pomaga oszczędzać energię elektryczną?", ["Wyłączanie nieużywanego światła", "Pozostawianie telewizora włączonego", "Otwieranie lodówki na długo", "Ładowanie pustej baterii bez potrzeby"], 0, "Wyłączanie niepotrzebnego oświetlenia zmniejsza zużycie prądu."],
    ["Które urządzenie zwykle zużywa energię elektryczną podczas pracy?", ["Pralka", "Ręczna książka", "Kamień", "Drewniana łyżka"], 0, "Pralka wykorzystuje energię elektryczną do napędu i ogrzewania wody."],
    ["Co mierzy licznik energii elektrycznej w domu?", ["Zużycie energii elektrycznej", "Temperaturę powietrza", "Masę urządzeń", "Prędkość wiatru"], 0, "Licznik rejestruje zużycie energii, zwykle w kWh."],
    ["Jednostką energii używaną na rachunkach za prąd jest często:", ["Kilowatogodzina", "Kilowat", "Amper", "Om"], 0, "Energię elektryczną rozlicza się często w kilowatogodzinach."],
    ["1 kWh oznacza:", ["Energię zużytą przez urządzenie o mocy 1 kW w ciągu godziny", "Moc 1 W przez sekundę", "Napięcie 1 kV", "Natężenie 1 A"], 0, "1 kWh = 1 kW × 1 h."],
    ["Urządzenie o mocy 1000 W pracuje przez 1 godzinę. Ile zużyje energii?", ["1 kWh", "1000 kWh", "1 Wh", "100 W"], 0, "1000 W = 1 kW, więc przez godzinę zużywa 1 kWh."],
    ["Urządzenie o mocy 500 W pracuje przez 2 godziny. Ile zużyje energii?", ["1 kWh", "2 kWh", "500 kWh", "0,5 Wh"], 0, "0,5 kW × 2 h = 1 kWh."],
    ["Urządzenie o mocy 2 kW pracuje przez 3 godziny. Ile zużyje energii?", ["6 kWh", "5 kWh", "3 kWh", "2 kWh"], 0, "2 kW × 3 h = 6 kWh."],
    ["Jeśli urządzenie zużyło 4 kWh w ciągu 2 godzin, jego średnia moc wynosi:", ["2 kW", "8 kW", "4 W", "0,5 kW"], 0, "Moc = energia / czas = 4 kWh / 2 h = 2 kW."],

    // 81–90
    ["Który z poniższych przykładów pokazuje energię kinetyczną?", ["Lecący samolot", "Książka na półce", "Ściśnięta sprężyna", "Woda na tamie"], 0, "Lecący samolot porusza się, więc ma energię kinetyczną."],
    ["Który przykład pokazuje energię potencjalną grawitacji?", ["Doniczka na balkonie", "Jadący rower", "Wirujący wentylator", "Grający głośnik"], 0, "Doniczka ma energię potencjalną dzięki położeniu na wysokości."],
    ["Co stanie się z energią potencjalną ciała, gdy jego wysokość wzrośnie dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Wzrośnie czterokrotnie", "Nie zmieni się"], 0, "Przy stałej masie Ep jest proporcjonalna do wysokości."],
    ["Co stanie się z energią potencjalną, gdy masa ciała wzrośnie dwukrotnie?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Przy stałej wysokości Ep jest proporcjonalna do masy."],
    ["Ciało o masie 1 kg porusza się z prędkością 4 m/s. Jaka jest jego energia kinetyczna?", ["8 J", "4 J", "16 J", "2 J"], 0, "Ek = 1 × 4² / 2 = 8 J."],
    ["Ciało o masie 2 kg porusza się z prędkością 3 m/s. Jaka jest jego energia kinetyczna?", ["9 J", "6 J", "18 J", "3 J"], 0, "Ek = 2 × 3² / 2 = 9 J."],
    ["Ciało o masie 5 kg znajduje się na wysokości 2 m. Przyjmij g = 10 m/s². Jaka jest Ep?", ["100 J", "50 J", "20 J", "10 J"], 0, "Ep = 5 × 10 × 2 = 100 J."],
    ["Ciało o masie 3 kg znajduje się na wysokości 4 m. Przyjmij g = 10 m/s². Jaka jest Ep?", ["120 J", "12 J", "40 J", "30 J"], 0, "Ep = 3 × 10 × 4 = 120 J."],
    ["Jeżeli ciało ma 50 J energii potencjalnej i 30 J kinetycznej, jego energia mechaniczna wynosi:", ["80 J", "20 J", "50 J", "30 J"], 0, "Energia mechaniczna to suma 50 J + 30 J = 80 J."],
    ["Jeżeli energia mechaniczna wynosi 100 J, a potencjalna 40 J, energia kinetyczna wynosi:", ["60 J", "140 J", "40 J", "100 J"], 0, "Ek = 100 J − 40 J = 60 J."],

    // 91–100
    ["W jaki sposób energia może być przekazywana przez promieniowanie?", ["Za pomocą fal elektromagnetycznych", "Tylko przez bezpośredni kontakt", "Wyłącznie przez przepływ wody", "Tylko przez ruch mechaniczny"], 0, "Promieniowanie elektromagnetyczne przenosi energię, także przez próżnię."],
    ["Czy światło słoneczne może przekazywać energię przez próżnię?", ["Tak", "Nie", "Tylko w wodzie", "Tylko w powietrzu"], 0, "Promieniowanie słoneczne dociera do Ziemi przez próżnię kosmiczną."],
    ["Co jest przykładem energii dźwiękowej?", ["Dźwięk uderzanego dzwonka", "Podniesiony kamień", "Naładowany akumulator", "Rozciągnięta sprężyna"], 0, "Drgania dzwonka i powietrza przenoszą energię dźwiękową."],
    ["Co dzieje się z energią mechaniczną podczas zderzenia niesprężystego?", ["Część zamienia się w inne postacie energii", "Cała znika", "Zawsze rośnie", "Zamienia się wyłącznie w grawitacyjną"], 0, "Część energii mechanicznej przechodzi np. w ciepło i dźwięk."],
    ["Czy całkowita energia w układzie izolowanym może samoczynnie zniknąć?", ["Nie", "Tak", "Tylko w dzień", "Tylko przy dużej masie"], 0, "Zasada zachowania energii mówi, że całkowita energia pozostaje stała."],
    ["W jaki sposób energia chemiczna paliwa trafia do samochodu?", ["Przez spalanie w silniku", "Przez odbicie światła", "Przez magnes", "Przez parowanie opon"], 0, "Spalanie paliwa dostarcza energii do pracy silnika."],
    ["Która przemiana zachodzi w latarce z baterią?", ["Chemiczna → elektryczna → świetlna i cieplna", "Grawitacyjna → jądrowa", "Dźwiękowa → mechaniczna", "Cieplna → chemiczna wyłącznie"], 0, "Bateria dostarcza energię elektryczną, a żarówka lub LED emituje światło."],
    ["Która przemiana energii zachodzi podczas jazdy rowerem?", ["Chemiczna → mechaniczna", "Świetlna → jądrowa", "Dźwiękowa → grawitacyjna", "Cieplna → magnetyczna"], 0, "Mięśnie wykorzystują energię chemiczną do napędzania roweru."],
    ["Dlaczego rozgrzewają się hamulce samochodu?", ["Tarcie zamienia energię ruchu w cieplną", "Energia kinetyczna znika", "Silnik wytwarza światło", "Masa samochodu rośnie"], 0, "Tarcie podczas hamowania powoduje przemianę energii kinetycznej w cieplną."],
    ["Co najlepiej opisuje zasadę zachowania energii?", ["Energia zmienia postać, ale całkowita ilość w układzie izolowanym jest stała", "Energia zawsze się zwiększa", "Energia może powstawać z niczego", "Energia znika po wykonaniu pracy"], 0, "Energia nie jest tworzona ani niszczona, tylko przekazywana i przekształcana."]
],
   cieplo: [
    // 1–10
    ["Ciepło przepływa samorzutnie:", ["Od cieplejszego do chłodniejszego", "Od zimnego do gorącego", "Zawsze w górę", "Nie przepływa"], 0, "Energia cieplna przepływa samorzutnie od wyższej temperatury do niższej."],
    ["Podstawowa jednostka temperatury SI to:", ["Kelwin", "Dżul", "Wat", "Niuton"], 0, "Jednostką temperatury w układzie SI jest kelwin."],
    ["Gaz przechodzący w ciecz ulega:", ["Parowaniu", "Skraplaniu", "Topnieniu", "Sublimacji"], 1, "Przemiana gazu w ciecz to skraplanie."],
    ["Przewodnictwo cieplne to:", ["Przekazywanie energii przez kontakt", "Ruch planet", "Odbicie światła", "Przepływ prądu"], 0, "Ciepło może być przekazywane przez bezpośredni kontakt cząsteczek."],
    ["Dobrym przewodnikiem ciepła jest:", ["Miedź", "Styropian", "Drewno", "Wełna"], 0, "Miedź jest metalem dobrze przewodzącym ciepło."],
    ["Podczas ogrzewania większość ciał:", ["Rozszerza się", "Znika", "Traci masę", "Zatrzymuje cząsteczki"], 0, "Większość substancji zwiększa swoje wymiary podczas ogrzewania."],
    ["Przyrząd do pomiaru temperatury to:", ["Termometr", "Dynamometr", "Amperomierz", "Barometr"], 0, "Temperaturę mierzymy termometrem."],
    ["Temperatura wrzenia wody przy ciśnieniu atmosferycznym wynosi około:", ["100°C", "0°C", "50°C", "200°C"], 0, "Woda wrze w temperaturze około 100°C przy normalnym ciśnieniu atmosferycznym."],
    ["Temperatura zamarzania wody przy normalnym ciśnieniu wynosi:", ["0°C", "10°C", "50°C", "100°C"], 0, "Czysta woda zamarza w temperaturze 0°C."],
    ["Jednostką ciepła jest:", ["Dżul", "Kelwin", "Metr", "Amper"], 0, "Ciepło jest formą przekazywania energii, więc mierzymy je w dżulach."],

    // 11–20
    ["Który materiał jest dobrym izolatorem cieplnym?", ["Styropian", "Miedź", "Aluminium", "Żelazo"], 0, "Styropian słabo przewodzi ciepło."],
    ["Dlaczego metalowa łyżka w gorącej herbacie się nagrzewa?", ["Przewodzi ciepło", "Wytwarza zimno", "Zmienia się w ciecz", "Odbija temperaturę"], 0, "Ciepło przepływa przez metalową łyżkę."],
    ["Jak nazywa się przemiana ciała stałego w ciecz?", ["Topnienie", "Krzepnięcie", "Parowanie", "Skraplanie"], 0, "Topnienie polega na przejściu ze stanu stałego w ciekły."],
    ["Jak nazywa się przemiana cieczy w ciało stałe?", ["Krzepnięcie", "Topnienie", "Parowanie", "Wrzenie"], 0, "Krzepnięcie to przejście cieczy w ciało stałe."],
    ["Jak nazywa się przemiana cieczy w gaz?", ["Parowanie", "Skraplanie", "Krzepnięcie", "Topnienie"], 0, "Parowanie polega na przejściu cieczy w gaz."],
    ["Jak nazywa się przemiana ciała stałego bezpośrednio w gaz?", ["Sublimacja", "Skraplanie", "Topnienie", "Krzepnięcie"], 0, "Sublimacja omija stan ciekły."],
    ["Jak nazywa się przemiana gazu bezpośrednio w ciało stałe?", ["Resublimacja", "Parowanie", "Topnienie", "Wrzenie"], 0, "Resublimacja to przejście gazu bezpośrednio w ciało stałe."],
    ["Co jest przykładem parowania?", ["Suszenie mokrego ubrania", "Zamarzanie jeziora", "Powstawanie lodu", "Topnienie śniegu"], 0, "Woda z ubrania przechodzi do powietrza w postaci pary."],
    ["Co jest przykładem skraplania?", ["Para wodna na zimnej szybie", "Topniejący lód", "Znikający śnieg", "Wrząca woda"], 0, "Para wodna skrapla się na chłodnej powierzchni."],
    ["Co jest przykładem krzepnięcia?", ["Zamarzanie wody", "Gotowanie wody", "Topnienie lodu", "Suszenie ubrań"], 0, "Woda zmienia się w lód."],

    // 21–30
    ["Co jest przykładem topnienia?", ["Roztapianie lodu", "Zamarzanie kałuży", "Powstawanie szronu", "Skraplanie pary"], 0, "Lód przechodzi ze stanu stałego w ciekły."],
    ["Podczas wrzenia cieczy:", ["Pęcherzyki pary powstają w całej objętości", "Ciecz zawsze zamarza", "Temperatura zawsze spada", "Ciecz zmienia się w ciało stałe"], 0, "Wrzenie zachodzi w całej objętości cieczy."],
    ["Parowanie zachodzi:", ["Z powierzchni cieczy", "Tylko na dnie naczynia", "Tylko w próżni", "Wyłącznie w temperaturze 100°C"], 0, "Parowanie zachodzi na powierzchni cieczy i może występować w różnych temperaturach."],
    ["Od czego zależy szybkość parowania?", ["Od temperatury i powierzchni cieczy", "Wyłącznie od koloru naczynia", "Od masy stołu", "Od kształtu termometru"], 0, "Wyższa temperatura i większa powierzchnia zwykle przyspieszają parowanie."],
    ["Kiedy woda paruje szybciej?", ["Gdy jest cieplejsza", "Gdy jest zimniejsza", "Gdy jest zamrożona", "Gdy nie ma powierzchni"], 0, "Wyższa temperatura zwiększa szybkość parowania."],
    ["Dlaczego mokre ubrania schną szybciej na wietrze?", ["Wiatr usuwa wilgotne powietrze znad ubrania", "Wiatr zamienia wodę w lód", "Wiatr zwiększa masę ubrania", "Wiatr zatrzymuje parowanie"], 0, "Ruch powietrza ułatwia odprowadzanie pary wodnej."],
    ["Czy parowanie może zachodzić w temperaturze pokojowej?", ["Tak", "Nie", "Tylko w 100°C", "Tylko zimą"], 0, "Parowanie zachodzi także w temperaturze pokojowej."],
    ["Podczas wrzenia czystej wody przy stałym ciśnieniu temperatura:", ["Pozostaje stała", "Ciągle rośnie", "Ciągle maleje", "Zmienia się losowo"], 0, "Energia jest zużywana na przemianę fazową, a temperatura pozostaje stała."],
    ["Ciepło właściwe określa:", ["Ile energii potrzeba do ogrzania 1 kg substancji o 1 K", "Masę ciała", "Objętość naczynia", "Szybkość ruchu"], 0, "Ciepło właściwe opisuje energię potrzebną do zmiany temperatury jednostki masy substancji."],
    ["Jednostka ciepła właściwego to:", ["J/(kg·K)", "N/m", "kg/s", "W/m"], 0, "Ciepło właściwe mierzymy w dżulach na kilogram i kelwin."],

    // 31–40
    ["Wzór na ilość ciepła przy ogrzewaniu bez zmiany stanu skupienia to:", ["Q = m·c·ΔT", "Q = m/V", "Q = F·s", "Q = U·I"], 0, "Ilość ciepła obliczamy jako iloczyn masy, ciepła właściwego i zmiany temperatury."],
    ["Co oznacza symbol Q we wzorach cieplnych?", ["Ilość ciepła", "Ciśnienie", "Prędkość", "Natężenie prądu"], 0, "Q oznacza ilość przekazanej energii cieplnej."],
    ["Co oznacza symbol c we wzorze Q = m·c·ΔT?", ["Ciepło właściwe", "Prędkość światła", "Ciśnienie", "Moc"], 0, "Symbol c oznacza ciepło właściwe substancji."],
    ["Co oznacza symbol m we wzorze Q = m·c·ΔT?", ["Masę", "Moc", "Długość", "Temperaturę"], 0, "m oznacza masę ogrzewanej substancji."],
    ["Co oznacza ΔT?", ["Zmianę temperatury", "Gęstość", "Czas", "Objętość"], 0, "Delta T oznacza różnicę temperatury końcowej i początkowej."],
    ["Jeżeli temperatura wzrosła z 20°C do 50°C, zmiana temperatury wynosi:", ["30°C", "70°C", "20°C", "50°C"], 0, "50°C − 20°C = 30°C."],
    ["Ile energii potrzeba do ogrzania 1 kg wody o 1°C? Przyjmij c = 4200 J/(kg·°C).", ["4200 J", "420 J", "42 J", "8400 J"], 0, "Q = 1 × 4200 × 1 = 4200 J."],
    ["Ile energii potrzeba do ogrzania 2 kg wody o 1°C? Przyjmij c = 4200 J/(kg·°C).", ["8400 J", "4200 J", "2100 J", "400 J"], 0, "Q = 2 × 4200 × 1 = 8400 J."],
    ["Ile energii potrzeba do ogrzania 1 kg wody o 10°C? Przyjmij c = 4200 J/(kg·°C).", ["42 000 J", "4200 J", "420 J", "8400 J"], 0, "Q = 1 × 4200 × 10 = 42 000 J."],
    ["Jeżeli masa ogrzewanej substancji wzrośnie dwukrotnie, potrzebne ciepło przy tej samej zmianie temperatury:", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Ilość ciepła jest proporcjonalna do masy."],

    // 41–50
    ["Jeżeli zmiana temperatury wzrośnie dwukrotnie, potrzebne ciepło przy tej samej masie:", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Ilość ciepła jest proporcjonalna do zmiany temperatury."],
    ["Która substancja ma stosunkowo duże ciepło właściwe?", ["Woda", "Miedź", "Żelazo", "Aluminium"], 0, "Woda ma duże ciepło właściwe i wolno zmienia temperaturę."],
    ["Dlaczego woda wolno się nagrzewa?", ["Ma duże ciepło właściwe", "Nie przewodzi żadnej energii", "Nie ma masy", "Nie może zmieniać temperatury"], 0, "Do ogrzania wody potrzeba dużo energii."],
    ["Dlaczego nad morzem temperatura często zmienia się wolniej niż w głębi lądu?", ["Woda ma duże ciepło właściwe", "Piasek nie ma masy", "Woda nie pochłania energii", "Powietrze nie przewodzi ciepła"], 0, "Woda wolniej się nagrzewa i wolniej stygnie niż wiele materiałów lądowych."],
    ["Który materiał jest dobrym przewodnikiem ciepła?", ["Aluminium", "Guma", "Drewno", "Styropian"], 0, "Aluminium dobrze przewodzi energię cieplną."],
    ["Który materiał jest dobrym izolatorem cieplnym?", ["Wełna mineralna", "Miedź", "Srebro", "Żelazo"], 0, "Wełna mineralna ogranicza przepływ ciepła."],
    ["Dlaczego uchwyty garnków często wykonuje się z tworzyw sztucznych?", ["Słabo przewodzą ciepło", "Są zawsze zimniejsze od lodu", "Wytwarzają energię", "Zwiększają temperaturę wody"], 0, "Tworzywa sztuczne mogą ograniczać przepływ ciepła do dłoni."],
    ["Jak nazywa się przekazywanie ciepła przez ruch cieczy lub gazu?", ["Konwekcja", "Przewodnictwo", "Promieniowanie", "Odbicie"], 0, "Konwekcja polega na przenoszeniu energii wraz z ruchem płynu."],
    ["Jak nazywa się przekazywanie energii cieplnej przez fale elektromagnetyczne?", ["Promieniowanie", "Konwekcja", "Przewodnictwo", "Parowanie"], 0, "Promieniowanie cieplne może zachodzić także w próżni."],
    ["W jaki sposób Słońce ogrzewa Ziemię?", ["Przez promieniowanie", "Przez przewodnictwo", "Przez konwekcję w próżni", "Przez bezpośredni kontakt"], 0, "Energia słoneczna dociera do Ziemi jako promieniowanie elektromagnetyczne."],

    // 51–60
    ["Dlaczego ciepłe powietrze unosi się do góry?", ["Ma zwykle mniejszą gęstość", "Ma zawsze większą masę", "Jest całkowicie pozbawione cząsteczek", "Nie ma temperatury"], 0, "Ogrzane powietrze rozszerza się i zwykle ma mniejszą gęstość."],
    ["W którym miejscu pokoju zwykle gromadzi się cieplejsze powietrze?", ["Przy suficie", "Przy podłodze", "Pod dywanem", "W zamkniętej szafie zawsze"], 0, "Ciepłe powietrze unosi się ku górze."],
    ["Dlaczego grzejniki często montuje się przy podłodze?", ["Ogrzane powietrze unosi się i ogrzewa pomieszczenie", "Ciepło zawsze opada", "Podłoga wytwarza prąd", "Grzejnik musi być pod oknem z powodu grawitacji"], 0, "Konwekcja pomaga rozprowadzać ciepło po pomieszczeniu."],
    ["Czy promieniowanie cieplne może rozchodzić się w próżni?", ["Tak", "Nie", "Tylko w wodzie", "Tylko w metalu"], 0, "Promieniowanie nie wymaga ośrodka materialnego."],
    ["Co jest przykładem konwekcji?", ["Ruch ogrzanego powietrza w pokoju", "Nagrzewanie metalowego pręta na jednym końcu", "Światło docierające ze Słońca", "Odbicie światła od lustra"], 0, "Ogrzane powietrze przemieszcza się i przenosi energię."],
    ["Co jest przykładem przewodnictwa cieplnego?", ["Nagrzewanie metalowego pręta od jednego końca", "Wiatr wiejący nad morzem", "Promienie Słońca", "Ruch chmur"], 0, "Energia cieplna rozchodzi się w metalu przez kontakt cząsteczek."],
    ["Co jest przykładem promieniowania cieplnego?", ["Ciepło od ogniska odczuwane z pewnej odległości", "Metalowa łyżka w herbacie", "Gotowanie wody w garnku", "Przepływ ciepłego powietrza"], 0, "Ognisko emituje promieniowanie cieplne."],
    ["Co oznacza rozszerzalność cieplna?", ["Zmianę wymiarów ciała pod wpływem temperatury", "Zmianę koloru bez zmiany temperatury", "Zanik masy", "Zatrzymanie cząsteczek"], 0, "Wiele substancji zmienia swoje wymiary podczas ogrzewania."],
    ["Dlaczego na mostach stosuje się szczeliny dylatacyjne?", ["Aby umożliwić rozszerzanie i kurczenie materiału", "Aby zwiększyć masę mostu", "Aby zatrzymać ruch samochodów", "Aby zmniejszyć grawitację"], 0, "Szczeliny pozwalają konstrukcji zmieniać długość wraz z temperaturą."],
    ["Co dzieje się z metalową szyną kolejową podczas silnego ogrzewania?", ["Wydłuża się", "Zawsze skraca się", "Traci całą masę", "Zamienia się w gaz"], 0, "Metal rozszerza się pod wpływem wzrostu temperatury."],

    // 61–70
    ["Dlaczego przewody elektryczne mogą zwisać bardziej latem?", ["Metal rozszerza się podczas ogrzewania", "Metal znika", "Przewody tracą masę", "Powietrze przestaje działać"], 0, "Wzrost temperatury powoduje wydłużenie przewodów."],
    ["Co dzieje się z większością ciał podczas ochładzania?", ["Kurczą się", "Zawsze zwiększają objętość", "Znikają", "Zamieniają się w energię"], 0, "Większość substancji zmniejsza swoje wymiary podczas ochładzania."],
    ["W jakiej temperaturze woda ma największą gęstość?", ["Około 4°C", "0°C", "50°C", "100°C"], 0, "Woda ma największą gęstość w temperaturze około 4°C."],
    ["Dlaczego lód unosi się na wodzie?", ["Ma mniejszą gęstość niż ciekła woda", "Ma większą masę każdego kawałka", "Nie działa na niego grawitacja", "Jest cieplejszy od wody"], 0, "Lód ma mniejszą gęstość niż ciekła woda."],
    ["Dlaczego jeziora zamarzają najpierw przy powierzchni?", ["Lód ma mniejszą gęstość i unosi się", "Woda na dnie nie ma temperatury", "Grawitacja działa tylko na powierzchni", "Dno jeziora ogrzewa wodę"], 0, "Lód pozostaje na powierzchni i tworzy warstwę izolacyjną."],
    ["Co oznacza temperatura 0 K?", ["Zero bezwzględne", "Temperaturę wrzenia wody", "Temperaturę topnienia lodu", "Temperaturę pokojową"], 0, "Zero kelwinów to najniższa możliwa granica temperatury."],
    ["Ile wynosi w przybliżeniu 0°C w kelwinach?", ["273 K", "100 K", "0 K", "373 K"], 0, "0°C odpowiada około 273,15 K."],
    ["Ile wynosi w przybliżeniu 100°C w kelwinach?", ["373 K", "273 K", "100 K", "473 K"], 0, "100°C odpowiada około 373,15 K."],
    ["Ile wynosi w przybliżeniu 20°C w kelwinach?", ["293 K", "253 K", "273 K", "320 K"], 0, "20°C + 273 ≈ 293 K."],
    ["Czy temperatura w kelwinach może być ujemna w zwykłej skali termodynamicznej?", ["Nie", "Tak, zawsze", "Tylko latem", "Tylko na Ziemi"], 0, "Skala Kelvina zaczyna się od zera bezwzględnego."],

    // 71–80
    ["Co dzieje się z energią wewnętrzną ciała, gdy je ogrzewamy?", ["Zwykle rośnie", "Zawsze maleje", "Znika", "Zamienia się w masę"], 0, "Ogrzewanie zwykle zwiększa energię wewnętrzną ciała."],
    ["Energia wewnętrzna ciała zależy między innymi od:", ["Ruchu i oddziaływań jego cząsteczek", "Koloru etykiety", "Nazwy przedmiotu", "Długości cienia"], 0, "Energia wewnętrzna obejmuje energię ruchu i oddziaływań cząsteczek."],
    ["Dlaczego pocieranie dwóch przedmiotów może je ogrzać?", ["Tarcie zwiększa energię wewnętrzną", "Tarcie usuwa cząsteczki", "Tarcie zmniejsza masę do zera", "Tarcie zatrzymuje temperaturę"], 0, "Praca wykonana przeciwko tarciu może zwiększyć energię wewnętrzną."],
    ["Co oznacza równowaga termiczna?", ["Ciała mają taką samą temperaturę i nie ma między nimi netto przepływu ciepła", "Ciała mają tę samą masę", "Ciała zawsze mają tę samą objętość", "Ciała przestają istnieć"], 0, "W równowadze termicznej nie ma samorzutnego przepływu ciepła między ciałami."],
    ["Co stanie się po zetknięciu gorącego metalu z chłodną wodą?", ["Ciepło przepłynie z metalu do wody", "Ciepło przepłynie z wody do metalu", "Oba ciała natychmiast zamarzną", "Nie nastąpi wymiana energii"], 0, "Energia cieplna przepływa od gorętszego metalu do chłodniejszej wody."],
    ["Kiedy ustanie przepływ ciepła między dwoma ciałami?", ["Gdy osiągną równowagę termiczną", "Gdy będą miały różne masy", "Gdy jedno zniknie", "Gdy zmieni się ich kolor"], 0, "Przepływ netto ustaje, gdy temperatury ciał się wyrównają."],
    ["Co to jest kalorymetr?", ["Przyrząd do badania wymiany ciepła", "Przyrząd do mierzenia siły", "Urządzenie do pomiaru prędkości", "Rodzaj silnika"], 0, "Kalorymetr służy do pomiarów związanych z ilością ciepła."],
    ["Co mierzy termometr lekarski?", ["Temperaturę ciała", "Ciśnienie krwi", "Masę ciała", "Prędkość ruchu"], 0, "Termometr lekarski służy do pomiaru temperatury ciała."],
    ["Dlaczego termometr cieczowy działa?", ["Ciecz zmienia objętość wraz z temperaturą", "Ciecz zmienia masę na zero", "Ciecz wytwarza światło", "Ciecz zawsze zamarza"], 0, "Zmiana objętości cieczy powoduje przesuwanie się jej poziomu w rurce."],
    ["Dlaczego ciemne powierzchnie często szybciej nagrzewają się na słońcu?", ["Zwykle pochłaniają więcej promieniowania", "Zawsze odbijają całe światło", "Nie mają temperatury", "Są pozbawione masy"], 0, "Ciemne powierzchnie zwykle pochłaniają większą część padającego promieniowania."],

    // 81–90
    ["Która powierzchnia zwykle lepiej odbija promieniowanie cieplne?", ["Jasna i błyszcząca", "Czarna i matowa", "Ciemna i chropowata", "Pokryta sadzą"], 0, "Jasne, błyszczące powierzchnie zwykle dobrze odbijają promieniowanie."],
    ["Dlaczego termos ogranicza stygnięcie napoju?", ["Ogranicza przewodnictwo, konwekcję i promieniowanie", "Wytwarza dodatkową wodę", "Zwiększa grawitację", "Zatrzymuje ruch cząsteczek całkowicie"], 0, "Konstrukcja termosu ogranicza różne sposoby wymiany ciepła."],
    ["Po co w termosie stosuje się próżnię między ściankami?", ["Aby ograniczyć przewodnictwo i konwekcję", "Aby zwiększyć przepływ powietrza", "Aby woda szybciej parowała", "Aby zwiększyć masę"], 0, "Próżnia ogranicza przewodnictwo i praktycznie eliminuje konwekcję między ściankami."],
    ["Dlaczego zimą zakładamy kilka warstw ubrań?", ["Warstwy zatrzymują powietrze, które izoluje", "Ubrania wytwarzają tlen", "Ubrania zmniejszają grawitację", "Warstwy chłodzą ciało"], 0, "Powietrze między warstwami odzieży ogranicza utratę ciepła."],
    ["Dlaczego śnieg może chronić rośliny przed silnym mrozem?", ["Zawiera dużo powietrza i izoluje", "Jest bardzo dobrym przewodnikiem ciepła", "Zawsze ogrzewa się do 100°C", "Nie ma temperatury"], 0, "Warstwa śniegu działa jak izolator cieplny."],
    ["Co oznacza topnienie lodu?", ["Pobieranie energii z otoczenia", "Oddawanie całej energii bez zmiany", "Zamianę lodu w gaz bezpośrednio", "Zanik masy"], 0, "Topnienie wymaga dostarczenia energii do przemiany fazowej."],
    ["Co dzieje się z energią podczas krzepnięcia wody?", ["Woda oddaje energię do otoczenia", "Woda pobiera energię z otoczenia", "Energia całkowicie znika", "Masa wody rośnie do nieskończoności"], 0, "Podczas krzepnięcia woda oddaje energię cieplną."],
    ["Czy podczas topnienia czystego lodu w stałym ciśnieniu temperatura pozostaje stała?", ["Tak, w trakcie topnienia", "Nie, zawsze rośnie", "Nie, zawsze maleje", "Zmienia się losowo"], 0, "Podczas topnienia temperatura lodu i wody pozostaje około 0°C przy normalnym ciśnieniu."],
    ["Jak nazywa się energia potrzebna do zmiany stanu skupienia bez zmiany temperatury?", ["Ciepło przemiany fazowej", "Energia kinetyczna samochodu", "Moc elektryczna", "Ciśnienie hydrostatyczne"], 0, "Podczas przemiany fazowej energia jest zużywana na zmianę stanu skupienia."],
    ["Dlaczego pot chłodzi organizm?", ["Parowanie potu pobiera energię z powierzchni skóry", "Pot zamienia się w lód zawsze", "Pot zwiększa temperaturę skóry", "Pot blokuje przepływ ciepła całkowicie"], 0, "Parowanie potu wymaga energii, która jest pobierana ze skóry."],

    // 91–100
    ["Dlaczego po wyjściu z wody odczuwamy chłód?", ["Woda paruje ze skóry i odbiera jej energię", "Woda wytwarza zimno", "Grawitacja nagle rośnie", "Skóra przestaje przewodzić ciepło"], 0, "Parowanie wody ze skóry powoduje jej ochładzanie."],
    ["Który proces odpowiada za powstawanie rosy?", ["Skraplanie pary wodnej", "Topnienie lodu", "Sublimacja", "Wrzenie"], 0, "Para wodna skrapla się na chłodnych powierzchniach."],
    ["Jak powstaje szron?", ["Para wodna resublimuje na zimnej powierzchni", "Woda wrze", "Lód topnieje", "Ciecz paruje w wysokiej temperaturze"], 0, "Szron powstaje, gdy para wodna przechodzi bezpośrednio w lód."],
    ["Co jest głównym składnikiem pary wodnej?", ["Woda w stanie gazowym", "Tlen", "Azot", "Dwutlenek węgla"], 0, "Para wodna to woda występująca w stanie gazowym."],
    ["Czy para wodna jest widoczna jako czysty gaz?", ["Nie, jest niewidoczna", "Tak, zawsze jest biała", "Jest zawsze niebieska", "Jest czarna"], 0, "Czysta para wodna jest niewidoczna; widoczna biała mgiełka to drobne kropelki wody."],
    ["Dlaczego pokrywka garnka robi się mokra podczas gotowania?", ["Para wodna skrapla się na chłodniejszej pokrywce", "Pokrywka wytwarza wodę", "Metal zamienia się w ciecz", "Woda przestaje parować"], 0, "Para wodna oddaje energię i skrapla się na pokrywce."],
    ["Co oznacza punkt rosy?", ["Temperaturę, przy której powietrze osiąga nasycenie parą wodną", "Temperaturę wrzenia metalu", "Temperaturę topnienia szkła", "Najwyższą temperaturę w roku"], 0, "Punkt rosy to temperatura, przy której para wodna zaczyna się skraplać przy danym ciśnieniu."],
    ["Które zjawisko jest wykorzystywane w chłodziarce?", ["Przemiany czynnika chłodniczego i odbieranie ciepła", "Spalanie lodu", "Zwiększanie masy żywności", "Zatrzymywanie wszystkich cząsteczek"], 0, "Czynnik chłodniczy odbiera ciepło z wnętrza chłodziarki i oddaje je na zewnątrz."],
    ["Dlaczego nie należy wkładać gorącego garnka bezpośrednio do lodówki?", ["Może ogrzać wnętrze i zwiększyć zużycie energii", "Garnek straci masę", "Lodówka zacznie produkować lód natychmiast", "Temperatura nie ma znaczenia"], 0, "Gorący garnek przekazuje ciepło do wnętrza lodówki."],
    ["Co najlepiej opisuje energię cieplną?", ["Energię związaną z ruchem i oddziaływaniami cząsteczek", "Energię wyłącznie poruszającego się samochodu", "Energię światła odbitego od lustra", "Energię zgromadzoną tylko w magnesie"], 0, "Energia wewnętrzna substancji jest związana z ruchem i oddziaływaniami jej cząsteczek."]
],
    elektrycznosc: [
    // 1–10
    ["Jednostka natężenia prądu to:", ["Amper", "Wolt", "Om", "Wat"], 0, "Natężenie prądu mierzymy w amperach."],
    ["Jednostka napięcia elektrycznego to:", ["Amper", "Wolt", "Om", "Dżul"], 1, "Napięcie mierzymy w woltach."],
    ["Jednostka oporu elektrycznego to:", ["Om", "Wolt", "Amper", "Tesla"], 0, "Opór elektryczny mierzymy w omach."],
    ["Prawo Ohma opisuje zależność:", ["U = I·R", "F = m·a", "P = W/t", "v = s/t"], 0, "Prawo Ohma: napięcie jest iloczynem natężenia i oporu."],
    ["Jednakowe bieguny magnesów:", ["Odpychają się", "Przyciągają się", "Nie oddziałują", "Znikają"], 0, "Bieguny jednoimienne się odpychają."],
    ["Amperomierz włączamy do obwodu:", ["Szeregowo", "Równolegle", "Zamiast baterii", "Nie podłączamy"], 0, "Amperomierz mierzy prąd płynący przez element, dlatego włączamy go szeregowo."],
    ["Woltomierz włączamy do obwodu:", ["Równolegle", "Szeregowo", "Zamiast przewodu", "Bez podłączenia"], 0, "Woltomierz mierzy napięcie między dwoma punktami."],
    ["Co jest źródłem napięcia w prostym obwodzie?", ["Bateria", "Żarówka", "Wyłącznik", "Przewód"], 0, "Bateria dostarcza energię elektryczną do obwodu."],
    ["Prąd elektryczny to uporządkowany ruch:", ["Ładunków elektrycznych", "Cząsteczek światła", "Fal dźwiękowych", "Atomów tlenu"], 0, "Prąd elektryczny polega na uporządkowanym ruchu ładunków."],
    ["Który materiał dobrze przewodzi prąd?", ["Miedź", "Guma", "Plastik", "Suche drewno"], 0, "Miedź jest dobrym przewodnikiem elektrycznym."],

    // 11–20
    ["Który materiał jest izolatorem elektrycznym?", ["Guma", "Miedź", "Aluminium", "Srebro"], 0, "Guma słabo przewodzi prąd elektryczny."],
    ["Elektrony mają ładunek:", ["Ujemny", "Dodatni", "Obojętny", "Zawsze zmienny"], 0, "Elektron ma ładunek ujemny."],
    ["Proton ma ładunek:", ["Dodatni", "Ujemny", "Obojętny", "Nie posiada masy"], 0, "Proton ma dodatni ładunek elektryczny."],
    ["Neutron ma ładunek:", ["Obojętny", "Dodatni", "Ujemny", "Podwójny"], 0, "Neutron nie ma ładunku elektrycznego."],
    ["Jakie ładunki elektryczne się przyciągają?", ["Różnoimienne", "Jednoimienne", "Tylko dodatnie", "Tylko ujemne"], 0, "Ładunki różnoimienne przyciągają się."],
    ["Jakie ładunki elektryczne się odpychają?", ["Jednoimienne", "Różnoimienne", "Tylko dodatni i ujemny", "Wszystkie ładunki"], 0, "Ładunki jednoimienne odpychają się."],
    ["Co oznacza symbol I we wzorach elektrycznych?", ["Natężenie prądu", "Napięcie", "Opór", "Moc"], 0, "I oznacza natężenie prądu."],
    ["Co oznacza symbol U?", ["Napięcie", "Natężenie", "Opór", "Energię"], 0, "U oznacza napięcie elektryczne."],
    ["Co oznacza symbol R?", ["Opór elektryczny", "Moc", "Natężenie", "Czas"], 0, "R oznacza opór elektryczny."],
    ["Co oznacza symbol P w obwodzie elektrycznym?", ["Moc", "Ładunek", "Opór", "Długość"], 0, "P oznacza moc elektryczną."],

    // 21–30
    ["Jak obliczamy natężenie prądu?", ["I = Q/t", "I = U·R", "I = m/V", "I = F·s"], 0, "Natężenie to ładunek przepływający przez przekrój przewodnika w jednostce czasu."],
    ["Jednostką ładunku elektrycznego jest:", ["Kulomb", "Amper", "Wolt", "Om"], 0, "Ładunek elektryczny mierzymy w kulombach."],
    ["Jeden amper oznacza przepływ:", ["1 kulomba w ciągu sekundy", "1 wolta w ciągu sekundy", "1 oma w ciągu godziny", "1 dżula w ciągu minuty"], 0, "1 A = 1 C/s."],
    ["Jeżeli przez przewodnik przepływa ładunek 10 C w czasie 2 s, natężenie wynosi:", ["5 A", "20 A", "10 A", "2 A"], 0, "I = Q/t = 10/2 = 5 A."],
    ["Jeżeli napięcie wynosi 12 V, a opór 4 Ω, natężenie wynosi:", ["3 A", "48 A", "8 A", "16 A"], 0, "I = U/R = 12/4 = 3 A."],
    ["Jeżeli napięcie wynosi 10 V, a natężenie 2 A, opór wynosi:", ["5 Ω", "20 Ω", "12 Ω", "8 Ω"], 0, "R = U/I = 10/2 = 5 Ω."],
    ["Jeżeli opór wynosi 6 Ω, a natężenie 2 A, napięcie wynosi:", ["12 V", "3 V", "8 V", "4 V"], 0, "U = I·R = 2 × 6 = 12 V."],
    ["Co stanie się z natężeniem prądu, gdy napięcie wzrośnie dwukrotnie, a opór pozostanie stały?", ["Wzrośnie dwukrotnie", "Zmniejszy się dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Z prawa Ohma wynika, że I = U/R."],
    ["Co stanie się z natężeniem, gdy opór wzrośnie dwukrotnie przy stałym napięciu?", ["Zmniejszy się dwukrotnie", "Wzrośnie dwukrotnie", "Nie zmieni się", "Wzrośnie czterokrotnie"], 0, "Przy stałym napięciu większy opór oznacza mniejsze natężenie."],
    ["Przewodnik ma opór 10 Ω i płynie przez niego prąd 0,5 A. Napięcie wynosi:", ["5 V", "10 V", "20 V", "0,05 V"], 0, "U = 0,5 × 10 = 5 V."],

    // 31–40
    ["Wzór na moc elektryczną to:", ["P = U·I", "P = U/I", "P = I/R", "P = R/U"], 0, "Moc elektryczna jest iloczynem napięcia i natężenia."],
    ["Jednostką mocy elektrycznej jest:", ["Wat", "Wolt", "Amper", "Om"], 0, "Moc mierzymy w watach."],
    ["Urządzenie pracuje przy napięciu 10 V i natężeniu 2 A. Jego moc wynosi:", ["20 W", "5 W", "12 W", "8 W"], 0, "P = U·I = 10 × 2 = 20 W."],
    ["Żarówka ma moc 60 W. Co oznacza ta wartość?", ["Zużywa 60 J energii w każdej sekundzie", "Ma opór 60 Ω", "Ma napięcie 60 V", "Przepływa przez nią zawsze 60 A"], 0, "1 W oznacza 1 J energii na sekundę."],
    ["Ile watów ma 1 kilowat?", ["1000 W", "100 W", "10 W", "10 000 W"], 0, "1 kW = 1000 W."],
    ["Urządzenie o mocy 100 W pracuje przez 10 sekund. Zużyta energia wynosi:", ["1000 J", "100 J", "10 J", "10 000 J"], 0, "E = P·t = 100 × 10 = 1000 J."],
    ["Wzór na energię elektryczną przy stałej mocy to:", ["E = P·t", "E = P/t", "E = U/R", "E = I/R"], 0, "Energia jest iloczynem mocy i czasu pracy."],
    ["Ile energii zużyje urządzenie o mocy 1000 W pracujące przez 2 godziny?", ["2 kWh", "1 kWh", "2000 kWh", "0,5 kWh"], 0, "1 kW × 2 h = 2 kWh."],
    ["Co oznacza skrót kWh?", ["Kilowatogodzina", "Kilowat na godzinę", "Kilowolt", "Kiloom"], 0, "Kilowatogodzina jest jednostką energii."],
    ["Które urządzenie ma zwykle największą moc?", ["Czajnik elektryczny", "Zegar ścienny", "Mała dioda LED", "Pilot telewizyjny"], 0, "Czajnik potrzebuje dużej mocy do szybkiego ogrzewania wody."],

    // 41–50
    ["W obwodzie szeregowym natężenie prądu:", ["Jest takie samo w każdym elemencie", "Jest różne w każdym elemencie", "Zawsze wynosi zero", "Zależy wyłącznie od koloru przewodu"], 0, "Przez wszystkie elementy połączone szeregowo płynie ten sam prąd."],
    ["W obwodzie równoległym napięcie na każdej gałęzi jest:", ["Takie samo", "Zawsze zerowe", "Zawsze różne", "Zależne od długości przewodu wyłącznie"], 0, "Każda gałąź jest podłączona do tych samych dwóch punktów."],
    ["Co się stanie, gdy jedna żarówka w prostym obwodzie szeregowym się przepali?", ["Cały obwód przestanie działać", "Pozostałe będą świecić jaśniej", "Bateria zwiększy napięcie", "Nic się nie zmieni"], 0, "Przepalenie żarówki przerywa obwód szeregowy."],
    ["Co się stanie, gdy jedna żarówka w obwodzie równoległym się przepali?", ["Pozostałe mogą nadal świecić", "Wszystkie zawsze zgasną", "Bateria zniknie", "Natężenie zawsze wyniesie zero w całym układzie"], 0, "Pozostałe gałęzie obwodu równoległego mogą nadal przewodzić prąd."],
    ["Jak obliczamy opór zastępczy dwóch oporników połączonych szeregowo?", ["R = R1 + R2", "R = R1·R2", "R = R1/R2", "R = R1 − R2"], 0, "Opory połączone szeregowo sumują się."],
    ["Dwa oporniki 2 Ω i 3 Ω połączono szeregowo. Opór zastępczy wynosi:", ["5 Ω", "1 Ω", "6 Ω", "0,5 Ω"], 0, "2 Ω + 3 Ω = 5 Ω."],
    ["Dwa jednakowe oporniki 10 Ω połączono równolegle. Opór zastępczy wynosi:", ["5 Ω", "10 Ω", "20 Ω", "100 Ω"], 0, "Dwa jednakowe oporniki połączone równolegle mają opór równy połowie jednego z nich."],
    ["Jak nazywa się element służący do przerywania obwodu?", ["Wyłącznik", "Rezystor", "Dioda", "Kondensator"], 0, "Wyłącznik otwiera lub zamyka obwód."],
    ["Kiedy przez obwód płynie prąd?", ["Gdy obwód jest zamknięty i istnieje napięcie", "Gdy przewód jest przerwany", "Gdy bateria jest odłączona", "Gdy wszystkie elementy są izolatorami"], 0, "Do przepływu prądu potrzebny jest zamknięty obwód i źródło napięcia."],
    ["Co oznacza zwarcie?", ["Połączenie o bardzo małym oporze, które może powodować duży prąd", "Normalne świecenie żarówki", "Brak ładunków elektrycznych", "Pomiar napięcia"], 0, "Zwarcie może wywołać bardzo duży prąd i przegrzanie przewodów."],

    // 51–60
    ["Do czego służy bezpiecznik elektryczny?", ["Chroni obwód przed zbyt dużym prądem", "Zwiększa napięcie", "Mierzy temperaturę", "Magazynuje energię"], 0, "Bezpiecznik przerywa obwód, gdy prąd przekroczy bezpieczną wartość."],
    ["Dlaczego nie należy dotykać przewodów pod napięciem?", ["Może dojść do porażenia prądem", "Przewody zawsze są zimne", "Prąd zmienia kolor skóry", "Napięcie nie istnieje"], 0, "Przepływ prądu przez ciało może być niebezpieczny dla zdrowia i życia."],
    ["Co jest szczególnie niebezpieczne podczas korzystania z urządzeń elektrycznych?", ["Dotykanie ich mokrymi rękami", "Używanie sprawnej izolacji", "Wyłączanie urządzenia przed naprawą", "Korzystanie z odpowiedniego bezpiecznika"], 0, "Woda może ułatwiać przepływ prądu przez ciało."],
    ["Jak należy postąpić przed naprawą urządzenia elektrycznego?", ["Odłączyć je od zasilania", "Polać je wodą", "Dotknąć przewodów", "Zwiększyć napięcie"], 0, "Przed naprawą trzeba odłączyć urządzenie od źródła zasilania."],
    ["Który element obwodu ogranicza natężenie prądu?", ["Rezystor", "Przewód bez oporu", "Wyłącznik zamknięty", "Bateria o zerowym napięciu"], 0, "Rezystor wprowadza opór i ogranicza prąd."],
    ["Do czego służy dioda LED?", ["Do emitowania światła", "Do pomiaru masy", "Do magazynowania paliwa", "Do mierzenia ciśnienia"], 0, "Dioda LED emituje światło, gdy jest odpowiednio spolaryzowana i zasilana."],
    ["Co się stanie, gdy diodę LED podłączymy odwrotnie w typowym obwodzie prądu stałego?", ["Zwykle nie zaświeci", "Zaświeci dwa razy jaśniej", "Zwiększy napięcie baterii", "Zamieni się w rezystor"], 0, "LED przewodzi prąd głównie w jednym kierunku."],
    ["Po co stosuje się rezystor szeregowo z diodą LED?", ["Aby ograniczyć prąd", "Aby zwiększyć jej masę", "Aby zmienić kolor baterii", "Aby zamienić prąd w dźwięk"], 0, "Rezystor chroni diodę przed nadmiernym prądem."],
    ["Który biegun baterii oznacza się znakiem plus?", ["Dodatni", "Ujemny", "Obojętny", "Zmienny"], 0, "Znak plus oznacza biegun dodatni."],
    ["Konwencjonalny kierunek prądu w obwodzie zewnętrznym przyjmuje się:", ["Od plusa do minusa", "Od minusa do plusa", "Od ziemi do chmur", "W kierunku losowym"], 0, "Umowny kierunek prądu jest przeciwny do ruchu elektronów w metalach."],

    // 61–70
    ["Jak poruszają się elektrony w metalowym przewodniku przy przepływie prądu?", ["Od bieguna ujemnego w stronę dodatniego", "Od dodatniego do ujemnego", "Nie poruszają się", "Tylko w górę"], 0, "Elektrony mają ładunek ujemny i poruszają się przeciwnie do umownego kierunku prądu."],
    ["Jak nazywa się urządzenie zamieniające energię elektryczną na światło?", ["Żarówka", "Amperomierz", "Bezpiecznik", "Wyłącznik"], 0, "Żarówka lub LED przekształca energię elektryczną w światło i ciepło."],
    ["Jak nazywa się urządzenie zamieniające energię elektryczną na ruch?", ["Silnik elektryczny", "Termometr", "Woltomierz", "Bezpiecznik"], 0, "Silnik elektryczny zamienia energię elektryczną na mechaniczną."],
    ["Jak nazywa się urządzenie zamieniające ruch na energię elektryczną?", ["Generator", "Rezystor", "Wyłącznik", "Dioda"], 0, "Generator wytwarza energię elektryczną z energii mechanicznej."],
    ["Które urządzenie wykorzystuje efekt cieplny prądu?", ["Grzałka", "Kompas", "Lustro", "Dynamometr"], 0, "Prąd przepływający przez element oporowy powoduje wydzielanie ciepła."],
    ["Dlaczego przewody mogą się nagrzewać podczas przepływu dużego prądu?", ["Mają opór elektryczny", "Nie mają elektronów", "Są zawsze wykonane z lodu", "Prąd nie przepływa przez metal"], 0, "Opór przewodnika powoduje wydzielanie energii cieplnej."],
    ["Który metal jest bardzo dobrym przewodnikiem elektrycznym?", ["Srebro", "Siarka", "Węgiel drzewny", "Guma"], 0, "Srebro ma bardzo dobrą przewodność elektryczną."],
    ["Jak nazywa się materiał, którego przewodnictwo jest pośrednie między przewodnikiem a izolatorem?", ["Półprzewodnik", "Nadprzewodnik zawsze", "Dielektryk idealny", "Magnes"], 0, "Półprzewodniki mają właściwości pośrednie i są podstawą elektroniki."],
    ["Z czego wykonuje się wiele układów scalonych?", ["Z krzemu", "Z drewna", "Z gumy", "Z papieru"], 0, "Krzem jest powszechnie stosowanym półprzewodnikiem."],
    ["Co robi tranzystor?", ["Może wzmacniać sygnał lub działać jak przełącznik", "Mierzy temperaturę wody", "Zamienia wodę w parę", "Mierzy długość przewodu"], 0, "Tranzystory są podstawowymi elementami układów elektronicznych."],

    // 71–80
    ["Do czego służy kondensator?", ["Do gromadzenia ładunku i energii elektrycznej", "Do mierzenia masy", "Do wytwarzania dźwięku zawsze", "Do chłodzenia silnika"], 0, "Kondensator magazynuje ładunek i energię w polu elektrycznym."],
    ["Co oznacza pojemność kondensatora?", ["Zdolność do gromadzenia ładunku przy danym napięciu", "Jego masę", "Jego temperaturę", "Jego długość"], 0, "Pojemność określa zależność między ładunkiem a napięciem."],
    ["Jednostką pojemności elektrycznej jest:", ["Farad", "Amper", "Wolt", "Om"], 0, "Pojemność elektryczną mierzymy w faradach."],
    ["Do czego służy cewka?", ["Wytwarza pole magnetyczne, gdy płynie przez nią prąd", "Mierzy masę", "Odbija światło", "Zmniejsza grawitację"], 0, "Prąd płynący przez cewkę wytwarza pole magnetyczne."],
    ["Co powstaje wokół przewodnika, przez który płynie prąd?", ["Pole magnetyczne", "Próżnia", "Pole grawitacyjne o zerowej wartości", "Fala dźwiękowa zawsze"], 0, "Prąd elektryczny wytwarza pole magnetyczne wokół przewodnika."],
    ["Elektromagnes działa dzięki:", ["Prądowi płynącemu przez cewkę", "Wyłącznie światłu słonecznemu", "Wodzie destylowanej", "Tarciu o drewno"], 0, "Prąd w cewce wytwarza pole magnetyczne."],
    ["Co się stanie z elektromagnesem po wyłączeniu prądu?", ["Jego pole zwykle zanika lub znacznie słabnie", "Zawsze staje się silniejszy", "Zaczyna świecić", "Zwiększa napięcie baterii"], 0, "Pole elektromagnesu zależy od przepływającego prądu."],
    ["Jak nazywa się urządzenie wskazujące kierunek pola magnetycznego Ziemi?", ["Kompas", "Amperomierz", "Woltomierz", "Termometr"], 0, "Igła kompasu ustawia się zgodnie z polem magnetycznym Ziemi."],
    ["Jakie bieguny ma magnes?", ["Północny i południowy", "Dodatni i ujemny", "Ciepły i zimny", "Lewy i prawy"], 0, "Każdy zwykły magnes ma dwa bieguny magnetyczne."],
    ["Czy można uzyskać pojedynczy biegun magnetyczny przez przecięcie magnesu?", ["Nie, powstaną dwa mniejsze magnesy", "Tak, zawsze", "Powstanie tylko biegun północny", "Magnes całkowicie zniknie"], 0, "Po przecięciu magnesu każda część ma własny biegun północny i południowy."],

    // 81–90
    ["Jak nazywa się prąd, którego kierunek okresowo się zmienia?", ["Prąd przemienny", "Prąd stały", "Prąd zerowy", "Prąd chemiczny"], 0, "W prądzie przemiennym kierunek przepływu zmienia się okresowo."],
    ["Jaki rodzaj prądu dostarcza typowa bateria?", ["Prąd stały", "Prąd przemienny", "Prąd bez napięcia", "Prąd akustyczny"], 0, "Bateria dostarcza prąd stały."],
    ["Jaki rodzaj prądu występuje w domowych gniazdkach w Polsce?", ["Prąd przemienny", "Prąd stały", "Prąd bez ładunków", "Prąd magnetyczny"], 0, "Sieć energetyczna dostarcza prąd przemienny."],
    ["Jaka jest częstotliwość prądu przemiennego w polskiej sieci energetycznej?", ["50 Hz", "10 Hz", "100 Hz", "500 Hz"], 0, "Standardowa częstotliwość sieci w Polsce wynosi 50 Hz."],
    ["Jakie napięcie nominalne występuje w typowym gniazdku domowym w Polsce?", ["230 V", "12 V", "24 V", "5 V"], 0, "Typowe napięcie sieciowe w Polsce wynosi 230 V."],
    ["Które urządzenie może zmieniać napięcie prądu przemiennego?", ["Transformator", "Rezystor", "Dioda LED", "Bezpiecznik"], 0, "Transformator może podwyższać lub obniżać napięcie przemienne."],
    ["Transformator działa dzięki zjawisku:", ["Indukcji elektromagnetycznej", "Parowania", "Tarcia", "Rozszerzalności cieplnej"], 0, "Zmienne pole magnetyczne indukuje napięcie w uzwojeniu wtórnym."],
    ["Po co przesyła się energię elektryczną na wysokim napięciu?", ["Aby ograniczyć straty energii w przewodach", "Aby zwiększyć opór przewodów", "Aby prąd całkowicie zanikł", "Aby przewody się nie nagrzewały nigdy"], 0, "Przy wysokim napięciu dla tej samej mocy płynie mniejszy prąd, co ogranicza straty."],
    ["Co oznacza symbol AC?", ["Prąd przemienny", "Prąd stały", "Ładunek dodatni", "Opór elektryczny"], 0, "AC to skrót od alternating current, czyli prądu przemiennego."],
    ["Co oznacza symbol DC?", ["Prąd stały", "Prąd przemienny", "Napięcie zmienne", "Moc cieplna"], 0, "DC to skrót od direct current, czyli prądu stałego."],

    // 91–100
    ["Jak nazywa się zjawisko powstawania napięcia w przewodniku wskutek zmiany pola magnetycznego?", ["Indukcja elektromagnetyczna", "Parowanie", "Skraplanie", "Odbicie"], 0, "Zmienne pole magnetyczne może indukować napięcie elektryczne."],
    ["Co jest potrzebne do uzyskania napięcia indukowanego w cewce?", ["Zmiana strumienia pola magnetycznego", "Stała temperatura pokojowa", "Brak jakiegokolwiek pola", "Zmiana koloru przewodu"], 0, "Napięcie indukuje się, gdy zmienia się strumień pola magnetycznego przez cewkę."],
    ["Które urządzenie wykorzystuje indukcję elektromagnetyczną?", ["Prądnica", "Termometr cieczowy", "Lustro", "Dźwignia"], 0, "Prądnica wykorzystuje indukcję do wytwarzania napięcia."],
    ["Co oznacza uziemienie urządzenia?", ["Połączenie z ziemią w celu zwiększenia bezpieczeństwa", "Podłączenie do dodatniego bieguna baterii", "Zwiększenie mocy żarówki", "Odłączenie wszystkich przewodów"], 0, "Uziemienie pomaga odprowadzić niebezpieczny prąd uszkodzeniowy."],
    ["Jaka jest rola przewodu ochronnego PE?", ["Ochrona przed porażeniem w razie uszkodzenia", "Dostarczanie sygnału audio", "Zwiększanie napięcia", "Pomiar temperatury"], 0, "Przewód ochronny łączy dostępne części przewodzące z układem ochronnym."],
    ["Dlaczego nie wolno wkładać przedmiotów do gniazdka?", ["Grozi to porażeniem prądem", "Może to zwiększyć masę gniazdka", "Gniazdko może zmienić kolor", "Prąd przestanie istnieć"], 0, "Kontakt z elementami pod napięciem może spowodować ciężkie obrażenia."],
    ["Co należy zrobić, gdy urządzenie elektryczne wpadnie do wody?", ["Nie dotykać go i bezpiecznie odłączyć zasilanie", "Natychmiast wyciągnąć je gołą ręką", "Włączyć je ponownie", "Polać je dodatkową wodą"], 0, "Najpierw trzeba odłączyć zasilanie bez narażania siebie na kontakt z wodą i prądem."],
    ["Dlaczego przewody elektryczne mają izolację?", ["Aby ograniczyć przypadkowy kontakt z przewodnikiem", "Aby zwiększyć przepływ prądu przez człowieka", "Aby zmienić napięcie na światło", "Aby przewód stał się magnesem"], 0, "Izolacja chroni przed dotknięciem części przewodzących i zwarciem."],
    ["Który element może świecić po przepływie prądu w odpowiednim kierunku?", ["Dioda LED", "Bezpiecznik topikowy", "Wyłącznik", "Rezystor"], 0, "Dioda LED emituje światło podczas przepływu prądu w kierunku przewodzenia."],
    ["Co najlepiej opisuje obwód elektryczny?", ["Zamknięta droga, którą mogą przepływać ładunki", "Dowolny kawałek plastiku", "Źródło światła bez przewodów", "Magnes bez pola"], 0, "Obwód elektryczny tworzy drogę dla przepływu prądu."]
],
    fale_optyka: [
    // 1–10
    ["Częstotliwość to:", ["Liczba drgań w jednostce czasu", "Długość fali", "Masa ciała", "Temperatura"], 0, "Częstotliwość określa liczbę drgań w ciągu sekundy."],
    ["Jednostka częstotliwości to:", ["Herc", "Metr", "Dżul", "Wat"], 0, "Jednostką częstotliwości jest herc (Hz)."],
    ["Czy dźwięk rozchodzi się w próżni?", ["Nie", "Tak", "Tylko nocą", "Zawsze"], 0, "Dźwięk potrzebuje ośrodka materialnego."],
    ["Światło padające na lustro:", ["Odbija się", "Znika", "Zmienia się w dźwięk", "Zatrzymuje się"], 0, "Światło odbija się od powierzchni lustra."],
    ["Prędkość światła w próżni wynosi około:", ["300 000 km/s", "300 km/s", "340 m/s", "30 km/h"], 0, "Prędkość światła w próżni wynosi około 300 000 km/s."],
    ["Soczewka skupiająca:", ["Skupia promienie światła", "Pochłania całe światło", "Wytwarza dźwięk", "Zmniejsza masę"], 0, "Soczewka skupiająca załamuje promienie tak, aby zbiegły się w ognisku."],
    ["Dźwięk jest:", ["Falą mechaniczną", "Falą elektromagnetyczną", "Prądem elektrycznym", "Rodzajem światła"], 0, "Dźwięk jest falą mechaniczną wymagającą ośrodka."],
    ["Światło jest falą:", ["Elektromagnetyczną", "Mechaniczną", "Dźwiękową", "Grawitacyjną"], 0, "Światło jest falą elektromagnetyczną."],
    ["Jednostką długości fali jest:", ["Metr", "Herc", "Wat", "Dżul"], 0, "Długość fali mierzymy w metrach."],
    ["Co oznacza symbol λ?", ["Długość fali", "Częstotliwość", "Prędkość", "Amplitudę"], 0, "Lambda oznacza długość fali."],

    // 11–20
    ["Co oznacza symbol f?", ["Częstotliwość", "Długość fali", "Masę", "Siłę"], 0, "Symbol f oznacza częstotliwość."],
    ["Co oznacza symbol T w ruchu drgającym?", ["Okres drgań", "Temperaturę zawsze", "Natężenie", "Długość"], 0, "Okres to czas jednego pełnego drgania."],
    ["Jednostką okresu drgań jest:", ["Sekunda", "Herc", "Metr", "Wat"], 0, "Okres jest czasem, dlatego mierzymy go w sekundach."],
    ["Jak obliczamy częstotliwość z okresu?", ["f = 1/T", "f = T²", "f = T·m", "f = s/t"], 0, "Częstotliwość jest odwrotnością okresu."],
    ["Jeśli okres drgań wynosi 2 s, częstotliwość wynosi:", ["0,5 Hz", "2 Hz", "4 Hz", "1 Hz"], 0, "f = 1/2 s = 0,5 Hz."],
    ["Jeśli częstotliwość wynosi 5 Hz, okres wynosi:", ["0,2 s", "5 s", "10 s", "2,5 s"], 0, "T = 1/5 Hz = 0,2 s."],
    ["Fala przenosi przede wszystkim:", ["Energię", "Materię na dużą odległość", "Masę źródła", "Temperaturę bez energii"], 0, "Fala przenosi energię, ale nie musi przenosić materii."],
    ["Amplituda fali to:", ["Maksymalne wychylenie od położenia równowagi", "Odległość między grzbietami", "Czas jednego drgania", "Liczba fal"], 0, "Amplituda określa maksymalne wychylenie."],
    ["Odległość między dwoma sąsiednimi grzbietami fali to:", ["Długość fali", "Amplituda", "Okres", "Częstotliwość"], 0, "Długość fali to odległość między punktami o tej samej fazie."],
    ["Wzór na prędkość fali to:", ["v = λ·f", "v = λ/f", "v = f/λ", "v = m·a"], 0, "Prędkość fali jest iloczynem długości fali i częstotliwości."],

    // 21–30
    ["Fala ma długość 2 m i częstotliwość 3 Hz. Jej prędkość wynosi:", ["6 m/s", "5 m/s", "1,5 m/s", "9 m/s"], 0, "v = 2 × 3 = 6 m/s."],
    ["Fala porusza się z prędkością 20 m/s i ma częstotliwość 4 Hz. Jej długość wynosi:", ["5 m", "80 m", "16 m", "24 m"], 0, "λ = v/f = 20/4 = 5 m."],
    ["Fala ma długość 0,5 m i częstotliwość 10 Hz. Prędkość wynosi:", ["5 m/s", "10 m/s", "20 m/s", "0,05 m/s"], 0, "v = 0,5 × 10 = 5 m/s."],
    ["Dźwięk w powietrzu rozchodzi się z prędkością około:", ["340 m/s", "30 m/s", "300 000 km/s", "3 m/s"], 0, "Prędkość dźwięku w powietrzu w temperaturze pokojowej wynosi około 340 m/s."],
    ["Co zwykle dzieje się z prędkością dźwięku, gdy temperatura powietrza rośnie?", ["Rośnie", "Maleje do zera", "Nie może się zmienić", "Zawsze zmienia się w światło"], 0, "W cieplejszym powietrzu dźwięk rozchodzi się szybciej."],
    ["Dźwięk rozchodzi się najszybciej zwykle w:", ["Ciałach stałych", "Gazach", "Próżni", "Pustej przestrzeni"], 0, "W wielu ciałach stałych dźwięk rozchodzi się szybciej niż w cieczach i gazach."],
    ["Czy dźwięk może rozchodzić się w wodzie?", ["Tak", "Nie", "Tylko w lodzie", "Tylko w próżni"], 0, "Woda jest ośrodkiem materialnym i przewodzi fale dźwiękowe."],
    ["Co powoduje powstanie dźwięku?", ["Drgania źródła", "Brak ruchu", "Całkowita próżnia", "Zatrzymanie cząsteczek"], 0, "Dźwięk powstaje wskutek drgań źródła."],
    ["Wysokość dźwięku zależy głównie od:", ["Częstotliwości", "Koloru źródła", "Masy słuchacza", "Odległości od podłogi"], 0, "Większa częstotliwość oznacza wyższy dźwięk."],
    ["Głośność dźwięku zależy między innymi od:", ["Amplitudy drgań", "Koloru przedmiotu", "Długości przewodu", "Temperatury lodu"], 0, "Większa amplituda zwykle oznacza głośniejszy dźwięk."],

    // 31–40
    ["Zakres słyszalności człowieka wynosi w przybliżeniu:", ["20 Hz–20 000 Hz", "1–10 Hz", "100 000–1 000 000 Hz", "0–5 Hz"], 0, "Typowy zakres słyszalności młodego człowieka to około 20 Hz–20 kHz."],
    ["Dźwięki o częstotliwości poniżej 20 Hz to:", ["Infradźwięki", "Ultradźwięki", "Światło", "Promieniowanie gamma"], 0, "Infradźwięki mają częstotliwość niższą niż około 20 Hz."],
    ["Dźwięki o częstotliwości powyżej 20 000 Hz to:", ["Ultradźwięki", "Infradźwięki", "Dźwięki słyszalne zawsze", "Fale radiowe"], 0, "Ultradźwięki mają częstotliwość wyższą od górnej granicy słyszalności człowieka."],
    ["Które zwierzę wykorzystuje echolokację?", ["Nietoperz", "Żółw lądowy", "Dżdżownica", "Ślimak"], 0, "Nietoperze wysyłają ultradźwięki i analizują ich echo."],
    ["Ultradźwięki wykorzystuje się w:", ["USG", "Zwykłym termometrze", "Kompasie", "Wadze kuchennej"], 0, "Ultradźwięki są wykorzystywane między innymi w diagnostyce ultrasonograficznej."],
    ["Echo powstaje wskutek:", ["Odbicia dźwięku", "Załamania światła", "Topnienia lodu", "Przepływu prądu"], 0, "Echo to dźwięk odbity od przeszkody."],
    ["Co może poprawić akustykę sali koncertowej?", ["Materiały pochłaniające niepożądane odbicia", "Same metalowe ściany", "Całkowicie gładkie ściany wszędzie", "Zwiększenie liczby okien bez zmian"], 0, "Materiały akustyczne ograniczają niepożądane odbicia i pogłos."],
    ["Jak nazywa się niepożądane przedłużone trwanie dźwięku wskutek odbić?", ["Pogłos", "Załamanie", "Dyfrakcja", "Polaryzacja"], 0, "Pogłos powstaje przez wielokrotne odbicia dźwięku."],
    ["Co oznacza natężenie dźwięku?", ["Ilość energii fali przenoszonej przez jednostkę powierzchni i czasu", "Wysokość źródła", "Kolor dźwięku", "Czas jednego drgania"], 0, "Natężenie opisuje przepływ energii fali przez jednostkę powierzchni w czasie."],
    ["Jednostką poziomu natężenia dźwięku jest:", ["Decybel", "Herc", "Metr", "Dżul"], 0, "Poziom natężenia dźwięku wyrażamy w decybelach."],

    // 41–50
    ["Światło rozchodzi się w jednorodnym ośrodku przezroczystym:", ["Po liniach prostych", "Zawsze po okręgu", "Tylko w dół", "Losowo"], 0, "W jednorodnym ośrodku światło rozchodzi się prostoliniowo."],
    ["Cień powstaje, gdy:", ["Przedmiot zasłania światło", "Światło przyspiesza", "Powietrze znika", "Dźwięk odbija się od ściany"], 0, "Nieprzezroczysty przedmiot blokuje część promieni świetlnych."],
    ["Co jest źródłem światła?", ["Słońce", "Księżyc", "Lustro", "Zwykła kartka papieru"], 0, "Słońce samo emituje światło."],
    ["Czy Księżyc świeci własnym światłem?", ["Nie, odbija światło Słońca", "Tak, wytwarza światło jak gwiazda", "Świeci dzięki prądowi", "Świeci tylko w dzień"], 0, "Księżyc jest widoczny dzięki odbijaniu światła słonecznego."],
    ["Jak nazywa się zjawisko odbicia światła?", ["Odbicie", "Dyfrakcja", "Parowanie", "Krzepnięcie"], 0, "Odbicie polega na zmianie kierunku rozchodzenia się światła na granicy powierzchni."],
    ["Kąt odbicia światła jest:", ["Równy kątowi padania", "Zawsze dwa razy większy", "Zawsze zerowy", "Zawsze prosty"], 0, "Prawo odbicia mówi, że kąt odbicia jest równy kątowi padania."],
    ["Kąty padania i odbicia mierzymy względem:", ["Normalnej do powierzchni", "Samej powierzchni", "Podłogi", "Kierunku grawitacji"], 0, "Kąty mierzy się względem prostej prostopadłej do powierzchni."],
    ["Lustro płaskie tworzy obraz:", ["Pozorny, prosty i tej samej wielkości", "Zawsze odwrócony do góry nogami", "Zawsze większy", "Zawsze mniejszy"], 0, "Obraz w lustrze płaskim jest pozorny, prosty i tej samej wielkości."],
    ["Dlaczego widzimy przedmioty, które same nie świecą?", ["Odbijają światło docierające do naszych oczu", "Wytwarzają dźwięk", "Wysyłają prąd", "Nie potrzebują światła"], 0, "Widzialne przedmioty odbijają światło ze źródeł."],
    ["Białe światło słoneczne składa się z:", ["Wielu barw", "Wyłącznie czerwieni", "Wyłącznie zieleni", "Wyłącznie fioletu"], 0, "Białe światło zawiera wiele barw widma widzialnego."],

    // 51–60
    ["Rozszczepienie białego światła można zaobserwować za pomocą:", ["Pryzmatu", "Dynamometru", "Amperomierza", "Termometru"], 0, "Pryzmat rozdziela światło białe na składowe barwy."],
    ["Tęcza powstaje między innymi wskutek:", ["Załamania, odbicia i rozszczepienia światła w kroplach wody", "Przepływu prądu w chmurach", "Odbicia dźwięku", "Zamarzania powietrza"], 0, "Krople wody rozszczepiają i załamują światło słoneczne."],
    ["Która barwa światła ma najdłuższą falę w zakresie widzialnym?", ["Czerwona", "Fioletowa", "Niebieska", "Zielona"], 0, "Czerwone światło ma najdłuższą długość fali w widmie widzialnym."],
    ["Która barwa światła ma najkrótszą falę w zakresie widzialnym?", ["Fioletowa", "Czerwona", "Pomarańczowa", "Żółta"], 0, "Fioletowe światło ma najkrótszą długość fali w widmie widzialnym."],
    ["Jak nazywa się zjawisko zmiany kierunku światła przy przejściu do innego ośrodka?", ["Załamanie", "Odbicie", "Dyfuzja", "Rezonans"], 0, "Załamanie występuje przy przejściu światła między ośrodkami."],
    ["Dlaczego łyżeczka w szklance wody wygląda na złamaną?", ["Z powodu załamania światła", "Z powodu odbicia dźwięku", "Z powodu pola magnetycznego", "Z powodu parowania"], 0, "Promienie światła zmieniają kierunek na granicy wody i powietrza."],
    ["Prędkość światła w wodzie jest:", ["Mniejsza niż w próżni", "Większa niż w próżni", "Zawsze taka sama jak w próżni", "Równa zeru"], 0, "Światło porusza się wolniej w wodzie niż w próżni."],
    ["Co oznacza współczynnik załamania ośrodka?", ["Stosunek prędkości światła w próżni do prędkości w ośrodku", "Masę ośrodka", "Temperaturę światła", "Natężenie dźwięku"], 0, "Współczynnik załamania n = c/v."],
    ["Soczewka skupiająca jest zwykle:", ["Grubsza w środku niż na brzegach", "Cieńsza w środku niż na brzegach", "Płaska z obu stron zawsze", "Nieprzezroczysta"], 0, "Typowa soczewka skupiająca jest grubsza w środku."],
    ["Soczewka rozpraszająca jest zwykle:", ["Cieńsza w środku niż na brzegach", "Grubsza w środku niż na brzegach", "Zawsze kulą", "Wykonana wyłącznie z metalu"], 0, "Typowa soczewka rozpraszająca jest cieńsza w środku."],

    // 61–70
    ["Ognisko soczewki to miejsce, w którym:", ["Zbiegają się promienie równoległe po przejściu przez soczewkę skupiającą", "Powstaje dźwięk", "Zatrzymuje się czas", "Znika światło"], 0, "Promienie równoległe skupiają się w ognisku soczewki skupiającej."],
    ["Odległość ogniska od środka soczewki to:", ["Ogniskowa", "Amplituda", "Okres", "Częstotliwość"], 0, "Ogniskowa to odległość ogniska od środka optycznego soczewki."],
    ["Który przyrząd wykorzystuje soczewki?", ["Aparat fotograficzny", "Kompas", "Amperomierz", "Dynamometr"], 0, "Aparat fotograficzny wykorzystuje układ soczewek do tworzenia obrazu."],
    ["Który przyrząd wykorzystuje soczewki do powiększania obrazu?", ["Mikroskop", "Termometr", "Barometr", "Waga"], 0, "Mikroskop wykorzystuje soczewki do obserwacji małych obiektów."],
    ["Lupa jest przykładem:", ["Soczewki skupiającej", "Soczewki rozpraszającej zawsze", "Zwierciadła płaskiego", "Pryzmatu dźwiękowego"], 0, "Lupa wykorzystuje soczewkę skupiającą."],
    ["Krótkowzroczność koryguje się soczewką:", ["Rozpraszającą", "Skupiającą", "Płaską nieprzezroczystą", "Cylindryczną zawsze"], 0, "Soczewka rozpraszająca przesuwa obraz na siatkówkę oka."],
    ["Dalekowzroczność koryguje się zwykle soczewką:", ["Skupiającą", "Rozpraszającą", "Nieprzezroczystą", "Bez mocy optycznej"], 0, "Soczewka skupiająca pomaga utworzyć obraz na siatkówce."],
    ["Gdzie w oku powstaje obraz?", ["Na siatkówce", "Na tęczówce", "Na rogówce zewnętrznej", "Na powiece"], 0, "Obraz powstaje na siatkówce oka."],
    ["Która część oka reguluje ilość wpadającego światła?", ["Tęczówka", "Siatkówka", "Nerw wzrokowy", "Soczewka wyłącznie"], 0, "Tęczówka reguluje wielkość źrenicy."],
    ["Która część oka odbiera bodźce świetlne?", ["Siatkówka", "Tęczówka", "Powieka", "Rzęsy"], 0, "Siatkówka zawiera komórki światłoczułe."],

    // 71–80
    ["Jak nazywa się rozchodzenie fali na krawędziach przeszkód?", ["Dyfrakcja", "Odbicie", "Topnienie", "Skraplanie"], 0, "Dyfrakcja to uginanie się fal na przeszkodach i szczelinach."],
    ["Która fala może ulegać dyfrakcji?", ["Dźwiękowa", "Żadna fala", "Tylko fala na wodzie", "Tylko światło w próżni"], 0, "Dyfrakcja dotyczy różnych rodzajów fal, także dźwiękowych."],
    ["Dlaczego słyszymy dźwięk zza rogu budynku?", ["Fale dźwiękowe uginają się na przeszkodach", "Dźwięk przechodzi przez ścianę bez zmian zawsze", "Dźwięk zamienia się w światło", "Powietrze przestaje istnieć"], 0, "Dyfrakcja pozwala falom dźwiękowym docierać za przeszkody."],
    ["Co to jest interferencja fal?", ["Nakładanie się fal", "Zatrzymanie wszystkich fal", "Zmiana masy fali", "Przemiana światła w materię"], 0, "Interferencja powstaje, gdy fale nakładają się na siebie."],
    ["Wzmocnienie fal podczas interferencji nazywa się:", ["Interferencją konstruktywną", "Interferencją destruktywną", "Załamaniem", "Polaryzacją"], 0, "Fale zgodne w fazie mogą się wzmacniać."],
    ["Osłabienie fal podczas interferencji nazywa się:", ["Interferencją destruktywną", "Interferencją konstruktywną", "Odbiciem", "Refrakcją"], 0, "Fale w przeciwnej fazie mogą się osłabiać."],
    ["Rezonans zachodzi, gdy:", ["Częstotliwość wymuszająca jest zbliżona do częstotliwości własnej układu", "Ciało przestaje drgać", "Nie ma żadnej siły", "Temperatura wynosi zero"], 0, "Rezonans może powodować duży wzrost amplitudy drgań."],
    ["Co może być przykładem rezonansu?", ["Silne drgania huśtawki przy odpowiednim rytmie popychania", "Zamarzanie wody", "Odbicie światła w lustrze", "Przepływ prądu w baterii"], 0, "Regularne popychanie w odpowiednim rytmie zwiększa amplitudę huśtawki."],
    ["Polaryzacja dotyczy:", ["Fal poprzecznych", "Wyłącznie fal podłużnych", "Tylko fal dźwiękowych w powietrzu", "Tylko fal grawitacyjnych"], 0, "Polaryzacji mogą ulegać fale poprzeczne, na przykład światło."],
    ["Czy światło może być spolaryzowane?", ["Tak", "Nie", "Tylko w próżni bez źródła", "Tylko po zamianie w dźwięk"], 0, "Światło jest falą poprzeczną i może być polaryzowane."],

    // 81–90
    ["Jak nazywa się zakres fal elektromagnetycznych widocznych dla ludzkiego oka?", ["Światło widzialne", "Ultradźwięki", "Fale sejsmiczne", "Infradźwięki"], 0, "Światło widzialne to część widma elektromagnetycznego odbierana przez oko."],
    ["Które fale elektromagnetyczne mają większą częstotliwość niż światło widzialne?", ["Promieniowanie ultrafioletowe", "Fale radiowe", "Mikrofale", "Podczerwień"], 0, "Ultrafiolet ma wyższą częstotliwość niż światło widzialne."],
    ["Które fale elektromagnetyczne mają mniejszą częstotliwość niż światło widzialne?", ["Fale radiowe", "Promieniowanie gamma", "Promieniowanie rentgenowskie", "Ultrafiolet"], 0, "Fale radiowe mają znacznie mniejszą częstotliwość niż światło widzialne."],
    ["Pilot telewizora często wykorzystuje:", ["Podczerwień", "Ultradźwięki", "Promieniowanie gamma", "Fale sejsmiczne"], 0, "Wiele pilotów przesyła sygnały za pomocą promieniowania podczerwonego."],
    ["Kuchenka mikrofalowa wykorzystuje:", ["Mikrofale", "Promieniowanie gamma", "Dźwięki słyszalne", "Fale sejsmiczne"], 0, "Mikrofale oddziałują z cząsteczkami wody i innych składników żywności."],
    ["Do obrazowania kości w medycynie wykorzystuje się:", ["Promieniowanie rentgenowskie", "Fale dźwiękowe słyszalne", "Podczerwień z pilota", "Fale radiowe FM"], 0, "Promieniowanie rentgenowskie przechodzi przez tkanki w różnym stopniu."],
    ["Które promieniowanie ma największą częstotliwość?", ["Gamma", "Radiowe", "Mikrofale", "Podczerwień"], 0, "Promieniowanie gamma znajduje się na wysokoczęstotliwościowym końcu widma elektromagnetycznego."],
    ["Które promieniowanie może powodować opaleniznę?", ["Ultrafiolet", "Fale radiowe", "Mikrofale z routera", "Dźwięk"], 0, "Promieniowanie UV oddziałuje na skórę i może powodować opaleniznę."],
    ["Dlaczego należy chronić oczy przed nadmiernym promieniowaniem UV?", ["Może uszkadzać oczy", "Zawsze poprawia wzrok", "Nie oddziałuje z tkankami", "Zamienia się w dźwięk"], 0, "Nadmierne promieniowanie UV może uszkadzać struktury oka."],
    ["Czy fale radiowe mogą rozchodzić się w próżni?", ["Tak", "Nie", "Tylko w wodzie", "Tylko w metalu"], 0, "Fale radiowe są falami elektromagnetycznymi i nie potrzebują ośrodka."],

    // 91–100
    ["Które zjawisko pozwala światłu docierać do Ziemi ze Słońca przez kosmos?", ["Rozchodzenie się fal elektromagnetycznych w próżni", "Przewodnictwo cieplne przez powietrze", "Konwekcja w próżni", "Przepływ dźwięku"], 0, "Światło słoneczne jest falą elektromagnetyczną, która rozchodzi się w próżni."],
    ["Co to jest widmo światła?", ["Zestaw barw lub długości fal składających się na promieniowanie", "Masa źródła światła", "Temperatura lustra", "Prędkość dźwięku"], 0, "Widmo przedstawia składowe promieniowania według długości fali lub częstotliwości."],
    ["Jak nazywa się urządzenie rozdzielające światło na barwy?", ["Spektroskop", "Amperomierz", "Dynamometr", "Barometr"], 0, "Spektroskop służy do obserwacji widma promieniowania."],
    ["Dlaczego niebo w dzień wydaje się niebieskie?", ["Powietrze silniej rozprasza krótsze fale światła", "Niebo samo emituje niebieskie światło", "Odbija wyłącznie ocean", "Światło czerwone nie istnieje"], 0, "Krótsze fale światła, szczególnie niebieskie, są silniej rozpraszane w atmosferze."],
    ["Dlaczego zachody Słońca często są czerwone?", ["Światło przechodzi przez dłuższą drogę w atmosferze i krótsze fale są silniej rozpraszane", "Słońce zmienia temperaturę na czerwoną", "Atmosfera pochłania całe światło", "Ziemia przestaje się obracać"], 0, "Przy zachodzie światło pokonuje dłuższą drogę w atmosferze, przez co dociera więcej barw czerwonych i pomarańczowych."],
    ["Jak nazywa się zjawisko rozpraszania światła na małych cząsteczkach?", ["Rozpraszanie Rayleigha", "Rezonans", "Krzepnięcie", "Indukcja"], 0, "Rozpraszanie Rayleigha jest silniejsze dla krótszych długości fal."],
    ["Co oznacza przezroczystość materiału?", ["Przepuszczanie światła pozwalające widzieć przez materiał", "Całkowite pochłanianie światła", "Odbijanie całego światła", "Wytwarzanie dźwięku"], 0, "Materiały przezroczyste przepuszczają światło i pozwalają obserwować obiekty za nimi."],
    ["Materiał półprzezroczysty:", ["Przepuszcza światło, ale rozprasza je", "Nie przepuszcza żadnego światła", "Zawsze odbija całe światło", "Wytwarza własne światło"], 0, "Przez materiał półprzezroczysty światło przechodzi, ale obraz za nim jest niewyraźny."],
    ["Materiał nieprzezroczysty:", ["Nie przepuszcza światła", "Zawsze przepuszcza całe światło", "Zwiększa częstotliwość światła", "Wytwarza ultradźwięki"], 0, "Materiały nieprzezroczyste blokują przechodzenie światła."],
    ["Co najlepiej opisuje fale elektromagnetyczne?", ["Mogą przenosić energię także przez próżnię", "Zawsze potrzebują powietrza", "Są wyłącznie falami dźwiękowymi", "Nie mogą przenosić energii"], 0, "Fale elektromagnetyczne mogą rozchodzić się w próżni i przenoszą energię."]
],
};

function renderTopics() {
    const list = $("topicList");
    if (!list) return;

    const search = ($("topicSearch")?.value || "").toLowerCase();

    list.innerHTML = topics
        .filter(t => t.name.toLowerCase().includes(search))
        .map(t => `
            <label class="topic-option">
                <input type="checkbox" value="${t.id}"
                    ${selectedTopics.has(t.id) ? "checked" : ""}
                    onchange="toggleTopic('${t.id}', this.checked)">
                ${escapeHTML(t.name)}
                <small>Klasa ${t.grade}</small>
            </label>
        `).join("");

    $("selectedTopicCount").textContent =
        "Wybrano: " + selectedTopics.size;
}

function toggleTopic(id, checked) {
    if (checked) selectedTopics.add(id);
    else selectedTopics.delete(id);

    $("selectedTopicCount").textContent =
        "Wybrano: " + selectedTopics.size;
}

/* =========================================
   GRA – POKOJE
========================================= */

async function createRoom() {
    if (!db) {
        $("teacherSetupMessage").textContent =
            "Nie udało się połączyć z Supabase.";
        return;
    }

    if (!selectedTopics.size) {
        $("teacherSetupMessage").textContent =
            "Wybierz przynajmniej jeden temat.";
        return;
    }

    role = "teacher";
    roomCode = makeCode();
    players = [{
        id: "teacher",
        nickname: "Nauczyciel",
        score: 0
    }];

    const allQuestions = [];
console.log("Wybrane tematy:", [...selectedTopics]);

selectedTopics.forEach(id => {
    console.log(
        "Temat:",
        id,
        "| Liczba pytań:",
        (questionBank[id] || []).length
    );
});
selectedTopics.forEach(id => {
    (questionBank[id] || []).forEach((item, index) => {
        allQuestions.push({
            id: id + "_" + index,
            topic: id,
            question: item[0],
            options: item[1],
            correct: item[2],
            explanation: item[3]
        });
    });
});

    console.log("Wybrano w ustawieniach:", $("questionCount").value);
console.log("Wszystkie dostępne pytania:", allQuestions.length);

gameQuestions = selectFreshQuestions(
    allQuestions,
    Number($("questionCount").value)
);

console.log("Wylosowano:", gameQuestions.length);

    currentQuestion = 0;

    connectChannel(roomCode);

    $("roomCodeDisplay").textContent = roomCode;
    renderLobbyPlayers();
    showScreen("teacherLobby");
}

function joinRoom() {
    if (!db) {
        $("joinMessage").textContent = "Brak połączenia z serwerem.";
        return;
    }

    roomCode = $("joinCode").value.trim();
    nickname = $("nickname").value.trim();

    if (!/^\d{6}$/.test(roomCode)) {
        $("joinMessage").textContent = "Wpisz poprawny kod pokoju.";
        return;
    }

    if (!nickname) {
        $("joinMessage").textContent = "Wpisz swój nick.";
        return;
    }

    role = "student";
    players = [];
    studentId = crypto.randomUUID();

    connectChannel(roomCode);

    showScreen("studentLobby");

    $("studentLobbyMessage").textContent =
        "Próba połączenia z pokojem " + roomCode + "...";

    setTimeout(() => {
        sendEvent("player_join", {
            id: studentId,
            nickname
        });
    }, 1000);
}

function renderLobbyPlayers() {
    const box = $("lobbyPlayers");
    if (!box) return;

    box.innerHTML = players.map(player => `
        <div class="player-row">
            <span>${escapeHTML(player.nickname)}</span>
            <b>Gotowy</b>
        </div>
    `).join("");
}

function copyRoomCode() {
    navigator.clipboard.writeText(roomCode);
    $("roomCodeDisplay").textContent = roomCode + " ✓";
}

/* =========================================
   GRA – NAUCZYCIEL
========================================= */

function startGame() {
    if (role !== "teacher" || !gameQuestions.length) return;

    gameStarted = true;
    currentQuestion = 0;
    startQuestion();
}

function startQuestion() {
    if (currentQuestion >= gameQuestions.length) {
        finishGame();
        return;
    }

    questionEnded = false;
    receivedAnswers = {};

    const data = gameQuestions[currentQuestion];
    const time = Number($("questionTime").value);

    questionDeadline = Date.now() + time * 1000;

    $("teacherProgress").textContent =
        `Pytanie ${currentQuestion + 1} / ${gameQuestions.length}`;

    $("teacherQuestion").textContent = data.question;

    $("teacherOptions").innerHTML = data.options.map((option, index) => `
        <div class="answer-option">
            ${String.fromCharCode(65 + index)}. ${escapeHTML(option)}
        </div>
    `).join("");

    $("teacherExplanation").classList.add("hidden");
    $("nextQuestionButton").classList.add("hidden");

    showScreen("teacherGame");

    sendEvent("game_start", {
        question: data,
        index: currentQuestion,
        total: gameQuestions.length,
        deadline: questionDeadline,
        ended: false
    });

    startTeacherTimer();
}

function startTeacherTimer() {
    clearInterval(timerInterval);

    function tick() {
        const remaining = Math.max(
            0,
            Math.ceil((questionDeadline - Date.now()) / 1000)
        );

        $("teacherTimer").textContent = remaining;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            revealAnswer();
        }
    }

    tick();
    timerInterval = setInterval(tick, 200);
}


function updateAnswerCount() {
    const count = Object.keys(receivedAnswers).length;
    const total = Math.max(0, players.length - 1);

    $("answerCount").textContent =
        `Odpowiedzi: ${count}/${total}`;

    // Jeżeli wszyscy uczniowie odpowiedzieli,
    // natychmiast pokazujemy poprawną odpowiedź.
    if (
        total > 0 &&
        count >= total &&
        !questionEnded
    ) {
        revealAnswer();
    }
}


function revealAnswer() {
    if (questionEnded) return;

    questionEnded = true;
    clearInterval(timerInterval);

    const data = gameQuestions[currentQuestion];

    Object.entries(receivedAnswers).forEach(([id, answer]) => {
        const player = players.find(p => p.id === id);

        if (player && answer === data.correct) {
            player.score += 100;
        }
    });

    const buttons = $("teacherOptions").querySelectorAll(".answer-option");

    buttons.forEach((button, index) => {
        if (index === data.correct) button.classList.add("correct");
    });

    $("teacherExplanation").textContent =
        "Poprawna odpowiedź: " + data.options[data.correct] +
        ". " + data.explanation;

    $("teacherExplanation").classList.remove("hidden");
    $("nextQuestionButton").classList.remove("hidden");

    updateRanking();

    sendEvent("reveal", {
        correct: data.correct,
        correctText: data.options[data.correct],
        explanation: data.explanation,
        ranking: getRanking()
    });
}

function nextQuestion() {
    if (!questionEnded) return;

    currentQuestion++;
    startQuestion();
}

/* =========================================
   GRA – UCZEŃ
========================================= */

function showStudentQuestion(data) {
    if (!data || !data.question) return;

    clearInterval(timerInterval);

    myAnswer = null;
    questionEnded = Boolean(data.ended);
    questionDeadline = data.deadline || Date.now();

    showScreen("studentGame");

    $("studentProgress").textContent =
        `Pytanie ${Number(data.index) + 1} / ${data.total}`;

    $("studentQuestion").textContent = data.question.question;
    $("studentFeedback").textContent = "";

    $("studentOptions").innerHTML =
        data.question.options.map((option, index) => `
            <button class="answer-option"
                onclick="submitAnswer(${index})">
                ${String.fromCharCode(65 + index)}.
                ${escapeHTML(option)}
            </button>
        `).join("");

    startStudentTimer();
}

function startStudentTimer() {
    clearInterval(timerInterval);

    function tick() {
        const remaining = Math.max(
            0,
            Math.ceil((questionDeadline - Date.now()) / 1000)
        );

        $("studentTimer").textContent = remaining;

        if (remaining <= 0) {
            clearInterval(timerInterval);

            document.querySelectorAll("#studentOptions button")
                .forEach(button => button.disabled = true);

            if (myAnswer === null) {
                $("studentFeedback").textContent =
                    "Czas minął. Czekaj na wyniki.";
            }
        }
    }

    tick();
    timerInterval = setInterval(tick, 200);
}

function submitAnswer(index) {
    if (myAnswer !== null || questionEnded) return;
    if (Date.now() >= questionDeadline) return;

    myAnswer = index;

    document.querySelectorAll("#studentOptions button")
        .forEach(button => button.disabled = true);

    $("studentFeedback").textContent =
        "Odpowiedź wysłana. Czekaj na wyniki.";

    sendEvent("answer", {
        playerId: studentId,
        answer: index
    });
}

function showStudentReveal(data) {
    if (!data) return;

    questionEnded = true;
    clearInterval(timerInterval);

    const buttons =
        document.querySelectorAll("#studentOptions button");

    buttons.forEach((button, index) => {
        button.disabled = true;

        if (index === data.correct) {
            button.classList.add("correct");
        } else if (index === myAnswer) {
            button.classList.add("wrong");
        }
    });

    $("studentFeedback").innerHTML = `
        <h3>${myAnswer === data.correct ? "✓ Dobra odpowiedź!" : "✕ Błędna odpowiedź"}</h3>
        <p>Poprawna odpowiedź:
        <b>${escapeHTML(data.correctText)}</b></p>
        <p>${escapeHTML(data.explanation)}</p>
        <p class="muted">Czekaj na następne pytanie.</p>
    `;
}

/* =========================================
   RANKING
========================================= */

function getRanking() {
    return [...players].sort((a, b) => b.score - a.score);
}

function rankingHTML(ranking = getRanking()) {
    if (!ranking.length) return "<p>Brak wyników.</p>";

    return ranking.map((player, index) => `
        <div class="ranking-row">
            <span>${index + 1}. ${escapeHTML(player.nickname)}</span>
            <b>${Number(player.score)} pkt</b>
        </div>
    `).join("");
}

function updateRanking() {
    if ($("teacherRanking")) {
        $("teacherRanking").innerHTML = rankingHTML();
    }
}

function finishGame() {
    clearInterval(timerInterval);
    gameStarted = false;

    const ranking = getRanking();

    $("finalRanking").innerHTML = rankingHTML(ranking);

    sendEvent("finished", { ranking });

    showScreen("results");
}

function showStudentResults(data) {
    clearInterval(timerInterval);

    $("finalRanking").innerHTML =
        rankingHTML(data.ranking || []);

    showScreen("results");
}

function leaveRoom() {
    closeChannel();

    role = "";
    roomCode = "";
    nickname = "";
    players = [];
    gameQuestions = [];
    gameStarted = false;
    currentQuestion = 0;
    questionEnded = false;
    myAnswer = null;

    clearInterval(timerInterval);

    showScreen("home");
    setStatus("Gotowy");
}

function projectorMode() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

/* =========================================
   PHYSICS LAB – MODUŁY
========================================= */

const labModules = {
    electronics: {
        title: "Laboratorium elektroniki",
        description: "Buduj obwody elektroniczne, łącz przewody i uruchamiaj symulacje.",
        explanation: "Prawo Ohma: U = I × R. Prąd płynie przez zamknięty obwód."
    },
    mechanics: {
        title: "Laboratorium mechaniki",
        description: "Badaj wpływ siły, masy i tarcia na ruch.",
        explanation: "Druga zasada dynamiki Newtona: a = F/m."
    },
    optics: {
        title: "Laboratorium optyki",
        description: "Eksperymentuj z soczewkami i światłem.",
        explanation: "Soczewka skupiająca tworzy obraz rzeczywisty lub pozorny."
    },
    thermal: {
        title: "Laboratorium termodynamiki",
        description: "Obliczaj energię cieplną.",
        explanation: "Q = m × c × ΔT."
    },
    waves: {
        title: "Laboratorium fal i dźwięku",
        description: "Zmieniaj częstotliwość i długość fali.",
        explanation: "Prędkość fali: v = λ × f."
    },
    magnetism: {
        title: "Laboratorium magnetyzmu",
        description: "Poznaj bieguny i pole magnetyczne.",
        explanation: "Bieguny jednoimienne się odpychają."
    },
    energy: {
        title: "Laboratorium energii",
        description: "Badaj energię potencjalną i kinetyczną.",
        explanation: "Ep = mgh, Ek = mv²/2."
    },
    electrostatics: {
        title: "Laboratorium elektrostatyki",
        description: "Badaj oddziaływanie ładunków.",
        explanation: "Ładunki różnoimienne przyciągają się."
    },
    fluids: {
        title: "Laboratorium cieczy i gazów",
        description: "Badaj ciśnienie hydrostatyczne.",
        explanation: "p = ρgh."
    },
    measurements: {
        title: "Laboratorium pomiarów",
        description: "Przeliczaj jednostki.",
        explanation: "Wynik pomiaru zawiera wartość i jednostkę."
    }
};

let labCurrentModule = "";

function openLab() {
    showScreen("labHome");
}

function openLabModule(name) {
    const module = labModules[name];
    if (!module) return;

    labCurrentModule = name;

    $("labTitle").textContent = module.title;
    $("labDescription").textContent = module.description;
    $("labExplanation").textContent = module.explanation;

    showScreen("labModule");
    renderLabModule(name);
}

function labSlider(id, label, min, max, value, unit, step = 1) {
    return `
        <div class="lab-controls">
            <label for="${id}">
                ${label}: <b id="${id}Value">${value} ${unit}</b>
            </label>
            <input id="${id}" type="range"
                min="${min}" max="${max}" value="${value}" step="${step}"
                oninput="updateLabSimulation('${labCurrentModule}')">
        </div>
    `;
}

function labReadout(id, label, value) {
    return `
        <div class="readout">
            ${label}
            <strong id="${id}">${value}</strong>
        </div>
    `;
}

function renderLabModule(name) {
    const w = $("labWorkspace");

    if (name === "electronics") {
        renderElectronics();
        return;
    }

    const renderers = {
        mechanics: renderMechanics,
        optics: renderOptics,
        thermal: renderThermal,
        waves: renderWaves,
        magnetism: renderMagnetism,
        energy: renderEnergy,
        electrostatics: renderElectrostatics,
        fluids: renderFluids,
        measurements: renderMeasurements
    };

    if (renderers[name]) renderers[name](w);
}

/* =========================================
   MECHANIKA
========================================= */

function renderMechanics(w) {
    w.innerHTML = `
        <h2>⚙️ Ruch i siły</h2>
        ${labSlider("mechForce", "Siła", 0, 100, 20, "N")}
        ${labSlider("mechMass", "Masa", 1, 50, 10, "kg")}
        ${labSlider("mechFriction", "Tarcie", 0, 50, 5, "N")}
        <div class="lab-readout">
            ${labReadout("mechNet", "Siła wypadkowa", "15 N")}
            ${labReadout("mechAccel", "Przyspieszenie", "1.50 m/s²")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("mechanics");
}

function renderOptics(w) {
    w.innerHTML = `
        <h2>🔦 Soczewka skupiająca</h2>
        ${labSlider("opticDistance", "Odległość przedmiotu", 10, 100, 60, "cm")}
        ${labSlider("opticFocal", "Ogniskowa", 10, 50, 20, "cm")}
        <div class="lab-readout">
            ${labReadout("opticImage", "Odległość obrazu", "30 cm")}
            ${labReadout("opticType", "Rodzaj obrazu", "Rzeczywisty")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("optics");
}

function renderThermal(w) {
    w.innerHTML = `
        <h2>🌡️ Energia cieplna</h2>
        ${labSlider("thermalMass", "Masa", 1, 10, 2, "kg", 0.5)}
        ${labSlider("thermalDelta", "Zmiana temperatury", 1, 100, 20, "°C")}
        ${labSlider("thermalCapacity", "Ciepło właściwe", 100, 5000, 4200, "J/(kg·°C)", 100)}
        <div class="lab-readout">
            ${labReadout("thermalEnergy", "Energia", "168000 J")}
            ${labReadout("thermalKJ", "Energia", "168 kJ")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("thermal");
}

function renderWaves(w) {
    w.innerHTML = `
        <h2>〰️ Fale i dźwięk</h2>
        ${labSlider("waveFrequency", "Częstotliwość", 1, 100, 20, "Hz")}
        ${labSlider("waveLength", "Długość fali", 1, 20, 5, "m")}
        <div class="lab-readout">
            ${labReadout("waveSpeed", "Prędkość", "100 m/s")}
            ${labReadout("wavePeriod", "Okres", "0.05 s")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("waves");
}

function renderMagnetism(w) {
    w.innerHTML = `
        <h2>🧲 Pole magnetyczne</h2>
        ${labSlider("magDistance", "Odległość magnesów", 1, 20, 5, "cm")}
        <div class="lab-board" style="display:flex;align-items:center;justify-content:space-around">
            <div style="font-size:35px">🧲 N</div>
            <div id="magField">Pole magnetyczne</div>
            <div style="font-size:35px">S 🧲</div>
        </div>
        <div class="lab-readout">
            ${labReadout("magStrength", "Względna siła", "4.00")}
        </div>
    `;
    updateLabSimulation("magnetism");
}

function renderEnergy(w) {
    w.innerHTML = `
        <h2>⚡ Energia mechaniczna</h2>
        ${labSlider("energyMass", "Masa", 1, 100, 10, "kg")}
        ${labSlider("energyHeight", "Wysokość", 0, 100, 10, "m")}
        ${labSlider("energyVelocity", "Prędkość", 0, 30, 5, "m/s")}
        <div class="lab-readout">
            ${labReadout("energyPotential", "Energia potencjalna", "981 J")}
            ${labReadout("energyKinetic", "Energia kinetyczna", "125 J")}
            ${labReadout("energyTotal", "Energia całkowita", "1106 J")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("energy");
}

function renderElectrostatics(w) {
    w.innerHTML = `
        <h2>✨ Elektrostatyka</h2>
        ${labSlider("chargeOne", "Ładunek pierwszy", -10, 10, 5, "µC")}
        ${labSlider("chargeTwo", "Ładunek drugi", -10, 10, -5, "µC")}
        ${labSlider("chargeDistance", "Odległość", 1, 20, 5, "cm")}
        <div class="lab-readout">
            ${labReadout("chargeType", "Oddziaływanie", "Przyciąganie")}
            ${labReadout("chargeForce", "Wartość siły", "899 N")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("electrostatics");
}

function renderFluids(w) {
    w.innerHTML = `
        <h2>💧 Ciśnienie hydrostatyczne</h2>
        ${labSlider("fluidDepth", "Głębokość", 0, 20, 5, "m")}
        ${labSlider("fluidDensity", "Gęstość cieczy", 500, 1400, 1000, "kg/m³", 50)}
        <div class="lab-readout">
            ${labReadout("fluidPressure", "Ciśnienie", "49050 Pa")}
            ${labReadout("fluidBar", "Ciśnienie", "0.49 bar")}
        </div>
        <canvas id="labCanvas" class="lab-canvas"></canvas>
    `;
    updateLabSimulation("fluids");
}

function renderMeasurements(w) {
    w.innerHTML = `
        <h2>📏 Laboratorium pomiarów</h2>
        ${labSlider("measureLength", "Długość", 1, 1000, 250, "cm")}
        ${labSlider("measureMass", "Masa", 1, 100, 5, "kg")}
        ${labSlider("measureTime", "Czas", 1, 3600, 60, "s")}
        <div class="lab-readout">
            ${labReadout("measureMeters", "Długość", "2.50 m")}
            ${labReadout("measureGrams", "Masa", "5000 g")}
            ${labReadout("measureMinutes", "Czas", "1.00 min")}
        </div>
    `;
    updateLabSimulation("measurements");
}
/* =========================================
   EDYTOR ELEKTRONIKI – PHYSICS CIRCUIT LAB
========================================= */

const LAB_PARTS = {
    battery: {
        name: "Bateria 9 V",
        value: 9,
        unit: "V",
        terminals: ["plus", "minus"],
        polarized: true
    },
    bulb: {
        name: "Żarówka",
        value: 10,
        unit: "Ω",
        terminals: ["a", "b"]
    },
    resistor: {
        name: "Rezystor",
        value: 100,
        unit: "Ω",
        terminals: ["a", "b"]
    },
    led: {
        name: "Dioda LED",
        value: 220,
        unit: "Ω",
        terminals: ["anode", "cathode"],
        polarized: true
    },
    switch: {
        name: "Przełącznik",
        value: 1,
        unit: "",
        terminals: ["a", "b"]
    },
    motor: {
        name: "Silnik DC",
        value: 30,
        unit: "Ω",
        terminals: ["plus", "minus"],
        polarized: true
    },
    capacitor: {
        name: "Kondensator elektrolityczny",
        value: 100,
        unit: "µF",
        terminals: ["plus", "minus"],
        polarized: true
    },
    transistor: {
        name: "Tranzystor NPN",
        value: 100,
        unit: "Ω",
        terminals: ["base", "collector", "emitter"],
        polarized: true
    }
};

let labParts = [];
let labWires = [];
let labSelectedPart = null;
let labSelectedWire = null;
let labWireStart = null;
let labSimulationRunning = false;
let labNextId = 1;
let labStage = null;

function renderElectronics() {
    labParts = [];
    labWires = [];
    labSelectedPart = null;
    labSelectedWire = null;
    labWireStart = null;
    labDragging = null;
    labSimulationRunning = false;
    labNextId = 1;
    labPotDragging = null;
    labWasDragging = false;

    $("labWorkspace").innerHTML = `
        <h2>🔌 PHYSICS CIRCUIT LAB</h2>
        <p>Buduj obwody elektroniczne, łącz zaciski i sprawdzaj działanie układu.</p>

        <div class="electronics-layout">
            <aside class="parts-panel">
                <h3>ELEMENTY</h3>

                ${Object.entries(LAB_PARTS)
.filter(([type]) => ![
    "led_red",
    "led_green",
    "led_blue",
    "led_yellow",
    "led_white"
].includes(type))
.map(([type, info]) => `
                    <button
    type="button"
    class="part-button"
    data-part-type="${type}"
>
                        <span>${labPartIcon(type)}</span>
                        ${info.name}
                    </button>
                `).join("")}

                <h3>STEROWANIE</h3>
                <button class="part-button" onclick="labClear()">🗑 Wyczyść układ</button>
                <p class="lab-help">
                    Kliknij pierwszy zacisk, a następnie drugi, aby połączyć je przewodem.
                </p>
                <p class="lab-help">
                    Przeciągaj elementy myszką. Dwuklik na przełączniku zmienia jego stan.
                </p>
            </aside>

            <div class="editor-main">
                <div class="editor-toolbar">
                    <button onclick="labRunSimulation()">▶ Uruchom</button>
                    <button class="secondary" onclick="labStopSimulation()">■ Zatrzymaj</button>
                    <button class="secondary" onclick="labRotateSelected()">↻ Obróć</button>
                    <button class="secondary" onclick="labDeleteSelected()">🗑 Usuń</button>
                    <button class="secondary" onclick="labDeselect()">Odznacz</button>
                </div>

                <div id="labStage" class="editor-stage">
                    <svg id="labWireSvg" class="editor-svg"></svg>
                </div>

                <div id="labComponentSettings" class="component-settings">
                    Wybierz element, aby zobaczyć jego właściwości.
                </div>

                <div class="editor-status" id="labEditorStatus">
                    Gotowy. Dodaj elementy i połącz ich zaciski.
                </div>

                <div class="simulation-readouts">
                    ${labReadout("circuitVoltage", "Napięcie", "0 V")}
                    ${labReadout("circuitCurrent", "Natężenie", "0 A")}
                    ${labReadout("circuitResistance", "Opór", "0 Ω")}
                    ${labReadout("circuitPower", "Moc", "0 W")}
                </div>

                <p id="circuitMessage" class="muted">
                    Symulacja jest zatrzymana.
                </p>
            </div>
        </div>
    `;

    labStage = $("labStage");

labStage.addEventListener("pointerdown", labStagePointerDown);

    labAddPart("battery", 70, 100);
    labAddPart("bulb", 300, 100);
    labAddPart("switch", 520, 100);

    labDeselect();
    labRender();
}

function labPartIcon(type) {
    const icons = {
        battery: "🔋",
        bulb: "💡",
        resistor: "〰️",
        led: "🔴",
        switch: "⏻",
        motor: "⚙️",
        capacitor: "▥",
        transistor: "◁"
    };
    return icons[type] || "▪";
}

function labAddPart(type, x, y) {

        // Zabezpieczenie przed zablokowaniem dodawania elementów
    labDragging = null;

    if (!LAB_PARTS[type] || !labStage) return;

    const info = LAB_PARTS[type];

    const part = {
        id: labNextId++,
        type,
        x: x ?? Math.max(15, labStage.clientWidth / 2 - 50),
        y: y ?? Math.max(15, labStage.clientHeight / 2 - 35),
        rotation: 0,
        value: info.value,
        switchOn: true
    };

    labParts.push(part);
    labSelectedPart = part.id;
    labSelectedWire = null;

    labRender();
    labUpdateSettings();
    labSetStatus("Dodano: " + info.name);
}

function labGetPart(id) {
    return labParts.find(part => part.id === id);
}

function labGetTerminalLabel(type, terminal) {
    const labels = {
        battery: { plus: "+", minus: "−" },
        led: { anode: "A (+)", cathode: "K (−)" },
        led_red: { anode: "A (+)", cathode: "K (−)" },
        led_green: { anode: "A (+)", cathode: "K (−)" },
        led_blue: { anode: "A (+)", cathode: "K (−)" },
        led_yellow: { anode: "A (+)", cathode: "K (−)" },
        led_white: { anode: "A (+)", cathode: "K (−)" },
        zener: { A: "A (+)", K: "K (−)" },
        buzzer: { "+": "+", "-": "−" },
        motor: { plus: "+", minus: "−" },
        capacitor: { plus: "+", minus: "−" },
        transistor: {
            base: "B",
            collector: "C",
            emitter: "E"
        },
        bulb: { a: "1", b: "2" },
        resistor: { a: "1", b: "2" },
        switch: { a: "1", b: "2" },
        potentiometer: { "1": "1", W: "W", "2": "2" },
        photoresistor: { "1": "1", "2": "2" }
    };

    return labels[type]?.[terminal] || terminal;
}
function labPartGraphic(part) {
    const shapes = {
        battery: `
            <svg viewBox="0 0 110 65">
                <line x1="10" y1="32" x2="32" y2="32" stroke="#dbeafe" stroke-width="4"/>
                <line x1="32" y1="12" x2="32" y2="52" stroke="#f8fafc" stroke-width="5"/>
                <line x1="45" y1="20" x2="45" y2="44" stroke="#f8fafc" stroke-width="3"/>
                <line x1="45" y1="32" x2="100" y2="32" stroke="#dbeafe" stroke-width="4"/>
                <text x="22" y="9" fill="#22c55e" font-size="12">+</text>
                <text x="48" y="57" fill="#60a5fa" font-size="12">−</text>
            </svg>`,

        bulb: `
            <svg viewBox="0 0 110 65">
                <path d="M10 32 H35 M75 32 H100" stroke="#dbeafe" stroke-width="4"/>
                <circle cx="55" cy="32" r="20" fill="#fef3c7" stroke="#eab308" stroke-width="3"/>
                <path d="M44 21 L66 43 M66 21 L44 43" stroke="#d97706" stroke-width="3"/>
            </svg>`,

        resistor: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H25 L32 18 L42 46 L52 18 L62 46 L72 18 L80 32 H105"
                    fill="none" stroke="#dbeafe" stroke-width="4" stroke-linejoin="round"/>
                <rect x="28" y="12" width="53" height="40" rx="5"
                    fill="#d6a76a" stroke="#9a6538" stroke-width="2"/>
                <path d="M39 14 V50 M51 14 V50 M64 14 V50" stroke="#8b4513" stroke-width="4"/>
            </svg>`,

        led: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H35 M75 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <path d="M35 14 L35 50 L75 32 Z"
                    fill="var(--led-color, #ef4444)" stroke="#fecaca" stroke-width="3"/>
                <path d="M75 14 V50" stroke="#fecaca" stroke-width="4"/>
                <path d="M52 10 L62 1 M62 1 L60 9 M62 1 L54 3"
                    fill="none" stroke="#fbbf24" stroke-width="2"/>
                <path d="M65 15 L75 6 M75 6 L73 14 M75 6 L67 8"
                    fill="none" stroke="#fbbf24" stroke-width="2"/>
            </svg>`,

        switch: `
            <svg viewBox="0 0 110 65">
                <path d="M5 38 H30 M80 38 H105" stroke="#dbeafe" stroke-width="4"/>
                <circle cx="30" cy="38" r="5" fill="#f8fafc"/>
                <circle cx="80" cy="38" r="5" fill="#f8fafc"/>
                <path d="M30 38 L75 15" stroke="#fbbf24" stroke-width="5" stroke-linecap="round"/>
            </svg>`,

        motor: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H20 M90 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <circle cx="55" cy="32" r="27" fill="#64748b" stroke="#cbd5e1" stroke-width="3"/>
                <text x="55" y="40" text-anchor="middle" font-size="24" fill="white">M</text>
                <text x="15" y="15" font-size="12" fill="#22c55e">+</text>
            </svg>`,

        capacitor: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H42 M68 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <path d="M42 10 V54 M68 10 V54" stroke="#f8fafc" stroke-width="5"/>
                <text x="35" y="9" font-size="12" fill="#22c55e">+</text>
            </svg>`,

        transistor: `
            <svg viewBox="0 0 110 65">
                <circle cx="55" cy="32" r="25" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
                <path d="M5 32 H42 M42 15 V49 M42 22 L70 8 M42 42 L70 56"
                    stroke="#f8fafc" stroke-width="3" fill="none"/>
                <path d="M62 51 L70 56 L61 59" fill="none" stroke="#22c55e" stroke-width="2"/>
            </svg>`,

        potentiometer: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H25 M85 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <rect x="25" y="14" width="60" height="36" rx="7"
                    fill="#334155" stroke="#94a3b8" stroke-width="3"/>
                <path d="M55 2 V29 L45 20 M55 29 L65 20"
                    fill="none" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
                <circle cx="55" cy="32" r="5" fill="#fbbf24"/>
                <text x="55" y="46" text-anchor="middle" fill="white" font-size="10">10k</text>
            </svg>`,

        photoresistor: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H25 M85 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <rect x="25" y="12" width="60" height="40" rx="8"
                    fill="#b77936" stroke="#f4d19b" stroke-width="3"/>
                <path d="M38 18 L55 46 M52 18 L69 46"
                    stroke="#fef3c7" stroke-width="4"/>
                <path d="M35 2 L45 12 M45 12 L44 4 M45 12 L37 10"
                    fill="none" stroke="#fbbf24" stroke-width="2"/>
                <path d="M60 2 L70 12 M70 12 L69 4 M70 12 L62 10"
                    fill="none" stroke="#fbbf24" stroke-width="2"/>
            </svg>`,

        zener: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H35 M75 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <path d="M35 14 L35 50 L75 32 Z"
                    fill="#60a5fa" stroke="#bfdbfe" stroke-width="3"/>
                <path d="M75 14 L68 14 L75 22 M75 50 L82 50 L75 42"
                    fill="none" stroke="#f8fafc" stroke-width="4"/>
            </svg>`,

        buzzer: `
            <svg viewBox="0 0 110 65">
                <path d="M5 32 H25 M85 32 H105" stroke="#dbeafe" stroke-width="4"/>
                <circle cx="55" cy="32" r="27" fill="#1e293b" stroke="#94a3b8" stroke-width="3"/>
                <circle cx="55" cy="32" r="17" fill="#475569" stroke="#cbd5e1" stroke-width="2"/>
                <circle cx="55" cy="32" r="5" fill="#0f172a"/>
                <text x="55" y="12" text-anchor="middle" font-size="10" fill="white">BUZZ</text>
            </svg>`
    };

    if (part.type.startsWith("led_")) {
        return shapes.led;
    }

    return shapes[part.type] || "";
}

function labTerminalPositions(part) {
    const positions = {
        battery: {
            plus: { x: 0, y: 32 },
            minus: { x: 100, y: 32 }
        },
        bulb: {
            a: { x: 0, y: 32 },
            b: { x: 100, y: 32 }
        },
        resistor: {
            a: { x: 0, y: 32 },
            b: { x: 100, y: 32 }
        },
        led: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        led_red: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        led_green: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        led_blue: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        led_yellow: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        led_white: {
            anode: { x: 0, y: 32 },
            cathode: { x: 100, y: 32 }
        },
        zener: {
            A: { x: 0, y: 32 },
            K: { x: 100, y: 32 }
        },
        buzzer: {
            "+": { x: 0, y: 32 },
            "-": { x: 100, y: 32 }
        },
        photoresistor: {
            "1": { x: 0, y: 32 },
            "2": { x: 100, y: 32 }
        },
        potentiometer: {
            "1": { x: 0, y: 32 },
            W: { x: 50, y: 0 },
            "2": { x: 100, y: 32 }
        },
        switch: {
            a: { x: 0, y: 38 },
            b: { x: 100, y: 38 }
        },
        motor: {
            plus: { x: 0, y: 32 },
            minus: { x: 100, y: 32 }
        },
        capacitor: {
            plus: { x: 0, y: 32 },
            minus: { x: 100, y: 32 }
        },
        transistor: {
            base: { x: 42, y: 32 },
            collector: { x: 70, y: 8 },
            emitter: { x: 70, y: 56 }
        }
    };

    return positions[part.type] || {};
}

function labPinPosition(part, terminal) {
    const pos = labTerminalPositions(part)[terminal];
    if (!pos) return { x: part.x, y: part.y };

    const cx = part.x + 50;
    const cy = part.y + 32;
    const dx = pos.x - 50;
    const dy = pos.y - 32;
    const angle = part.rotation * Math.PI / 180;

    return {
        x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
}


function labRender() {
    if (!labStage) return;

    labStage.querySelectorAll(".editor-part").forEach(el => el.remove());

    const svg = $("labWireSvg");
    if (!svg) return;

    svg.innerHTML = "";

    // RYSOWANIE PRZEWODÓW
    labWires.forEach(wire => {
        const a = labGetPart(wire.a);
        const b = labGetPart(wire.b);

        if (!a || !b) return;

        const p1 = labPinPosition(a, wire.pinA);
        const p2 = labPinPosition(b, wire.pinB);

        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        line.setAttribute("x1", p1.x);
        line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x);
        line.setAttribute("y2", p2.y);
        line.setAttribute("class", "wire-line");

        if (wire.id === labSelectedWire) {
            line.classList.add("wire-selected");
        }

        line.addEventListener("pointerdown", event => {
            event.stopPropagation();

            labSelectedWire = wire.id;
            labSelectedPart = null;

            labUpdateSettings();
            labRender();
        });

        svg.appendChild(line);
    });

    // RYSOWANIE ELEMENTÓW
    labParts.forEach(part => {
        const info = LAB_PARTS[part.type];

        if (!info) {
            console.error("Brak definicji elementu:", part.type);
            return;
        }

        const el = document.createElement("div");

        el.className =
            "editor-part " +
            part.type +
            (part.id === labSelectedPart ? " selected" : "");

        el.dataset.id = part.id;
        el.style.left = part.x + "px";
        el.style.top = part.y + "px";
        el.style.transform = `rotate(${part.rotation || 0}deg)`;

        const positions = labTerminalPositions(part);

        const terminals = (info.terminals || []).map(terminal => {
            const pos = positions[terminal];

            if (!pos) {
                console.warn(
                    "Brak pozycji zacisku:",
                    part.type,
                    terminal
                );
                return "";
            }

            return `
                <button
                    type="button"
                    class="lab-terminal"
                    data-terminal="${terminal}"
                    style="left:${pos.x}px;top:${pos.y}px"
                    title="${labGetTerminalLabel(part.type, terminal)}">
                    <span>${labGetTerminalLabel(part.type, terminal)}</span>
                </button>
            `;
        }).join("");

        const state = part.type === "switch"
            ? (part.switchOn ? "ZAMKNIĘTY" : "OTWARTY")
            : `${part.value} ${info.unit || ""}`;

        el.innerHTML = `
            <div class="part-art">${labPartGraphic(part)}</div>
            <div class="part-name">${escapeHTML(info.name)}</div>
            <div class="part-value">${escapeHTML(state)}</div>
            ${terminals}
        `;

        // ZAZNACZANIE I PRZESUWANIE
        el.addEventListener("pointerdown", event => {
            if (event.target.closest(".lab-terminal")) return;

            event.preventDefault();
            event.stopPropagation();

            labSelectedPart = part.id;
            labSelectedWire = null;

            labUpdateSettings();

            const rect = labStage.getBoundingClientRect();

            const scaleX = labStage.clientWidth / rect.width;
            const scaleY = labStage.clientHeight / rect.height;

            labDragging = {
                id: part.id,
                offsetX:
                    (event.clientX - rect.left) * scaleX - part.x,
                offsetY:
                    (event.clientY - rect.top) * scaleY - part.y
            };
        });

        // PRZEŁĄCZNIK
        
el.addEventListener("click", event => {
    if (part.type !== "switch") return;

    if (event.target.closest(".lab-terminal")) return;

    event.preventDefault();
    event.stopPropagation();

    labToggleSwitch(part.id);
});


        // ZACISKI
        el.querySelectorAll(".lab-terminal").forEach(button => {
            button.addEventListener("pointerdown", event => {
                event.preventDefault();
                event.stopPropagation();

                labDragging = null;

                labConnectPin(
                    part.id,
                    button.dataset.terminal
                );
            });
        });

        labStage.appendChild(el);
    });

   // STANY DIOD LED I ŻARÓWEK
labStage.querySelectorAll(".editor-part").forEach(element => {
    const id = Number(element.dataset.id);
    const part = labGetPart(id);

    if (!part) return;

    // DIODY LED
    if (labIsLed(part)) {
        element.style.setProperty(
            "--led-color",
            labGetLedColor(part)
        );

        element.classList.toggle("led-lit", !!part.lit);
        element.classList.toggle("led-burned", !!part.burned);
    }

    // ŻARÓWKI
    if (part.type === "bulb") {
        element.classList.toggle("bulb-lit", !!part.lit);
    }
});
}


function labConnectPin(partId, terminal) {
    if (!labWireStart) {
        labWireStart = { partId, terminal };
        labSetStatus(
            "Wybrano zacisk " +
            labGetTerminalLabel(labGetPart(partId).type, terminal) +
            ". Wybierz drugi zacisk."
        );
        return;
    }

    if (labWireStart.partId === partId &&
        labWireStart.terminal === terminal) {
        labWireStart = null;
        labSetStatus("Anulowano tworzenie przewodu.");
        return;
    }

    const exists = labWires.some(w =>
        (w.a === labWireStart.partId &&
         w.pinA === labWireStart.terminal &&
         w.b === partId &&
         w.pinB === terminal) ||
        (w.b === labWireStart.partId &&
         w.pinB === labWireStart.terminal &&
         w.a === partId &&
         w.pinA === terminal)
    );

    if (!exists) {
        labWires.push({
            id: labNextId++,
            a: labWireStart.partId,
            pinA: labWireStart.terminal,
            b: partId,
            pinB: terminal
        });

        labSetStatus("Utworzono połączenie przewodem.");
    } else {
        labSetStatus("Takie połączenie już istnieje.");
    }

    labWireStart = null;
    labRender();
}

function labStagePointerDown(event) {
    if (event.target === labStage ||
        event.target === $("labWireSvg")) {
        labDeselect();
    }
}

function labStagePointerMove(event) {
labWasDragging = true;
    // =====================================
    // OBRACANIE POTENCJOMETRU
    // =====================================
    if (labPotDragging) {
        const part = labGetPart(labPotDragging.id);

        if (!part) {
            labPotDragging = null;
            return;
        }

        const knob = labStage.querySelector(
            `[data-pot-knob="${part.id}"]`
        );

        if (!knob) return;

        const rect = knob.getBoundingClientRect();

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const angle = Math.atan2(
            event.clientY - centerY,
            event.clientX - centerX
        ) * 180 / Math.PI;

        // Zakres 0–270 stopni
        let degrees = angle + 135;

        degrees = ((degrees % 360) + 360) % 360;
        degrees = Math.max(0, Math.min(270, degrees));

        part.position = Math.round(degrees / 270 * 100);

        const level = labStage.querySelector(
            `.editor-part[data-id="${part.id}"] .pot-level`
        );

        if (level) {
            level.textContent = part.position + "%";
        }

        knob.style.transform =
            `rotate(${degrees}deg)`;

        return;
    }

    // =====================================
    // PRZESUWANIE ELEMENTÓW
    // =====================================
    if (!labDragging) return;

    const part = labGetPart(labDragging.id);
    if (!part) {
        labDragging = null;
        return;
    }

    const rect = labStage.getBoundingClientRect();

    const scaleX = labStage.clientWidth / rect.width;
    const scaleY = labStage.clientHeight / rect.height;

    part.x = Math.max(0, Math.min(
        labStage.clientWidth - 110,
        (event.clientX - rect.left) * scaleX - labDragging.offsetX
    ));

    part.y = Math.max(0, Math.min(
        labStage.clientHeight - 85,
        (event.clientY - rect.top) * scaleY - labDragging.offsetY
    ));

    // Aktualizujemy pozycję bez przebudowywania całej planszy
    const element = labStage.querySelector(
        `.editor-part[data-id="${part.id}"]`
    );

    if (element) {
        element.style.left = part.x + "px";
        element.style.top = part.y + "px";
    }

    // Aktualizacja przewodów bez usuwania elementów
    labUpdateWirePositions();
}

function labStagePointerUp() {

    const wasPotDragging = labPotDragging !== null;

    labDragging = null;
    labPotDragging = null;

    // Przelicz symulację po zmianie ustawienia potencjometru
    if (wasPotDragging && labSimulationRunning) {
        labRunSimulation();
    }
}

function labRotateSelected() {
    const part = labGetPart(labSelectedPart);
    if (!part) return;

    part.rotation = (part.rotation + 90) % 360;
    labRender();
}

function labDeleteSelected() {
    if (labSelectedWire !== null) {
        labWires = labWires.filter(w => w.id !== labSelectedWire);
        labSelectedWire = null;
        labRender();
        labSetStatus("Usunięto przewód.");
        return;
    }

    if (labSelectedPart === null) return;

    const id = labSelectedPart;

    labParts = labParts.filter(p => p.id !== id);
    labWires = labWires.filter(w => w.a !== id && w.b !== id);

    labSelectedPart = null;
    labUpdateSettings();
    labRender();
    labSetStatus("Usunięto element.");
}

function labClear() {
    labParts = [];
    labWires = [];
    labSelectedPart = null;
    labSelectedWire = null;
    labWireStart = null;

    labStopSimulation();
    labRender();
    labUpdateSettings();
    labSetStatus("Wyczyszczono układ.");
}

function labDeselect() {
    labSelectedPart = null;
    labSelectedWire = null;
    labWireStart = null;
    labUpdateSettings();
    labRender();
}

function labSetStatus(message) {
    const el = $("labEditorStatus");
    if (el) el.textContent = message;
}



function labUpdateSettings() {
    const box = $("labComponentSettings");
    if (!box) return;

    const part = labGetPart(labSelectedPart);

    if (!part) {
        box.innerHTML = "Wybierz element, aby zmienić jego właściwości.";
        return;
    }

    // PRZEŁĄCZNIK
    if (part.type === "switch") {
        box.innerHTML = `
            <b>Przełącznik</b>
            <p>Stan: ${part.switchOn ? "Zamknięty" : "Otwarty"}</p>
            <button onclick="labToggleSwitch(${part.id})">
                Zmień stan
            </button>
        `;
        return;
    }

   
    // POTENCJOMETR
    if (part.type === "potentiometer") {
        if (part.position === undefined) part.position = 50;
        if (part.totalResistance === undefined) {
            part.totalResistance = 10000;
        }

        const position = Math.max(0, Math.min(100, Number(part.position)));
        const total = Math.max(1, Number(part.totalResistance));

        const resistance1 = Math.round(total * position / 100);
        const resistance2 = total - resistance1;

        box.innerHTML = `
            <b>Potencjometr</b>

            <label>Całkowita rezystancja:
                <input
                    id="labPotTotalResistance"
                    type="number"
                    min="1"
                    max="100000000"
                    step="1"
                    value="${total}"
                    oninput="labSetPotTotalResistance(this.value)"
                    onchange="labPotValueChanged()"
                >
            </label>

            <p>Jednostka: Ω (omy)</p>

            <p>Położenie suwaka:
                <b id="labPotReadout">${Math.round(position)}%</b>
            </p>

            <label>Regulacja suwaka:
                <input
                    id="labPotPosition"
                    type="range"
                    min="0"
                    max="100"
                    value="${position}"
                    oninput="labSetPotPosition(this.value)"
                    onchange="labPotValueChanged()"
                >
            </label>

            <hr>

            <p>Opór między 1–W:
                <b id="labPotResistance1">${resistance1} Ω</b>
            </p>

            <p>Opór między W–2:
                <b id="labPotResistance2">${resistance2} Ω</b>
            </p>

            <p>Całkowity opór:
                <b id="labPotTotalReadout">${total} Ω</b>
            </p>
        `;
        return;
    }


    // FOTO REZYSTOR
    if (part.type === "photoresistor") {
        if (part.lightLevel === undefined) part.lightLevel = 50;

        const light = Number(part.lightLevel);
        const resistance = Math.round(1000000 / (1 + light * 0.99));

        box.innerHTML = `
            <b>Fotorezystor</b>
            <label>Natężenie oświetlenia:
                <input
                    type="range"
                    min="0"
                    max="100"
                    value="${light}"
                    oninput="labSetPhotoLight(this.value)"
                >
            </label>
            <p>0% – ciemność, 100% – mocne światło.</p>
            <p>Aktualny opór: ${resistance} Ω</p>
        `;
        return;
    }

    // DIODA ZENERA
    if (part.type === "zener") {
        box.innerHTML = `
            <b>Dioda Zenera</b>
            <p>Napięcie Zenera: 5,1 V</p>
            <p>Zacisk A – anoda.</p>
            <p>Zacisk K – katoda.</p>
        `;
        return;
    }

    // BRZĘCZYK
    if (part.type === "buzzer") {
        box.innerHTML = `
            <b>Brzęczyk</b>
            <p>Napięcie znamionowe: 5 V</p>
            <p>Opór modelowy: 40 Ω</p>
            <p>Zacisk + – plus.</p>
            <p>Zacisk − – minus.</p>
        `;
        return;
    }

    // DIODY LED
    if (labIsLed(part)) {
        const color = labGetLedColor(part);

        box.innerHTML = `
            <b>${escapeHTML(LAB_PARTS[part.type].name)}</b>

            <label>Kolor diody:
                <input
                    id="labLedColor"
                    type="color"
                    value="${color}"
                    style="width:100%;height:45px;cursor:pointer"
                    onchange="labSaveLedColor()"
                >
            </label>

            <p>Polaryzacja: anoda (+), katoda (-)</p>

            <p class="lab-polarity-info">
                ${part.burned ? "Dioda jest przepalona." :
                part.lit ? "Dioda świeci." : "Dioda nie świeci."}
            </p>

            <button onclick="labSaveLedColor()">Zapisz kolor</button>
        `;
        return;
    }

    // POZOSTAŁE ELEMENTY
    box.innerHTML = `
        <b>${escapeHTML(LAB_PARTS[part.type].name)}</b>

        <label>Wartość:
            <input id="labPartValue"
                type="number"
                value="${part.value}"
                min="0.01"
                step="any">
        </label>

        <button onclick="labSavePartValue()">Zapisz wartość</button>

        <p class="lab-polarity-info">
            ${LAB_PARTS[part.type].polarized
                ? "Element spolaryzowany – zwróć uwagę na oznaczenia + i −."
                : "Element nie wymaga określonej polaryzacji."}
        </p>
    `;
}




function labSetPotPosition(value) {
    const part = labGetPart(labSelectedPart);

    if (!part || part.type !== "potentiometer") return;

    part.position = Math.max(0, Math.min(100, Number(value) || 0));

    labRefreshPotReadouts(part);
}


function labSetPotTotalResistance(value) {
    const part = labGetPart(labSelectedPart);

    if (!part || part.type !== "potentiometer") return;

    const resistance = Number(value);

    if (!Number.isFinite(resistance) || resistance < 1) return;

    part.totalResistance = Math.min(100000000, Math.round(resistance));

    labRefreshPotReadouts(part);
}


function labRefreshPotReadouts(part) {
    const position = Math.max(0, Math.min(100, Number(part.position) || 0));
    const total = Math.max(1, Number(part.totalResistance) || 10000);

    const resistance1 = Math.round(total * position / 100);
    const resistance2 = total - resistance1;

    const readout = $("labPotReadout");
    const r1 = $("labPotResistance1");
    const r2 = $("labPotResistance2");
    const totalReadout = $("labPotTotalReadout");

    if (readout) {
        readout.textContent = Math.round(position) + "%";
    }

    if (r1) {
        r1.textContent = resistance1 + " Ω";
    }

    if (r2) {
        r2.textContent = resistance2 + " Ω";
    }

    if (totalReadout) {
        totalReadout.textContent = total + " Ω";
    }
}


function labPotValueChanged() {
    if (labSimulationRunning) {
        labRunSimulation();
    }
}




function labSaveLedColor() {
    const part = labGetPart(labSelectedPart);
    const input = $("labLedColor");

    if (!part || !labIsLed(part) || !input) return;

    part.color = input.value;

    labRender();
    labUpdateSettings();
    labSetStatus("Zmieniono kolor diody LED.");
}


function labToggleSwitch(id) {
    const part = labGetPart(id);

    if (!part || part.type !== "switch") return;

    part.switchOn = !part.switchOn;

    labUpdateSettings();

    // Zawsze sprawdź obwód ponownie po zmianie przełącznika
    labRunSimulation();

    labSetStatus(
        part.switchOn
            ? "Przełącznik zamknięty – sprawdzam obwód."
            : "Przełącznik otwarty – obwód przerwany."
    );
}


function labSavePartValue() {
    const part = labGetPart(labSelectedPart);
    const value = Number($("labPartValue")?.value);

    if (!part || !Number.isFinite(value) || value <= 0) {
        labSetStatus("Wartość musi być większa od zera.");
        return;
    }

    part.value = value;
    labUpdateSettings();
    labRender();
    labSetStatus("Zapisano parametry elementu.");
}

/* =========================================
   SYMULACJA OBWODU
========================================= */


function labRunSimulation() {
    labResetLedStates();

    const battery = labParts.find(p => p.type === "battery");

    if (!battery) {
        labSimulationError("Brak baterii w układzie.");
        labRender();
        return;
    }

    if (labWires.length < 2) {
        labSimulationError("Połącz elementy przewodami.");
        labRender();
        return;
    }

    const terminalNode = (id, terminal) => `${id}:${terminal}`;
    const graph = new Map();

    function addNode(node) {
        if (!graph.has(node)) graph.set(node, []);
    }

    function connect(a, b, component = null) {
        addNode(a);
        addNode(b);

        graph.get(a).push({ node: b, component });
        graph.get(b).push({ node: a, component });
    }

    labWires.forEach(wire => {
        connect(
            terminalNode(wire.a, wire.pinA),
            terminalNode(wire.b, wire.pinB)
        );
    });

    labParts.forEach(part => {
        const terminals = LAB_PARTS[part.type]?.terminals || [];

        if (terminals.length < 2) return;
        if (part.type === "battery") return;

        if (part.type === "switch" && !part.switchOn) return;

        connect(
            terminalNode(part.id, terminals[0]),
            terminalNode(part.id, terminals[1]),
            part
        );
    });

    const start = terminalNode(battery.id, "plus");
    const finish = terminalNode(battery.id, "minus");

    function findPath(from, to) {
        const queue = [{
            node: from,
            path: [],
            visited: new Set([from])
        }];

        while (queue.length) {
            const current = queue.shift();

            if (current.node === to) return current.path;

            for (const edge of graph.get(current.node) || []) {
                if (current.visited.has(edge.node)) continue;

                const visited = new Set(current.visited);
                visited.add(edge.node);

                queue.push({
                    node: edge.node,
                    path: [...current.path, edge],
                    visited
                });
            }
        }

        return null;
    }

    const path = findPath(start, finish);

    if (!path) {
        labSimulationError(
            "Obwód jest otwarty. Nie ma zamkniętej drogi od plusa do minusa baterii."
        );
        labRender();
        return;
    }

    const usedParts = new Set(
        path.map(edge => edge.component).filter(Boolean)
    );

    const loads = [...usedParts].filter(part =>
        ["bulb", "resistor", "led", "led_red",
         "led_green", "led_blue", "led_yellow",
         "led_white", "motor", "buzzer"].includes(part.type)
    );

    if (!loads.length) {
        labSimulationError("W zamkniętym obwodzie nie ma odbiornika.");
        labRender();
        return;
    }

    const leds = labParts.filter(labIsLed);

    for (const led of leds) {
        if (!usedParts.has(led)) continue;

        const result = labCheckLedCircuit(led, battery);

        if (!result.ok) {
            labSimulationError(result.message);
            labRender();
            return;
        }
    }

    for (const part of usedParts) {
        if (
            ["motor", "capacitor"].includes(part.type) &&
            !labCheckPolarityOnPath(part, start)
        ) {
            labSimulationError(
                "Element ma odwrotną polaryzację. Sprawdź zaciski + i −."
            );
            labRender();
            return;
        }
    }

    const resistance = loads.reduce(
        (sum, part) => sum + Number(part.value || LAB_PARTS[part.type]?.resistance || 0),
        0
    );

    if (resistance <= 0) {
        labSimulationError("Nieprawidłowa wartość oporu.");
        labRender();
        return;
    }

    const voltage = Number(battery.value || battery.voltage || 9);
    const current = voltage / resistance;
    const power = voltage * current;


    // STAN ŻARÓWEK
    for (const bulb of labParts.filter(part => part.type === "bulb")) {
        bulb.lit = usedParts.has(bulb) && current > 0;

        bulb.brightness = bulb.lit
            ? Math.min(1, Math.max(0.15, current / 0.25))
            : 0;
    }


    $("circuitVoltage").textContent = voltage.toFixed(2) + " V";
    $("circuitCurrent").textContent = current.toFixed(3) + " A";
    $("circuitResistance").textContent = resistance.toFixed(2) + " Ω";
    $("circuitPower").textContent = power.toFixed(3) + " W";

    labSimulationRunning = true;

    labEvaluateLEDs(usedParts, battery, current);

    $("circuitMessage").textContent =
        "Obwód zamknięty. Symulacja działa.";

    $("labExplanation").textContent =
        `Prawo Ohma: I = U/R = ${voltage.toFixed(2)}/${resistance.toFixed(2)} = ` +
        `${current.toFixed(3)} A. Moc: P = U × I = ${power.toFixed(3)} W.`;

    labSetStatus("Symulacja uruchomiona.");
    labRender();
}


function labCheckPolarityOnPath(part, batteryPlusNode) {
    const plus = `${part.id}:plus`;
    const minus = `${part.id}:minus`;

    const pathToPlus = labFindWirePath(batteryPlusNode, plus);
    const pathToMinus = labFindWirePath(batteryPlusNode, minus);

    if (!pathToPlus || !pathToMinus) return true;

    return pathToPlus.length <= pathToMinus.length;
}

function labFindWirePath(start, target) {
    const graph = new Map();

    function add(a, b) {
        if (!graph.has(a)) graph.set(a, []);
        graph.get(a).push(b);
    }

    labWires.forEach(wire => {
        const a = `${wire.a}:${wire.pinA}`;
        const b = `${wire.b}:${wire.pinB}`;
        add(a, b);
        add(b, a);
    });

    const queue = [{ node: start, distance: 0 }];
    const visited = new Set([start]);

    while (queue.length) {
        const current = queue.shift();

        if (current.node === target) return current.distance;

        for (const next of graph.get(current.node) || []) {
            if (visited.has(next)) continue;
            visited.add(next);
            queue.push({ node: next, distance: current.distance + 1 });
        }
    }

    return null;
}

function labSimulationError(message) {
    labStopSimulation();
    $("circuitMessage").textContent = message;
    labSetStatus("BŁĄD: " + message);
}


function labStopSimulation() {
    labSimulationRunning = false;

    labResetLedStates();

    if ($("circuitVoltage")) $("circuitVoltage").textContent = "0 V";
    if ($("circuitCurrent")) $("circuitCurrent").textContent = "0 A";
    if ($("circuitResistance")) $("circuitResistance").textContent = "0 Ω";
    if ($("circuitPower")) $("circuitPower").textContent = "0 W";

    if ($("circuitMessage")) {
        $("circuitMessage").textContent = "Symulacja zatrzymana.";
    }

    labRender();
    labSetStatus("Symulacja zatrzymana.");
}

// DODATKOWE ELEMENTY ELEKTRONICZNE
Object.assign(LAB_PARTS, {
    led_red: {
        name: "LED czerwona",
        value: 220,
        voltage: 2.0,
        resistance: 220,
        unit: "Ω",
        polarized: true,
        color: "#ff2020",
        terminals: ["anode", "cathode"]
    },
    led_green: {
        name: "LED zielona",
        value: 220,
        voltage: 2.2,
        resistance: 220,
        unit: "Ω",
        polarized: true,
        color: "#20df55",
        terminals: ["anode", "cathode"]
    },
    led_blue: {
        name: "LED niebieska",
        value: 220,
        voltage: 3.2,
        resistance: 220,
        unit: "Ω",
        polarized: true,
        color: "#258bff",
        terminals: ["anode", "cathode"]
    },
    led_yellow: {
        name: "LED żółta",
        value: 220,
        voltage: 2.1,
        resistance: 220,
        unit: "Ω",
        polarized: true,
        color: "#ffe02a",
        terminals: ["anode", "cathode"]
    },
    led_white: {
        name: "LED biała",
        value: 220,
        voltage: 3.0,
        resistance: 220,
        unit: "Ω",
        polarized: true,
        color: "#ffffff",
        terminals: ["anode", "cathode"]
    },
    potentiometer: {
        name: "Potencjometr 10 kΩ",
        value: 10000,
        resistance: 10000,
        unit: "Ω",
        polarized: false,
        terminals: ["1", "W", "2"]
    },
    photoresistor: {
        name: "Fotorezystor",
        value: 10000,
        resistance: 10000,
        unit: "Ω",
        polarized: false,
        terminals: ["1", "2"]
    },
    zener: {
        name: "Dioda Zenera",
        value: 5.1,
        voltage: 5.1,
        resistance: 0,
        unit: "V",
        polarized: true,
        terminals: ["A", "K"]
    },
    buzzer: {
        name: "Brzęczyk",
        value: 40,
        resistance: 40,
        voltage: 5,
        unit: "Ω",
        polarized: true,
        terminals: ["+", "-"]
    }
});

// Ujednolicenie zacisków dodatkowych diod LED
["led_red", "led_green", "led_blue", "led_yellow", "led_white"].forEach(type => {
    LAB_PARTS[type].terminals = ["anode", "cathode"];
});

/* =========================================
   SYMULACJE – OBLICZENIA
========================================= */

function valueOf(id) {
    return Number($(id)?.value || 0);
}

function setText(id, text) {
    if ($(id)) $(id).textContent = text;
}

function updateSliderLabels() {
    document.querySelectorAll(
        "#labWorkspace input[type=range]"
    ).forEach(input => {
        const label = $(input.id + "Value");

        if (label) {
            const unit = label.textContent.replace(/^[\d.-]+\s*/, "");
            label.textContent = input.value + " " + unit;
        }
    });
}

function updateLabSimulation(name) {
    updateSliderLabels();

    switch (name) {
        case "mechanics": {
            const force = valueOf("mechForce");
            const mass = valueOf("mechMass");
            const friction = valueOf("mechFriction");
            const net = Math.max(0, force - friction);
            const acceleration = net / mass;

            setText("mechNet", net.toFixed(1) + " N");
            setText("mechAccel", acceleration.toFixed(2) + " m/s²");
            drawLab("mechanics", acceleration);
            break;
        }

        case "optics": {
            const distance = valueOf("opticDistance");
            const focal = valueOf("opticFocal");

            if (Math.abs(distance - focal) < 0.01) {
                setText("opticImage", "Nieskończoność");
                setText("opticType", "Obraz w nieskończoności");
            } else {
                const imageDistance =
                    distance * focal / (distance - focal);

                setText("opticImage", imageDistance.toFixed(1) + " cm");
                setText("opticType",
                    distance > focal ? "Rzeczywisty" : "Pozorny");
            }

            drawLab("optics", distance / focal);
            break;
        }

        case "thermal": {
            const energy =
                valueOf("thermalMass") *
                valueOf("thermalDelta") *
                valueOf("thermalCapacity");

            setText("thermalEnergy", Math.round(energy) + " J");
            setText("thermalKJ", (energy / 1000).toFixed(2) + " kJ");
            drawLab("thermal", valueOf("thermalDelta"));
            break;
        }

        case "waves": {
            const frequency = valueOf("waveFrequency");
            const length = valueOf("waveLength");

            setText("waveSpeed", (frequency * length).toFixed(1) + " m/s");
            setText("wavePeriod", (1 / frequency).toFixed(3) + " s");
            drawLab("waves", length);
            break;
        }

        case "magnetism": {
            const distance = valueOf("magDistance");
            const strength = 100 / (distance * distance);

            setText("magStrength", strength.toFixed(2));
            setText("magField", "Względna siła: " + strength.toFixed(2));
            break;
        }

        case "energy": {
            const mass = valueOf("energyMass");
            const height = valueOf("energyHeight");
            const velocity = valueOf("energyVelocity");

            const potential = mass * 9.81 * height;
            const kinetic = 0.5 * mass * velocity * velocity;

            setText("energyPotential", potential.toFixed(1) + " J");
            setText("energyKinetic", kinetic.toFixed(1) + " J");
            setText("energyTotal", (potential + kinetic).toFixed(1) + " J");

            drawLab("energy", height);
            break;
        }

        case "electrostatics": {
            const q1 = valueOf("chargeOne") * 1e-6;
            const q2 = valueOf("chargeTwo") * 1e-6;
            const distance = valueOf("chargeDistance") / 100;

            const force = 8.99e9 * Math.abs(q1 * q2) /
                (distance * distance);

            setText("chargeType",
                q1 * q2 < 0 ? "Przyciąganie" :
                q1 * q2 > 0 ? "Odpychanie" : "Brak ładunku");

            setText("chargeForce", force.toFixed(2) + " N");
            drawLab("electrostatics", force);
            break;
        }

        case "fluids": {
            const pressure =
                valueOf("fluidDensity") * 9.81 * valueOf("fluidDepth");

            setText("fluidPressure", pressure.toFixed(0) + " Pa");
            setText("fluidBar", (pressure / 100000).toFixed(3) + " bar");
            drawLab("fluids", valueOf("fluidDepth"));
            break;
        }

        case "measurements": {
            setText("measureMeters",
                (valueOf("measureLength") / 100).toFixed(2) + " m");

            setText("measureGrams",
                (valueOf("measureMass") * 1000).toFixed(0) + " g");

            setText("measureMinutes",
                (valueOf("measureTime") / 60).toFixed(2) + " min");
            break;
        }
    }
}

/* =========================================
   RYSOWANIE SYMULACJI
========================================= */

function drawLab(type, value) {
    const canvas = $("labCanvas");
    if (!canvas) return;

    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 230;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;

    const ctx = canvas.getContext("2d");

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "#334967";
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    for (let y = 0; y < height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.fillStyle = "#8fbaff";
    ctx.font = "13px Arial";
    ctx.fillText("Symulacja PHYSICS LAB", 15, 22);

    if (type === "waves") {
        ctx.strokeStyle = "#4f9cff";
        ctx.lineWidth = 3;
        ctx.beginPath();

        for (let x = 0; x <= width; x++) {
            const y = height / 2 +
                Math.sin(x / Math.max(8, value * 3)) * 55;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
        return;
    }

    if (type === "mechanics") {
        const x = 35 + Math.min(1, value / 10) * (width - 110);

        ctx.fillStyle = "#e9b44c";
        ctx.fillRect(x, height / 2 - 20, 45, 40);

        ctx.fillStyle = "#fff";
        ctx.fillText("Ciało", x + 5, height / 2 + 5);

        ctx.strokeStyle = "#35d39a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 50, height / 2);
        ctx.lineTo(Math.min(width - 10, x + 110), height / 2);
        ctx.stroke();
        return;
    }

    if (type === "optics") {
        const center = width / 2;

        ctx.strokeStyle = "#a7b9d3";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(center, 30);
        ctx.lineTo(center, height - 25);
        ctx.stroke();

        ctx.fillStyle = "#6dbbff";
        ctx.fillText("Soczewka", center + 8, 42);

        ctx.strokeStyle = "#ffd36a";
        ctx.lineWidth = 2;

        for (const y of [
            height / 2 - 35,
            height / 2,
            height / 2 + 35
        ]) {
            ctx.beginPath();
            ctx.moveTo(25, y);
            ctx.lineTo(center, y);
            ctx.lineTo(
                width - 25,
                height / 2 + (y - height / 2) * 0.4
            );
            ctx.stroke();
        }
        return;
    }

    if (type === "thermal") {
        const amount = Math.min(1, value / 100);

        ctx.fillStyle = "#27415d";
        ctx.fillRect(25, height / 2 - 18, width - 50, 36);

        ctx.fillStyle = "#ff794e";
        ctx.fillRect(
            25, height / 2 - 18,
            (width - 50) * amount, 36
        );

        ctx.fillStyle = "#fff";
        ctx.fillText("Zmiana temperatury", 25, height / 2 + 48);
        return;
    }

    if (type === "energy") {
        const h = Math.min(height - 65, value * 1.2);

        ctx.fillStyle = "#53a6ff";
        ctx.fillRect(width / 2 - 25, height - 30 - h, 50, h);

        ctx.fillStyle = "#fff";
        ctx.fillText(
            "Wysokość: " + value.toFixed(1) + " m",
            20, height - 12
        );
        return;
    }

    if (type === "fluids") {
        const depth = Math.min(height - 40, value * 8);

        ctx.fillStyle = "#185a9a";
        ctx.fillRect(25, 35, width - 50, depth);

        ctx.fillStyle = "#c7e6ff";
        ctx.fillText("Poziom cieczy", 35, 25);
        return;
    }

    if (type === "electrostatics") {
        ctx.font = "bold 30px Arial";
        ctx.fillStyle = "#ff7575";
        ctx.fillText("+", width * 0.25, height / 2);

        ctx.fillStyle = "#72baff";
        ctx.fillText("−", width * 0.72, height / 2);

        ctx.font = "13px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText(
            "Oddziaływanie ładunków",
            width / 2 - 75, height - 25
        );
    }
}

/* =========================================
   START
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeSupabase();
    renderTopics();
    showScreen("home");

    console.log("PHYSICS uruchomiony.");
});
/* =========================================
   LED – ŚWIECENIE I PRZEPALANIE
========================================= */

const LED_LIMITS = {
    led: { min: 5, max: 20 },
    led_red: { min: 5, max: 20 },
    led_green: { min: 5, max: 20 },
    led_blue: { min: 5, max: 20 },
    led_yellow: { min: 5, max: 20 },
    led_white: { min: 5, max: 20 }
};

function labIsLed(part) {
    return !!part && Object.prototype.hasOwnProperty.call(
        LED_LIMITS,
        part.type
    );
}

function labGetLedColor(part) {
    const info = LAB_PARTS[part.type] || {};
    return part.color || info.color || "#ff2020";
}

function labGetResistance(part) {
    const info = LAB_PARTS[part.type] || {};
    return Number(part.resistance ?? part.value ?? info.resistance ?? 0);
}

function labResetLedStates() {
    for (const part of labParts) {
        if (!labIsLed(part)) continue;

        part.lit = false;
        part.burned = false;
        part.ledBrightness = 0;
        part.ledMessage = "";
    }
}


function labCheckLedCircuit(led, battery) {
    const graph = new Map();

    function addNode(node) {
        if (!graph.has(node)) graph.set(node, []);
    }

    function connect(a, b) {
        addNode(a);
        addNode(b);
        graph.get(a).push(b);
        graph.get(b).push(a);
    }

    function node(id, pin) {
        return `${id}:${pin}`;
    }

    // Przewody
    for (const wire of labWires) {
        connect(
            node(wire.a, wire.pinA),
            node(wire.b, wire.pinB)
        );
    }

    // Wewnętrzne połączenia elementów
    for (const part of labParts) {
        if (part.id === battery.id || part.id === led.id) continue;

        const info = LAB_PARTS[part.type] || {};
        const terminals = info.terminals || [];

        if (terminals.length < 2) continue;

        if (part.type === "switch" && !part.switchOn) continue;

        connect(
            node(part.id, terminals[0]),
            node(part.id, terminals[1])
        );
    }

    function connected(start, target) {
        const queue = [start];
        const visited = new Set([start]);

        while (queue.length) {
            const current = queue.shift();

            if (current === target) return true;

            for (const next of graph.get(current) || []) {
                if (visited.has(next)) continue;

                visited.add(next);
                queue.push(next);
            }
        }

        return false;
    }

    const batteryTerminals =
        LAB_PARTS[battery.type]?.terminals || ["plus", "minus"];

    const ledTerminals =
        LAB_PARTS[led.type]?.terminals || ["anode", "cathode"];

    const plus = node(battery.id, batteryTerminals[0]);
    const minus = node(battery.id, batteryTerminals[1]);

    const anode = node(led.id, ledTerminals[0]);
    const cathode = node(led.id, ledTerminals[1]);

    const correct =
        connected(plus, anode) &&
        connected(cathode, minus);

    if (correct) {
        return { ok: true };
    }

    const reversed =
        connected(plus, cathode) &&
        connected(anode, minus);

    return {
        ok: false,
        message: reversed
            ? "LED jest podłączona odwrotnie! Zamień anodę i katodę."
            : "LED nie jest prawidłowo połączona z baterią."
    };
}


function labEvaluateLEDs(usedParts, battery, totalCurrent) {
    const batteryVoltage = Number(
        battery.voltage ?? battery.value ?? 9
    );

    for (const led of labParts.filter(labIsLed)) {
        led.lit = false;
        led.ledBrightness = 0;

        // LED poza zamkniętym obwodem nie świeci.
        if (!usedParts.has(led)) {
            led.ledMessage = "Brak przepływu prądu";
            continue;
        }

        if (led.burned) {
            led.ledMessage = "LED przepalona";
            continue;
        }

        // Szukamy rezystora rzeczywiście używanego w obwodzie.
        const resistor = [...usedParts].find(
            part => part.type === "resistor"
        );

        if (!resistor) {
            led.burned = true;
            led.ledMessage = "LED SPALONA – brak rezystora!";
            continue;
        }

        const resistance = labGetResistance(resistor);

        if (resistance <= 0) {
            led.burned = true;
            led.ledMessage = "LED SPALONA – zły opór!";
            continue;
        }

        const ledVoltage = Number(
            LAB_PARTS[led.type]?.voltage ?? 2
        );

        const current =
            Math.max(0, (batteryVoltage - ledVoltage) / resistance) * 1000;

        const limits = LED_LIMITS[led.type];

        if (current > limits.max) {
            led.burned = true;
            led.ledMessage =
                `LED SPALONA – prąd ${current.toFixed(1)} mA!`;
            continue;
        }

        if (current < limits.min) {
            led.lit = true;
            led.ledBrightness = 0.15;
            led.ledMessage =
                `LED świeci słabo – ${current.toFixed(1)} mA`;
            continue;
        }

        led.lit = true;
        led.ledBrightness = Math.min(1, current / 15);
        led.ledMessage =
            `LED świeci – ${current.toFixed(1)} mA`;
    }
}


/* =========================================
   OBSŁUGA PRZYCISKÓW SYMULACJI
========================================= */

document.addEventListener("click", function(event) {
    const button = event.target.closest("button");

    if (!button) return;

    const workspace = button.closest("#labWorkspace");

    if (!workspace) return;

    const text = button.textContent.trim().toLowerCase();

    if (
        text.includes("uruchom") ||
        text.includes("start symulacji") ||
        text.includes("run simulation")
    ) {
        event.preventDefault();
        labRunSimulation();
    }

    if (
        text.includes("zatrzymaj") ||
        text.includes("stop symulacji") ||
        text.includes("stop simulation")
    ) {
        event.preventDefault();
        labStopSimulation();
    }
});

/* =========================================
   PHYSICS LAB – PEWNE DODAWANIE ELEMENTÓW
========================================= */

document.addEventListener("click", function(event) {
    const button = event.target.closest(
        ".part-button[data-part-type]"
    );

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const type = button.dataset.partType;

    if (!type || !LAB_PARTS[type]) {
        console.error("Nieznany element:", type);
        return;
    }

    const stage = $("labStage");

    if (!stage) {
        console.error("Nie znaleziono obszaru laboratorium.");
        return;
    }

    labDragging = null;
labAddPart(type);
}, true);

/* =========================================
   NAPRAWA PRZECIĄGANIA ELEMENTÓW
========================================= */

// Zakończenie przeciągania po puszczeniu myszy
document.addEventListener("pointerup", function() {
    if (typeof labDragging !== "undefined") {
        labDragging = null;
    }
});

// Zakończenie przeciągania, gdy przeglądarka
// anuluje zdarzenie wskaźnika
document.addEventListener("pointercancel", function() {
    if (typeof labDragging !== "undefined") {
        labDragging = null;
    }
});

// Awaryjne odblokowanie edytora po utracie fokusu
window.addEventListener("blur", function() {
    if (typeof labDragging !== "undefined") {
        labDragging = null;
    }
});
function labSetPotPosition(value) {
    const part = labGetPart(labSelectedPart);

    if (!part || part.type !== "potentiometer") return;

    part.position = Math.max(0, Math.min(100, Number(value)));

    labRender();
    labUpdateSettings();

    if (labSimulationRunning) labRunSimulation();
}

function labSetPhotoLight(value) {
    const part = labGetPart(labSelectedPart);

    if (!part || part.type !== "photoresistor") return;

    part.lightLevel = Math.max(0, Math.min(100, Number(value)));

    labUpdateSettings();

    if (labSimulationRunning) labRunSimulation();
}
function labStagePointerUp() {
    const wasTurningPot = labPotDragging !== null;

    labDragging = null;
    labPotDragging = null;

    if (wasTurningPot && labSimulationRunning) {
        labRunSimulation();
    }
}
// ZABEZPIECZENIE PRZED ZAWIESZENIEM PRZECIĄGANIA
document.addEventListener("pointercancel", () => {
    labDragging = null;
    labPotDragging = null;
});

window.addEventListener("blur", () => {
    labDragging = null;
    labPotDragging = null;
});
document.addEventListener("pointermove", labStagePointerMove);
document.addEventListener("pointerup", labStagePointerUp);

document.addEventListener("pointercancel", () => {
    labDragging = null;
    labPotDragging = null;
});

window.addEventListener("blur", () => {
    labDragging = null;
    labPotDragging = null;
});
function labUpdateWirePositions() {
    const svg = $("labWireSvg");
    if (!svg) return;

    const lines = svg.querySelectorAll(".wire-line");

    labWires.forEach((wire, index) => {
        const line = lines[index];

        if (!line) return;

        const a = labGetPart(wire.a);
        const b = labGetPart(wire.b);

        if (!a || !b) return;

        const p1 = labPinPosition(a, wire.pinA);
        const p2 = labPinPosition(b, wire.pinB);

        line.setAttribute("x1", p1.x);
        line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x);
        line.setAttribute("y2", p2.y);
    });
}
/* =========================================================
   PHYSICS LAB 2.0 – ROZBUDOWANE LABORATORIA
   Wklej na sam koniec script.js
   Nie zastępuje i nie modyfikuje laboratorium elektroniki.
========================================================= */

function labV2Range(id, label, min, max, value, unit, step = 1) {
    return `
        <div class="lab-v2-control">
            <label for="${id}">
                ${label}
                <strong><span id="${id}Value">${value}</span> ${unit}</strong>
            </label>
            <input id="${id}" type="range"
                min="${min}" max="${max}" step="${step}" value="${value}"
                oninput="updateLabSimulation(labCurrentModule)">
        </div>
    `;
}

function labV2Select(id, label, options, selected) {
    return `
        <div class="lab-v2-control">
            <label for="${id}">${label}</label>
            <select id="${id}" onchange="updateLabSimulation(labCurrentModule)">
                ${options.map(option => `
                    <option value="${option[0]}" ${option[0] === selected ? "selected" : ""}>
                        ${option[1]}
                    </option>
                `).join("")}
            </select>
        </div>
    `;
}

function labV2Readout(id, label, value) {
    return `
        <div class="lab-v2-readout">
            <span>${label}</span>
            <strong id="${id}">${value}</strong>
        </div>
    `;
}

function labV2Layout(title, description, controls, readouts) {
    return `
        <div class="lab-v2">
            <div class="lab-v2-heading">
                <h2>${title}</h2>
                <p>${description}</p>
            </div>

            <div class="lab-v2-grid">
                <div class="lab-v2-panel">
                    <h3>Ustawienia doświadczenia</h3>
                    ${controls}
                </div>

                <div class="lab-v2-panel">
                    <h3>Wyniki pomiarów</h3>
                    <div class="lab-v2-readouts">${readouts}</div>
                </div>
            </div>

            <div class="lab-v2-panel lab-v2-visual-panel">
                <h3>Stanowisko doświadczalne</h3>
                <canvas id="labCanvas" class="lab-canvas lab-v2-canvas"></canvas>
                <p id="labV2Description" class="lab-v2-description">
                    Zmieniaj parametry i obserwuj wyniki doświadczenia.
                </p>
            </div>
        </div>
    `;
}

function labV2UpdateLabels() {
    document.querySelectorAll("#labWorkspace .lab-v2-control input[type=range]")
        .forEach(input => {
            const output = $(input.id + "Value");
            if (output) output.textContent = input.value;
        });
}

/* -------------------------
   1. OPTYKA
------------------------- */

function renderOptics(w) {
    w.innerHTML = labV2Layout(
        "🔬 Laboratorium optyki",
        "Zmieniaj soczewki, położenie przedmiotu i ogniskową. Obserwuj powstawanie obrazu.",
        `
            ${labV2Select("opticShape", "Kształt soczewki", [
                ["convex", "Dwuwypukła – skupiająca"],
                ["plano", "Płasko-wypukła – skupiająca"],
                ["concave", "Dwuwklęsła – rozpraszająca"],
                ["planoConcave", "Płasko-wklęsła – rozpraszająca"],
                ["meniscus", "Meniskowa – skupiająca"]
            ], "convex")}
            ${labV2Range("opticDistance", "Odległość przedmiotu", 5, 120, 60, "cm")}
            ${labV2Range("opticFocal", "Ogniskowa", 5, 50, 20, "cm")}
            ${labV2Range("opticHeight", "Wysokość przedmiotu", 1, 10, 5, "cm")}
        `,
        `
            ${labV2Readout("opticImage", "Odległość obrazu", "30 cm")}
            ${labV2Readout("opticType", "Rodzaj obrazu", "Rzeczywisty")}
            ${labV2Readout("opticSize", "Powiększenie", "0,50×")}
            ${labV2Readout("opticOrientation", "Orientacja", "Odwrócony")}
        `
    );
    updateLabSimulation("optics");
}

/* -------------------------
   2. MECHANIKA
------------------------- */

function renderMechanics(w) {
    w.innerHTML = labV2Layout(
        "⚙️ Laboratorium mechaniki",
        "Zbuduj doświadczenie z ruchem ciała. Zmieniaj siłę, masę, tarcie i nachylenie równi.",
        `
            ${labV2Range("mechForce", "Siła ciągnąca", 0, 200, 50, "N")}
            ${labV2Range("mechMass", "Masa ciała", 1, 100, 10, "kg")}
            ${labV2Range("mechFriction", "Siła tarcia", 0, 100, 10, "N")}
            ${labV2Range("mechAngle", "Kąt nachylenia równi", 0, 45, 10, "°")}
            ${labV2Range("mechTime", "Czas ruchu", 1, 10, 3, "s")}
        `,
        `
            ${labV2Readout("mechNet", "Siła wypadkowa", "40 N")}
            ${labV2Readout("mechAccel", "Przyspieszenie", "4 m/s²")}
            ${labV2Readout("mechVelocity", "Prędkość końcowa", "12 m/s")}
            ${labV2Readout("mechDistance", "Przebyta droga", "18 m")}
        `
    );
    updateLabSimulation("mechanics");
}

/* -------------------------
   3. TERMODYNAMIKA
------------------------- */

function renderThermal(w) {
    w.innerHTML = labV2Layout(
        "🌡️ Laboratorium termodynamiki",
        "Porównuj materiały, mieszaj ciecze o różnych temperaturach i obliczaj energię cieplną. To symulacja komputerowa – bez prawdziwego podgrzewania.",
        `
            ${labV2Select("thermalMaterial", "Materiał", [
                ["water", "Woda"],
                ["aluminium", "Aluminium"],
                ["iron", "Żelazo"],
                ["copper", "Miedź"],
                ["wood", "Drewno"]
            ], "water")}
            ${labV2Range("thermalMass", "Masa", 0.1, 10, 2, "kg", 0.1)}
            ${labV2Range("thermalStart", "Temperatura początkowa", -20, 100, 20, "°C")}
            ${labV2Range("thermalEnd", "Temperatura końcowa", -20, 100, 60, "°C")}
            ${labV2Range("thermalInsulation", "Izolacja", 0, 100, 50, "%")}
        `,
        `
            ${labV2Readout("thermalCapacity", "Ciepło właściwe", "4200 J/(kg·°C)")}
            ${labV2Readout("thermalDelta", "Zmiana temperatury", "40 °C")}
            ${labV2Readout("thermalEnergy", "Energia cieplna", "336000 J")}
            ${labV2Readout("thermalKJ", "Energia", "336 kJ")}
            ${labV2Readout("thermalTransfer", "Energia po uwzględnieniu izolacji", "168 kJ")}
        `
    );
    updateLabSimulation("thermal");
}

/* -------------------------
   4. FALE I DŹWIĘK
------------------------- */

function renderWaves(w) {
    w.innerHTML = labV2Layout(
        "〰️ Laboratorium fal i dźwięku",
        "Zbuduj falę, zmieniaj jej częstotliwość, amplitudę i ośrodek rozchodzenia się.",
        `
            ${labV2Select("waveMedium", "Ośrodek", [
                ["air", "Powietrze"],
                ["water", "Woda"],
                ["steel", "Stal"],
                ["rope", "Lina"]
            ], "air")}
            ${labV2Range("waveFrequency", "Częstotliwość", 1, 2000, 440, "Hz")}
            ${labV2Range("waveAmplitude", "Amplituda", 1, 80, 35, "px")}
            ${labV2Range("waveLength", "Długość fali", 1, 20, 5, "m")}
        `,
        `
            ${labV2Readout("waveSpeed", "Prędkość fali", "343 m/s")}
            ${labV2Readout("wavePeriod", "Okres", "0,0023 s")}
            ${labV2Readout("waveLambda", "Obliczona długość fali", "0,78 m")}
            ${labV2Readout("waveSound", "Rodzaj dźwięku", "Słyszalny")}
        `
    );
    updateLabSimulation("waves");
}

/* -------------------------
   5. MAGNETYZM
------------------------- */

function renderMagnetism(w) {
    w.innerHTML = labV2Layout(
        "🧲 Laboratorium magnetyzmu",
        "Zmieniaj bieguny magnesów, odległość i parametry elektromagnesu. Obserwuj linie pola.",
        `
            ${labV2Select("magPoleOne", "Biegun pierwszego magnesu", [
                ["N", "Północny N"],
                ["S", "Południowy S"]
            ], "N")}
            ${labV2Select("magPoleTwo", "Biegun drugiego magnesu", [
                ["N", "Północny N"],
                ["S", "Południowy S"]
            ], "S")}
            ${labV2Range("magDistance", "Odległość magnesów", 1, 30, 8, "cm")}
            ${labV2Range("magTurns", "Liczba zwojów elektromagnesu", 10, 500, 100, "zwojów", 10)}
            ${labV2Range("magCurrent", "Natężenie prądu", 0, 5, 1, "A", 0.1)}
        `,
        `
            ${labV2Readout("magInteraction", "Oddziaływanie", "Przyciąganie")}
            ${labV2Readout("magStrength", "Względna siła magnesów", "1,00")}
            ${labV2Readout("magElectro", "Siła elektromagnesu", "100 jednostek")}
            ${labV2Readout("magCompass", "Kompas", "Wskazuje kierunek pola")}
        `
    );
    updateLabSimulation("magnetism");
}

/* -------------------------
   6. ENERGIA
------------------------- */

function renderEnergy(w) {
    w.innerHTML = labV2Layout(
        "⚡ Laboratorium energii",
        "Umieść kulkę na torze, zmieniaj jej masę, wysokość, prędkość i straty energii.",
        `
            ${labV2Select("energyTrack", "Tor doświadczenia", [
                ["ramp", "Równia pochyła"],
                ["loop", "Pętla"],
                ["slide", "Zjeżdżalnia"],
                ["water", "Elektrownia wodna"]
            ], "ramp")}
            ${labV2Range("energyMass", "Masa kulki", 1, 50, 5, "kg")}
            ${labV2Range("energyHeight", "Wysokość", 0, 100, 20, "m")}
            ${labV2Range("energyVelocity", "Prędkość początkowa", 0, 30, 5, "m/s")}
            ${labV2Range("energyLoss", "Straty energii", 0, 80, 10, "%")}
        `,
        `
            ${labV2Readout("energyPotential", "Energia potencjalna", "981 J")}
            ${labV2Readout("energyKinetic", "Energia kinetyczna", "62,5 J")}
            ${labV2Readout("energyTotal", "Energia mechaniczna", "1043,5 J")}
            ${labV2Readout("energyLost", "Energia utracona", "104,4 J")}
            ${labV2Readout("energyUseful", "Energia pozostała", "939,1 J")}
        `
    );
    updateLabSimulation("energy");
}

/* -------------------------
   7. ELEKTROSTATYKA
------------------------- */

function renderElectrostatics(w) {
    w.innerHTML = labV2Layout(
        "✨ Laboratorium elektrostatyki",
        "Przesuwaj ładunki, zmieniaj ich wartości i obserwuj przyciąganie, odpychanie oraz linie pola.",
        `
            ${labV2Range("chargeOne", "Pierwszy ładunek", -10, 10, 5, "µC", 0.5)}
            ${labV2Range("chargeTwo", "Drugi ładunek", -10, 10, -5, "µC", 0.5)}
            ${labV2Range("chargeDistance", "Odległość ładunków", 1, 50, 10, "cm")}
        `,
        `
            ${labV2Readout("chargeType", "Oddziaływanie", "Przyciąganie")}
            ${labV2Readout("chargeForce", "Siła Coulomba", "224,75 N")}
            ${labV2Readout("chargeField", "Kierunek pola", "Od plusa do minusa")}
            ${labV2Readout("chargeRatio", "Stosunek odległości", "1 : 1")}
        `
    );
    updateLabSimulation("electrostatics");
}

/* -------------------------
   8. CIECZE I GAZY
------------------------- */

function renderFluids(w) {
    w.innerHTML = labV2Layout(
        "💧 Laboratorium cieczy i gazów",
        "Badaj ciśnienie w zbiorniku, wypór i zachowanie przedmiotów zanurzonych w cieczy.",
        `
            ${labV2Select("fluidType", "Rodzaj cieczy", [
                ["water", "Woda"],
                ["oil", "Olej"],
                ["salt", "Woda słona"],
                ["mercury", "Rtęć – tylko symulacja"]
            ], "water")}
            ${labV2Range("fluidDepth", "Głębokość", 0, 20, 5, "m", 0.5)}
            ${labV2Range("fluidObjectMass", "Masa przedmiotu", 0.1, 20, 2, "kg", 0.1)}
            ${labV2Range("fluidObjectVolume", "Objętość przedmiotu", 0.1, 20, 3, "l", 0.1)}
        `,
        `
            ${labV2Readout("fluidDensity", "Gęstość cieczy", "1000 kg/m³")}
            ${labV2Readout("fluidPressure", "Ciśnienie hydrostatyczne", "49050 Pa")}
            ${labV2Readout("fluidBar", "Ciśnienie", "0,49 bar")}
            ${labV2Readout("fluidBuoyancy", "Siła wyporu", "29,43 N")}
            ${labV2Readout("fluidObjectState", "Zachowanie przedmiotu", "Pływa")}
        `
    );
    updateLabSimulation("fluids");
}

/* -------------------------
   9. POMIARY
------------------------- */

function renderMeasurements(w) {
    w.innerHTML = labV2Layout(
        "📏 Laboratorium pomiarów",
        "Wybierz przyrząd, ustaw jego dokładność i wykonaj pomiar. Porównaj wynik z wartością rzeczywistą.",
        `
            ${labV2Select("measureTool", "Przyrząd pomiarowy", [
                ["ruler", "Linijka"],
                ["caliper", "Suwmiarka"],
                ["micrometer", "Mikrometr"],
                ["scale", "Waga"],
                ["stopwatch", "Stoper"]
            ], "ruler")}
            ${labV2Range("measureValue", "Wartość mierzona", 1, 1000, 250, "jednostek")}
            ${labV2Range("measureRepeats", "Liczba pomiarów", 1, 10, 3, "razy")}
        `,
        `
            ${labV2Readout("measureResult", "Wynik pomiaru", "250")}
            ${labV2Readout("measureUnit", "Jednostka", "mm")}
            ${labV2Readout("measurePrecision", "Dokładność przyrządu", "1 mm")}
            ${labV2Readout("measureUncertainty", "Niepewność pomiaru", "±1 mm")}
            ${labV2Readout("measureAverage", "Średnia z pomiarów", "250")}
        `
    );
    updateLabSimulation("measurements");
}

/* =========================================================
   OBLICZENIA WSZYSTKICH LABORATORIÓW
========================================================= */

function updateLabSimulation(name) {
    if (!name || name === "electronics") return;

    labV2UpdateLabels();

    const v = id => Number($(id)?.value ?? 0);
    const choice = id => $(id)?.value ?? "";
    const put = (id, value) => setText(id, value);
    const description = message => put("labV2Description", message);

    switch (name) {

        case "optics": {
            const shape = choice("opticShape");
            const doDist = v("opticDistance");
            const focalValue = v("opticFocal");
            const height = v("opticHeight");

            const converging = !["concave", "planoConcave"].includes(shape);
            const f = converging ? focalValue : -focalValue;
            const denominator = doDist - f;

            const di = Math.abs(denominator) < 0.001
                ? Infinity
                : (doDist * f) / denominator;

            const magnification = Number.isFinite(di) ? -di / doDist : 0;
            const imageHeight = Math.abs(magnification * height);

            put("opticImage", Number.isFinite(di) ? di.toFixed(1) + " cm" : "Nieskończoność");
            put("opticType", !Number.isFinite(di) ? "W nieskończoności" : di > 0 ? "Rzeczywisty" : "Pozorny");
            put("opticSize", Math.abs(magnification).toFixed(2) + "×");
            put("opticOrientation", magnification < 0 ? "Odwrócony" : "Prosty");

            description(
                !converging
                    ? "Soczewka rozpraszająca: obraz jest pozorny, prosty i pomniejszony."
                    : doDist > focalValue
                        ? "Przedmiot znajduje się poza ogniskiem. Powstaje obraz rzeczywisty i odwrócony."
                        : "Przedmiot znajduje się między soczewką a ogniskiem. Obraz jest pozorny i prosty."
            );

            drawLab("optics", {
                shape, doDist, f, di, height, imageHeight, magnification
            });
            break;
        }

        case "mechanics": {
            const force = v("mechForce");
            const mass = v("mechMass");
            const friction = v("mechFriction");
            const angle = v("mechAngle") * Math.PI / 180;
            const time = v("mechTime");

            const gravityComponent = mass * 9.81 * Math.sin(angle);
            const net = force - friction - gravityComponent;
            const acceleration = net / mass;
            const velocity = Math.max(0, acceleration * time);
            const distance = Math.max(0, 0.5 * acceleration * time * time);

            put("mechNet", net.toFixed(2) + " N");
            put("mechAccel", acceleration.toFixed(2) + " m/s²");
            put("mechVelocity", velocity.toFixed(2) + " m/s");
            put("mechDistance", distance.toFixed(2) + " m");

            description(net > 0
                ? "Siła wypadkowa powoduje przyspieszanie ciała."
                : net < 0
                    ? "Siły oporu i składowa ciężaru przeważają – ciało jest hamowane."
                    : "Siły się równoważą – przyspieszenie wynosi zero."
            );

            drawLab("mechanics", { force, mass, friction, angle, net, acceleration });
            break;
        }

        case "thermal": {
            const materials = {
                water: ["Woda", 4200],
                aluminium: ["Aluminium", 900],
                iron: ["Żelazo", 450],
                copper: ["Miedź", 385],
                wood: ["Drewno", 1700]
            };

            const material = materials[choice("thermalMaterial")] || materials.water;
            const mass = v("thermalMass");
            const start = v("thermalStart");
            const end = v("thermalEnd");
            const insulation = v("thermalInsulation");
            const delta = end - start;
            const energy = mass * material[1] * delta;
            const transferred = energy * (insulation / 100);

            put("thermalCapacity", material[1] + " J/(kg·°C)");
            put("thermalDelta", delta.toFixed(1) + " °C");
            put("thermalEnergy", Math.round(energy) + " J");
            put("thermalKJ", (energy / 1000).toFixed(2) + " kJ");
            put("thermalTransfer", Math.round(transferred / 1000) + " kJ");

            description(delta >= 0
                ? "Materiał otrzymuje energię cieplną."
                : "Materiał oddaje energię cieplną."
            );

            drawLab("thermal", { start, end, insulation, energy });
            break;
        }

        case "waves": {
            const speeds = {
                air: 343,
                water: 1480,
                steel: 5000,
                rope: 30
            };

            const medium = choice("waveMedium");
            const speed = speeds[medium] || 343;
            const frequency = v("waveFrequency");
            const amplitude = v("waveAmplitude");
            const wavelength = speed / frequency;
            const period = 1 / frequency;

            put("waveSpeed", speed + " m/s");
            put("wavePeriod", period.toFixed(5) + " s");
            put("waveLambda", wavelength.toFixed(3) + " m");
            put("waveSound",
                frequency < 20 ? "Infradźwięki" :
                frequency > 20000 ? "Ultradźwięki" : "Słyszalny"
            );

            description("Fala rozchodzi się w wybranym ośrodku. Zwiększenie częstotliwości zmniejsza długość fali przy stałej prędkości.");

            drawLab("waves", { frequency, amplitude, wavelength, speed });
            break;
        }

        case "magnetism": {
            const poleOne = choice("magPoleOne");
            const poleTwo = choice("magPoleTwo");
            const distance = v("magDistance");
            const turns = v("magTurns");
            const current = v("magCurrent");

            const interaction = poleOne === poleTwo ? "Odpychanie" : "Przyciąganie";
            const strength = 100 / (distance * distance);
            const electro = turns * current;

            put("magInteraction", interaction);
            put("magStrength", strength.toFixed(2));
            put("magElectro", electro.toFixed(0) + " jednostek");
            put("magCompass", "Igła ustawia się wzdłuż pola");

            description(interaction + ". Linie pola magnetycznego na zewnątrz magnesu biegną od N do S.");

            drawLab("magnetism", { poleOne, poleTwo, distance, turns, current });
            break;
        }

        case "energy": {
            const mass = v("energyMass");
            const height = v("energyHeight");
            const velocity = v("energyVelocity");
            const loss = v("energyLoss") / 100;

            const potential = mass * 9.81 * height;
            const kinetic = 0.5 * mass * velocity * velocity;
            const total = potential + kinetic;
            const lost = total * loss;
            const useful = total - lost;

            put("energyPotential", potential.toFixed(2) + " J");
            put("energyKinetic", kinetic.toFixed(2) + " J");
            put("energyTotal", total.toFixed(2) + " J");
            put("energyLost", lost.toFixed(2) + " J");
            put("energyUseful", useful.toFixed(2) + " J");

            description("Energia mechaniczna jest sumą energii potencjalnej i kinetycznej. Straty mogą zostać zamienione np. w energię cieplną.");

            drawLab("energy", {
                mass, height, velocity, potential, kinetic, loss,
                track: choice("energyTrack")
            });
            break;
        }

        case "electrostatics": {
            const q1 = v("chargeOne") * 1e-6;
            const q2 = v("chargeTwo") * 1e-6;
            const distance = v("chargeDistance") / 100;

            const force = distance > 0
                ? 8.99e9 * Math.abs(q1 * q2) / (distance * distance)
                : 0;

            const type = q1 === 0 || q2 === 0
                ? "Brak oddziaływania"
                : q1 * q2 < 0 ? "Przyciąganie" : "Odpychanie";

            put("chargeType", type);
            put("chargeForce", force.toFixed(3) + " N");
            put("chargeField", "Od ładunku dodatniego do ujemnego");
            put("chargeRatio", "1 : 1");

            description(type + ". Zmniejszenie odległości zwiększa siłę oddziaływania zgodnie z prawem Coulomba.");

            drawLab("electrostatics", { q1, q2, distance, force });
            break;
        }

        case "fluids": {
            const densities = {
                water: 1000,
                oil: 900,
                salt: 1200,
                mercury: 13500
            };

            const density = densities[choice("fluidType")] || 1000;
            const depth = v("fluidDepth");
            const mass = v("fluidObjectMass");
            const volume = v("fluidObjectVolume") / 1000;

            const pressure = density * 9.81 * depth;
            const buoyancy = density * 9.81 * volume;
            const objectDensity = mass / volume;

            put("fluidDensity", density + " kg/m³");
            put("fluidPressure", pressure.toFixed(0) + " Pa");
            put("fluidBar", (pressure / 100000).toFixed(3) + " bar");
            put("fluidBuoyancy", buoyancy.toFixed(2) + " N");
            put("fluidObjectState",
                objectDensity < density ? "Pływa" :
                objectDensity > density ? "Tonie" : "Unosi się w równowadze"
            );

            description("Ciśnienie hydrostatyczne rośnie wraz z głębokością i gęstością cieczy. Siła wyporu zależy od objętości wypartej cieczy.");

            drawLab("fluids", { density, depth, mass, volume, objectDensity });
            break;
        }

        case "measurements": {
            const tools = {
                ruler: ["Linijka", "mm", 1],
                caliper: ["Suwmiarka", "mm", 0.1],
                micrometer: ["Mikrometr", "mm", 0.01],
                scale: ["Waga", "g", 1],
                stopwatch: ["Stoper", "s", 0.01]
            };

            const tool = tools[choice("measureTool")] || tools.ruler;
            const value = v("measureValue");
            const repeats = v("measureRepeats");
            const precision = tool[2];
            const uncertainty = precision / 2;

            put("measureResult", value.toFixed(2));
            put("measureUnit", tool[1]);
            put("measurePrecision", precision + " " + tool[1]);
            put("measureUncertainty", "±" + uncertainty + " " + tool[1]);
            put("measureAverage", value.toFixed(2) + " (" + repeats + " pomiarów)");

            description("Wybrany przyrząd: " + tool[0] + ". Większa dokładność przyrządu pozwala odczytać mniejszą zmianę wartości.");

            drawLab("measurements", { value, repeats, precision, tool: choice("measureTool") });
            break;
        }
    }
}

/* =========================================================
   RYSOWANIE STANOWISK DOŚWIADCZALNYCH
========================================================= */

function drawLab(type, data = {}) {
    const canvas = $("labCanvas");
    if (!canvas) return;

    const width = Math.max(300, canvas.clientWidth || 700);
    const height = 280;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = height + "px";

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#101d31";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(150,190,230,0.12)";
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    for (let y = 0; y < height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    const text = (value, x, y, size = 13, color = "#e8f2ff") => {
        ctx.fillStyle = color;
        ctx.font = `${size}px Arial`;
        ctx.fillText(String(value), x, y);
    };

    const line = (x1, y1, x2, y2, color = "#fff", lineWidth = 2) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    const arrow = (x1, y1, x2, y2, color = "#fbbf24") => {
        line(x1, y1, x2, y2, color, 3);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const size = 9;
        line(x2, y2,
            x2 - size * Math.cos(angle - 0.5),
            y2 - size * Math.sin(angle - 0.5), color, 3);
        line(x2, y2,
            x2 - size * Math.cos(angle + 0.5),
            y2 - size * Math.sin(angle + 0.5), color, 3);
    };

    const center = width / 2;

    switch (type) {

        case "optics": {
            const lensX = center;
            const axisY = 145;
            const converging = data.f > 0;

            line(20, axisY, width - 20, axisY, "#aabbd0", 1);

            ctx.fillStyle = "#60a5fa";
            ctx.beginPath();

            if (converging) {
                ctx.moveTo(lensX - 8, 45);
                ctx.quadraticCurveTo(lensX + 25, axisY, lensX - 8, 245);
                ctx.quadraticCurveTo(lensX - 25, axisY, lensX - 8, 45);
            } else {
                ctx.moveTo(lensX - 8, 45);
                ctx.quadraticCurveTo(lensX - 32, axisY, lensX - 8, 245);
                ctx.quadraticCurveTo(lensX + 32, axisY, lensX - 8, 45);
            }

            ctx.fill();
            ctx.strokeStyle = "#93c5fd";
            ctx.stroke();

            text("SOCZEWKA", lensX - 35, 25, 12, "#93c5fd");

            const objectX = Math.max(35, lensX - Math.min(180, data.doDist * 2));
            const objectTop = axisY - data.height * 8;

            arrow(objectX, axisY, objectX, objectTop, "#4ade80");
            text("PRZEDMIOT", objectX - 35, objectTop - 10, 11, "#4ade80");

            const focalX = lensX + Math.sign(data.f) * Math.min(160, Math.abs(data.f) * 2);
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.arc(focalX, axisY, 4, 0, Math.PI * 2);
            ctx.fill();
            text("F", focalX - 4, axisY + 20, 12, "#fbbf24");

            if (Number.isFinite(data.di)) {
                const imageX = lensX + Math.max(-220, Math.min(220, data.di * 2));
                const imageTop = axisY - Math.max(-100, Math.min(100, data.magnification * data.height * 8));
                arrow(imageX, axisY, imageX, imageTop, "#fb7185");
                text("OBRAZ", imageX - 22, imageTop - 10, 11, "#fb7185");
            }

            // Promienie konstrukcyjne
            line(objectX, objectTop, lensX, objectTop, "#fbbf24", 2);
            line(lensX, objectTop, width - 25, axisY, "#fbbf24", 2);
            line(objectX, objectTop, lensX, axisY, "#a78bfa", 1);
            line(lensX, axisY, width - 25, axisY, "#a78bfa", 1);

            text("Oś optyczna", 25, height - 15);
            break;
        }

        case "mechanics": {
            const angle = data.angle;
            const baseY = 220;
            const startX = 100;
            const length = Math.min(width - 180, 360);
            const endX = startX + length * Math.cos(angle);
            const endY = baseY - length * Math.sin(angle);

            line(startX, baseY, endX, endY, "#cbd5e1", 5);
            line(startX, baseY, endX, baseY, "#64748b", 2);

            const bx = startX + length * 0.45 * Math.cos(angle);
            const by = baseY - length * 0.45 * Math.sin(angle);

            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(-angle);
            ctx.fillStyle = "#f59e0b";
            ctx.fillRect(-25, -28, 50, 28);
            ctx.restore();

            arrow(bx, by - 20, bx + 70, by - 20, "#4ade80");
            arrow(bx, by - 20, bx - 45, by - 20, "#fb7185");

            text("F – siła ciągnąca", 20, 25, 12, "#4ade80");
            text("Tarcie", 20, 45, 12, "#fb7185");
            text("Równia pochyła", 20, height - 15);
            break;
        }

        case "thermal": {
            const top = 65;
            const tankX = center - 100;
            const tankW = 200;
            const tankH = 150;

            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 4;
            ctx.strokeRect(tankX, top, tankW, tankH);

            const range = Math.max(1, data.end - data.start);
            const ratio = Math.max(0.05, Math.min(1, Math.abs(range) / 120));

            ctx.fillStyle = data.end >= data.start ? "#ef6548" : "#38bdf8";
            ctx.fillRect(tankX + 4, top + tankH * (1 - ratio), tankW - 8, tankH * ratio);

            text("TEMPERATURA", tankX + 35, 35, 13);
            text(data.start + "°C → " + data.end + "°C", tankX + 38, 240, 14);
            text("Izolacja: " + data.insulation + "%", 20, 25, 12, "#fbbf24");

            for (let i = 0; i < 7; i++) {
                const x = tankX + 20 + i * 25;
                const y = top + 25 + (i % 2) * 30;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = "#fff";
                ctx.fill();
            }
            break;
        }

        case "waves": {
            const mid = height / 2;
            const amplitude = Math.min(90, data.amplitude);
            const cycles = Math.max(1, Math.min(12, width / Math.max(25, data.wavelength * 20)));

            line(15, mid, width - 15, mid, "#64748b", 1);

            ctx.beginPath();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 3;

            for (let x = 0; x <= width; x++) {
                const y = mid - Math.sin((x / width) * Math.PI * 2 * cycles) * amplitude;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            text("A = " + data.amplitude + " px", 20, 25, 12, "#4ade80");
            text("f = " + data.frequency + " Hz", 20, height - 15);
            break;
        }

        case "magnetism": {
            const left = center - 150;
            const right = center + 150;
            const poleA = data.poleOne;
            const poleB = data.poleTwo;

            // Linie pola
            for (let i = 0; i < 7; i++) {
                const y = 55 + i * 27;
                ctx.beginPath();
                ctx.strokeStyle = "rgba(96,165,250,0.65)";
                ctx.lineWidth = 1.5;
                ctx.ellipse(center, y + 35, 155, 30 + i * 2, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = "#dc5555";
            ctx.fillRect(left - 45, 105, 90, 65);
            ctx.fillStyle = "#4b91e8";
            ctx.fillRect(right - 45, 105, 90, 65);

            text(poleA, left - 5, 145, 28);
            text(poleB, right - 5, 145, 28);

            text("MAGNES 1", left - 40, 195, 11);
            text("MAGNES 2", right - 40, 195, 11);

            arrow(left + 50, 90, right - 50, 90, "#fbbf24");
            text("Linie pola magnetycznego", 20, 25, 12);
            break;
        }

        case "energy": {
            const floor = 235;
            const top = 50;
            const track = data.track;

            if (track === "loop") {
                ctx.beginPath();
                ctx.strokeStyle = "#94a3b8";
                ctx.lineWidth = 7;
                ctx.arc(center, 150, 75, Math.PI, Math.PI * 2);
                ctx.stroke();
                line(50, floor, center - 75, 150, "#94a3b8", 7);
                line(center + 75, 150, width - 50, floor, "#94a3b8", 7);
            } else if (track === "water") {
                line(70, top + 10, 70, floor, "#38bdf8", 7);
                line(70, floor, width - 60, floor, "#38bdf8", 7);
                ctx.fillStyle = "#38bdf8";
                ctx.fillRect(50, floor - 25, 40, 25);
                text("ZBIORNIK", 30, top, 12);
                text("TURBINA", width - 100, floor - 35, 12);
            } else {
                line(70, floor, center, top + 30, "#94a3b8", 7);
                line(center, top + 30, width - 60, floor, "#94a3b8", 7);
            }

            const ballX = 70 + (width - 140) * (1 - data.height / 100);
            const ballY = floor - Math.min(150, data.height * 1.5);

            ctx.beginPath();
            ctx.fillStyle = "#f59e0b";
            ctx.arc(ballX, ballY, 13, 0, Math.PI * 2);
            ctx.fill();

            text("Ep: " + data.potential.toFixed(0) + " J", 20, 25, 12, "#4ade80");
            text("Ek: " + data.kinetic.toFixed(0) + " J", 20, 45, 12, "#fbbf24");
            break;
        }

        case "electrostatics": {
            const left = center - 130;
            const right = center + 130;
            const positive = data.q1 >= 0;

            const drawCharge = (x, charge) => {
                ctx.beginPath();
                ctx.fillStyle = charge >= 0 ? "#ef4444" : "#3b82f6";
                ctx.arc(x, center > 0 ? 140 : 140, 25, 0, Math.PI * 2);
                ctx.fill();
                text(charge > 0 ? "+" : charge < 0 ? "−" : "0", x - 8, 149, 25);
            };

            drawCharge(left, data.q1);
            drawCharge(right, data.q2);

            for (let i = -3; i <= 3; i++) {
                const y = 140 + i * 22;
                const sameSign = data.q1 * data.q2 > 0;

                if (sameSign) {
                    arrow(left + 28, y, center - 35, y - i * 9, "#fbbf24");
                    arrow(right - 28, y, center + 35, y - i * 9, "#fbbf24");
                } else {
                    line(left + 25, y, right - 25, y, "#fbbf24", 1.5);
                }
            }

            text("ŁADUNKI ELEKTRYCZNE", 20, 25, 12);
            text("F = " + data.force.toFixed(2) + " N", 20, height - 15, 13, "#4ade80");
            break;
        }

        case "fluids": {
            const tankX = center - 100;
            const tankY = 35;
            const tankW = 200;
            const tankH = 205;
            const waterHeight = Math.max(10, Math.min(tankH, data.depth * 9));

            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 4;
            ctx.strokeRect(tankX, tankY, tankW, tankH);

            ctx.fillStyle = "#1479bd";
            ctx.fillRect(tankX + 3, tankY + tankH - waterHeight, tankW - 6, waterHeight);

            const objectY = tankY + tankH - Math.min(waterHeight, 70);
            ctx.fillStyle = data.objectDensity < data.density ? "#f59e0b" : "#94a3b8";
            ctx.fillRect(center - 22, objectY - 20, 44, 35);

            arrow(center + 50, objectY, center + 50, objectY - 55, "#4ade80");
            arrow(center + 75, objectY - 40, center + 75, objectY + 20, "#fb7185");

            text("SIŁA WYPORU", 20, 25, 12, "#4ade80");
            text("CIŚNIENIE", 20, height - 15, 12, "#38bdf8");
            break;
        }

        case "measurements": {
            const x = 45;
            const y = 120;
            const length = Math.min(width - 90, data.value * 0.45);

            line(x, y, x + length, y, "#fbbf24", 4);

            for (let i = 0; i <= 20; i++) {
                const px = x + (length / 20) * i;
                line(px, y - 10, px, y + (i % 5 === 0 ? 15 : 6), "#e2e8f0", 1);
            }

            text("SKALA POMIAROWA", 20, 35, 13);
            text("Wartość: " + data.value, x, y + 45, 14, "#4ade80");
            text("Dokładność: " + data.precision, x, y + 70, 12);
            text("Powtórzenia: " + data.repeats, x, y + 95, 12);
            break;
        }
    }
}
/* =========================================================
   PHYSICS LAB 3.0
   DODATKOWE ANIMACJE, WYKRESY I ZADANIA
   Wklej na samym końcu script.js
========================================================= */

(() => {
    "use strict";

    // Zachowujemy dotychczasowe funkcje renderujące i obliczeniowe.
    const oldRenderers = {
        optics: window.renderOptics,
        mechanics: window.renderMechanics,
        thermal: window.renderThermal,
        waves: window.renderWaves,
        magnetism: window.renderMagnetism,
        energy: window.renderEnergy,
        electrostatics: window.renderElectrostatics,
        fluids: window.renderFluids,
        measurements: window.renderMeasurements
    };

    const oldUpdate = window.updateLabSimulation;

    let animationFrame = null;
    let animationTime = 0;
    let animationRunning = false;
    let activeAnimationModule = "";

    const $lab = id => document.getElementById(id);

    const labV3Tasks = {
        optics: {
            title: "Eksperyment: obraz w soczewce",
            question: "Ustaw przedmiot dalej niż dwukrotność ogniskowej.",
            check: () => {
                const d = Number($lab("opticDistance")?.value);
                const f = Number($lab("opticFocal")?.value);
                return d >= 2 * f;
            },
            success: "Dobrze! Przedmiot znajduje się co najmniej 2f od soczewki."
        },
        mechanics: {
            title: "Eksperyment: ruch ciała",
            question: "Ustaw siłę wypadkową większą od 50 N.",
            check: () => {
                const f = Number($lab("mechForce")?.value);
                const friction = Number($lab("mechFriction")?.value);
                const mass = Number($lab("mechMass")?.value);
                const angle = Number($lab("mechAngle")?.value) * Math.PI / 180;
                return f - friction - mass * 9.81 * Math.sin(angle) > 50;
            },
            success: "Dobrze! Siła wypadkowa przekracza 50 N."
        },
        thermal: {
            title: "Eksperyment: energia cieplna",
            question: "Ustaw temperaturę końcową wyższą od początkowej.",
            check: () => Number($lab("thermalEnd")?.value) >
                         Number($lab("thermalStart")?.value),
            success: "Dobrze! Materiał otrzymuje energię cieplną."
        },
        waves: {
            title: "Eksperyment: długość fali",
            question: "Ustaw częstotliwość na co najmniej 500 Hz.",
            check: () => Number($lab("waveFrequency")?.value) >= 500,
            success: "Dobrze! Zwiększyłeś częstotliwość fali."
        },
        magnetism: {
            title: "Eksperyment: bieguny magnesów",
            question: "Ustaw dwa jednakowe bieguny naprzeciwko siebie.",
            check: () => $lab("magPoleOne")?.value ===
                         $lab("magPoleTwo")?.value,
            success: "Dobrze! Jednakowe bieguny się odpychają."
        },
        energy: {
            title: "Eksperyment: energia potencjalna",
            question: "Ustaw wysokość kulki na co najmniej 60 metrów.",
            check: () => Number($lab("energyHeight")?.value) >= 60,
            success: "Dobrze! Kulka ma dużą energię potencjalną."
        },
        electrostatics: {
            title: "Eksperyment: ładunki",
            question: "Ustaw dwa ładunki o przeciwnych znakach.",
            check: () => {
                const a = Number($lab("chargeOne")?.value);
                const b = Number($lab("chargeTwo")?.value);
                return a * b < 0;
            },
            success: "Dobrze! Ładunki o przeciwnych znakach się przyciągają."
        },
        fluids: {
            title: "Eksperyment: siła wyporu",
            question: "Ustaw masę przedmiotu tak, aby jego gęstość była mniejsza od gęstości cieczy.",
            check: () => {
                const density = {
                    water: 1000, oil: 900, salt: 1200, mercury: 13500
                };
                const type = $lab("fluidType")?.value || "water";
                const mass = Number($lab("fluidObjectMass")?.value);
                const volume = Number($lab("fluidObjectVolume")?.value) / 1000;
                return volume > 0 && mass / volume < density[type];
            },
            success: "Dobrze! Przedmiot ma mniejszą gęstość niż ciecz."
        },
        measurements: {
            title: "Eksperyment: dokładność pomiaru",
            question: "Wybierz mikrometr jako przyrząd pomiarowy.",
            check: () => $lab("measureTool")?.value === "micrometer",
            success: "Dobrze! Mikrometr ma dokładność 0,01 mm w tym modelu."
        }
    };

    // Dodatkowy wygląd – style są dodawane automatycznie.
    if (!$lab("labV3Styles")) {
        const style = document.createElement("style");
        style.id = "labV3Styles";
        style.textContent = `
            .lab-v3-extra {
                display: grid;
                grid-template-columns: minmax(0, 1.3fr) minmax(250px, 0.7fr);
                gap: 16px;
                margin-top: 18px;
            }

            .lab-v3-card {
                background: #14243a;
                color: #eaf2ff;
                border: 1px solid #334b69;
                border-radius: 14px;
                padding: 16px;
                min-width: 0;
            }

            .lab-v3-card h3 {
                margin: 0 0 12px;
                font-size: 17px;
            }

            .lab-v3-canvas {
                width: 100%;
                height: 230px;
                display: block;
                background: #0b1422;
                border-radius: 10px;
            }

            .lab-v3-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
            }

            .lab-v3-buttons button,
            .lab-v3-task button {
                border: 0;
                border-radius: 8px;
                padding: 10px 14px;
                color: white;
                background: #2563eb;
                cursor: pointer;
                font-weight: 700;
            }

            .lab-v3-buttons button:hover,
            .lab-v3-task button:hover {
                filter: brightness(1.15);
            }

            .lab-v3-buttons .pause {
                background: #d97706;
            }

            .lab-v3-buttons .reset {
                background: #475569;
            }

            .lab-v3-task p {
                line-height: 1.5;
            }

            .lab-v3-task-result {
                min-height: 42px;
                margin-top: 10px;
                padding: 10px;
                border-radius: 8px;
                background: #0b1422;
                color: #cbd5e1;
            }

            .lab-v3-graph {
                width: 100%;
                height: 190px;
                display: block;
                background: #0b1422;
                border-radius: 10px;
            }

            .lab-v3-small {
                color: #9fb2cc;
                font-size: 12px;
                margin-top: 8px;
            }

            @media (max-width: 750px) {
                .lab-v3-extra {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function labV3Enhance(module) {
        const workspace = $lab("labWorkspace");
        if (!workspace) return;

        // Usuń poprzedni panel tego rozszerzenia.
        workspace.querySelector(".lab-v3-extra")?.remove();

        const task = labV3Tasks[module];
        if (!task) return;

        const panel = document.createElement("div");
        panel.className = "lab-v3-extra";

        panel.innerHTML = `
            <section class="lab-v3-card">
                <h3>🎬 Animacja doświadczenia</h3>
                <canvas id="labV3Animation" class="lab-v3-canvas"></canvas>

                <div class="lab-v3-buttons">
                    <button type="button" id="labV3Start">▶ Start</button>
                    <button type="button" id="labV3Pause" class="pause">Ⅱ Pauza</button>
                    <button type="button" id="labV3Reset" class="reset">↺ Reset</button>
                </div>

                <p class="lab-v3-small">
                    Animacja przedstawia model zjawiska fizycznego.
                    Zmieniaj parametry doświadczenia, aby obserwować różnice.
                </p>
            </section>

            <section class="lab-v3-card lab-v3-task">
                <h3>🧠 Zadanie eksperymentalne</h3>
                <p><strong>${task.title}</strong></p>
                <p>${task.question}</p>
                <button type="button" id="labV3Check">Sprawdź rozwiązanie</button>
                <div id="labV3TaskResult" class="lab-v3-task-result">
                    Wykonaj doświadczenie i sprawdź wynik.
                </div>
            </section>

            <section class="lab-v3-card">
                <h3>📈 Wykres doświadczenia</h3>
                <canvas id="labV3Graph" class="lab-v3-graph"></canvas>
                <p class="lab-v3-small" id="labV3GraphDescription">
                    Wykres aktualizuje się po zmianie parametrów.
                </p>
            </section>

            <section class="lab-v3-card">
                <h3>📘 Jak interpretować doświadczenie?</h3>
                <p id="labV3Explanation">
                    Zmieniaj parametry i obserwuj, jak wpływają na wynik.
                </p>
                <p class="lab-v3-small">
                    Wyniki są obliczeniami modelowymi, a nie pomiarami
                    rzeczywistego urządzenia.
                </p>
            </section>
        `;

        workspace.appendChild(panel);

        $lab("labV3Start").addEventListener("click", () => {
            activeAnimationModule = module;
            animationRunning = true;
            labV3Animate();
        });

        $lab("labV3Pause").addEventListener("click", () => {
            animationRunning = false;
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = null;
        });

        $lab("labV3Reset").addEventListener("click", () => {
            animationRunning = false;
            animationTime = 0;
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            labV3DrawAnimation(module);
        });

        $lab("labV3Check").addEventListener("click", () => {
            const result = $lab("labV3TaskResult");
            if (!result) return;

            if (task.check()) {
                result.textContent = "✅ " + task.success;
                result.style.color = "#86efac";
            } else {
                result.textContent = "❌ Jeszcze nie. Zmień parametry i spróbuj ponownie.";
                result.style.color = "#fca5a5";
            }
        });

        labV3DrawAnimation(module);
        labV3DrawGraph(module);
        labV3Explain(module);
    }

    // Odczyt parametrów bez modyfikowania oryginalnych kontrolek.
    function labV3Value(id, fallback = 0) {
        const element = $lab(id);
        return element ? Number(element.value) : fallback;
    }

    function labV3Canvas(id) {
        const canvas = $lab(id);
        if (!canvas) return null;

        const width = Math.max(280, canvas.clientWidth || 600);
        const height = canvas.clientHeight || 220;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);

        if (canvas.width !== Math.round(width * ratio) ||
            canvas.height !== Math.round(height * ratio)) {
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
        }

        const ctx = canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);

        return { canvas, ctx, width, height };
    }

    function labV3DrawAnimation(module) {
        const surface = labV3Canvas("labV3Animation");
        if (!surface) return;

        const { ctx, width: w, height: h } = surface;
        const t = animationTime;
        const cx = w / 2;
        const cy = h / 2;

        ctx.fillStyle = "#0b1422";
        ctx.fillRect(0, 0, w, h);

        const line = (x1, y1, x2, y2, color = "#94a3b8", size = 2) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        const circle = (x, y, r, color) => {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        const label = (txt, x, y, color = "#e2e8f0") => {
            ctx.fillStyle = color;
            ctx.font = "13px Arial";
            ctx.fillText(txt, x, y);
        };

        switch (module) {
            case "optics": {
                const lensX = cx;
                const objectX = 65;
                const f = Math.max(5, labV3Value("opticFocal", 20));
                const d = labV3Value("opticDistance", 60);
                const focalX = lensX + Math.min(120, f * 2);

                line(20, cy, w - 20, cy, "#94a3b8");
                ctx.fillStyle = "#60a5fa";
                ctx.beginPath();
                ctx.ellipse(lensX, cy, 10, 75, 0, 0, Math.PI * 2);
                ctx.fill();

                line(objectX, cy, objectX, cy - 50, "#4ade80", 4);
                circle(focalX, cy, 4, "#fbbf24");

                for (let i = 0; i < 3; i++) {
                    const y = cy - 35 + i * 25;
                    line(objectX, y, lensX, y, "#fbbf24");
                    line(lensX, y, w - 25, cy, "#fbbf24");
                }

                label("PRZEDMIOT", 25, cy - 65, "#4ade80");
                label("SOCZEWKA", lensX - 35, 25, "#93c5fd");
                label("F", focalX - 4, cy + 20, "#fbbf24");
                label("d = " + d + " cm", 20, h - 15);
                break;
            }

            case "mechanics": {
                const angle = labV3Value("mechAngle", 10) * Math.PI / 180;
                const base = h - 35;
                const start = 45;
                const length = w - 100;

                line(start, base, start + length * Math.cos(angle),
                    base - length * Math.sin(angle), "#cbd5e1", 5);

                const x = start + length * 0.4 * Math.cos(angle);
                const y = base - length * 0.4 * Math.sin(angle);

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-angle);
                ctx.fillStyle = "#f59e0b";
                ctx.fillRect(-20, -30, 40, 30);
                ctx.restore();

                const movingX = x + Math.sin(t * 2) * 35;
                circle(movingX, y - 15, 5, "#4ade80");
                line(x, y - 40, x + 65, y - 40, "#4ade80", 3);
                line(x, y - 30, x - 40, y - 30, "#fb7185", 3);

                label("SIŁA", 20, 25, "#4ade80");
                label("TARCIE", 20, 45, "#fb7185");
                break;
            }

            case "thermal": {
                const start = labV3Value("thermalStart", 20);
                const end = labV3Value("thermalEnd", 60);
                const hot = end >= start;

                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 4;
                ctx.strokeRect(cx - 90, 35, 180, 150);

                ctx.fillStyle = hot ? "#dc563d" : "#258ac7";
                ctx.fillRect(cx - 86, 39, 172, 142);

                for (let i = 0; i < 18; i++) {
                    const x = cx - 70 + ((i * 37 + t * 35) % 140);
                    const y = 50 + ((i * 23 + t * 24) % 115);
                    circle(x, y, 3, "#fff1c2");
                }

                label(start + "°C → " + end + "°C", cx - 45, h - 15);
                label(hot ? "POCHŁANIANIE CIEPŁA" : "ODDAWANIE CIEPŁA",
                    20, 22, hot ? "#fca5a5" : "#7dd3fc");
                break;
            }

            case "waves": {
                const amp = labV3Value("waveAmplitude", 35);
                const frequency = labV3Value("waveFrequency", 440);
                const cycles = 2 + frequency / 250;
                const phase = t * 3;

                ctx.beginPath();
                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 3;

                for (let x = 0; x <= w; x++) {
                    const y = cy - Math.sin(x / w * Math.PI * 2 * cycles - phase) *
                        Math.min(80, amp);
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                line(10, cy, w - 10, cy, "#64748b");
                label("f = " + frequency + " Hz", 20, 25);
                label("A = " + amp + " px", 20, h - 15, "#4ade80");
                break;
            }

            case "magnetism": {
                const p1 = $lab("magPoleOne")?.value || "N";
                const p2 = $lab("magPoleTwo")?.value || "S";
                const left = cx - 100;
                const right = cx + 100;

                for (let i = 0; i < 7; i++) {
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(96,165,250,0.65)";
                    ctx.lineWidth = 1.5;
                    ctx.ellipse(cx, cy, 100, 25 + i * 10, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.fillStyle = "#dc5555";
                ctx.fillRect(left - 35, cy - 25, 70, 50);
                ctx.fillStyle = "#3b82f6";
                ctx.fillRect(right - 35, cy - 25, 70, 50);

                label(p1, left - 8, cy + 8);
                label(p2, right - 8, cy + 8);

                label(p1 === p2 ? "ODPYCHANIE" : "PRZYCIĄGANIE",
                    cx - 45, 25, "#fbbf24");
                break;
            }

            case "energy": {
                const height = labV3Value("energyHeight", 20);
                const ballX = 45 + ((t * 55) % Math.max(100, w - 90));
                const ballY = h - 35 - Math.min(130, height * 1.3) *
                    Math.abs(Math.sin(t * 1.5));

                line(30, h - 25, cx, 35, "#94a3b8", 5);
                line(cx, 35, w - 30, h - 25, "#94a3b8", 5);
                circle(ballX, ballY, 12, "#f59e0b");

                label("Ep = " +
                    (labV3Value("energyMass", 5) * 9.81 * height).toFixed(0) + " J",
                    20, 25, "#4ade80");
                break;
            }

            case "electrostatics": {
                const q1 = labV3Value("chargeOne", 5);
                const q2 = labV3Value("chargeTwo", -5);

                circle(cx - 90, cy, 24, q1 >= 0 ? "#ef4444" : "#3b82f6");
                circle(cx + 90, cy, 24, q2 >= 0 ? "#ef4444" : "#3b82f6");

                label(q1 > 0 ? "+" : q1 < 0 ? "−" : "0", cx - 98, cy + 8);
                label(q2 > 0 ? "+" : q2 < 0 ? "−" : "0", cx + 82, cy + 8);

                for (let i = -3; i <= 3; i++) {
                    const y = cy + i * 18;
                    line(cx - 60, y, cx + 60, y,
                        q1 * q2 < 0 ? "#fbbf24" : "#a78bfa", 1.5);
                }

                label(q1 * q2 < 0 ? "PRZYCIĄGANIE" : "ODPYCHANIE",
                    cx - 50, 25, "#fbbf24");
                break;
            }

            case "fluids": {
                const depth = labV3Value("fluidDepth", 5);
                const waterHeight = Math.min(150, Math.max(15, depth * 7));

                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 3;
                ctx.strokeRect(cx - 85, 25, 170, 165);

                ctx.fillStyle = "#1479bd";
                ctx.fillRect(cx - 82, 187 - waterHeight, 164, waterHeight);

                const floating = Math.sin(t * 2) * 5;
                ctx.fillStyle = "#f59e0b";
                ctx.fillRect(cx - 18, 120 + floating, 36, 30);

                line(cx + 35, 130, cx + 35, 85, "#4ade80", 3);
                label("SIŁA WYPORU", 20, 22, "#4ade80");
                break;
            }

            case "measurements": {
                const tool = $lab("measureTool")?.value || "ruler";
                const value = labV3Value("measureValue", 250);

                line(25, cy, w - 25, cy, "#fbbf24", 4);

                for (let i = 0; i <= 20; i++) {
                    const x = 25 + (w - 50) * i / 20;
                    line(x, cy - 10, x, cy + (i % 5 === 0 ? 15 : 5),
                        "#e2e8f0", 1);
                }

                label("PRZYRZĄD: " + tool.toUpperCase(), 20, 25);
                label("WARTOŚĆ: " + value, 20, h - 15, "#4ade80");
                break;
            }
        }
    }

    function labV3Animate() {
        if (!animationRunning) return;

        animationTime += 0.035;
        labV3DrawAnimation(activeAnimationModule);

        animationFrame = requestAnimationFrame(labV3Animate);
    }

    // Wykres modelowy: parametr na osi X i odpowiadający mu wynik na osi Y.
    function labV3GraphFunction(module, x) {
        switch (module) {
            case "optics": {
                const f = Math.max(0.1, labV3Value("opticFocal", 20));
                const denominator = x - f;
                return Math.abs(denominator) < 0.5 ? null : x * f / denominator;
            }
            case "mechanics":
                return (labV3Value("mechForce", 50) -
                    labV3Value("mechFriction", 10) -
                    labV3Value("mechMass", 10) * 9.81 *
                    Math.sin(labV3Value("mechAngle", 10) * Math.PI / 180)) /
                    Math.max(1, x);
            case "thermal":
                return labV3Value("thermalMass", 2) * 4200 *
                    (labV3Value("thermalEnd", 60) - x);
            case "waves":
                return 343 / Math.max(1, x);
            case "magnetism":
                return 100 / Math.max(1, x * x);
            case "energy":
                return labV3Value("energyMass", 5) * 9.81 * x;
            case "electrostatics":
                return 8.99e9 * Math.abs(
                    labV3Value("chargeOne", 5) * 1e-6 *
                    labV3Value("chargeTwo", -5) * 1e-6
                ) / Math.pow(Math.max(1, x) / 100, 2);
            case "fluids":
                return 1000 * 9.81 * x;
            case "measurements":
                return x;
            default:
                return 0;
        }
    }

    function labV3DrawGraph(module) {
        const surface = labV3Canvas("labV3Graph");
        if (!surface) return;

        const { ctx, width: w, height: h } = surface;
        const left = 42;
        const right = w - 15;
        const top = 15;
        const bottom = h - 30;

        ctx.fillStyle = "#0b1422";
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(148,163,184,0.2)";
        ctx.lineWidth = 1;

        for (let i = 0; i <= 5; i++) {
            const y = top + (bottom - top) * i / 5;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = "#94a3b8";
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.stroke();

        const ranges = {
            optics: [5, 120],
            mechanics: [1, 100],
            thermal: [-20, 100],
            waves: [1, 2000],
            magnetism: [1, 30],
            energy: [0, 100],
            electrostatics: [1, 50],
            fluids: [0, 20],
            measurements: [1, 1000]
        };

        const [min, max] = ranges[module] || [0, 100];
        const samples = [];

        for (let i = 0; i <= 60; i++) {
            const x = min + (max - min) * i / 60;
            const y = labV3GraphFunction(module, x);
            if (Number.isFinite(y)) samples.push({ x, y });
        }

        const maxY = Math.max(1, ...samples.map(p => Math.abs(p.y)));
        const minY = Math.min(0, ...samples.map(p => p.y));
        const spanY = Math.max(1, maxY - minY);

        ctx.beginPath();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.5;

        let started = false;

        for (const point of samples) {
            const px = left + (point.x - min) / (max - min) * (right - left);
            const py = bottom - (point.y - minY) / spanY * (bottom - top);

            if (!Number.isFinite(py)) {
                started = false;
                continue;
            }

            if (!started) {
                ctx.moveTo(px, py);
                started = true;
            } else {
                ctx.lineTo(px, py);
            }
        }

        ctx.stroke();

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "11px Arial";
        ctx.fillText("Parametr", right - 48, h - 7);
        ctx.fillText("Wynik", 5, 12);
    }

    function labV3Explain(module) {
        const messages = {
            optics: "Ogniskowa i odległość przedmiotu decydują o położeniu oraz rodzaju obrazu. Gdy przedmiot znajduje się w ognisku, obraz powstaje w nieskończoności.",
            mechanics: "Przyspieszenie zależy od siły wypadkowej i masy. Zwiększenie masy przy tej samej sile zmniejsza przyspieszenie.",
            thermal: "Energia cieplna zależy od masy, ciepła właściwego i zmiany temperatury: Q = mcΔT.",
            waves: "Prędkość fali jest iloczynem częstotliwości i długości fali: v = fλ.",
            magnetism: "Jednakowe bieguny magnetyczne się odpychają, a przeciwne przyciągają.",
            energy: "Energia potencjalna grawitacji zależy od masy, przyspieszenia ziemskiego i wysokości: Ep = mgh.",
            electrostatics: "Prawo Coulomba opisuje siłę między ładunkami. Siła maleje z kwadratem odległości.",
            fluids: "Ciśnienie hydrostatyczne zależy od gęstości cieczy, przyspieszenia ziemskiego i głębokości: p = ρgh.",
            measurements: "Niepewność pomiaru zależy między innymi od rozdzielczości przyrządu."
        };

        const element = $lab("labV3Explanation");
        if (element) element.textContent = messages[module] || "";
    }

    // Podmieniamy renderery – po ich wykonaniu dodajemy rozszerzenie.
    for (const module of Object.keys(oldRenderers)) {
        const original = oldRenderers[module];
        if (typeof original !== "function") continue;

        window[{
            optics: "renderOptics",
            mechanics: "renderMechanics",
            thermal: "renderThermal",
            waves: "renderWaves",
            magnetism: "renderMagnetism",
            energy: "renderEnergy",
            electrostatics: "renderElectrostatics",
            fluids: "renderFluids",
            measurements: "renderMeasurements"
        }[module]] = function (workspace) {
            animationRunning = false;
            animationTime = 0;

            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = null;

            original(workspace);
            labV3Enhance(module);
        };
    }

    // Zachowujemy wszystkie dotychczasowe obliczenia.
    window.updateLabSimulation = function (name) {
        if (typeof oldUpdate === "function") {
            oldUpdate(name);
        }

        if (!name || name === "electronics") return;

        labV3DrawGraph(name);
        labV3DrawAnimation(name);
        labV3Explain(name);
    };

    // Po zmianie rozmiaru okna dopasuj wykres i animację.
    window.addEventListener("resize", () => {
        const module = window.labCurrentModule;
        if (!module || !labV3Tasks[module]) return;

        labV3DrawGraph(module);
        labV3DrawAnimation(module);
    });

})();

// =============================================
// PHYSICS – LOSOWANIE PYTAŃ BEZ POWTÓREK
// =============================================

const PHYSICS_HISTORY_KEY = "physics_question_history_v2";

function physicsGetHistory() {
    try {
        return JSON.parse(localStorage.getItem(PHYSICS_HISTORY_KEY)) || {};
    } catch {
        return {};
    }
}

function physicsSaveHistory(history) {
    localStorage.setItem(
        PHYSICS_HISTORY_KEY,
        JSON.stringify(history)
    );
}

function physicsShuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

function selectFreshQuestions(pool, requestedCount) {
    if (!Array.isArray(pool) || pool.length === 0) return [];

    const count = Math.min(
        Math.max(0, Number(requestedCount) || 0),
        pool.length
    );

    if (!count) return [];

    const history = physicsGetHistory();

    // Grupowanie pytań według tematu
    const topics = {};

    pool.forEach(question => {
        const topic = question.topic || "inne";

        if (!topics[topic]) topics[topic] = [];

        topics[topic].push(question);
    });

    // Usuń z historii identyfikatory, których nie ma już w bazie
    Object.keys(topics).forEach(topic => {
        const validIds = new Set(topics[topic].map(q => q.id));

        history[topic] = (history[topic] || [])
            .filter(id => validIds.has(id));
    });

    const selected = [];
    const selectedIds = new Set();

    while (selected.length < count) {
        const available = [];

        Object.entries(topics).forEach(([topic, questions]) => {
            const used = new Set(history[topic] || []);

            questions.forEach(question => {
                if (
                    !used.has(question.id) &&
                    !selectedIds.has(question.id)
                ) {
                    available.push(question);
                }
            });
        });

        // Cała pula została wykorzystana – zaczynamy nowy cykl
        if (available.length === 0) {
            Object.keys(topics).forEach(topic => {
                history[topic] = [];
            });

            selectedIds.clear();

            // Nie powtarzaj pytań z bieżącej rozgrywki
            selected.forEach(question => {
                if (!history[question.topic]) {
                    history[question.topic] = [];
                }

                history[question.topic].push(question.id);
            });

            continue;
        }

        const question = physicsShuffle(available)[0];

        selected.push(question);
        selectedIds.add(question.id);

        if (!history[question.topic]) {
            history[question.topic] = [];
        }

        history[question.topic].push(question.id);
    }

    physicsSaveHistory(history);

    return physicsShuffle(selected);
}

// Reset historii – do testowania
function physicsResetQuestionHistory() {
    localStorage.removeItem(PHYSICS_HISTORY_KEY);
    console.log("Historia pytań wyczyszczona.");
}
// ==========================================
// PHYSICS – NATYCHMIASTOWE KOŃCZENIE PYTANIA
// ==========================================

function physicsCheckAllAnswered() {
    if (!players || players.length === 0) return false;

    const allAnswered = players.every(player =>
        player.currentAnswer !== null &&
        player.currentAnswer !== undefined
    );

    if (allAnswered) {
        if (typeof revealQuestion === "function") {
            revealQuestion();
        }
        return true;
    }

    return false;
}
