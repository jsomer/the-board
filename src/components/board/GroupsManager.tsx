import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, Loader2, Users, Flag, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
  type EventGroup,
} from "@/lib/api/groups";
import type { EventRecord } from "@/lib/api/types";

function readErr(e: unknown, fallback = "Request failed"): string {
  if (e instanceof ApiError) {
    const body = e.body as { error?: string; message?: string } | undefined;
    return body?.error || body?.message || e.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

interface Props {
  eventId: number;
  rawEvent: EventRecord | null;
}

export function GroupsManager({ eventId, rawEvent }: Props) {
  const qc = useQueryClient();
  const groupsQ = useQuery({
    queryKey: ["groups", eventId],
    queryFn: () => listGroups(eventId),
    enabled: eventId != null,
    staleTime: 30_000,
  });

  const eventPlayers = rawEvent?.players ?? [];
  const groups = groupsQ.data ?? [];

  const groupedPlayerIds = useMemo(() => {
    const set = new Set<number>();
    for (const g of groups) for (const m of g.members) set.add(Number(m.player_id));
    return set;
  }, [groups]);

  const ungrouped = useMemo(
    () => eventPlayers.filter((p) => !groupedPlayerIds.has(Number(p.player_id))),
    [eventPlayers, groupedPlayerIds],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["groups", eventId] });

  const [newName, setNewName] = useState("");
  const [newHole, setNewHole] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      const startHole = newHole.trim() === "" ? null : Number(newHole);
      if (startHole != null && (!Number.isInteger(startHole) || startHole < 1 || startHole > 18)) {
        throw new Error("Start hole must be 1–18");
      }
      return createGroup(eventId, { name: newName.trim(), startHole });
    },
    onSuccess: () => {
      setNewName("");
      setNewHole("");
      setCreateError(null);
      invalidate();
      toast.success("Group created");
    },
    onError: (e) => setCreateError(readErr(e, "Failed to create group")),
  });

  if (groupsQ.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading groups…
      </div>
    );
  }
  if (groupsQ.error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-destructive">
        {readErr(groupsQ.error, "Failed to load groups")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Create */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          New group
        </h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group A"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
          />
          <input
            value={newHole}
            onChange={(e) => setNewHole(e.target.value)}
            placeholder="Hole"
            type="number"
            min={1}
            max={18}
            className="w-20 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
          />
          <button
            onClick={() => createMut.mutate()}
            disabled={!newName.trim() || createMut.isPending}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
        {createError && (
          <p className="mt-2 text-xs font-semibold text-destructive">{createError}</p>
        )}
      </div>

      {/* Group list */}
      {groups.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted-foreground">
          No groups yet. Create one above.
        </p>
      )}
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          eventId={eventId}
          ungrouped={ungrouped.map((p) => ({ id: Number(p.player_id), name: p.name }))}
          onChanged={invalidate}
        />
      ))}

      {/* Unassigned */}
      <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-3.5">
        <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Users className="h-3 w-3" /> Unassigned · {ungrouped.length}
        </h2>
        {ungrouped.length === 0 ? (
          <p className="text-xs text-muted-foreground">All event players are in a group.</p>
        ) : (
          <ul className="space-y-1">
            {ungrouped.map((p) => (
              <li
                key={p.player_id}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
              >
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  eventId,
  ungrouped,
  onChanged,
}: {
  group: EventGroup;
  eventId: number;
  ungrouped: { id: number; name: string }[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editHole, setEditHole] = useState<string>(group.start_hole == null ? "" : String(group.start_hole));
  const [memberError, setMemberError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const startHole = editHole.trim() === "" ? null : Number(editHole);
      return updateGroup(eventId, group.id, { name: editName.trim(), startHole });
    },
    onSuccess: () => { setEditing(false); onChanged(); toast.success("Group updated"); },
    onError: (e) => toast.error(readErr(e, "Failed to update group")),
  });

  const delMut = useMutation({
    mutationFn: () => deleteGroup(eventId, group.id),
    onSuccess: () => { onChanged(); toast.success("Group deleted"); },
    onError: (e) => toast.error(readErr(e, "Failed to delete group")),
  });

  const addMut = useMutation({
    mutationFn: (playerId: number) => addGroupMember(eventId, group.id, playerId),
    onSuccess: () => { setMemberError(null); setPickerOpen(false); onChanged(); },
    onError: (e) => setMemberError(readErr(e, "Failed to add player")),
  });

  const removeMut = useMutation({
    mutationFn: (playerId: number) => removeGroupMember(eventId, group.id, playerId),
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(readErr(e, "Failed to remove player")),
  });

  const full = group.members.length >= 4;

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        {editing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm font-bold outline-none focus:border-primary"
            />
            <input
              value={editHole}
              onChange={(e) => setEditHole(e.target.value)}
              placeholder="Hole"
              type="number"
              min={1}
              max={18}
              className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm font-semibold outline-none focus:border-primary"
            />
            <button
              onClick={() => saveMut.mutate()}
              disabled={!editName.trim() || saveMut.isPending}
              className="rounded-lg bg-primary p-1.5 text-primary-foreground"
              aria-label="Save"
            >
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => { setEditing(false); setEditName(group.name); setEditHole(group.start_hole == null ? "" : String(group.start_hole)); }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <h3 className="flex-1 text-base font-extrabold">{group.name}</h3>
            {group.start_hole != null && (
              <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                <Flag className="h-3 w-3" /> Hole {group.start_hole}
              </span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${group.name}?`)) delMut.mutate();
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              {delMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>

      <ul className="space-y-1">
        {group.members.map((m) => (
          <li key={m.player_id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5">
            <span className="text-sm font-semibold">{m.name}</span>
            <button
              onClick={() => removeMut.mutate(Number(m.player_id))}
              className="rounded p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove player"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {group.members.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No players yet
          </li>
        )}
      </ul>

      <div className="mt-2">
        <button
          onClick={() => { setPickerOpen((v) => !v); setMemberError(null); }}
          disabled={full || ungrouped.length === 0}
          className={cn(
            "flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
            full || ungrouped.length === 0
              ? "text-muted-foreground/50"
              : "text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <Plus className="h-3 w-3" />
          {full ? "Full (4 players)" : ungrouped.length === 0 ? "No unassigned players" : "Add player"}
        </button>
        {pickerOpen && !full && (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
            {ungrouped.map((p) => (
              <button
                key={p.id}
                onClick={() => addMut.mutate(p.id)}
                disabled={addMut.isPending}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
              >
                <span>{p.name}</span>
                {addMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </button>
            ))}
          </div>
        )}
        {memberError && (
          <p className="mt-1.5 text-xs font-semibold text-destructive">{memberError}</p>
        )}
      </div>

      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.members.length}/4 players
      </div>
    </div>
  );
}
