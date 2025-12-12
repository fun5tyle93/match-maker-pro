import { TrainingSession, League } from '@/types';

const SESSIONS_KEY = 'kicker_sessions';
const LEAGUES_KEY = 'kicker_leagues';
const CURRENT_SESSION_KEY = 'kicker_current_session';
const HISTORY_KEY = 'kicker_history';

export const saveSessions = (sessions: TrainingSession[]): void => {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
};

export const loadSessions = (): TrainingSession[] => {
  const data = localStorage.getItem(SESSIONS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveCurrentSession = (session: TrainingSession | null): void => {
  if (session) {
    localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  }
};

export const loadCurrentSession = (): TrainingSession | null => {
  const data = localStorage.getItem(CURRENT_SESSION_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveLeagues = (leagues: League[]): void => {
  localStorage.setItem(LEAGUES_KEY, JSON.stringify(leagues));
};

export const loadLeagues = (): League[] => {
  const data = localStorage.getItem(LEAGUES_KEY);
  return data ? JSON.parse(data) : [];
};

// Training History
export const saveToHistory = (session: TrainingSession): void => {
  const history = loadHistory();
  const existingIndex = history.findIndex(s => s.id === session.id);
  
  if (existingIndex >= 0) {
    history[existingIndex] = session;
  } else {
    history.unshift(session);
  }
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

export const loadHistory = (): TrainingSession[] => {
  const data = localStorage.getItem(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
};

export const deleteFromHistory = (sessionId: string): void => {
  const history = loadHistory();
  const filtered = history.filter(s => s.id !== sessionId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
};
