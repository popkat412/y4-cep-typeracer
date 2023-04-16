// actual types
export enum JoinGameError {
  RoomDoesntExist = "Room doens't exist",
  RoomFull = "Room full",
}

export interface WordData {
  word: string;
  relxpos: number; // percentage w.r.t to the width
  band: number;
  fromOpponent: boolean;
}

// socket types
export interface ServerToClientEvents {
  session: (sessionId: string) => void;

  getReady: () => void;
  opponentReady: () => void;
  start: () => void;
  opponentAckStart: () => void;

  newWord: (word: WordData) => void; // word goes to bottom (opponent) screen
  input: (input: string) => void;
  opponentClearedWord: (word: string) => void; // word goes to top screen
  opponentDied: () => void;

  playAgain: () => void;

  opponentLeft: () => void;
}

export interface ClientToServerEvents {
  createGame: (callback: (gameCode: string) => void) => void;
  joinGame: (
    gameCode: string,
    callback: (err: JoinGameError | false) => void
  ) => void;
  start: () => void;
  ackStart: () => void;
  ready: () => void;

  newWord: (word: WordData) => void;
  input: (input: string) => void;
  clearedWord: (word: string) => void;

  iDiedSadge: () => void;

  playAgain: () => void;
}

export interface InterServerEvents { }

export interface SocketData {
  sessionId?: string;
  gameId?: string;
}
