import { useState } from 'react';
import { ArrowDown, ArrowUp, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Player } from '@/types';
import { DeciderResult } from '@/lib/ranking';

export interface DeciderGroup {
  /** Place the tied players share */
  place: number;
  players: Player[];
}

interface DeciderDialogProps {
  open: boolean;
  groups: DeciderGroup[];
  onConfirm: (results: DeciderResult[]) => void;
  onCancel: () => void;
}

/**
 * Complete tie at place 1 or 2 of an evening: the players play a decider (Entscheidungsspiel, with more than two
 * Entscheidungsrunde; sudden death, DTKV Spielordnung § 8 Abs. 3 and § 9 Abs. 2). Its result is not counted in points
 * or goals; here the order is entered, best first.
 */
export function DeciderDialog({ open, groups, onConfirm, onCancel }: DeciderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        {/* The form only exists while the dialog is open, so it starts from the tied order every time */}
        <DeciderForm groups={groups} onConfirm={onConfirm} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}

function DeciderForm({ groups, onConfirm, onCancel }: Omit<DeciderDialogProps, 'open'>) {
  const [orders, setOrders] = useState<Player[][]>(() => groups.map(g => [...g.players]));

  const move = (group: number, index: number, delta: -1 | 1) => {
    setOrders(prev => prev.map((order, g) => {
      if (g !== group) return order;
      const next = [...order];
      const target = index + delta;
      if (target < 0 || target >= next.length) return order;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }));
  };

  const confirm = () =>
    onConfirm(orders.map(order => ({ players: order.map(p => p.id), order: order.map(p => p.id) })));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-accent" />
          Gleichstand – Entscheidungsspiel
        </DialogTitle>
        <DialogDescription>
          Diese Spieler sind nach allen Wertungskriterien gleichauf. Sie spielen ein Entscheidungsspiel
          (bei mehr als zwei Spielern eine Entscheidungsrunde) mit Sudden Death. Das Ergebnis zählt nicht
          in Punkte und Tore des Abends. Trage hier die Reihenfolge ein: Platz 1 oben.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        {groups.map((group, g) => (
          <div key={group.place} className="space-y-2">
            <p className="text-sm font-semibold">Gleichstand um Platz {group.place}</p>
            {orders[g].map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="font-display text-lg w-8 text-center text-primary">{group.place + i}</span>
                <span className="flex-1 font-medium">{p.name}</span>
                <Button type="button" size="icon" variant="ghost" aria-label={`${p.name} nach oben`} disabled={i === 0} onClick={() => move(g, i, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`${p.name} nach unten`} disabled={i === orders[g].length - 1} onClick={() => move(g, i, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
        <Button onClick={confirm}>Reihenfolge übernehmen</Button>
      </DialogFooter>
    </>
  );
}
