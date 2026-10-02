import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, KeyRound, LayoutGrid, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getActiveIntegrityRecord, recordIntegrityEvent } from "../services/api";
import logo from "../assets/images/logo.png";

export default function StudentLayout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const previousPath = useRef(location.pathname);
  const authRef = useRef({ token, userId: user?._id });

  useEffect(() => {
    if (token && user?._id) authRef.current = { token, userId: user._id };
  }, [token, user?._id]);

  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = location.pathname;
    const match = previous.match(/^\/play\/(quiz|live|game)\/([^/]+)$/);
    if (!match || location.pathname === previous) return;
    const [, kind, quizId] = match;
    const { token: activeToken, userId } = authRef.current;
    if (!activeToken || !userId) return;

    const record = getActiveIntegrityRecord();
    if (!record || record.quizId !== quizId || (kind === "quiz") !== (record.kind === "scheduled")) return;

    recordIntegrityEvent(activeToken, record.attemptId, {
      sessionId: record.sessionId,
      type: "PAGE_LEFT",
      clientTimestamp: new Date().toISOString(),
      duration: 0,
    }).then((result) => {
      if (result.success) navigate(previous, { replace: true });
    }).catch(() => {
      // Route departure must not break navigation; the active record remains server-guarded.
    });
  }, [location.pathname]);

  return (
    <div className="mesh min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-extrabold tracking-tight text-slate-900">ARK-QUIZES</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink
              to="/play"
              end
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm transition ${isActive ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:text-slate-900"}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/play/join"
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm transition ${isActive ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:text-slate-900"}`
              }
            >
              Join quiz
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.name}</span>
            <button
              className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut size={16} />
            </button>
            <button className="rounded-xl border border-slate-200 bg-slate-50 p-2 md:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-200 px-4 py-3 md:hidden">
            <NavLink to="/play" className="flex items-center gap-2 py-2 text-sm text-slate-600" onClick={() => setOpen(false)}>
              <LayoutGrid size={14} /> Home
            </NavLink>
            <NavLink to="/play/join" className="flex items-center gap-2 py-2 text-sm text-slate-600" onClick={() => setOpen(false)}>
              <KeyRound size={14} /> Join quiz
            </NavLink>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
