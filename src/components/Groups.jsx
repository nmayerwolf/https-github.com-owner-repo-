import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useAuth } from '../store/AuthContext';

const toGroupError = (err, fallback) => {
  if (err?.error === 'GROUP_NOT_FOUND') return 'El grupo no existe o ya no está disponible.';
  if (err?.error === 'ALREADY_MEMBER') return 'Ya formás parte de este grupo.';
  if (err?.error === 'ADMIN_ONLY') return 'Solo un admin puede hacer esa acción.';
  if (err?.error === 'CANNOT_REMOVE_ADMIN') return 'No podés eliminar a otro admin.';
  return err?.message || fallback;
};

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedId = selectedGroup?.id || null;

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getGroups();
      const next = out.groups || [];
      setGroups(next);

      if (selectedId && !next.some((g) => g.id === selectedId)) {
        setSelectedGroup(null);
      }
    } catch (err) {
      setError(toGroupError(err, 'No se pudieron cargar grupos.'));
    } finally {
      setLoading(false);
    }
  };

  const loadGroupDetail = async (groupId) => {
    setDetailLoading(true);
    setError('');
    try {
      const detail = await api.getGroup(groupId);
      setSelectedGroup(detail);
    } catch (err) {
      setError(toGroupError(err, 'No se pudo cargar el detalle del grupo.'));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');
    try {
      const created = await api.createGroup(name.trim());
      setName('');
      await loadGroups();
      if (created?.id) {
        await loadGroupDetail(created.id);
      }
    } catch (err) {
      setError(toGroupError(err, 'No se pudo crear el grupo.'));
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
      const joined = await api.joinGroup(code.trim().toUpperCase());
      setCode('');
      await loadGroups();
      if (joined?.id) {
        await loadGroupDetail(joined.id);
      }
    } catch (err) {
      setError(toGroupError(err, 'No se pudo unir al grupo.'));
    } finally {
      setLoading(false);
    }
  };

  const leaveGroup = async (id) => {
    setLoading(true);
    setError('');
    try {
      await api.leaveGroup(id);
      await loadGroups();
      if (selectedId === id) {
        setSelectedGroup(null);
      }
    } catch (err) {
      setError(toGroupError(err, 'No se pudo salir del grupo.'));
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (groupId, memberUserId) => {
    setDetailLoading(true);
    setError('');
    try {
      await api.removeMember(groupId, memberUserId);
      await loadGroupDetail(groupId);
      await loadGroups();
    } catch (err) {
      setError(toGroupError(err, 'No se pudo eliminar el miembro.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const canRemoveMembers = selectedGroup?.role === 'admin';

  const groupTotalPositions = useMemo(() => {
    if (!selectedGroup?.members?.length) return 0;
    return selectedGroup.members.reduce((acc, member) => acc + member.positions.length, 0);
  }, [selectedGroup]);

  return (
    <div className="grid">
      {error && <div className="card" style={{ borderColor: '#FF4757AA' }}>{error}</div>}

      <section className="card">
        <h2>Crear grupo</h2>
        <form onSubmit={createGroup} className="row" style={{ marginTop: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi grupo de inversión" />
          <button type="submit" disabled={loading || detailLoading}>
            Crear
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Unirme con código</h2>
        <form onSubmit={joinGroup} className="row" style={{ marginTop: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NXF-A7K2M" />
          <button type="submit" disabled={loading || detailLoading}>
            Unirme
          </button>
        </form>
      </section>

      <section className="card">
        <div className="row">
          <h2>Mis grupos</h2>
          <button type="button" onClick={loadGroups} disabled={loading || detailLoading}>
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
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" onClick={() => loadGroupDetail(g.id)} disabled={loading || detailLoading}>
                    Ver detalle
                  </button>
                  <button type="button" onClick={() => leaveGroup(g.id)} disabled={loading || detailLoading}>
                    Salir
                  </button>
                </div>
              </div>
            </article>
          ))}

          {!groups.length && <div className="muted">No estás en grupos todavía.</div>}
        </div>
      </section>

      {selectedGroup && (
        <section className="card">
          <div className="row">
            <div>
              <h2>{selectedGroup.name}</h2>
              <div className="muted">Código: {selectedGroup.code}</div>
            </div>
            <span className="badge" style={{ background: '#C084FC22', color: '#C084FC' }}>
              mi rol: {selectedGroup.role}
            </span>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Miembros: {selectedGroup.members.length}</span>
            <span className="muted">Posiciones activas del grupo: {groupTotalPositions}</span>
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            {selectedGroup.members.map((member) => {
              const isSelf = user?.id && member.userId === user.id;
              const canRemoveThisMember = canRemoveMembers && member.role !== 'admin' && !isSelf;

              return (
                <article key={member.userId} className="card" style={{ padding: 10 }}>
                  <div className="row">
                    <strong>{member.displayName}</strong>
                    <span className="badge" style={{ background: '#00E08E22', color: '#00E08E' }}>
                      {member.role}
                    </span>
                  </div>

                  <div className="grid" style={{ marginTop: 8 }}>
                    {member.positions.length ? (
                      member.positions.map((position, idx) => (
                        <div key={`${member.userId}-${position.symbol}-${idx}`} className="row" style={{ fontSize: 13 }}>
                          <span>{position.symbol}</span>
                          <span className="muted">{position.category}</span>
                          <span>Qty: {position.quantity}</span>
                        </div>
                      ))
                    ) : (
                      <div className="muted">Sin posiciones activas</div>
                    )}
                  </div>

                  {canRemoveThisMember && (
                    <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => removeMember(selectedGroup.id, member.userId)} disabled={loading || detailLoading}>
                        Eliminar miembro
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default Groups;
