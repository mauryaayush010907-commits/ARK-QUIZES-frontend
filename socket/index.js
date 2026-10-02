import { remoteApiEnabled, subscribeRemoteEvents } from "../services/api";

export function onQuizEvent(handler, { token, quizId, admin = false } = {}) {
  if (!remoteApiEnabled || !token || !quizId) return () => {};
  return subscribeRemoteEvents(token, quizId, handler, admin);
}

export function quizRoomName(quizId) {
  return `quiz:${quizId}`;
}
