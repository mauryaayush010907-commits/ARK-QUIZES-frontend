import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") || "";
const API_ROOT = API_URL ? `${API_URL.replace(/\/api$/i, "")}/api` : "";
const SOCKET_URL = API_URL.replace(/\/api$/i, "");
export const remoteApiEnabled = Boolean(API_ROOT);

const sockets = new Map();
const sessionIds = new Map();
const ACTIVE_ATTEMPT_KEY = "ARK-QUIZES.active-remote-attempt";

function configurationError() {
  return new Error("Backend API is not configured. Set VITE_API_URL to https://ark-quizes.onrender.com and restart the frontend.");
}

function apiError(message, status, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.extra = extra;
  return error;
}

async function request(endpoint, { token, method = "GET", body } = {}) {
  const verb = method.toUpperCase();
  if (!API_ROOT) throw configurationError();

  let response;
  try {
    response = await fetch(`${API_ROOT}${endpoint}`, {
      method: verb,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    const message = `${verb} ${endpoint} network error: ${cause.message || "Unable to reach the API"}`;
    console.error(`[API] ${message}`);
    throw new Error(message, { cause });
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      if (response.ok) {
        const message = `${verb} ${endpoint} returned invalid JSON (HTTP ${response.status})`;
        console.error(`[API] ${message}`);
        throw apiError(message, response.status);
      }
    }
  }

  if (!response.ok) {
    const message = `${verb} ${endpoint} failed (${response.status}): ${data?.message || response.statusText || "Request failed"}`;
    console.error(`[API] ${message}`);
    throw apiError(message, response.status, data?.code ? { code: data.code } : {});
  }
  return data;
}

function queryString(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function socketFor(token) {
  if (!SOCKET_URL) throw configurationError();
  let socket = sockets.get(token);
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false, auth: { token } });
    sockets.set(token, socket);
    socket.connect();
  } else if (!socket.connected && !socket.active) {
    socket.connect();
  }
  return socket;
}

function socketRequest(token, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const socket = socketFor(token);
    socket.timeout(10000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        const message = `Socket event ${event} timed out. Check the live API connection and try again.`;
        console.error(`[Socket.IO] ${message}`);
        reject(new Error(message));
        return;
      }
      if (!response?.ok) {
        const message = `Socket event ${event} failed: ${response?.message || "Live request failed"}`;
        console.error(`[Socket.IO] ${message}`);
        reject(apiError(message, undefined, response?.code ? { code: response.code } : {}));
        return;
      }
      resolve(response);
    });
  });
}

export function subscribeRemoteEvents(token, quizId, handler, admin = false) {
  const socket = socketFor(token);
  const listener = (event, payload) => {
    if (payload?.quizId && String(payload.quizId) !== String(quizId)) return;
    handler({ event, payload });
  };
  socket.onAny(listener);
  socketRequest(token, admin ? "quiz:adminJoin" : "quiz:join", { quizId }).catch(() => {});
  return () => socket.offAny(listener);
}

export function disconnectApiSocket(token) {
  const socket = sockets.get(token);
  if (!socket) return;
  socket.disconnect();
  sockets.delete(token);
}

function setActiveAttempt(attempt) {
  try {
    sessionStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // Active-page integrity monitoring continues if session storage is unavailable.
  }
}

export function getActiveIntegrityRecord() {
  try {
    return JSON.parse(sessionStorage.getItem(ACTIVE_ATTEMPT_KEY) || "null");
  } catch {
    return null;
  }
}

export function getQuizSessionId(quizId) {
  if (sessionIds.has(quizId)) return sessionIds.get(quizId);
  const key = `ARK-QUIZES.integrity-session.${quizId}`;
  try {
    const existing = sessionStorage.getItem(key);
    const navigationType = performance.getEntriesByType("navigation")[0]?.type;
    const id = existing && navigationType === "reload"
      ? existing
      : globalThis.crypto?.randomUUID?.() || `quiz-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, id);
    sessionIds.set(quizId, id);
    return id;
  } catch {
    const id = globalThis.crypto?.randomUUID?.() || `quiz-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIds.set(quizId, id);
    return id;
  }
}

export function login(credentials) {
  return request("/auth/login", { method: "POST", body: credentials });
}

export function register(payload) {
  return request("/auth/register", { method: "POST", body: payload });
}

export async function getSessionUser(token) {
  return (await request("/auth/me", { token })).user;
}

export function listQuizzes(token, query = {}) {
  return request(`/quizzes${queryString(query)}`, { token });
}

export function createQuiz(token, data) {
  return request("/quizzes", { token, method: "POST", body: data });
}

export function updateQuiz(token, id, data) {
  return request(`/quizzes/${id}`, { token, method: "PUT", body: data });
}

export function deleteQuiz(token, id) {
  return request(`/quizzes/${id}`, { token, method: "DELETE" });
}

export function duplicateQuiz(token, id) {
  return request(`/quizzes/${id}/duplicate`, { token, method: "POST" });
}

export function getQuiz(token, id) {
  return request(`/quizzes/${id}`, { token });
}

export function lookupByCode(code, token) {
  return request(`/quizzes/lookup${queryString({ code })}`, { token });
}

export function listQuestions(token, quizId) {
  return request(`/quizzes/${quizId}/questions`, { token });
}

export function addQuestion(token, quizId, data) {
  return request(`/quizzes/${quizId}/questions`, { token, method: "POST", body: data });
}

export function updateQuestion(token, id, data) {
  return request(`/questions/${id}`, { token, method: "PUT", body: data });
}

export function deleteQuestion(token, id) {
  return request(`/questions/${id}`, { token, method: "DELETE" });
}

export function duplicateQuestion(token, id) {
  return request(`/questions/${id}/duplicate`, { token, method: "POST" });
}

export function reorderQuestions(token, quizId, orderedIds) {
  return request(`/quizzes/${quizId}/questions/reorder`, { token, method: "PATCH", body: { orderedIds } });
}

export function importQuestions(token, quizId, items) {
  return request(`/quizzes/${quizId}/questions/import`, { token, method: "POST", body: { items } });
}

export async function joinQuiz(token, data) {
  const result = await request("/quizzes/join", { token, method: "POST", body: data });
  if (result.participant?._id) {
    setActiveAttempt({
      kind: "live",
      quizId: String(result.quiz._id),
      attemptId: String(result.participant._id),
      sessionId: getQuizSessionId(String(result.quiz._id)),
    });
  }
  return result;
}

export function listParticipants(token, quizId, query = {}) {
  return request(`/quizzes/${quizId}/participants${queryString(query)}`, { token });
}

export function listTeams(token, quizId) {
  return request(`/quizzes/${quizId}/teams`, { token });
}

export function searchPeople(token, query = {}) {
  return request(`/admin/people${queryString(query)}`, { token });
}

export function getQuizIntegrity(token, quizId) {
  return request(`/quizzes/${quizId}/integrity`, { token });
}

export function getOwnIntegrity(token, quizId) {
  return request(`/quizzes/${quizId}/my-integrity`, { token });
}

export function getIntegritySnapshot(token, attemptId) {
  return request(`/attempts/${attemptId}/integrity`, { token });
}

export function heartbeatIntegrity(token, attemptId, sessionId) {
  return request(`/attempts/${attemptId}/heartbeat`, { token, method: "POST", body: { sessionId } });
}

export async function recordIntegrityEvent(token, attemptId, payload) {
  const result = await request(`/attempts/${attemptId}/integrity-events`, { token, method: "POST", body: payload });
  return { ...result, lastViolation: result.violation };
}

export function heartbeat(token, quizId, sessionId = getQuizSessionId(quizId)) {
  return request(`/quizzes/${quizId}/heartbeat`, { token, method: "POST", body: { sessionId } });
}

export function startAttempt(token, quizId, sessionId = getQuizSessionId(quizId)) {
  return request(`/quizzes/${quizId}/start-attempt`, { token, method: "POST", body: { sessionId } }).then((data) => {
    setActiveAttempt({ kind: "scheduled", quizId: String(quizId), attemptId: String(data.attempt._id), sessionId });
    return {
      ...data,
      attempt: {
        ...data.attempt,
        startedAt: new Date(data.attempt.startedAt).getTime(),
        expiresAt: new Date(data.attempt.expiresAt).getTime(),
      },
    };
  });
}

export function saveScheduledAnswer(token, quizId, questionId, selectedOptionId, sessionId = getQuizSessionId(quizId)) {
  return request(`/quizzes/${quizId}/answer`, {
    token,
    method: "POST",
    body: { questionId, selectedOptionId, sessionId },
  });
}

export function submitAttempt(token, quizId, sessionId = getQuizSessionId(quizId)) {
  return request(`/quizzes/${quizId}/submit`, { token, method: "POST", body: { sessionId } }).then((result) => {
    const active = getActiveIntegrityRecord();
    if (active?.quizId === String(quizId)) sessionStorage.removeItem(ACTIVE_ATTEMPT_KEY);
    return result;
  });
}

export function getResults(token, quizId) {
  return request(`/quizzes/${quizId}/results`, { token });
}

export function getLeaderboard(token, quizId) {
  return request(`/quizzes/${quizId}/leaderboard`, { token });
}

export function openLobby(token, quizId) {
  return socketRequest(token, "quiz:openLobby", { quizId });
}

export function startLiveQuiz(token, quizId) {
  return socketRequest(token, "quiz:start", { quizId });
}

export function startQuestion(token, quizId, questionId) {
  return socketRequest(token, "quiz:question", { quizId, questionId });
}

export function pauseQuestion(token, quizId) {
  return socketRequest(token, "quiz:pauseQuestion", { quizId });
}

export function resumeQuestion(token, quizId) {
  return socketRequest(token, "quiz:resumeQuestion", { quizId });
}

export function endQuestion(token, quizId) {
  return socketRequest(token, "quiz:endQuestion", { quizId });
}

export function nextQuestion(token, quizId) {
  return socketRequest(token, "quiz:nextQuestion", { quizId });
}

export function endQuiz(token, quizId) {
  return socketRequest(token, "quiz:end", { quizId });
}

export function submitLiveAnswer(token, quizId, questionId, selectedOptionId, sessionId) {
  return socketRequest(token, "quiz:answer", { quizId, questionId, selectedOptionId, sessionId });
}

export function getLiveState(token, quizId) {
  return socketRequest(token, "quiz:state", { quizId }).then((result) => result.state);
}

export function adminOverview(token) {
  return request("/admin/analytics", { token }).then(({ overview, recent = [] }) => ({ ...overview, recent }));
}

export function analytics(token) {
  return request("/admin/analytics", { token });
}

export function quizAnalytics(token, quizId) {
  return request(`/admin/quizzes/${quizId}/analytics`, { token });
}

export function leaveQuiz(token, quizId) {
  return socketRequest(token, "quiz:leave", { quizId });
}
