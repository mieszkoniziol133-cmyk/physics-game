
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
        ["Jaka jest jednostka masy SI?", ["Gram", "Kilogram", "Newton", "Dżul"], 1, "Jednostką masy jest kilogram."]
    ],
    materia: [
        ["Z czego zbudowana jest materia?", ["Z atomów i cząsteczek", "Z fal", "Z próżni", "Z samej energii"], 0, "Materia składa się z atomów i cząsteczek."],
        ["Który stan ma stały kształt i objętość?", ["Gazowy", "Ciekły", "Stały", "Żaden"], 2, "Ciała stałe zachowują kształt i objętość."],
        ["Jak obliczamy gęstość?", ["m/V", "V/t", "F/s", "m·v"], 0, "Gęstość to masa podzielona przez objętość."],
        ["Jednostka gęstości SI to:", ["kg/m³", "N", "J", "W"], 0, "Jednostką jest kg/m³."],
        ["Przejście cieczy w gaz to:", ["Krzepnięcie", "Parowanie", "Topnienie", "Skraplanie"], 1, "To parowanie."],
        ["Co dzieje się z cząsteczkami podczas ogrzewania?", ["Poruszają się szybciej", "Znikają", "Zatrzymują się", "Zmieniają się w atomy"], 0, "Rośnie ich średnia energia ruchu."]
    ],
    cisnienie: [
        ["Jak obliczamy ciśnienie?", ["p=F/S", "p=m/V", "p=W/t", "p=s/t"], 0, "Ciśnienie to siła podzielona przez powierzchnię."],
        ["Jednostka ciśnienia to:", ["Dżul", "Paskal", "Wat", "Kilogram"], 1, "Jednostką jest paskal."],
        ["Co dzieje się z ciśnieniem w cieczy wraz z głębokością?", ["Maleje", "Rośnie", "Nie zmienia się", "Znika"], 1, "Ciśnienie rośnie wraz z głębokością."],
        ["Ciśnienie hydrostatyczne zależy od:", ["Głębokości i gęstości", "Koloru", "Kształtu naczynia", "Dźwięku"], 0, "p = ρgh."],
        ["Prawo Archimedesa opisuje:", ["Siłę wyporu", "Prędkość światła", "Moc", "Opór"], 0, "Opisuje siłę wyporu."],
        ["Dlaczego statek pływa?", ["Działa siła wyporu", "Nie ma masy", "Nie ma grawitacji", "Woda nie ma gęstości"], 0, "Siła wyporu równoważy ciężar."]
    ],
    ruch: [
        ["Jak obliczamy prędkość?", ["v=s/t", "v=F/m", "v=m/V", "v=W/t"], 0, "Prędkość to droga podzielona przez czas."],
        ["Jednostka prędkości SI to:", ["m/s", "kg", "N", "J"], 0, "Metr na sekundę."],
        ["Samochód pokonał 100 km w 2 h. Prędkość?", ["25 km/h", "50 km/h", "100 km/h", "200 km/h"], 1, "100/2 = 50 km/h."],
        ["Ruch jednostajny oznacza:", ["Stałą prędkość", "Brak drogi", "Stałą masę", "Brak czasu"], 0, "Prędkość jest stała."],
        ["Przyspieszenie opisuje:", ["Zmianę prędkości w czasie", "Zmianę masy", "Powierzchnię", "Ciężar"], 0, "To zmiana prędkości w czasie."],
        ["5 m/s przez 4 s to droga:", ["9 m", "20 m", "1,25 m", "40 m"], 1, "s = v × t = 20 m."]
    ],
    sily: [
        ["Jednostka siły to:", ["Dżul", "Newton", "Wat", "Kilogram"], 1, "Siłę mierzymy w niutonach."],
        ["Czym mierzymy siłę?", ["Termometrem", "Dynamometrem", "Stoperem", "Wagą"], 1, "Siłę mierzymy dynamometrem."],
        ["Przyspieszenie ziemskie wynosi około:", ["9,81 m/s²", "100 m/s²", "1 m/s", "300 km/s"], 0, "g ≈ 9,81 m/s²."],
        ["Druga zasada dynamiki Newtona:", ["F=m·a", "W=F·s", "P=W/t", "v=s/t"], 0, "Siła to masa razy przyspieszenie."],
        ["Tarcie:", ["Przeciwdziała ruchowi", "Zawsze przyspiesza", "Jest światłem", "Nie istnieje"], 0, "Tarcie przeciwdziała ruchowi."],
        ["Siła przyciągająca do Ziemi to:", ["Opór", "Ciężkości", "Sprężystości", "Nacisku"], 1, "To siła ciężkości."]
    ],
    praca_moc: [
        ["Praca mechaniczna to:", ["W=F·s", "m·v", "s/t", "F/m"], 0, "Praca to siła razy przesunięcie."],
        ["Jednostka pracy to:", ["Wat", "Dżul", "Niuton", "Metr"], 1, "Jednostką jest dżul."],
        ["Moc to:", ["Praca w czasie", "Siła", "Masa", "Droga"], 0, "Moc opisuje szybkość wykonywania pracy."],
        ["Jak obliczamy moc?", ["P=W·t", "P=W/t", "P=F·t", "P=s/t"], 1, "P = W/t."],
        ["600 J w 10 s to moc:", ["60 W", "6000 W", "610 W", "6 W"], 0, "600/10 = 60 W."],
        ["1 kW to:", ["10 W", "100 W", "1000 W", "10000 W"], 2, "1 kW = 1000 W."]
    ],
    energia: [
        ["Energię poruszającego się ciała nazywamy:", ["Kinetyczną", "Chemiczną", "Jądrową", "Cieplną"], 0, "To energia kinetyczna."],
        ["Energia potencjalna grawitacji zależy od:", ["Masy i wysokości", "Koloru", "Temperatury", "Kształtu"], 0, "Ep = mgh."],
        ["Zasada zachowania energii mówi, że:", ["Energia nie ginie", "Energia zawsze rośnie", "Energia znika", "Nie może się zmieniać"], 0, "Energia zmienia postać, ale nie ginie."],
        ["Rozciągnięta sprężyna ma energię:", ["Sprężystości", "Jądrową", "Dźwiękową", "Kinetyczną"], 0, "To energia potencjalna sprężystości."],
        ["Jednostka energii to:", ["N", "J", "m", "s"], 1, "Jednostką jest dżul."],
        ["Podczas spadania:", ["Ep zmienia się w Ek", "Energia znika", "Masa rośnie", "Prędkość maleje"], 0, "Energia potencjalna zmienia się w kinetyczną."]
    ],
    cieplo: [
        ["Ciepło przepływa samorzutnie:", ["Od cieplejszego do chłodniejszego", "Od zimnego do gorącego", "W górę", "Nie przepływa"], 0, "Od wyższej temperatury do niższej."],
        ["Podstawowa jednostka temperatury SI:", ["Kelwin", "Dżul", "Wat", "Niuton"], 0, "To kelwin."],
        ["Gaz przechodzący w ciecz ulega:", ["Parowaniu", "Skraplaniu", "Topnieniu", "Sublimacji"], 1, "To skraplanie."],
        ["Przewodnictwo cieplne to:", ["Przekazywanie energii przez kontakt", "Ruch planet", "Odbicie", "Przepływ prądu"], 0, "Energia jest przekazywana przez kontakt."],
        ["Dobrym przewodnikiem ciepła jest:", ["Miedź", "Styropian", "Drewno", "Wełna"], 0, "Miedź dobrze przewodzi ciepło."],
        ["Podczas ogrzewania większość ciał:", ["Rozszerza się", "Znika", "Traci masę", "Zatrzymuje cząsteczki"], 0, "Większość ciał rozszerza się."]
    ],
    elektrycznosc: [
        ["Jednostka natężenia prądu:", ["Amper", "Wolt", "Om", "Wat"], 0, "Natężenie mierzymy w amperach."],
        ["Jednostka napięcia:", ["Amper", "Wolt", "Om", "Dżul"], 1, "Napięcie mierzymy w woltach."],
        ["Jednostka oporu:", ["Om", "Wolt", "Amper", "Tesla"], 0, "Opór mierzymy w omach."],
        ["Prawo Ohma:", ["U=I·R", "F=m·a", "P=W/t", "v=s/t"], 0, "U = I × R."],
        ["Jednakowe bieguny magnesów:", ["Odpychają się", "Przyciągają", "Nie oddziałują", "Znikają"], 0, "Jednakowe bieguny się odpychają."],
        ["Amperomierz włączamy:", ["Szeregowo", "Równolegle", "Zamiast baterii", "Nie podłączamy"], 0, "Amperomierz włączamy szeregowo."]
    ],
    fale_optyka: [
        ["Częstotliwość to:", ["Liczba drgań w czasie", "Długość", "Masa", "Temperatura"], 0, "Liczba drgań na jednostkę czasu."],
        ["Jednostka częstotliwości:", ["Herc", "Metr", "Dżul", "Wat"], 0, "Jednostką jest herc."],
        ["Czy dźwięk rozchodzi się w próżni?", ["Nie", "Tak", "Tylko nocą", "Zawsze"], 0, "Dźwięk potrzebuje ośrodka."],
        ["Światło padające na lustro:", ["Odbija się", "Znika", "Zmienia się w dźwięk", "Zatrzymuje"], 0, "Światło odbija się od lustra."],
        ["Prędkość światła w próżni:", ["300 000 km/s", "300 km/s", "340 m/s", "30 km/h"], 0, "Około 300 000 km/s."],
        ["Soczewka skupiająca:", ["Skupia promienie", "Pochłania całe światło", "Wytwarza dźwięk", "Zmniejsza masę"], 0, "Skupia równoległe promienie w ognisku."]
    ]
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

    gameQuestions = selectFreshQuestions(
    allQuestions,
    Number($("questionCount").value)
);

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
