import p5 from "p5";
import { ClientToServerEvents, ServerToClientEvents, WordData } from "shared";
import { io, Socket } from "socket.io-client";

// constants
const NUM_BANDS = 5;
const WORD_SPACING = 0.1;
const WORD_LIST = await fetch("words.json").then((res) => res.json());

// {{{ socket setup
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  "localhost:3000",
  { autoConnect: false }
);

// sessions (in case of refreshes/disconnects)
socket.on("session", (sessionId: string) => {
  socket.auth = { sessionId };
  sessionStorage.setItem("sessionId", sessionId);
});

const sessionId = sessionStorage.getItem("sessionId");
if (sessionId) socket.auth = { sessionId };
socket.connect();

// }}}

// {{{ UI stuff
const createGameButton = document.getElementById(
  "create-game"
)! as HTMLButtonElement;
const joinGameButton = document.getElementById(
  "join-game"
)! as HTMLButtonElement;
const readyButton = document.getElementById(
  "ready-button"
)! as HTMLButtonElement;
const gameCodeDiv = document.getElementById("game-code")! as HTMLDivElement;
const gameStatusDiv = document.getElementById("game-status")! as HTMLDivElement;

const myCanvasDiv = document.getElementById("mine")! as HTMLDivElement;
const opponentCanvasDiv = document.getElementById(
  "opponent"
)! as HTMLDivElement;
// }}}

let gameStage:
  | "before"
  | "waitingOpponent"
  | "waitingStart"
  | "playing"
  | "gameOver" = "before";

let ownselfReady = false;
let opponentReady = false;

// {{{ Change state functions (very ugly plz don't look i should've used some ui framework or at least jquery i know)
function toWaitingOppState(): void {
  gameStage = "waitingOpponent";
  joinGameButton.hidden = true;
  createGameButton.hidden = true;
  gameStatusDiv.innerText = "Waiting for opponent to join";
  ownselfReady = false;
  opponentReady = false;
  myCanvasDiv.hidden = true;
  opponentCanvasDiv.hidden = true;
}

function toWaitingStartState(): void {
  gameStage = "waitingStart";
  joinGameButton.hidden = true;
  createGameButton.hidden = true;
  readyButton.hidden = false;
  gameStatusDiv.innerText = "Game will start when both players are ready";
  ownselfReady = false;
  opponentReady = false;
  myCanvasDiv.hidden = true;
  opponentCanvasDiv.hidden = true;
}

function toGameStartedState(): void {
  gameStage = "playing";
  joinGameButton.hidden = true;
  createGameButton.hidden = true;
  readyButton.hidden = true;
  gameStatusDiv.innerText = "Game started!";
  ownselfReady = false;
  opponentReady = false;
  myCanvasDiv.hidden = false;
  opponentCanvasDiv.hidden = false;
}

function toGameOverState(isWin: boolean): void {
  gameStage = "gameOver";
  joinGameButton.hidden = true;
  createGameButton.hidden = true;
  readyButton.hidden = true;
  gameCodeDiv.hidden = true;
  gameStatusDiv.innerText = isWin ? "You Won!" : "You lost... L";
  ownselfReady = false;
  opponentReady = false;
  myCanvasDiv.hidden = true;
  opponentCanvasDiv.hidden = true;
}
// }}}

// {{{ Button event listeners
createGameButton.onclick = () => {
  socket.emit("createGame", (gameCode) => {
    gameCodeDiv.innerText = `Game code: ${gameCode}`;
    toWaitingOppState();
  });
};

joinGameButton.onclick = () => {
  const gameCode = prompt("Game code");

  if (gameCode == null) return;

  if (!gameCode) {
    alert("Please enter a code.");
    return;
  }

  socket.emit("joinGame", gameCode.trim(), (err) => {
    if (err == false) {
      // successfully joined game
      gameCodeDiv.innerText = `Game code: ${gameCode}`;
      toWaitingStartState();
      console.log("joining game", gameCode);
    } else {
      alert(`Error: ${err}`);
    }
  });
};

readyButton.onclick = () => {
  ownselfReady = true;
  readyButton.disabled = true;

  if (opponentReady) {
    // opponent also ready, start the game
    socket.emit("start");
  } else {
    // inform opponent that we're ready
    socket.emit("ready");
  }
};
// }}}

// {{{ socket listeners
socket.on("getReady", () => {
  toWaitingStartState();
});

socket.on("opponentReady", () => {
  console.log("opponentReady");
  opponentReady = true;
  if (ownselfReady) {
    // start game
    socket.emit("start");
  } else {
    gameStatusDiv.innerText = "Game will start when you click ready";
  }
});

socket.on("start", () => {
  // yay game has finally started
  toGameStartedState();
});

socket.on("opponentDied", () => {
  toGameOverState(true);
});
// }}}

// {{{ actual p5.js stuff
function createP5(isOpponent: boolean): p5 {
  return new p5(
    (s: p5) => {
      let myFont!: p5.Font;

      let playerInput = "";
      let currWord: WordData | null = null;
      let opponentInput = "";

      const words: WordData[][] = [];
      let health = 5;
      const speed = 0.001;

      const opponentWordsQueue: string[] = [];

      // {{{ helper functions
      function newWord(opts?: Partial<WordData>): WordData {
        const oppWord = opponentWordsQueue.shift();
        return {
          word:
            opts?.word ?? oppWord ?? (s.random(WORD_LIST) as unknown as string),
          relxpos: opts?.relxpos ?? 1 + s.random(-WORD_SPACING, WORD_SPACING),
          band: opts?.band ?? randomInt(0, NUM_BANDS - 1),
          fromOpponent: opts?.fromOpponent ?? oppWord != undefined,
        };
      }
      function ypos(band: number): number {
        return s.map(
          band,
          NUM_BANDS,
          0,
          s.height / NUM_BANDS,
          ((NUM_BANDS - 1) / NUM_BANDS) * s.height
        );
      }
      function xpos(relxpos: number): number {
        return relxpos * s.width;
      }
      function setPlayerInput(inpt: string): void {
        if (isOpponent) return;
        playerInput = inpt;
        console.log("setting player input", inpt);
        socket.emit("input", inpt);
      }
      /// ranges are inclusive
      function randomInt(min: number, max: number): number {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      function clearWord(word: string): void {
        console.log("clear word: ", word);
        // search for the first occurance of the word
        for (let i = 0; i < NUM_BANDS; i++) {
          const idx = words[i].findIndex((v) => v.word == word);
          if (idx != -1) {
            currWord = null;
            words[i].splice(idx, 1); // splice is in place
            socket.emit("clearedWord", word);
            return;
          }
        }
        console.error("invalid cleared word");
      }
      function fillInitialWords(): void {
        // initially fill the words array
        for (let i = 0; i < NUM_BANDS; i++) {
          if (isOpponent) {
            words[i] = [];
          } else {
            const nw = newWord({ band: i });
            words[i] = [nw];
            socket.emit("newWord", nw);
          }
        }
      }
      // }}}

      socket.on("start", fillInitialWords);

      // receive info from opponent
      if (isOpponent) {
        socket.on("newWord", (wordData) => {
          words[wordData.band].push(wordData);
        });

        socket.on("input", (input) => {
          opponentInput = input;
        });

        socket.on("opponentClearedWord", (word) => {
          opponentWordsQueue.push(word); // might be a bit confusing cuz this one is actually for the top screen but eh this works
          clearWord(word);
        });
      }

      // {{{ preload
      s.preload = () => {
        myFont = s.loadFont("RobotoMono-Regular.ttf");
      };
      // }}}

      // {{{ setup
      s.setup = () => {
        s.createCanvas(s.windowWidth, s.windowHeight / 2);
        s.background(0);
        s.textAlign(s.LEFT, s.TOP);
        s.textFont(myFont);
      };
      // }}}

      // {{{ draw
      s.draw = () => {
        s.background(200);

        if (gameStage == "playing") {
          // draw health
          s.fill("black");
          s.text(`Health: ${health}`, 0, 0);

          // add random new words in own game
          if (!isOpponent) {
            // for (let i = 0; i < NUM_BANDS; i++) {
            //   const word = words[i][words[i].length - 1];
            //   if (
            //     s.width -
            //       xpos(word.relxpos) -
            //       (myFont.textBounds(word.word, 0, 0) as any).w >
            //     s.width * WORD_SPACING + 5
            //   ) {
            //     const nw = newWord({ band: i });
            //     words[i].push(nw);
            //     // inform opponent that new word was added
            //     socket.emit("newWord", nw);
            //   }
            // }
          }

          // update word positions
          for (let i = 0; i < NUM_BANDS; i++) {
            for (const word of words[i]) {
              word.relxpos -= speed;
            }
          }

          // draw words
          for (let i = 0; i < NUM_BANDS; i++) {
            for (const word of words[i]) {
              s.fill(word.fromOpponent ? "red" : "black").noStroke();
              console.assert(word.band == i);
              s.text(word.word, xpos(word.relxpos), ypos(word.band));
            }
          }

          // draw currently typing word
          if (currWord != null) {
            s.fill("blue");
            // console.log(currWord);
            s.text(playerInput, xpos(currWord.relxpos), ypos(currWord.band));
          }

          // check if word has reached the end
          for (let i = 0; i < NUM_BANDS; i++) {
            for (const word of words[i]) {
              if (word.relxpos < 0) {
                console.log(`${word.word} reached end`);
                health--;
                if (health <= 0) {
                  socket.emit("iDiedSadge");
                  toGameOverState(false);
                  break;
                }
              }
            }
            words[i] = words[i].filter((x) => x.relxpos >= 0);
          }
        }
      };
      // }}}

      // {{{ keyTyped
      s.keyTyped = () => {
        if (gameStage != "playing") return;
        if (isOpponent) return;

        console.log("keyTyped", s.key);

        if (currWord == null) {
          // search for a word to set as current word
          const allWords = words.flat();
          allWords.sort((x, y) => x.relxpos - y.relxpos);
          currWord =
            allWords.find((word) => word.word.startsWith(s.key)) ?? null;
          setPlayerInput(s.key);
        } else {
          // see if can continue from current word
          const toType = currWord.word.replace(
            new RegExp(`^${playerInput}`),
            ""
          ); // remove prefix
          if (toType.startsWith(s.key)) {
            // can continue typing
            setPlayerInput(playerInput + s.key);
          }

          // check if word is cleared
          if (playerInput == currWord.word) {
            setPlayerInput("");
            socket.emit("clearedWord", currWord.word);
            clearWord(currWord.word);
          }
        }
      };
      // }}}

      // keyPressed {{{
      s.keyPressed = () => {
        if (s.keyCode == s.BACKSPACE) {
          currWord = null;
        }
      };
      // }}}
    },
    isOpponent ? opponentCanvasDiv : myCanvasDiv
  );
}
// }}}

createP5(false);
createP5(true);
