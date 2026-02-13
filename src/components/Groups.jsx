import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';

const mapGroupError = (err, fallback) => {
  if (err?.error === 'GROUP_LIMIT_REACHED') return 'Llegaste al máximo de 5 grupos por usuario.';
  if (err?.error === 'GROUP_MEMBER_LIMIT_REACHED') return 'Este grupo ya alcanzó su máximo de 20 miembros.';
  if (err?.error === 'GROUP_NOT_FOUND') return 'El grupo o código no existe.';
  if (err?.error === 'GROUP_MEMBER_NOT_FOUND') return 'El miembro seleccionado no existe.';
  if (err?.error === 'GROUP_EVENT_NOT_FOUND') return 'El evento no existe.';
  if (err?.error === 'ALREADY_MEMBER') return 'Ya sos miembro de este grupo.';
  if (err?.error === 'ADMIN_ONLY') return 'Solo admins pueden editar este grupo.';
  if (err?.error === 'CANNOT_REMOVE_ADMIN') return 'No podés expulsar a otro admin.';
  if (err?.error === 'USE_LEAVE_FOR_SELF') return 'Para salir vos, usá el botón Salir.';
  if (err?.error === 'VALIDATION_ERROR') {
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    return 'Datos inválidos.';
  }
  return err?.message || fallback;
};

const formatPercent = (value) => {
  if (typeof value !== 'number') return 'N/D';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR');
};

const eventLabel = (event) => {
  if (event.type === 'position_opened') return `${event.displayName} abrió posición ${event.data?.symbol || ''}`;
  if (event.type === 'position_sold') return `${event.displayName} vendió ${event.data?.symbol || ''}`;
  if (event.type === 'signal_shared') return `${event.displayName} compartió señal ${event.data?.symbol || ''}`;
  if (event.type === 'member_joined') return `${event.displayName} se unió al grupo`;
  if (event.type === 'member_left') return `${event.displayName} salió del grupo`;
  return `${event.displayName} generó actividad`;
};

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupDetail, setGroupDetail] = useState(null);
  const [groupTab, setGroupTab] = useState('members');
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [feedPage, setFeedPage] = useState(1);
  const [feedLimit] = useState(20);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedData, setFeedData] = useState({ events: [], pagination: { page: 1, limit: 20, total: 0 } });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getGroups();
      setGroups(out.groups || []);
    } catch (err) {
      setError(mapGroupError(err, 'No se pudieron cargar grupos'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');
    try {
      await api.createGroup(name.trim());
      setName('');
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo crear el grupo'));
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');
    try {
      await api.joinGroup(code.trim().toUpperCase());
      setCode('');
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo unir al grupo'));
    } finally {
      setLoading(false);
    }
  };

  const leave = async (id) => {
    setLoading(true);
    setError('');
    try {
      await api.leaveGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
        setGroupDetail(null);
        setFeedData({ events: [], pagination: { page: 1, limit: feedLimit, total: 0 } });
      }
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo salir del grupo'));
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async (id) => {
    setLoading(true);
    setError('');
    try {
      await api.deleteGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
        setGroupDetail(null);
        setFeedData({ events: [], pagination: { page: 1, limit: feedLimit, total: 0 } });
      }
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo eliminar el grupo'));
    } finally {
      setLoading(false);
    }
  };

  const startRename = (group) => {
    setEditingId(group.id);
    setEditName(group.name);
    setError('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const rename = async (id) => {
    if (!editName.trim()) {
      setError('Nombre de grupo inválido.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.renameGroup(id, editName.trim());
      setEditingId(null);
      setEditName('');
      await load();
      if (selectedGroupId === id) {
        await loadDetail(id);
      }
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo renombrar el grupo'));
    } finally {
      setLoading(false);
    }
  };

  const loadFeed = async (groupId, page = 1) => {
    if (typeof api.getGroupFeed !== 'function') return;

    setFeedLoading(true);
    setError('');
    try {
      const out = await api.getGroupFeed(groupId, page, feedLimit);
      setFeedData(out || { events: [], pagination: { page, limit: feedLimit, total: 0 } });
      setFeedPage(page);
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo cargar el feed del grupo'));
    } finally {
      setFeedLoading(false);
    }
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    setError('');
    try {
      const detail = await api.getGroup(id);
      setSelectedGroupId(id);
      setGroupDetail(detail);
      setGroupTab('members');
      await loadFeed(id, 1);
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo cargar el detalle del grupo'));
    } finally {
      setDetailLoading(false);
    }
  };

  const removeMember = async (memberUserId) => {
    if (!selectedGroupId) return;

    setDetailLoading(true);
    setError('');
    try {
      await api.removeMember(selectedGroupId, memberUserId);
      await loadDetail(selectedGroupId);
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo expulsar al miembro'));
    } finally {
      setDetailLoading(false);
    }
  };

  const reactToEvent = async (eventId, reaction) => {
    if (!selectedGroupId || typeof api.reactToGroupEvent !== 'function') return;

    setFeedLoading(true);
    setError('');
    try {
      await api.reactToGroupEvent(selectedGroupId, eventId, reaction);
      await loadFeed(selectedGroupId, feedPage);
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo registrar reacción'));
      setFeedLoading(false);
    }
  };

  return (
    <div className="grid">
      {error && <div className="card" style={{ borderColor: '#FF4757AA' }}>{error}</div>}

      <section className="card">
        <h2>Crear grupo</h2>
        <form onSubmit={createGroup} className="row" style={{ marginTop: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi grupo de inversión" />
          <button type="submit" disabled={loading}>
            Crear
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Unirme con código</h2>
        <form onSubmit={joinGroup} className="row" style={{ marginTop: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NXF-A7K2M" />
          <button type="submit" disabled={loading}>
            Unirme
          </button>
        </form>
      </section>

      <section className="card">
        <div className="row">
          <h2>Mis grupos</h2>
          <button type="button" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {groups.map((g) => (
            <article key={g.id} className="card" style={{ padding: 10 }}>
              <div className="row">
                <div>
                  <strong>{g.name}</strong>
                  <div className="muted">Código: {g.code}</div>
                </div>
                <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
                  {g.role}
                </span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Miembros: {g.members}</span>
                <button type="button" onClick={() => loadDetail(g.id)} disabled={detailLoading}>
                  Ver detalle
                </button>
              </div>
              {g.role === 'admin' && (
                <div className="row" style={{ marginTop: 8 }}>
                  {editingId === g.id ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nuevo nombre del grupo" />
                      <button type="button" onClick={() => rename(g.id)} disabled={loading}>
                        Guardar
                      </button>
                      <button type="button" onClick={cancelRename} disabled={loading}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startRename(g)} disabled={loading}>
                        Renombrar
                      </button>
                      <button type="button" onClick={() => deleteGroup(g.id)} disabled={loading}>
                        Eliminar grupo
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => leave(g.id)} disabled={loading}>
                  Salir
                </button>
              </div>
            </article>
          ))}
          {!groups.length && <div className="muted">No estás en grupos todavía.</div>}
        </div>
      </section>

      {selectedGroupId && (
        <section className="card">
          <h2>Detalle de grupo</h2>
          <section className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
            <button type="button" onClick={() => setGroupTab('members')} style={{ borderColor: groupTab === 'members' ? '#00E08E' : undefined }}>
              Miembros
            </button>
            <button type="button" onClick={() => setGroupTab('feed')} style={{ borderColor: groupTab === 'feed' ? '#00E08E' : undefined }}>
              Feed
            </button>
          </section>

          {(detailLoading || feedLoading) && <div className="muted">Cargando detalle...</div>}

          {!detailLoading && groupDetail && groupTab === 'members' && (
            <div className="grid" style={{ marginTop: 8 }}>
              <div>
                <strong>{groupDetail.name}</strong>
                <div className="muted">Código: {groupDetail.code}</div>
                <div className="muted">Miembros: {groupDetail.memberCount ?? groupDetail.members?.length ?? 0}</div>
              </div>
              {(groupDetail.members || []).map((member) => (
                <article key={member.userId} className="card" style={{ padding: 10 }}>
                  <div className="row">
                    <strong>{member.displayName}</strong>
                    <span className="badge" style={{ background: '#C084FC22', color: '#C084FC' }}>
                      {member.role}
                    </span>
                  </div>
                  <div className="grid" style={{ marginTop: 8 }}>
                    {(member.positions || []).map((position) => (
                      <div key={`${member.userId}-${position.symbol}`} className="row">
                        <span>{position.symbol}</span>
                        <span className="muted">Qty: {position.quantity}</span>
                        <span className="muted">P&L: {formatPercent(position.plPercent)}</span>
                      </div>
                    ))}
                    {!member.positions?.length && <div className="muted">Sin posiciones activas.</div>}
                  </div>
                  {groupDetail.role === 'admin' && member.role === 'member' && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <button type="button" onClick={() => removeMember(member.userId)} disabled={detailLoading || loading}>
                        Expulsar
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!groupDetail.members?.length && <div className="muted">Este grupo no tiene miembros.</div>}
            </div>
          )}

          {!feedLoading && groupDetail && groupTab === 'feed' && (
            <div className="grid" style={{ marginTop: 8 }}>
              <div className="row">
                <span className="muted">Eventos del grupo</span>
                <button type="button" onClick={() => loadFeed(selectedGroupId, feedPage)} disabled={feedLoading}>
                  Refresh feed
                </button>
              </div>

              {(feedData.events || []).map((event) => (
                <article key={event.id} className="card" style={{ padding: 10 }}>
                  <div className="row">
                    <strong>{eventLabel(event)}</strong>
                    <span className="muted">{formatDateTime(event.createdAt)}</span>
                  </div>
                  {event.data?.recommendation && <div className="muted">{event.data.recommendation}</div>}

                  <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => reactToEvent(event.id, event.reactions?.userReaction === 'agree' ? null : 'agree')}
                      style={{ borderColor: event.reactions?.userReaction === 'agree' ? '#00E08E' : undefined }}
                      disabled={feedLoading}
                    >
                      👍 {event.reactions?.agree || 0}
                    </button>
                    <button
                      type="button"
                      onClick={() => reactToEvent(event.id, event.reactions?.userReaction === 'disagree' ? null : 'disagree')}
                      style={{ borderColor: event.reactions?.userReaction === 'disagree' ? '#FF4757' : undefined }}
                      disabled={feedLoading}
                    >
                      👎 {event.reactions?.disagree || 0}
                    </button>
                  </div>
                </article>
              ))}

              {!feedData.events?.length && <div className="muted">No hay actividad reciente.</div>}

              <div className="row">
                <span className="muted">
                  Página {feedData.pagination?.page || 1} · Total eventos {feedData.pagination?.total || 0}
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => loadFeed(selectedGroupId, Math.max(1, (feedData.pagination?.page || 1) - 1))}
                    disabled={(feedData.pagination?.page || 1) <= 1 || feedLoading}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => loadFeed(selectedGroupId, (feedData.pagination?.page || 1) + 1)}
                    disabled={
                      feedLoading ||
                      ((feedData.pagination?.page || 1) * (feedData.pagination?.limit || feedLimit) >= (feedData.pagination?.total || 0))
                    }
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Groups;
