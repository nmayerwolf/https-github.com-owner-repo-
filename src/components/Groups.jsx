import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';

const mapGroupError = (err, fallback) => {
  if (err?.error === 'GROUP_LIMIT_REACHED') return 'Llegaste al máximo de 5 grupos por usuario.';
  if (err?.error === 'GROUP_MEMBER_LIMIT_REACHED') return 'Este grupo ya alcanzó su máximo de 20 miembros.';
  if (err?.error === 'GROUP_NOT_FOUND') return 'El grupo o código no existe.';
  if (err?.error === 'ALREADY_MEMBER') return 'Ya sos miembro de este grupo.';
  if (err?.error === 'ADMIN_ONLY') return 'Solo admins pueden editar el nombre del grupo.';
  if (err?.error === 'VALIDATION_ERROR') return 'Nombre de grupo inválido.';
  return err?.message || fallback;
};

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      await load();
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo salir del grupo'));
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
    } catch (err) {
      setError(mapGroupError(err, 'No se pudo renombrar el grupo'));
    } finally {
      setLoading(false);
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
              {g.role === 'admin' && (
                <div className="row" style={{ marginTop: 8 }}>
                  {editingId === g.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nuevo nombre del grupo"
                      />
                      <button type="button" onClick={() => rename(g.id)} disabled={loading}>
                        Guardar
                      </button>
                      <button type="button" onClick={cancelRename} disabled={loading}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startRename(g)} disabled={loading}>
                      Renombrar
                    </button>
                  )}
                </div>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Miembros: {g.members}</span>
                <button type="button" onClick={() => leave(g.id)} disabled={loading}>
                  Salir
                </button>
              </div>
            </article>
          ))}
          {!groups.length && <div className="muted">No estás en grupos todavía.</div>}
        </div>
      </section>
    </div>
  );
};

export default Groups;
