import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { getThemePalette } from '../theme/palette';

const GroupsScreen = ({ theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const loadGroups = async (nextSelectedId = null) => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getGroups();
      const next = out?.groups || [];
      setGroups(next);
      const preferredId = nextSelectedId || selectedGroup?.id || next[0]?.id || null;
      const found = next.find((g) => g.id === preferredId) || null;
      setSelectedGroup(found);
      if (found) {
        const feedOut = await api.getGroupFeed(found.id, { page: 1, limit: 30 });
        setFeed(feedOut?.events || []);
      } else {
        setFeed([]);
      }
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar los grupos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const createGroup = async () => {
    if (!createName.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await api.createGroup({ name: createName.trim() });
      setCreateName('');
      setMessage(`Grupo creado: ${created.name} (${created.code})`);
      await loadGroups(created.id);
    } catch (e) {
      setError(e?.message || 'No se pudo crear el grupo.');
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async () => {
    const code = String(joinCode || '').trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const joined = await api.joinGroup({ code });
      setJoinCode('');
      setMessage(`Te uniste a ${joined.name}.`);
      await loadGroups(joined.id);
    } catch (e) {
      setError(e?.message || 'No se pudo unir al grupo.');
    } finally {
      setBusy(false);
    }
  };

  const leaveOrDeleteGroup = async () => {
    if (!selectedGroup?.id) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (selectedGroup.role === 'admin') {
        await api.deleteGroup(selectedGroup.id);
        setMessage('Grupo eliminado.');
      } else {
        await api.leaveGroup(selectedGroup.id);
        setMessage('Saliste del grupo.');
      }
      await loadGroups();
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar el grupo.');
    } finally {
      setBusy(false);
    }
  };

  const react = async (eventId, reaction) => {
    if (!selectedGroup?.id || !eventId) return;
    try {
      const current = feed.find((e) => e.id === eventId)?.reactions?.userReaction || null;
      const nextReaction = current === reaction ? null : reaction;
      const out = await api.reactGroupEvent(selectedGroup.id, eventId, nextReaction);
      setFeed((prev) =>
        prev.map((item) =>
          item.id === eventId
            ? { ...item, reactions: { ...(item.reactions || {}), ...(out?.reactions || {}), userReaction: nextReaction } }
            : item
        )
      );
    } catch (e) {
      setError(e?.message || 'No se pudo registrar reacción.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Groups</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Mis grupos: {groups.length}</Text>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
      {message ? <Text style={[styles.message, { color: palette.info }]}>{message}</Text> : null}

      <View style={styles.row}>
        <TextInput
          value={createName}
          onChangeText={setCreateName}
          placeholder="Nombre de grupo"
          placeholderTextColor={palette.muted}
          style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
        />
        <Pressable style={[styles.actionBtn, { backgroundColor: palette.primary }]} onPress={createGroup} disabled={busy}>
          <Text style={[styles.actionBtnLabel, { color: palette.primaryText }]}>{busy ? '...' : 'Crear'}</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <TextInput
          value={joinCode}
          onChangeText={setJoinCode}
          autoCapitalize="characters"
          placeholder="Código NXF-XXXXX"
          placeholderTextColor={palette.muted}
          style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
        />
        <Pressable style={[styles.actionBtn, { backgroundColor: palette.secondaryButton }]} onPress={joinGroup} disabled={busy}>
          <Text style={[styles.actionBtnLabel, { color: palette.text }]}>{busy ? '...' : 'Unirme'}</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={groups}
        keyExtractor={(item) => item.id}
        style={{ maxHeight: 62, marginBottom: 8 }}
        renderItem={({ item }) => {
          const active = item.id === selectedGroup?.id;
          return (
            <Pressable
              onPress={async () => {
                setSelectedGroup(item);
                try {
                  const out = await api.getGroupFeed(item.id, { page: 1, limit: 30 });
                  setFeed(out?.events || []);
                } catch {
                  setFeed([]);
                }
              }}
              style={[styles.groupPill, { borderColor: palette.border, backgroundColor: palette.surface }, active ? { borderColor: palette.primary } : null]}
            >
              <Text style={[styles.groupName, { color: active ? palette.primary : palette.text }]}>{item.name}</Text>
              <Text style={[styles.groupMeta, { color: palette.muted }]}>{item.members} miembros</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={[styles.muted, { color: palette.muted }]}>Sin grupos todavía.</Text> : null}
      />

      {selectedGroup ? (
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.section, { color: palette.text }]}>
            {selectedGroup.name} · {selectedGroup.code}
          </Text>
          <Text style={[styles.muted, { color: palette.muted }]}>
            Rol: {selectedGroup.role} · Miembros: {selectedGroup.members}
          </Text>
          <Pressable style={[styles.leaveBtn, { backgroundColor: palette.secondaryButton }]} onPress={leaveOrDeleteGroup} disabled={busy}>
            <Text style={{ color: palette.text, fontWeight: '700' }}>{busy ? 'Procesando...' : selectedGroup.role === 'admin' ? 'Eliminar grupo' : 'Salir del grupo'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.section, { color: palette.text }]}>Feed</Text>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.feedRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={{ color: palette.text, fontWeight: '700' }}>{item.displayName}</Text>
            <Text style={{ color: palette.muted, marginTop: 3 }}>{item.type}</Text>
            <Text style={{ color: palette.text, marginTop: 3 }}>{item.data?.symbol ? `Símbolo: ${item.data.symbol}` : 'Evento de grupo'}</Text>
            <View style={styles.reactRow}>
              <Pressable
                style={[styles.reactBtn, { borderColor: palette.border, backgroundColor: item.reactions?.userReaction === 'agree' ? palette.primary : palette.surfaceAlt }]}
                onPress={() => react(item.id, 'agree')}
              >
                <Text style={{ color: item.reactions?.userReaction === 'agree' ? palette.primaryText : palette.text }}>Agree {item.reactions?.agree || 0}</Text>
              </Pressable>
              <Pressable
                style={[styles.reactBtn, { borderColor: palette.border, backgroundColor: item.reactions?.userReaction === 'disagree' ? palette.primary : palette.surfaceAlt }]}
                onPress={() => react(item.id, 'disagree')}
              >
                <Text style={{ color: item.reactions?.userReaction === 'disagree' ? palette.primaryText : palette.text }}>Disagree {item.reactions?.disagree || 0}</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.muted, { color: palette.muted }]}>Sin eventos en feed.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  muted: { marginBottom: 8 },
  error: { marginBottom: 8 },
  message: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  actionBtn: { borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' },
  actionBtnLabel: { fontWeight: '700' },
  groupPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8
  },
  groupName: { fontWeight: '700' },
  groupMeta: { fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  leaveBtn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  feedRow: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  reactRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  reactBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  }
});

export default GroupsScreen;
