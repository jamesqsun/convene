"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Coffee,
  Compass,
  Heart,
  House,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Monitor,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { activities, defaultProfile } from "@/lib/catalog";
import {
  interests,
  communicationPlatforms,
  phoneSchema,
  type PlanContact,
  type Action,
  type AppState,
  type Hangout,
  type Mode,
  type Profile,
  type Availability,
} from "@/lib/domain";

type Tab =
  | "Overview"
  | "My plans"
  | "Availability"
  | "Connections"
  | "My profile";
const navigation = [
  { title: "Overview", icon: House },
  { title: "My plans", icon: CalendarDays },
  { title: "Availability", icon: Clock3 },
  { title: "Connections", icon: Users },
  { title: "My profile", icon: Settings2 },
] as const;
const modeLabel = (mode: Mode) =>
  mode === "in_person"
    ? "In person"
    : mode === "online"
      ? "Online"
      : "Either works";
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      className={`avatar ${large ? "large" : ""} color-${name.charCodeAt(0) % 4}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="convene-dialog-title"
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-header">
          <h2 id="convene-dialog-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function ConnectionArt() {
  return (
    <div className="connection-art" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="art-star star-one">✳</span>
      <span className="art-star star-two">✧</span>
      <div className="art-note">
        <Coffee size={17} /> a coffee, a connection.
      </div>
      <div className="portrait portrait-one">
        <svg viewBox="0 0 140 170">
          <path d="M10 170q4-73 61-71t61 71" fill="#627c58" />
          <rect x="56" y="86" width="31" height="38" rx="13" fill="#d8a079" />
          <ellipse cx="70" cy="66" rx="38" ry="45" fill="#edbc95" />
          <path
            d="M32 70Q17 14 59 14q59-17 50 55L93 38Q70 63 36 53z"
            fill="#473630"
          />
          <circle cx="57" cy="69" r="3" fill="#473630" />
          <circle cx="83" cy="69" r="3" fill="#473630" />
          <path
            d="M59 85q12 11 23-1"
            fill="none"
            stroke="#473630"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span>the coffee person</span>
      </div>
      <div className="portrait portrait-two">
        <svg viewBox="0 0 140 170">
          <path d="M7 170q8-65 64-65t63 65" fill="#8f77b5" />
          <rect x="57" y="86" width="30" height="34" rx="13" fill="#a65e40" />
          <ellipse cx="72" cy="66" rx="37" ry="44" fill="#c4845c" />
          <path
            d="M31 57Q20 10 69 11q49-8 46 51l-20-7-9-24q-10 27-55 26"
            fill="#302923"
          />
          <circle cx="58" cy="67" r="3" fill="#302923" />
          <circle cx="84" cy="67" r="3" fill="#302923" />
          <path
            d="M59 85q12 10 23-1"
            fill="none"
            stroke="#302923"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span>your next good friend</span>
      </div>
      <div className="art-match">
        <Heart size={18} fill="currentColor" />
      </div>
    </div>
  );
}

export function ConveneApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const [modal, setModal] = useState<"profile" | "availability" | null>(null);
  const [feedback, setFeedback] = useState<Hangout | null>(null);
  const [selected, setSelected] = useState<Hangout | null>(null);
  const [editingSlot, setEditingSlot] = useState<Availability | null>(null);
  const seenPlans = useRef<Set<string> | null>(null);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401) {
        setAuth(true);
        return;
      }
      if (!response.ok) throw new Error(body.message);
      const assigned = (body as AppState).hangouts.filter(
        (h) => h.status === "scheduled",
      );
      if (
        seenPlans.current &&
        assigned.some((h) => !seenPlans.current!.has(h.id))
      )
        setToast(
          "A time slot has been filled. Your new plan is ready in My plans.",
        );
      seenPlans.current = new Set(assigned.map((h) => h.id));
      setState(body);
      setAuth(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Convene.");
    }
  }, []);
  useEffect(() => {
    void reload();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [reload]);
  useEffect(() => {
    if (!state || busy || modal || auth) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 10000);
    return () => clearInterval(timer);
  }, [!!state, busy, modal, auth, reload]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function act(action: Action, success?: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = await response.json();
      if (response.status === 401) {
        setAuth(true);
        throw new Error("Your session expired. Please sign in again.");
      }
      if (!response.ok) throw new Error(body.message);
      setState(body.state);
      seenPlans.current = new Set(
        (body.state as AppState).hangouts
          .filter((h) => h.status === "scheduled")
          .map((h) => h.id),
      );
      setToast(body.notice || success || "Saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);
  async function signOut() {
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("logout");
      setModal(null);
      setFeedback(null);
      setSelected(null);
      setState(null);
      seenPlans.current = null;
      setAuth(true);
    } catch {
      setError("Could not sign out. Try again.");
    }
  }
  const startPlanning = () =>
    setModal(state?.profile ? "availability" : "profile");
  if (auth) return <AuthScreen onSuccess={reload} />;
  if (!state)
    return (
      <main className="loading-screen">
        <Brand />
        <h1>
          {error ? "Let's get connected." : "Making room for connection…"}
        </h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={reload}>
              Try again
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </main>
    );
  const upcoming = state.hangouts
    .filter((h) => h.status === "scheduled" && Date.parse(h.end) > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = state.hangouts.filter(
    (h) => h.status !== "cancelled" && Date.parse(h.end) <= Date.now(),
  );
  const blocks = state.availability.sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const hours = blocks.reduce(
    (sum, b) =>
      (b.status && b.status !== "pending") || Date.parse(b.end) <= Date.now()
        ? sum
        : sum +
          (Date.parse(b.end) - Math.max(Date.now(), Date.parse(b.start))) /
            3600000,
    0,
  );
  const friends = state.connections.filter((c) => c.status === "friend");
  const personFor = (h: Hangout) =>
    state.people.find((p) => h.participantIds.includes(p.id));
  const connectionFor = (id: string) =>
    state.connections.find((c) => c.otherId === id);

  function PlanCard({ hangout }: { hangout: Hangout }) {
    const activity = activities.find((a) => a.id === hangout.activityId)!;
    const person = personFor(hangout);
    const ended = Date.parse(hangout.end) <= Date.now();
    const reviewed = state!.feedback.some((f) => f.hangoutId === hangout.id);
    return (
      <article className="plan-card">
        <div className={`plan-cover ${activity.color}`}>
          <ActivityDrawing
            kind={
              activity.mode === "online"
                ? "online"
                : activity.interest === "Outdoors"
                  ? "outdoors"
                  : "coffee"
            }
          />
          <span className="cover-tag">
            {activity.mode === "online" ? (
              <Monitor size={13} />
            ) : (
              <MapPin size={13} />
            )}{" "}
            {modeLabel(activity.mode)}
          </span>
        </div>
        <div className="plan-card-body">
          <span className="eyebrow">
            {dateLabel(hangout.start)} · {timeLabel(hangout.start)}
          </span>
          <h3>{activity.name}</h3>
          <p>
            {activity.venue
              ? `${activity.venue.name} · Demo venue`
              : `${hangout.communicationPlatform || "Online"} · Arrange your room together`}
          </p>
          <div className="plan-person">
            <Avatar name={person?.name || "Friend"} />
            <span>
              With <strong>{person?.name || "a new friend"}</strong>
              {person?.seeded && <small>Demo person</small>}
            </span>
            <button
              className="icon-button"
              aria-label={`View ${activity.name}`}
              onClick={() => setSelected(hangout)}
            >
              <ArrowRight size={19} />
            </button>
          </div>
          {ended && !reviewed && (
            <button
              className="secondary full"
              onClick={() => setFeedback(hangout)}
            >
              How did it go? <ArrowRight size={16} />
            </button>
          )}
          {reviewed && (
            <span className="reviewed">
              <Check size={14} /> Feedback shared
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">YOUR LITTLE SOCIAL SPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ title, icon: Icon }) => (
            <button
              key={title}
              aria-label={title}
              title={title}
              className={`nav-item ${tab === title ? "active" : ""}`}
              onClick={() => {
                setTab(title);
                setError("");
              }}
            >
              <Icon size={19} />
              <span>{title}</span>
              {title === "My plans" && upcoming.length > 0 && (
                <span className="nav-count">{upcoming.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={24} />
            <p>
              Good connections
              <br />
              start with a little time.
            </p>
          </div>
          <div className="user-menu">
            <Avatar name={state.profile?.name || "You"} />
            <div>
              <strong>{state.profile?.name || "Your next chapter"}</strong>
              <small>
                {state.mode === "demo"
                  ? "Exploring demo mode"
                  : "Your personal space"}
              </small>
            </div>
            {state.mode === "supabase" && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Your space <span>/</span> <strong>{tab}</strong>
          </span>
          <div className="topbar-right">
            <span className="today-date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="mode-badge">
              <span />
              {state.mode === "demo" ? "Demo mode" : "Connected"}
            </span>
            {state.mode === "supabase" && (
              <button
                className="icon-button compact-signout"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        <main className="content">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {state.profile && !state.profile.phone && (
            <div className="info-strip">
              Add contact details so your matches can reach you.{" "}
              <button
                className="text-button"
                onClick={() => setModal("profile")}
              >
                Update my profile
              </button>
            </div>
          )}
          {tab === "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A LITTLE LESS PLANNING. A LOT MORE LIVING.
                  </span>
                  <h1>
                    {state.profile
                      ? `Hey ${state.profile.name}, let's make plans.`
                      : "Your people are out there."}
                  </h1>
                  <p>Good company. Thoughtful plans. Space to just show up.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() =>
                    setModal(state.profile ? "availability" : "profile")
                  }
                >
                  <Plus size={17} /> Add free time
                </button>
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="pill">
                        <Sparkles size={13} /> A LITTLE SOCIAL SERENDIPITY
                      </span>
                      <h2>
                        Make room for
                        <br />
                        good company.
                      </h2>
                      <p>
                        You bring the free time.
                        <br />
                        We’ll find the people, the place, and the plan.
                      </p>
                      <button className="primary" onClick={startPlanning}>
                        {!state.profile
                          ? "Let's get to know you"
                          : "Add a time slot"}
                        <ArrowRight size={17} />
                      </button>
                      <span className="hero-footnote">
                        Less back-and-forth. More “see you there.”
                      </span>
                    </div>
                    <ConnectionArt />
                  </section>
                  <div className="section-heading">
                    <h2>
                      On your horizon <span>{upcoming.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("My plans")}
                    >
                      All plans <ArrowRight size={15} />
                    </button>
                  </div>
                  {upcoming.length ? (
                    <div className="plan-grid">
                      {upcoming.slice(0, 2).map((h) => (
                        <PlanCard key={h.id} hangout={h} />
                      ))}
                    </div>
                  ) : (
                    <div className="horizon-empty">
                      <div className="empty-calendar">
                        <CalendarDays size={31} />
                        <span>✦</span>
                      </div>
                      <div>
                        <h3>A good week starts with one plan.</h3>
                        <p>Add a little free time. We’ll take it from there.</p>
                        <button className="text-button" onClick={startPlanning}>
                          Add your first time slot <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                  <section className="how-it-works">
                    <span className="eyebrow">
                      A FRIEND WHO HANDLES THE PLANNING
                    </span>
                    <div>
                      <article>
                        <span>01</span>
                        <h3>Make a little space</h3>
                        <p>
                          A free evening or an open afternoon. Your time, your
                          terms.
                        </p>
                      </article>
                      <article>
                        <span>02</span>
                        <h3>Leave the details to us</h3>
                        <p>
                          A thoughtful match and something you’ll both enjoy.
                        </p>
                      </article>
                      <article>
                        <span>03</span>
                        <h3>Just be yourself</h3>
                        <p>Show up, share a moment, see where it goes.</p>
                      </article>
                    </div>
                  </section>
                </div>
                <aside className="dashboard-aside">
                  <section className="rhythm-card">
                    <div className="section-heading">
                      <h3>Your social rhythm</h3>
                      <Sprout size={20} />
                    </div>
                    <p>A little connection goes a long way.</p>
                    <div className="rhythm-number">
                      {upcoming.length}
                      <span>plans to look forward to</span>
                    </div>
                    <div className="week-strip">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() + i);
                        const active = upcoming.some(
                          (h) =>
                            new Date(h.start).toDateString() ===
                            d.toDateString(),
                        );
                        return (
                          <div key={i} className={active ? "has-plan" : ""}>
                            <small>
                              {d.toLocaleDateString("en", {
                                weekday: "narrow",
                              })}
                            </small>
                            <span>{d.getDate()}</span>
                            <i />
                          </div>
                        );
                      })}
                    </div>
                    <div className="rhythm-footer">
                      <span>
                        <Clock3 size={15} />
                        {Math.round(hours * 10) / 10} hours available
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setTab("Availability")}
                      >
                        Edit <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                  <section className="time-card">
                    <span className="round-icon">
                      <Clock3 size={20} />
                    </span>
                    <h3>
                      A little time.
                      <br />A lot of possibility.
                    </h3>
                    <p>
                      Set aside an hour for someone new. You never know what
                      might click.
                    </p>
                    <button
                      className="secondary full"
                      onClick={() =>
                        setModal(state.profile ? "availability" : "profile")
                      }
                    >
                      <Plus size={16} /> Add availability
                    </button>
                  </section>
                  <section className="trust-note">
                    <ShieldCheck size={19} />
                    <p>
                      Built around your comfort.
                      <br />
                      <span>Your preferences and feedback stay private.</span>
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
          {tab === "My plans" && (
            <>
              <PageHeading
                eyebrow="SOMETHING TO LOOK FORWARD TO"
                title="Your next good memory."
                description="The who, what, and when. All in one little place."
                action={
                  <button className="primary" onClick={startPlanning}>
                    <Plus size={17} /> Add availability
                  </button>
                }
              />
              <div className="section-heading">
                <h2>Coming up</h2>
              </div>
              {upcoming.length ? (
                <div className="plan-grid three">
                  {upcoming.map((h) => (
                    <PlanCard key={h.id} hangout={h} />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<CalendarDays />}
                  title="Your calendar has room for something good."
                  action={
                    <button className="primary" onClick={startPlanning}>
                      Find a hangout <ArrowRight size={17} />
                    </button>
                  }
                >
                  Choose a little free time to get started.
                </Empty>
              )}
              {past.length > 0 && (
                <>
                  <div className="section-heading past-heading">
                    <h2>Past moments</h2>
                    <span className="muted">
                      {state.mode === "demo"
                        ? "Includes an example hangout to try feedback"
                        : "A little reflection helps us learn"}
                    </span>
                  </div>
                  <div className="plan-grid three">
                    {past.map((h) => (
                      <PlanCard key={h.id} hangout={h} />
                    ))}
                  </div>
                </>
              )}
              {state.hangouts.some((h) => h.status === "cancelled") && (
                <p className="muted cancelled-note">
                  {
                    state.hangouts.filter((h) => h.status === "cancelled")
                      .length
                  }{" "}
                  cancelled plan(s). That time is free again.
                </p>
              )}
            </>
          )}
          {tab === "Availability" && (
            <>
              <PageHeading
                eyebrow="YOU BRING THE TIME"
                title="A little room in your week."
                description="Choose times you're happy for Convene to turn into plans."
                action={
                  <button
                    className="primary"
                    onClick={() =>
                      setModal(state.profile ? "availability" : "profile")
                    }
                  >
                    <Plus size={17} /> Add free time
                  </button>
                }
              />
              <div className="info-strip">
                <Clock3 size={18} /> All times are shown in{" "}
                {Intl.DateTimeFormat()
                  .resolvedOptions()
                  .timeZone.replaceAll("_", " ")}
                . These are individual dates, so you're always in control.
              </div>
              {blocks.length ? (
                <div className="availability-list">
                  {blocks.map((b) => (
                    <article key={b.id} className="availability-row">
                      <div className="date-tile">
                        <small>
                          {new Date(b.start).toLocaleDateString("en", {
                            month: "short",
                          })}
                        </small>
                        <strong>{new Date(b.start).getDate()}</strong>
                      </div>
                      <div>
                        <h3>{dateLabel(b.start)}</h3>
                        <p>
                          {timeLabel(b.start)} – {timeLabel(b.end)}
                        </p>
                      </div>
                      <span className="tag">{modeLabel(b.mode)}</span>
                      <span className="tag">
                        {b.status === "filled"
                          ? "Plan assigned"
                          : Date.parse(b.end) <= Date.now() &&
                              (!b.status ||
                                b.status === "pending" ||
                                b.status === "paused")
                            ? "Unfilled · expired"
                            : b.status === "pending" || !b.status
                              ? "Waiting for a match"
                              : b.status}
                      </span>
                      <span className="muted">
                        {b.interests?.join(" or ") || "Surprise me"}
                      </span>
                      {b.status === "filled" ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            setSelected(
                              state.hangouts.find(
                                (h) => h.id === b.hangoutId,
                              ) ?? null,
                            )
                          }
                        >
                          View plan
                        </button>
                      ) : (
                        Date.parse(b.end) > Date.now() && (
                          <>
                            {(!b.status ||
                              b.status === "pending" ||
                              b.status === "paused") && (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingSlot(b);
                                  setModal("availability");
                                }}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  {
                                    action: "slot_status",
                                    id: b.id,
                                    status:
                                      !b.status || b.status === "pending"
                                        ? "paused"
                                        : "pending",
                                  },
                                  b.status === "pending"
                                    ? "Matching paused."
                                    : "Slot reopened for automatic matching.",
                                )
                              }
                            >
                              {!b.status || b.status === "pending"
                                ? "Pause"
                                : "Reopen"}
                            </button>
                          </>
                        )
                      )}
                      <button
                        className="icon-button"
                        disabled={
                          busy ||
                          b.status === "filled" ||
                          b.status === "cancelled"
                        }
                        aria-label={`Remove availability ${dateLabel(b.start)} ${timeLabel(b.start)}`}
                        onClick={() =>
                          act(
                            { action: "remove_availability", id: b.id },
                            "Free time removed. Existing plans are unchanged.",
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<Clock3 />}
                  title="What does your week look like?"
                  action={
                    <button
                      className="primary"
                      onClick={() =>
                        setModal(state.profile ? "availability" : "profile")
                      }
                    >
                      Add your first time block <Plus size={17} />
                    </button>
                  }
                >
                  An hour for coffee. An evening for a game. Start small.
                </Empty>
              )}
              <p className="muted">
                Each slot waits for one compatible plan. Cancel assigned plans
                from their details; reopen a cancelled slot only when you want
                another match.
              </p>
            </>
          )}
          {tab === "Connections" && (
            <>
              <PageHeading
                eyebrow="GOOD PEOPLE, WORTH KEEPING"
                title="Your growing circle."
                description={`${friends.length} saved ${friends.length === 1 ? "friend" : "friends"}. Every connection starts with a hello.`}
              />
              {state.people.length ? (
                <div className="people-grid">
                  {state.people.map((person) => {
                    const connection = connectionFor(person.id);
                    const blocked = connection?.status === "blocked";
                    return (
                      <article className="person-card" key={person.id}>
                        <Avatar name={person.name} large />
                        <h3>
                          {person.name} {person.seeded && <small>Demo</small>}
                        </h3>
                        <p>{person.summary}</p>
                        <div className="tags">
                          {person.interests.slice(0, 3).map((i) => (
                            <span className="tag" key={i}>
                              {i}
                            </span>
                          ))}
                        </div>
                        <div className="person-actions">
                          {blocked ? (
                            <span className="muted">
                              Blocked · no future matches
                            </span>
                          ) : (
                            <>
                              <button
                                className="secondary"
                                disabled={
                                  busy || connection?.status === "friend"
                                }
                                onClick={() =>
                                  act(
                                    {
                                      action: "connection",
                                      otherId: person.id,
                                      status: "friend",
                                    },
                                    "Friend saved.",
                                  )
                                }
                              >
                                {connection?.status === "friend" ? (
                                  <Check size={15} />
                                ) : (
                                  <Plus size={15} />
                                )}{" "}
                                {connection?.status === "friend"
                                  ? "Saved friend"
                                  : "Save friend"}
                              </button>
                              <button
                                className="text-button muted"
                                disabled={busy}
                                onClick={() =>
                                  act(
                                    {
                                      action: "connection",
                                      otherId: person.id,
                                      status: "blocked",
                                    },
                                    "Blocked. Upcoming plans together have been cancelled.",
                                  )
                                }
                              >
                                Block
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  icon={<Users />}
                  title="New faces. Future friends."
                  action={
                    <button className="primary" onClick={startPlanning}>
                      Meet someone new <ArrowRight size={17} />
                    </button>
                  }
                >
                  People you make plans with will appear here.
                </Empty>
              )}
            </>
          )}
          {tab === "My profile" && (
            <>
              <PageHeading
                eyebrow="A LITTLE MORE YOU"
                title="More than a list of interests."
                description="Help Convene understand what makes a hangout feel right."
                action={
                  <button
                    className="primary"
                    onClick={() => setModal("profile")}
                  >
                    <Settings2 size={16} />{" "}
                    {state.profile ? "Edit profile" : "Create profile"}
                  </button>
                }
              />
              {state.profile ? (
                <div className="profile-layout">
                  <section className="profile-card">
                    <Avatar name={state.profile.name} large />
                    <h2>{state.profile.name}</h2>
                    <p>
                      <MapPin size={15} /> {state.profile.city}
                    </p>
                    <div className="tags">
                      {state.profile.interests.map((i) => (
                        <span className="tag" key={i}>
                          {i}
                        </span>
                      ))}
                    </div>
                    <hr />
                    <dl>
                      <div>
                        <dt>Hangout style</dt>
                        <dd>{modeLabel(state.profile.mode)}</dd>
                      </div>
                      <div>
                        <dt>Budget per hangout</dt>
                        <dd>Up to ${state.profile.budget}</dd>
                      </div>
                      <div>
                        <dt>Open to discovery</dt>
                        <dd>{state.profile.novelty}%</dd>
                      </div>
                      <div>
                        <dt>Your private phone</dt>
                        <dd>{state.profile.phone || "Add a number"}</dd>
                      </div>
                      <div>
                        <dt>Communication apps</dt>
                        <dd>
                          {state.profile.platforms
                            .filter((p) => communicationPlatforms.includes(p))
                            .join(", ") || "Choose in your profile"}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <div className="section-heading">
                      <h2>What Convene understands</h2>
                      <span className="private-label">
                        <ShieldCheck size={14} /> Only you
                      </span>
                    </div>
                    <p className="muted">
                      Your own words and preferences, kept with their context.
                      Edit your profile to correct onboarding memories.
                    </p>
                    <div className="memories">
                      {state.memories.map((m) => (
                        <article key={m.id}>
                          <span className="memory-icon">
                            <Leaf size={19} />
                          </span>
                          <div>
                            <span className="eyebrow">{m.topic}</span>
                            <p>{m.summary}</p>
                            <small>
                              {m.source === "feedback"
                                ? "From your feedback"
                                : "From getting to know you"}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <Empty icon={<Compass />} title="Let's start with you.">
                  A few interests and a little about your ideal hangout are all
                  we need.
                </Empty>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              convene. <span>Less planning. More connection.</span>
            </span>
            <span>
              {state.mode === "demo"
                ? "Fictional people & venues · Session-only data"
                : "Made for real human connection"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "profile" && (
        <Modal
          title={
            state.profile ? "A little more you" : "Hey, it's nice to meet you."
          }
          onClose={() => setModal(null)}
        >
          <ProfileForm
            initial={state.profile}
            busy={busy}
            error={error}
            onSave={async (profile) => {
              if (
                await act(
                  { action: "profile", profile },
                  "Your profile is ready. Let's make a little space in your week.",
                )
              ) {
                setModal(state.profile ? null : "availability");
              }
            }}
          />
        </Modal>
      )}
      {modal === "availability" && (
        <Modal
          title="Make a little room."
          onClose={() => {
            setModal(null);
            setEditingSlot(null);
          }}
        >
          <AvailabilityForm
            initial={editingSlot}
            busy={busy}
            error={error}
            onSave={async (block) => {
              if (
                await act(
                  editingSlot
                    ? { action: "edit_availability", id: editingSlot.id, block }
                    : { action: "availability", block },
                  "Slot saved. Matching starts automatically.",
                )
              ) {
                setModal(null);
                setEditingSlot(null);
              }
            }}
          />
        </Modal>
      )}
      {feedback && (
        <Modal
          title="How was your time together?"
          onClose={() => setFeedback(null)}
        >
          <FeedbackForm
            busy={busy}
            error={error}
            onSave={async (input) => {
              if (
                await act(
                  { action: "feedback", hangoutId: feedback.id, ...input },
                  "Thanks. Your feedback stays private and helps shape future connections.",
                )
              )
                setFeedback(null);
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title="A plan worth showing up for."
          onClose={() => setSelected(null)}
        >
          <PlanDetails
            hangout={selected}
            person={personFor(selected)?.name || "a new friend"}
            contacts={
              state.planContacts?.filter((c) => c.hangoutId === selected.id) ??
              []
            }
            busy={busy}
            error={error}
            onCancel={async () => {
              if (
                await act(
                  { action: "cancel", id: selected.id },
                  "Plan cancelled. That time is yours again.",
                )
              )
                setSelected(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img src="/icon.svg" width="34" height="34" alt="" />
      <span>
        convene<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function ActivityDrawing({ kind }: { kind: "coffee" | "online" | "outdoors" }) {
  return (
    <div className={`activity-drawing ${kind}`} aria-hidden="true">
      {kind === "coffee" ? (
        <>
          <span className="draw-cup cup-one" />
          <span className="draw-cup cup-two" />
          <span className="draw-spark">✦</span>
        </>
      ) : kind === "online" ? (
        <>
          <Monitor size={72} strokeWidth={1.3} />
          <span className="draw-spark">✦</span>
          <span className="draw-bubble">hello!</span>
        </>
      ) : (
        <>
          <Sprout size={92} strokeWidth={1.2} />
          <span className="draw-spark">☀</span>
        </>
      )}
    </div>
  );
}

function ProfileForm({
  initial,
  busy,
  error,
  onSave,
}: {
  initial: Profile | null;
  busy: boolean;
  error: string;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [contactError, setContactError] = useState("");
  const [p, setP] = useState<Profile>(() => {
    const platforms = initial?.platforms.filter((p) =>
      communicationPlatforms.includes(p),
    ) ?? ["Phone" as const];
    return {
      ...defaultProfile,
      ...initial,
      phone: initial?.phone ?? "",
      handles: initial?.handles ?? {},
      platforms: platforms.length ? platforms : ["Phone"],
      timezone:
        initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setP((v) => ({ ...v, [key]: value }));
  const toggleInterest = (interest: (typeof interests)[number]) =>
    setP((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((i) => i !== interest)
        : [...current.interests, interest],
      excludedInterests: current.excludedInterests.filter(
        (i) => i !== interest,
      ),
    }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const phone = phoneSchema.safeParse(p.phone);
    if (!phone.success) {
      setContactError(phone.error.issues[0].message);
      setStep(0);
      return;
    }
    setContactError("");
    if (step < 2) setStep(step + 1);
    else void onSave(p);
  };
  return (
    <form onSubmit={submit}>
      <div className="form-steps">
        {["The basics", "Your kind of company", "Your comfort zone"].map(
          (s, i) => (
            <span key={s} className={i <= step ? "current" : ""}>
              {i + 1}
              <small>{s}</small>
            </span>
          ),
        )}
      </div>
      {step === 0 && (
        <>
          <p className="form-intro">
            Let's start with the things that make your free time feel like you.
          </p>
          <div className="form-row">
            <label>
              What should we call you?
              <input
                required
                maxLength={50}
                value={p.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Your first name"
                autoComplete="given-name"
              />
            </label>
            <label>
              Your city
              <input
                required
                maxLength={80}
                value={p.city}
                onChange={(e) => update("city", e.target.value)}
                autoComplete="address-level2"
              />
            </label>
          </div>
          <label>
            Phone number (with country code)
            <input
              type="tel"
              autoComplete="tel"
              required
              maxLength={30}
              value={p.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+1 202 555 0123"
            />
          </label>
          <p className="form-hint">
            Stored privately. Choose which contact methods to share with
            assigned matches in the last step.
          </p>
          <fieldset>
            <legend>
              What are you into? <span>Pick a few.</span>
            </legend>
            <div className="interest-options">
              {interests.map((i) => (
                <button
                  type="button"
                  key={i}
                  aria-pressed={p.interests.includes(i)}
                  className={`interest-chip ${p.interests.includes(i) ? "selected" : ""}`}
                  onClick={() => toggleInterest(i)}
                >
                  {i}
                  {p.interests.includes(i) && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="form-hint">
            In-person demo venues are in Atlanta. Online hangouts work from
            anywhere.
          </p>
        </>
      )}
      {step === 1 && (
        <>
          <div className="conversation-prompt">
            <span className="round-icon">
              <Sparkles size={20} />
            </span>
            <p>
              “The best plans feel like you. Tell me a little about your kind of
              company.”
            </p>
          </div>
          <label>
            What kind of people do you get along with?
            <textarea
              rows={3}
              maxLength={1500}
              value={p.about}
              onChange={(e) => update("about", e.target.value)}
              placeholder="I like laid-back people who get excited about their hobbies. Big groups can be a lot at first…"
            />
          </label>
          <label>
            What's your idea of a great low-pressure hangout?
            <textarea
              rows={3}
              maxLength={1000}
              value={p.idealHangout}
              onChange={(e) => update("idealHangout", e.target.value)}
              placeholder="A quiet coffee spot, a cooperative game, or trying something new with someone patient…"
            />
          </label>
          <p className="form-hint">
            <ShieldCheck size={14} /> These answers stay private. They help
            Convene understand your preferences.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <ModeChoices value={p.mode} onChange={(v) => update("mode", v)} />
          <fieldset>
            <legend>Nearby in-person plans</legend>
            <p className="form-hint">
              Connected in-person matching needs your private location. The
              current fictional venues are around Midtown Atlanta. Online plans
              work without location.
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (!navigator.geolocation) {
                  window.alert("Location is unavailable in this browser.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (position) =>
                    update("location", {
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                    }),
                  () =>
                    window.alert(
                      "Location could not be read. You can still use online matching.",
                    ),
                  { timeout: 10000, maximumAge: 300000 },
                );
              }}
            >
              {p.location ? "Update my location" : "Use my current location"}
            </button>
            {p.location && (
              <button
                type="button"
                className="text-button"
                onClick={() => update("location", null)}
              >
                Remove saved location
              </button>
            )}
            <label>
              Maximum straight-line distance (km)
              <input
                type="number"
                min="1"
                max="100"
                value={p.radiusKm}
                onChange={(e) => update("radiusKm", Number(e.target.value))}
                required
              />
            </label>
          </fieldset>
          <label>
            Maximum budget per hangout (USD)
            <input
              type="number"
              min="0"
              max="100"
              required
              value={p.budget}
              onChange={(e) => update("budget", Number(e.target.value))}
            />
          </label>
          <label>
            How adventurous are you feeling? <strong>{p.novelty}%</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={p.novelty}
              onChange={(e) => update("novelty", Number(e.target.value))}
            />
            <span className="range-labels">
              <span>Keep it familiar</span>
              <span>Surprise me a little</span>
            </span>
          </label>
          <fieldset>
            <legend>Communication platforms · select all that apply</legend>
            <div className="interest-options">
              {communicationPlatforms.map((platform) => (
                <button
                  type="button"
                  key={platform}
                  aria-pressed={p.platforms.includes(platform)}
                  className={`interest-chip ${p.platforms.includes(platform) ? "selected" : ""}`}
                  onClick={() =>
                    update(
                      "platforms",
                      p.platforms.includes(platform)
                        ? p.platforms.filter((x) => x !== platform)
                        : [...p.platforms, platform],
                    )
                  }
                >
                  {platform === "Phone" ? "Phone / SMS" : platform}
                </button>
              ))}
            </div>
            <p className="form-hint">
              We choose a method you both selected. Its number or username is
              shared only with participants after a plan is assigned. Removing a
              method, cancelling, or blocking stops further display, but cannot
              erase details someone already saved.
            </p>
            {p.platforms.includes("Phone") && (
              <p className="form-hint">
                Phone / SMS will use {p.phone || "the phone number from step 1"}
                .
              </p>
            )}
            {p.platforms
              .filter((platform) => platform !== "Phone")
              .map((platform) => (
                <label key={platform}>
                  {platform === "WhatsApp"
                    ? "WhatsApp phone number (with country code)"
                    : `${platform} username / handle`}
                  <input
                    required
                    type={platform === "WhatsApp" ? "tel" : "text"}
                    maxLength={100}
                    autoComplete="off"
                    placeholder={
                      platform === "WhatsApp"
                        ? "+1 202 555 0123"
                        : "Your username"
                    }
                    value={p.handles[platform] ?? ""}
                    onChange={(e) =>
                      update("handles", {
                        ...p.handles,
                        [platform]: e.target.value,
                      })
                    }
                  />
                  {platform === "WhatsApp" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update("handles", { ...p.handles, WhatsApp: p.phone })
                      }
                    >
                      Use my phone number
                    </button>
                  )}
                </label>
              ))}
            {!p.platforms.length && (
              <p className="form-error">
                Choose at least one way to communicate.
              </p>
            )}
          </fieldset>
          <Choices
            label="Activities to skip · select all that apply"
            options={interests.filter((i) => !p.interests.includes(i))}
            value={p.excludedInterests}
            onChange={(v) => update("excludedInterests", v)}
            emptyLabel="Nothing in particular"
          />
        </>
      )}
      {contactError && (
        <p className="form-error" role="alert">
          {contactError}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {step > 0 ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setStep(step - 1)}
            disabled={busy}
          >
            <ChevronLeft size={16} /> Back
          </button>
        ) : (
          <span className="muted">About 2 minutes. All about you.</span>
        )}
        <button className="primary" disabled={busy || !p.interests.length}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} /> Getting to know you…
            </>
          ) : step < 2 ? (
            <>
              Keep going <ArrowRight size={17} />
            </>
          ) : (
            <>
              Save my profile <Check size={17} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
  emptyLabel,
  labels,
}: {
  label: string;
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  emptyLabel: string;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="interest-options">
        <button
          type="button"
          className={`interest-chip ${!value.length ? "selected" : ""}`}
          aria-pressed={!value.length}
          onClick={() => onChange([])}
        >
          {emptyLabel}
        </button>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={`interest-chip ${value.includes(option) ? "selected" : ""}`}
            aria-pressed={value.includes(option)}
            onClick={() =>
              onChange(
                value.includes(option)
                  ? value.filter((v) => v !== option)
                  : [...value, option],
              )
            }
          >
            {labels?.[option] ?? option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function ModeChoices({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (v: Mode) => void;
}) {
  return (
    <Choices<"in_person" | "online">
      label="Meeting options · select all that apply"
      options={["in_person", "online"]}
      value={value === "either" ? [] : [value]}
      onChange={(v) => onChange(v.length === 1 ? v[0] : "either")}
      emptyLabel="Surprise me · either works"
      labels={{ in_person: "In person", online: "Online" }}
    />
  );
}
function AvailabilityForm({
  initial,
  busy,
  error,
  onSave,
}: {
  initial: Availability | null;
  busy: boolean;
  error: string;
  onSave: (block: {
    start: string;
    end: string;
    mode: Mode;
    interests: (typeof interests)[number][];
    goals: ("new" | "friends")[];
  }) => Promise<void>;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const localTime = (value: string) => {
    const d = new Date(value);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [date, setDate] = useState(
    localDate(initial ? new Date(initial.start) : tomorrow),
  );
  const [start, setStart] = useState(
    initial ? localTime(initial.start) : "15:00",
  );
  const [end, setEnd] = useState(initial ? localTime(initial.end) : "18:00");
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "either");
  const [selectedInterests, setSelectedInterests] = useState<
    (typeof interests)[number][]
  >((initial?.interests ?? []) as (typeof interests)[number][]);
  const [goals, setGoals] = useState<("new" | "friends")[]>(
    initial?.goals ?? [],
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          start: new Date(`${date}T${start}`).toISOString(),
          end: new Date(`${date}T${end}`).toISOString(),
          mode,
          interests: selectedInterests,
          goals,
        });
      }}
    >
      <p className="form-intro">
        Save a window and we'll automatically assign one plan inside it when a
        compatible person is available. Until then, it stays waiting.
      </p>
      <label>
        Which day?
        <input
          type="date"
          required
          min={localDate(new Date())}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="form-row">
        <label>
          From
          <input
            required
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Until
          <input
            required
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <ModeChoices value={mode} onChange={setMode} />
      <Choices
        label="Activities · select all that apply"
        options={[...interests]}
        value={selectedInterests}
        onChange={setSelectedInterests}
        emptyLabel="Surprise me"
      />
      <Choices
        label="Company · select all that apply"
        options={["new", "friends"]}
        value={goals}
        onChange={setGoals}
        emptyLabel="Surprise me"
        labels={{ new: "Someone new", friends: "A saved friend" }}
      />
      <p className="form-hint">
        Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Add
        60–90 minutes for the best chance of a match.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Plus size={17} />
        )}{" "}
        Save my free time
      </button>
    </form>
  );
}
function FeedbackForm({
  busy,
  error,
  onSave,
}: {
  busy: boolean;
  error: string;
  onSave: (f: {
    rating: number;
    meetAgain: boolean;
    comments: string;
  }) => Promise<void>;
}) {
  const [rating, setRating] = useState(4);
  const [meetAgain, setMeetAgain] = useState(true);
  const [comments, setComments] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ rating, meetAgain, comments });
      }}
    >
      <p className="form-intro">
        A quick reflection helps your next plan feel more like you.
      </p>
      <fieldset>
        <legend>How did the hangout feel?</legend>
        <div className="rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              aria-label={`${n} stars`}
              aria-pressed={rating === n}
              key={n}
              onClick={() => setRating(n)}
            >
              <Star fill={n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Would you like to meet again?
        <select
          value={String(meetAgain)}
          onChange={(e) => setMeetAgain(e.target.value === "true")}
        >
          <option value="true">Yes, I'd like that</option>
          <option value="false">I'd rather meet someone else</option>
        </select>
      </label>
      <label>
        Anything to remember for next time?
        <textarea
          rows={3}
          value={comments}
          maxLength={1000}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Loved the conversation. A quieter place would be nice next time…"
        />
      </label>
      <p className="form-hint">
        <ShieldCheck size={14} /> Your feedback is private and won't be shown to
        the other person.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Check size={17} />
        )}{" "}
        Share feedback
      </button>
    </form>
  );
}
function PlanDetails({
  hangout,
  person,
  contacts,
  busy,
  error,
  onCancel,
}: {
  hangout: Hangout;
  person: string;
  contacts: PlanContact[];
  busy: boolean;
  error: string;
  onCancel: () => Promise<void>;
}) {
  const a = activities.find((a) => a.id === hangout.activityId)!;
  return (
    <div className="plan-details">
      <span className={`detail-art ${a.color}`}>
        <ActivityDrawing kind={a.mode === "online" ? "online" : "coffee"} />
      </span>
      <h3>{a.name}</h3>
      <p className="detail-line">
        <Users size={18} /> With {person}
      </p>
      <p className="detail-line">
        <CalendarDays size={18} /> {dateLabel(hangout.start)} ·{" "}
        {timeLabel(hangout.start)}–{timeLabel(hangout.end)}
      </p>
      <p className="detail-line">
        {a.mode === "online" ? <Monitor size={18} /> : <MapPin size={18} />}{" "}
        {a.venue
          ? `${a.venue.name}, ${a.venue.area}`
          : hangout.communicationPlatform || "Online"}
      </p>
      <p className="muted">
        {a.cost
          ? `Estimated activity budget: $${a.cost} per person.`
          : "No activity fee in the demo catalog."}
      </p>
      <div className="match-reason">
        <Sparkles size={18} />
        <div>
          <strong>Why this plan fits</strong>
          <p>{hangout.reason}</p>
        </div>
      </div>
      <p className="form-hint">
        {hangout.seededVenue
          ? "This is a fictional demo venue. No live hours, travel distance, or reservations have been verified."
          : `${a.tool || "Choose your activity tools together"}. Arrange the room or call using the contact details below.`}
      </p>
      <section className="match-contact">
        <h3>How to reach {person}</h3>
        {contacts.length ? (
          contacts.map((contact) => (
            <div key={contact.userId}>
              <p>
                <strong>
                  {contact.platform === "Phone"
                    ? "Phone / SMS"
                    : contact.platform}
                  :
                </strong>{" "}
                <span className="contact-value">{contact.value}</span>
              </p>
              {contact.seeded ? (
                <p className="form-hint">
                  Fictional demo contact. Do not message or call it.
                </p>
              ) : (
                <p className="form-hint">
                  Shared for this plan. Contact details are not verified.
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="form-hint">
            No shared contact details are currently available. Both participants
            need a valid, enabled communication method in their profile.
            Cancelled or blocked matches cannot view contacts here.
          </p>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {hangout.status === "scheduled" &&
        Date.parse(hangout.end) > Date.now() && (
          <button
            className="secondary full danger"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel this plan
          </button>
        )}
    </div>
  );
}
function AuthScreen({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-screen">
      <div className="auth-intro">
        <Brand />
        <h1>
          A little less scrolling.
          <br />A little more living.
        </h1>
        <p>Your next good connection starts here.</p>
        <ConnectionArt />
      </div>
      <section className="auth-card">
        <span className="eyebrow">MAKE ROOM FOR GOOD COMPANY</span>
        <h2>{signup ? "Your next chapter." : "Welcome back."}</h2>
        <p>
          {signup
            ? "Create your space for connection."
            : "Let's see what's on your horizon."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const values = new FormData(e.currentTarget);
            try {
              const r = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: signup ? "signup" : "login",
                  email: values.get("email"),
                  password: values.get("password"),
                }),
              });
              const body = await r.json();
              setMessage(body.message);
              if (r.ok && body.signedIn) await onSuccess();
            } catch {
              setMessage("Could not connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              required
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
            />
          </label>
          {message && (
            <p role="status" className="form-hint">
              {message}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : signup ? (
              "Create account"
            ) : (
              "Sign in"
            )}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button auth-toggle"
          onClick={() => {
            setSignup(!signup);
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New around here? Create an account"}
        </button>
      </section>
    </main>
  );
}
