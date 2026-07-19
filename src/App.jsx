import { useCallback, useEffect, useMemo, useState } from 'react';
import LoadingOverlay from './components/LoadingOverlay';
import { IconArrow, IconCheck, IconQr } from './components/Icons';
import { createQueueApi, resolveQueueCode } from './lib/api';

const TICKET_KEY = 'careflow.patientTicket.v2';

function loadTicket(code) {
  try {
    const raw = JSON.parse(localStorage.getItem(TICKET_KEY) || 'null');
    if (raw && raw.code === code) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export default function PatientCheckIn() {
  const code = useMemo(() => resolveQueueCode(), []);
  const api = useMemo(() => (code ? createQueueApi(code) : null), [code]);

  const [queue, setQueue] = useState(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [myTicket, setMyTicket] = useState(() => (code ? loadTicket(code) : null));
  const [ticketView, setTicketView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Opening check-in…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(false);
  const [lastPos, setLastPos] = useState(null);

  const isClinicQueue = queue?.scope === 'clinic';
  const doctors = queue?.doctors || [];

  const saveTicket = useCallback((ticket) => {
    setMyTicket(ticket);
    if (ticket) localStorage.setItem(TICKET_KEY, JSON.stringify({ ...ticket, code }));
    else localStorage.removeItem(TICKET_KEY);
  }, [code]);

  const refreshQueue = useCallback(async () => {
    if (!api) throw new Error('Missing queue code in URL');
    const data = await api.getQueue();
    setQueue(data);
    setSelectedDoctorId((prev) => {
      if (data.scope === 'clinic') {
        if (prev && data.doctors?.some((d) => d.id === prev)) return prev;
        return data.doctors?.[0]?.id || null;
      }
      return data.doctor?.id || null;
    });
    return data;
  }, [api]);

  useEffect(() => {
    if (!code) {
      setError('Scan a clinic queue QR code to check in.');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadingMessage('Opening check-in…');
      try {
        await refreshQueue();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Invalid or inactive queue QR');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, refreshQueue]);

  const refreshTicket = useCallback(async () => {
    if (!api || !myTicket) {
      setTicketView(null);
      return;
    }
    try {
      const data = await api.getTicket(myTicket.ticketId);
      setTicketView(data);
      const pos = data.ticket.beingSeen ? 0 : data.ticket.position;
      setLastPos((prev) => {
        if (prev !== null && pos !== prev) {
          setFlash(true);
          setTimeout(() => setFlash(false), 2200);
        }
        return pos;
      });
      await refreshQueue().catch(() => {});
    } catch (err) {
      if (err.status === 404) {
        saveTicket(null);
        setTicketView(null);
        setLastPos(null);
      }
    }
  }, [api, myTicket, refreshQueue, saveTicket]);

  useEffect(() => {
    refreshTicket();
  }, [refreshTicket]);

  useEffect(() => {
    if (!myTicket) return undefined;
    const id = setInterval(() => refreshTicket(), 4000);
    return () => clearInterval(id);
  }, [myTicket, refreshTicket]);

  async function withBusy(fn, message) {
    if (busy) return;
    setBusy(true);
    setLoading(true);
    setLoadingMessage(message || 'Updating…');
    try {
      await fn();
    } catch (err) {
      alert(err.message || 'Request failed');
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  function resetCheckin() {
    saveTicket(null);
    setTicketView(null);
    setLastPos(null);
    setName('');
    setPhone('');
  }

  const selectedDoctor = isClinicQueue
    ? doctors.find((d) => d.id === selectedDoctorId)
    : null;

  const joinStatus = isClinicQueue
    ? selectedDoctor
      ? {
          canJoin: selectedDoctor.canJoin !== false,
          status: selectedDoctor.availabilityStatus || 'available',
          reason: selectedDoctor.unavailableReason || selectedDoctor.availabilityReason || '',
        }
      : { canJoin: false, status: 'none', reason: 'Select a doctor' }
    : {
        canJoin: queue?.canJoin !== false,
        status: queue?.availabilityStatus || 'available',
        reason: queue?.unavailableReason || queue?.availabilityReason || '',
      };

  const waitSummary = !joinStatus.canJoin
    ? joinStatus.reason || 'Check-in is closed right now'
    : isClinicQueue
      ? selectedDoctor
        ? `${selectedDoctor.waitingCount} waiting · ~${selectedDoctor.avgMinutes} min each`
        : `${queue?.waitingCount ?? 0} waiting across clinic`
      : queue
        ? `${queue.waitingCount} waiting · ~${queue.avgMinutes} min each`
        : 'Enter your details to join the queue.';

  // Prefer an available doctor when clinic QR loads
  useEffect(() => {
    if (!isClinicQueue || !doctors.length) return;
    const current = doctors.find((d) => d.id === selectedDoctorId);
    if (current?.canJoin) return;
    const firstOpen = doctors.find((d) => d.canJoin);
    if (firstOpen) setSelectedDoctorId(firstOpen.id);
  }, [isClinicQueue, doctors, selectedDoctorId]);

  if (error && !queue) {
    return (
      <>
        <div className="app">
          <div className="topbar">
            <div>
              <h1>Check-in</h1>
              <p>Queue QR required</p>
            </div>
          </div>
          <div className="error-box">{error}</div>
        </div>
        <LoadingOverlay show={loading} message={loadingMessage} />
      </>
    );
  }

  if (myTicket && ticketView) {
    const { ticket, doctor, queueDots = [], nowServing = null } = ticketView;
    const completed = !!ticket.completed;
    const idx = queueDots.indexOf(myTicket.ticketId);
    const myNumber = ticket.displayToken ?? ticket.position;
    const nowNumber = nowServing?.displayToken;

    return (
      <>
        <div className={`app${loading ? ' is-loading' : ''}`}>
          {queue && (
            <div className="clinic-banner">
              <div className="name">{queue.clinic.name}</div>
              <div className="meta">{doctor.name} · {doctor.specialty}</div>
            </div>
          )}
          <div className="topbar">
            <div>
              <h1>Your Visit</h1>
              <p>Live tracking — no refresh needed</p>
            </div>
            <div className="live-chip"><i />Live</div>
          </div>
          <div className={`flash-live${flash ? ' show' : ''}`}>
            <span className="sdot" />
            <span>Queue updated</span>
          </div>

          {completed ? (
            <div className="panel">
              <div className="done-card">
                <div className="check"><IconCheck /></div>
                <h2>Visit complete</h2>
                <p>Hope you feel better soon.</p>
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={resetCheckin}>
                  Check in again
                </button>
              </div>
            </div>
          ) : (
            <div className="panel">
              {ticket.beingSeen && (
                <div className="turn-banner">It&apos;s your turn — please head to the doctor&apos;s room.</div>
              )}
              <div className="ticket">
                <div className="queue-status-row">
                  <div className="queue-status-cell">
                    <div className="eyebrow">Now serving</div>
                    <div className={`status-num${ticket.beingSeen ? ' turn' : ''}`}>
                      {nowNumber != null ? nowNumber : '—'}
                    </div>
                  </div>
                  <div className="queue-status-cell you">
                    <div className="eyebrow">Your number</div>
                    <div className={`status-num${ticket.beingSeen ? ' turn' : ''}`}>
                      {myNumber != null ? myNumber : '—'}
                    </div>
                  </div>
                </div>
                <div className="sub">
                  {ticket.beingSeen
                    ? "you're being seen now"
                    : ticket.ahead === 0
                      ? "you're next after the current patient"
                      : `${ticket.ahead} patient(s) ahead · wait may update if someone is inserted`}
                </div>
                <div className="doc">{doctor.name} · {doctor.specialty}</div>
              </div>
              <div className="wait-card">
                <div className="l">Estimated wait</div>
                <div className="v">{ticket.beingSeen ? 'now' : `~${ticket.waitMinutes} min`}</div>
              </div>
              {!ticket.beingSeen && (
                <div className="dots">
                  {queueDots.map((id, i) => (
                    <div
                      key={id}
                      className={`pdot${id === myTicket.ticketId ? ' you' : i < idx ? ' done' : ''}`}
                    />
                  ))}
                </div>
              )}
              <div className="note">Feel free to lock your phone — we&apos;ll refresh the moment it&apos;s your turn.</div>
              <div className="panel-body">
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%' }}
                  onClick={() =>
                    withBusy(async () => {
                      try {
                        await api.cancelTicket(myTicket.ticketId);
                      } catch {
                        /* ignore */
                      }
                      resetCheckin();
                    }, 'Cancelling…')
                  }
                >
                  Cancel check-in
                </button>
              </div>
            </div>
          )}
        </div>
        <LoadingOverlay show={loading} message={loadingMessage} />
      </>
    );
  }

  return (
    <>
      <div className={`app${loading ? ' is-loading' : ''}`}>
        {queue && (
          <div className="clinic-banner">
            <div className="name">{queue.clinic.name}</div>
            <div className="meta">
              {isClinicQueue
                ? 'Choose your doctor to join their queue'
                : `${queue.doctor.name} · ${queue.doctor.specialty}`}
            </div>
          </div>
        )}

        <div className="topbar">
          <div>
            <h1>Welcome</h1>
            <p>
              {isClinicQueue
                ? 'Select a doctor, then check in'
                : `You'll join ${queue?.doctor?.name || 'this doctor'}'s queue`}
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="welcome-hero">
            <div className="qricon"><IconQr /></div>
            <h2>{joinStatus.canJoin ? 'Complete your check-in' : 'Check-in unavailable'}</h2>
            <p>{waitSummary}</p>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            {!joinStatus.canJoin && !isClinicQueue ? (
              <div className={`status-box ${joinStatus.status}`}>
                <div className="status-title">
                  {joinStatus.status === 'unavailable' ? 'Doctor not available' : 'Outside consultation hours'}
                </div>
                <div className="status-reason">{joinStatus.reason}</div>
              </div>
            ) : null}

            {isClinicQueue && (
              <div className="field">
                <label>Select doctor</label>
                <div className="doc-pick">
                  {doctors.map((doc) => {
                    const blocked = doc.canJoin === false;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        className={`opt${selectedDoctorId === doc.id ? ' sel' : ''}${blocked ? ' blocked' : ''}`}
                        onClick={() => setSelectedDoctorId(doc.id)}
                      >
                        <div className="n">{doc.name}</div>
                        <div className="w">
                          {blocked
                            ? doc.unavailableReason || doc.availabilityReason || 'Unavailable'
                            : `${doc.specialty} · ${doc.waitingCount} waiting · ~${doc.avgMinutes} min`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isClinicQueue && selectedDoctor && !joinStatus.canJoin ? (
              <div className={`status-box ${joinStatus.status}`}>
                <div className="status-title">
                  {joinStatus.status === 'unavailable' ? 'Doctor not available' : 'Outside consultation hours'}
                </div>
                <div className="status-reason">{joinStatus.reason}</div>
              </div>
            ) : null}

            {joinStatus.canJoin ? (
              <>
                <div className="field">
                  <label htmlFor="pName">Full name</label>
                  <input
                    id="pName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ananya Rao"
                    autoComplete="name"
                    required
                    aria-required="true"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pPhone">Phone number</label>
                  <input
                    id="pPhone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 98765 43210"
                    autoComplete="tel"
                  />
                </div>
                <button
                  className="btn-main"
                  style={{ marginTop: 4 }}
                  disabled={!name.trim() || busy}
                  onClick={() =>
                    withBusy(async () => {
                      const trimmedName = name.trim();
                      if (!trimmedName) {
                        throw new Error('Please enter your full name');
                      }
                      if (isClinicQueue && !selectedDoctorId) {
                        throw new Error('Please select a doctor');
                      }
                      const body = {
                        name: trimmedName,
                        phone: phone.trim() || '',
                      };
                      if (isClinicQueue) body.doctorId = selectedDoctorId;
                      const res = await api.checkin(body);
                      saveTicket({ ticketId: res.ticket.id, code });
                    }, 'Checking you in…')
                  }
                >
                  <span>
                    <span className="label">Check In</span>
                    <span className="sub">
                      {!name.trim()
                        ? 'enter your name to continue'
                        : isClinicQueue && selectedDoctor
                          ? `join ${selectedDoctor.name}`
                          : 'join this queue'}
                    </span>
                  </span>
                  <span className="arrow"><IconArrow /></span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <LoadingOverlay show={loading} message={loadingMessage} />
    </>
  );
}
